# CONSENT MANAGEMENT
## LifeGate OpenClaw | Patient Consent Framework

---

## Purpose

This document governs how LifeGate obtains, records, manages, and respects
patient consent across all clinical and data processing activities. Consent
is a fundamental patient right and a legal obligation under NDPR 2019 and
the National Health Act 2014.

---

## Consent Categories

| Category                  | Description                                          | Required For                                |
|---------------------------|------------------------------------------------------|---------------------------------------------|
| **General Clinical Consent** | Consent to receive teleconsultation services      | All users on first registration             |
| **Data Processing Consent**  | Consent for health data to be processed by AI    | Required before EDIS triage                 |
| **AI Triage Consent**        | Consent for AI to assist in clinical assessment  | Required per session                        |
| **AI Physician Consent**     | Consent for AI physician support and draft reports | Required when AI physician mode is used    |
| **Human Physician AI-Mode Consent** | Consent for clinician-led AI-assisted review | Required for human physician AI-mode sessions |
| **Multi-Agent Consent**      | Consent for case to be reviewed by multiple agents| Requested when multi-agent routing occurs   |
| **Data Sharing Consent**     | Consent to share anonymised data for research    | Optional; opt-in only                       |
| **Public Health Analytics Consent** | Consent to use de-identified data for trend analysis | Optional; opt-in only                 |
| **Referral Consent**         | Consent for referral letter to be generated      | Required before referral issued             |
| **Media Capture Consent**    | Consent for camera scans and uploaded documents   | Required for document intake                |
| **Voice Input Consent**      | Consent for voice notes / audio messages          | Required for voice-assisted reporting       |
| **Minor Consent**            | Parent/guardian consent for patients < 18        | Required for paediatric care                |

---

## Consent Flow on Registration

```
User creates LifeGate account
  ↓
STEP 1 — General Terms
  User reads and accepts LifeGate Terms of Service
  
STEP 2 — Privacy Notice
  User reads Privacy Policy (plain language summary displayed)
  
STEP 3 — Health Data Consent
  User explicitly consents to:
  - Storage of health information
  - Use of AI to assist clinical decisions
  - Physician agents accessing their data
  - Human physician AI-mode and AI physician support workflows
  - Camera scans, uploaded documents, and voice-assisted reporting
  
STEP 4 — Optional Consents
  User selects yes/no on:
  - Anonymised data for research
  - Public health analytics and population trend reporting
  - Sharing with NHIS/government (if applicable)
  
STEP 5 — Consent Record Written
  All consent choices stored with:
  - Timestamp, version of consent presented
  - User action (accepted/declined)
  - Integrity hash
```

---

## Per-Session Consent

Before every EDIS triage session:
- User is reminded that AI is assisting
- User can proceed, request human-only review, or cancel
- If human physician AI-mode is enabled, the user is told that a clinician remains responsible for final review
- Consent choice is logged per session

---

## Consent for Minors (< 18 years)

- Parent or legal guardian must create account and consent on behalf of child
- Child's age is verified at account setup
- Separate consent required for adolescents (16–17) for sexual/mental health
- Physician agents are instructed to communicate appropriately for age

---

## Right to Withdraw Consent

Patients may withdraw any consent at any time:
1. Via Settings → Privacy → Manage Consent
2. By contacting LifeGate support

**Effects of withdrawal:**
- Data processing consent: AI triage disabled; human-only mode
- Data sharing consent: anonymised data removed from research dataset
- General consent: account deactivation initiated

**What remains after withdrawal:**
- Clinical records (required by law — NHA 2014, minimum 7 years)
- Audit trail of consent withdrawal event

---

## Consent for Sensitive Categories

The following require explicit separate consent:
- HIV status information
- Mental health and psychiatric history
- Sexual health information
- Reproductive health information
- Addiction / substance use history
- Camera-captured medical documents and uploaded scans
- Voice recordings used for triage or report drafting

When physician agents access or document these categories:
1. Patient is prompted to confirm consent for that specific category
2. Access is logged separately in audit trail
3. Sharing of these categories is disabled by default

---

## Consent Record Format

```json
{
  "consent_id": "CON-<uuid>",
  "patient_id": "<hashed>",
  "consent_type": "ai_triage",
  "action": "accepted",
  "timestamp": "<ISO8601>",
  "consent_version": "2.1.0",
  "ip_address": "<hashed>",
  "integrity_hash": "<SHA256>"
}
```

---

## NDPR Compliance Requirements Met

- ✅ Lawful basis for processing: explicit consent documented
- ✅ Purpose limitation: consent is purpose-specific
- ✅ Data minimisation: only necessary health data collected
- ✅ Right to access: patient can view their data
- ✅ Right to erasure: patient can request deletion (subject to legal limits)
- ✅ Right to object: patient can opt out of AI / research processing
- ✅ Privacy by design: consent integrated into all data flows

---

*Consent Management version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
