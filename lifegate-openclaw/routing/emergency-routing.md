# EMERGENCY ROUTING
## LifeGate OpenClaw | Emergency Case Fast-Path Protocol

---

## Purpose

Emergency routing bypasses the standard queue and multi-step routing logic.
Critical cases are assigned immediately to the emergency team and parallel
specialists with zero delay.

---

## Emergency Tier Classification

| Tier | Name         | Urgency Score | Response Target | Example Presentations                            |
|------|--------------|---------------|-----------------|--------------------------------------------------|
| E1   | IMMEDIATE    | 95–100        | < 30 seconds    | Cardiac arrest, active seizure, obstetric PPH   |
| E2   | CRITICAL     | 85–94         | < 2 minutes     | Stroke, severe chest pain, anaphylaxis           |
| E3   | EMERGENT     | 70–84         | < 10 minutes    | High fever + neck stiffness, acute abdomen       |
| E4   | URGENT       | 60–69         | < 30 minutes    | Moderate dyspnoea, uncontrolled pain             |

---

## E1 — Immediate Protocol

**Trigger:** Urgency score ≥ 95 OR any of:
- Loss of consciousness
- Pulseless / no breathing
- Active PPH (postpartum haemorrhage)
- Status epilepticus
- Anaphylactic shock
- GCS ≤ 8

```
ACTION SEQUENCE (E1):
  1. INSTANTLY engage Dr. Terseer Tyav (Emergency Medicine)
  2. SIMULTANEOUSLY:
     - Display emergency services hotlines to patient
     - Trigger in-app emergency alert banner
     - If geolocation available → surface nearest hospital
  3. NOTIFY Dr. Bukola Adesanya (EM backup) as co-responder
  4. If condition suggests specific specialty:
     - Cardiac: + Dr. Ibrahim Danladi
     - Neuro: + Dr. Babatunde Fasanya
     - Obstetric: + Dr. Aliyu Bello + Dr. Esohe Oseni
     - Paediatric: + Dr. Garba Suleiman
  5. LOG event: emergency_e1_triggered
  6. KEEP patient engaged with first-aid instructions while physician connects
```

**Patient Message (shown immediately):**
> "This sounds like a medical emergency. I'm connecting you to our emergency physician right now. While waiting, please call **112** (Nigeria emergency line) or **0700-CALL-LIFEGATE** and stay on the line."

---

## E2 — Critical Protocol

**Trigger:** Urgency score 85–94 OR any of:
- Suspected acute stroke (FAST: Face, Arms, Speech, Time)
- Severe chest pain ± radiation
- Respiratory distress (SpO2 < 90% reported / cyanosis)
- Suspected meningitis (fever + photophobia + neck stiffness)
- Severe hypertensive urgency (reported BP ≥ 180/120)

```
ACTION SEQUENCE (E2):
  1. Engage Dr. Terseer Tyav (Emergency Medicine) — PRIORITY QUEUE
  2. Engage relevant specialist in parallel:
     - Stroke: Dr. Babatunde Fasanya
     - Chest pain: Dr. Ibrahim Danladi
     - Obstetric: Dr. Aliyu Bello
  3. Flag case HIGH_PRIORITY in physician dashboard
  4. Notify patient: estimated response < 2 minutes
  5. Begin symptom stabilisation guidance (position, breathing, etc.)
  6. LOG: emergency_e2_triggered
```

---

## E3 — Emergent Protocol

**Trigger:** Urgency score 70–84

```
ACTION SEQUENCE (E3):
  1. Route directly to primary specialist (bypasses standard queue)
  2. Load balancer checks availability — force ACTIVE slot if needed
  3. SLA timer starts: response required within 10 minutes
  4. Patient receives estimated wait time notification
  5. LOG: emergency_e3_triggered
```

---

## E4 — Urgent Protocol

**Trigger:** Urgency score 60–69

```
ACTION SEQUENCE (E4):
  1. Insert case at top of standard queue
  2. Notify patient of priority status
  3. SLA timer: 30-minute response window
  4. LOG: emergency_e4_triggered
```

---

## Emergency Contact Numbers (Displayed to Patients)

| Service                         | Number              |
|---------------------------------|---------------------|
| Nigeria Emergency Line          | 112                 |
| Lagos State Emergency           | 767 / 112           |
| NEMA Emergency                  | 0800-CALL-NEMA      |
| Federal Road Safety Corps       | 122                 |
| LifeGate Emergency Hotline      | 0700-CALL-LIFEGATE  |

---

## Nearest Facility Surfacing

If location permission is granted:
1. Query LifeGate health facility database for nearest emergency-capable hospital
2. Display up to 3 nearest facilities with distance and address
3. If no GPS → prompt user for LGA/state and look up by region

---

## Post-Emergency Handoff

After emergency stabilisation:
1. Emergency physician writes handoff note
2. Appropriate specialist takes over for ongoing care
3. Case marked `emergency_resolved` or `transferred_to_physical`
4. Follow-up scheduled at 24h, 72h, and 7 days

---

*Emergency Routing version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
