# EYE DIAGNOSTICS
## LifeGate OpenClaw | Ophthalmology & Optometry Diagnostic Engine

---

## Purpose

The Eye Diagnostics engine processes the results of LifeGate's built-in eye
self-assessment tests and routes them to the ophthalmology agent for
interpretation and clinical response.

---

## Available Eye Tests (LifeGate Mobile)

| Test Name                      | What It Measures                          | Technology Used       |
|--------------------------------|-------------------------------------------|-----------------------|
| Visual Acuity (Snellen-based)  | Clarity of distance and near vision       | Screen-based chart    |
| Contrast Sensitivity           | Ability to distinguish objects vs. background | CSS-based grid     |
| Colour Vision (Ishihara-style) | Red-green colour blindness detection      | Image display         |
| Amsler Grid                    | Central vision distortion (macular issues)| Interactive grid      |
| Pupillary Light Response       | Pupil reactivity (neurological flag)      | Torch test guide      |

---

## Interpretation: Visual Acuity

| Result               | Classification     | Action                                      |
|----------------------|--------------------|---------------------------------------------|
| 6/6 or better        | Normal             | Reassure; no intervention needed            |
| 6/9 – 6/12           | Mild impairment    | Refractive error likely; recommend optician |
| 6/18 – 6/24          | Moderate impairment| Refer to optometrist; rule out pathology    |
| 6/36 or worse        | Severe impairment  | URGENT referral to ophthalmologist          |
| One eye significantly worse | Amblyopia concern | Refer; cover test recommended         |

---

## Interpretation: Contrast Sensitivity

| Result               | Likely Significance                        |
|----------------------|--------------------------------------------|
| Normal               | Good retinal function                      |
| Mildly reduced       | Early cataract or refractive error         |
| Moderately reduced   | Possible glaucoma or diabetic retinopathy  |
| Severely reduced     | Advanced pathology — urgent ophthalmology  |

---

## Interpretation: Colour Vision

| Result               | Likely Significance                        |
|----------------------|--------------------------------------------|
| Normal               | No deficiency                              |
| Red-green deficiency | X-linked colour blindness (congenital)     |
| Acquired changes     | Possible optic nerve or retinal pathology  |

---

## Interpretation: Amsler Grid

| Result               | Significance                               |
|----------------------|--------------------------------------------|
| Straight lines       | Normal macular function                    |
| Wavy / distorted     | Age-related macular degeneration (AMD), CNV|
| Missing areas        | Macular hole or scotoma                    |
| Blurry centre        | Central serous retinopathy                 |

---

## Routing After Eye Test

```
Eye test result received
  ↓
AI pre-interpretation runs (above tables)
  ↓
If ANY red flag (severe impairment, Amsler distortion, unilateral loss):
  → URGENT route to Dr. Emeka Ugwu (Ophthalmology)
  
If mild/moderate:
  → Standard route to Dr. Emeka Ugwu
  
If normal (all tests):
  → Dr. Emeka confirms, patient reassured
  → Recommend annual re-check
```

---

## Red Flags (Require Same-Day Response)

- Sudden loss of vision in one or both eyes
- Sudden flashes of light or floaters (new onset)
- Curtain or shadow across vision
- Severely painful red eye
- Chemical splash to eye (emergency → go to hospital immediately)
- Trauma to eye

---

## Physician Agent Prompt (Dr. Emeka Ugwu)

When receiving eye test results, Dr. Emeka Ugwu responds with:
1. Summary of findings in plain language
2. Likely diagnosis / concern
3. What the patient should do (urgency graded)
4. Risk factors to be aware of (diabetes, glaucoma family history, etc.)
5. Follow-up recommendation (when to re-test or seek in-person care)

---

*Eye Diagnostics version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
