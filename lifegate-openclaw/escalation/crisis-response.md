# CRISIS RESPONSE
## LifeGate OpenClaw | Mental Health Crisis Protocol

---

## Purpose

This protocol governs how LifeGate physician agents respond when a patient
expresses suicidal ideation, self-harm intent, homicidal ideation, or is in
acute psychiatric crisis. This is a zero-tolerance safety domain.

---

## Crisis Trigger Keywords (Auto-Detection)

The system monitors all messages for the following triggers:

**Direct Triggers (immediate T6 escalation):**
- "I want to kill myself"
- "I want to die"
- "I'm going to hurt myself"
- "I don't want to be alive"
- "I'm going to end it"
- "There's no point in living"
- Any direct statement of intent to harm another person

**Risk Indicators (elevated monitoring, may trigger T6):**
- "I feel hopeless", "I feel worthless"
- "Everyone would be better off without me"
- "I've been thinking about death a lot"
- "I've been saving pills", "I have a plan"
- "I've hurt myself before"
- Asking about lethal medication doses without clinical context

---

## Immediate Response Sequence

```
ON CRISIS_TRIGGER_DETECTED:

  1. INSTANTLY display crisis banner on patient screen:
     ┌─────────────────────────────────────────────────┐
     │ You're not alone. A counsellor is with you now. │
     │ Crisis Support: 0800-23374633 (24/7 free)        │
     │ Emergency: 112                                   │
     └─────────────────────────────────────────────────┘

  2. ENGAGE: Dr. Osagie Omoruyi (Psychiatry) — IMMEDIATE
     CC: Dr. Chidinma Aneke (Psychology)

  3. NOTIFY LifeGate clinical safety officer (background)

  4. LOCK session: patient cannot close/navigate away from session
     (Can only be unlocked by physician or safety officer)

  5. PHYSICIAN begins SAFE assessment (see below)
```

---

## SAFE Assessment Protocol

Physician conducts rapid structured risk assessment:

| Domain          | Question Approach                                            |
|-----------------|--------------------------------------------------------------|
| **S** — Severity | "On a scale of 1–10, how strong is the urge right now?"    |
| **A** — Access  | "Do you have access to anything you could use to hurt yourself?" |
| **F** — Future  | "Do you have a specific plan or time in mind?"              |
| **E** — Effect  | "Has anyone in your family or circle experienced similar thoughts?" |

**Risk Classification:**

| Level  | Indicators                                            | Response                                       |
|--------|-------------------------------------------------------|------------------------------------------------|
| LOW    | Passive thoughts, no plan, good support network       | Validate, safety plan, follow-up in 24h        |
| MEDIUM | Active thoughts, vague plan, some isolation           | Crisis counselling, safety plan, daily check-in|
| HIGH   | Specific plan, access to means, timeline, isolation   | Refer to emergency services IMMEDIATELY        |

---

## Safety Planning

For LOW and MEDIUM risk, physician co-creates a safety plan with patient:

```
My Safety Plan (LifeGate)

1. Warning signs I notice: ____________________
2. Things I can do on my own: ________________
3. People I can reach out to:
   - Name: ____________ | Phone: ____________
   - Name: ____________ | Phone: ____________
4. Professionals I can call:
   - LifeGate Crisis: 0800-23374633
   - My doctor: Dr. [Name] (via LifeGate)
5. Making my environment safer: ______________
6. Reasons for living: ______________________
```

---

## Nigerian Mental Health Crisis Resources

| Resource                                      | Contact                    |
|-----------------------------------------------|----------------------------|
| Mentally Aware Nigeria Initiative (MANI)      | +234 806 210 6493          |
| Suicide Research & Prevention Initiative (SURPIN) | +234 908 142 0000      |
| LifeGate Crisis Support                       | 0800-23374633 (Toll-free)  |
| Nigeria Emergency (police/ambulance)          | 112                        |
| Association of Psychiatrists in Nigeria       | +234 1 291 7660            |

---

## Cultural Sensitivity Notes

Nigerian mental health context requires particular sensitivity:

- **Stigma:** Mental illness may be attributed to spiritual causes. Physician agents must not dismiss cultural frameworks but must also ensure clinical care is received.
- **Language:** Avoid clinical jargon. Use terms like "the pain you're feeling", not "suicidal ideation."
- **Family:** Nigerian patients may respond better when family involvement is offered (only with patient consent).
- **Religion:** Faith-based coping is valid — physician agents may acknowledge, but must not use it as a substitute for clinical care.
- **Gender:** Female patients may fear family/community judgment; reassure confidentiality explicitly.

---

## Post-Crisis Follow-Up

After any T6 crisis event:
1. Mandatory follow-up within 24 hours
2. Daily check-ins for 7 days (automated + physician)
3. Mental health care plan created and shared
4. Case reviewed by LifeGate clinical governance

---

*Crisis Response version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
