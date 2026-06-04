package auth

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
)

// ─── generateOTP ──────────────────────────────────────────────────────────────

func TestGenerateOTP_ReturnedLength(t *testing.T) {
	for _, n := range []int{4, 6, 8} {
		otp, err := generateOTP(n)
		if err != nil {
			t.Fatalf("generateOTP(%d): unexpected error: %v", n, err)
		}
		if len(otp) != n {
			t.Errorf("generateOTP(%d): got length %d, want %d", n, len(otp), n)
		}
	}
}

func TestGenerateOTP_OnlyDigits(t *testing.T) {
	otp, err := generateOTP(6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, c := range otp {
		if c < '0' || c > '9' {
			t.Errorf("OTP contains non-digit character: %q", c)
		}
	}
}

func TestGenerateOTP_Randomness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 30; i++ {
		otp, err := generateOTP(6)
		if err != nil {
			t.Fatalf("generateOTP error: %v", err)
		}
		seen[otp] = struct{}{}
	}
	// With 30 draws from 10^6 possibilities, at least 25 distinct values expected.
	if len(seen) < 25 {
		t.Errorf("OTP appears non-random: only %d unique values in 30 draws", len(seen))
	}
}

// ─── generateToken ────────────────────────────────────────────────────────────

func TestGenerateToken_Length(t *testing.T) {
	for _, n := range []int{8, 16, 32} {
		tok, err := generateToken(n)
		if err != nil {
			t.Fatalf("generateToken(%d): unexpected error: %v", n, err)
		}
		if len(tok) != n {
			t.Errorf("generateToken(%d): got length %d, want %d", n, len(tok), n)
		}
	}
}

func TestGenerateToken_AlphanumericOnly(t *testing.T) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	tok, err := generateToken(64)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, c := range tok {
		if !strings.ContainsRune(charset, c) {
			t.Errorf("token contains character outside charset: %q", c)
		}
	}
}

// ─── generateID ───────────────────────────────────────────────────────────────

func TestGenerateID_HasPrefix(t *testing.T) {
	for _, prefix := range []string{"USR", "PAT", "DOC"} {
		id := generateID(prefix)
		if !strings.HasPrefix(id, prefix+"-") {
			t.Errorf("generateID(%q): got %q, want prefix %q-", prefix, id, prefix)
		}
	}
}

func TestGenerateID_Uniqueness(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		id := generateID("USR")
		if _, dup := seen[id]; dup {
			t.Errorf("generateID produced duplicate: %q", id)
		}
		seen[id] = struct{}{}
	}
}

// ─── generateJWT ──────────────────────────────────────────────────────────────

func newTestCfg() *config.Config {
	return &config.Config{
		JWTSecret: "test-secret-key-for-unit-tests",
		JWTExpiry: "1h",
	}
}

func makeTestUser() *User {
	return &User{
		ID:    "usr-test-123",
		Email: "test@example.com",
		Role:  "user",
	}
}

func TestGenerateJWT_ReturnsToken(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, err := svc.generateJWT(makeTestUser())
	if err != nil {
		t.Fatalf("generateJWT: unexpected error: %v", err)
	}
	if tok == "" {
		t.Error("generateJWT: returned empty token")
	}
}

func TestGenerateJWT_ThreeParts(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, err := svc.generateJWT(makeTestUser())
	if err != nil {
		t.Fatalf("generateJWT: unexpected error: %v", err)
	}
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Errorf("generateJWT: expected 3 JWT parts, got %d: %q", len(parts), tok)
	}
}

func TestGenerateJWT_InvalidExpiryFallsBack(t *testing.T) {
	// An unparseable JWTExpiry should fall back to 24 h without erroring.
	cfg := &config.Config{JWTSecret: "secret", JWTExpiry: "not-a-duration"}
	svc := &Service{cfg: cfg}
	tok, err := svc.generateJWT(makeTestUser())
	if err != nil {
		t.Fatalf("generateJWT with bad expiry: unexpected error: %v", err)
	}
	if tok == "" {
		t.Error("generateJWT with bad expiry: returned empty token")
	}
}

func TestGenerateJWT_DifferentRolesProduceDifferentTokens(t *testing.T) {
	cfg := newTestCfg()
	svc := &Service{cfg: cfg}
	user := &User{ID: "u1", Email: "a@b.com", Role: "user"}
	prof := &User{ID: "u1", Email: "a@b.com", Role: "professional"}

	tokUser, _ := svc.generateJWT(user)
	tokProf, _ := svc.generateJWT(prof)

	if tokUser == tokProf {
		t.Error("tokens for different roles should differ (role is in claims)")
	}
}

// parseJWTPayload decodes the claims section of a JWT without verifying the signature.
func parseJWTPayload(t *testing.T, tok string) map[string]interface{} {
	t.Helper()
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 JWT parts, got %d", len(parts))
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("base64 decode payload: %v", err)
	}
	var claims map[string]interface{}
	if err := json.Unmarshal(payload, &claims); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	return claims
}

func TestGenerateJWT_HasIssuerClaim(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, _ := svc.generateJWT(makeTestUser())
	claims := parseJWTPayload(t, tok)
	if iss, ok := claims["iss"]; !ok || iss != "lifegate" {
		t.Errorf("expected iss=lifegate, got %v", claims["iss"])
	}
}

func TestGenerateJWT_HasNbfClaim(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, _ := svc.generateJWT(makeTestUser())
	claims := parseJWTPayload(t, tok)
	if _, ok := claims["nbf"]; !ok {
		t.Error("expected nbf claim to be present")
	}
}

func TestGenerateJWT_HasJtiClaim(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, _ := svc.generateJWT(makeTestUser())
	claims := parseJWTPayload(t, tok)
	jti, ok := claims["jti"]
	if !ok {
		t.Fatal("expected jti claim to be present")
	}
	if jti == "" {
		t.Error("jti claim must not be empty")
	}
}

func TestGenerateJWT_UniqueJti(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	u := makeTestUser()
	seen := make(map[string]struct{})
	for i := 0; i < 20; i++ {
		tok, err := svc.generateJWT(u)
		if err != nil {
			t.Fatalf("generateJWT error: %v", err)
		}
		claims := parseJWTPayload(t, tok)
		jti := claims["jti"].(string)
		if _, dup := seen[jti]; dup {
			t.Errorf("duplicate jti produced: %q", jti)
		}
		seen[jti] = struct{}{}
	}
}

func TestGenerateJWT_IatEqualsNbf(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, _ := svc.generateJWT(makeTestUser())
	claims := parseJWTPayload(t, tok)
	iat := claims["iat"].(float64)
	nbf := claims["nbf"].(float64)
	if iat != nbf {
		t.Errorf("expected iat == nbf (single time.Now() call), got iat=%v nbf=%v", iat, nbf)
	}
}

func TestGenerateJWT_ExpAfterIat(t *testing.T) {
	svc := &Service{cfg: newTestCfg()}
	tok, _ := svc.generateJWT(makeTestUser())
	claims := parseJWTPayload(t, tok)
	iat := claims["iat"].(float64)
	exp := claims["exp"].(float64)
	if exp <= iat {
		t.Errorf("expected exp > iat, got exp=%v iat=%v", exp, iat)
	}
}

// ─── sendEmail (Resend) ───────────────────────────────────────────────────────

// newResendTestServer starts a mock HTTP server that responds with the given
// status code and returns its URL plus a cleanup function.
func newResendTestServer(t *testing.T, status int, handler func(r *http.Request)) (string, func()) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handler != nil {
			handler(r)
		}
		w.WriteHeader(status)
	}))
	return srv.URL, srv.Close
}

func newResendSvc(apiKey, from, serverURL string) *Service {
	return &Service{
		cfg: &config.Config{
			ResendAPIKey: apiKey,
			EmailFrom:    from,
		},
		resendURL: serverURL,
	}
}

func TestSendEmail_PostsToResendEndpoint(t *testing.T) {
	var gotMethod, gotPath string
	url, cleanup := newResendTestServer(t, http.StatusOK, func(r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
	})
	defer cleanup()

	svc := newResendSvc("test-key", "contact@dshub.com.ng", url)
	if err := svc.sendEmail("user@example.com", "Test Subject", "Test body"); err != nil {
		t.Fatalf("sendEmail: unexpected error: %v", err)
	}
	if gotMethod != http.MethodPost {
		t.Errorf("expected POST, got %q", gotMethod)
	}
	// httptest server URL has no path; the request should hit "/"
	if gotPath != "/" {
		t.Errorf("unexpected path %q", gotPath)
	}
}

func TestSendEmail_SetsAuthorizationHeader(t *testing.T) {
	const apiKey = "re_test_key_123"
	var gotAuth string
	url, cleanup := newResendTestServer(t, http.StatusOK, func(r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
	})
	defer cleanup()

	svc := newResendSvc(apiKey, "contact@dshub.com.ng", url)
	if err := svc.sendEmail("user@example.com", "Subject", "Body"); err != nil {
		t.Fatalf("sendEmail: unexpected error: %v", err)
	}
	if gotAuth != "Bearer "+apiKey {
		t.Errorf("expected Authorization 'Bearer %s', got %q", apiKey, gotAuth)
	}
}

func TestSendEmail_SetsContentTypeJSON(t *testing.T) {
	var gotCT string
	url, cleanup := newResendTestServer(t, http.StatusOK, func(r *http.Request) {
		gotCT = r.Header.Get("Content-Type")
	})
	defer cleanup()

	svc := newResendSvc("key", "contact@dshub.com.ng", url)
	_ = svc.sendEmail("user@example.com", "Subject", "Body")
	if gotCT != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", gotCT)
	}
}

func TestSendEmail_JSONBodyFields(t *testing.T) {
	const (
		fromAddr = "contact@dshub.com.ng"
		toAddr   = "patient@example.com"
		subject  = "LifeGate OTP"
		body     = "Your code is 123456"
	)
	var gotBody map[string]interface{}
	url, cleanup := newResendTestServer(t, http.StatusOK, func(r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
	})
	defer cleanup()

	svc := newResendSvc("key", fromAddr, url)
	if err := svc.sendEmail(toAddr, subject, body); err != nil {
		t.Fatalf("sendEmail: unexpected error: %v", err)
	}

	if gotBody["from"] != fromAddr {
		t.Errorf("from: got %v, want %q", gotBody["from"], fromAddr)
	}
	if gotBody["subject"] != subject {
		t.Errorf("subject: got %v, want %q", gotBody["subject"], subject)
	}
	if gotBody["text"] != body {
		t.Errorf("text: got %v, want %q", gotBody["text"], body)
	}
	tos, ok := gotBody["to"].([]interface{})
	if !ok || len(tos) != 1 || tos[0] != toAddr {
		t.Errorf("to: got %v, want [%q]", gotBody["to"], toAddr)
	}
}

func TestSendEmail_ReturnsErrorOn4xx(t *testing.T) {
	url, cleanup := newResendTestServer(t, http.StatusUnauthorized, nil)
	defer cleanup()

	svc := newResendSvc("bad-key", "contact@dshub.com.ng", url)
	err := svc.sendEmail("user@example.com", "Subject", "Body")
	if err == nil {
		t.Fatal("sendEmail: expected error on 401, got nil")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("expected error to mention status 401, got %q", err.Error())
	}
}

func TestSendEmail_ReturnsErrorOn5xx(t *testing.T) {
	url, cleanup := newResendTestServer(t, http.StatusInternalServerError, nil)
	defer cleanup()

	svc := newResendSvc("key", "contact@dshub.com.ng", url)
	err := svc.sendEmail("user@example.com", "Subject", "Body")
	if err == nil {
		t.Fatal("sendEmail: expected error on 500, got nil")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("expected error to mention status 500, got %q", err.Error())
	}
}

func TestSendEmail_SucceedsOn2xx(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusCreated} {
		url, cleanup := newResendTestServer(t, status, nil)
		svc := newResendSvc("key", "contact@dshub.com.ng", url)
		if err := svc.sendEmail("user@example.com", "Subject", "Body"); err != nil {
			t.Errorf("sendEmail: unexpected error for status %d: %v", status, err)
		}
		cleanup()
	}
}

// ─── sendOTPEmail / sendPasswordResetEmail ────────────────────────────────────

func TestSendOTPEmail_SubjectAndBody(t *testing.T) {
	var gotBody map[string]interface{}
	url, cleanup := newResendTestServer(t, http.StatusOK, func(r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
	})
	defer cleanup()

	svc := newResendSvc("key", "contact@dshub.com.ng", url)
	if err := svc.sendOTPEmail("user@example.com", "Alice", "987654"); err != nil {
		t.Fatalf("sendOTPEmail: unexpected error: %v", err)
	}
	subject, _ := gotBody["subject"].(string)
	text, _ := gotBody["text"].(string)
	if !strings.Contains(subject, "Verify") {
		t.Errorf("subject should mention Verify, got %q", subject)
	}
	if !strings.Contains(text, "987654") {
		t.Errorf("body should contain OTP code, got %q", text)
	}
	if !strings.Contains(text, "Alice") {
		t.Errorf("body should contain recipient name, got %q", text)
	}
}

func TestSendPasswordResetEmail_SubjectAndBody(t *testing.T) {
	var gotBody map[string]interface{}
	url, cleanup := newResendTestServer(t, http.StatusOK, func(r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
	})
	defer cleanup()

	svc := newResendSvc("key", "contact@dshub.com.ng", url)
	if err := svc.sendPasswordResetEmail("user@example.com", "112233"); err != nil {
		t.Fatalf("sendPasswordResetEmail: unexpected error: %v", err)
	}
	subject, _ := gotBody["subject"].(string)
	text, _ := gotBody["text"].(string)
	if !strings.Contains(subject, "Password Reset") && !strings.Contains(subject, "Reset") {
		t.Errorf("subject should mention Reset, got %q", subject)
	}
	if !strings.Contains(text, "112233") {
		t.Errorf("body should contain reset code, got %q", text)
	}
}

