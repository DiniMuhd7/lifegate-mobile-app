package lifefund

import "testing"

func TestEvaluateAllowsNewAccountsWithNameAndPhone(t *testing.T) {
	cfg := defaultConfig()

	result := Evaluate(cfg, EligibilityInput{
		HasBasicIdentity:   true,
		UserAccountAgeDays: 0,
	})
	if !result.Eligible {
		t.Fatalf("expected a new user with name and phone to be eligible, got %q", result.Reason)
	}
	if result.Reason != "Eligible for LifeFund financing. LifeGate Official will contact you for an eligibility interview." {
		t.Fatalf("unexpected eligibility reason: %q", result.Reason)
	}
}

func TestEvaluateUsesStartingLimitForNewlyCreatedAccount(t *testing.T) {
	cfg := defaultConfig()

	// EnsureAccount creates a row with credit_limit = 0 before evaluation.
	// A first financing request must receive the configured initial limit,
	// rather than being rejected because its available limit is zero.
	result := Evaluate(cfg, EligibilityInput{
		AccountExists:      true,
		HasBasicIdentity:   true,
		CreditLimit:        0,
		RequestedAmount:    cfg.InitialLimit,
		UserAccountAgeDays: 0,
	})

	if !result.Eligible {
		t.Fatalf("expected a first request within the initial limit to be eligible, got %q", result.Reason)
	}
	if result.AvailableLimit != cfg.InitialLimit {
		t.Fatalf("available limit = %v, want %v", result.AvailableLimit, cfg.InitialLimit)
	}
}

func TestEvaluateRejectsMissingPhone(t *testing.T) {
	cfg := defaultConfig()

	result := Evaluate(cfg, EligibilityInput{
		HasBasicIdentity:   false,
		UserAccountAgeDays: 0,
	})
	if result.Eligible {
		t.Fatal("expected a user without a phone number to be ineligible")
	}
	if result.Reason != "Identity verification incomplete — name and phone number must be on file." {
		t.Fatalf("unexpected ineligibility reason: %q", result.Reason)
	}
}
