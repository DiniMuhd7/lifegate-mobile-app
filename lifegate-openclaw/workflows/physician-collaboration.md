# PHYSICIAN COLLABORATION WORKFLOW
## LifeGate OpenClaw | Multi-Agent Case Collaboration Process

---

## Overview

This workflow describes how two or more physician agents collaborate on a
complex case — from consensus request through to unified clinical output.

---

## When Collaboration Is Used

| Scenario                                       | Agents Involved                              |
|------------------------------------------------|----------------------------------------------|
| Multi-specialty presentation                   | All matching specialty agents                |
| AI confidence < 65%                            | Dr. Ngozi + primary specialty agent          |
| Physician requests second opinion              | Primary agent + any relevant second agent    |
| High-risk case (emergency, obstetric, paed)    | Specialist + emergency physician             |
| Prescription dispute / uncertainty             | Prescribing physician + relevant specialist  |
| Conflicting assessments                        | All involved agents + senior resolution      |

---

## Workflow Steps

### Step 1 — Collaboration Request

Initiated by:
- Automatic routing (multi-specialty flag by router)
- Physician agent calls `consensus_request` tool
- AI Validation Lead escalates to consensus
- Orchestrator detects disagreement between active agents

---

### Step 2 — Consensus Session Created

The Consensus Engine:
1. Creates a shared workspace for the case
2. Notifies all invited agents with:
   - Case summary
   - EDIS differential
   - Patient profile
   - Any prior physician notes
3. Sets deadline: **10 minutes** for all agents to submit assessments

---

### Step 3 — Independent Assessment

Each invited agent independently reviews the case and submits:
```json
{
  "agent": "dr-ibrahim-danladi",
  "primary_diagnosis": "Hypertensive heart failure",
  "differential": ["Hypertensive heart failure", "Dilated cardiomyopathy"],
  "confidence": 0.82,
  "treatment_plan": "Diuretics + ACE inhibitor. Refer for echo.",
  "urgency": "HIGH",
  "consensus_notes": "BP 180/110 on history is key — treat hypertension first."
}
```

Agents do NOT see each other's assessments during the submission window.

---

### Step 4 — Consensus Engine Comparison

After deadline (or when all agents submit):

1. Compute agreement score across all submissions
2. If agreement ≥ 80%: merge into unified plan
3. If agreement < 80%: trigger conflict resolution

---

### Step 5 — Unified Plan Creation

Primary agent (most senior or first assigned) writes the unified plan:
- Merges overlapping elements
- Notes areas of strong consensus
- Documents any residual uncertainty

Example unified output:
```
CONSENSUS ASSESSMENT:
Primary diagnosis: Hypertensive heart failure (high confidence, 2/2 agents agree)
Treatment: Furosemide 40mg oral daily + Enalapril 5mg daily
Investigation: Echo + renal function + ECG
Follow-up: 7 days or sooner if worsening
Uncertainty: Cardiomyopathy cannot be fully excluded without echo

Agents: Dr. Ibrahim Danladi, Dr. Terseer Tyav
Agreement score: 0.88
```

---

### Step 6 — Patient Communication

Primary agent delivers unified plan to patient:
> "I've reviewed your case with one of our other specialists, and here
> is what we both agree on..."

Patient is told only that their case was reviewed by a team — individual
agent names are shared for transparency.

---

### Step 7 — Conflict Resolution (if needed)

If agents cannot reach 80% agreement:
1. Each agent states reasoning clearly
2. Senior agent (by years_exp) makes final call
3. Dissenting view is documented in audit trail but not shown to patient
4. Conflict resolution reason documented

---

### Step 8 — Collaboration Audit

All consensus sessions are logged:
- Agents involved, agreement score, unified plan
- Whether conflict occurred and how resolved
- Time from trigger to unified plan delivery

---

*Physician Collaboration Workflow version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
