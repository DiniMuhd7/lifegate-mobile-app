# LOAD BALANCER
## LifeGate OpenClaw | Physician Agent Load Distribution

---

## Purpose

The Load Balancer ensures fair, efficient distribution of cases across the 24
physician agents. It prevents any single agent from being overwhelmed while
ensuring every incoming case is handled promptly.

---

## Agent State Model

Each physician agent maintains one of five states:

| State          | Description                                               | Can Accept New Case? |
|----------------|-----------------------------------------------------------|----------------------|
| `ONLINE`       | Available and idle                                        | Yes                  |
| `ACTIVE`       | Currently engaged with ≤ 3 concurrent cases              | Yes (up to limit)    |
| `BUSY`         | At maximum concurrent case load                           | No                   |
| `HANDOFF`      | Wrapping up, transferring case                            | No (except emergencies) |
| `OFFLINE`      | Not available (maintenance, etc.)                         | No                   |

---

## Load Balancing Algorithm

```
FUNCTION assign_agent(case, preferred_agent):

  1. IF preferred_agent.state in [ONLINE, ACTIVE]:
       assign to preferred_agent
       RETURN

  2. GET fallback_pool = agents_with_matching_specialty
     SORT fallback_pool by (active_case_count ASC, specialty_match_score DESC)

  3. FOR agent IN fallback_pool:
       IF agent.state in [ONLINE, ACTIVE] AND agent.active_cases < MAX_LOAD:
         assign to agent
         LOG "load_balanced from {preferred_agent} to {agent}"
         RETURN

  4. IF no agent found:
       QUEUE case with priority flag
       NOTIFY patient: "All specialists are currently active. You are in queue."
       ETA estimate from average_case_duration

  5. IF urgency == CRITICAL:
       OVERRIDE busy state — force assign to least-loaded emergency agent
```

---

## Maximum Concurrent Load per Agent

| Department Code | Agents                          | Max Concurrent Cases |
|-----------------|---------------------------------|----------------------|
| GM              | Dr. Ahmed Musa, Dr. Ngozi       | 6 each               |
| EM              | Dr. Terseer, Dr. Bukola         | 8 each (emergency)   |
| CARD            | Dr. Ibrahim, Dr. Adaeze N.      | 4 each               |
| NEURO           | Dr. Babatunde, Dr. Ramatu       | 4 each               |
| PSYCH           | Dr. Osagie, Dr. Chidinma        | 5 each               |
| PAED            | Dr. Garba, Dr. Yetunde          | 5 each               |
| OBGYN           | Dr. Aliyu, Dr. Esohe            | 5 each               |
| ENDO            | Dr. Bukar                       | 4                    |
| GASTRO          | Dr. Ifeoma                      | 4                    |
| ID              | Dr. Bassey, Dr. Zainab          | 5 each               |
| OPHTH           | Dr. Emeka                       | 5                    |
| ENT             | Dr. Iquo                        | 5                    |
| SURG            | Dr. Danladi M., Dr. Adaeze I.   | 3 each               |
| PHYSIO          | Dr. Ojoche                      | 5                    |
| PH              | Dr. Hadiza                      | 6                    |

---

## Cross-Department Fallback Chain

When no specialist is available in the primary department:

```
Cardiology unavailable     → Internal Medicine (GM) → Emergency
Neurology unavailable      → Emergency Medicine → GM
Psychiatry unavailable     → Psychology → GM
Paediatrics unavailable    → GM → Emergency
OBGYN unavailable          → Emergency → GM
Endocrinology unavailable  → Internal Medicine (GM)
Gastroenterology unavail.  → GM
Infectious Disease unavail.→ GM → Public Health
Ophthalmology unavailable  → GM (with scan + basic flags)
ENT unavailable            → GM
Surgery unavailable        → Emergency Medicine
Physiotherapy unavailable  → GM (pain advice only)
Public Health unavailable  → GM
```

---

## Queue Management

- Maximum queue depth: 50 cases per department
- Cases exceeding queue depth: escalate to human administrator
- Queue position is communicated to patient in real time
- Priority queue slot for: emergencies, children under 5, pregnant patients

---

## Metrics Tracked

| Metric                   | Purpose                          |
|--------------------------|----------------------------------|
| `agent_utilization_%`    | Monitor load distribution        |
| `avg_queue_wait_time`    | Track patient experience         |
| `load_balance_events`    | Count of fallback reassignments  |
| `queue_overflow_events`  | Triggers admin alert             |

---

*Load Balancer version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
