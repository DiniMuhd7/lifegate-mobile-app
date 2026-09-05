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
