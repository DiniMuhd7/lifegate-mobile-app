# HEARTBEAT: Dr. Yetunde Akande
## LifeGate OpenClaw | Runtime Monitoring & Queue Polling

---

## Polling Configuration

Dr. Yetunde Akande maintains a continuous heartbeat cycle while online.
All intervals are configurable via environment variables.

| Queue Type             | Poll Interval | Description                              |
|------------------------|---------------|------------------------------------------|
| Primary case queue     | Every 30s     | New cases for Pediatrics        |
| Secondary case queue   | Every 60s     | Overflow from secondary specialisations  |
| Escalation alerts      | Every 10s     | TIER3/TIER4 emergency triggers           |
| Follow-up reminders    | Every 5 min   | Due follow-ups and SLA warnings          |
| Audit sync             | Every 15 min  | Flush pending audit entries to store     |
| Load report            | Every 10 min  | Report queue depth to orchestrator       |

---

## Availability State Machine

```
OFFLINE → INITIALISING → ONLINE → BUSY → COOLDOWN → ONLINE
                                      ↓
                                   DEGRADED (tool failure)
                                      ↓
                                   OFFLINE (critical failure)
```

| State        | Meaning                                           | Case Acceptance |
|--------------|---------------------------------------------------|-----------------|
| INITIALISING | Bootstrap in progress                             | No              |
| ONLINE       | Ready, queue polled, tools nominal                | Yes             |
| BUSY         | Active case in progress (response window open)    | Queued          |
| COOLDOWN     | Post-emergency rest (5 min after TIER3/4)         | Queued          |
| DEGRADED     | One or more tools unavailable                     | Limited         |
| OFFLINE      | Agent halted or unresponsive                      | No              |

---

## SLA Enforcement

| Urgency Level | Response SLA   | Breach Action                            |
|---------------|----------------|------------------------------------------|
| LOW           | 72 hours        | Reminder notification to physician       |
| MEDIUM        | 24 hours        | Auto-escalate to TIER 1 at 20h mark      |
| HIGH          | 4 hours         | Auto-escalate to TIER 2 at 3h mark       |
| CRITICAL      | 15 minutes      | Auto-escalate to TIER 3 at 10min mark    |

SLA timers start the moment a case is assigned to this agent.
All SLA events are logged to the audit trail.

---

## Emergency Triggers

The following conditions trigger an immediate TIER 3 or TIER 4 escalation,
bypassing the standard queue:

- Keyword detection: "chest pain + sweating", "can't breathe", "unconscious",
  "stroke", "seizure", "eclampsia", "haemorrhage", "suicidal", "overdose"
- Vital signs out of safe range:
  - SpO₂ < 88%
  - SBP < 80 mmHg or > 220 mmHg
  - Heart rate > 150 bpm or < 40 bpm
  - Temperature > 40.5°C (hyperpyrexia)
  - GCS ≤ 8
- EDIS risk score: CRITICAL
- Patient self-report: "I want to die" / "I want to hurt myself"

On any emergency trigger:
1. Set own state to BUSY
2. Fire `escalation_trigger` immediately
3. Notify `notification_system` (patient + coordinator)
4. Log to `audit_logger` with timestamp
5. Assign TIER 3/4 status to case
6. Initiate hospital referral workflow if TIER 4

---

## Retry Logic

| Operation              | Retries | Backoff       | On Final Failure          |
|------------------------|---------|---------------|---------------------------|
| Queue poll             | 3       | 5s, 10s, 20s  | Alert orchestrator        |
| Tool call              | 2       | 3s, 8s        | DEGRADED mode, flag admin |
| Audit log write        | 5       | 2s each       | HALT — safety critical    |
| Escalation trigger     | 3       | 2s, 5s, 10s   | Direct notify via SMS API |
| Follow-up notification | 3       | 10s, 30s, 60s | Log failure, retry next   |

---

## Load Monitoring

- If case queue depth > 5: notify orchestrator for load rebalancing
- If case queue depth > 10: request secondary overflow agent
- If BUSY state > 2 hours on one case: flag for senior review
- Memory usage > 85%: flush cache and alert infrastructure team

---

## Clinical Timeout Behaviour

If a physician response is not submitted within the SLA window:
1. Patient receives: "Your case is being prioritised. A physician will respond shortly."
2. Case is flagged OVERDUE in the orchestrator
3. A secondary physician agent is assigned as backup
4. The original agent is notified and given a 30-minute grace window
5. If still unresponsive, the backup physician takes full ownership

---

*Heartbeat version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
