package sensortests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/edis"
	"github.com/gin-gonic/gin"
)

// ─── Mock AI provider ─────────────────────────────────────────────────────────

type mockAI struct {
	resp *ai.AIResponse
	err  error
}

func (m *mockAI) Name() string { return "mock" }
func (m *mockAI) Chat(_ context.Context, _ string, _ []ai.ChatMessage) (*ai.AIResponse, error) {
	return m.resp, m.err
}

// canned AI response that EDIS will parse and map
func goodAIResponse() *ai.AIResponse {
	return &ai.AIResponse{
		Text: "Screening findings suggest mild myopia with no urgent referral needed.",
		Diagnosis: &ai.Diagnosis{
			Urgency: "LOW",
		},
		Conditions: []ai.ConditionScore{
			{Condition: "Myopia", Confidence: 85, Description: "LogMAR 0.30 consistent with mild myopia."},
			{Condition: "Normal colour vision", Confidence: 90, Description: "No colour deficiency detected."},
		},
		RiskFlags: []ai.RiskFlag{
			{Flag: "PROGRESSIVE_MYOPIA", Severity: "low", Description: "Monitor annually."},
		},
		Investigations: []ai.Investigation{
			{Test: "Dilated fundus examination", Reason: "Baseline retinal check", Urgency: "ROUTINE"},
		},
	}
}

func goodHearingAIResponse() *ai.AIResponse {
	return &ai.AIResponse{
		Text: "Bilateral mild sensorineural hearing loss consistent with early presbycusis.",
		Diagnosis: &ai.Diagnosis{
			Urgency: "MEDIUM",
		},
		Conditions: []ai.ConditionScore{
			{Condition: "Presbycusis", Confidence: 78, Description: "Age-related high-frequency SNHL pattern."},
		},
		RiskFlags: []ai.RiskFlag{
			{Flag: "PROGRESSION_RISK", Severity: "medium", Description: "Annual audiological follow-up recommended."},
		},
		Investigations: []ai.Investigation{
			{Test: "Full audiological assessment", Reason: "Confirm SNHL aetiology", Urgency: "ROUTINE"},
		},
	}
}

// ─── Prompt builder tests ─────────────────────────────────────────────────────

func TestBuildVisionPrompt_ContainsAcuity(t *testing.T) {
	logMAR := 0.30
	req := VisionInterpretRequest{
		Acuity: &VisionAcuityData{
			LogMAR:  logMAR,
			Snellen: "20/40",
		},
	}
	out := buildVisionPrompt(req)
	if !strings.Contains(out, "0.30") {
		t.Errorf("expected LogMAR 0.30 in prompt, got: %s", out)
	}
	if !strings.Contains(out, "20/40") {
		t.Errorf("expected Snellen 20/40 in prompt, got: %s", out)
	}
}

func TestBuildVisionPrompt_ContainsColorData(t *testing.T) {
	req := VisionInterpretRequest{
		Color: &VisionColorData{
			Score:    60.0,
			Category: "moderate_deficiency",
			CVDType:  "deutan",
		},
	}
	out := buildVisionPrompt(req)
	if !strings.Contains(out, "60%") {
		t.Errorf("expected score 60%% in prompt")
	}
	if !strings.Contains(out, "deutan") {
		t.Errorf("expected CVD type 'deutan' in prompt")
	}
}

func TestBuildVisionPrompt_ContainsAstigmatism(t *testing.T) {
	axis := 90.0
	req := VisionInterpretRequest{
		Astigmatism: &VisionAstigmatismData{
			Severity:    "moderate",
			DetectedAxis: &axis,
			AxisRule:    "with_the_rule",
		},
	}
	out := buildVisionPrompt(req)
	if !strings.Contains(out, "moderate") {
		t.Errorf("expected severity 'moderate' in prompt")
	}
	if !strings.Contains(out, "90") {
		t.Errorf("expected axis 90 in prompt")
	}
	if !strings.Contains(out, "with_the_rule") {
		t.Errorf("expected axis rule in prompt")
	}
}

func TestBuildVisionPrompt_ContainsNearVision(t *testing.T) {
	req := VisionInterpretRequest{
		Near: &VisionNearData{
			SmallestReadablePoints: 12,
			NNotation:              "N12",
			JaegerNotation:         "J8",
		},
	}
	out := buildVisionPrompt(req)
	if !strings.Contains(out, "12pt") {
		t.Errorf("expected near vision 12pt in prompt")
	}
	if !strings.Contains(out, "N12") {
		t.Errorf("expected N notation in prompt")
	}
}

func TestBuildVisionPrompt_BehavioralReliability(t *testing.T) {
	req := VisionInterpretRequest{
		BehavioralReliability: "fair",
	}
	out := buildVisionPrompt(req)
	if !strings.Contains(out, "fair") {
		t.Errorf("expected reliability grade 'fair' in prompt")
	}
}

func TestBuildHearingPrompt_ContainsRightEar(t *testing.T) {
	t4 := 40.0
	req := HearingInterpretRequest{
		RightEar: &EarData{
			PTA3:          30.0,
			WHOGrade:      "1",
			Category:      "slight",
			Shape:         "sloping",
			Threshold4kHz: &t4,
		},
		RightReliabilityGrade: "good",
	}
	out := buildHearingPrompt(req)
	if !strings.Contains(out, "30.0 dBHL") {
		t.Errorf("expected PTA3 30.0 dBHL in prompt, got: %s", out)
	}
	if !strings.Contains(out, "sloping") {
		t.Errorf("expected audiogram shape 'sloping' in prompt")
	}
	if !strings.Contains(out, "40 dBHL") {
		t.Errorf("expected 4 kHz threshold in prompt")
	}
	if !strings.Contains(out, "good") {
		t.Errorf("expected reliability grade 'good' in prompt")
	}
}

func TestBuildHearingPrompt_ContainsSINAndHF(t *testing.T) {
	req := HearingInterpretRequest{
		SIN: &SINData{Score: 72.0, Grade: "mild"},
		HF:  &HFData{Pattern: "early_nihl"},
	}
	out := buildHearingPrompt(req)
	if !strings.Contains(out, "72%") {
		t.Errorf("expected SIN score 72%% in prompt")
	}
	if !strings.Contains(out, "early_nihl") {
		t.Errorf("expected HF pattern 'early_nihl' in prompt")
	}
}

func TestBuildHearingPrompt_EmptyRequest(t *testing.T) {
	req := HearingInterpretRequest{}
	out := buildHearingPrompt(req)
	if !strings.Contains(out, "automated hearing screening") {
		t.Errorf("expected header text in prompt, got: %s", out)
	}
}

// ─── mapEDISResponse tests ────────────────────────────────────────────────────

func makeEDISResp(aiResp *ai.AIResponse) *edis.EDISResponse {
	return &edis.EDISResponse{
		AIResponse:           aiResp,
		NeedsPhysicianReview: false,
	}
}

func TestMapEDISResponse_BasicFields(t *testing.T) {
	aiResp := goodAIResponse()
	edisResp := makeEDISResp(aiResp)
	out := mapEDISResponse(edisResp, "mock")

	if !out.Success {
		t.Error("expected Success=true")
	}
	if out.Assessment != aiResp.Text {
		t.Errorf("expected assessment %q, got %q", aiResp.Text, out.Assessment)
	}
	if out.ProviderName != "mock" {
		t.Errorf("expected provider 'mock', got %q", out.ProviderName)
	}
	if out.Urgency != "LOW" {
		t.Errorf("expected urgency LOW, got %q", out.Urgency)
	}
}

func TestMapEDISResponse_Conditions(t *testing.T) {
	aiResp := goodAIResponse()
	out := mapEDISResponse(makeEDISResp(aiResp), "mock")

	if len(out.Conditions) != 2 {
		t.Fatalf("expected 2 conditions, got %d", len(out.Conditions))
	}
	if out.Conditions[0].Condition != "Myopia" {
		t.Errorf("expected first condition 'Myopia', got %q", out.Conditions[0].Condition)
	}
	if out.Conditions[0].Confidence != 85 {
		t.Errorf("expected confidence 85, got %d", out.Conditions[0].Confidence)
	}
}

func TestMapEDISResponse_RiskFlags(t *testing.T) {
	aiResp := goodAIResponse()
	out := mapEDISResponse(makeEDISResp(aiResp), "mock")

	if len(out.RiskFlags) != 1 {
		t.Fatalf("expected 1 risk flag, got %d", len(out.RiskFlags))
	}
	if out.RiskFlags[0].Flag != "PROGRESSIVE_MYOPIA" {
		t.Errorf("expected flag PROGRESSIVE_MYOPIA, got %q", out.RiskFlags[0].Flag)
	}
	if out.RiskFlags[0].Severity != "low" {
		t.Errorf("expected severity 'low', got %q", out.RiskFlags[0].Severity)
	}
}

func TestMapEDISResponse_Investigations(t *testing.T) {
	aiResp := goodAIResponse()
	out := mapEDISResponse(makeEDISResp(aiResp), "mock")

	if len(out.Investigations) != 1 {
		t.Fatalf("expected 1 investigation, got %d", len(out.Investigations))
	}
	inv := out.Investigations[0]
	if inv.Test != "Dilated fundus examination" {
		t.Errorf("unexpected investigation test: %q", inv.Test)
	}
	if inv.Urgency != "ROUTINE" {
		t.Errorf("expected urgency ROUTINE, got %q", inv.Urgency)
	}
}

func TestMapEDISResponse_NeedsPhysicianReview(t *testing.T) {
	aiResp := goodAIResponse()
	edisResp := makeEDISResp(aiResp)
	edisResp.NeedsPhysicianReview = true
	out := mapEDISResponse(edisResp, "mock")
	if !out.NeedsPhysicianReview {
		t.Error("expected NeedsPhysicianReview=true")
	}
}

// ─── Service tests (mock AI engine) ──────────────────────────────────────────

func newServiceWithMock(aiResp *ai.AIResponse) *Service {
	engine := edis.NewEngine(&mockAI{resp: aiResp})
	return NewService(engine)
}

func TestService_InterpretVision_Success(t *testing.T) {
	svc := newServiceWithMock(goodAIResponse())
	req := VisionInterpretRequest{
		Acuity: &VisionAcuityData{LogMAR: 0.30, Snellen: "20/40"},
		Color:  &VisionColorData{Score: 100, Category: "normal"},
	}
	resp, err := svc.InterpretVision(context.Background(), req, edis.PatientContext{Name: "Test Patient"})
	if err != nil {
		t.Fatalf("InterpretVision returned error: %v", err)
	}
	if !resp.Success {
		t.Error("expected success=true")
	}
	if resp.Assessment == "" {
		t.Error("expected non-empty assessment")
	}
	if len(resp.Conditions) == 0 {
		t.Error("expected at least one condition")
	}
}

func TestService_InterpretVision_EmptyRequest(t *testing.T) {
	svc := newServiceWithMock(goodAIResponse())
	// Empty request is valid — EDIS just gets a minimal prompt
	resp, err := svc.InterpretVision(context.Background(), VisionInterpretRequest{}, edis.PatientContext{})
	if err != nil {
		t.Fatalf("unexpected error on empty request: %v", err)
	}
	if !resp.Success {
		t.Error("expected success=true even for empty request")
	}
}

func TestService_InterpretHearing_Success(t *testing.T) {
	svc := newServiceWithMock(goodHearingAIResponse())
	req := HearingInterpretRequest{
		RightEar: &EarData{PTA3: 30.0, WHOGrade: "1", Category: "slight"},
		LeftEar:  &EarData{PTA3: 25.0, WHOGrade: "1", Category: "slight"},
		SIN:      &SINData{Score: 70, Grade: "mild"},
	}
	resp, err := svc.InterpretHearing(context.Background(), req, edis.PatientContext{})
	if err != nil {
		t.Fatalf("InterpretHearing returned error: %v", err)
	}
	if !resp.Success {
		t.Error("expected success=true")
	}
	if resp.Assessment == "" {
		t.Error("expected non-empty assessment")
	}
	if len(resp.Conditions) == 0 {
		t.Error("expected at least one condition")
	}
	if resp.Urgency != "MEDIUM" {
		t.Errorf("expected urgency MEDIUM, got %q", resp.Urgency)
	}
}

func TestService_InterpretHearing_EmptyRequest(t *testing.T) {
	svc := newServiceWithMock(goodHearingAIResponse())
	resp, err := svc.InterpretHearing(context.Background(), HearingInterpretRequest{}, edis.PatientContext{})
	if err != nil {
		t.Fatalf("unexpected error on empty hearing request: %v", err)
	}
	if !resp.Success {
		t.Error("expected success=true even for empty request")
	}
}

// ─── Handler HTTP tests ───────────────────────────────────────────────────────

func init() {
	gin.SetMode(gin.TestMode)
}

func newTestHandler(aiResp *ai.AIResponse) *Handler {
	svc := newServiceWithMock(aiResp)
	// authRepo is nil — resolvePatient is safe when FindUserByID is not called
	// (userID not set in context → early return with empty PatientContext).
	return &Handler{svc: svc, authRepo: nil}
}

func TestHandler_InterpretVision_200(t *testing.T) {
	h := newTestHandler(goodAIResponse())
	r := gin.New()
	r.POST("/sensor-tests/vision/interpret", h.InterpretVision)

	body, _ := json.Marshal(VisionInterpretRequest{
		Acuity: &VisionAcuityData{LogMAR: 0.10, Snellen: "20/20"},
	})
	req := httptest.NewRequest(http.MethodPost, "/sensor-tests/vision/interpret", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp SensorInterpretResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if !resp.Success {
		t.Error("expected success=true in response")
	}
	if resp.Assessment == "" {
		t.Error("expected non-empty assessment in response")
	}
}

func TestHandler_InterpretVision_400_BadJSON(t *testing.T) {
	h := newTestHandler(goodAIResponse())
	r := gin.New()
	r.POST("/sensor-tests/vision/interpret", h.InterpretVision)

	req := httptest.NewRequest(http.MethodPost, "/sensor-tests/vision/interpret",
		strings.NewReader("{invalid json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on bad JSON, got %d", w.Code)
	}
}

func TestHandler_InterpretHearing_200(t *testing.T) {
	h := newTestHandler(goodHearingAIResponse())
	r := gin.New()
	r.POST("/sensor-tests/hearing/interpret", h.InterpretHearing)

	body, _ := json.Marshal(HearingInterpretRequest{
		RightEar: &EarData{PTA3: 35.0, WHOGrade: "2", Category: "moderate"},
	})
	req := httptest.NewRequest(http.MethodPost, "/sensor-tests/hearing/interpret", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d — body: %s", w.Code, w.Body.String())
	}

	var resp SensorInterpretResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if !resp.Success {
		t.Error("expected success=true in response")
	}
	if len(resp.Conditions) == 0 {
		t.Error("expected at least one condition in response")
	}
}

func TestHandler_InterpretHearing_400_BadJSON(t *testing.T) {
	h := newTestHandler(goodHearingAIResponse())
	r := gin.New()
	r.POST("/sensor-tests/hearing/interpret", h.InterpretHearing)

	req := httptest.NewRequest(http.MethodPost, "/sensor-tests/hearing/interpret",
		strings.NewReader("not-json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on bad JSON, got %d", w.Code)
	}
}

func TestHandler_InterpretVision_ResponseShape(t *testing.T) {
	h := newTestHandler(goodAIResponse())
	r := gin.New()
	r.POST("/sensor-tests/vision/interpret", h.InterpretVision)

	body, _ := json.Marshal(VisionInterpretRequest{
		Acuity:  &VisionAcuityData{LogMAR: 0.30, Snellen: "20/40"},
		Color:   &VisionColorData{Score: 60, Category: "moderate_deficiency", CVDType: "deutan"},
		BehavioralReliability: "good",
	})
	req := httptest.NewRequest(http.MethodPost, "/sensor-tests/vision/interpret", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp SensorInterpretResponse
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	// Verify all expected top-level fields are present and correctly typed
	if resp.ProviderName == "" {
		t.Error("expected non-empty providerName")
	}
	// Urgency must be one of the known values
	validUrgency := map[string]bool{"LOW": true, "MEDIUM": true, "HIGH": true, "CRITICAL": true}
	if !validUrgency[resp.Urgency] {
		t.Errorf("unexpected urgency value: %q", resp.Urgency)
	}
	// Conditions must have confidence in 0-100
	for i, c := range resp.Conditions {
		if c.Confidence < 0 || c.Confidence > 100 {
			t.Errorf("condition[%d].confidence=%d out of range [0,100]", i, c.Confidence)
		}
	}
	// Investigations must have a valid urgency
	validInvUrgency := map[string]bool{"ROUTINE": true, "URGENT": true, "STAT": true}
	for i, inv := range resp.Investigations {
		if !validInvUrgency[inv.Urgency] {
			t.Errorf("investigation[%d].urgency=%q not valid", i, inv.Urgency)
		}
	}
}
