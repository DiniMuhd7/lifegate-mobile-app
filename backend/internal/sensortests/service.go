package sensortests

import (
	"context"
	"fmt"
	"strings"

	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/ai"
	"github.com/DiniMuhd7/lifegate-mobile-app/backend/internal/edis"
)

// Service interprets sensor test results via the EDIS engine.
type Service struct {
	engine *edis.Engine
}

// NewService returns a new Service backed by the given EDIS engine.
func NewService(engine *edis.Engine) *Service {
	return &Service{engine: engine}
}

// ─── Vision ───────────────────────────────────────────────────────────────────

// InterpretVision builds a structured clinical prompt from vision battery
// results and returns an LLM-backed interpretation via EDIS.
func (s *Service) InterpretVision(ctx context.Context, req VisionInterpretRequest, patient edis.PatientContext) (*SensorInterpretResponse, error) {
	msg := buildVisionPrompt(req)
	messages := []ai.ChatMessage{
		{Role: "USER", Text: msg},
	}

	resp, err := s.engine.Process(ctx, messages, "eye_checkup", patient)
	if err != nil {
		return nil, err
	}

	return mapEDISResponse(resp, s.engine.ProviderName()), nil
}

// ─── Hearing ──────────────────────────────────────────────────────────────────

// InterpretHearing builds a structured clinical prompt from audiometry
// results and returns an LLM-backed interpretation via EDIS.
func (s *Service) InterpretHearing(ctx context.Context, req HearingInterpretRequest, patient edis.PatientContext) (*SensorInterpretResponse, error) {
	msg := buildHearingPrompt(req)
	messages := []ai.ChatMessage{
		{Role: "USER", Text: msg},
	}

	resp, err := s.engine.Process(ctx, messages, "hearing_test", patient)
	if err != nil {
		return nil, err
	}

	return mapEDISResponse(resp, s.engine.ProviderName()), nil
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

func buildVisionPrompt(req VisionInterpretRequest) string {
	var b strings.Builder
	b.WriteString("I have just completed an automated vision screening battery. Please interpret these results and highlight any clinically significant findings.\n\n")
	b.WriteString("=== AUTOMATED VISION SCREENING RESULTS ===\n\n")

	if req.Acuity != nil {
		acc := req.Acuity
		b.WriteString(fmt.Sprintf("Visual Acuity:\n  LogMAR: %.2f\n  Snellen: %s\n", acc.LogMAR, acc.Snellen))
		if acc.Decimal > 0 {
			b.WriteString(fmt.Sprintf("  Decimal: %.2f\n", acc.Decimal))
		}
		if acc.Category != "" {
			b.WriteString(fmt.Sprintf("  WHO Category: %s\n", acc.Category))
		}
		b.WriteString("\n")
	}

	if req.Color != nil {
		col := req.Color
		b.WriteString(fmt.Sprintf("Color Vision:\n  Score: %.0f%% correct on Ishihara-equivalent plates\n  Category: %s\n", col.Score, col.Category))
		if col.CVDType != "" {
			b.WriteString(fmt.Sprintf("  CVD Type Indicator: %s\n", col.CVDType))
		}
		b.WriteString("\n")
	}

	if req.Astigmatism != nil {
		ast := req.Astigmatism
		b.WriteString(fmt.Sprintf("Astigmatism Screening:\n  Severity: %s\n", ast.Severity))
		if ast.DetectedAxis != nil {
			b.WriteString(fmt.Sprintf("  Detected Axis: %.0f° TABO\n", *ast.DetectedAxis))
		}
		if ast.AxisRule != "" && ast.AxisRule != "none" {
			b.WriteString(fmt.Sprintf("  Axis Type: %s\n", ast.AxisRule))
		}
		if ast.CylinderNotation != "" {
			b.WriteString(fmt.Sprintf("  Cylinder Notation: %s\n", ast.CylinderNotation))
		}
		b.WriteString("\n")
	}

	if req.Contrast != nil {
		con := req.Contrast
		if con.PelliRobsonLogCS != nil {
			b.WriteString(fmt.Sprintf("Contrast Sensitivity:\n  Pelli-Robson log CS: %.2f\n", *con.PelliRobsonLogCS))
		}
		if con.ContrastGrade != "" {
			b.WriteString(fmt.Sprintf("  Grade: %s\n", con.ContrastGrade))
		}
		b.WriteString("\n")
	}

	if req.Near != nil {
		nv := req.Near
		b.WriteString(fmt.Sprintf("Near Vision:\n  Smallest readable: %dpt", nv.SmallestReadablePoints))
		if nv.NNotation != "" {
			b.WriteString(fmt.Sprintf(" (%s)", nv.NNotation))
		}
		if nv.JaegerNotation != "" {
			b.WriteString(fmt.Sprintf(" / %s", nv.JaegerNotation))
		}
		b.WriteString("\n\n")
	}

	if req.BehavioralReliability != "" {
		b.WriteString(fmt.Sprintf("Test Reliability: %s (behavioral signal quality from adaptive protocol)\n\n", req.BehavioralReliability))
	}

	b.WriteString("Based on these automated screening results, please provide:\n")
	b.WriteString("1. Your interpretation of the combined findings\n")
	b.WriteString("2. Any patterns suggesting specific conditions (myopia, astigmatism, color deficiency, etc.)\n")
	b.WriteString("3. Urgency of professional eye examination\n")
	b.WriteString("4. Recommended next steps\n")
	b.WriteString("\nIMPORTANT: These are objective device-measured results. This is NOT a symptom conversation — do NOT ask follow-up questions and do NOT apply HPI/OLDCARTS intake rules. Provide a direct clinical interpretation including diagnosis, conditions, riskFlags, and investigations based solely on the numbers above.\n")

	return b.String()
}

func buildHearingPrompt(req HearingInterpretRequest) string {
	var b strings.Builder
	b.WriteString("I have just completed an automated hearing screening battery. Please interpret these audiometric results and highlight any clinically significant findings.\n\n")
	b.WriteString("=== AUTOMATED AUDIOMETRY SCREENING RESULTS ===\n\n")

	if req.RightEar != nil {
		re := req.RightEar
		b.WriteString(fmt.Sprintf("Right Ear:\n  PTA3 (500/1000/2000 Hz avg): %.1f dBHL\n  WHO Grade: %s (%s)\n", re.PTA3, re.WHOGrade, re.Category))
		if re.Shape != "" {
			b.WriteString(fmt.Sprintf("  Audiogram Shape: %s\n", re.Shape))
		}
		if re.Threshold4kHz != nil {
			b.WriteString(fmt.Sprintf("  4 kHz Threshold: %.0f dBHL\n", *re.Threshold4kHz))
		}
		if re.Threshold8kHz != nil {
			b.WriteString(fmt.Sprintf("  8 kHz Threshold: %.0f dBHL\n", *re.Threshold8kHz))
		}
		if req.RightReliabilityGrade != "" {
			b.WriteString(fmt.Sprintf("  Test Reliability: %s\n", req.RightReliabilityGrade))
		}
		b.WriteString("\n")
	}

	if req.LeftEar != nil {
		le := req.LeftEar
		b.WriteString(fmt.Sprintf("Left Ear:\n  PTA3 (500/1000/2000 Hz avg): %.1f dBHL\n  WHO Grade: %s (%s)\n", le.PTA3, le.WHOGrade, le.Category))
		if le.Shape != "" {
			b.WriteString(fmt.Sprintf("  Audiogram Shape: %s\n", le.Shape))
		}
		if le.Threshold4kHz != nil {
			b.WriteString(fmt.Sprintf("  4 kHz Threshold: %.0f dBHL\n", *le.Threshold4kHz))
		}
		if le.Threshold8kHz != nil {
			b.WriteString(fmt.Sprintf("  8 kHz Threshold: %.0f dBHL\n", *le.Threshold8kHz))
		}
		if req.LeftReliabilityGrade != "" {
			b.WriteString(fmt.Sprintf("  Test Reliability: %s\n", req.LeftReliabilityGrade))
		}
		b.WriteString("\n")
	}

	if req.SIN != nil {
		b.WriteString(fmt.Sprintf("Speech-in-Noise Test:\n  Score: %.0f%%\n  Grade: %s\n\n", req.SIN.Score, req.SIN.Grade))
	}

	if req.HF != nil {
		b.WriteString(fmt.Sprintf("High-Frequency Audiometry:\n  Pattern: %s\n\n", req.HF.Pattern))
	}

	b.WriteString("Based on these automated audiometry screening results, please provide:\n")
	b.WriteString("1. Your interpretation of the combined findings\n")
	b.WriteString("2. Any patterns suggesting specific aetiology (noise-induced, age-related, other)\n")
	b.WriteString("3. Urgency of audiologist referral\n")
	b.WriteString("4. Recommended next steps\n")
	b.WriteString("\nIMPORTANT: These are objective device-measured results. This is NOT a symptom conversation — do NOT ask follow-up questions and do NOT apply HPI/OLDCARTS intake rules. Provide a direct clinical interpretation including diagnosis, conditions, riskFlags, and investigations based solely on the audiometric data above.\n")

	return b.String()
}

// ─── Response mapper ──────────────────────────────────────────────────────────

func mapEDISResponse(resp *edis.EDISResponse, providerName string) *SensorInterpretResponse {
	out := &SensorInterpretResponse{
		Success:              true,
		Assessment:           resp.Text,
		NeedsPhysicianReview: resp.NeedsPhysicianReview,
		ProviderName:         providerName,
	}

	if resp.Diagnosis != nil {
		out.Urgency = resp.Diagnosis.Urgency
	}

	for _, c := range resp.Conditions {
		out.Conditions = append(out.Conditions, ConditionEntry{
			Condition:   c.Condition,
			Confidence:  c.Confidence,
			Description: c.Description,
		})
	}

	for _, f := range resp.RiskFlags {
		out.RiskFlags = append(out.RiskFlags, RiskFlagEntry{
			Flag:        f.Flag,
			Severity:    f.Severity,
			Description: f.Description,
		})
	}

	for _, inv := range resp.Investigations {
		out.Investigations = append(out.Investigations, InvestigationEntry{
			Test:    inv.Test,
			Reason:  inv.Reason,
			Urgency: inv.Urgency,
		})
	}

	return out
}
