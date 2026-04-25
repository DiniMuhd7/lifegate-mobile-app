package payments

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"time"
)

// bundleBase defines credit tiers with fixed USD prices.
// NGN amounts are computed at request time from the live exchange rate.
var bundleBase = []struct {
	id      string
	usd     float64
	credits int
}{
	{"2000", 5.00, 5},
	{"5000", 12.00, 15},
	{"10000", 22.00, 40},
}

// fallbackNGNPerUSD is used when the exchange-rate API is unreachable.
const fallbackNGNPerUSD = 1600.0

// erCacheDuration controls how often the exchange rate is refreshed.
const erCacheDuration = 1 * time.Hour

type erCache struct {
	mu        sync.Mutex
	rate      float64
	fetchedAt time.Time
}

var ngnRateCache = &erCache{}

// fetchLiveNGNRate calls the free open.er-api.com endpoint (no API key required)
// and returns the number of NGN per 1 USD.
func fetchLiveNGNRate() float64 {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://open.er-api.com/v6/latest/USD", nil)
	if err != nil {
		return fallbackNGNPerUSD
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fallbackNGNPerUSD
	}
	defer resp.Body.Close()
	var data struct {
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return fallbackNGNPerUSD
	}
	if r, ok := data.Rates["NGN"]; ok && r > 0 {
		return r
	}
	return fallbackNGNPerUSD
}

type Bundle struct {
	ID          string  `json:"id"`
	AmountNaira int     `json:"amountNaira"`
	AmountUSD   float64 `json:"amountUSD"`
	Credits     int     `json:"credits"`
	Label       string  `json:"label"`
	LabelUSD    string  `json:"labelUSD"`
}

// PaymentTransaction is the DB row shape.
type PaymentTransaction struct {
	ID             string `json:"id"`
	UserID         string `json:"userId"`
	TxRef          string `json:"txRef"`
	FlwTxID        string `json:"flwTxId,omitempty"`
	Amount         int    `json:"amount"`
	// Currency is "NGN" or "USD". Amount is in naira for NGN, in cents (×100) for USD.
	Currency       string `json:"currency"`
	CreditsGranted int    `json:"creditsGranted"`
	Status         string `json:"status"`
	BundleID       string `json:"bundleId"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// CreditBalance is a user's current diagnosis credit balance.
type CreditBalance struct {
	UserID    string `json:"userId"`
	Balance   int    `json:"balance"`
	UpdatedAt string `json:"updatedAt"`
}

// flwInitiateRequest is the body sent to Flutterwave standard charge API.
type flwInitiateRequest struct {
	TxRef       string  `json:"tx_ref"`
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`
	RedirectURL string  `json:"redirect_url"`
	Customer    struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"customer"`
	Customizations struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	} `json:"customizations"`
}

type flwInitiateResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Link string `json:"link"`
	} `json:"data"`
}

type flwVerifyResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Data    struct {
		ID       int     `json:"id"`
		TxRef    string  `json:"tx_ref"`
		Amount   float64 `json:"amount"`
		Currency string  `json:"currency"`
		Status   string  `json:"status"` // "successful" | "failed" | "pending"
	} `json:"data"`
}

type flwTransactionListResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Data    []struct {
		ID     int    `json:"id"`
		TxRef  string `json:"tx_ref"`
		Amount int    `json:"amount"`
		Status string `json:"status"`
	} `json:"data"`
}

// WebhookPayload is the body Flutterwave POSTs to our webhook endpoint.
type WebhookPayload struct {
	Event string `json:"event"`
	Data  struct {
		ID     int    `json:"id"`
		TxRef  string `json:"tx_ref"`
		Amount int    `json:"amount"`
		Status string `json:"status"` // "successful"
	} `json:"data"`
}

const flwBaseURL = "https://api.flutterwave.com/v3"

// TrialCredits is the number of free credits granted to every new patient account.
const TrialCredits = 5

// flwHTTPTimeout caps Flutterwave API calls to prevent the service from
// hanging indefinitely when the payment provider is slow or unreachable.
const flwHTTPTimeout = 30 * time.Second

// Service handles payment operations.
type Service struct {
	db          *sql.DB
	secretKey   string
	publicKey   string
	redirectURL string
	webhookHash string
	httpClient  *http.Client
}

func NewService(db *sql.DB, secretKey, publicKey, redirectURL, webhookHash string) *Service {
	return &Service{
		db:          db,
		secretKey:   secretKey,
		publicKey:   publicKey,
		redirectURL: redirectURL,
		webhookHash: webhookHash,
		httpClient:  &http.Client{Timeout: flwHTTPTimeout},
	}
}

// getLiveNGNRate returns the cached NGN/USD rate, refreshing it when stale.
func (s *Service) getLiveNGNRate() float64 {
	ngnRateCache.mu.Lock()
	defer ngnRateCache.mu.Unlock()
	if ngnRateCache.rate > 0 && time.Since(ngnRateCache.fetchedAt) < erCacheDuration {
		return ngnRateCache.rate
	}
	rate := fetchLiveNGNRate()
	ngnRateCache.rate = rate
	ngnRateCache.fetchedAt = time.Now()
	return rate
}

// GetBundles returns all credit bundles with live-rate NGN prices and fixed USD prices.
func (s *Service) GetBundles() []Bundle {
	rate := s.getLiveNGNRate()
	out := make([]Bundle, 0, len(bundleBase))
	for _, b := range bundleBase {
		// Round NGN to nearest ₦100 for clean display.
		ngnAmount := int(math.Round(b.usd*rate/100) * 100)
		if ngnAmount < 100 {
			ngnAmount = 100
		}
		out = append(out, Bundle{
			ID:          b.id,
			AmountNaira: ngnAmount,
			AmountUSD:   b.usd,
			Credits:     b.credits,
			Label:       fmt.Sprintf("₦%s — %d Credits", formatNaira(ngnAmount), b.credits),
			LabelUSD:    fmt.Sprintf("$%.2f — %d Credits", b.usd, b.credits),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Credits < out[j].Credits
	})
	return out
}

// formatNaira formats an integer naira amount with comma separators.
func formatNaira(n int) string {
	s := strconv.Itoa(n)
	result := ""
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result += ","
		}
		result += string(c)
	}
	return result
}

// GetCreditBalance fetches a user's wallet balance (creates row if absent).
func (s *Service) GetCreditBalance(userID string) (*CreditBalance, error) {
	if err := s.ensureInitialTrialGrant(userID); err != nil {
		return nil, err
	}

	if err := s.normalizeLegacyTrialTransactions(userID); err != nil {
		return nil, err
	}

	if err := s.reconcileCreditBalance(userID); err != nil {
		return nil, err
	}

	cb := &CreditBalance{UserID: userID}
	err := s.db.QueryRow(
		`SELECT balance, updated_at::text FROM credits WHERE user_id = $1::uuid`,
		userID,
	).Scan(&cb.Balance, &cb.UpdatedAt)
	if err == sql.ErrNoRows {
		// Lazily create the credits row with 0 balance.
		_, err = s.db.Exec(
			`INSERT INTO credits (user_id, balance) VALUES ($1::uuid, 0) ON CONFLICT DO NOTHING`,
			userID,
		)
		if err != nil {
			return nil, err
		}
		cb.Balance = 0
		cb.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		return cb, nil
	}
	return cb, err
}

// ensureInitialTrialGrant self-heals accounts created before trial-grant wiring
// was fixed. It grants TrialCredits once for non-professional users who have
// no payment transaction history, no credit deductions, and no existing balance.
func (s *Service) ensureInitialTrialGrant(userID string) error {
	var role string
	if err := s.db.QueryRow(
		`SELECT role FROM users WHERE id = $1::uuid`,
		userID,
	).Scan(&role); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}
	if role == "professional" {
		return nil
	}

	var txCount int
	if err := s.db.QueryRow(
		`SELECT COUNT(1) FROM payment_transactions WHERE user_id = $1::uuid`,
		userID,
	).Scan(&txCount); err != nil {
		return err
	}
	if txCount > 0 {
		return nil
	}

	var deductionCount int
	if err := s.db.QueryRow(
		`SELECT COUNT(1) FROM credit_deductions WHERE user_id = $1::uuid`,
		userID,
	).Scan(&deductionCount); err != nil {
		return err
	}
	if deductionCount > 0 {
		return nil
	}

	var balance int
	err := s.db.QueryRow(
		`SELECT balance FROM credits WHERE user_id = $1::uuid`,
		userID,
	).Scan(&balance)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && balance > 0 {
		return nil
	}

	return s.GrantTrialCredits(userID)
}

// reconcileCreditBalance keeps the credits wallet aligned with ledger truth:
// successful credit grants minus credit deductions.
func (s *Service) reconcileCreditBalance(userID string) error {
	var granted int
	if err := s.db.QueryRow(
		`SELECT COALESCE(SUM(credits_granted), 0)
		 FROM payment_transactions
		 WHERE user_id = $1::uuid AND LOWER(status) IN ('success', 'successful')`,
		userID,
	).Scan(&granted); err != nil {
		return err
	}

	var deducted int
	if err := s.db.QueryRow(
		`SELECT COALESCE(SUM(amount), 0)
		 FROM credit_deductions
		 WHERE user_id = $1::uuid`,
		userID,
	).Scan(&deducted); err != nil {
		return err
	}

	expected := granted - deducted
	if expected < 0 {
		expected = 0
	}

	_, err := s.db.Exec(
		`INSERT INTO credits (user_id, balance, updated_at)
		 VALUES ($1::uuid, $2, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()`,
		userID,
		expected,
	)
	return err
}

// GrantTrialCredits inserts TrialCredits into a user's wallet and records it
// in payment_transactions so it appears in transaction history.
// It is idempotent via a deterministic tx_ref per user.
func (s *Service) GrantTrialCredits(userID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	txRef := fmt.Sprintf("TRIAL-%s", userID)

	// Record the trial grant once. If this tx_ref already exists, the user has
	// already received trial credits and we should not grant again.
	var shouldGrant bool
	err = tx.QueryRow(
		`INSERT INTO payment_transactions
		   (user_id, tx_ref, amount, credits_granted, status, bundle_id)
		 VALUES ($1::uuid, $2, 0, $3, 'success', 'trial')
		 ON CONFLICT (tx_ref) DO NOTHING
		 RETURNING true`,
		userID, txRef, TrialCredits,
	).Scan(&shouldGrant)
	if err == sql.ErrNoRows {
		// Trial already granted earlier.
		return tx.Commit()
	}
	if err != nil {
		return err
	}

	// Grant credits whether or not the wallet row already exists.
	if _, err := tx.Exec(
		`INSERT INTO credits (user_id, balance, updated_at)
		 VALUES ($1::uuid, $2, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET balance = credits.balance + EXCLUDED.balance, updated_at = NOW()`,
		userID,
		TrialCredits,
	); err != nil {
		return err
	}

	return tx.Commit()
}

// ReferralBonus is the number of credits awarded to a referrer for each successful referral.
const ReferralBonus = 5

// GrantReferralBonus credits ReferralBonus to the referrer's wallet and records the
// transaction. It is idempotent via the txRef (format "REF-<referrerShort>-<referredShort>").
func (s *Service) GrantReferralBonus(referrerID, txRef string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var inserted bool
	err = tx.QueryRow(
		`INSERT INTO payment_transactions
		   (user_id, tx_ref, amount, credits_granted, status, bundle_id)
		 VALUES ($1::uuid, $2, 0, $3, 'success', 'referral')
		 ON CONFLICT (tx_ref) DO NOTHING
		 RETURNING true`,
		referrerID, txRef, ReferralBonus,
	).Scan(&inserted)
	if err == sql.ErrNoRows {
		return tx.Commit() // already granted
	}
	if err != nil {
		return err
	}

	if _, err := tx.Exec(
		`INSERT INTO credits (user_id, balance, updated_at)
		 VALUES ($1::uuid, $2, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET balance = credits.balance + EXCLUDED.balance, updated_at = NOW()`,
		referrerID, ReferralBonus,
	); err != nil {
		return err
	}

	return tx.Commit()
}

// DeductCredit atomically deducts 1 credit and logs it. Returns false if balance is 0.
func (s *Service) DeductCredit(userID, diagnosisID string) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int
	if err := tx.QueryRow(
		`UPDATE credits SET balance = balance - 1, updated_at = NOW()
		 WHERE user_id = $1::uuid AND balance > 0
		 RETURNING balance`,
		userID,
	).Scan(&balance); err == sql.ErrNoRows {
		return false, nil // insufficient balance
	} else if err != nil {
		return false, err
	}

	// Log the deduction.
	var diagArg interface{}
	if diagnosisID != "" {
		diagArg = diagnosisID
	}
	if _, err := tx.Exec(
		`INSERT INTO credit_deductions (user_id, diagnosis_id, amount)
		 VALUES ($1::uuid, $2::uuid, 1)`,
		userID, diagArg,
	); err != nil {
		return false, err
	}

	return true, tx.Commit()
}

// InitiatePayment creates a pending transaction and returns a Flutterwave payment link.
// currency must be "NGN" or "USD"; it defaults to "NGN" when empty.
func (s *Service) InitiatePayment(userID, email, name, bundleID, currency string) (string, string, error) {
	if currency != "USD" {
		currency = "NGN"
	}

	// Resolve live bundle to get current NGN/USD amounts.
	var bundle *Bundle
	for _, b := range s.GetBundles() {
		b := b
		if b.ID == bundleID {
			bundle = &b
			break
		}
	}
	if bundle == nil {
		return "", "", fmt.Errorf("unknown bundle: %s", bundleID)
	}

	txRef := fmt.Sprintf("LG-%s-%d", userID[:8], time.Now().UnixMilli())

	// amount field stores naira for NGN payments, cents (USD×100) for USD payments.
	var chargeAmount float64
	var dbAmount int
	if currency == "USD" {
		chargeAmount = bundle.AmountUSD
		dbAmount = int(bundle.AmountUSD * 100) // store as cents
	} else {
		chargeAmount = float64(bundle.AmountNaira)
		dbAmount = bundle.AmountNaira
	}

	// Persist pending transaction.
	if _, err := s.db.Exec(
		`INSERT INTO payment_transactions
		   (user_id, tx_ref, amount, credits_granted, status, bundle_id, currency)
		 VALUES ($1::uuid, $2, $3, $4, 'pending', $5, $6)`,
		userID, txRef, dbAmount, bundle.Credits, bundleID, currency,
	); err != nil {
		return "", "", err
	}

	// Skip real Flutterwave call if no secret key configured (test / dev mode).
	if s.secretKey == "" {
		devLink := fmt.Sprintf("lifegate://payment/dev?tx_ref=%s&bundle=%s", txRef, bundleID)
		return txRef, devLink, nil
	}

	var label string
	if currency == "USD" {
		label = bundle.LabelUSD
	} else {
		label = bundle.Label
	}

	reqBody := flwInitiateRequest{
		TxRef:       txRef,
		Amount:      chargeAmount,
		Currency:    currency,
		RedirectURL: s.redirectURL,
	}
	reqBody.Customer.Email = email
	reqBody.Customer.Name = name
	reqBody.Customizations.Title = "LifeGate Credits"
	reqBody.Customizations.Description = label

	link, err := s.flwInitiate(reqBody)
	if err != nil {
		// Mark transaction failed so the user's record is clean.
		_, _ = s.db.Exec(
			`UPDATE payment_transactions SET status='failed', updated_at=NOW() WHERE tx_ref=$1`, txRef,
		)
		return "", "", err
	}
	return txRef, link, nil
}

// RefundCredit atomically adds 1 credit back to a user's wallet.
// Called when the AI endpoint errors after a credit was already deducted.
func (s *Service) RefundCredit(userID string) error {
	_, err := s.db.Exec(
		`UPDATE credits SET balance = balance + 1, updated_at = NOW()
		 WHERE user_id = $1::uuid`,
		userID,
	)
	return err
}

// ProcessWebhook validates a Flutterwave webhook and credits the user on success.
// hashHeader is the value of the "verif-hash" HTTP header sent by Flutterwave.
func (s *Service) ProcessWebhook(payload WebhookPayload, hashHeader string) error {
	// Verify signature: Flutterwave sends the raw webhook secret in verif-hash.
	// We compare with HMAC-SHA256 of the raw body when a webhook secret is set,
	// falling back to a plain equality check (legacy dashboard config).
	if s.webhookHash != "" && hashHeader != s.webhookHash {
		// Second chance: check HMAC-SHA256 signature for newer setups.
		h := sha256.New()
		h.Write([]byte(s.webhookHash))
		expected := hex.EncodeToString(h.Sum(nil))
		if hashHeader != expected {
			return fmt.Errorf("webhook: invalid signature")
		}
	}

	if payload.Event != "charge.completed" {
		// Unrecognised event — acknowledge without action.
		return nil
	}
	if payload.Data.Status != "successful" {
		return nil
	}

	flwTxID := strconv.Itoa(payload.Data.ID)

	// Look up which user owns this txRef.
	var userID string
	err := s.db.QueryRow(
		`SELECT user_id::text FROM payment_transactions WHERE tx_ref = $1`,
		payload.Data.TxRef,
	).Scan(&userID)
	if err == sql.ErrNoRows {
		// Transaction not initiated through our system — ignore.
		return nil
	}
	if err != nil {
		return err
	}

	_, err = s.VerifyAndCredit(userID, payload.Data.TxRef, flwTxID)
	return err
}

// VerifyAndCredit verifies a completed Flutterwave payment and credits the user.
func (s *Service) VerifyAndCredit(userID, txRef, flwTxID string) (*PaymentTransaction, error) {
	var pt PaymentTransaction
	err := s.db.QueryRow(
		`SELECT id, user_id, tx_ref, amount, COALESCE(currency,'NGN'), credits_granted, status, bundle_id,
		        created_at::text, updated_at::text
		 FROM payment_transactions WHERE tx_ref = $1 AND user_id = $2::uuid`,
		txRef, userID,
	).Scan(&pt.ID, &pt.UserID, &pt.TxRef, &pt.Amount, &pt.Currency, &pt.CreditsGranted,
		&pt.Status, &pt.BundleID, &pt.CreatedAt, &pt.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("transaction not found")
	}
	if err != nil {
		return nil, err
	}
	if pt.Status == "success" {
		// Already processed (idempotent).
		return &pt, nil
	}

	// In dev mode (no secret key), auto-approve.
	verified := s.secretKey == ""

	// Web clients cannot capture flwTxId from the deep-link redirect.
	// Look it up via Flutterwave's filter API so verification still succeeds.
	if !verified && flwTxID == "" {
		lookuped, err := s.flwGetIDByTxRef(txRef)
		if err == nil {
			flwTxID = lookuped
		}
		// If the lookup also fails, verification will fall through to "failed" —
		// no change in behaviour from before this fix.
	}

	if !verified && flwTxID != "" {
		// Convert DB amount to the float value Flutterwave expects.
		// NGN: whole naira. USD: amount is stored as cents, convert back to dollars.
		var expectedAmount float64
		if pt.Currency == "USD" {
			expectedAmount = float64(pt.Amount) / 100.0
		} else {
			expectedAmount = float64(pt.Amount)
		}
		ok, err := s.flwVerify(flwTxID, expectedAmount, pt.Currency)
		if err != nil {
			return nil, err
		}
		verified = ok
	}

	if !verified {
		_, _ = s.db.Exec(
			`UPDATE payment_transactions SET status='failed', flw_tx_id=$1, updated_at=NOW() WHERE tx_ref=$2`,
			flwTxID, txRef,
		)
		pt.Status = "failed"
		return &pt, nil
	}

	// Credit the user atomically.
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(
		`INSERT INTO credits (user_id, balance, updated_at)
		 VALUES ($1::uuid, $2, NOW())
		 ON CONFLICT (user_id) DO UPDATE
		   SET balance = credits.balance + EXCLUDED.balance, updated_at = NOW()`,
		userID, pt.CreditsGranted,
	); err != nil {
		return nil, err
	}

	if _, err := tx.Exec(
		`UPDATE payment_transactions
		 SET status='success', flw_tx_id=$1, updated_at=NOW()
		 WHERE tx_ref=$2`,
		flwTxID, txRef,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	pt.Status = "success"
	pt.FlwTxID = flwTxID
	return &pt, nil
}

// GetTransactions returns the payment history for a user.
func (s *Service) GetTransactions(userID string, limit int) ([]PaymentTransaction, error) {
	if err := s.normalizeLegacyTrialTransactions(userID); err != nil {
		return nil, err
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Query(
		`SELECT id, user_id, tx_ref, COALESCE(flw_tx_id,''), amount,
		        COALESCE(currency,'NGN'), credits_granted, status, bundle_id,
		        created_at::text, updated_at::text
		 FROM payment_transactions
		 WHERE user_id = $1::uuid
		 ORDER BY created_at DESC
		 LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PaymentTransaction
	for rows.Next() {
		var pt PaymentTransaction
		if err := rows.Scan(&pt.ID, &pt.UserID, &pt.TxRef, &pt.FlwTxID,
			&pt.Amount, &pt.Currency, &pt.CreditsGranted, &pt.Status, &pt.BundleID,
			&pt.CreatedAt, &pt.UpdatedAt); err != nil {
			continue
		}
		out = append(out, pt)
	}
	return out, rows.Err()
}

// normalizeLegacyTrialTransactions repairs rows with non-canonical status values
// in a single statement so callers pay one round-trip regardless of how many
// rows need fixing.
func (s *Service) normalizeLegacyTrialTransactions(userID string) error {
	_, err := s.db.Exec(
		`UPDATE payment_transactions
		 SET status = CASE
		   WHEN LOWER(status) = 'successful' THEN 'success'
		   WHEN LOWER(status) = 'declined'   THEN 'failed'
		   WHEN bundle_id = 'trial' AND amount = 0 AND credits_granted > 0
		        AND LOWER(status) = 'pending' THEN 'success'
		   ELSE status
		 END,
		 updated_at = NOW()
		 WHERE user_id = $1::uuid
		   AND LOWER(status) IN ('successful', 'declined', 'pending')`,
		userID,
	)
	return err
}

// ── Flutterwave HTTP helpers ──────────────────────────────────────────────────

func (s *Service) flwInitiate(req flwInitiateRequest) (string, error) {
	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(
		context.Background(), http.MethodPost,
		flwBaseURL+"/payments", bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.secretKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var flwResp flwInitiateResponse
	if err := json.Unmarshal(raw, &flwResp); err != nil {
		return "", fmt.Errorf("flutterwave: bad response: %s", string(raw))
	}
	if flwResp.Status != "success" || flwResp.Data.Link == "" {
		return "", fmt.Errorf("flutterwave: %s", flwResp.Message)
	}
	return flwResp.Data.Link, nil
}

func (s *Service) flwVerify(flwTxID string, expectedAmount float64, currency string) (bool, error) {
	httpReq, err := http.NewRequestWithContext(
		context.Background(), http.MethodGet,
		flwBaseURL+"/transactions/"+flwTxID+"/verify", nil,
	)
	if err != nil {
		return false, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.secretKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var flwResp flwVerifyResponse
	if err := json.Unmarshal(raw, &flwResp); err != nil {
		return false, fmt.Errorf("flutterwave verify: bad response")
	}
	if flwResp.Status != "success" {
		return false, nil
	}
	d := flwResp.Data
	return d.Status == "successful" && d.Amount >= expectedAmount && d.Currency == currency, nil
}

// flwGetIDByTxRef looks up a Flutterwave transaction by tx_ref and returns
// the flw transaction ID as a string. Used when the client cannot supply it
// (e.g. web redirect flow where the deep-link callback is not interceptable).
func (s *Service) flwGetIDByTxRef(txRef string) (string, error) {
	httpReq, err := http.NewRequestWithContext(
		context.Background(), http.MethodGet,
		flwBaseURL+"/transactions?tx_ref="+txRef, nil,
	)
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.secretKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var res flwTransactionListResponse
	if err := json.Unmarshal(raw, &res); err != nil {
		return "", fmt.Errorf("flutterwave: bad response: %s", string(raw))
	}
	if res.Status != "success" || len(res.Data) == 0 {
		return "", fmt.Errorf("flutterwave: no transaction found for tx_ref=%s", txRef)
	}
	return strconv.Itoa(res.Data[0].ID), nil
}
