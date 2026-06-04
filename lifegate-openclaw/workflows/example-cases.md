# EXAMPLE CLINICAL CASES
## LifeGate OpenClaw | Illustrative Case Studies

---

## Purpose

These example cases demonstrate how the OpenClaw framework operates end-to-end
across different clinical scenarios. They are for training, onboarding, and
illustrative purposes.

---

## Case 1 — Malaria with Fever (Standard Routing)

**Patient:** Male, 34 years, Kano State
**Presenting complaint:** "5-day fever, body pain, headache, no appetite"
**Category:** Clinical Diagnosis

**EDIS Output:**
- Differential: Malaria (68%), Typhoid (18%), Viral fever (14%)
- Urgency: 48 (MEDIUM)
- Red flags: None
- Confidence: 0.79

**Routing:** Dr. Bassey Efiong (Infectious Disease) — standard queue

**Dr. Bassey's Assessment:**
> "Given your location in Kano during rainy season and your 5-day history,
> malaria is the most likely cause. I'd recommend an RDT test at your nearest
> health centre. Meanwhile, I'm prescribing Artemether-Lumefantrine (Coartem)
> as the evidence strongly suggests malaria."

**Outcome:** ACT prescribed. Malaria RDT positive (confirmed). Resolved in 5 days.

---

## Case 2 — Hypertensive Emergency (Emergency Routing)

**Patient:** Female, 58 years, Lagos State
**Presenting complaint:** "Severe headache, can't see properly, BP reading 195/118"
**Category:** Clinical Diagnosis

**EDIS Output:**
- Differential: Hypertensive urgency (71%), Hypertensive emergency (24%), Stroke (5%)
- Urgency: 87 (CRITICAL / E2)
- Red flags: BP ≥ 180/110 reported, visual disturbance
- Confidence: 0.83

**Routing:** E2 → Dr. Terseer Tyav (Emergency) + Dr. Ibrahim Danladi (Cardiology)

**Emergency Response (< 90 seconds):**
> "This is a hypertensive emergency. You need to go to a hospital immediately —
> do not delay. While getting there: sit or lie down, do not drive yourself,
> call 112 now. I'm generating your referral letter."

**Referral:** Generated for Lagos Island General Hospital (nearest emergency-capable facility)

**Outcome:** Patient went to hospital. Managed with IV labetalol. Discharged stable. Follow-up via LifeGate continued.

---

## Case 3 — Paediatric Malnutrition (Multi-Agent)

**Patient:** Child, 2 years, Zamfara State (mother consulting)
**Presenting complaint:** "My child is not growing, arms very thin, doesn't eat"
**Category:** Child Health

**EDIS Output:**
- Differential: Severe Acute Malnutrition (62%), Wasting/Stunting (28%), Intestinal parasite (10%)
- Urgency: 65 (HIGH)
- Red flags: Age 2, growth faltering, possible SAM
- Confidence: 0.74

**Routing:** Dr. Garba Suleiman (Paediatrics) + Dr. Yetunde Akande (Nutrition) — consensus

**Consensus Plan:**
> "Based on what you're describing, your child may have severe malnutrition.
> This needs urgent attention. We recommend you go to your nearest primary
> health centre or state general hospital immediately — your child needs
> RUTF (Ready-to-Use Therapeutic Food) and to be weighed and assessed.
> Please don't delay."

**Escalation:** Physical referral issued. Nearest PHC + CMAM programme identified.

**Outcome:** Child admitted to CMAM programme. Weight-for-height improving at follow-up.

---

## Case 4 — Mental Health Crisis (T6 Protocol)

**Patient:** Female, 22 years, Abuja
**Message received:** "I've been crying for weeks. I think nobody would miss me if I was gone."

**Crisis Trigger:** MHT-007 (passive suicidal ideation detected)

**Immediate Response (< 15 seconds):**
```
Crisis banner displayed.
Dr. Osagie Omoruyi + Dr. Chidinma Aneke engaged.
Crisis helplines shown.
```

**Dr. Chidinma's Response:**
> "I hear you, and I'm really glad you reached out. What you're going through
> sounds incredibly painful. You're not alone — I'm right here with you.
> Can you tell me a little more about what's been happening?"

**SAFE Assessment:**
- Severity: 5/10 passive ideation, no active plan
- Access: No identified means
- Future: No specific timeline
- Effect: Isolated; few close relationships

**Classification:** MEDIUM risk

**Plan:** Safety plan co-created. Daily check-ins for 7 days. Referred to MANI counselling service. Mental health care plan initiated.

---

## Case 5 — Eye Test Result (Specialist Routing)

**Patient:** Female, 45 years, Oyo State
**Category:** Eye Check-Up
**Test Results:** Snellen visual acuity 6/24 (right), 6/36 (left). Amsler grid: wavy lines noted.

**AI Pre-interpretation:**
- Right eye: Moderate impairment
- Left eye: Severe impairment
- Amsler: Central distortion → AMD / macular pathology concern
- Flag: URGENT

**Routing:** URGENT → Dr. Emeka Ugwu (Ophthalmology)

**Dr. Emeka's Response:**
> "Your vision test shows significant visual loss, especially in your left eye.
> The wavy lines you saw on the grid are particularly concerning — this may
> suggest a condition affecting the central part of your retina.
> You need an in-person ophthalmology review as soon as possible —
> ideally within 48 hours. I'm generating a referral now."

**Referral:** Issued to nearest tertiary eye unit (LAUTECH Eye Centre, Ogbomoso)

**Outcome:** Wet AMD diagnosed. Anti-VEGF treatment initiated. Vision preserved.

---

*Example Cases version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
