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

func TestPatientExportFilterIncludesLegacyRegistrationsWithoutPersistedInterests(t *testing.T) {
	raw := `{"Malaria Test":""}`

	if !includePatientForFreeHealthScreeningExport(raw, "malaria_test") {
		t.Fatal("expected legacy registrations without persisted screening interests to remain exportable")
	}
}

func TestPatientExportFilterExcludesMismatchedPersistedInterests(t *testing.T) {
	raw := `{"free_health_screening_options":["hiv_screening"]}`

	if includePatientForFreeHealthScreeningExport(raw, "malaria_test") {
		t.Fatal("did not expect malaria export to include patients with a different persisted interest")
	}
}
