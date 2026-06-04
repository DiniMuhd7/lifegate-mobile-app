# CLINICAL SAFETY POLICY
## LifeGate OpenClaw | Clinical Safety Governance

---

## Purpose

This document establishes the clinical safety standards that all physician
agents, AI systems, and workflows within the OpenClaw framework must comply
with. Patient safety is the non-negotiable foundation of all LifeGate services.

---

## Core Safety Principles

1. **First, do no harm.** No clinical action taken within LifeGate should increase risk to the patient.
2. **Human oversight.** AI is always subordinate to physician judgement. Physicians may override any AI recommendation.
3. **Safe prescribing.** No medication is prescribed without checking allergy, interactions, and indication.
4. **Escalation over dismissal.** When in doubt, escalate. Never dismiss a concerning symptom without clinical justification.
5. **Transparency to patient.** Patients must always understand what is happening with their care.
6. **Documentation of reasoning.** Every clinical decision must have documented clinical reasoning.

---

## Safe Prescribing Rules

These rules are enforced programmatically and cannot be bypassed:

| Rule                                       | Action                                        |
|--------------------------------------------|-----------------------------------------------|
| Drug matches known patient allergy         | BLOCKED — physician must confirm override     |
| Class A drug interaction detected          | BLOCKED — physician must confirm override     |
| Class B drug interaction detected          | WARNING — physician must acknowledge          |
| Pregnancy contraindication detected        | WARNING — physician must explicitly confirm   |
| Paediatric dose outside safe range        | BLOCKED — must enter adjusted dose           |
| Renal dose adjustment required             | WARNING — creatinine/GFR must be noted        |
| Antibiotic without documented indication   | WARNING — indication must be stated           |
| Controlled substance prescribed            | BLOCKED — LifeGate does not support           |

---

## Red Flag Dismissal Protocol

Physician agents must **never** dismiss the following without explicit documented clinical reasoning:

| Red Flag Symptom                        | Reason Must Address                           |
|-----------------------------------------|-----------------------------------------------|
| "Worst headache of my life"             | Must rule out SAH / meningitis explicitly     |
| Unexplained weight loss > 5 kg          | Must address malignancy possibility           |
| Haemoptysis (coughing blood)            | Must address TB / malignancy                  |
| Rectal bleeding in adults > 40          | Must address colorectal cancer risk           |
| New breast lump                         | Must advise physical examination + imaging    |
| Dysphagia (difficulty swallowing)       | Must rule out oesophageal pathology           |
| Sudden onset hearing loss               | Must escalate to ENT urgently                 |
| Suicidal statement (any)                | Must trigger T6 crisis protocol (no exceptions)|

---

## Medication Safety — Nigerian Context

Physician agents are trained on Nigeria-specific safety considerations:

- **Artemisinin resistance:** Only WHO-approved ACTs for malaria (not mono-therapy)
- **Chloroquine:** Only for prophylaxis in specific contexts; not routine malaria treatment
- **Metronidazole in early pregnancy:** Avoid in first trimester where possible
- **NSAIDs in elderly + renal:** High risk — prefer paracetamol first line
- **Herbal interactions:** Ask about concurrent traditional medicine use for all patients
- **Counterfeit medications:** Advise patients to purchase only from NAFDAC-registered outlets

---

## Physician Agent Safety Accountability

Every physician agent is personally accountable for:
1. Reading and following this safety policy
2. Completing all required fields before marking a case complete
3. Escalating when clinical complexity exceeds their confidence
4. Flagging any safety gaps they observe in the system

Safety violations by physician agents are reviewed by clinical governance.

---

## Safety Incident Reporting

Any safety concern — near miss, adverse event, or system failure — must be:
1. Reported via LifeGate safety incident portal
2. Reviewed within 48 hours by clinical governance
3. Root-cause analysed and corrective action documented
4. Communicated to affected physician agents
5. Retained in quality improvement log (minimum 10 years)

---

*Clinical Safety Policy version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
