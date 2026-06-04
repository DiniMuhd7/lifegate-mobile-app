# TOOLS REGISTRY
## LifeGate OpenClaw | Clinical Tool Definitions

---

## Purpose

This registry defines all clinical tools available to physician agents within
the OpenClaw framework. Each tool has a unique ID, description, and the agents
authorised to use it.

---

## Tool Categories

- **DIAG** — Diagnostic tools
- **RX** — Prescribing tools
- **REF** — Referral tools
- **EDU** — Patient education tools
- **MON** — Monitoring tools
- **COORD** — Coordination tools

---

## Full Tool Registry

| Tool ID                  | Category | Description                                              |
|--------------------------|----------|----------------------------------------------------------|
| `vital_signs_review`     | DIAG     | Review patient-reported vital signs (BP, temp, HR, SpO2)|
| `malaria_rdt_interp`     | DIAG     | Interpret malaria rapid diagnostic test results          |
| `blood_film_interp`      | DIAG     | Interpret malaria blood film result                      |
| `fbc_analysis`           | DIAG     | Analyse full blood count results                         |
| `ecg_interpretation`     | DIAG     | Interpret ECG findings (image or text report)            |
| `echo_review`            | DIAG     | Review echocardiogram report                             |
| `ct_brain_review`        | DIAG     | Review CT brain report                                   |
| `mri_spine_review`       | DIAG     | Review MRI spine report                                  |
| `xray_review`            | DIAG     | Review chest / other X-ray report                        |
| `audiogram_interp`       | DIAG     | Interpret pure tone audiogram                            |
| `visual_acuity_interp`   | DIAG     | Interpret visual acuity test results                     |
| `fundoscopy_review`      | DIAG     | Review fundoscopy findings                               |
| `skin_lesion_analysis`   | DIAG     | AI-assisted skin lesion pattern analysis                 |
| `lft_analysis`           | DIAG     | Analyse liver function tests                             |
| `rft_analysis`           | DIAG     | Analyse renal function tests                             |
| `lipid_panel_interp`     | DIAG     | Interpret lipid panel results                            |
| `hba1c_interp`           | DIAG     | Interpret HbA1c level                                    |
| `thyroid_panel_interp`   | DIAG     | Interpret TFT/thyroid function tests                     |
| `urine_analysis`         | DIAG     | Analyse urinalysis results                               |
| `hiv_test_interp`        | DIAG     | Interpret HIV rapid test result                          |
| `tb_test_interp`         | DIAG     | Interpret GeneXpert / sputum AFB result                  |
| `hepatitis_panel_interp` | DIAG     | Interpret hepatitis B/C serology                         |
| `mental_health_screen`   | DIAG     | Administer PHQ-9, GAD-7, AUDIT, CAGE screening tools    |
| `paediatric_growth_chart`| DIAG     | Plot weight/height against WHO growth charts             |
| `nutritional_assessment` | DIAG     | Assess MUAC, weight-for-height, dietary history          |
| `pap_smear_interp`       | DIAG     | Interpret cervical cytology report                       |
| `prenatal_ultrasound_rev`| DIAG     | Review obstetric ultrasound findings                     |
| `drug_interaction_check` | DIAG     | Check drug-drug interactions from medication list        |
| `allergy_check`          | DIAG     | Verify allergy status against proposed medication        |
| `safe_prescribing_check` | RX       | Validate prescription against all safety rules           |
| `issue_prescription`     | RX       | Generate verified digital prescription                   |
| `order_investigation`    | DIAG     | Order lab tests or imaging with clinical indication      |
| `issue_referral`         | REF      | Generate structured referral letter                      |
| `facility_lookup`        | REF      | Find nearest appropriate healthcare facility             |
| `nhis_eligibility_check` | REF      | Check if patient is NHIS-enrolled and coverage details   |
| `patient_education_send` | EDU      | Send targeted health education content to patient        |
| `medication_counselling` | EDU      | Deliver medication instructions and counselling to patient|
| `follow_up_schedule`     | MON      | Schedule and confirm follow-up appointment               |
| `chronic_disease_tracker`| MON      | Update and review chronic disease parameters             |
| `outbreak_alert_flag`    | COORD    | Flag suspected outbreak for public health team           |
| `consensus_request`      | COORD    | Request multi-agent consensus review                     |
| `escalate_case`          | COORD    | Trigger escalation to higher tier                        |
| `handoff_note`           | COORD    | Write structured handoff to another agent                |
| `crisis_escalate`        | COORD    | Trigger T6 mental health crisis protocol                 |
| `audit_log_write`        | COORD    | Write clinical event to audit trail                      |

---

## Tool Access by Department

| Dept Code | Always Available Tools                                      |
|-----------|-------------------------------------------------------------|
| ALL       | vital_signs_review, drug_interaction_check, allergy_check, safe_prescribing_check, issue_prescription, order_investigation, issue_referral, facility_lookup, nhis_eligibility_check, patient_education_send, follow_up_schedule, consensus_request, escalate_case, handoff_note, audit_log_write |
| EM        | + crisis_escalate, outbreak_alert_flag                     |
| CARD      | + ecg_interpretation, echo_review, lipid_panel_interp      |
| NEURO     | + ct_brain_review, mri_spine_review, mental_health_screen  |
| PSYCH     | + mental_health_screen, crisis_escalate                    |
| PAED      | + paediatric_growth_chart, nutritional_assessment          |
| OBGYN     | + prenatal_ultrasound_rev, pap_smear_interp                |
| ENDO      | + hba1c_interp, thyroid_panel_interp, rft_analysis         |
| GASTRO    | + lft_analysis, urine_analysis                             |
| ID        | + hiv_test_interp, tb_test_interp, hepatitis_panel_interp, outbreak_alert_flag |
| OPHTH     | + visual_acuity_interp, fundoscopy_review, skin_lesion_analysis |
| ENT       | + audiogram_interp                                          |
| SURG      | + xray_review, ct_brain_review, fbc_analysis               |
| PH        | + outbreak_alert_flag, nutritional_assessment              |

---

*Tools Registry version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
