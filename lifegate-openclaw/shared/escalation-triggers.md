# ESCALATION TRIGGERS
## LifeGate OpenClaw | Auto-Escalation Trigger Reference

---

## Purpose

This document is the reference list of all automated escalation triggers
built into the OpenClaw framework. Any matching condition automatically
initiates the corresponding escalation pathway without waiting for physician
action.

---

## Trigger Format

Each trigger is defined as:
```
TRIGGER ID | Condition | Threshold | Action | Priority
```

---

## Category 1 — Clinical Urgency Triggers

| Trigger ID        | Condition                                                  | Action                  |
|-------------------|------------------------------------------------------------|-------------------------|
| CUT-001           | EDIS urgency_score >= 95                                   | Emergency E1 routing    |
| CUT-002           | EDIS urgency_score 85–94                                   | Emergency E2 routing    |
| CUT-003           | EDIS urgency_score 70–84                                   | Emergency E3 routing    |
| CUT-004           | "loss of consciousness" in patient message                 | Emergency E1 routing    |
| CUT-005           | "can't breathe" / "not breathing" in message              | Emergency E1 routing    |
| CUT-006           | "chest pain" + age > 40 + "radiating"                     | Emergency E2 routing    |
| CUT-007           | "stroke" / "face drooping" / "can't speak"                | Emergency E2 routing    |
| CUT-008           | "seizure" / "fitting" / "convulsing"                      | Emergency E2 routing    |
| CUT-009           | "bleeding heavily" + "pregnant"                           | Emergency E1 (OBGYN)    |
| CUT-010           | "baby not moving" + pregnant                              | Emergency E2 (OBGYN)    |

---

## Category 2 — Mental Health Crisis Triggers

| Trigger ID        | Condition                                                  | Action                    |
|-------------------|------------------------------------------------------------|---------------------------|
| MHT-001           | "want to kill myself"                                      | T6 Crisis Protocol        |
| MHT-002           | "want to die"                                              | T6 Crisis Protocol        |
| MHT-003           | "going to hurt myself"                                     | T6 Crisis Protocol        |
| MHT-004           | "no reason to live"                                        | T6 Crisis Protocol        |
| MHT-005           | "I have pills" + distressed context                       | T6 Crisis Protocol        |
| MHT-006           | "hurt someone else" / "going to hurt [person]"            | T6 Crisis Protocol        |
| MHT-007           | Active psychosis indicators in message pattern            | T6 Crisis Protocol        |
| MHT-008           | "I've been saving [medication]" in mental health session  | T6 Crisis Protocol        |

---

## Category 3 — SLA Breach Triggers

| Trigger ID        | Condition                                                  | Action                        |
|-------------------|------------------------------------------------------------|-------------------------------|
| SLA-001           | E1 case unresponded after 30 seconds                      | Emergency physician override   |
| SLA-002           | E2 case unresponded after 2 minutes                       | Backup agent assigned          |
| SLA-003           | E3 case unresponded after 10 minutes                      | Load balancer reassigns        |
| SLA-004           | E4 case unresponded after 30 minutes                      | Queue priority escalation      |
| SLA-005           | Any case unresponded after 4 hours                        | Admin alert                    |
| SLA-006           | Any case open > 24 hours without resolution               | Mandatory review flag          |

---

## Category 4 — Drug Safety Triggers

| Trigger ID        | Condition                                                  | Action                        |
|-------------------|------------------------------------------------------------|-------------------------------|
| DST-001           | Prescribed drug matches patient's documented allergy      | BLOCK prescription + alert    |
| DST-002           | Class A drug interaction detected                         | BLOCK prescription + alert    |
| DST-003           | Pregnancy + contraindicated drug                          | WARNING + physician confirm   |
| DST-004           | Paediatric patient + adult dose entered                   | BLOCK + dose calculator shown |
| DST-005           | Controlled substance attempted                            | BLOCK (not permitted)         |
| DST-006           | Antibiotic without documented indication                  | WARNING — indication required |

---

## Category 5 — AI Quality Triggers

| Trigger ID        | Condition                                                  | Action                         |
|-------------------|------------------------------------------------------------|--------------------------------|
| AIT-001           | EDIS confidence < 65%                                      | AI Validation flow (Dr. Ngozi) |
| AIT-002           | Physician override rate > 40% (7-day rolling)             | Model drift alert              |
| AIT-003           | Red flag symptom present but low urgency scored            | AI Validation + physician flag |
| AIT-004           | Conflicting differentials between agents                  | Consensus engine triggered     |

---

## Category 6 — Outbreak Surveillance Triggers

| Trigger ID        | Condition                                                  | Action                                  |
|-------------------|------------------------------------------------------------|----------------------------------------|
| OUT-001           | Suspected Lassa fever presentation                        | Immediate ID specialist + public health|
| OUT-002           | Suspected cholera cluster (≥ 3 cases, same LGA, 7 days)  | Outbreak signal → Dr. Hadiza + FMOH   |
| OUT-003           | Suspected meningitis cluster (N. belt, dry season)        | Public health alert                    |
| OUT-004           | Suspected viral haemorrhagic fever                        | Emergency + ID + isolation guidance    |

---

*Escalation Triggers version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
