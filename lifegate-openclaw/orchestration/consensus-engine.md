# CONSENSUS ENGINE
## LifeGate OpenClaw | Multi-Physician Agreement System

---

## Purpose

The Consensus Engine coordinates deliberation between two or more physician
agents when a case requires multiple expert perspectives. It produces a
consolidated clinical opinion that supersedes any individual agent's output.

---

## When Consensus Is Triggered

| Trigger Condition                                | Action                                  |
|--------------------------------------------------|-----------------------------------------|
| Multi-specialty routing (≥ 2 agents assigned)    | Auto-consensus round                    |
| AI confidence < 65%                              | AI Validation + at least 1 specialist  |
| Physician requests second opinion                | Single-round consensus                  |
| Conflicting assessments between agents           | Conflict resolution round               |
| High-risk case (emergency, paediatric, obstetric)| Mandatory dual-agent sign-off           |
| Prescription involving high-risk medication      | Pharmacy + clinical validation          |

---

## Consensus Round Types

### 1. Standard Consensus (2 agents)
- Both agents independently assess the case
- Each submits: `assessment`, `treatment_plan`, `confidence` (0–100)
- Engine compares outputs:
  - If agreement ≥ 80%: merge and output unified plan
  - If agreement < 80%: trigger conflict resolution

### 2. Extended Consensus (3+ agents)
- Used for highly complex or high-stakes cases
- Majority-weighted agreement across all participants
- Primary agent writes final consolidated note

### 3. AI Validation Consensus
- `dr-ngozi-okafor` reviews EDIS triage output
- Confirms, modifies, or overrides AI differential
- Logs `ai_validation_result` with reasoning

### 4. Conflict Resolution Round
- Facilitated by the Orchestrator
- Each conflicting agent states reasoning
- Senior agent (by years_exp) makes final call
- Dissenting view recorded in audit trail

---

## Consensus Protocol Flow

```
FUNCTION consensus(case, agents):

  1. NOTIFY all assigned agents of consensus session
  2. FOR EACH agent:
       WAIT for assessment submission (deadline: 10 minutes)
       IF agent does not respond → mark ABSTAINED
  3. COMPUTE agreement_score across all submissions
  4. IF agreement_score >= 0.8:
       MERGE assessments → generate unified_plan
       LOG consensus_reached
  5. ELSE:
       TRIGGER conflict_resolution(case, agents)
  6. OUTPUT unified_assessment to case_manager
  7. NOTIFY patient: "A team of doctors has reviewed your case."
```

---

## Agreement Scoring

Agreement is calculated across these clinical dimensions:

| Dimension               | Weight |
|-------------------------|--------|
| Primary diagnosis match | 40%    |
| Treatment plan overlap  | 30%    |
| Urgency classification  | 20%    |
| Follow-up recommendation| 10%    |

---

## Unified Output Format

```json
{
  "consensus_type": "standard",
  "agents": ["dr-ibrahim-danladi", "dr-terseer-tyav"],
  "agreement_score": 0.91,
  "unified_assessment": "Acute coronary syndrome suspected.",
  "unified_plan": "Aspirin 300mg stat. Nitrates if BP > 90. Refer to cardiac centre.",
  "urgency": "E2",
  "dissenting_views": [],
  "timestamp": "<ISO8601>"
}
```

---

## Conflict Resolution Log

When agents disagree:

```json
{
  "conflict_agents": ["dr-a", "dr-b"],
  "point_of_disagreement": "Whether to prescribe antibiotics for viral illness",
  "resolution": "dr-ahmed-musa (senior) overrode — viral aetiology confirmed by presentation",
  "final_decision_agent": "dr-ahmed-musa",
  "resolved_at": "<ISO8601>"
}
```

---

## Consensus Transparency

All consensus decisions are:
- Stored in the case audit trail
- Accessible to the patient on request (their case summary)
- Reviewable by LifeGate clinical governance team
- Anonymised for quality improvement analytics

---

*Consensus Engine version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
