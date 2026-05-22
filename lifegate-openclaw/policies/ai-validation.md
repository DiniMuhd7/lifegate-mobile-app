# AI VALIDATION POLICY
## LifeGate OpenClaw | AI Clinical Decision Support Governance

---

## Purpose

This policy governs how AI-generated clinical outputs are validated, used,
and overridden within the LifeGate OpenClaw framework. It ensures AI is
deployed responsibly and safely in a Nigerian clinical context.

---

## AI Tools in Use

| Tool                        | Function                                            | Oversight Required |
|-----------------------------|-----------------------------------------------------|--------------------|
| EDIS Triage Engine          | Symptom → differential + urgency score             | Yes — physician review |
| Medical Document OCR        | Extract clinical data from uploaded documents      | Yes — physician confirms |
| Lab Value Flagging          | Flag abnormal values in test results               | Yes — physician interprets|
| Skin Lesion AI Assist       | Pattern analysis for dermatology images            | Yes — physician diagnoses|
| Drug Interaction Checker    | Detect medication conflicts                        | Yes — physician decides  |
| Outbreak Signal Detection   | Aggregate trend monitoring                         | Public health physician review |

---

## AI Output Trust Levels

| EDIS Confidence | Trust Level | Action Required                                          |
|-----------------|-------------|----------------------------------------------------------|
| ≥ 85%           | HIGH        | Proceed; physician reviews and confirms or adjusts       |
| 65–84%          | MEDIUM      | Proceed with caution; physician flags uncertainty        |
| < 65%           | LOW         | Trigger AI Validation flow (Dr. Ngozi Okafor reviews)   |
| Contradicted by physician | Override | Override logged; EDIS feedback loop activated |

---

## AI Validation Flow

When EDIS confidence < 65% or a physician flags concerns:

```
STEP 1 — ROUTE TO DR. NGOZI OKAFOR (AI Validation Lead)
  She receives:
  - Original patient complaint
  - EDIS differential + confidence scores
  - Any physician notes already submitted

STEP 2 — DR. NGOZI REVIEWS
  Options:
  a) Confirm EDIS differential → proceed normally
  b) Modify differential → updated differential proceeds
  c) Reject differential → new triage with different questions
  d) Escalate to consensus → 2+ specialists review

STEP 3 — LOG VALIDATION OUTCOME
  ai_validation_result: confirmed / modified / rejected
  reasoning: documented by Dr. Ngozi

STEP 4 — EDIS FEEDBACK
  Validation outcomes are fed back to EDIS improvement pipeline
```

---

## Prohibited AI Behaviours

The EDIS system and all AI components are explicitly prohibited from:

1. ❌ Making final diagnoses without physician confirmation
2. ❌ Prescribing medication (AI may suggest; only physician agent prescribes)
3. ❌ Issuing referral letters (physician-only action)
4. ❌ Dismissing red-flag symptoms without physician involvement
5. ❌ Accessing patient data for any purpose outside active case
6. ❌ Generating clinical responses without physician involvement in high-risk cases

---

## Physician Override Rights

Physicians may override any AI output. An override:
- Is always valid — physician clinical judgement supersedes AI
- Must be documented with brief clinical reasoning
- Is logged as `physician_override`
- Does NOT affect the physician's performance score adversely
- Is used ONLY for EDIS improvement (anonymised)

---

## AI Model Transparency

Patients are always informed:
- That AI assists in their triage
- That a human physician reviews all AI outputs
- That they may request human-only review at any time
- What the AI's differential was (included in case summary)

---

## AI Review Cycle

| Activity                         | Frequency          |
|----------------------------------|--------------------|
| Physician override rate review   | Weekly             |
| EDIS accuracy assessment         | Monthly            |
| AI confidence calibration check  | Quarterly          |
| Full model revalidation          | Annually           |
| Post-outbreak AI performance review | After any outbreak event |

---

*AI Validation Policy version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
