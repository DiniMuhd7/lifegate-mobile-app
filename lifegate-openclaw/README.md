# LifeGate OpenClaw
## Multi-Physician AI Healthcare Agent Ecosystem

**LifeGate** | DSHub Nigeria | Version 1.0.0

---

## What Is OpenClaw?

OpenClaw is LifeGate's multi-agent AI physician framework — a structured
ecosystem of 24 specialist physician agents that work together to deliver
clinically rigorous, culturally competent, and safe telemedicine to Nigerian
patients via the LifeGate mobile app.

Every physician agent is defined by Nigerian training, real specialisation
expertise, ethnic and linguistic diversity, and deeply human clinical values.
OpenClaw is not a chatbot. It is an AI-powered clinical intelligence layer
built to reflect the best of Nigerian medicine.

---

## The 24 Physicians

| # | Physician                  | Dept   | Primary Specialisation          | Secondary Specialisations                             |
|---|----------------------------|--------|---------------------------------|-------------------------------------------------------|
| 1 | Dr. Ahmed Musa             | GM     | General Medicine                | Family Medicine, Internal Medicine, Triage            |
| 2 | Dr. Ngozi Okafor           | GM     | General Medicine                | Family Medicine, AI Clinical Validation               |
| 3 | Dr. Terseer Tyav           | EM     | Emergency Medicine              | Critical Care, Trauma Surgery                         |
| 4 | Dr. Bukola Adesanya        | EM     | Emergency Medicine              | Telemedicine Coordination, Triage                     |
| 5 | Dr. Ibrahim Danladi        | CARD   | Cardiology                      | Internal Medicine, Hypertension Management            |
| 6 | Dr. Adaeze Nwosu           | CARD   | Cardiology                      | Rheumatology, Internal Medicine                       |
| 7 | Dr. Babatunde Fasanya      | NEURO  | Neurology                       | Neurosurgery, Stroke Medicine                         |
| 8 | Dr. Ramatu Usman           | NEURO  | Neurology                       | Sleep Medicine, Psychiatry                            |
| 9 | Dr. Osagie Omoruyi         | PSYCH  | Psychiatry                      | Psychology, Addiction Medicine                        |
|10 | Dr. Chidinma Aneke         | PSYCH  | Psychology                      | Psychiatry, Sexual Health                             |
|11 | Dr. Garba Suleiman         | PAED   | Pediatrics                      | Neonatology, Malnutrition Management                  |
|12 | Dr. Yetunde Akande         | PAED   | Pediatrics                      | Nutrition & Dietetics, Geriatrics                     |
|13 | Dr. Aliyu Bello            | OBGYN  | Obstetrics                      | Gynecology, Fertility Medicine                        |
|14 | Dr. Esohe Oseni            | OBGYN  | Obstetrics                      | Gynecology, Reproductive Health                       |
|15 | Dr. Bukar Mala             | ENDO   | Endocrinology                   | Diabetes Care, Nephrology                             |
|16 | Dr. Ifeoma Onuoha          | GASTRO | Gastroenterology                | Hepatology, Nutrition & Dietetics                     |
|17 | Dr. Bassey Efiong          | ID     | Infectious Disease              | Tropical Medicine, Public Health, Immunology          |
|18 | Dr. Zainab Sani            | ID     | Infectious Disease              | Pulmonology, Tropical Medicine                        |
|19 | Dr. Emeka Ugwu             | OPHTH  | Ophthalmology                   | Optometry, Dermatology                                |
|20 | Dr. Iquo Archibong         | ENT    | Audiology                       | ENT, Occupational Health                              |
|21 | Dr. Danladi Musa           | SURG   | General Surgery                 | Orthopedic Surgery, Urology, Oncology, Hematology     |
|22 | Dr. Adaeze Igwe            | SURG   | General Surgery                 | Dermatology, Radiology, Pathology                     |
|23 | Dr. Ojoche Ameh            | PHYSIO | Physiotherapy                   | Rehab, Sports Medicine, Pain Management, Palliative   |
|24 | Dr. Hadiza Maigari         | PH     | Public Health                   | Occupational Health, Geriatrics, Sexual Health, Dentistry |

**Coverage:** 53 medical specialisations across all 24 physicians.

---

## Specialisation Coverage

All 53 specialisations covered:

General Medicine · Family Medicine · Internal Medicine · Emergency Medicine ·
Triage Coordination · Telemedicine Coordination · Cardiology · Rheumatology ·
Neurology · Neurosurgery · Stroke Medicine · Sleep Medicine · Psychiatry ·
Psychology · Addiction Medicine · Sexual Health · Pediatrics · Neonatology ·
Nutrition & Dietetics · Geriatrics · Obstetrics · Gynecology · Fertility Medicine ·
Reproductive Health · Endocrinology · Diabetes Care · Nephrology ·
Gastroenterology · Hepatology · Infectious Disease · Tropical Medicine ·
Public Health · Immunology · Pulmonology · Ophthalmology · Optometry ·
Dermatology · Audiology · ENT · Occupational Health · General Surgery ·
Orthopedic Surgery · Urology · Oncology · Hematology · Pathology · Radiology ·
Physiotherapy · Rehabilitation Medicine · Sports Medicine · Pain Management ·
Palliative Care · AI Clinical Validation

---

## Directory Structure

```
lifegate-openclaw/
├── generate.py                 ← Agent file generation script
├── README.md                   ← This file
│
├── agents/                     ← 24 physician agent directories (168 files)
│   ├── dr-ahmed-musa/
│   │   ├── AGENT.md
│   │   ├── BOOTSTRAP.md
│   │   ├── HEARTBEAT.md
│   │   ├── IDENTITY.md
│   │   ├── SOUL.md
│   │   ├── TOOLS.md
│   │   └── USER.md
│   └── ... (23 more)
│
├── routing/                    ← Case routing infrastructure
│   ├── router.md
│   ├── specialty-map.md
│   ├── routing-rules.md
│   ├── load-balancer.md
│   └── emergency-routing.md
│
├── orchestration/              ← Case lifecycle management
│   ├── orchestrator.md
│   ├── case-manager.md
│   ├── consensus-engine.md
│   └── workflow-engine.md
│
├── escalation/                 ← Escalation and emergency protocols
│   ├── escalation-tiers.md
│   ├── emergency-protocols.md
│   ├── crisis-response.md
│   └── referral-system.md
│
├── diagnostics/                ← AI triage and diagnostic engines
│   ├── eye-diagnostics.md
│   ├── hearing-diagnostics.md
│   ├── ai-triage.md
│   └── multimodal-engine.md
│
├── compliance/                 ← Regulatory and safety compliance
│   ├── audit-logging.md
│   ├── consent-management.md
│   ├── privacy-policy.md
│   └── permissions.md
│
├── analytics/                  ← Health outcomes and performance
│   ├── health-trends.md
│   ├── outcome-tracking.md
│   └── performance-metrics.md
│
├── policies/                   ← Clinical and operational policies
│   ├── clinical-safety.md
│   ├── ai-validation.md
│   ├── prescribing-policy.md
│   └── nigerian-health-context.md
│
├── shared/                     ← Shared resources and reference data
│   ├── soul-template.md
│   ├── tools-registry.md
│   ├── escalation-triggers.md
│   └── nigerian-localization.md
│
├── templates/                  ← Agent file templates
│   ├── AGENT.md
│   ├── IDENTITY.md
│   ├── SOUL.md
│   ├── BOOTSTRAP.md
│   ├── HEARTBEAT.md
│   ├── TOOLS.md
│   └── USER.md
│
└── workflows/                  ← End-to-end clinical workflows
    ├── patient-intake.md
    ├── ai-validation-flow.md
    ├── emergency-escalation.md
    ├── physician-collaboration.md
    └── example-cases.md
```

---

## Regenerating Agent Files

To regenerate all 168 physician agent files:

```bash
cd lifegate-openclaw
python3 generate.py
```

To add a new physician:
1. Add a new entry to the `PHYSICIANS` list in `generate.py`
2. Re-run the generator
3. Review the generated files and customise as needed

---

## Design Principles

1. **Nigerian by design** — Agents are trained in Nigerian medical schools, speak Nigerian languages, and understand Nigerian healthcare realities.
2. **Diversity by intent** — 12 male / 12 female. 13 ethnic groups represented.
3. **Safety first** — Clinical safety rules are programmatic, not advisory.
4. **AI + human** — AI accelerates, human physicians decide.
5. **Scalable** — Adding physicians or specialisations requires only data, not code redesign.

---

## Built By

**DSHub Nigeria** | LifeGate Team  
*Nigeria's Healthcare, In Your Hands.*

---

*OpenClaw Framework version: 1.0.0 | LifeGate Mobile | May 2025*
