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

func (h *Handler) Login(c *gin.Context) {
var req struct {
Email    string `json:"email" binding:"required,email"`
Password string `json:"password" binding:"required"`
}
if err := c.ShouldBindJSON(&req); err != nil {
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}

pair, err := h.svc.Login(c.Request.Context(), req.Email, req.Password)
if err != nil {
respond(c, http.StatusUnauthorized, false, err.Error(), nil)
return
}
respond(c, http.StatusOK, true, "Login successful", gin.H{"token": pair.Token, "user": pair.User})
}

func (h *Handler) Register(c *gin.Context) {
var req struct {
Name     string `json:"name" binding:"required"`
Email    string `json:"email" binding:"required,email"`
Password string `json:"password" binding:"required"`
Role     string `json:"role"`
Phone    string `json:"phone"`
DOB      string `json:"dob"`
Gender   string `json:"gender"`
Language string `json:"language"`
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

pair, err := h.svc.Register(u, req.Password)
if err != nil {
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}
respond(c, http.StatusCreated, true, "Registration successful", gin.H{"token": pair.Token, "user": pair.User})
}

func (h *Handler) RegisterStart(c *gin.Context) {
if err := c.Request.ParseMultipartForm(10 << 20); err != nil {
respond(c, http.StatusBadRequest, false, "Failed to parse form: "+err.Error(), nil)
return
}

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
}
if payload.Email == "" || payload.Password == "" || payload.Name == "" {
respond(c, http.StatusBadRequest, false, "name, email and password are required", nil)
return
}
// Server-side password validation
if len(payload.Password) < 8 {
respond(c, http.StatusBadRequest, false, "password must be at least 8 characters", nil)
return
}
if payload.Role == "" {
payload.Role = "user"
}

// Handle certificate file upload
if file, header, err := c.Request.FormFile("certificate"); err == nil {
defer file.Close()
// Validate MIME type against whitelist
contentType := header.Header.Get("Content-Type")
if !allowedCertMIME[contentType] {
respond(c, http.StatusBadRequest, false, "invalid certificate file type; accepted: PDF, JPEG, PNG, DOC, DOCX", nil)
return
}
if mkErr := os.MkdirAll(h.uploadDir, 0750); mkErr != nil {
log.Printf("Failed to create upload dir: %v", mkErr)
} else {
// Use a random hex filename to prevent path traversal and enumeration
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
respond(c, http.StatusInternalServerError, false, err.Error(), nil)
return
}
respond(c, http.StatusOK, true, "OTP sent to your email", gin.H{"email": email, "otpExpiresIn": ttl})
}

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
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}
respond(c, http.StatusOK, true, "Registration complete", gin.H{"token": pair.Token, "user": pair.User})
}

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
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}
respond(c, http.StatusOK, true, "OTP resent", gin.H{"email": email, "otpExpiresIn": ttl})
}

func (h *Handler) SendPasswordResetCode(c *gin.Context) {
var req struct {
Email string `json:"email" binding:"required,email"`
}
if err := c.ShouldBindJSON(&req); err != nil {
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}
_ = h.svc.SendPasswordResetCode(req.Email)
respond(c, http.StatusOK, true, "If that email exists, a reset code has been sent", nil)
}

func (h *Handler) VerifyResetCode(c *gin.Context) {
var req struct {
Email string `json:"email" binding:"required,email"`
Code  string `json:"code" binding:"required"`
}
if err := c.ShouldBindJSON(&req); err != nil {
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}
token, err := h.svc.VerifyResetCode(req.Email, req.Code)
if err != nil {
respond(c, http.StatusBadRequest, false, err.Error(), nil)
return
}
respond(c, http.StatusOK, true, "Code verified", gin.H{"resetToken": token})
}

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
