# AI VALIDATION WORKFLOW
## LifeGate OpenClaw | Low-Confidence Triage Validation Process

---

## Overview

This workflow describes what happens when EDIS produces a low-confidence
triage output. It ensures that uncertain AI assessments are reviewed by
a human physician before guiding clinical decisions.

---

## Trigger Conditions

This workflow is activated when:
- EDIS confidence score < 65%
- A physician agent explicitly requests AI validation
- The AI differential contains a red-flag condition with low probability
  but the patient presentation is clinically concerning

---

## Workflow Steps

### Step 1 — Trigger Detection

System detects low-confidence flag on EDIS output.

**System action:**
- Flag case: `ai_low_confidence: true`
- Log event: `ai_validation_triggered`
- Immediately notify Dr. Ngozi Okafor (AI Validation Lead)

---

### Step 2 — Dr. Ngozi Reviews

Dr. Ngozi Okafor receives:
- Patient's presenting complaint (raw text)
- Full EDIS output (differential + confidence scores per condition)
- Patient profile (age, sex, history)
- Any uploaded files / scan results

**Dr. Ngozi's task:**
Review the AI differential and determine whether it is:
a) **Confirmed** — EDIS differential is clinically sound despite low confidence
b) **Modified** — Adjust the ranking or add/remove conditions
c) **Rejected** — EDIS differential is clinically incorrect; replace with clinical assessment
d) **Consensus needed** — Case is complex; request multi-agent review

---

### Step 3 — Validation Decision

Based on Dr. Ngozi's assessment:

| Decision     | Action                                                        |
|--------------|---------------------------------------------------------------|
| Confirmed    | Routing proceeds normally per original differential          |
| Modified     | Updated differential used for routing                        |
| Rejected     | Dr. Ngozi's differential replaces EDIS; routing based on this|
| Consensus    | Consensus engine activated; relevant specialists invited      |

---

### Step 4 — Routing

Case is routed based on the validated differential.

If Dr. Ngozi has already taken over the case → she continues.
If a specialist is needed → she writes a structured handoff note.

---

### Step 5 — Feedback to EDIS

Validation outcome is logged:
```json
{
  "event": "ai_validation_result",
  "case_id": "...",
  "edis_differential_top": "...",
  "edis_confidence": 0.58,
  "validation_decision": "modified",
  "revised_top_differential": "...",
  "validation_agent": "dr-ngozi-okafor",
  "timestamp": "..."
}
```

This data feeds into the EDIS improvement pipeline.

---

### Step 6 — Patient Communication

Patient is kept informed:
> "Our AI has flagged your case for additional physician review to make sure you get the most accurate assessment. Dr. Ngozi Okafor is reviewing your case now."

Patient does not experience increased wait time in most cases (Dr. Ngozi responds in parallel with routine routing).

---

## SLA for AI Validation

| Trigger Type         | Validation Response Target |
|----------------------|----------------------------|
| Routine low-confidence| 5 minutes                 |
| High urgency + low confidence | 2 minutes           |
| Emergency + uncertain | Immediate — E2/E3 routing in parallel |

---

*AI Validation Workflow version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
