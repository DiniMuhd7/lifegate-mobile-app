package support

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/config"
)

type Service struct {
	cfg       *config.Config
	resendURL string
}

type ContactRequest struct {
	ContactName  string
	ContactEmail string
	Role         string
	UserID       string
	LifeGateID   string
	IssueType    string
	Description  string
}

func NewService(cfg *config.Config) *Service {
	return &Service{cfg: cfg, resendURL: "https://api.resend.com/emails"}
}

func (s *Service) SubmitContactRequest(ctx context.Context, req ContactRequest) (string, error) {
	if s.cfg.ResendAPIKey == "" {
		return "", fmt.Errorf("support email service is not configured")
	}

	req.ContactName = strings.TrimSpace(req.ContactName)
	req.ContactEmail = strings.TrimSpace(strings.ToLower(req.ContactEmail))
	req.Role = strings.TrimSpace(req.Role)
	req.UserID = strings.TrimSpace(req.UserID)
	req.LifeGateID = strings.TrimSpace(req.LifeGateID)
	req.IssueType = strings.TrimSpace(req.IssueType)
	req.Description = strings.TrimSpace(req.Description)

	if req.ContactEmail == "" || req.IssueType == "" || req.Description == "" {
		return "", fmt.Errorf("contact email, issue type, and description are required")
	}

	refID := fmt.Sprintf("SUP-%d", time.Now().Unix())
	subject := fmt.Sprintf("LifeGate Support Request [%s] %s", refID, req.IssueType)
	body := fmt.Sprintf(
		"Support reference: %s\n\nContact name: %s\nContact email: %s\nRole: %s\nUser ID: %s\nLifeGate ID: %s\nIssue type: %s\nSubmitted at: %s\n\nDescription:\n%s\n",
		refID,
		emptyFallback(req.ContactName, "Not provided"),
		req.ContactEmail,
		emptyFallback(req.Role, "Unknown"),
		emptyFallback(req.UserID, "Not provided"),
		emptyFallback(req.LifeGateID, "Not provided"),
		req.IssueType,
		time.Now().UTC().Format(time.RFC3339),
		req.Description,
	)

	if err := s.sendEmail(ctx, s.cfg.SupportEmail, subject, body); err != nil {
		return "", err
	}

	ackSubject := fmt.Sprintf("LifeGate Support Request Received [%s]", refID)
	ackBody := fmt.Sprintf(
		"Hello %s,\n\nWe have received your support request regarding \"%s\". Your reference ID is %s. Our support team will review it and get back to you via email if needed.\n\nThank you,\nLifeGate Support",
		emptyFallback(req.ContactName, "there"),
		req.IssueType,
		refID,
	)
	_ = s.sendEmail(ctx, req.ContactEmail, ackSubject, ackBody)

	return refID, nil
}

func (s *Service) sendEmail(ctx context.Context, to, subject, body string) error {
	type payload struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
	}

	data, err := json.Marshal(payload{
		From:    s.cfg.EmailFrom,
		To:      []string{to},
		Subject: subject,
		Text:    body,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.resendURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend: status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func emptyFallback(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
