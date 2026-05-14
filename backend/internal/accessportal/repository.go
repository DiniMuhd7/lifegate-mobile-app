// Package accessportal manages institutional access requests for the
// public.dshub.com.ng analytics dashboard, including Flutterwave payment
// verification and webhook processing.
package accessportal

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
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
	Tier          string  `json:"tier"`
	Currency      string  `json:"currency"`
	Amount        float64 `json:"amount"`
	FlwTxRef      string  `json:"flwTxRef,omitempty"`
	PaymentStatus string  `json:"paymentStatus"`
	AccessStatus  string  `json:"accessStatus"`
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
	db          *sql.DB
	secretKey   string
	webhookHash string
	httpClient  *http.Client
}

// NewRepository constructs an accessportal Repository.
func NewRepository(db *sql.DB, secretKey, webhookHash string) *Repository {
	return &Repository{
		db:          db,
		secretKey:   secretKey,
		webhookHash: webhookHash,
		httpClient:  &http.Client{Timeout: flwTimeout},
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
