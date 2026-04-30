package auth

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// allowedCertMIME is the whitelist of accepted certificate file types.
var allowedCertMIME = map[string]bool{
	"application/pdf":    true,
	"image/jpeg":         true,
	"image/png":          true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

// certExtByMIME maps allowed MIME types to safe file extensions.
var certExtByMIME = map[string]string{
	"application/pdf":    ".pdf",
	"image/jpeg":         ".jpg",
	"image/png":          ".png",
	"application/msword": ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

// randomHex returns a cryptographically random hex string of n bytes.
func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}

type Handler struct {
	svc       *Service
	uploadDir string
}

func NewHandler(svc *Service, uploadDir string) *Handler {
	return &Handler{svc: svc, uploadDir: uploadDir}
}

func respond(c *gin.Context, code int, success bool, message string, data interface{}) {
	body := gin.H{"success": success, "message": message}
	if data != nil {
		body["data"] = data
	}
	c.JSON(code, body)
}

// Login authenticates a user with email and password.
//
// @Summary      Login
// @Description  Authenticate with email and password. Physicians receive a 2FA OTP instead of a token.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string,password=string}  true  "Credentials"
// @Success      200   {object}  object{success=bool,message=string,data=object{token=string,user=object}}
// @Failure      401   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/login [post]
func (h *Handler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}

	pair, err := h.svc.Login(c.Request.Context(), req.Email, req.Password, c.ClientIP())
	if err != nil {
		switch {
		case errors.Is(err, ErrRequires2FA):
			// Physician authenticated with password; 2FA OTP has been sent.
			respond(c, http.StatusOK, true, "2FA code sent to your email",
				gin.H{"requires2FA": true, "email": req.Email})
		case errors.Is(err, ErrPhysician2FARateLimited):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusUnauthorized, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "Login successful", gin.H{"token": pair.Token, "refresh_token": pair.RefreshToken, "user": pair.User})
}

// VerifyPhysician2FA verifies a physician 2FA OTP and returns a JWT.
//
// @Summary      Verify physician 2FA
// @Description  Submit the OTP sent to a physician's email after password authentication.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string,otp=string}  true  "OTP payload"
// @Success      200   {object}  object{success=bool,message=string,data=object{token=string,user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/login/verify-2fa [post]
func (h *Handler) VerifyPhysician2FA(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
		OTP   string `json:"otp" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	pair, err := h.svc.VerifyPhysician2FA(c.Request.Context(), req.Email, req.OTP)
	if err != nil {
		switch {
		case errors.Is(err, ErrOTPTooManyAttempts):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusBadRequest, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "Login successful", gin.H{"token": pair.Token, "refresh_token": pair.RefreshToken, "user": pair.User})
}

// ResendPhysician2FA resends the 2FA OTP to a physician.
//
// @Summary      Resend physician 2FA code
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string}  true  "Email"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/login/resend-2fa [post]
func (h *Handler) ResendPhysician2FA(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	if err := h.svc.ResendPhysician2FA(c.Request.Context(), req.Email); err != nil {
		switch {
		case errors.Is(err, ErrPhysician2FARateLimited):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusBadRequest, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "2FA code resent", nil)
}

// Register creates a new patient account immediately (no OTP flow).
//
// @Summary      Register patient (instant)
// @Description  Creates a patient account and returns a JWT. Use /auth/register/start for physician registration.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{name=string,email=string,password=string,role=string,phone=string,dob=string,gender=string,language=string}  true  "Registration data"
// @Success      201   {object}  object{success=bool,message=string,data=object{token=string,user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /auth/register [post]
func (h *Handler) Register(c *gin.Context) {
	var req struct {
		Name           string `json:"name" binding:"required"`
		Email          string `json:"email" binding:"required,email"`
		Password       string `json:"password" binding:"required,min=8"`
		Role           string `json:"role"`
		Phone          string `json:"phone"`
		DOB            string `json:"dob"`
		Gender         string `json:"gender"`
		Language       string `json:"language"`
		ReferredByCode string `json:"referred_by_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	if req.Role == "" {
		req.Role = "user"
	}

	u := &User{
		UserID:    generateID("USR"),
		PatientID: generateID("PAT"),
		Name:      req.Name,
		Email:     req.Email,
		Role:      req.Role,
		Phone:     req.Phone,
		DOB:       req.DOB,
		Gender:    req.Gender,
		Language:  req.Language,
	}

	pair, err := h.svc.Register(c.Request.Context(), u, req.Password, req.ReferredByCode)
	if err != nil {
		switch {
		case errors.Is(err, ErrEmailAlreadyRegistered), errors.Is(err, ErrPhoneAlreadyRegistered):
			respond(c, http.StatusConflict, false, err.Error(), nil)
		default:
			respond(c, http.StatusBadRequest, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusCreated, true, "Registration successful", gin.H{"token": pair.Token, "refresh_token": pair.RefreshToken, "user": pair.User})
}

// RegisterStart initiates OTP-verified registration (patient or physician).
//
// @Summary      Start OTP registration
// @Description  Accepts multipart/form-data. Physicians can attach a certificate file. Sends an OTP to the provided email.
// @Tags         auth
// @Accept       multipart/form-data
// @Produce      json
// @Param        name                  formData  string  true   "Full name"
// @Param        email                 formData  string  true   "Email address"
// @Param        password              formData  string  true   "Password (min 8 chars)"
// @Param        referred_by_code      formData  string  false  "Referral code"
// @Param        yearsOfExperience     formData  string  false  "Years of experience"
// @Param        certificate           formData  file    false  "Certificate file (PDF/JPEG/PNG/DOC/DOCX)"
// @Success      200  {object}  object{success=bool,message=string,data=object{email=string,otpExpiresIn=integer}}
// @Failure      400  {object}  object{success=bool,message=string}
// @Failure      409  {object}  object{success=bool,message=string}
// @Failure      429  {object}  object{success=bool,message=string}
// @Router       /auth/register/start [post]
func (h *Handler) RegisterStart(c *gin.Context) {
	payload := RegisterStartPayload{
		Name:                 c.PostForm("name"),
		Email:                c.PostForm("email"),
		Password:             c.PostForm("password"),
		Role:                 c.PostForm("role"),
		Phone:                c.PostForm("phone"),
		DOB:                  c.PostForm("dob"),
		Gender:               c.PostForm("gender"),
		Language:             c.PostForm("language"),
		HealthHistory:        c.PostForm("health_history"),
		Specialization:       c.PostForm("specialization"),
		CertificateName:      c.PostForm("certificateName"),
		CertificateID:        c.PostForm("certificateId"),
		CertificateIssueDate: c.PostForm("certificateIssueDate"),
		YearsOfExperience:    c.PostForm("yearsOfExperience"),
		ReferredByCode:       c.PostForm("referred_by_code"),
	}

	if payload.Email == "" || payload.Password == "" || payload.Name == "" {
		respond(c, http.StatusBadRequest, false, "name, email and password are required", nil)
		return
	}
	if len(payload.Password) < 8 {
		respond(c, http.StatusBadRequest, false, "password must be at least 8 characters", nil)
		return
	}
	if payload.Role == "" {
		payload.Role = "user"
	}

	if file, header, err := c.Request.FormFile("certificate"); err == nil {
		defer file.Close()
		contentType := header.Header.Get("Content-Type")
		if !allowedCertMIME[contentType] {
			respond(c, http.StatusBadRequest, false, "invalid certificate file type; accepted: PDF, JPEG, PNG, DOC, DOCX", nil)
			return
		}
		if mkErr := os.MkdirAll(h.uploadDir, 0750); mkErr != nil {
			log.Printf("Failed to create upload dir: %v", mkErr)
		} else {
			ext := certExtByMIME[contentType]
			randomName := randomHex(16) + ext
			dst := filepath.Join(h.uploadDir, randomName)
			f, openErr := os.OpenFile(filepath.Clean(dst), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
			if openErr != nil {
				log.Printf("Failed to open upload file: %v", openErr)
			} else {
				defer f.Close()
				if _, copyErr := io.Copy(f, file); copyErr != nil {
					log.Printf("Failed to save certificate: %v", copyErr)
				} else {
					payload.CertificateURL = dst
				}
			}
		}
	}

	email, ttl, err := h.svc.StartRegistration(c.Request.Context(), payload)
	if err != nil {
		switch {
		case errors.Is(err, ErrEmailAlreadyRegistered), errors.Is(err, ErrPhoneAlreadyRegistered):
			respond(c, http.StatusConflict, false, err.Error(), nil)
		case errors.Is(err, ErrOTPRateLimited):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusInternalServerError, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "OTP sent to your email", gin.H{"email": email, "otpExpiresIn": ttl})
}

// RegisterVerify completes OTP-gated registration.
//
// @Summary      Verify registration OTP
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string,otp=string}  true  "OTP payload"
// @Success      200   {object}  object{success=bool,message=string,data=object{token=string,user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/register/verify [post]
func (h *Handler) RegisterVerify(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
		OTP   string `json:"otp" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}

	pair, err := h.svc.VerifyOTP(c.Request.Context(), req.Email, req.OTP)
	if err != nil {
		switch {
		case errors.Is(err, ErrOTPTooManyAttempts):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusBadRequest, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "Registration complete", gin.H{"token": pair.Token, "refresh_token": pair.RefreshToken, "user": pair.User})
}

// RegisterResend resends the registration OTP.
//
// @Summary      Resend registration OTP
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string}  true  "Email address"
// @Success      200   {object}  object{success=bool,message=string,data=object{email=string,otpExpiresIn=integer}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/register/resend [post]
func (h *Handler) RegisterResend(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}

	email, ttl, err := h.svc.ResendOTP(c.Request.Context(), req.Email)
	if err != nil {
		switch {
		case errors.Is(err, ErrOTPRateLimited):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusBadRequest, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "OTP resent", gin.H{"email": email, "otpExpiresIn": ttl})
}

// SendPasswordResetCode sends a password reset code to the given email.
//
// @Summary      Send password reset code
// @Description  Always returns 200 regardless of whether the email exists, to prevent enumeration.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string}  true  "Email"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/password/send-reset-code [post]
func (h *Handler) SendPasswordResetCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	err := h.svc.SendPasswordResetCode(c.Request.Context(), req.Email)
	if errors.Is(err, ErrResetRateLimited) {
		respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		return
	}
	// All other errors (incl. email not found) are swallowed — don't reveal email existence.
	respond(c, http.StatusOK, true, "If that email exists, a reset code has been sent", nil)
}

// VerifyResetCode validates a password reset code and returns a short-lived reset token.
//
// @Summary      Verify password reset code
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{email=string,code=string}  true  "Email and reset code"
// @Success      200   {object}  object{success=bool,message=string,data=object{resetToken=string}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      429   {object}  object{success=bool,message=string}
// @Router       /auth/password/verify-reset-code [post]
func (h *Handler) VerifyResetCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
		Code  string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	token, err := h.svc.VerifyResetCode(c.Request.Context(), req.Email, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, ErrResetTooManyAttempts):
			respond(c, http.StatusTooManyRequests, false, err.Error(), nil)
		default:
			respond(c, http.StatusBadRequest, false, err.Error(), nil)
		}
		return
	}
	respond(c, http.StatusOK, true, "Code verified", gin.H{"resetToken": token})
}

// ResetPassword sets a new password using a verified reset token.
//
// @Summary      Reset password
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{token=string,newPassword=string}  true  "Reset token and new password"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /auth/password/reset [post]
func (h *Handler) ResetPassword(c *gin.Context) {
	var req struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	if err := h.svc.ResetPassword(req.Token, req.NewPassword); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	respond(c, http.StatusOK, true, "Password reset successful", nil)
}

// Me returns the authenticated user's profile.
//
// @Summary      Get authenticated user
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,message=string,data=object{user=object}}
// @Failure      401  {object}  object{success=bool,message=string}
// @Failure      404  {object}  object{success=bool,message=string}
// @Router       /auth/me [get]
func (h *Handler) Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	id, ok := userID.(string)
	if !ok || id == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}
	user, err := h.svc.repo.FindUserByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respond(c, http.StatusNotFound, false, "User not found", nil)
			return
		}
		respond(c, http.StatusInternalServerError, false, "Failed to fetch user", nil)
		return
	}
	respond(c, http.StatusOK, true, "User fetched", gin.H{"user": user})
}

// ChangePassword updates the authenticated user's password.
//
// @Summary      Change password
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{currentPassword=string,newPassword=string}  true  "Password change payload"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      401   {object}  object{success=bool,message=string}
// @Router       /auth/change-password [put]
func (h *Handler) ChangePassword(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, ok := userID.(string)
	if !ok || uid == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}
	var req struct {
		CurrentPassword string `json:"currentPassword" binding:"required"`
		NewPassword     string `json:"newPassword" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	if err := h.svc.ChangePassword(uid, req.CurrentPassword, req.NewPassword); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	respond(c, http.StatusOK, true, "Password changed successfully", nil)
}

// UpdateBasicProfile updates the authenticated user's name and/or phone number.
//
// @Summary      Update basic profile
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{name=string,phone=string}  false  "Profile fields to update"
// @Success      200   {object}  object{success=bool,message=string,data=object{user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      401   {object}  object{success=bool,message=string}
// @Router       /auth/profile [patch]
func (h *Handler) UpdateBasicProfile(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, ok := userID.(string)
	if !ok || uid == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}
	var req struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	if req.Name == "" && req.Phone == "" {
		respond(c, http.StatusBadRequest, false, "at least one of name or phone must be provided", nil)
		return
	}
	user, err := h.svc.repo.UpdateBasicProfile(uid, req.Name, req.Phone)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to update profile", nil)
		return
	}
	respond(c, http.StatusOK, true, "Profile updated", gin.H{"user": user})
}

// UpdateHealthProfile updates the patient's health profile fields (blood type, allergies, etc.).
//
// @Summary      Update health profile
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      object{blood_type=string,allergies=string,medical_history=string,current_medications=string,emergency_contact=string}  true  "Health profile fields"
// @Success      200   {object}  object{success=bool,message=string,data=object{user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      401   {object}  object{success=bool,message=string}
// @Router       /auth/health-profile [put]
func (h *Handler) UpdateHealthProfile(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, ok := userID.(string)
	if !ok || uid == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}
	var req HealthProfileInput
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}
	user, err := h.svc.repo.UpdateHealthProfile(uid, req)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, "Failed to update health profile", nil)
		return
	}
	respond(c, http.StatusOK, true, "Health profile updated", gin.H{"user": user})
}

// MarkMDCNVerified marks the authenticated professional's MDCN license as verified.
//
// @Summary      Confirm MDCN verification
// @Description  Marks the authenticated physician's MDCN license as verified. Requires role=professional.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,message=string,data=object{user=object}}
// @Failure      401  {object}  object{success=bool,message=string}
// @Failure      403  {object}  object{success=bool,message=string}
// @Router       /auth/mdcn-verify [patch]
func (h *Handler) MarkMDCNVerified(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, ok := userID.(string)
	if !ok || uid == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}

	// Only professionals can verify their MDCN status
	role, _ := c.Get("role")
	if role != "professional" {
		respond(c, http.StatusForbidden, false, "Only health professionals can complete MDCN verification", nil)
		return
	}

	user, err := h.svc.MarkMDCNVerified(c.Request.Context(), uid)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, err.Error(), nil)
		return
	}

	respond(c, http.StatusOK, true, "MDCN verification confirmed", gin.H{"user": user})
}

// Refresh exchanges a valid refresh token for a new access + refresh token pair.
//
// @Summary      Refresh access token
// @Description  Provide a valid refresh token to receive a new short-lived access token and a rotated refresh token.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{refresh_token=string}  true  "Refresh token"
// @Success      200   {object}  object{success=bool,message=string,data=object{token=string,refresh_token=string,user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      401   {object}  object{success=bool,message=string}
// @Router       /auth/refresh [post]
func (h *Handler) Refresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, "refresh_token is required", nil)
		return
	}
	pair, err := h.svc.RefreshAccessToken(c.Request.Context(), req.RefreshToken)
	if err != nil {
		respond(c, http.StatusUnauthorized, false, err.Error(), nil)
		return
	}
	respond(c, http.StatusOK, true, "Token refreshed", gin.H{
		"token":         pair.Token,
		"refresh_token": pair.RefreshToken,
		"user":          pair.User,
	})
}

// Logout revokes the provided refresh token server-side.
//
// @Summary      Logout
// @Description  Revoke the refresh token to invalidate the session. The client should discard both tokens.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{refresh_token=string}  true  "Refresh token to revoke"
// @Success      200   {object}  object{success=bool,message=string}
// @Failure      400   {object}  object{success=bool,message=string}
// @Router       /auth/logout [post]
func (h *Handler) Logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, "refresh_token is required", nil)
		return
	}
	// Best-effort revocation — ignore Redis errors so the client can always clear local state.
	_ = h.svc.RevokeRefreshToken(c.Request.Context(), req.RefreshToken)
	respond(c, http.StatusOK, true, "Logged out", nil)
}

// RequestAccountDeletion schedules the authenticated user's account for permanent deletion in 90 days.
//
// @Summary      Request account deletion
// @Description  Schedules the account for deletion 90 days from now. The user can cancel within that window.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,message=string,data=object{user=object}}
// @Failure      401  {object}  object{success=bool,message=string}
// @Router       /auth/account/delete [post]
func (h *Handler) RequestAccountDeletion(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, ok := userID.(string)
	if !ok || uid == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}
	user, err := h.svc.ScheduleAccountDeletion(uid)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, err.Error(), nil)
		return
	}
	respond(c, http.StatusOK, true, "Your account has been scheduled for deletion in 90 days. You can cancel this at any time before then.", gin.H{"user": user})
}

// CancelAccountDeletion cancels a previously requested account deletion.
//
// @Summary      Cancel account deletion
// @Description  Cancels a scheduled account deletion, keeping the account active.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  object{success=bool,message=string,data=object{user=object}}
// @Failure      401  {object}  object{success=bool,message=string}
// @Router       /auth/account/delete [delete]
func (h *Handler) CancelAccountDeletion(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid, ok := userID.(string)
	if !ok || uid == "" {
		respond(c, http.StatusUnauthorized, false, "Unauthorized", nil)
		return
	}
	user, err := h.svc.CancelAccountDeletion(uid)
	if err != nil {
		respond(c, http.StatusInternalServerError, false, err.Error(), nil)
		return
	}
	respond(c, http.StatusOK, true, "Account deletion has been cancelled. Your account is safe.", gin.H{"user": user})
}

// GoogleLogin authenticates a user via a Firebase Google Sign-In ID token.
//
// @Summary      Google Sign-In
// @Description  Verify a Firebase ID token obtained via Google Sign-In and return a LifeGate JWT.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      object{id_token=string}  true  "Firebase ID token"
// @Success      200   {object}  object{success=bool,message=string,data=object{token=string,user=object}}
// @Failure      400   {object}  object{success=bool,message=string}
// @Failure      401   {object}  object{success=bool,message=string}
// @Router       /auth/google [post]
func (h *Handler) GoogleLogin(c *gin.Context) {
	var req struct {
		IDToken string `json:"id_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respond(c, http.StatusBadRequest, false, err.Error(), nil)
		return
	}

	pair, err := h.svc.GoogleLogin(c.Request.Context(), req.IDToken)
	if err != nil {
		respond(c, http.StatusUnauthorized, false, err.Error(), nil)
		return
	}

	respond(c, http.StatusOK, true, "Login successful", gin.H{
		"token":        pair.Token,
		"refresh_token": pair.RefreshToken,
		"user":         pair.User,
	})
}


