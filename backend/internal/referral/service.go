package referral

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)
import "math/big"

const (
	ReferralBonus = 5 // credits awarded to the referrer for each successful referral
)

// CreditGranter is satisfied by payments.Service.
type CreditGranter interface {
	GrantReferralBonus(referrerID, txRef string) error
}

type Referral struct {
	ID           string    `json:"id"`
	ReferrerID   string    `json:"referrerId"`
	ReferredID   string    `json:"referredId"`
	BonusGranted bool      `json:"bonusGranted"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Stats struct {
	ReferralCode   string     `json:"referralCode"`
	TotalReferrals int        `json:"totalReferrals"`
	BonusEarned    int        `json:"bonusEarned"` // total credits earned via referrals
	Referrals      []Referral `json:"referrals"`
}

type Service struct {
	db            *sql.DB
	creditGranter CreditGranter
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) SetCreditGranter(g CreditGranter) {
	s.creditGranter = g
}

// GenerateCode creates a cryptographically random 8-character alphanumeric referral code.
func GenerateCode() (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I, O, 0, 1 for readability
	b := make([]byte, 8)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		b[i] = charset[n.Int64()]
	}
	return string(b), nil
}

// EnsureReferralCode generates and persists a referral code for a user if they
// don't already have one. Returns the code (existing or newly created).
func (s *Service) EnsureReferralCode(userID string) (string, error) {
	var code string
	err := s.db.QueryRow(
		`SELECT referral_code FROM users WHERE id = $1::uuid AND referral_code IS NOT NULL`,
		userID,
	).Scan(&code)
	if err == nil {
		return code, nil // already has one
	}
	if err != sql.ErrNoRows {
		return "", err
	}

	// Generate a unique code with collision retry.
	for attempts := 0; attempts < 5; attempts++ {
		newCode, err := GenerateCode()
		if err != nil {
			return "", err
		}
		_, dbErr := s.db.Exec(
			`UPDATE users SET referral_code = $1 WHERE id = $2::uuid AND referral_code IS NULL`,
			newCode, userID,
		)
		if dbErr != nil {
			if strings.Contains(dbErr.Error(), "unique") {
				continue // collision, retry
			}
			return "", dbErr
		}
		return newCode, nil
	}
	return "", fmt.Errorf("failed to generate unique referral code after retries")
}

// FindReferrerByCode looks up the user who owns a given referral code.
// Returns (userID, nil) on success, (empty, sql.ErrNoRows) if not found.
func (s *Service) FindReferrerByCode(code string) (string, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	var referrerID string
	err := s.db.QueryRow(
		`SELECT id FROM users WHERE referral_code = $1`, code,
	).Scan(&referrerID)
	return referrerID, err
}

// RecordReferral creates a referral record linking referrer → referred.
// It then immediately attempts to grant the referral bonus to the referrer.
func (s *Service) RecordReferral(referrerID, referredID string) error {
	txRef := fmt.Sprintf("REF-%s-%s", referrerID[:8], referredID[:8])

	var alreadyExists bool
	err := s.db.QueryRow(
		`INSERT INTO referrals (referrer_id, referred_id, bonus_tx_ref)
		 VALUES ($1::uuid, $2::uuid, $3)
		 ON CONFLICT (referred_id) DO NOTHING
		 RETURNING false`,
		referrerID, referredID, txRef,
	).Scan(&alreadyExists)
	if err == sql.ErrNoRows {
		// Conflict — referred user already has a referral record.
		return nil
	}
	if err != nil {
		return fmt.Errorf("referral: insert failed: %w", err)
	}

	// Grant bonus credits to the referrer.
	if s.creditGranter != nil {
		if err := s.creditGranter.GrantReferralBonus(referrerID, txRef); err != nil {
			log.Printf("[referral] failed to grant bonus to %s: %v", referrerID, err)
			// Non-fatal; the referral row is already recorded, bonus can be retried.
			return nil
		}
		// Mark bonus as granted.
		_, _ = s.db.Exec(
			`UPDATE referrals SET bonus_granted = TRUE WHERE bonus_tx_ref = $1`, txRef,
		)
	}
	return nil
}

// GetStats returns the referral code and all completed referrals for a user.
func (s *Service) GetStats(userID string) (*Stats, error) {
	code, err := s.EnsureReferralCode(userID)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.Query(
		`SELECT id, referrer_id, referred_id, bonus_granted, created_at
		 FROM referrals WHERE referrer_id = $1::uuid ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var referrals []Referral
	bonusTotal := 0
	for rows.Next() {
		var r Referral
		if err := rows.Scan(&r.ID, &r.ReferrerID, &r.ReferredID, &r.BonusGranted, &r.CreatedAt); err != nil {
			return nil, err
		}
		referrals = append(referrals, r)
		if r.BonusGranted {
			bonusTotal += ReferralBonus
		}
	}
	if referrals == nil {
		referrals = []Referral{}
	}

	return &Stats{
		ReferralCode:   code,
		TotalReferrals: len(referrals),
		BonusEarned:    bonusTotal,
		Referrals:      referrals,
	}, nil
}
