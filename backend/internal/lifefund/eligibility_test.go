package lifefund

import "testing"

func TestEvaluateRequiresNameAndPhoneButNotEmail(t *testing.T) {
	cfg := defaultConfig()

	result := Evaluate(cfg, EligibilityInput{
		HasBasicIdentity:   true,
		UserAccountAgeDays: cfg.MinAccountAgeDays,
	})
	if !result.Eligible {
		t.Fatalf("expected a user with name and phone to be eligible, got %q", result.Reason)
	}
}

func TestEvaluateRejectsMissingPhone(t *testing.T) {
	cfg := defaultConfig()

	result := Evaluate(cfg, EligibilityInput{
		HasBasicIdentity:   false,
		UserAccountAgeDays: cfg.MinAccountAgeDays,
	})
	if result.Eligible {
		t.Fatal("expected a user without a phone number to be ineligible")
	}
	if result.Reason != "Identity verification incomplete — name and phone number must be on file." {
		t.Fatalf("unexpected ineligibility reason: %q", result.Reason)
	}
}
