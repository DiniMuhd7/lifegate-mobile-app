package payments

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"
)

// NairaPer Coin is the default Naira value for one Lifecoin.
// The live value is read from the lifecoins_config table; this constant is the
// hard fallback if the DB row is missing.
const defaultNairaPerCoin = 50

// LifecoinTransaction represents one row from lifecoins_transactions.
type LifecoinTransaction struct {
	ID             string  `json:"id"`
	Type           string  `json:"type"`            // "earn" | "redeem"
	Source         string  `json:"source"`          // checkin | survey | offer | explore | referral | redeem
	Coins          int     `json:"coins"`
	NairaAmount    int     `json:"nairaAmount"`
	Description    string  `json:"description"`
	HealthFirmName *string `json:"healthFirmName,omitempty"`
	AccountNumber  *string `json:"accountNumber,omitempty"`
	BankName       *string `json:"bankName,omitempty"`
	TransferStatus string  `json:"transferStatus"`
	CreatedAt      string  `json:"createdAt"`
}

// LifecoinBalance is the response shape for GET /lifecoins/balance.
type LifecoinBalance struct {
	Balance      int `json:"balance"`
	TotalEarned  int `json:"totalEarned"`
	NairaPerCoin int `json:"nairaPerCoin"`
	// NairaValue is balance × NairaPerCoin — a convenience field.
	NairaValue int `json:"nairaValue"`
}

// LifecoinRedeemRequest is the body for POST /lifecoins/redeem.
type LifecoinRedeemRequest struct {
	Coins          int    `json:"coins"           binding:"required,min=100"`
	HealthFirmName string `json:"healthFirmName"  binding:"required"`
	AccountNumber  string `json:"accountNumber"   binding:"required"`
	BankCode       string `json:"bankCode"        binding:"required"`
	BankName       string `json:"bankName"        binding:"required"`
}

// flwTransferRequest is the body sent to the Flutterwave Transfers API.
type flwTransferRequest struct {
	AccountBank string  `json:"account_bank"`
	AccountNumber string `json:"account_number"`
	Amount      float64 `json:"amount"`
	Narration   string  `json:"narration"`
	Currency    string  `json:"currency"`
	Reference   string  `json:"reference"`
	CallbackURL string  `json:"callback_url,omitempty"`
	DebitCurrency string `json:"debit_currency,omitempty"`
}

type flwTransferResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Data    struct {
		ID        int    `json:"id"`
		Reference string `json:"reference"`
		Status    string `json:"status"`
	} `json:"data"`
}

// getNairaPerCoin reads the naira_per_coin configuration value from the DB.
func (s *Service) getNairaPerCoin() int {
	var val string
	err := s.db.QueryRow(`SELECT value FROM lifecoins_config WHERE key = 'naira_per_coin'`).Scan(&val)
	if err != nil {
		return defaultNairaPerCoin
	}
	var n int
	if _, err := fmt.Sscanf(val, "%d", &n); err != nil || n <= 0 {
		return defaultNairaPerCoin
	}
	return n
}

// ensureLifecoinWallet creates the wallet row for a user if it doesn't exist.
func (s *Service) ensureLifecoinWallet(userID string) error {
	_, err := s.db.Exec(
		`INSERT INTO lifecoins_wallet (user_id, balance, total_earned)
		 VALUES ($1::uuid, 0, 0)
		 ON CONFLICT (user_id) DO NOTHING`,
		userID,
	)
	return err
}

// GetLifecoinBalance returns the user's current Lifecoin wallet balance.
func (s *Service) GetLifecoinBalance(userID string) (*LifecoinBalance, error) {
	if err := s.ensureLifecoinWallet(userID); err != nil {
		return nil, err
	}
	bal := &LifecoinBalance{}
	err := s.db.QueryRow(
		`SELECT balance, total_earned FROM lifecoins_wallet WHERE user_id = $1::uuid`,
		userID,
	).Scan(&bal.Balance, &bal.TotalEarned)
	if err != nil {
		return nil, err
	}
	bal.NairaPerCoin = s.getNairaPerCoin()
	bal.NairaValue = bal.Balance * bal.NairaPerCoin
	return bal, nil
}

// AddLifecoins credits coins to a user's wallet and records the transaction.
// source examples: "checkin", "survey", "offer", "explore", "referral"
func (s *Service) AddLifecoins(userID, source, description string, coins int) error {
	if coins <= 0 {
		return nil
	}
	if err := s.ensureLifecoinWallet(userID); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	nairaPerCoin := s.getNairaPerCoin()
	nairaAmount := coins * nairaPerCoin

	if _, err := tx.Exec(
		`UPDATE lifecoins_wallet
		 SET balance = balance + $2, total_earned = total_earned + $2, updated_at = NOW()
		 WHERE user_id = $1::uuid`,
		userID, coins,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`INSERT INTO lifecoins_transactions
		 (user_id, type, source, coins, naira_amount, description, transfer_status)
		 VALUES ($1::uuid, 'earn', $2, $3, $4, $5, 'success')`,
		userID, source, coins, nairaAmount, description,
	); err != nil {
		return err
	}
	return tx.Commit()
}

// RedeemLifecoins deducts coins from the wallet and initiates a Flutterwave
// transfer to the health firm's bank account (health insurance waiver).
func (s *Service) RedeemLifecoins(userID string, req LifecoinRedeemRequest) (*LifecoinTransaction, error) {
	if err := s.ensureLifecoinWallet(userID); err != nil {
		return nil, err
	}

	// 1. Check balance.
	var balance int
	if err := s.db.QueryRow(
		`SELECT balance FROM lifecoins_wallet WHERE user_id = $1::uuid`,
		userID,
	).Scan(&balance); err != nil {
		return nil, fmt.Errorf("could not read wallet balance: %w", err)
	}
	if balance < req.Coins {
		return nil, fmt.Errorf("insufficient balance: have %d Lifecoins, need %d", balance, req.Coins)
	}

	nairaPerCoin := s.getNairaPerCoin()
	nairaAmount := req.Coins * nairaPerCoin
	// Round to nearest ₦100 for clean bank transfer amounts.
	nairaAmount = int(math.Round(float64(nairaAmount)/100) * 100)
	if nairaAmount < 100 {
		nairaAmount = 100
	}

	// 2. Create pending transaction row first so we have an ID.
	txRef := fmt.Sprintf("LC-REDEEM-%s-%d", userID[:8], time.Now().UnixNano())
	var txID string
	err := s.db.QueryRow(
		`INSERT INTO lifecoins_transactions
		 (user_id, type, source, coins, naira_amount, description,
		  health_firm_name, account_number, bank_code, bank_name,
		  flw_transfer_ref, transfer_status)
		 VALUES ($1::uuid, 'redeem', 'redeem', $2, $3,
		         'Health waiver — ' || $4,
		         $4, $5, $6, $7, $8, 'processing')
		 RETURNING id::text`,
		userID, req.Coins, nairaAmount,
		req.HealthFirmName, req.AccountNumber, req.BankCode, req.BankName,
		txRef,
	).Scan(&txID)
	if err != nil {
		return nil, fmt.Errorf("failed to record transaction: %w", err)
	}

	// 3. Deduct from wallet immediately (optimistic; reversed if transfer fails).
	if _, err := s.db.Exec(
		`UPDATE lifecoins_wallet SET balance = balance - $2, updated_at = NOW()
		 WHERE user_id = $1::uuid`,
		userID, req.Coins,
	); err != nil {
		// Best-effort: mark tx as failed but don't leave balance inconsistent.
		_, _ = s.db.Exec(
			`UPDATE lifecoins_transactions SET transfer_status = 'failed' WHERE id = $1::uuid`,
			txID,
		)
		return nil, fmt.Errorf("failed to deduct coins: %w", err)
	}

	// 4. Initiate Flutterwave transfer (fire-and-forget; status updated via webhook or polling).
	go s.initiateFlwTransfer(txID, userID, req, nairaAmount, txRef)

	return &LifecoinTransaction{
		ID:             txID,
		Type:           "redeem",
		Source:         "redeem",
		Coins:          req.Coins,
		NairaAmount:    nairaAmount,
		Description:    "Health waiver — " + req.HealthFirmName,
		HealthFirmName: &req.HealthFirmName,
		AccountNumber:  &req.AccountNumber,
		BankName:       &req.BankName,
		TransferStatus: "processing",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// initiateFlwTransfer calls the Flutterwave Transfers API and updates the
// transaction row with the result. Runs in a goroutine.
func (s *Service) initiateFlwTransfer(txID, userID string, req LifecoinRedeemRequest, nairaAmount int, ref string) {
	body := flwTransferRequest{
		AccountBank:   req.BankCode,
		AccountNumber: req.AccountNumber,
		Amount:        float64(nairaAmount),
		Narration:     fmt.Sprintf("LifeGate health waiver — %s", req.HealthFirmName),
		Currency:      "NGN",
		Reference:     ref,
		DebitCurrency: "NGN",
	}
	payload, err := json.Marshal(body)
	if err != nil {
		s.markTransferFailed(txID, userID, req.Coins)
		return
	}

	httpReq, err := http.NewRequest(http.MethodPost, flwBaseURL+"/transfers", bytes.NewReader(payload))
	if err != nil {
		s.markTransferFailed(txID, userID, req.Coins)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+s.secretKey)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		s.markTransferFailed(txID, userID, req.Coins)
		return
	}
	defer resp.Body.Close()

	var flwResp flwTransferResponse
	if err := json.NewDecoder(resp.Body).Decode(&flwResp); err != nil {
		s.markTransferFailed(txID, userID, req.Coins)
		return
	}

	if flwResp.Status != "success" && flwResp.Status != "Success" {
		s.markTransferFailed(txID, userID, req.Coins)
		return
	}

	// Update to success.
	_, _ = s.db.Exec(
		`UPDATE lifecoins_transactions SET transfer_status = 'success' WHERE id = $1::uuid`,
		txID,
	)
}

// markTransferFailed marks the tx as failed and refunds the coins.
func (s *Service) markTransferFailed(txID, userID string, coins int) {
	_, _ = s.db.Exec(
		`UPDATE lifecoins_transactions SET transfer_status = 'failed' WHERE id = $1::uuid`,
		txID,
	)
	// Refund the coins.
	_, _ = s.db.Exec(
		`UPDATE lifecoins_wallet SET balance = balance + $2, updated_at = NOW()
		 WHERE user_id = $1::uuid`,
		userID, coins,
	)
}

// GetLifecoinTransactions returns paginated transaction history for a user.
func (s *Service) GetLifecoinTransactions(userID string, limit, offset int) ([]LifecoinTransaction, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.db.Query(
		`SELECT id::text, type, source, coins, naira_amount, description,
		        health_firm_name, account_number, bank_name, transfer_status,
		        created_at::text
		 FROM lifecoins_transactions
		 WHERE user_id = $1::uuid
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []LifecoinTransaction
	for rows.Next() {
		var lt LifecoinTransaction
		if err := rows.Scan(
			&lt.ID, &lt.Type, &lt.Source, &lt.Coins, &lt.NairaAmount,
			&lt.Description, &lt.HealthFirmName, &lt.AccountNumber,
			&lt.BankName, &lt.TransferStatus, &lt.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, lt)
	}
	return out, rows.Err()
}

// SubmitCheckinAnswers persists a user's check-in answers for a slot.
func (s *Service) SubmitCheckinAnswers(userID string, slotID int, answers []map[string]interface{}) error {
	answersJSON, err := json.Marshal(answers)
	if err != nil {
		return err
	}
	today := time.Now().UTC().Format("2006-01-02")
	_, err = s.db.Exec(
		`INSERT INTO checkin_answers (user_id, slot_id, slot_date, answers)
		 VALUES ($1::uuid, $2, $3::date, $4::jsonb)
		 ON CONFLICT DO NOTHING`,
		userID, slotID, today, string(answersJSON),
	)
	return err
}
