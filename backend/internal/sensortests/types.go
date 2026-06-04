// Package sensortests provides EDIS-backed interpretation of automated
// sensor test batteries (vision screening and pure-tone audiometry).
package sensortests

// ─── Vision request ───────────────────────────────────────────────────────────

// VisionAcuityData holds the acuity sub-test result.
type VisionAcuityData struct {
	LogMAR    float64 `json:"logMAR"`
	Snellen   string  `json:"snellen"`
	Category  string  `json:"category,omitempty"`  // e.g. "normal", "near_normal", "low_vision_1"
	Decimal   float64 `json:"decimal,omitempty"`
}

// VisionColorData holds the color vision sub-test result.
type VisionColorData struct {
	Score    float64 `json:"score"`    // percentage correct on plates
	Category string  `json:"category"` // "normal" | "mild_deficiency" | ...
	CVDType  string  `json:"cvdType,omitempty"` // e.g. "protan", "deutan"
}

// VisionAstigmatismData holds the astigmatism sub-test result.
type VisionAstigmatismData struct {
	Severity       string   `json:"severity"`                 // "none" | "mild" | "moderate" | "marked"
	DetectedAxis   *float64 `json:"detectedAxis,omitempty"`   // TABO degrees
	AxisRule       string   `json:"axisRule,omitempty"`       // "with_the_rule" | ...
	CylinderNotation string `json:"cylinderNotation,omitempty"`
}

// VisionContrastData holds the contrast sensitivity sub-test result.
type VisionContrastData struct {
	PelliRobsonLogCS *float64 `json:"pelliRobsonLogCS,omitempty"`
	ContrastGrade    string   `json:"contrastGrade,omitempty"` // "normal" | "mild_loss" | ...
}

// VisionNearData holds the near vision sub-test result.
type VisionNearData struct {
	SmallestReadablePoints int    `json:"smallestReadablePoints"`
	NNotation              string `json:"nNotation,omitempty"`
	JaegerNotation         string `json:"jaegerNotation,omitempty"`
}

// VisionInterpretRequest is the request body for POST /sensor-tests/vision/interpret.
type VisionInterpretRequest struct {
	Acuity       *VisionAcuityData      `json:"acuity,omitempty"`
	Color        *VisionColorData       `json:"color,omitempty"`
	Astigmatism  *VisionAstigmatismData `json:"astigmatism,omitempty"`
	Contrast     *VisionContrastData    `json:"contrast,omitempty"`
	Near         *VisionNearData        `json:"near,omitempty"`
	// Overall behavioral reliability grade from the test session ("excellent" | "good" | "fair" | "poor")
	BehavioralReliability string `json:"behavioralReliability,omitempty"`
}

// ─── Hearing request ──────────────────────────────────────────────────────────

// EarData holds audiometric data for one ear.
type EarData struct {
	PTA3          float64  `json:"pta3"`          // pure-tone average at 500/1000/2000 Hz
	WHOGrade      string   `json:"whoGrade"`      // "0" | "1" | "2" | "3" | "4"
	Category      string   `json:"category"`      // "normal" | "slight" | "moderate" | ...
	Shape         string   `json:"shape,omitempty"` // "flat" | "sloping" | "notch" | ...
	Threshold4kHz *float64 `json:"threshold4kHz,omitempty"`
	Threshold8kHz *float64 `json:"threshold8kHz,omitempty"`
}

// SINData holds a speech-in-noise result.
type SINData struct {
	Score float64 `json:"score"` // percentage
	Grade string  `json:"grade"` // "excellent" | "good" | "fair" | "poor"
}

// HFData holds high-frequency audiometry result.
type HFData struct {
	Pattern string `json:"pattern"` // "normal" | "progressive_sloping" | ...
}

// HearingInterpretRequest is the request body for POST /sensor-tests/hearing/interpret.
type HearingInterpretRequest struct {
	RightEar              *EarData `json:"rightEar,omitempty"`
	LeftEar               *EarData `json:"leftEar,omitempty"`
	SIN                   *SINData `json:"sin,omitempty"`
	HF                    *HFData  `json:"hf,omitempty"`
	RightReliabilityGrade string   `json:"rightReliabilityGrade,omitempty"`
	LeftReliabilityGrade  string   `json:"leftReliabilityGrade,omitempty"`
}

// ─── Shared response ──────────────────────────────────────────────────────────

// ConditionEntry is a single probabilistic condition ranking entry.
type ConditionEntry struct {
	Condition   string `json:"condition"`
	Confidence  int    `json:"confidence"` // 0–100
	Description string `json:"description"`
}

// RiskFlagEntry is an early-stage risk signal.
type RiskFlagEntry struct {
	Flag        string `json:"flag"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
}

// InvestigationEntry is a recommended follow-up test.
type InvestigationEntry struct {
	Test    string `json:"test"`
	Reason  string `json:"reason"`
	Urgency string `json:"urgency"` // ROUTINE | URGENT | STAT
}

// SensorInterpretResponse is returned by both interpret endpoints.
type SensorInterpretResponse struct {
	Success              bool                 `json:"success"`
	Assessment           string               `json:"assessment"`
	Conditions           []ConditionEntry     `json:"conditions,omitempty"`
	RiskFlags            []RiskFlagEntry      `json:"riskFlags,omitempty"`
	Investigations       []InvestigationEntry `json:"investigations,omitempty"`
	Urgency              string               `json:"urgency,omitempty"` // LOW | MEDIUM | HIGH | CRITICAL
	NeedsPhysicianReview bool                 `json:"needsPhysicianReview,omitempty"`
	ProviderName         string               `json:"providerName,omitempty"`
}
