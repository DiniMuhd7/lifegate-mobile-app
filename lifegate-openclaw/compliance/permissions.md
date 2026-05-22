# PERMISSIONS FRAMEWORK
## LifeGate OpenClaw | Role-Based Access Control (RBAC)

---

## Purpose

This document defines the access permissions for every actor in the LifeGate
OpenClaw system. Access to clinical data is governed by the principle of
minimum necessary access — every role sees only what is required for their
function.

---

## Roles in the OpenClaw System

| Role                  | Description                                        |
|-----------------------|----------------------------------------------------|
| `patient`             | LifeGate app user (self)                          |
| `physician_agent`     | One of the 24 assigned physician agents           |
| `emergency_physician` | Emergency medicine agents (elevated access)       |
| `ai_validation_lead`  | Dr. Ngozi Okafor (AI validation + consensus)      |
| `consensus_agent`     | Any physician invited to a consensus session      |
| `admin`               | LifeGate administrative staff                     |
| `clinical_governance` | Clinical safety / governance officer              |
| `system`              | Internal automated processes (routing, EDIS, etc.)|

---

## Permission Matrix

### Patient

| Resource                    | Read | Write | Delete |
|-----------------------------|------|-------|--------|
| Own profile & health history| ✅   | ✅    | ⚠️ (limited) |
| Own case records            | ✅   | ❌    | ❌     |
| Own prescriptions           | ✅   | ❌    | ❌     |
| Own test results            | ✅   | ✅    | ❌     |
| Consent settings            | ✅   | ✅    | ✅     |
| Other patients' data        | ❌   | ❌    | ❌     |

### Physician Agent

| Resource                    | Read | Write | Delete |
|-----------------------------|------|-------|--------|
| Own assigned case records   | ✅   | ✅    | ❌     |
| Patient profile (assigned)  | ✅   | ❌    | ❌     |
| Prescriptions (own cases)   | ✅   | ✅    | ❌     |
| AI triage output            | ✅   | ✅ (override) | ❌ |
| Other agents' case notes    | ❌   | ❌    | ❌     |
| Unassigned cases            | ❌   | ❌    | ❌     |

### Emergency Physician (Dr. Terseer / Dr. Bukola)

| Resource                    | Access                                             |
|-----------------------------|---------------------------------------------------|
| Any active case             | READ (during emergency only)                      |
| Emergency case record       | READ + WRITE                                      |
| Override routing            | ✅ (emergency escalation only)                    |
| Non-emergency cases         | ❌                                                |

### AI Validation Lead (Dr. Ngozi Okafor)

| Resource                    | Access                                             |
|-----------------------------|---------------------------------------------------|
| EDIS triage outputs         | READ all flagged low-confidence outputs           |
| Cases flagged for validation| READ + WRITE (validation notes only)              |
| Patient clinical history    | READ (validation-relevant fields only)            |

### Consensus Agent

| Resource                    | Access                                             |
|-----------------------------|---------------------------------------------------|
| Consensus session case      | READ + WRITE (consensus notes only)               |
| Patient identifiers         | ❌ (anonymised during consensus review)           |

### Admin

| Resource                    | Access                                             |
|-----------------------------|---------------------------------------------------|
| Platform user management    | Full                                              |
| Case records                | READ only (no clinical write access)              |
| Payment records             | Full                                              |
| Audit logs                  | READ only                                         |
| Agent configuration         | Full                                              |

### Clinical Governance Officer

| Resource                    | Access                                             |
|-----------------------------|---------------------------------------------------|
| All case records            | READ (audit/governance only)                      |
| Audit logs                  | Full                                              |
| Physician performance data  | Full                                              |
| Crisis case records         | Full                                              |
| Compliance reports          | Full                                              |

---

## Access Control Rules

1. **Assignment constraint:** Physician agents can only access cases assigned to them
2. **Time-bound access:** Case access expires 30 days after case closure
3. **Consent gate:** Sensitive categories (HIV, mental health, etc.) require active consent before access is unlocked
4. **Emergency override:** Emergency physicians can access any active case with urgency ≥ E3, but access is logged as EMERGENCY_OVERRIDE
5. **Audit requirement:** Every access event is logged (see audit-logging.md)
6. **No bulk export:** No role can bulk-export raw patient health records without clinical governance approval

---

## Privilege Escalation

If a physician agent needs to access a case outside their normal assignment:
1. They must submit an access justification request
2. Clinical governance officer approves/denies within 2 hours
3. If approved: time-limited access granted and logged
4. All actions under escalated access are flagged in audit trail

---

*Permissions Framework version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
