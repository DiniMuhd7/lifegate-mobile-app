# ROUTING ENGINE
## LifeGate OpenClaw | Intelligent Case Router

---

## Purpose

The LifeGate Routing Engine analyses every incoming case — whether from EDIS AI
triage, a direct patient message, or a scan result — and assigns it to the correct
physician agent(s). It is the first layer of intelligent dispatch in the OpenClaw
framework.

---

## Routing Inputs

Every routing decision consumes:

| Input                  | Source                         | Required |
|------------------------|--------------------------------|----------|
| `symptoms`             | EDIS AI triage output          | Yes      |
| `ai_differential`      | EDIS ranked differential list  | Yes      |
| `urgency_score`        | EDIS risk scoring output       | Yes      |
| `category`             | LifeGate session category      | Yes      |
| `patient_profile`      | User age, sex, health history  | Yes      |
| `scan_result`          | OCR / vision scan findings     | If scan  |
| `hearing_result`       | Audiometry test output         | If audio |
| `eye_result`           | Eye diagnostic test output     | If eye   |

---

## Routing Algorithm

```
FUNCTION route(case):

  1. READ urgency_score
     IF urgency == CRITICAL:
       → EMERGENCY_ROUTING (see emergency-routing.md)
       RETURN

  2. READ ai_differential[0].specialisation   # top differential
     MAP to agent via SPECIALTY_MAP

  3. IF multi-specialty flag == True:
       → MULTI_AGENT_ROUTING
       RETURN

  4. LOAD target_agent
     IF target_agent.state != ONLINE:
       → LOAD_BALANCER (see load-balancer.md)

  5. ASSIGN case to target_agent
     LOG routing_decision to audit_logger
     NOTIFY patient: "A specialist is reviewing your case."
```

---

## Category → Primary Specialisation Mapping

| LifeGate Category          | Primary Agent Assigned              |
|----------------------------|-------------------------------------|
| `clinical_diagnosis`       | General Medicine (GM)               |
| `eye_checkup`              | Ophthalmology / Optometry (OPHTH)   |
| `hearing_test`             | Audiology / ENT (ENT)               |
| `mental_health`            | Psychiatry / Psychology (PSYCH)     |
| `child_health`             | Pediatrics (PAED)                   |
| `maternal_health`          | Obstetrics / Gynecology (OBGYN)     |
| `chronic_disease`          | Internal Medicine → specialty route |
| `emergency`                | Emergency Medicine (EM)             |
| `nutrition`                | Nutrition & Dietetics (via GM)      |
| `general_wellness`         | General Medicine (GM)               |

---

## Routing Decision Log Format

Every routing decision is written to the audit trail:

```json
{
  "event": "case_routed",
  "case_id": "<uuid>",
  "timestamp": "<ISO8601>",
  "urgency": "MEDIUM",
  "primary_agent": "dr-ibrahim-danladi",
  "secondary_agents": [],
  "routing_reason": "chest pain + ECG abnormality → Cardiology",
  "session_category": "clinical_diagnosis"
}
```

---

*Router version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
