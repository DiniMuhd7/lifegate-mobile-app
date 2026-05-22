# TOOLS: Dr. Osagie Omoruyi
## LifeGate OpenClaw | Available Tool Registry

---

## Overview

Dr. Osagie Omoruyi has access to the following LifeGate platform tools.
All tool calls are logged to the audit trail. Sensitive tools require
active patient consent before invocation.

**Total tools available: 9**

---

## Tool List

- `mental_health_screener`
- `addiction_screener`
- `patient_history`
- `prescription_engine`
- `drug_interaction`
- `escalation_trigger`
- `report_generator`
- `follow_up_scheduler`
- `lifecoins_nudge`

---

## Tool Definitions

### Clinical Assessment Tools

| Tool | Description |
|------|-------------|
| `symptom_analysis` | Structured OLDCARTS symptom intake with severity scoring (0–10) |
| `differential_diagnosis` | Generates ranked differential list with confidence scores and reasoning |
| `ai_triage_review` | Review, validate, modify, or override EDIS AI triage output |
| `risk_scoring` | Validated risk calculators: CURB-65, Wells, HEART, Glasgow, qSOFA, SOFA, Bishop |
| `vital_signs` | Vital sign trending with Early Warning Score (NEWS2) calculation |
| `pain_scoring` | NRS, VAS, BPI, LANSS neuropathic pain assessment |

### Diagnostic Tools

| Tool | Description |
|------|-------------|
| `lab_interpretation` | Lab result interpretation with Nigerian reference ranges |
| `ecg_analysis` | ECG/EKG rhythm interpretation and ischaemia detection |
| `imaging_review` | Radiology and imaging report review (X-ray, USS, CT, MRI) |
| `pathology_review` | Biopsy, histology, and cytology report interpretation |
| `eye_diagnostics` | Vision acuity, astigmatism, colour vision, contrast sensitivity |
| `hearing_diagnostics` | Audiogram interpretation, hearing loss classification |
| `audiometry_tools` | Pure-tone average, speech discrimination, tympanometry |
| `dermatology_vision` | AI-assisted skin lesion classification review |

### Specialty Tools

| Tool | Description |
|------|-------------|
| `obstetric_calculator` | Gestational age, EDD, obstetric risk scoring |
| `renal_calculator` | GFR, creatinine clearance, renal dosing adjustment |
| `oncology_staging` | TNM cancer staging criteria and staging summaries |
| `growth_charts` | Paediatric growth plotting (WHO charts, Nigerian percentiles) |
| `nutrition_analysis` | Dietary assessment with culturally adapted Nigerian guidance |
| `mental_health_screener` | PHQ-9, GAD-7, AUDIT-C, C-SSRS, CAGE |
| `addiction_screener` | CAGE, AUDIT, DAST, DSM-5 substance use criteria |
| `fertility_assessment` | Semen analysis, hormonal profile, ovulation tracking |
| `sleep_analysis` | Sleep quality scoring and sleep hygiene recommendations |
| `physiotherapy_protocol` | Evidence-based exercise and rehabilitation protocols |
| `sports_assessment` | Injury risk, return-to-play, functional movement screening |
| `wound_assessment` | Wound type, healing progress, infection risk scoring |
| `surgical_risk` | ASA classification, RCRI, P-POSSUM surgical risk scoring |
| `dental_assessment` | Oral health scoring, caries risk, periodontal assessment |
| `palliative_score` | Palliative Performance Scale, Edmonton Symptom Assessment |
| `occupational_risk` | Workplace hazard assessment and occupational exposure tracking |
| `public_health_tracker` | Nigerian disease trend monitoring and outbreak alerts |

### Patient Management Tools

| Tool | Description |
|------|-------------|
| `patient_history` | Longitudinal records, past diagnoses, medications, allergies |
| `medical_knowledge` | Evidence-based knowledge retrieval — Nigerian clinical context |
| `prescription_engine` | Medication recommendations with dosage, interactions, NAFDAC check |
| `drug_interaction` | Drug-drug and drug-disease interaction checker |
| `allergy_checker` | Verify patient allergy profile before prescribing |
| `follow_up_scheduler` | Schedule and manage follow-up consultations |
| `report_generator` | Diagnosis reports, care plans, discharge summaries, PDF export |
| `referral_system` | Structured referral letter generation to specialists and hospitals |

### Platform & Safety Tools

| Tool | Description |
|------|-------------|
| `escalation_trigger` | Trigger emergency escalation tiers with time-stamped alerts |
| `emergency_protocol` | Load and execute emergency care protocols |
| `notification_system` | Push updates to patients, physicians, and coordinators |
| `audit_logger` | Immutable clinical decision audit trail (required for all actions) |
| `explainability_engine` | Plain-language AI reasoning summaries for clinical review |
| `consensus_engine` | Initiate multi-physician consensus for complex or borderline cases |
| `telemedicine_coordinator` | Consultation handoffs and virtual care scheduling |

### Engagement Tools

| Tool | Description |
|------|-------------|
| `lifecoins_nudge` | Issue Lifecoins reward prompts for preventive care engagement |
| `checkin_system` | Review patient daily check-in data and wellness streaks |

---

## Data Access Controls

- Patient data is accessed **only for active cases** assigned to this agent
- All tool calls touching PII are logged with patient consent status
- Prescriptions require double-verification before issuance
- Audit logger must be healthy before any clinical tool can be invoked
- Tool access tokens expire after 8 hours and must be renewed

---

*Tools version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
