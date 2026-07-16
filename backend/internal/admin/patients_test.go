package admin

import "testing"

func TestFreeHealthScreeningInterestForMatchesRegisteredOptions(t *testing.T) {
	raw := `{"free_health_screening_options":["malaria_test","hiv_screening"],"Malaria Test":""}`

	if !freeHealthScreeningInterestFor(raw, "malaria_test") {
		t.Fatal("expected malaria_test interest to match registered screening option")
	}
	if freeHealthScreeningInterestFor(raw, "blood_group_test") {
		t.Fatal("did not expect blood_group_test interest when it was not registered")
	}
}

func TestFreeHealthScreeningResultForIgnoresRegistrationOptions(t *testing.T) {
	raw := `{"free_health_screening_options":["malaria_test"],"Malaria Test":"Negative"}`

	result, ok := freeHealthScreeningResultFor(raw, "malaria_test")
	if !ok || result != "Negative" {
		t.Fatalf("expected saved malaria result, got %q, %v", result, ok)
	}
}
