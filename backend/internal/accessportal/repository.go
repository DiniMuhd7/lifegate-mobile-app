// Package accessportal manages institutional access requests for the
// public.dshub.com.ng analytics dashboard, including Flutterwave payment
// verification and webhook processing.
package accessportal

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const flwBaseURL = "https://api.flutterwave.com/v3"
const flwTimeout = 30 * time.Second

// Tier describes a dashboard access subscription tier.
type Tier struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Features    []string `json:"features"`
	// PriceNGN / PriceUSD are in the native currency unit (full Naira / full USD).
	PriceNGN float64 `json:"priceNGN"`
	PriceUSD float64 `json:"priceUSD"`
	LabelNGN string  `json:"labelNGN"`
	LabelUSD string  `json:"labelUSD"`
	Free     bool    `json:"free"`
}

var tiers = []Tier{
	{
		ID:          "free",
		Name:        "Government & NGO",
		Description: "For registered government bodies, accredited NGOs, and public health agencies.",
		Features: []string{
			"Full dashboard access",
			"All analytics modules",
			"Institutional verification required",
			"Data sharing agreement required",
		},
		PriceNGN: 0, PriceUSD: 0,
		LabelNGN: "Free", LabelUSD: "Free",
		Free: true,
	},
	{
		ID:          "view",
		Name:        "Dashboard View",
		Description: "Read-only access to all live dashboard panels for institutions and researchers.",
		Features: []string{
			"All 10 analytics modules",
			"Health equity & disparities data",
			"Research dataset metrics",
			"12-month rolling data window",
		},
		PriceNGN: 30000, PriceUSD: 20,
		LabelNGN: "₦30,000 / yr", LabelUSD: "$20 / yr",
		Free: false,
	},
	{
		ID:          "export",
		Name:        "Data Export",
		Description: "Full dashboard access plus aggregate CSV/JSON dataset downloads.",
		Features: []string{
			"Everything in Dashboard View",
			"CSV & JSON aggregate exports",
			"State-level data packages",
			"Quarterly data delivery",
		},
		PriceNGN: 80000, PriceUSD: 55,
		LabelNGN: "₦80,000 / yr", LabelUSD: "$55 / yr",
		Free: false,
	},
	{
		ID:          "api",
		Name:        "API Access",
		Description: "Programmatic access to all public analytics endpoints via a dedicated API key.",
		Features: []string{
			"Everything in Data Export",
			"Dedicated API key",
			"200 req/min rate limit",
			"Webhook data delivery",
		},
		PriceNGN: 200000, PriceUSD: 135,
		LabelNGN: "₦200,000 / yr", LabelUSD: "$135 / yr",
		Free: false,
	},
}

// GetTiers returns the full ordered list of access tiers.
func GetTiers() []Tier { return tiers }

func getTierByID(id string) (Tier, bool) {
	for _, t := range tiers {
		if t.ID == id {
			return t, true
		}
	}
	return Tier{}, false
}

// priceForCurrency returns the tier's price in the given currency.
func priceForCurrency(t Tier, currency string) (float64, error) {
	switch strings.ToUpper(currency) {
	case "NGN":
		return t.PriceNGN, nil
	case "USD":
		return t.PriceUSD, nil
	default:
		return 0, fmt.Errorf("unsupported currency %q", currency)
	}
}

// SubmitBody is the JSON body for POST /api/public/access/submit.
type SubmitBody struct {
	Email       string `json:"email"       binding:"required,email"`
	FullName    string `json:"fullName"    binding:"required"`
	Institution string `json:"institution" binding:"required"`
	JobTitle    string `json:"jobTitle"    binding:"required"`
	Role        string `json:"role"        binding:"required,oneof=government ngo research hospital other"`
	UseCase     string `json:"useCase"     binding:"required"`
	TierID      string `json:"tierId"      binding:"required,oneof=free view export api"`
	Currency    string `json:"currency"    binding:"required,oneof=NGN USD"`
	// FlwTxRef and FlwTxId are required for paid tiers (set by the frontend
	// after Flutterwave Inline checkout succeeds).
	FlwTxRef string `json:"flwTxRef"`
	FlwTxID  string `json:"flwTxId"`
}

// AccessRequest mirrors a persisted row in public_access_requests.
type AccessRequest struct {
	ID            string  `json:"id"`
	Email         string  `json:"email"`
	FullName      string  `json:"fullName"`
	Institution   string  `json:"institution"`
	JobTitle      string  `json:"jobTitle,omitempty"`
	Role          string  `json:"role,omitempty"`
	Tier          string  `json:"tier"`
	Currency      string  `json:"currency"`
	Amount        float64 `json:"amount"`
	FlwTxRef      string  `json:"flwTxRef,omitempty"`
	PaymentStatus string  `json:"paymentStatus"`
	AccessStatus  string  `json:"accessStatus"`
	APIKey        string  `json:"apiKey,omitempty"`
	AdminNotes    string  `json:"adminNotes,omitempty"`
	ApprovedAt    string  `json:"approvedAt,omitempty"`
	CreatedAt     string  `json:"createdAt"`
}

// flwVerifyResponse mirrors Flutterwave's transaction verify endpoint.
type flwVerifyResponse struct {
	Status string `json:"status"`
	Data   struct {
		ID       int     `json:"id"`
		TxRef    string  `json:"tx_ref"`
		Amount   float64 `json:"amount"`
		Currency string  `json:"currency"`
		Status   string  `json:"status"`
	} `json:"data"`
}

// WebhookPayload is the body Flutterwave POSTs on charge.completed.
type WebhookPayload struct {
	Event string `json:"event"`
	Data  struct {
		ID     int    `json:"id"`
		TxRef  string `json:"tx_ref"`
		Amount int    `json:"amount"`
		Status string `json:"status"`
	} `json:"data"`
}

// Repository handles DB persistence and Flutterwave HTTP calls.
type Repository struct {
	db           *sql.DB
	secretKey    string
	webhookHash  string
	httpClient   *http.Client
	resendAPIKey string
	resendURL    string
	emailFrom    string
	adminEmail   string
}

// NewRepository constructs an accessportal Repository.
// resendAPIKey, emailFrom, and adminEmail are optional; email delivery is
// skipped silently when resendAPIKey is empty.
func NewRepository(db *sql.DB, secretKey, webhookHash, resendAPIKey, emailFrom, adminEmail string) *Repository {
	return &Repository{
		db:           db,
		secretKey:    secretKey,
		webhookHash:  webhookHash,
		httpClient:   &http.Client{Timeout: flwTimeout},
		resendAPIKey: resendAPIKey,
		resendURL:    "https://api.resend.com/emails",
		emailFrom:    emailFrom,
		adminEmail:   adminEmail,
	}
}

// TxRefExists reports whether a row with this Flutterwave tx_ref already exists,
// preventing double-submission with the same payment.
func (r *Repository) TxRefExists(ctx context.Context, txRef string) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM public_access_requests WHERE flw_tx_ref = $1`, txRef,
	).Scan(&n)
	return n > 0, err
}

// Save inserts a new access request and returns the created record.
func (r *Repository) Save(ctx context.Context, b SubmitBody, amount float64, paymentStatus string) (AccessRequest, error) {
	var id string
	var createdAt time.Time
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO public_access_requests
		    (email, full_name, institution, job_title, role, use_case,
		     tier, currency, amount, flw_tx_ref, flw_tx_id, payment_status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),NULLIF($11,''),$12)
		RETURNING id, created_at`,
		b.Email, b.FullName, b.Institution, b.JobTitle, b.Role, b.UseCase,
		b.TierID, b.Currency, amount,
		strings.TrimSpace(b.FlwTxRef), strings.TrimSpace(b.FlwTxID), paymentStatus,
	).Scan(&id, &createdAt)
	if err != nil {
		return AccessRequest{}, err
	}
	return AccessRequest{
		ID:            id,
		Email:         b.Email,
		FullName:      b.FullName,
		Institution:   b.Institution,
		Tier:          b.TierID,
		Currency:      b.Currency,
		Amount:        amount,
		FlwTxRef:      b.FlwTxRef,
		PaymentStatus: paymentStatus,
		AccessStatus:  "pending_review",
		CreatedAt:     createdAt.Format(time.RFC3339),
	}, nil
}

// UpdatePaymentStatus sets payment_status and flw_tx_id for a row identified by tx_ref.
func (r *Repository) UpdatePaymentStatus(ctx context.Context, txRef, flwTxID, status string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE public_access_requests
		SET payment_status = $1, flw_tx_id = NULLIF($2,''), updated_at = NOW()
		WHERE flw_tx_ref = $3`, status, flwTxID, txRef)
	return err
}

// VerifyFlutterwavePayment calls Flutterwave's verify API to confirm a
// transaction's amount and currency match what we expect.
func (r *Repository) VerifyFlutterwavePayment(flwTxID string, expectedAmount float64, currency string) (bool, error) {
	req, err := http.NewRequestWithContext(
		context.Background(), http.MethodGet,
		flwBaseURL+"/transactions/"+flwTxID+"/verify", nil,
	)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+r.secretKey)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var vr flwVerifyResponse
	if err := json.Unmarshal(raw, &vr); err != nil {
		return false, fmt.Errorf("flutterwave: bad verify response: %s", string(raw))
	}
	if vr.Status != "success" || vr.Data.Status != "successful" {
		return false, nil
	}
	// Allow ₦1 / $0.01 tolerance for Flutterwave rounding differences.
	const tolerance = 1.0
	if vr.Data.Amount < expectedAmount-tolerance {
		return false, nil
	}
	if !strings.EqualFold(vr.Data.Currency, currency) {
		return false, nil
	}
	return true, nil
}

// VerifyWebhookSignature validates the verif-hash header Flutterwave sends
// with every server-to-server webhook event.
func (r *Repository) VerifyWebhookSignature(hashHeader string) bool {
	if r.webhookHash == "" {
		return false
	}
	expected := hex.EncodeToString(hmac.New(sha256.New, []byte(r.webhookHash)).Sum(nil))
	return hmac.Equal([]byte(hashHeader), []byte(expected))
}

// ProcessWebhook handles a Flutterwave charge.completed webhook and updates
// the payment_status of the matching access request.
func (r *Repository) ProcessWebhook(ctx context.Context, p WebhookPayload, hashHeader string) error {
	if !r.VerifyWebhookSignature(hashHeader) {
		return fmt.Errorf("invalid webhook signature")
	}
	if p.Event != "charge.completed" || p.Data.Status != "successful" {
		return nil // acknowledge silently; no action needed
	}
	flwTxID := strconv.Itoa(p.Data.ID)
	return r.UpdatePaymentStatus(ctx, p.Data.TxRef, flwTxID, "paid")
}

// ─── Email helpers ────────────────────────────────────────────────────────────

// sendEmail posts a plain-text email via the Resend API.
// Returns nil immediately when resendAPIKey is not configured.
func (r *Repository) sendEmail(ctx context.Context, to, subject, body string) error {
	if r.resendAPIKey == "" {
		return nil
	}
	type payload struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
	}
	data, err := json.Marshal(payload{
		From:    r.emailFrom,
		To:      []string{to},
		Subject: subject,
		Text:    body,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.resendURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.resendAPIKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend: status %d: %s", resp.StatusCode, string(raw))
	}
	return nil
}

// SendReceiptEmail emails the applicant a receipt of their submission.
func (r *Repository) SendReceiptEmail(ctx context.Context, req AccessRequest, tierName string) {
	subject := fmt.Sprintf("DSHub Access Request Received — Ref %s", req.ID[:8])
	body := fmt.Sprintf(
		"Hello %s,\n\nThank you for submitting a DSHub Data Portal access request.\n\nReference: %s\nTier: %s\nPayment status: %s\nSubmitted: %s\n\nOur team will review your request and respond within 2–3 business days.\nYou can check your status at public.dshub.com.ng using your email and the reference above.\n\nRegards,\nDSHub Analytics Team\n",
		req.FullName, req.ID[:8], tierName, req.PaymentStatus, req.CreatedAt,
	)
	if err := r.sendEmail(ctx, req.Email, subject, body); err != nil {
		log.Printf("[accessportal] receipt email to %s: %v", req.Email, err)
	}
}

// SendAdminAlertEmail notifies the admin inbox of a new access request.
func (r *Repository) SendAdminAlertEmail(ctx context.Context, req AccessRequest, tierName string) {
	if r.adminEmail == "" {
		return
	}
	subject := fmt.Sprintf("[DSHub] New Access Request — %s (%s)", req.Institution, tierName)
	body := fmt.Sprintf(
		"New institutional access request received.\n\nID: %s\nApplicant: %s <%s>\nInstitution: %s\nTier: %s\nCurrency: %s\nAmount: %.2f\nPayment status: %s\nSubmitted: %s\n\nReview at: https://edis.dshub.com.ng/api/admin/access-requests\n",
		req.ID, req.FullName, req.Email,
		req.Institution, tierName, req.Currency, req.Amount,
		req.PaymentStatus, req.CreatedAt,
	)
	if err := r.sendEmail(ctx, r.adminEmail, subject, body); err != nil {
		log.Printf("[accessportal] admin alert email: %v", err)
	}
}

// SendApprovalEmail notifies the applicant their access has been approved.
func (r *Repository) SendApprovalEmail(ctx context.Context, req AccessRequest, tierName string) {
	subject := fmt.Sprintf("DSHub Access Approved — %s", tierName)
	apiKeyMsg := ""
	if req.APIKey != "" {
		apiKeyMsg = fmt.Sprintf("\nYour API key: %s\n\nInclude it as the X-DSHub-API-Key header in all API requests. Keep this key confidential.\n", req.APIKey)
	}
	body := fmt.Sprintf(
		"Hello %s,\n\nYour DSHub Data Portal access request (Ref: %s) has been approved.\n\nTier: %s%s\nAccess dashboard at: https://public.dshub.com.ng\n\nRegards,\nDSHub Analytics Team\n",
		req.FullName, req.ID[:8], tierName, apiKeyMsg,
	)
	if err := r.sendEmail(ctx, req.Email, subject, body); err != nil {
		log.Printf("[accessportal] approval email to %s: %v", req.Email, err)
	}
}

// SendRejectionEmail notifies the applicant their access was not approved.
func (r *Repository) SendRejectionEmail(ctx context.Context, req AccessRequest, tierName string) {
	notes := req.AdminNotes
	if notes == "" {
		notes = "No additional notes provided."
	}
	subject := "DSHub Access Request — Decision"
	body := fmt.Sprintf(
		"Hello %s,\n\nUnfortunately your DSHub Data Portal access request (Ref: %s, Tier: %s) could not be approved at this time.\n\nNotes: %s\n\nIf you believe this is an error, please contact support@dshub.com.ng with your reference number.\n\nRegards,\nDSHub Analytics Team\n",
		req.FullName, req.ID[:8], tierName, notes,
	)
	if err := r.sendEmail(ctx, req.Email, subject, body); err != nil {
		log.Printf("[accessportal] rejection email to %s: %v", req.Email, err)
	}
}

// ─── Admin queries ────────────────────────────────────────────────────────────

// generateAPIKey produces a secure random API key prefixed with "dshub_".
func generateAPIKey() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "dshub_" + hex.EncodeToString(b), nil
}

const adminSelectCols = `
	SELECT id, email, full_name, institution, job_title, role, tier,
	       currency, amount, payment_status, access_status,
	       COALESCE(flw_tx_ref,''), COALESCE(api_key,''), COALESCE(admin_notes,''),
	       COALESCE(to_char(approved_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),''),
	       to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	FROM public_access_requests`

func scanAccessRequest(row interface{ Scan(...any) error }) (AccessRequest, error) {
	var a AccessRequest
	err := row.Scan(
		&a.ID, &a.Email, &a.FullName, &a.Institution, &a.JobTitle, &a.Role,
		&a.Tier, &a.Currency, &a.Amount, &a.PaymentStatus, &a.AccessStatus,
		&a.FlwTxRef, &a.APIKey, &a.AdminNotes, &a.ApprovedAt, &a.CreatedAt,
	)
	return a, err
}

// ListRequests returns a paginated list of access requests for admin review.
func (r *Repository) ListRequests(ctx context.Context, page, pageSize int, accessStatus string) ([]AccessRequest, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	var (
		total int
		rows  *sql.Rows
		err   error
	)
	if accessStatus != "" {
		r.db.QueryRowContext(ctx, //nolint:errcheck
			`SELECT COUNT(*) FROM public_access_requests WHERE access_status = $1`, accessStatus,
		).Scan(&total)
		rows, err = r.db.QueryContext(ctx,
			adminSelectCols+` WHERE access_status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			accessStatus, pageSize, offset)
	} else {
		r.db.QueryRowContext(ctx, //nolint:errcheck
			`SELECT COUNT(*) FROM public_access_requests`,
		).Scan(&total)
		rows, err = r.db.QueryContext(ctx,
			adminSelectCols+` ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
			pageSize, offset)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []AccessRequest
	for rows.Next() {
		a, err := scanAccessRequest(rows)
		if err != nil {
			return nil, 0, err
		}
		list = append(list, a)
	}
	if list == nil {
		list = []AccessRequest{}
	}
	return list, total, nil
}

// GetRequestByID fetches a single access request by UUID.
func (r *Repository) GetRequestByID(ctx context.Context, id string) (AccessRequest, error) {
	row := r.db.QueryRowContext(ctx, adminSelectCols+` WHERE id = $1`, id)
	return scanAccessRequest(row)
}

// ApproveRequest sets access_status = 'approved', optionally generates an API
// key for the api tier, records admin notes, and sends the approval email.
func (r *Repository) ApproveRequest(ctx context.Context, id, adminNotes string) (AccessRequest, error) {
	req, err := r.GetRequestByID(ctx, id)
	if err != nil {
		return AccessRequest{}, fmt.Errorf("request not found: %w", err)
	}
	apiKey := ""
	if req.Tier == "api" && req.APIKey == "" {
		apiKey, err = generateAPIKey()
		if err != nil {
			return AccessRequest{}, fmt.Errorf("api key generation failed: %w", err)
		}
	}
	var approvedAt time.Time
	err = r.db.QueryRowContext(ctx, `
		UPDATE public_access_requests
		SET access_status = 'approved',
		    admin_notes   = NULLIF($1,''),
		    api_key       = COALESCE(NULLIF($2,''), api_key),
		    approved_at   = NOW(),
		    updated_at    = NOW()
		WHERE id = $3
		RETURNING approved_at`,
		adminNotes, apiKey, id,
	).Scan(&approvedAt)
	if err != nil {
		return AccessRequest{}, err
	}
	req.AccessStatus = "approved"
	req.AdminNotes = adminNotes
	if apiKey != "" {
		req.APIKey = apiKey
	}
	req.ApprovedAt = approvedAt.Format(time.RFC3339)
	return req, nil
}

// RejectRequest sets access_status = 'rejected' and records admin notes.
func (r *Repository) RejectRequest(ctx context.Context, id, adminNotes string) (AccessRequest, error) {
	req, err := r.GetRequestByID(ctx, id)
	if err != nil {
		return AccessRequest{}, fmt.Errorf("request not found: %w", err)
	}
	_, err = r.db.ExecContext(ctx, `
		UPDATE public_access_requests
		SET access_status = 'rejected',
		    admin_notes   = NULLIF($1,''),
		    updated_at    = NOW()
		WHERE id = $2`, adminNotes, id)
	if err != nil {
		return AccessRequest{}, err
	}
	req.AccessStatus = "rejected"
	req.AdminNotes = adminNotes
	return req, nil
}

// CheckStatusByEmailRef lets an applicant look up their request using their
// work email and the 8-character reference prefix shown at submission time.
func (r *Repository) CheckStatusByEmailRef(ctx context.Context, email, refPrefix string) (AccessRequest, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, email, full_name, institution, job_title, role, tier,
		       currency, amount, payment_status, access_status,
		       COALESCE(flw_tx_ref,''), COALESCE(api_key,''), COALESCE(admin_notes,''),
		       COALESCE(to_char(approved_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"'),''),
		       to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM public_access_requests
		WHERE LOWER(email) = LOWER($1)
		  AND id::text ILIKE $2 || '%'
		ORDER BY created_at DESC
		LIMIT 1`, email, refPrefix)
	return scanAccessRequest(row)
}
