# PATIENT INTAKE WORKFLOW
## LifeGate OpenClaw | Step-by-Step Patient Intake Process

---

## Overview

This workflow describes the complete patient intake experience from the moment
a patient opens a session in LifeGate to the point they are connected with
an appropriate physician agent.

---

## Workflow Steps

### Step 1 — Session Initiation

Patient opens the LifeGate app and selects a care category:
- Clinical Diagnosis
- Eye Check-Up
- Hearing Test
- Mental Health Support
- Child Health
- Maternal Health
- Chronic Disease Management
- General Wellness

**System action:**
- Load patient profile (existing health history, medications, allergies)
- Check patient consent status
- Initialise case record: `case_id`, `timestamp`, `category`

---

### Step 2 — Symptom Collection

Patient is guided through a symptom input form:
- Primary complaint (free text + symptom picker)
- Symptom duration
- Severity (0–10 slider)
- Associated symptoms (from guided checklist)
- Photos / documents (if scan category)

**System action:**
- Validate inputs
- Store raw symptom data in case record

---

### Step 3 — EDIS AI Triage

The EDIS engine processes symptom data:
1. Runs OLDCARTS analysis on symptom text
2. Generates ranked differential diagnoses
3. Computes urgency score
4. Detects red flag conditions

**Output:**
- Differential list (top 3–5 conditions with probabilities)
- Urgency score (0–100)
- Red flags (if present)
- Confidence score
- Recommended routing

**Time target:** < 3 seconds

---

### Step 4 — Urgency Triage

Based on urgency score:

| Score     | Action                                              |
|-----------|-----------------------------------------------------|
| ≥ 95      | Immediately display emergency instructions + E1 routing |
| 85–94     | E2 routing — notify emergency physician immediately |
| 70–84     | E3 routing — urgent specialist                      |
| < 70      | Standard routing per specialty-map.md               |

---

### Step 5 — Patient Notification

Patient is shown:
- Who is being assigned to their case (physician name + specialty)
- Estimated response time
- What to expect next

Example notification:
> "Dr. Bassey Efiong, our Infectious Disease specialist, is reviewing
> your case now. You'll hear from him in about 5 minutes."

---

### Step 6 — Physician Handoff

Physician agent receives:
- Full case record including EDIS differential
- Patient profile (age, sex, medical history, allergies, medications)
- Urgency score and red flags
- Session category and any uploaded files

---

### Step 7 — Consultation Begins

Physician sends greeting (per BOOTSTRAP.md protocol) and consultation begins.

---

## Error Handling

| Error Condition                      | Action                                    |
|--------------------------------------|-------------------------------------------|
| No agents available                  | Queue patient; notify of wait time        |
| EDIS engine unavailable              | Flag for manual triage; route to GM       |
| Patient disconnects during triage    | Hold case for 30 min; notify patient      |
| Incomplete symptom data              | Prompt patient to complete required fields|

---

*Patient Intake Workflow version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
