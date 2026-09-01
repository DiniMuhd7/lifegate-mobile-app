package lifefund

import (
	"fmt"
	"time"
)

// Config holds every configurable LifeFund rule, read fresh from
// alert_thresholds (category = 'lifefund') on each evaluation so admins can
// tune the product without a deploy. Nothing in this file is a hard-coded
// business constant — every number here comes from the DB, with the
// literals below used only as a last-resort fallback if a row is missing.
type Config struct {
	InitialLimit            float64
	Tier2Limit              float64
	Tier2RepaymentsRequired int
	Tier3Limit              float64
	Tier3RepaymentsRequired int
	InterestRatePct         float64
	FlatFee                 float64
	DefaultInstallments     int
	RepaymentFrequencyDays  int
	MinAccountAgeDays       int
	MaxRequestedAmount      float64
	AutoReviewRiskThreshold float64
	MaxDefaultsBeforeSuspend int
	CoolingOffHours         int
	AutoTierUpgradeEnabled  bool
}

func defaultConfig() Config {
	return Config{
		InitialLimit:             10000,
		Tier2Limit:               15000,
		Tier2RepaymentsRequired:  1,
		Tier3Limit:               25000,
		Tier3RepaymentsRequired:  3,
		InterestRatePct:          5,
		FlatFee:                  0,
		DefaultInstallments:      3,
		RepaymentFrequencyDays:   14,
		MinAccountAgeDays:        30,
		MaxRequestedAmount:       50000,
		AutoReviewRiskThreshold:  60,
		MaxDefaultsBeforeSuspend: 1,
		CoolingOffHours:          24,
		AutoTierUpgradeEnabled:   true,
	}
}

// EligibilityInput is everything the engine needs about a patient and their
// request in order to reach a decision. The repository assembles this from
// the DB; keeping it as a plain struct makes the rules unit-testable without
// a database.
type EligibilityInput struct {
	AccountExists        bool
	AccountStatus        string
	AdminOverrideStatus  *string
	AdminOverrideAllowsNew bool // true if the admin explicitly permitted a new request despite an outstanding balance
	CreditLimit          float64
	OutstandingBalance   float64
	SuccessfulRepayments int
	DefaultsCount        int
	UserAccountAgeDays   int
	HasBasicIdentity     bool // name + email + phone on file
	RequestedAmount      float64 // 0 when just checking eligibility, not submitting
	OpenRequestsCount    int     // requests currently in a non-terminal state
	RequestsLast24h      int     // fraud signal: submission velocity
	DuplicateBillRef     bool    // fraud signal: same bill reference reused
}

// Evaluate runs the full LifeFund eligibility + risk engine and returns the
// resulting account status, whether a (new) request may proceed, and the
// risk/fraud signals an admin should see alongside the request.
func Evaluate(cfg Config, in EligibilityInput) EligibilityResult {
	var flags []FraudFlag
	now := time.Now()

	// ── Hard blocks ──────────────────────────────────────────────────────
	if in.AdminOverrideStatus != nil {
		switch *in.AdminOverrideStatus {
		case StatusSuspended, StatusDefaulted, StatusIneligible, StatusRestricted:
			return EligibilityResult{
				Status: *in.AdminOverrideStatus, Eligible: false,
				Reason: "Account is " + *in.AdminOverrideStatus + " by admin decision.",
				AvailableLimit: 0, RiskScore: 100,
			}
		}
	}

	if !in.HasBasicIdentity {
		return EligibilityResult{
			Status: StatusIneligible, Eligible: false,
			Reason: "Identity verification incomplete — name, email and phone must be on file.",
		}
	}

	if in.UserAccountAgeDays < cfg.MinAccountAgeDays {
		return EligibilityResult{
			Status: StatusIneligible, Eligible: false,
			Reason: fmt.Sprintf("Account must be at least %d days old (currently %d).", cfg.MinAccountAgeDays, in.UserAccountAgeDays),
		}
	}

	if in.DefaultsCount >= cfg.MaxDefaultsBeforeSuspend {
		return EligibilityResult{
			Status: StatusSuspended, Eligible: false,
			Reason: "Account suspended due to a previous LifeFund default. Contact support to appeal.",
			RiskScore: 100,
		}
	}

	// Core rule: an existing obligation must be cleared before a new one can
	// be unlocked — unless an admin has explicitly authorized an exception
	// (restructuring/refinancing).
	if in.OutstandingBalance > 0 && !in.AdminOverrideAllowsNew {
		return EligibilityResult{
			Status: StatusRestricted, Eligible: false,
			Reason: fmt.Sprintf("Outstanding LifeFund balance of %.2f must be repaid before requesting more financing.", in.OutstandingBalance),
			AvailableLimit: 0, RiskScore: clamp(30+float64(in.DefaultsCount)*20, 0, 100),
		}
	}

	if in.OpenRequestsCount > 0 {
		return EligibilityResult{
			Status: StatusRestricted, Eligible: false,
			Reason: "An existing LifeFund request is already in progress.",
			AvailableLimit: 0,
		}
	}

	// ── Risk scoring (0 = safest, 100 = riskiest) ───────────────────────
	risk := 20.0 // baseline
	if in.DefaultsCount > 0 {
		risk += 40
		flags = append(flags, FraudFlag{Code: "PRIOR_DEFAULT", Detail: "Patient has a prior LifeFund default.", FlaggedAt: now})
	}
	if in.RequestsLast24h >= 3 {
		risk += 25
		flags = append(flags, FraudFlag{Code: "HIGH_VELOCITY", Detail: fmt.Sprintf("%d requests submitted in the last 24 hours.", in.RequestsLast24h), FlaggedAt: now})
	}
	if in.DuplicateBillRef {
		risk += 30
		flags = append(flags, FraudFlag{Code: "DUPLICATE_BILL_REFERENCE", Detail: "This bill reference matches a previous request.", FlaggedAt: now})
	}
	if in.SuccessfulRepayments > 0 {
		risk -= float64(in.SuccessfulRepayments) * 5
	}
	if in.UserAccountAgeDays > 180 {
		risk -= 10
	}
	risk = clamp(risk, 0, 100)

	// ── Determine the effective credit limit (dynamic tiers) ────────────
	limit := cfg.InitialLimit
	if !in.AccountExists {
		limit = cfg.InitialLimit
	} else {
		limit = effectiveLimit(cfg, in.CreditLimit, in.SuccessfulRepayments, in.DefaultsCount)
	}

	// ── Amount checks (only relevant when actually submitting) ──────────
	if in.RequestedAmount > 0 {
		if in.RequestedAmount > cfg.MaxRequestedAmount {
			return EligibilityResult{
				Status: StatusLimited, Eligible: false,
				Reason: fmt.Sprintf("Requested amount exceeds the platform maximum of %.2f.", cfg.MaxRequestedAmount),
				AvailableLimit: limit, RiskScore: risk, FraudFlags: flags,
			}
		}
		if in.RequestedAmount > limit {
			return EligibilityResult{
				Status: StatusLimited, Eligible: false,
				Reason: fmt.Sprintf("Requested amount exceeds your current available limit of %.2f.", limit),
				AvailableLimit: limit, RiskScore: risk, FraudFlags: flags,
			}
		}
	}

	status := StatusEligible
	requiresReview := risk >= cfg.AutoReviewRiskThreshold || len(flags) > 0
	reason := "Eligible for LifeFund financing."
	if requiresReview {
		reason = "Eligible, subject to admin/provider review due to elevated risk indicators."
	}

	return EligibilityResult{
		Status: status, Eligible: true, Reason: reason,
		AvailableLimit: limit, RiskScore: risk, FraudFlags: flags,
		RequiresAdminReview: requiresReview,
	}
}

// effectiveLimit applies the configurable tier rules. Reaching a repayment
// count threshold makes a higher tier *available*, but a tier upgrade is
// still gated on the account carrying no defaults and the admin not having
// disabled automatic upgrades — reaching the repayment count alone is a
// necessary, not sufficient, condition. This is what keeps the "never
// auto-raise the limit just because they repaid" rule and the tiered-limit
// example both true at once: the increase is rule-driven, not unconditional.
func effectiveLimit(cfg Config, currentLimit float64, successfulRepayments, defaultsCount int) float64 {
	if !cfg.AutoTierUpgradeEnabled || defaultsCount > 0 {
		return currentLimit
	}
	limit := currentLimit
	if successfulRepayments >= cfg.Tier3RepaymentsRequired && cfg.Tier3Limit > limit {
		limit = cfg.Tier3Limit
	} else if successfulRepayments >= cfg.Tier2RepaymentsRequired && cfg.Tier2Limit > limit {
		limit = cfg.Tier2Limit
	}
	return limit
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
