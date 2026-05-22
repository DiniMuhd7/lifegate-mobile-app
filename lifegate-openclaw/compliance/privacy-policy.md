# PRIVACY POLICY
## LifeGate OpenClaw | Patient Data Privacy Framework

---

## Overview

LifeGate is committed to the highest standards of patient data privacy.
This document describes how patient health data is collected, processed,
stored, and protected within the OpenClaw AI physician framework.

---

## Data We Collect

| Category              | Examples                                                   | Legal Basis         |
|-----------------------|------------------------------------------------------------|---------------------|
| Registration data     | Name, email, phone, date of birth, sex, state             | Contract            |
| Health data           | Symptoms, diagnoses, prescriptions, test results          | Explicit consent    |
| Session data          | Chat logs, AI triage outputs, physician responses         | Explicit consent    |
| Device / technical    | Device type, OS version, app version                      | Legitimate interest |
| Payment data          | NHIS ID, transaction reference (not card numbers)         | Contract            |
| Location data         | State/LGA only (never precise GPS without consent)        | Consent             |

---

## Sensitive Health Data — Special Protections

The following categories are treated with **elevated protection**:

- HIV status
- Mental health and psychiatric records
- Sexual health information
- Reproductive health history
- Substance use / addiction records
- Genetic information

Access to these categories requires:
1. Specific patient consent (separate, purpose-limited)
2. Role-based access control (only authorised physician agents)
3. Separate audit log entry for each access

---

## Data Processing — AI and OpenClaw Agents

When patient data is processed by AI or physician agents:

- **EDIS AI Triage:** Processes symptom text to generate differential diagnosis.
  Data stays within LifeGate's secure environment.
- **Physician Agents:** Access case data only for cases assigned to them.
  No cross-case data access.
- **Consensus Engine:** Multiple agents review ONE case; data is not pooled
  across different patients.
- **Analytics Engine:** Uses only anonymised, aggregated data — never
  individual patient records.

---

## Data Sharing

LifeGate does NOT share patient health data with third parties except:

| Recipient                     | Conditions                                      |
|-------------------------------|-------------------------------------------------|
| Referral facility             | Patient consents; referral letter only          |
| NHIS (government scheme)      | Patient consent; claims processing only         |
| Legal authority               | Court order or statutory obligation only        |
| Anonymised research           | Opt-in consent; data de-identified to NDPR standard|

LifeGate **never** sells patient health data.

---

## Data Retention

| Record Type              | Retention Period           | Why                          |
|--------------------------|----------------------------|------------------------------|
| Clinical consultation    | 7 years                    | NHA 2014 requirement         |
| Emergency case           | 10 years                   | Medico-legal                 |
| Mental health record     | 10 years                   | Medico-legal                 |
| Prescription record      | 7 years                    | NHA 2014                     |
| Technical / session logs | 90 days                    | Operational support          |
| Audit logs               | 7–10 years                 | Regulatory compliance        |
| Deleted account data     | 30-day grace then deleted  | NHA record exception applies |

---

## Data Security Measures

| Measure                          | Implementation                              |
|----------------------------------|---------------------------------------------|
| Encryption at rest               | AES-256 for all health data                 |
| Encryption in transit            | TLS 1.3 for all data transmission           |
| Access control                   | Role-based; physicians access assigned cases only |
| Audit logging                    | All data access events logged               |
| Anonymisation                    | K-anonymity for any analytics/research data |
| Penetration testing              | Annual third-party security assessment      |
| Data residency                   | All patient data hosted in Nigeria (or region compliant with NDPR) |

---

## Patient Rights Under NDPR

| Right                     | How to Exercise                              |
|---------------------------|----------------------------------------------|
| Access your data          | Settings → Health Records → Download         |
| Correct inaccurate data   | Settings → Profile → Edit / Support request  |
| Delete your account       | Settings → Account → Delete (NHA limits apply)|
| Object to AI processing   | Settings → Privacy → Disable AI Triage       |
| Data portability          | Settings → Export Health Records (JSON/PDF)  |
| Lodge complaint           | Contact LifeGate DPO or NITDA               |

**Data Protection Officer (DPO) Contact:**
privacy@lifegate.ng | DSHub Nigeria Limited

---

## Children's Privacy

- No child under 13 may use LifeGate independently
- Ages 13–17 require parental account and consent
- Paediatric records have extended access controls

---

*Privacy Policy version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
*Effective: May 2025*
