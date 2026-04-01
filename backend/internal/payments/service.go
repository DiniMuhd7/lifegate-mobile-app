package payments

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Credit bundles: bundleID → {amount in kobo, credits granted}
var Bundles = map[string]Bundle{
	"2000":  {ID: "2000", AmountNaira: 2000, Credits: 5, Label: "₦2,000 — 5 Diagnoses"},
	"5000":  {ID: "5000", AmountNaira: 5000, Credits: 15, Label: "₦5,000 — 15 Diagnoses"},
	"10000": {ID: "10000", AmountNaira: 10000, Credits: 40, Label: "₦10,000 — 40 Diagnoses"},
}

type Bundle struct {
	ID          string `json:"id"`
	AmountNaira int    `json:"amountNaira"`
	Credits     int    `json:"credits"`
	Label       string `json:"label"`
}

// PaymentTransaction is the DB row shape.
type PaymentTransaction struct {
	ID             string `json:"id"`
	UserID         string `json:"userId"`
	TxRef          string `json:"txRef"`
	FlwTxID        string `json:"flwTxId,omitempty"`
	Amount         int    `json:"amount"`
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
	TxRef       string `json:"tx_ref"`
	Amount      int    `json:"amount"`
	Currency    string `json:"currency"`
	RedirectURL string `json:"redirect_url"`
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
		ID       int    `json:"id"`
		TxRef    string `json:"tx_ref"`
		Amount   int    `json:"amount"`
		Currency string `json:"currency"`
		Status   string `json:"status"` // "successful" | "failed" | "pending"
	} `json:"data"`
}

const flwBaseURL = "https://api.flutterwave.com/v3"

// TrialCredits is the number of free credits granted to every new patient account.
const TrialCredits = 3

// Service handles payment operations.
type Service struct {
	db          *sql.DB
	secretKey   string
	publicKey   string
	redirectURL string
}

func NewService(db *sql.DB, secretKey, publicKey, redirectURL string) *Service {
	return &Service{db: db, secretKey: secretKey, publicKey: publicKey, redirectURL: redirectURL}
}

// GetBundles returns all available credit bundles.
func (s *Service) GetBundles() []Bundle {
	out := make([]Bundle, 0, len(Bundles))
	for _, b := range Bundles {
		out = append(out, b)
	}
	return out
}

// GetCreditBalance fetches a user's wallet balance (creates row if absent).
func (s *Service) GetCreditBalance(userID string) (*CreditBalance, error) {
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

// GrantTrialCredits inserts TrialCredits into a new user's wallet and records it
// in payment_transactions so it appears in the transaction history.
// It is idempotent: if a credits row already exists the INSERT is skipped.
func (s *Service) GrantTrialCredits(userID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// Create the credits wallet with the trial balance.  ON CONFLICT DO NOTHING
	// ensures we never double-grant if this is somehow called twice.
	var inserted bool
	err = tx.QueryRow(
		`INSERT INTO credits (user_id, balance)
		 VALUES ($1::uuid, $2)
		 ON CONFLICT (user_id) DO NOTHING
		 RETURNING true`,
		userID, TrialCredits,
	).Scan(&inserted)
	if err == sql.ErrNoRows {
		// Row already existed — do not grant again.
		return tx.Commit()
	}
	if err != nil {
		return err
	}

	// Log the trial grant so it is visible in the transaction history.
	if _, err := tx.Exec(
		`INSERT INTO payment_transactions
		   (user_id, tx_ref, amount, credits_granted, status, bundle_id)
		 VALUES ($1::uuid, $2, 0, $3, 'success', 'trial')`,
		userID,
		fmt.Sprintf("TRIAL-%s", userID[:8]),
		TrialCredits,
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
func (s *Service) InitiatePayment(userID, email, name, bundleID string) (string, string, error) {
	bundle, ok := Bundles[bundleID]
	if !ok {
		return "", "", fmt.Errorf("unknown bundle: %s", bundleID)
	}

	txRef := fmt.Sprintf("LG-%s-%d", userID[:8], time.Now().UnixMilli())

	// Persist pending transaction.
	if _, err := s.db.Exec(
		`INSERT INTO payment_transactions
		   (user_id, tx_ref, amount, credits_granted, status, bundle_id)
		 VALUES ($1::uuid, $2, $3, $4, 'pending', $5)`,
		userID, txRef, bundle.AmountNaira, bundle.Credits, bundleID,
	); err != nil {
		return "", "", err
	}

	// Skip real Flutterwave call if no secret key configured (test / dev mode).
	if s.secretKey == "" {
		devLink := fmt.Sprintf("lifegate://payment/dev?tx_ref=%s&bundle=%s", txRef, bundleID)
		return txRef, devLink, nil
	}

	reqBody := flwInitiateRequest{
		TxRef:       txRef,
		Amount:      bundle.AmountNaira,
		Currency:    "NGN",
		RedirectURL: s.redirectURL,
	}
	reqBody.Customer.Email = email
	reqBody.Customer.Name = name
	reqBody.Customizations.Title = "LifeGate Credits"
	reqBody.Customizations.Description = bundle.Label

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

// VerifyAndCredit verifies a completed Flutterwave payment and credits the user.
func (s *Service) VerifyAndCredit(userID, txRef, flwTxID string) (*PaymentTransaction, error) {
	var pt PaymentTransaction
	err := s.db.QueryRow(
		`SELECT id, user_id, tx_ref, amount, credits_granted, status, bundle_id,
		        created_at::text, updated_at::text
		 FROM payment_transactions WHERE tx_ref = $1 AND user_id = $2::uuid`,
		txRef, userID,
	).Scan(&pt.ID, &pt.UserID, &pt.TxRef, &pt.Amount, &pt.CreditsGranted,
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
	if !verified && flwTxID != "" {
		ok, err := s.flwVerify(flwTxID, pt.Amount)
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
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.Query(
		`SELECT id, user_id, tx_ref, COALESCE(flw_tx_id,''), amount,
		        credits_granted, status, bundle_id,
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
			&pt.Amount, &pt.CreditsGranted, &pt.Status, &pt.BundleID,
			&pt.CreatedAt, &pt.UpdatedAt); err != nil {
			continue
		}
		out = append(out, pt)
	}
	return out, rows.Err()
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

	resp, err := http.DefaultClient.Do(httpReq)
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

func (s *Service) flwVerify(flwTxID string, expectedAmount int) (bool, error) {
	httpReq, err := http.NewRequestWithContext(
		context.Background(), http.MethodGet,
		flwBaseURL+"/transactions/"+flwTxID+"/verify", nil,
	)
	if err != nil {
		return false, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.secretKey)

	resp, err := http.DefaultClient.Do(httpReq)
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
	return d.Status == "successful" && d.Amount >= expectedAmount && d.Currency == "NGN", nil
}
