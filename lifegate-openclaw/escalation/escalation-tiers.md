# ESCALATION TIERS
## LifeGate OpenClaw | Clinical Escalation Framework

---

## Purpose

The Escalation System manages cases where the initial physician assignment is
insufficient — due to clinical complexity, patient deterioration, SLA breach,
or a need for human or emergency intervention.

---

## Escalation Tier Structure

| Tier | Name                  | Trigger Conditions                               | Response              |
|------|-----------------------|--------------------------------------------------|-----------------------|
| T0   | Self-Resolving        | Mild case, patient improves, no action needed    | Close case            |
| T1   | Specialist Handoff    | Case exceeds GP scope, needs specialist          | Route to specialist   |
| T2   | Multi-Agent Consensus | Complex case, conflicting differentials          | Consensus engine      |
| T3   | Senior Escalation     | High complexity, high risk, unusual presentation | Senior + consensus    |
| T4   | Emergency Escalation  | Patient deterioration, vital signs concern       | Emergency routing     |
| T5   | Human Escalation      | Requires hospital admission / physical exam      | Human admin alert     |
| T6   | Crisis Escalation     | Mental health emergency / imminent self-harm     | Crisis protocol       |

---

## Tier 1 — Specialist Handoff

**Trigger:**
- General physician assesses case as outside GP scope
- Initial routing was incorrect (agent self-flags)
- Patient condition reveals specialist-grade complexity

**Action:**
1. Current physician writes handoff note
2. Orchestrator re-routes to appropriate specialist
3. Case record is carried forward intact
4. Patient notified: "You're being connected to a [specialty] specialist."
5. Original physician remains CC'd

---

## Tier 2 — Multi-Agent Consensus

**Trigger:**
- AI confidence < 65%
- Multi-specialty differential
- Physician explicitly requests review

**Action:**
1. Consensus Engine activated
2. All relevant agents notified and invited to review
3. 10-minute submission window
4. Unified plan produced and sent to case manager

---

## Tier 3 — Senior Escalation

**Trigger:**
- Rare or highly complex presentation
- Specialist is uncertain after review
- High-risk drug interactions or unusual drug response
- Paediatric emergency with complex comorbidities

**Action:**
1. Case flagged SENIOR_REVIEW
2. Most experienced available physician in the relevant specialty takes lead
3. If no senior available: activate cross-specialty senior
4. Consensus Engine runs mandatory round
5. All decisions documented with explicit clinical reasoning

---

## Tier 4 — Emergency Escalation

**Trigger:**
- Patient reports worsening symptoms during consultation
- Vital signs reported outside safe range
- Physician identifies imminent life-threatening condition
- Automated urgency score increases mid-case

**Action:**
1. Emergency Routing activated (see emergency-routing.md)
2. Emergency physician takes primary control
3. Patient receives emergency instructions immediately
4. SLA paused — emergency clock starts
5. All prior case data transferred to emergency record

---

## Tier 5 — Human Escalation (Physical Referral)

**Trigger:**
- Condition requires physical examination
- Investigation only possible in-person (e.g., CT, MRI, surgery)
- Patient lacks safe home environment for management
- Patient clearly needs hospital admission

**Action:**
1. Physician generates formal referral letter (structured)
2. LifeGate displays nearest partner facility with directions
3. Case record marked `requires_physical_care`
4. Case Manager notifies patient care coordinator
5. Follow-up call offered within 24 hours of referral

---

## Tier 6 — Crisis Escalation (Mental Health)

**Trigger:**
- Patient expresses suicidal ideation
- Patient expresses intent to harm others
- Severe psychiatric emergency (acute psychosis, disorientation)
- Any statement suggesting imminent danger to self or others

**Action:**
1. IMMEDIATELY engage `dr-osagie-omoruyi` + `dr-chidinma-aneke`
2. Trigger Crisis Response Protocol (see crisis-response.md)
3. Display crisis helplines instantly on screen
4. Session cannot be closed by patient while in T6 state
5. Flag for mandatory review by LifeGate clinical safety officer

---

## Escalation Audit

Every escalation event is logged with:
- `escalation_tier`, `trigger_condition`, `timestamp`
- `escalating_agent`, `receiving_agent`
- `patient_notified: true/false`
- `resolution_type`

---

*Escalation Tiers version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
