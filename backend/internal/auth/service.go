package auth

import (
"context"
"crypto/rand"
"crypto/subtle"
"database/sql"
"encoding/json"
"errors"
"fmt"
"math/big"
"net/smtp"
"strings"
"time"

"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
redisclient "github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/redis"
"github.com/golang-jwt/jwt/v5"
"golang.org/x/crypto/bcrypt"
)

type Service struct {
repo   *Repository
redis  *redisclient.Client
cfg    *config.Config
}

func NewService(repo *Repository, redis *redisclient.Client, cfg *config.Config) *Service {
return &Service{repo: repo, redis: redis, cfg: cfg}
}

type TokenPair struct {
Token string `json:"token"`
User  *User  `json:"user"`
}

func (s *Service) Login(ctx context.Context, email, password, clientIP string) (*TokenPair, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	const maxAttempts = 5
	const windowSecs = 15 * 60

	// Per-account rate limit (prevents brute force against a known email).
	accountKey := "login:attempts:" + email
	actCount, _ := s.redis.GetInt64(ctx, accountKey)
	if actCount >= maxAttempts {
		return nil, fmt.Errorf("too many login attempts, please try again later")
	}

	// Per-IP rate limit (prevents distributed lockout attacks).
	if clientIP != "" {
		ipKey := "login:ip:" + clientIP
		ipCount, _ := s.redis.GetInt64(ctx, ipKey)
		if ipCount >= maxAttempts*3 {
			return nil, fmt.Errorf("too many login attempts from your network, please try again later")
		}
	}

	hash, err := s.repo.GetPasswordHash(email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Increment failure counters so unknown-email probing is also rate-limited.
			_, _ = s.redis.IncrWithTTL(ctx, accountKey, windowSecs)
			if clientIP != "" {
				_, _ = s.redis.IncrWithTTL(ctx, "login:ip:"+clientIP, windowSecs)
			}
			return nil, fmt.Errorf("invalid credentials")
		}
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		// Only increment on wrong password, not on every request.
		_, _ = s.redis.IncrWithTTL(ctx, accountKey, windowSecs)
		if clientIP != "" {
			_, _ = s.redis.IncrWithTTL(ctx, "login:ip:"+clientIP, windowSecs)
		}
		return nil, fmt.Errorf("invalid credentials")
	}

	// Successful auth: reset both rate-limit counters.
	_ = s.redis.Del(ctx, accountKey)
	if clientIP != "" {
		_ = s.redis.Del(ctx, "login:ip:"+clientIP)
	}

	user, err := s.repo.FindUserByEmail(email)
	if err != nil {
		return nil, err
	}

	// Physicians require a second factor before a JWT is issued.
	if user.Role == "professional" {
		const max2FASends = 3
		const rate2FAWindowSecs = 60 * 60
		rateKey := "2fa:rate:" + email
		sends, _ := s.redis.GetInt64(ctx, rateKey)
		if sends >= max2FASends {
			return nil, ErrPhysician2FARateLimited
		}
		otp, err := generateOTP(6)
		if err != nil {
			return nil, err
		}
		// Invalidate any prior 2FA session for this email.
		_ = s.redis.Del(ctx, "2fa:"+email)
		_ = s.redis.Del(ctx, "2fa:attempts:"+email)
		if err := s.redis.SetEx(ctx, "2fa:"+email, otp, otpTTL); err != nil {
			return nil, fmt.Errorf("failed to initiate 2FA")
		}
		_, _ = s.redis.IncrWithTTL(ctx, rateKey, rate2FAWindowSecs)
		_ = s.send2FAEmail(email, user.Name, otp)
		return nil, ErrRequires2FA
	}

	token, err := s.generateJWT(user)
	if err != nil {
		return nil, err
	}
	return &TokenPair{Token: token, User: user}, nil
}

func (s *Service) Register(u *User, password string) (*TokenPair, error) {
hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
if err != nil {
return nil, err
}
if err := s.repo.CreateUser(u, string(hash)); err != nil {
return nil, err
}
token, err := s.generateJWT(u)
if err != nil {
return nil, err
}
return &TokenPair{Token: token, User: u}, nil
}

type RegisterStartPayload struct {
Name                 string `json:"name"`
Email                string `json:"email"`
Password             string `json:"password"`
Role                 string `json:"role"`
Phone                string `json:"phone"`
DOB                  string `json:"dob"`
Gender               string `json:"gender"`
Language             string `json:"language"`
HealthHistory        string `json:"health_history"`
Specialization       string `json:"specialization"`
CertificateName      string `json:"certificateName"`
CertificateID        string `json:"certificateId"`
CertificateIssueDate string `json:"certificateIssueDate"`
YearsOfExperience    string `json:"yearsOfExperience"`
CertificateURL       string `json:"certificateUrl"`
}

const otpTTL = 600

// ErrEmailAlreadyRegistered is returned when registration is attempted with an already-existing email.
var ErrEmailAlreadyRegistered = errors.New("email is already registered")

// ErrOTPRateLimited is returned when too many OTP requests are sent for a single email.
var ErrOTPRateLimited = errors.New("too many OTP requests, please try again later")

// ErrOTPTooManyAttempts is returned when the OTP has been guessed too many times.
var ErrOTPTooManyAttempts = errors.New("too many verification attempts, please request a new code")

// ErrResetRateLimited is returned when too many password reset requests are made.
var ErrResetRateLimited = errors.New("too many reset requests, please try again later")

// ErrResetTooManyAttempts is returned when the reset code has been guessed too many times.
var ErrResetTooManyAttempts = errors.New("too many attempts, please request a new reset code")

// ErrRequires2FA signals that a physician must complete a second factor before receiving a JWT.
var ErrRequires2FA = errors.New("2FA required")

// ErrPhysician2FARateLimited is returned when too many 2FA codes have been issued.
var ErrPhysician2FARateLimited = errors.New("too many login attempts, please try again later")

func (s *Service) StartRegistration(ctx context.Context, payload RegisterStartPayload) (string, int, error) {
// Normalize email
payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))

// Reject if email already has a confirmed account
if _, err := s.repo.FindUserByEmail(payload.Email); err == nil {
return "", 0, ErrEmailAlreadyRegistered
}

// OTP send rate limiting: max 3 per hour per email (check before increment).
	const maxOTPSends = 3
	const otpRateWindowSecs = 60 * 60
	otpRateKey := "otp:rate:" + payload.Email
	sends, _ := s.redis.GetInt64(ctx, otpRateKey)
	if sends >= maxOTPSends {
		return "", 0, ErrOTPRateLimited
	}
	_, _ = s.redis.IncrWithTTL(ctx, otpRateKey, otpRateWindowSecs)

// Hash password before persisting so plaintext never reaches the database
hash, err := bcrypt.GenerateFromPassword([]byte(payload.Password), bcrypt.DefaultCost)
if err != nil {
return "", 0, fmt.Errorf("failed to process credentials: %w", err)
}
payload.Password = string(hash)

otp, err := generateOTP(6)
if err != nil {
return "", 0, err
}

// Store OTP in Redis
redisKey := "otp:" + payload.Email
if err := s.redis.SetEx(ctx, redisKey, otp, otpTTL); err != nil {
return "", 0, fmt.Errorf("failed to store OTP: %w", err)
}

// Also persist in DB
raw, _ := json.Marshal(payload)
expiresAt := time.Now().Add(otpTTL * time.Second)
_ = s.repo.UpsertPendingRegistration(payload.Email, otp, expiresAt, raw)

// Send email
_ = s.sendOTPEmail(payload.Email, payload.Name, otp)

return payload.Email, otpTTL, nil
}

func (s *Service) VerifyOTP(ctx context.Context, email, otp string) (*TokenPair, error) {
	const maxOTPAttempts = 5
	attemptKey := "otp:attempts:" + email

	// Brute-force protection: lock out after too many wrong guesses.
	attempts, _ := s.redis.GetInt64(ctx, attemptKey)
	if attempts >= maxOTPAttempts {
		return nil, ErrOTPTooManyAttempts
	}

	redisKey := "otp:" + email
	storedOTP, err := s.redis.Get(ctx, redisKey)
	if err != nil {
		// Fallback to DB when Redis is unavailable.
		pr, dbErr := s.repo.GetPendingRegistration(email)
		if dbErr != nil {
			return nil, fmt.Errorf("OTP not found or expired")
		}
		if time.Now().After(pr.OTPExpiresAt) {
			return nil, fmt.Errorf("OTP expired")
		}
		if subtle.ConstantTimeCompare([]byte(pr.OTP), []byte(otp)) != 1 {
			_, _ = s.redis.IncrWithTTL(ctx, attemptKey, otpTTL)
			return nil, fmt.Errorf("invalid OTP")
		}
		tp, tpErr := s.completeRegistrationFromDB(pr)
		if tpErr != nil {
			return nil, tpErr
		}
		_ = s.redis.Del(ctx, attemptKey)
		_ = s.repo.DeletePendingRegistration(email)
		return tp, nil
	}

	if subtle.ConstantTimeCompare([]byte(storedOTP), []byte(otp)) != 1 {
		_, _ = s.redis.IncrWithTTL(ctx, attemptKey, otpTTL)
		return nil, fmt.Errorf("invalid OTP")
	}

	pr, err := s.repo.GetPendingRegistration(email)
	if err != nil {
		return nil, fmt.Errorf("registration data not found")
	}

	tp, err := s.completeRegistrationFromDB(pr)
	if err != nil {
		return nil, err
	}

	_ = s.redis.Del(ctx, redisKey)
	_ = s.redis.Del(ctx, attemptKey)
	_ = s.repo.DeletePendingRegistration(email)
	return tp, nil
}

func (s *Service) completeRegistrationFromDB(pr *PendingRegistration) (*TokenPair, error) {
var payload RegisterStartPayload
if err := json.Unmarshal(pr.Payload, &payload); err != nil {
return nil, fmt.Errorf("invalid registration payload")
}

// Password was bcrypt-hashed in StartRegistration before being persisted.
passwordHash := payload.Password

u := &User{
UserID:               generateID("USR"),
PatientID:            generateID("PAT"),
Name:                 payload.Name,
Email:                payload.Email,
Role:                 payload.Role,
Phone:                payload.Phone,
DOB:                  payload.DOB,
Gender:               payload.Gender,
Language:             payload.Language,
HealthHistory:        payload.HealthHistory,
Specialization:       payload.Specialization,
CertificateName:      payload.CertificateName,
CertificateID:        payload.CertificateID,
CertificateIssueDate: payload.CertificateIssueDate,
YearsOfExperience:    payload.YearsOfExperience,
}

if payload.CertificateURL != "" {
if err := s.repo.CreateUserWithCertURL(u, passwordHash, payload.CertificateURL); err != nil {
return nil, err
}
} else {
if err := s.repo.CreateUser(u, passwordHash); err != nil {
return nil, err
}
}

token, err := s.generateJWT(u)
if err != nil {
return nil, err
}
return &TokenPair{Token: token, User: u}, nil
}

func (s *Service) ResendOTP(ctx context.Context, email string) (string, int, error) {
	// Enforce the same OTP send rate limit as StartRegistration.
	const maxOTPSends = 3
	const otpRateWindowSecs = 60 * 60
	otpRateKey := "otp:rate:" + email
	sends, _ := s.redis.GetInt64(ctx, otpRateKey)
	if sends >= maxOTPSends {
		return "", 0, ErrOTPRateLimited
	}

	pr, err := s.repo.GetPendingRegistration(email)
	if err != nil {
		return "", 0, fmt.Errorf("no pending registration found for this email")
	}

	otp, err := generateOTP(6)
	if err != nil {
		return "", 0, err
	}
	_, _ = s.redis.IncrWithTTL(ctx, otpRateKey, otpRateWindowSecs)

	redisKey := "otp:" + email
	_ = s.redis.SetEx(ctx, redisKey, otp, otpTTL)

	// Reset attempt counter so the user gets a fresh set of guesses.
	_ = s.redis.Del(ctx, "otp:attempts:"+email)

	expiresAt := time.Now().Add(otpTTL * time.Second)
	_ = s.repo.UpsertPendingRegistration(email, otp, expiresAt, pr.Payload)

	// Use the stored name for a personalized email.
	var p RegisterStartPayload
	_ = json.Unmarshal(pr.Payload, &p)
	_ = s.sendOTPEmail(email, p.Name, otp)

	return email, otpTTL, nil
}

func (s *Service) VerifyPhysician2FA(ctx context.Context, email, otp string) (*TokenPair, error) {
	const maxAttempts = 5
	attemptKey := "2fa:attempts:" + email

	attempts, _ := s.redis.GetInt64(ctx, attemptKey)
	if attempts >= maxAttempts {
		return nil, ErrOTPTooManyAttempts
	}

	storedOTP, err := s.redis.Get(ctx, "2fa:"+email)
	if err != nil {
		return nil, fmt.Errorf("2FA code not found or expired")
	}

	if subtle.ConstantTimeCompare([]byte(storedOTP), []byte(otp)) != 1 {
		_, _ = s.redis.IncrWithTTL(ctx, attemptKey, otpTTL)
		return nil, fmt.Errorf("invalid 2FA code")
	}

	_ = s.redis.Del(ctx, "2fa:"+email)
	_ = s.redis.Del(ctx, attemptKey)

	user, err := s.repo.FindUserByEmail(email)
	if err != nil {
		return nil, err
	}
	if user.Role != "professional" {
		return nil, fmt.Errorf("invalid 2FA request")
	}
	token, err := s.generateJWT(user)
	if err != nil {
		return nil, err
	}
	return &TokenPair{Token: token, User: user}, nil
}

func (s *Service) ResendPhysician2FA(ctx context.Context, email string) error {
	// Only resend if there is an active 2FA session (i.e. login + password already verified).
	if _, err := s.redis.Get(ctx, "2fa:"+email); err != nil {
		// Also check if it simply expired vs never existed — either way refuse.
		return fmt.Errorf("no active 2FA session for this email")
	}

	const max2FASends = 3
	const rate2FAWindowSecs = 60 * 60
	rateKey := "2fa:rate:" + email
	sends, _ := s.redis.GetInt64(ctx, rateKey)
	if sends >= max2FASends {
		return ErrPhysician2FARateLimited
	}

	otp, err := generateOTP(6)
	if err != nil {
		return err
	}
	_ = s.redis.Del(ctx, "2fa:attempts:"+email)
	if err := s.redis.SetEx(ctx, "2fa:"+email, otp, otpTTL); err != nil {
		return fmt.Errorf("failed to resend 2FA code")
	}
	_, _ = s.redis.IncrWithTTL(ctx, rateKey, rate2FAWindowSecs)

	user, err := s.repo.FindUserByEmail(email)
	if err != nil {
		return err
	}
	_ = s.send2FAEmail(email, user.Name, otp)
	return nil
}

func (s *Service) send2FAEmail(to, name, code string) error {
	subject := "LifeGate — Physician Login Verification"
	body := fmt.Sprintf(
		"Hi %s,\r\n\r\nYour physician login verification code is: %s\r\n\r\n"+
			"This code expires in 10 minutes. Do not share it with anyone.\r\n\r\n"+
			"If you did not attempt to log in, please change your password immediately.",
		name, code)
	return s.sendEmail(to, subject, body)
}

func (s *Service) SendPasswordResetCode(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	if _, err := s.repo.FindUserByEmail(email); err != nil {
		// Don't reveal whether email exists; still consume rate limit slot to prevent
		// timing-based enumeration.
		const maxResetSends = 3
		const resetRateWindowSecs = 60 * 60
		resetRateKey := "reset:rate:" + email
		sends, _ := s.redis.GetInt64(ctx, resetRateKey)
		if sends >= maxResetSends {
			return ErrResetRateLimited
		}
		_, _ = s.redis.IncrWithTTL(ctx, resetRateKey, resetRateWindowSecs)
		return nil
	}

	// Rate limit: max 3 reset codes per hour per email.
	const maxResetSends = 3
	const resetRateWindowSecs = 60 * 60
	resetRateKey := "reset:rate:" + email
	sends, _ := s.redis.GetInt64(ctx, resetRateKey)
	if sends >= maxResetSends {
		return ErrResetRateLimited
	}

	// Invalidate all previous reset records so old codes cannot be replayed.
	_ = s.repo.DeletePasswordResetsByEmail(email)

	code, err := generateOTP(6)
	if err != nil {
		return err
	}
	resetToken, err := generateToken(32)
	if err != nil {
		return err
	}

	_, _ = s.redis.IncrWithTTL(ctx, resetRateKey, resetRateWindowSecs)

	expiresAt := time.Now().Add(15 * time.Minute)
	if err := s.repo.CreatePasswordReset(email, code, resetToken, expiresAt); err != nil {
		return err
	}
	// Also reset attempt counter so any previous lockout is cleared for the new code.
	_ = s.redis.Del(ctx, "reset:attempts:"+email)
	_ = s.sendPasswordResetEmail(email, code)
	return nil
}

func (s *Service) VerifyResetCode(ctx context.Context, email, code string) (string, error) {
	const maxAttempts = 5
	const resetWindowSecs = 15 * 60
	attemptKey := "reset:attempts:" + email

	attempts, _ := s.redis.GetInt64(ctx, attemptKey)
	if attempts >= maxAttempts {
		return "", ErrResetTooManyAttempts
	}

	// Fetch by email only so code comparison can use constant-time equality.
	pr, err := s.repo.GetLatestValidPasswordReset(email)
	if err != nil {
		return "", fmt.Errorf("invalid or expired reset code")
	}

	if subtle.ConstantTimeCompare([]byte(pr.Code), []byte(code)) != 1 {
		_, _ = s.redis.IncrWithTTL(ctx, attemptKey, resetWindowSecs)
		return "", fmt.Errorf("invalid or expired reset code")
	}

	_ = s.redis.Del(ctx, attemptKey)
	return pr.ResetToken, nil
}

func (s *Service) ResetPassword(token, newPassword string) error {
	if len(newPassword) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}

	pr, err := s.repo.GetPasswordResetByToken(token)
	if err != nil {
		return fmt.Errorf("invalid or expired reset token")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.repo.UpdatePassword(pr.Email, string(hash)); err != nil {
		return err
	}
	// Purge all reset records for this email — prevents replay of any other
	// non-expired codes that were issued in the same session.
	_ = s.repo.DeletePasswordResetsByEmail(pr.Email)
	return nil
}

func (s *Service) ChangePassword(userID, currentPassword, newPassword string) error {
hash, err := s.repo.GetPasswordHashByID(userID)
if err != nil {
return fmt.Errorf("user not found")
}
if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(currentPassword)); err != nil {
return fmt.Errorf("current password is incorrect")
}
newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
if err != nil {
return err
}
return s.repo.UpdatePasswordByID(userID, string(newHash))
}

func (s *Service) generateJWT(u *User) (string, error) {
	expiry, err := time.ParseDuration(s.cfg.JWTExpiry)
	if err != nil {
		expiry = 24 * time.Hour
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"jti":     randomHex(16), // unique token ID — enables future revocation
		"iss":     "lifegate",
		"user_id": u.ID,
		"email":   u.Email,
		"role":    u.Role,
		"iat":     now.Unix(),
		"nbf":     now.Unix(),
		"exp":     now.Add(expiry).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *Service) sendOTPEmail(to, name, otp string) error {
subject := "LifeGate — Verify your email"
body := fmt.Sprintf("Hi %s,\r\n\r\nYour OTP code is: %s\r\n\r\nThis code expires in 10 minutes.\r\n\r\nDo not share this code with anyone.", name, otp)
return s.sendEmail(to, subject, body)
}

func (s *Service) sendPasswordResetEmail(to, code string) error {
subject := "LifeGate — Password Reset Code"
body := fmt.Sprintf("Your password reset code is: %s\r\n\r\nThis code expires in 15 minutes.", code)
return s.sendEmail(to, subject, body)
}

func (s *Service) sendEmail(to, subject, body string) error {
addr := s.cfg.SMTPHost + ":" + s.cfg.SMTPPort
auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPassword, s.cfg.SMTPHost)
msg := []byte("From: " + s.cfg.SMTPFrom + "\r\n" +
"To: " + to + "\r\n" +
"Subject: " + subject + "\r\n" +
"\r\n" + body + "\r\n")
return smtp.SendMail(addr, auth, s.cfg.SMTPFrom, []string{to}, msg)
}

func generateOTP(n int) (string, error) {
digits := "0123456789"
otp := make([]byte, n)
for i := range otp {
idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
if err != nil {
return "", err
}
otp[i] = digits[idx.Int64()]
}
return string(otp), nil
}

func generateToken(n int) (string, error) {
const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
b := make([]byte, n)
for i := range b {
idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
if err != nil {
return "", err
}
b[i] = charset[idx.Int64()]
}
return string(b), nil
}

func generateID(prefix string) string {
token, err := generateToken(8)
if err != nil {
// Fallback to a timestamp-based ID if crypto/rand is unavailable
return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}
return prefix + "-" + token
}
