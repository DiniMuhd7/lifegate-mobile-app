# WORKFLOW ENGINE
## LifeGate OpenClaw | Clinical Workflow Automation

---

## Purpose

The Workflow Engine automates the step-by-step clinical processes that occur
within each case type. Rather than ad-hoc interactions, each case follows a
defined workflow that ensures consistency, completeness, and safety.

---

## Core Workflows

| Workflow Name              | Trigger                        | Agents Involved                |
|----------------------------|--------------------------------|--------------------------------|
| `patient_intake`           | New session created            | Triaged agent + EDIS           |
| `standard_consultation`    | Normal routing completed       | Primary physician              |
| `emergency_response`       | Urgency ≥ E3                   | Emergency + specialist         |
| `multi_agent_review`       | Multi-specialty flag           | All assigned agents            |
| `ai_validation_flow`       | Low-confidence triage          | Dr. Ngozi + primary agent      |
| `prescription_flow`        | Medication prescribed          | Physician + case manager       |
| `follow_up_flow`           | Follow-up flag set             | Same physician (or GM)         |
| `escalation_flow`          | Escalation triggered           | Per escalation tier            |
| `investigation_flow`       | Tests ordered                  | Physician + notifications      |

---

## Workflow: Standard Consultation

```
STEP 1 — INTAKE
  Patient submits session (symptoms, category, scan/test results)
  EDIS produces: differential, urgency score, HPI flags
  
STEP 2 — TRIAGE REVIEW
  Router assigns primary physician
  Physician reviews EDIS output + patient history

STEP 3 — HISTORY EXPANSION
  Physician asks targeted follow-up questions (≤ 5)
  Patient responds (text or voice)
  Physician updates HPI in case record

STEP 4 — CLINICAL ASSESSMENT
  Physician writes structured assessment:
    - Primary diagnosis
    - Differential diagnoses
    - Clinical reasoning

STEP 5 — MANAGEMENT PLAN
  Physician writes:
    - Investigations (if required)
    - Treatment plan
    - Prescription (if indicated)
    - Lifestyle and preventive advice

STEP 6 — PATIENT COMMUNICATION
  Physician delivers plain-language explanation
  Uses: diagnosis name, cause, what to do, when to worry

STEP 7 — RESOLUTION + FOLLOW-UP
  Case marked RESOLVED
  Case summary generated
  Follow-up scheduled (if indicated)
  Audit record finalised
```

---

## Workflow: Prescription Flow

```
STEP 1 — PHYSICIAN WRITES PRESCRIPTION
  Fields required: drug name, dose, route, frequency, duration, indication

STEP 2 — SAFETY VALIDATION
  Check: allergy conflict
  Check: pregnancy contraindications (if patient pregnant)
  Check: paediatric dosing (if patient < 18)
  Check: renal/hepatic adjustments (if applicable)

STEP 3 — DRUG INTERACTION SCREENING
  Compare against patient's current medication list
  Flag any Class A/B/C interactions

STEP 4 — APPROVAL
  If no flags → auto-approve and write to case record
  If flags → physician must explicitly confirm with reasoning

STEP 5 — PATIENT DELIVERY
  Prescription displayed in-app in clear format
  Pharmacy locator shown (nearest NHIS-enrolled pharmacy)
  Patient reminded: "Take medications exactly as prescribed."
```

---

## Workflow: Investigation Flow

```
STEP 1 — PHYSICIAN ORDERS TEST
  Test name, urgency (routine / urgent), clinical indication

STEP 2 — PATIENT NOTIFICATION
  In-app: "Your doctor has requested [test]. Here's how to get it done."
  Nearest partner lab or facility displayed

STEP 3 — RESULT UPLOAD
  Patient uploads result (photo / PDF)
  OR lab integrates directly (future)

STEP 4 — AI PRE-INTERPRETATION
  Structured results parsed by diagnostic engine
  Abnormal values flagged automatically

STEP 5 — PHYSICIAN REVIEW
  Physician receives parsed + flagged result
  Reviews and updates clinical record accordingly

STEP 6 — CASE UPDATE
  Case record updated
  Patient notified: "Your doctor has reviewed your test results."
```

---

## Workflow: Follow-Up Flow

```
STEP 1 — FOLLOW-UP SCHEDULED
  Date/time set at case resolution
  Patient notified in-app + reminder sent 24h before

STEP 2 — FOLLOW-UP SESSION
  Patient prompted to report progress:
    - Symptom change
    - Medication adherence
    - Any new concerns

STEP 3 — PHYSICIAN REVIEW
  Same physician reviews follow-up notes
  If improving → close case
  If not improving → re-triage or escalate

STEP 4 — OUTCOME RECORDING
  Final outcome documented
  Any chronic disease flags updated on patient profile
```

---

## Workflow State Machine

```
[PENDING] → [IN_PROGRESS] → [AWAITING_INPUT] → [IN_PROGRESS] → [COMPLETE]
                                    ↑                ↓
                              [TIMED_OUT] → [ESCALATED]
```

- `AWAITING_INPUT`: Waiting on patient response or investigation result
- `TIMED_OUT`: No patient response in 30 minutes — case paused, patient notified
- `ESCALATED`: Clinical condition worsened; new routing triggered

---

*Workflow Engine version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
