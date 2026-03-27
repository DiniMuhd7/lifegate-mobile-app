package auth

import (
"database/sql"
"errors"
"net/http"
"os"
"path/filepath"

"github.com/gin-gonic/gin"
)

type Handler struct {
svc *Service
cfg interface {
GetUploadDir() string
}
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

pair, err := h.svc.Login(req.Email, req.Password)
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
if payload.Role == "" {
payload.Role = "user"
}

// Handle certificate file upload
if file, header, err := c.Request.FormFile("certificate"); err == nil {
defer file.Close()
if err := os.MkdirAll(h.uploadDir, 0750); err == nil {
dst := filepath.Join(h.uploadDir, header.Filename)
if f, err := os.OpenFile(filepath.Clean(dst), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600); err == nil {
defer f.Close()
buf := make([]byte, 32*1024)
for {
n, readErr := file.Read(buf)
if n > 0 {
f.Write(buf[:n])
}
if readErr != nil {
break
}
}
payload.CertificateURL = dst
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
