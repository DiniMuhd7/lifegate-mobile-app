# CASE MANAGER
## LifeGate OpenClaw | Clinical Case Management System

---

## Purpose

The Case Manager is responsible for maintaining the clinical record of each
consultation — tracking what was presented, what was assessed, what was
recommended, and what outcomes were achieved. It is the clinical memory of
the OpenClaw framework.

---

## Case Record Structure

Every case contains the following clinical sections:

```json
{
  "case_id": "LG-2025-xxxxxxxx",
  "patient_id": "<hashed>",
  "created_at": "<ISO8601>",
  "category": "clinical_diagnosis",
  "urgency": "MEDIUM",
  "status": "ACTIVE",

  "triage": {
    "ai_differential": ["Malaria", "Typhoid fever", "Viral fever"],
    "ai_confidence": 0.78,
    "urgency_score": 52,
    "flags": []
  },

  "routing": {
    "primary_agent": "dr-bassey-efiong",
    "secondary_agents": ["dr-ahmed-musa"],
    "rule_applied": 2,
    "load_balanced": false
  },

  "clinical_record": {
    "presenting_complaint": "5-day fever, chills, body pain",
    "hpi": { "onset": "5 days", "severity": "7/10", ... },
    "history": { "pmh": [], "medications": [], "allergies": [] },
    "examination_notes": "",
    "investigations_ordered": ["Malaria RDT", "Blood film", "FBC"],
    "physician_assessment": "",
    "treatment_plan": "",
    "prescription": null
  },

  "outcome": {
    "resolution": "diagnosed_and_treated",
    "follow_up_required": true,
    "follow_up_date": "<date>",
    "patient_satisfaction": null
  },

  "audit_trail": []
}
```

---

## Case Manager Responsibilities

### 1. Record Initialisation
- On case creation, seed case record from EDIS triage output
- Link patient health profile from LifeGate user account
- Assign unique case ID (`LG-YYYY-XXXXXXXX`)

### 2. Clinical Record Updates
- Accept structured input from physician agents
- Validate required fields before marking case COMPLETE
- Prevent overwriting of locked fields after resolution

### 3. Investigation Tracking
When a physician orders investigations:
- Log investigation to `investigations_ordered`
- Notify patient via in-app alert
- When result received: update `clinical_record` and re-notify physician

### 4. Prescription Management
If a prescription is issued:
- Validate prescription against clinical safety rules (see `compliance/`)
- Validate for drug interactions using LifeGate formulary
- Log to `prescription_log`
- Mark `has_prescription = true` in case record

### 5. Outcome Recording
On case resolution:
- Physician must complete `physician_assessment` and `treatment_plan`
- `follow_up_required` flag triggers scheduling engine
- Case summary generated for patient (plain-language, structured)

---

## Required Completion Fields

Before a case can be marked RESOLVED, the following must be populated:

| Field                   | Required For                        |
|-------------------------|-------------------------------------|
| `presenting_complaint`  | All cases                           |
| `physician_assessment`  | All cases                           |
| `treatment_plan`        | All cases                           |
| `investigations_ordered`| Cases with diagnostic workup        |
| `prescription`          | Cases with medication prescribed    |
| `follow_up_date`        | Cases flagged `follow_up_required`  |

---

## Case Retention Policy

| Case Type             | Retention Period     |
|-----------------------|----------------------|
| Standard consultation | 7 years              |
| Emergency case        | 10 years             |
| Paediatric case       | Until patient age 25 |
| Mental health case    | 10 years             |
| Prescription record   | 7 years              |

Records are encrypted at rest. Patient access governed by consent management.

---

## Case Summary (Patient-Facing)

On resolution, a plain-language case summary is generated:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LifeGate Consultation Summary
  Case ID: LG-2025-XXXX | Date: [date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Doctor: Dr. Bassey Efiong (Infectious Disease)
  Your concern: 5-day fever with body pain and chills.

  Assessment:
  Based on your symptoms and location, you likely have
  malaria. The AI triage and your doctor's review agree.

  Next steps:
  1. Take the ACT (Artemether-Lumefantrine) as prescribed.
  2. Return if fever does not break within 48 hours.
  3. Follow-up scheduled: 17 May 2025.

  ⚠ Emergency: If you develop confusion, fits, or cannot
    breathe properly, go to a hospital immediately or call 112.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*Case Manager version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
