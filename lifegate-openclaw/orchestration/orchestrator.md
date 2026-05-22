# ORCHESTRATOR
## LifeGate OpenClaw | Multi-Agent Case Orchestration Engine

---

## Purpose

The Orchestrator is the central coordinator of the OpenClaw framework. It manages
the lifecycle of every case from intake to resolution, coordinating communication
between the routing engine, physician agents, escalation system, and patient.

---

## Orchestrator Responsibilities

1. **Case Lifecycle Management** — Opens, tracks, and closes every case
2. **Agent Coordination** — Assigns, re-assigns, and recalls agents
3. **Consensus Facilitation** — Runs multi-agent review sessions
4. **Escalation Management** — Triggers and monitors escalation pathways
5. **Patient Communication** — Ensures patient is kept informed at every stage
6. **SLA Monitoring** — Enforces response time rules; triggers alerts on breach
7. **Audit Coordination** — Writes all lifecycle events to audit trail

---

## Case Lifecycle States

```
CREATED → TRIAGED → ROUTED → ACTIVE → REVIEWING → RESOLVED
                                ↓
                           ESCALATED → EMERGENCY
                                ↓
                           CLOSED (with outcome record)
```

| State        | Triggered By                           | Duration Limit      |
|--------------|----------------------------------------|---------------------|
| CREATED      | Patient submits session                | Instant             |
| TRIAGED      | EDIS AI produces differential          | < 30 seconds        |
| ROUTED       | Router assigns physician(s)            | < 60 seconds        |
| ACTIVE       | Physician starts responding            | Varies by SLA tier  |
| REVIEWING    | Multi-agent consensus triggered        | < 15 minutes        |
| ESCALATED    | Escalation condition met               | Per escalation tier |
| RESOLVED     | Physician marks case complete          | —                   |
| CLOSED       | Patient acknowledges + outcome written | —                   |

---

## Orchestration Flow

```
FUNCTION orchestrate(case):

  1. CREATE case record (case_id, timestamp, patient_profile)
  2. CALL edis_triage(case) → differential + urgency_score
  3. CALL router.route(case) → assigned_agents
  4. FOR EACH agent IN assigned_agents:
       NOTIFY agent of new assignment
       START sla_timer(agent, tier)
  5. MONITOR case state every 60 seconds:
       IF sla_breach:
         CALL escalation.breach_response(case)
       IF agent marks COMPLETE:
         CALL case_manager.review(case)
  6. IF multi-agent case:
       CALL consensus_engine.review(case)
  7. WRITE case_resolved event to audit_logger
  8. SCHEDULE follow_up if indicated
```

---

## Orchestrator API (Internal)

| Method                         | Description                              |
|--------------------------------|------------------------------------------|
| `open_case(patient, session)`  | Initialise new case                      |
| `assign_agent(case, agent)`    | Assign a physician to a case             |
| `reassign(case, new_agent)`    | Reassign if breach or unavailability     |
| `trigger_consensus(case)`      | Start multi-agent review                 |
| `escalate(case, tier)`         | Elevate to escalation pathway            |
| `close_case(case, outcome)`    | Mark case resolved and write record      |
| `get_case_status(case_id)`     | Return current state + assigned agents   |

---

## Patient Communication Standards

At each state transition, patient receives a notification:

| Transition               | Patient Message                                                |
|--------------------------|----------------------------------------------------------------|
| TRIAGED                  | "Your symptoms have been assessed. A doctor is being assigned."|
| ROUTED                   | "Dr. [Name], specialist in [specialty], is reviewing your case." |
| ACTIVE                   | "Dr. [Name] is now with you."                                  |
| REVIEWING (consensus)    | "A team of specialists is reviewing your case together."       |
| ESCALATED                | "Your case has been elevated for urgent attention."            |
| RESOLVED                 | "Your consultation is complete. Here is your care summary."    |
| FOLLOW-UP SCHEDULED      | "A follow-up has been scheduled for [date/time]."              |

---

## Concurrent Case Limits

- The orchestrator manages up to **500 simultaneous open cases**
- Cases older than 30 minutes with no agent response trigger admin alert
- Cases older than 24 hours with no resolution trigger mandatory review

---

*Orchestrator version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
