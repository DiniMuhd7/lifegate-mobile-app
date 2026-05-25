package payments

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"
)

// NairaPer Coin is the default Naira value for one Lifecoin.
// The live value is read from the lifecoins_config table; this constant is the
// hard fallback if the DB row is missing.
const defaultNairaPerCoin = 10

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

// ngnPerDxCredit is the Naira cost of one DX credit when purchased via LifeCoins.
// Derived from the Starter bundle rate (₦2,500 ÷ 5 credits = ₦500 per credit).
const ngnPerDxCredit = 500

// GetCoinsPerCredit returns the number of LifeCoins required to unlock one
// DX credit, calculated from the live naira_per_coin configuration.
func (s *Service) GetCoinsPerCredit() int {
	nairaPerCoin := s.getNairaPerCoin()
	if nairaPerCoin <= 0 {
		nairaPerCoin = defaultNairaPerCoin
	}
	// Ceiling division: always round up so the patient pays at least full value.
	return (ngnPerDxCredit + nairaPerCoin - 1) / nairaPerCoin
}

// SpendLifecoinsForDxCredit atomically deducts the LifeCoins equivalent of one
// DX credit from the patient's wallet and grants them 1 DX credit.
// Returns the number of coins deducted so the caller can confirm the transaction
// in the response. Returns an "insufficient balance" error (detected by
// isInsufficientBalance) when the wallet cannot cover the cost.
func (s *Service) SpendLifecoinsForDxCredit(userID string) (coinsDeducted int, err error) {
	if err := s.ensureLifecoinWallet(userID); err != nil {
		return 0, err
	}

	coinsNeeded := s.GetCoinsPerCredit()
	nairaPerCoin := s.getNairaPerCoin()
	nairaAmount := coinsNeeded * nairaPerCoin

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	// Atomically deduct coins — only succeeds when balance >= coinsNeeded.
	var newBalance int
	if scanErr := tx.QueryRow(
		`UPDATE lifecoins_wallet
		 SET balance = balance - $2, updated_at = NOW()
		 WHERE user_id = $1::uuid AND balance >= $2
		 RETURNING balance`,
		userID, coinsNeeded,
	).Scan(&newBalance); scanErr == sql.ErrNoRows {
		return 0, fmt.Errorf("insufficient balance: need %d LifeCoins to unlock a Dx Credit", coinsNeeded)
	} else if scanErr != nil {
		return 0, scanErr
	}

	// Record the spend in the LifeCoins ledger.
	if _, execErr := tx.Exec(
		`INSERT INTO lifecoins_transactions
		 (user_id, type, source, coins, naira_amount, description, transfer_status)
		 VALUES ($1::uuid, 'redeem', 'dx_credit', $2, $3, 'Dx Credit — paid via LifeCoins', 'success')`,
		userID, coinsNeeded, nairaAmount,
	); execErr != nil {
		return 0, execErr
	}

	// Record in payment_transactions so the credits ledger reconciles correctly.
	txRef := fmt.Sprintf("LC-DX-%s-%d", userID[:8], time.Now().UnixNano())
	if _, execErr := tx.Exec(
		`INSERT INTO payment_transactions
		 (user_id, tx_ref, amount, credits_granted, status, bundle_id, currency)
		 VALUES ($1::uuid, $2, $3, 1, 'success', 'lifecoin_dx', 'NGN')`,
		userID, txRef, nairaAmount,
	); execErr != nil {
		return 0, execErr
	}

	// Grant 1 DX credit to the user's credits wallet.
	if _, execErr := tx.Exec(
		`INSERT INTO credits (user_id, balance, updated_at)
		 VALUES ($1::uuid, 1, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET balance = credits.balance + 1, updated_at = NOW()`,
		userID,
	); execErr != nil {
		return 0, execErr
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return coinsNeeded, nil
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

// EarnLifecoins awards Lifecoins for user-driven activities, doubling the
// amount for active Premium subscribers. Use this instead of AddLifecoins for
// all player-facing earning events (explore, check-in, referral, etc.).
func (s *Service) EarnLifecoins(userID, source, description string, baseCoins int) error {
	coins := baseCoins
	var isPremium bool
	var expiresAt *time.Time
	if err := s.db.QueryRow(
		`SELECT is_premium, premium_expires_at FROM credits WHERE user_id = $1::uuid`,
		userID,
	).Scan(&isPremium, &expiresAt); err == nil {
		if isPremium && expiresAt != nil && expiresAt.After(time.Now()) {
			coins = baseCoins * 2
		}
	}
	return s.AddLifecoins(userID, source, description, coins)
}

// PendingRedemption is the shape returned for the admin approval queue.
type PendingRedemption struct {
	ID             string  `json:"id"`
	UserID         string  `json:"userId"`
	PatientName    string  `json:"patientName"`
	PatientEmail   string  `json:"patientEmail"`
	Coins          int     `json:"coins"`
	NairaAmount    int     `json:"nairaAmount"`
	HealthFirmName string  `json:"healthFirmName"`
	AccountNumber  string  `json:"accountNumber"`
	BankCode       string  `json:"bankCode"`
	BankName       string  `json:"bankName"`
	TransferStatus string  `json:"transferStatus"`
	AdminNote      *string `json:"adminNote,omitempty"`
	CreatedAt      string  `json:"createdAt"`
}

// RedeemLifecoins reserves coins for admin review.
// Coins are NOT deducted yet — they are only deducted upon admin approval.
// The transaction is created with transfer_status = 'pending_approval'.
func (s *Service) RedeemLifecoins(userID string, req LifecoinRedeemRequest) (*LifecoinTransaction, error) {
	if err := s.ensureLifecoinWallet(userID); err != nil {
		return nil, err
	}

	// 1. Check balance (coins must be available to submit the request).
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

	// 2. Create transaction with pending_approval status.
	// Coins are NOT deducted — the wallet balance is unchanged until an admin approves.
	txRef := fmt.Sprintf("LC-REDEEM-%s-%d", userID[:8], time.Now().UnixNano())
	var txID string
	err := s.db.QueryRow(
		`INSERT INTO lifecoins_transactions
		 (user_id, type, source, coins, naira_amount, description,
		  health_firm_name, account_number, bank_code, bank_name,
		  flw_transfer_ref, transfer_status)
		 VALUES ($1::uuid, 'redeem', 'redeem', $2, $3,
		         'Health waiver — ' || $4,
		         $4, $5, $6, $7, $8, 'pending_approval')
		 RETURNING id::text`,
		userID, req.Coins, nairaAmount,
		req.HealthFirmName, req.AccountNumber, req.BankCode, req.BankName,
		txRef,
	).Scan(&txID)
	if err != nil {
		return nil, fmt.Errorf("failed to record transaction: %w", err)
	}

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
		TransferStatus: "pending_approval",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// GetPendingRedemptions returns all redemption requests awaiting admin approval.
func (s *Service) GetPendingRedemptions() ([]PendingRedemption, error) {
	rows, err := s.db.Query(
		`SELECT lt.id::text, lt.user_id::text,
		        COALESCE(u.name, ''), COALESCE(u.email, ''),
		        lt.coins, lt.naira_amount,
		        COALESCE(lt.health_firm_name, ''),
		        COALESCE(lt.account_number, ''),
		        COALESCE(lt.bank_code, ''),
		        COALESCE(lt.bank_name, ''),
		        lt.transfer_status,
		        lt.admin_note,
		        lt.created_at::text
		 FROM lifecoins_transactions lt
		 JOIN users u ON u.id = lt.user_id
		 WHERE lt.transfer_status = 'pending_approval'
		 ORDER BY lt.created_at ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PendingRedemption
	for rows.Next() {
		var r PendingRedemption
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.PatientName, &r.PatientEmail,
			&r.Coins, &r.NairaAmount,
			&r.HealthFirmName, &r.AccountNumber, &r.BankCode, &r.BankName,
			&r.TransferStatus, &r.AdminNote, &r.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ApproveRedemption approves a pending redemption: deducts coins, fires FLW transfer.
// adminID is stored for the audit trail.
func (s *Service) ApproveRedemption(adminID, txID string) (*PendingRedemption, error) {
	// Load the pending redemption.
	var r PendingRedemption
	err := s.db.QueryRow(
		`SELECT lt.id::text, lt.user_id::text,
		        COALESCE(u.name, ''), COALESCE(u.email, ''),
		        lt.coins, lt.naira_amount,
		        COALESCE(lt.health_firm_name, ''),
		        COALESCE(lt.account_number, ''),
		        COALESCE(lt.bank_code, ''),
		        COALESCE(lt.bank_name, ''),
		        lt.transfer_status,
		        lt.flw_transfer_ref
		 FROM lifecoins_transactions lt
		 JOIN users u ON u.id = lt.user_id
		 WHERE lt.id = $1::uuid AND lt.transfer_status = 'pending_approval'`,
		txID,
	).Scan(
		&r.ID, &r.UserID, &r.PatientName, &r.PatientEmail,
		&r.Coins, &r.NairaAmount,
		&r.HealthFirmName, &r.AccountNumber, &r.BankCode, &r.BankName,
		&r.TransferStatus, new(string),
	)
	if err != nil {
		return nil, fmt.Errorf("redemption not found or not pending: %w", err)
	}

	// Deduct coins from the wallet.
	result, err := s.db.Exec(
		`UPDATE lifecoins_wallet
		 SET balance = balance - $2, updated_at = NOW()
		 WHERE user_id = $1::uuid AND balance >= $2`,
		r.UserID, r.Coins,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deduct coins: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		// Mark as failed — patient no longer has enough coins.
		_, _ = s.db.Exec(
			`UPDATE lifecoins_transactions
			 SET transfer_status = 'failed', reviewed_by = $2::uuid, reviewed_at = NOW(),
			     admin_note = 'Insufficient balance at time of approval'
			 WHERE id = $1::uuid`,
			txID, adminID,
		)
		return nil, fmt.Errorf("insufficient balance: patient's coins may have changed")
	}

	// Mark as processing and record admin.
	_, err = s.db.Exec(
		`UPDATE lifecoins_transactions
		 SET transfer_status = 'processing', reviewed_by = $2::uuid, reviewed_at = NOW()
		 WHERE id = $1::uuid`,
		txID, adminID,
	)
	if err != nil {
		return nil, err
	}

	// Fire Flutterwave transfer asynchronously.
	req := LifecoinRedeemRequest{
		Coins:          r.Coins,
		HealthFirmName: r.HealthFirmName,
		AccountNumber:  r.AccountNumber,
		BankCode:       r.BankCode,
		BankName:       r.BankName,
	}
	txRef := fmt.Sprintf("LC-REDEEM-%s-%d", r.UserID[:8], time.Now().UnixNano())
	go s.initiateFlwTransfer(txID, r.UserID, req, r.NairaAmount, txRef)

	r.TransferStatus = "processing"
	return &r, nil
}

// RejectRedemption rejects a pending redemption. Coins are not deducted.
// adminID and note are recorded for the audit trail.
func (s *Service) RejectRedemption(adminID, txID, note string) error {
	result, err := s.db.Exec(
		`UPDATE lifecoins_transactions
		 SET transfer_status = 'rejected',
		     reviewed_by = $2::uuid,
		     reviewed_at = NOW(),
		     admin_note  = $3
		 WHERE id = $1::uuid AND transfer_status = 'pending_approval'`,
		txID, adminID, note,
	)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return fmt.Errorf("redemption not found or already reviewed")
	}
	return nil
}

// GetUserIDForRedemption returns the user_id for a redemption transaction.
// Used by the handler to send a push notification to the patient.
func (s *Service) GetUserIDForRedemption(txID string) (string, error) {
	var uid string
	err := s.db.QueryRow(
		`SELECT user_id::text FROM lifecoins_transactions WHERE id = $1::uuid`,
		txID,
	).Scan(&uid)
	return uid, err
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

// ClaimCheckinSlotResult carries what actually happened after a claim attempt.
type ClaimCheckinSlotResult struct {
	AlreadyClaimed  bool       `json:"alreadyClaimed"`
	CoinsEarned     int        `json:"coinsEarned"`    // base × multiplier
	BaseCoins       int        `json:"baseCoins"`
	BonusMultiplier int        `json:"bonusMultiplier"`
	Streak          *StreakInfo `json:"streak"`
}

// ClaimCheckinSlot awards Lifecoins for a daily check-in slot.
// It is idempotent: if the user already claimed this slot on the given date
// (user_id + slot_id + claim_date) the second call returns AlreadyClaimed=true.
// claimDate is optional (YYYY-MM-DD); if empty it defaults to today UTC.
// Streak is updated on the first claim of each calendar day; subsequent slot
// claims on the same day keep the same streak value.
func (s *Service) ClaimCheckinSlot(userID string, slotID, coins int, claimDate string) (*ClaimCheckinSlotResult, error) {
	if coins <= 0 {
		coins = 1
	}
	if claimDate == "" {
		claimDate = time.Now().UTC().Format("2006-01-02")
	}

	var claimed bool
	err := s.db.QueryRow(
		`INSERT INTO checkin_claims (user_id, slot_id, claim_date, coins)
		 VALUES ($1::uuid, $2, $3::date, $4)
		 ON CONFLICT (user_id, slot_id, claim_date) DO NOTHING
		 RETURNING true`,
		userID, slotID, claimDate, coins,
	).Scan(&claimed)
	if err == sql.ErrNoRows {
		streak, _ := s.GetStreak(userID)
		return &ClaimCheckinSlotResult{AlreadyClaimed: true, Streak: streak}, nil
	}
	if err != nil {
		return nil, err
	}

	// Advance the server streak and compute the multiplier.
	streak, err := s.updateStreak(userID, claimDate)
	if err != nil {
		// Non-fatal: streak failure must not prevent coin award.
		streak = &StreakInfo{CurrentStreak: 1, LongestStreak: 1,
			LastCheckinDate: claimDate, BonusMultiplier: 1}
	}

	// Apply the streak multiplier to the base coins.
	totalCoins := coins * streak.BonusMultiplier

	desc := fmt.Sprintf("Daily check-in — slot %d", slotID)
	if streak.BonusMultiplier > 1 {
		desc = fmt.Sprintf("Daily check-in — slot %d (×%d streak bonus, day %d)",
			slotID, streak.BonusMultiplier, streak.CurrentStreak)
	}

	if earnErr := s.EarnLifecoins(userID, "checkin", desc, totalCoins); earnErr != nil {
		return nil, earnErr
	}

	return &ClaimCheckinSlotResult{
		AlreadyClaimed:  false,
		CoinsEarned:     totalCoins,
		BaseCoins:       coins,
		BonusMultiplier: streak.BonusMultiplier,
		Streak:          streak,
	}, nil
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

// slotLabels maps slot IDs to human-readable names matching the mobile schedule.
var slotLabels = map[int]string{
	1: "Morning",
	3: "Noon",
	5: "Evening",
	6: "Night",
}

// ─── Streak ───────────────────────────────────────────────────────────────────

// StreakInfo is the public view of a patient's daily check-in streak.
type StreakInfo struct {
	CurrentStreak int    `json:"currentStreak"`
	LongestStreak int    `json:"longestStreak"`
	LastCheckinDate string `json:"lastCheckinDate"` // YYYY-MM-DD or ""
	BonusMultiplier int    `json:"bonusMultiplier"` // 1 = normal, 2 = 2×, etc.
}

// streakMultiplier returns the coins multiplier for the given streak length.
//
//	streak ≥ 30 → 5×   (month-long devotion)
//	streak ≥ 14 → 3×
//	streak ≥  7 → 2×
//	otherwise  → 1×
func streakMultiplier(streak int) int {
	switch {
	case streak >= 30:
		return 5
	case streak >= 14:
		return 3
	case streak >= 7:
		return 2
	default:
		return 1
	}
}

// GetStreak returns the server-authoritative streak for a user.
func (s *Service) GetStreak(userID string) (*StreakInfo, error) {
	var info StreakInfo
	var last sql.NullString
	err := s.db.QueryRow(
		`SELECT current_streak, longest_streak, COALESCE(last_checkin_date::text, '')
		 FROM user_streaks WHERE user_id = $1::uuid`, userID,
	).Scan(&info.CurrentStreak, &info.LongestStreak, &last)
	if err == sql.ErrNoRows {
		// No record yet — user hasn't checked in before.
		return &StreakInfo{BonusMultiplier: 1}, nil
	}
	if err != nil {
		return nil, err
	}
	info.LastCheckinDate = last.String
	info.BonusMultiplier = streakMultiplier(info.CurrentStreak)
	return &info, nil
}

// updateStreak atomically advances (or resets) the server streak for a user
// after a successful check-in claim. Returns the updated StreakInfo.
// Must be called within the same logical operation as ClaimCheckinSlot so that
// streak advances only when a real claim succeeds.
func (s *Service) updateStreak(userID, claimDate string) (*StreakInfo, error) {
	if claimDate == "" {
		claimDate = time.Now().UTC().Format("2006-01-02")
	}

	var cur, longest int
	var last sql.NullString

	// Fetch current state (or start fresh).
	err := s.db.QueryRow(
		`SELECT current_streak, longest_streak, last_checkin_date::text
		 FROM user_streaks WHERE user_id = $1::uuid`, userID,
	).Scan(&cur, &longest, &last)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	lastDate := last.String

	// Idempotent — if the streak was already advanced today, return current state.
	if lastDate == claimDate {
		multi := streakMultiplier(cur)
		return &StreakInfo{CurrentStreak: cur, LongestStreak: longest,
			LastCheckinDate: lastDate, BonusMultiplier: multi}, nil
	}

	// Advance streak if claimed yesterday, reset otherwise.
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	if lastDate == yesterday {
		cur++
	} else {
		cur = 1
	}
	if cur > longest {
		longest = cur
	}

	if _, execErr := s.db.Exec(
		`INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_checkin_date, updated_at)
		 VALUES ($1::uuid, $2, $3, $4::date, NOW())
		 ON CONFLICT (user_id)
		 DO UPDATE SET current_streak    = EXCLUDED.current_streak,
		               longest_streak    = EXCLUDED.longest_streak,
		               last_checkin_date = EXCLUDED.last_checkin_date,
		               updated_at        = NOW()`,
		userID, cur, longest, claimDate,
	); execErr != nil {
		return nil, execErr
	}

	return &StreakInfo{
		CurrentStreak:   cur,
		LongestStreak:   longest,
		LastCheckinDate: claimDate,
		BonusMultiplier: streakMultiplier(cur),
	}, nil
}

// GetCheckinPhysicianInfo returns the physician assigned to the patient's most
// recent active diagnosis, the patient's display name, and the slot label.
// Returns empty strings (no error) when no active assigned diagnosis exists.
func (s *Service) GetCheckinPhysicianInfo(userID string, slotID int) (physicianID, patientName, slotLabel string, err error) {
	slotLabel = slotLabels[slotID]
	if slotLabel == "" {
		slotLabel = fmt.Sprintf("Slot %d", slotID)
	}

	row := s.db.QueryRow(`
		SELECT COALESCE(d.physician_id::text, ''), COALESCE(u.name, 'Patient')
		FROM   diagnoses d
		JOIN   users u ON u.id = d.user_id
		WHERE  d.user_id = $1::uuid
		  AND  d.physician_id IS NOT NULL
		  AND  d.status != 'Completed'
		ORDER  BY d.created_at DESC
		LIMIT  1`, userID)

	err = row.Scan(&physicianID, &patientName)
	if err != nil {
		// No active assigned diagnosis — not an error condition, just no physician.
		err = nil
		physicianID = ""
	}
	return
}
