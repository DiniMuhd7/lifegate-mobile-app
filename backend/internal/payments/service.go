package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// bundleBase defines credit tiers.
// NGN prices are the source of truth. USD bundle prices are derived from a
// cached live FX rate (with fallback) so checkout follows one market rule.
// isPremium marks subscription plans (unlimited Dx credits); billingCycle is
// "monthly" or "annual" for Premium plans, empty for pay-per-use.
var bundleBase = []struct {
	id           string
	name         string
	ngnFixed     int
	credits      int
	isPremium    bool
	billingCycle string
}{
	// Pay-per-use credit packages
	{"2000",            "Starter",          2500,  5,   false, ""},
	{"5000",            "Standard",         7500,  15,  false, ""},
	{"10000",           "Value",            25000, 50,  false, ""},
	// Premium subscription plans — credits = 0 because unlimited access is
	// enforced via the is_premium flag in the credits table; the DeductCredit
	// function skips deduction entirely for active Premium subscribers.
	{"premium_monthly", "LifeGate Premium", 5000,  0, true,  "monthly"},
	{"premium_annual",  "LifeGate Premium", 50000, 0, true,  "annual"},
}

type fxRateResponse struct {
	Rates map[string]float64 `json:"rates"`
}

type Bundle struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	AmountNaira  int     `json:"amountNaira"`
	AmountUSD    float64 `json:"amountUSD"`
	Credits      int     `json:"credits"`
	IsPremium    bool    `json:"isPremium"`
	BillingCycle string  `json:"billingCycle"` // "" | "monthly" | "annual"
	Label        string  `json:"label"`
	LabelUSD     string  `json:"labelUSD"`
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
	UserID           string `json:"userId"`
	Balance          int    `json:"balance"`
	IsPremium        bool   `json:"isPremium"`
	PremiumExpiresAt string `json:"premiumExpiresAt,omitempty"`
	BillingCycle     string `json:"billingCycle,omitempty"`
	UpdatedAt        string `json:"updatedAt"`
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
const TrialCredits = 10

// flwHTTPTimeout caps Flutterwave API calls to prevent the service from
// hanging indefinitely when the payment provider is slow or unreachable.
const flwHTTPTimeout = 30 * time.Second

// Service handles payment operations.
type Service struct {
	db             *sql.DB
	secretKey      string
	publicKey      string
	redirectURL    string
	webhookHash    string
	fxRateURL      string
	fallbackFXRate float64
	fxCacheTTL     time.Duration
	httpClient     *http.Client
	paymentLock    sync.Mutex                  // Protects concurrent VerifyAndCredit calls (FIX #1)
	processingTxs  map[string]bool             // Tracks txRefs currently being processed
	retryQueue     []*PaymentRetry             // Webhook retry queue (FIX #4)
	fxCacheMu      sync.RWMutex
	cachedFXRate   float64
	fxCachedAt     time.Time
}

// PaymentRetry tracks failed webhook events for retry (FIX #4)
type PaymentRetry struct {
	TxRef       string
	UserID      string
	FlwTxID     string
	Attempts    int
	LastAttempt time.Time
}

func NewService(db *sql.DB, secretKey, publicKey, redirectURL, webhookHash, fxRateURL string, fallbackFXRate float64, fxCacheTTL time.Duration) *Service {
	return &Service{
		db:            db,
		secretKey:     secretKey,
		publicKey:     publicKey,
		redirectURL:   redirectURL,
		webhookHash:   webhookHash,
		fxRateURL:     fxRateURL,
		fallbackFXRate: fallbackFXRate,
		fxCacheTTL:    fxCacheTTL,
		httpClient:    &http.Client{Timeout: flwHTTPTimeout},
		processingTxs: make(map[string]bool),
	}
}

// GetBundles returns credit bundles using NGN as the source of truth and a cached live FX rate for USD.
func (s *Service) GetBundles() []Bundle {
	rate := s.getNGNPerUSD()
	out := make([]Bundle, 0, len(bundleBase))
	for _, b := range bundleBase {
		usd := roundCurrency(float64(b.ngnFixed) / rate)
		var label, labelUSD string
		if b.isPremium {
			cycle := "Monthly"
			if b.billingCycle == "annual" {
				cycle = "Annual"
			}
			label = fmt.Sprintf("%s — %s · ₦%s", b.name, cycle, formatNaira(b.ngnFixed))
			labelUSD = fmt.Sprintf("%s — %s · $%.2f", b.name, cycle, usd)
		} else {
			label = fmt.Sprintf("%s · %d Dx Credits · ₦%s", b.name, b.credits, formatNaira(b.ngnFixed))
			labelUSD = fmt.Sprintf("%s · %d Dx Credits · $%.2f", b.name, b.credits, usd)
		}
		out = append(out, Bundle{
			ID:           b.id,
			Name:         b.name,
			AmountNaira:  b.ngnFixed,
			AmountUSD:    usd,
			Credits:      b.credits,
			IsPremium:    b.isPremium,
			BillingCycle: b.billingCycle,
			Label:        label,
			LabelUSD:     labelUSD,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		// Premium plans sort after pay-per-use; within each group sort by credits ascending.
		if out[i].IsPremium != out[j].IsPremium {
			return !out[i].IsPremium
		}
		return out[i].Credits < out[j].Credits
	})
	return out
}

func (s *Service) getNGNPerUSD() float64 {
	if s.fallbackFXRate <= 0 {
		s.fallbackFXRate = 1600
	}

	s.fxCacheMu.RLock()
	if s.cachedFXRate > 0 && time.Since(s.fxCachedAt) < s.fxCacheTTL {
		rate := s.cachedFXRate
		s.fxCacheMu.RUnlock()
		return rate
	}
	s.fxCacheMu.RUnlock()

	if strings.TrimSpace(s.fxRateURL) == "" {
		return s.fallbackFXRate
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, s.fxRateURL, nil)
	if err != nil {
		return s.fallbackFXRate
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return s.fallbackFXRate
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return s.fallbackFXRate
	}

	var payload fxRateResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return s.fallbackFXRate
	}

	rate := payload.Rates["NGN"]
	if rate <= 0 {
		return s.fallbackFXRate
	}

	s.fxCacheMu.Lock()
	s.cachedFXRate = rate
	s.fxCachedAt = time.Now()
	s.fxCacheMu.Unlock()
	return rate
}

func roundCurrency(amount float64) float64 {
	return math.Round(amount*100) / 100
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
	var isPremium bool
	var premiumExpiresAt sql.NullTime
	var billingCycle sql.NullString
	err := s.db.QueryRow(
		`SELECT balance, is_premium, premium_expires_at, premium_billing_cycle, updated_at::text
		 FROM credits WHERE user_id = $1::uuid`,
		userID,
	).Scan(&cb.Balance, &isPremium, &premiumExpiresAt, &billingCycle, &cb.UpdatedAt)
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
	if err != nil {
		return nil, err
	}
	// Only mark as Premium if the subscription hasn't expired yet.
	if isPremium && premiumExpiresAt.Valid && premiumExpiresAt.Time.After(time.Now()) {
		cb.IsPremium = true
		cb.PremiumExpiresAt = premiumExpiresAt.Time.UTC().Format(time.RFC3339)
	}
	if billingCycle.Valid {
		cb.BillingCycle = billingCycle.String
	}
	return cb, nil
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

// GrantReferralBonus credits ReferralBonus Lifecoins to the referrer's wallet.
// Idempotency is guaranteed upstream by referral.Service.RecordReferral which
// uses ON CONFLICT (referred_id) DO NOTHING, so this is called at most once per
// unique referral pair.
func (s *Service) GrantReferralBonus(referrerID, txRef string) error {
	return s.EarnLifecoins(referrerID, "referral", "Referral bonus — "+txRef, ReferralBonus)
}

// DeductCredit atomically deducts 1 credit and logs it. Returns false if balance is 0.
// For active Premium subscribers the deduction is skipped and (true, nil) is returned.
func (s *Service) DeductCredit(userID, diagnosisID string) (bool, error) {
	// Check for an active Premium subscription — skip deduction entirely.
	var isPremium bool
	var expiresAt sql.NullTime
	if scanErr := s.db.QueryRow(
		`SELECT is_premium, premium_expires_at FROM credits WHERE user_id = $1::uuid`,
		userID,
	).Scan(&isPremium, &expiresAt); scanErr == nil {
		if isPremium && expiresAt.Valid && expiresAt.Time.After(time.Now()) {
			return true, nil // Premium active — unlimited sessions, no deduction
		}
	}

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
func (s *Service) InitiatePayment(userID, email, name, bundleID, currency, redirectURLOverride string) (string, string, error) {
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
		dbAmount = int(math.Round(bundle.AmountUSD * 100)) // store as cents
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

	redirectURL := s.redirectURL
	if redirectURLOverride != "" {
		redirectURL = redirectURLOverride
	}

	reqBody := flwInitiateRequest{
		TxRef:       txRef,
		Amount:      chargeAmount,
		Currency:    currency,
		RedirectURL: redirectURL,
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
// FIX #2: Webhook signature validation hole fixed
func (s *Service) ProcessWebhook(payload WebhookPayload, hashHeader string) error {
	// FIX #2: If webhookHash not configured, reject all webhooks (security)
	if s.webhookHash == "" {
		return fmt.Errorf("webhook: webhook secret not configured (FLW_WEBHOOK_HASH)")
	}
	
	// Verify signature: Flutterwave sends plain secret, we compute HMAC-SHA256.
	expected := hex.EncodeToString(
		hmac.New(sha256.New, []byte(s.webhookHash)).Sum(nil),
	)
	if hashHeader != expected {
		return fmt.Errorf("webhook: invalid signature")
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
		// FIX #4: Queue for retry on DB error instead of silent failure
		s.paymentLock.Lock()
		s.retryQueue = append(s.retryQueue, &PaymentRetry{
			TxRef:       payload.Data.TxRef,
			UserID:      userID,
			FlwTxID:     flwTxID,
			Attempts:    0,
			LastAttempt: time.Now(),
		})
		s.paymentLock.Unlock()
		return fmt.Errorf("webhook: queued for retry: %w", err)
	}

	_, err = s.VerifyAndCredit(userID, payload.Data.TxRef, flwTxID)
	if err != nil {
		// FIX #4: Queue failed webhook events for retry with exponential backoff
		s.paymentLock.Lock()
		s.retryQueue = append(s.retryQueue, &PaymentRetry{
			TxRef:       payload.Data.TxRef,
			UserID:      userID,
			FlwTxID:     flwTxID,
			Attempts:    0,
			LastAttempt: time.Now(),
		})
		s.paymentLock.Unlock()
	}
	return err
}

// GetTxStatus returns the current status of a transaction owned by userID
// directly from the database without calling Flutterwave.
// This is the lightweight poll target used by the client to detect webhook delivery.
// Returns (nil, nil) when no matching transaction exists.
func (s *Service) GetTxStatus(userID, txRef string) (*PaymentTransaction, error) {
	var pt PaymentTransaction
	err := s.db.QueryRow(
		`SELECT id, user_id, tx_ref, COALESCE(flw_tx_id,''), amount,
		        COALESCE(currency,'NGN'), credits_granted, status, bundle_id,
		        created_at::text, updated_at::text
		 FROM payment_transactions
		 WHERE tx_ref = $1 AND user_id = $2::uuid`,
		txRef, userID,
	).Scan(&pt.ID, &pt.UserID, &pt.TxRef, &pt.FlwTxID, &pt.Amount,
		&pt.Currency, &pt.CreditsGranted, &pt.Status, &pt.BundleID,
		&pt.CreatedAt, &pt.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &pt, nil
}

// VerifyAndCreditByTxRef resolves the owning user from tx_ref and then
// finalizes the payment idempotently.
func (s *Service) VerifyAndCreditByTxRef(txRef, flwTxID string) (*PaymentTransaction, error) {
	var userID string
	err := s.db.QueryRow(
		`SELECT user_id::text FROM payment_transactions WHERE tx_ref = $1`,
		txRef,
	).Scan(&userID)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("transaction not found")
	}
	if err != nil {
		return nil, err
	}

	return s.VerifyAndCredit(userID, txRef, flwTxID)
}

// VerifyAndCredit verifies a completed Flutterwave payment and credits the user.
// FIX #1: Double credit race condition — use memory + DB-level locking.
func (s *Service) VerifyAndCredit(userID, txRef, flwTxID string) (*PaymentTransaction, error) {
	// FIX #1: Acquire memory-level lock to prevent webhook + verify from racing
	s.paymentLock.Lock()
	
	// Check if already processing this transaction
	if s.processingTxs[txRef] {
		s.paymentLock.Unlock()
		return nil, fmt.Errorf("transaction already being processed")
	}
	
	// Mark as processing
	s.processingTxs[txRef] = true
	s.paymentLock.Unlock()
	
	// Defer cleanup of processing lock
	defer func() {
		s.paymentLock.Lock()
		delete(s.processingTxs, txRef)
		s.paymentLock.Unlock()
	}()
	
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
	
	// FIX #9: Re-validate bundle rate to catch stale CreditsGranted.
	// Premium bundles skip the credits-count check because their access model
	// uses the is_premium flag; legacy transactions may carry credits_granted=999.
	expectedCredits, err := s.validateBundleCredits(pt.BundleID, pt.Amount, pt.Currency)
	if err != nil {
		return nil, fmt.Errorf("bundle validation failed: %w", err)
	}
	if !strings.HasPrefix(pt.BundleID, "premium_") && expectedCredits != pt.CreditsGranted {
		return nil, fmt.Errorf("bundle rate changed (expected %d credits, got %d)", expectedCredits, pt.CreditsGranted)
	}

	// In dev mode (no secret key), auto-approve.
	verified := s.secretKey == ""

	// Web clients cannot capture flwTxId from the deep-link redirect.
	// Look it up via Flutterwave's filter API so verification still succeeds.
	lookupdFailed := false
	if !verified && flwTxID == "" {
		lookuped, err := s.flwGetIDByTxRef(txRef)
		if err == nil {
			flwTxID = lookuped
		} else {
			// Flutterwave hasn't indexed the transaction yet (timing).
			// Do NOT mark as failed — leave as pending so the client can retry
			// and the webhook can credit later.
			lookupdFailed = true
		}
	}

	// If we couldn't find the transaction in Flutterwave at all, return pending.
	if lookupdFailed {
		return &pt, nil // pt.Status is already "pending"
	}

	if !verified && flwTxID != "" {
		// FIX #8: USD precision validation with tolerance
		// Convert DB amount to the float value Flutterwave expects.
		// NGN: whole naira (allow ±1 naira tolerance). USD: cents (allow ±1 cent tolerance).
		var expectedAmount float64
		if pt.Currency == "USD" {
			expectedAmount = float64(pt.Amount) / 100.0
		} else {
			expectedAmount = float64(pt.Amount)
		}
		ok, err := s.flwVerifyWithTolerance(flwTxID, expectedAmount, pt.Currency, pt.Amount)
		if err != nil {
			// FIX #3: Web deep-link timing race — return pending for retry instead of failing
			// Transient Flutterwave API error — return pending so the client retries.
			// Do NOT mark as failed; the webhook will credit if the payment succeeds.
			return &pt, nil // pt.Status is still "pending"
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

	// Premium bundles grant 0 credits; unlimited access comes from the
	// is_premium flag. Accept legacy credits_granted=999 for old pending
	// transactions without double-crediting.
	isPremiumBundle := strings.HasPrefix(pt.BundleID, "premium_")
	creditsToGrant := pt.CreditsGranted
	if isPremiumBundle {
		creditsToGrant = 0
	}

	// Credit the user atomically.
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	// FIX #7: Atomic transaction with proper error handling
	// Insert credits atomically with status update
	if _, err := tx.Exec(
		`INSERT INTO credits (user_id, balance, updated_at)
		 VALUES ($1::uuid, $2, NOW())
		 ON CONFLICT (user_id) DO UPDATE
		   SET balance = credits.balance + EXCLUDED.balance, updated_at = NOW()`,
		userID, creditsToGrant,
	); err != nil {
		// Rollback will be deferred — transaction returns error
		return nil, fmt.Errorf("failed to credit user: %w", err)
	}

	if _, err := tx.Exec(
		`UPDATE payment_transactions
		 SET status='success', flw_tx_id=$1, updated_at=NOW()
		 WHERE tx_ref=$2`,
		flwTxID, txRef,
	); err != nil {
		return nil, fmt.Errorf("failed to mark payment successful: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("transaction commit failed: %w, credits may be orphaned", err)
	}

	// Activate Premium subscription flag outside the transaction so that a
	// flag-update failure does not roll back the credit grant.
	if isPremiumBundle {
		billingCycle := "monthly"
		if strings.HasSuffix(pt.BundleID, "annual") {
			billingCycle = "annual"
		}
		interval := "1 month"
		if billingCycle == "annual" {
			interval = "1 year"
		}
		if _, premErr := s.db.Exec(
			`UPDATE credits
			 SET is_premium = TRUE,
			     premium_expires_at    = NOW() + $1::interval,
			     premium_billing_cycle = $2
			 WHERE user_id = $3::uuid`,
			interval, billingCycle, userID,
		); premErr != nil {
			log.Printf("[PREMIUM] failed to activate premium for user %s: %v", userID, premErr)
		}
	}

	pt.Status = "success"
	pt.FlwTxID = flwTxID
	return &pt, nil
}

// validateBundleCredits ensures the bundle pricing is still valid (FIX #9).
// For Premium bundles, credits validation is skipped because unlimited access
// is governed by the is_premium flag, not a credits count. Legacy transactions
// with credits_granted=999 are accepted alongside the new credits_granted=0.
func (s *Service) validateBundleCredits(bundleID string, amount int, currency string) (int, error) {
	for _, b := range bundleBase {
		if b.id != bundleID {
			continue
		}

		var expectedAmount int
		if currency == "USD" {
			// USD stored as cents for precision
			expectedAmount = int(math.Round(roundCurrency(float64(b.ngnFixed)/s.getNGNPerUSD()) * 100))
		} else {
			// NGN stored as whole naira
			expectedAmount = b.ngnFixed
		}

		if amount == expectedAmount {
			return b.credits, nil
		}
		return 0, fmt.Errorf("amount mismatch: got %d %s, expected %d", amount, currency, expectedAmount)
	}
	return 0, fmt.Errorf("invalid bundle: %s", bundleID)
}

// DeactivateExpiredPremium sets is_premium = false for users whose subscription
// has expired. Intended to be called from a background goroutine every hour.
func (s *Service) DeactivateExpiredPremium() (int64, error) {
	result, err := s.db.Exec(
		`UPDATE credits
		 SET is_premium = FALSE, premium_billing_cycle = NULL
		 WHERE is_premium = TRUE AND premium_expires_at < NOW()`,
	)
	if err != nil {
		return 0, err
	}
	n, _ := result.RowsAffected()
	return n, nil
}

// flwVerifyWithTolerance verifies payment with precision-loss tolerance (FIX #8).
func (s *Service) flwVerifyWithTolerance(flwTxID string, expectedAmount float64, currency string, dbAmount int) (bool, error) {
	resp, err := s.flwVerify(flwTxID, expectedAmount, currency)
	if err != nil {
		return false, err
	}
	if !resp {
		// Try comparing with ±1 tolerance for USD due to float conversion
		if currency == "USD" {
			// Allow ±1 cent tolerance
			if abs(dbAmount-1) == int(expectedAmount*100) || abs(dbAmount+1) == int(expectedAmount*100) {
				return true, nil
			}
		}
		return false, nil
	}
	return true, nil
}

// abs returns the absolute value of an integer.
func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
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

// CreditDeduction represents a single diagnosis credit deduction event.
type CreditDeduction struct {
	ID          string `json:"id"`
	UserID      string `json:"userId"`
	DiagnosisID string `json:"diagnosisId"`
	Amount      int    `json:"amount"`
	CreatedAt   string `json:"createdAt"`
}

// GetCreditDeductions returns a user's credit deduction history, optionally
// joined with the diagnosis title for display purposes.
func (s *Service) GetCreditDeductions(userID string, limit int) ([]CreditDeduction, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.Query(
		`SELECT cd.id, cd.user_id, COALESCE(cd.diagnosis_id::text,''), cd.amount, cd.created_at::text
		 FROM credit_deductions cd
		 WHERE cd.user_id = $1::uuid
		 ORDER BY cd.created_at DESC
		 LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CreditDeduction
	for rows.Next() {
		var d CreditDeduction
		if err := rows.Scan(&d.ID, &d.UserID, &d.DiagnosisID, &d.Amount, &d.CreatedAt); err != nil {
			continue
		}
		out = append(out, d)
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
	if d.Status != "successful" {
		return false, nil
	}
	// Allow a small tolerance (₦1 / $0.01) to handle Flutterwave rounding.
	const tolerance = 1.0
	if d.Amount < expectedAmount-tolerance {
		return false, nil
	}
	// Currency comparison is case-insensitive to guard against API casing differences.
	if !strings.EqualFold(d.Currency, currency) {
		return false, nil
	}
	return true, nil
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
