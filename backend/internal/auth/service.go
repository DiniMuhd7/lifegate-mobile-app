package auth

import (
"context"
"crypto/rand"
"database/sql"
"encoding/json"
"errors"
"fmt"
"math/big"
"net/smtp"
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

func (s *Service) Login(email, password string) (*TokenPair, error) {
hash, err := s.repo.GetPasswordHash(email)
if err != nil {
if errors.Is(err, sql.ErrNoRows) {
return nil, fmt.Errorf("invalid credentials")
}
return nil, err
}
if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
return nil, fmt.Errorf("invalid credentials")
}
user, err := s.repo.FindUserByEmail(email)
if err != nil {
return nil, err
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

func (s *Service) StartRegistration(ctx context.Context, payload RegisterStartPayload) (string, int, error) {
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
redisKey := "otp:" + email
storedOTP, err := s.redis.Get(ctx, redisKey)
if err != nil {
// Fallback to DB
pr, dbErr := s.repo.GetPendingRegistration(email)
if dbErr != nil {
return nil, fmt.Errorf("OTP not found or expired")
}
if pr.OTP != otp {
return nil, fmt.Errorf("invalid OTP")
}
if time.Now().After(pr.OTPExpiresAt) {
return nil, fmt.Errorf("OTP expired")
}
return s.completeRegistrationFromDB(pr)
}

if storedOTP != otp {
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
_ = s.repo.DeletePendingRegistration(email)
return tp, nil
}

func (s *Service) completeRegistrationFromDB(pr *PendingRegistration) (*TokenPair, error) {
var payload RegisterStartPayload
if err := json.Unmarshal(pr.Payload, &payload); err != nil {
return nil, fmt.Errorf("invalid registration payload")
}

hash, err := bcrypt.GenerateFromPassword([]byte(payload.Password), bcrypt.DefaultCost)
if err != nil {
return nil, err
}

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
if err := s.repo.CreateUserWithCertURL(u, string(hash), payload.CertificateURL); err != nil {
return nil, err
}
} else {
if err := s.repo.CreateUser(u, string(hash)); err != nil {
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
pr, err := s.repo.GetPendingRegistration(email)
if err != nil {
return "", 0, fmt.Errorf("no pending registration found for this email")
}

otp, err := generateOTP(6)
if err != nil {
return "", 0, err
}

redisKey := "otp:" + email
_ = s.redis.SetEx(ctx, redisKey, otp, otpTTL)

expiresAt := time.Now().Add(otpTTL * time.Second)
_ = s.repo.UpsertPendingRegistration(email, otp, expiresAt, pr.Payload)
_ = s.sendOTPEmail(email, "", otp)

return email, otpTTL, nil
}

func (s *Service) SendPasswordResetCode(email string) error {
if _, err := s.repo.FindUserByEmail(email); err != nil {
// Don't reveal whether email exists
return nil
}
code, err := generateOTP(6)
if err != nil {
return err
}
resetToken, err := generateToken(32)
if err != nil {
return err
}
expiresAt := time.Now().Add(15 * time.Minute)
if err := s.repo.CreatePasswordReset(email, code, resetToken, expiresAt); err != nil {
return err
}
_ = s.sendPasswordResetEmail(email, code)
return nil
}

func (s *Service) VerifyResetCode(email, code string) (string, error) {
pr, err := s.repo.GetValidPasswordReset(email, code)
if err != nil {
return "", fmt.Errorf("invalid or expired reset code")
}
return pr.ResetToken, nil
}

func (s *Service) ResetPassword(token, newPassword string) error {
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
return s.repo.MarkPasswordResetUsed(pr.ID)
}

func (s *Service) generateJWT(u *User) (string, error) {
expiry, err := time.ParseDuration(s.cfg.JWTExpiry)
if err != nil {
expiry = 24 * time.Hour
}
claims := jwt.MapClaims{
"user_id": u.ID,
"email":   u.Email,
"role":    u.Role,
"exp":     time.Now().Add(expiry).Unix(),
"iat":     time.Now().Unix(),
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
