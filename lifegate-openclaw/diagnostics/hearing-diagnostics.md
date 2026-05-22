# HEARING DIAGNOSTICS
## LifeGate OpenClaw | Audiology & ENT Diagnostic Engine

---

## Purpose

The Hearing Diagnostics engine processes the results of LifeGate's built-in
hearing self-assessment tests and routes them to the audiology agent for
interpretation and clinical follow-up.

---

## Available Hearing Tests (LifeGate Mobile)

| Test Name                    | What It Measures                             | Technology Used          |
|------------------------------|----------------------------------------------|--------------------------|
| Pure Tone Audiometry (PTA)   | Hearing threshold at 250Hz–8kHz              | Calibrated device tones  |
| Speech Discrimination        | Clarity of spoken word comprehension         | Word repetition test     |
| High-Frequency Screen        | Age-related high-frequency loss detection    | Tone playback            |
| Tinnitus Assessment          | Pitch, intensity, and impact of ringing      | Self-report + tone match |
| Hearing Handicap Inventory   | Impact of hearing loss on daily functioning  | Validated questionnaire  |

---

## Interpretation: Pure Tone Audiometry

| Average Threshold (dB HL)  | Classification         | Action                                     |
|----------------------------|------------------------|--------------------------------------------|
| 0 – 25 dB                  | Normal hearing         | Reassure; routine follow-up                |
| 26 – 40 dB                 | Mild hearing loss      | Recommend audiology review; hearing aid assessment |
| 41 – 55 dB                 | Moderate hearing loss  | Refer to audiologist; communication support|
| 56 – 70 dB                 | Moderately severe      | Urgent referral; hearing aid mandatory     |
| 71 – 90 dB                 | Severe hearing loss    | Urgent — full audiological workup          |
| > 90 dB                    | Profound hearing loss  | Emergency audiological / ENT referral      |

---

## Asymmetric Hearing Loss Flag

If one ear is > 15 dB worse than the other:
- FLAG: Asymmetric SNHL (sensorineural hearing loss)
- Action: Urgent route to Dr. Iquo Archibong
- Rule out: acoustic neuroma, labyrinthitis, sudden SNHL

---

## Interpretation: Speech Discrimination

| Score        | Significance                                      |
|--------------|---------------------------------------------------|
| ≥ 90%        | Normal — good speech understanding                |
| 80 – 89%     | Mild difficulty — may need hearing aid evaluation |
| 60 – 79%     | Significant difficulty — audiology + ENT review   |
| < 60%        | Severe difficulty — urgent referral               |

---

## Interpretation: Tinnitus

| Severity (Patient-Reported VAS) | Clinical Response                          |
|----------------------------------|--------------------------------------------|
| Mild (1–3/10)                   | Counselling + lifestyle advice             |
| Moderate (4–6/10)               | Sound therapy assessment; ENT review       |
| Severe (7–10/10)                | Urgent ENT + tinnitus clinic referral      |
| Associated with dizziness        | Rule out Ménière's disease — urgent        |
| Pulsatile tinnitus               | Urgent — vascular cause possible           |

---

## Routing After Hearing Test

```
Hearing test result received
  ↓
AI pre-interpretation runs (above tables)
  ↓
If profound loss, asymmetric, or pulsatile tinnitus:
  → URGENT route to Dr. Iquo Archibong (Audiology/ENT)
  
If mild/moderate loss:
  → Standard route to Dr. Iquo Archibong
  
If normal:
  → Dr. Iquo confirms, patient reassured
  → Recommend annual re-check for at-risk patients
```

---

## Red Flags (Urgent Response Required)

- Sudden hearing loss (one or both ears) — onset < 72 hours
- Hearing loss + severe dizziness / vertigo
- Hearing loss + facial nerve weakness
- Hearing loss + ear discharge (possible cholesteatoma)
- Unilateral pulsatile tinnitus
- Hearing loss in children < 3 years (developmental milestone risk)

---

## Occupational Hearing Risk Assessment

Dr. Iquo Archibong includes occupational history in hearing assessments:

| Occupation          | Noise Risk Level | Recommendation                          |
|---------------------|------------------|-----------------------------------------|
| Factory worker      | HIGH             | Ear protection; annual audiometry       |
| Musician            | HIGH             | Custom ear monitors; regular testing    |
| Military / Security | HIGH             | Mandatory hearing protection protocols |
| Driver              | MEDIUM           | Limit headphone use; periodic testing  |
| Office worker       | LOW              | Standard recommendations                |

---

## Physician Agent Prompt (Dr. Iquo Archibong)

When receiving hearing test results, Dr. Iquo responds with:
1. Summary of hearing threshold findings per frequency
2. Likely diagnosis or clinical concern
3. Impact on daily communication (plain language)
4. Recommended next steps (hearing aid, ENT, retest)
5. Protective measures relevant to patient's context

---

*Hearing Diagnostics version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
