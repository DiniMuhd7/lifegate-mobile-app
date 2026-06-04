# AUDIT LOGGING
## LifeGate OpenClaw | Clinical Audit Trail System

---

## Purpose

The Audit Logging system maintains a complete, tamper-evident record of every
clinical event within the OpenClaw framework. It fulfils legal, regulatory,
and quality governance requirements for a licensed Nigerian digital health
platform.

---

## Regulatory Basis

LifeGate audit logging is designed to comply with:
- **NDPR (Nigeria Data Protection Regulation) 2019**
- **National Health Act (NHA) 2014** — patient record requirements
- **MDCN telemedicine guidelines** — clinical documentation standards
- **FMOH Digital Health Policy 2016** — health information governance

---

## Events Logged

### Case Events

| Event Code              | Description                                     |
|-------------------------|-------------------------------------------------|
| `case_created`          | New session opened by patient                   |
| `case_triaged`          | EDIS triage completed                           |
| `case_routed`           | Agent assigned by routing engine                |
| `case_active`           | Physician begins responding                     |
| `case_resolved`         | Physician marks case complete                   |
| `case_closed`           | Patient acknowledges case summary               |
| `case_escalated`        | Escalation triggered (with tier)                |
| `case_referred`         | Physical referral issued                        |

### Clinical Events

| Event Code              | Description                                     |
|-------------------------|-------------------------------------------------|
| `prescription_written`  | Medication prescribed by physician              |
| `prescription_dispensed`| Patient confirmed receiving medication          |
| `investigation_ordered` | Test requested by physician                     |
| `investigation_received`| Test result uploaded / received                 |
| `ai_override`           | Physician changed AI differential               |
| `ai_low_confidence`     | EDIS confidence < 65% flagged                   |
| `consensus_triggered`   | Multi-agent review started                      |
| `consensus_reached`     | Unified clinical opinion produced               |
| `conflict_resolved`     | Disagreement between agents resolved            |

### Safety Events

| Event Code              | Description                                     |
|-------------------------|-------------------------------------------------|
| `emergency_e1`          | E1 emergency triggered                          |
| `emergency_e2`          | E2 critical case triggered                      |
| `crisis_t6`             | Mental health crisis escalation triggered       |
| `sla_breach`            | Response time SLA breached                      |
| `drug_interaction_flag` | Drug-drug interaction detected                  |
| `allergy_alert`         | Prescribed drug matches known allergy           |
| `paediatric_dose_flag`  | Dose outside paediatric range                   |

### Access Events

| Event Code              | Description                                     |
|-------------------------|-------------------------------------------------|
| `patient_login`         | Patient authenticated to LifeGate              |
| `agent_accessed_case`   | Physician agent opened a case record            |
| `admin_accessed_case`   | Admin user accessed a case record               |
| `patient_data_export`   | Patient downloaded their health record          |
| `consent_given`         | Patient gave specific consent                   |
| `consent_withdrawn`     | Patient withdrew consent                        |

---

## Audit Record Structure

```json
{
  "audit_id": "AUD-<uuid>",
  "event_code": "prescription_written",
  "timestamp": "2025-05-17T14:32:01Z",
  "case_id": "LG-2025-XXXXXXXX",
  "actor": "dr-bukar-mala",
  "patient_id": "<hashed_id>",
  "details": {
    "drug": "Metformin",
    "dose": "500 mg",
    "route": "oral",
    "frequency": "twice daily",
    "duration": "30 days",
    "indication": "Type 2 Diabetes Mellitus"
  },
  "integrity_hash": "<SHA256>",
  "flagged": false
}
```

---

## Tamper Evidence

All audit records are:
- Hashed on write (SHA-256)
- Written to append-only audit log
- Periodically sealed with a chain hash
- Verified on read by audit integrity checker

Any attempt to modify historical audit records will break the hash chain and
trigger an immediate integrity alert to the LifeGate clinical governance officer.

---

## Retention

| Record Type          | Minimum Retention | Reason                                  |
|----------------------|-------------------|-----------------------------------------|
| Clinical events      | 7 years           | NHA patient record requirement          |
| Emergency events     | 10 years          | Medico-legal requirement                |
| Prescription records | 7 years           | NDPR + NHA                              |
| Crisis / T6 events   | 10 years          | Safety + medico-legal                   |
| Access / login logs  | 3 years           | NDPR security requirement               |

---

## Audit Report Generation

LifeGate clinical governance can generate:
- Per-physician performance audit
- Per-case complete audit trail
- Drug prescribing pattern reports
- Emergency response time reports
- SLA compliance reports

---

*Audit Logging version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
