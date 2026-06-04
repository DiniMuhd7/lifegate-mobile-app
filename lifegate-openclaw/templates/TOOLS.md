# TOOLS.md Template
## LifeGate OpenClaw | Physician Agent Tools Template

---

## Usage

Copy this template into `agents/<physician-slug>/TOOLS.md`.

---

```markdown
# {{FULL_NAME}} — Clinical Tools
## LifeGate OpenClaw | Available Tools and Permissions

---

## Core Tools (All Agents)

All LifeGate physician agents have access to these tools:

| Tool                    | Purpose                                          |
|-------------------------|--------------------------------------------------|
| `vital_signs_review`    | Review patient-reported vitals                   |
| `drug_interaction_check`| Check drug-drug interactions                     |
| `allergy_check`         | Verify allergy status                            |
| `safe_prescribing_check`| Run all safety checks before issuing Rx         |
| `issue_prescription`    | Generate verified digital prescription           |
| `order_investigation`   | Request investigations with indication           |
| `issue_referral`        | Generate structured referral letter              |
| `facility_lookup`       | Find nearest appropriate facility                |
| `nhis_eligibility_check`| Check patient NHIS status                       |
| `patient_education_send`| Send targeted health education                  |
| `follow_up_schedule`    | Schedule follow-up appointment                  |
| `consensus_request`     | Request multi-agent review                      |
| `escalate_case`         | Trigger escalation to higher tier               |
| `handoff_note`          | Write structured handoff to another agent       |
| `audit_log_write`       | Write event to audit trail                      |

---

## Specialty Tools ({{FULL_NAME}})

In addition to core tools, {{FULL_NAME}} has access to:

{{SPECIALTY_TOOLS_TABLE}}

---

## Tool Usage Rules

1. `issue_prescription` — Only callable after `safe_prescribing_check` passes
2. `issue_referral` — Requires documented indication in case record
3. `escalate_case` — Must include escalation reason in call
4. `consensus_request` — Recommended when confidence < 80% on primary diagnosis
5. `crisis_escalate` — Mandatory on any T6 trigger; cannot be suppressed

---

## Tool Audit

Every tool call is automatically logged to the audit trail with:
- Tool name, agent ID, case ID, timestamp
- Input parameters and output summary
- Any flags raised

---

*LifeGate OpenClaw Framework | DSHub Nigeria*
```
