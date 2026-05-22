# HEALTH TRENDS
## LifeGate OpenClaw | Population Health Analytics

---

## Purpose

The Health Trends engine analyses aggregated (anonymised) clinical data from
LifeGate consultations to surface population health patterns, disease burdens,
and seasonal trends across Nigeria. No individual patient data is used.

---

## Data Sources

| Source                         | Data Used (Anonymised)                         |
|--------------------------------|------------------------------------------------|
| EDIS triage outputs            | Presenting complaints, differentials          |
| Case resolutions               | Diagnoses confirmed by physicians             |
| Geographic metadata            | State/LGA of patient (not address)            |
| Temporal metadata              | Month, season, year                           |
| Demographic metadata           | Age group, sex (not individual identity)      |
| Treatment outcomes             | Follow-up outcomes (resolved/persisted)       |

---

## Key Health Trend Metrics

### 1. Top Presenting Complaints by Region

Tracks the most common reasons patients seek care, by geopolitical zone:

| Region            | Consistently Top 5 Complaints (Nigeria)                    |
|-------------------|------------------------------------------------------------|
| North-West        | Malaria, typhoid, URTI, malnutrition, hypertension         |
| North-East        | Malaria, TB, meningitis, nutritional deficiencies, URTI    |
| North-Central     | Malaria, typhoid, hypertension, malnutrition, GI illness   |
| South-West        | Malaria, hypertension, diabetes, anxiety, URTI             |
| South-East        | Malaria, typhoid, sickle cell, diabetes, GI illness        |
| South-South       | Malaria, typhoid, HIV/AIDS, URTI, hypertension             |

### 2. Seasonal Disease Patterns

| Season                  | Disease Surge Expected                                     |
|-------------------------|------------------------------------------------------------|
| Dry season (Nov–Mar)    | Meningitis (N. belt), URTI, cerebrospinal meningitis       |
| Rainy season (Apr–Oct)  | Malaria, cholera, typhoid, leptospirosis, fungal infections|
| Harmattan (Dec–Feb)     | URTI, asthma, skin dryness, eye irritation                 |
| Post-flooding           | Cholera outbreaks, typhoid, leptospirosis                  |

### 3. Chronic Disease Burden Tracking

Tracks growth in chronic disease presentations over time:
- Hypertension prevalence by region
- Diabetes mellitus incidence trends
- Mental health presentation trends (anxiety, depression)
- Sickle cell disease consultations

### 4. AI Accuracy Trends

Measures EDIS performance over time:
- % of AI differentials confirmed by physician
- Average confidence score trend
- Physician override frequency by condition category

---

## Outbreak Signal Detection

The Health Trends engine monitors for unusual spikes in specific conditions:

```
IF presenting_complaint_count(condition, region) > mean + 2SD over 7 days:
  FLAG: potential_outbreak_signal
  NOTIFY: Dr. Hadiza Maigari (Public Health) + Dr. Bassey Efiong (Infectious Dis)
  GENERATE: outbreak_alert report
```

**Monitored Conditions:**
- Cholera, meningitis, Lassa fever, mpox, yellow fever, viral haemorrhagic fever
- Unusually high fever clusters in specific LGAs
- Unusual respiratory illness clusters

---

## Output: Health Insights Dashboard

LifeGate clinical governance and FMOH partners can access:
- Weekly disease trend summaries
- Regional health burden maps
- Seasonal prediction alerts
- AI performance reports
- Physician utilisation and response time analytics

**Access:** Clinical governance role only. All data anonymised.

---

*Health Trends version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
