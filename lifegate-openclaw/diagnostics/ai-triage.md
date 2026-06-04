# AI TRIAGE ENGINE
## LifeGate OpenClaw | EDIS AI Clinical Triage System

---

## Purpose

This document describes the behaviour, inputs, outputs, and clinical constraints
of the EDIS (Extended Diagnostic Intelligence System) AI triage engine that
powers LifeGate's clinical decision support.

---

## What EDIS Does

EDIS is an AI-powered clinical triage engine that:
1. Receives patient-reported symptoms and context
2. Performs structured OLDCARTS history intake
3. Generates a ranked differential diagnosis list
4. Assigns an urgency score
5. Outputs structured clinical data for physician agent review

EDIS is **not** a replacement for physician judgement. It is a first-pass
clinical tool that supports, not replaces, the physician agent.

---

## EDIS Intake Protocol

For every clinical session, EDIS collects:

| Section              | Fields Collected                                              |
|----------------------|---------------------------------------------------------------|
| **Onset**            | When did it start? Sudden or gradual?                        |
| **Location**         | Where exactly? Does it spread?                               |
| **Duration**         | How long has it been present?                                |
| **Character**        | What does it feel like? (pain descriptors, etc.)             |
| **Aggravating**      | What makes it worse?                                         |
| **Relieving**        | What makes it better?                                        |
| **Timing**           | Constant or intermittent? Pattern?                           |
| **Severity**         | 0–10 scale                                                   |
| **PMH**              | Past medical history                                        |
| **Medications**      | Current medications + dosages                               |
| **Allergies**        | Drug and food allergies                                     |
| **Social history**   | Smoking, alcohol, occupation, travel                        |
| **Family history**   | Relevant hereditary conditions                              |
| **Review of systems**| Targeted systems based on primary complaint                 |

---

## EDIS Output Format

```json
{
  "session_id": "LG-2025-XXXXXXXX",
  "timestamp": "<ISO8601>",
  "presenting_complaint": "Severe headache for 3 days",
  
  "differential": [
    { "condition": "Migraine", "probability": 0.54, "urgency": "MEDIUM" },
    { "condition": "Tension headache", "probability": 0.28, "urgency": "LOW" },
    { "condition": "Meningitis", "probability": 0.09, "urgency": "HIGH" },
    { "condition": "Subarachnoid haemorrhage", "probability": 0.04, "urgency": "CRITICAL" },
    { "condition": "Hypertensive urgency", "probability": 0.05, "urgency": "HIGH" }
  ],

  "urgency_score": 62,
  "urgency_class": "HIGH",

  "red_flags": ["thunderclap headache", "neck stiffness query"],
  "confidence": 0.71,
  "low_confidence": false,

  "hpi_summary": "3-day severe headache, worst of life quality, associated neck pain. No prior similar. Fever: not reported.",

  "recommended_routing": "Neurology",
  "recommended_agent": "dr-babatunde-fasanya"
}
```

---

## Urgency Score Interpretation

| Score    | Class    | Meaning                                      |
|----------|----------|----------------------------------------------|
| 90–100   | CRITICAL | Life-threatening — emergency routing         |
| 70–89    | HIGH     | Serious — specialist routing, urgent SLA     |
| 40–69    | MEDIUM   | Significant — standard specialist routing   |
| 15–39    | LOW      | Moderate — may be managed by GP             |
| 0–14     | MINIMAL  | Mild — self-care guidance appropriate        |

---

## Medical Document Scan Rule

When a session is prefixed with `[Medical Document Scan]`:
- EDIS bypasses OLDCARTS intake
- Document is interpreted directly using medical language processing
- Findings are summarised in plain language
- Abnormal values / findings are flagged automatically
- Routing is determined by the document specialty (lab, radiology, etc.)

---

## Confidence and Validation

- EDIS confidence ≥ 80%: proceed with routing normally
- EDIS confidence 65–79%: route + flag for physician awareness
- EDIS confidence < 65%: trigger AI Validation flow (Dr. Ngozi Okafor)

---

## EDIS Limitations (Physician Agents Must Know)

1. EDIS cannot perform physical examination
2. EDIS cannot observe clinical signs (pallor, jaundice, oedema, etc.)
3. EDIS may underweight rare tropical/infectious conditions if data is limited
4. EDIS should not be the sole basis for dismissing serious diagnoses
5. Physician agents must always review and apply clinical judgement

---

## EDIS Improvement Loop

Every case where the physician changes the EDIS differential:
- Logged as `physician_override`
- Physician's reasoning captured
- Aggregated for EDIS model improvement (anonymised)

---

*AI Triage Engine version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
