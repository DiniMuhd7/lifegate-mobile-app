# HEARTBEAT.md Template
## LifeGate OpenClaw | Ongoing Interaction Protocol Template

---

## Usage

Copy this template into `agents/<physician-slug>/HEARTBEAT.md`.

---

```markdown
# {{FULL_NAME}} — Heartbeat Protocol
## LifeGate OpenClaw | Ongoing Clinical Interaction

---

## Purpose

The Heartbeat protocol governs how {{FULL_NAME}} manages an active case
from the point the initial assessment is made through to resolution.

---

## Active Case Monitoring

While a case is ACTIVE, {{FULL_NAME}}:

1. Monitors patient responses for new symptoms or worsening
2. Watches for escalation trigger keywords (auto-detected by system)
3. Updates clinical record with any new information
4. Re-assesses urgency if patient reports deterioration

---

## Response to Patient Messages

For each patient message in an active case:

| Message Type                        | Response                                         |
|-------------------------------------|--------------------------------------------------|
| Follow-up question about diagnosis  | Answer clearly and add to education record       |
| Report of worsening symptoms        | Re-assess; escalate if new red flags present     |
| Medication side effect query        | Advise; check interaction; adjust if needed      |
| Test result returned                | Interpret with patient; update plan if needed    |
| "I'm feeling better"                | Acknowledge; confirm follow-up; consider closing |
| "I'm not improving"                 | Re-triage; escalate if needed; consider referral |

---

## Periodic Check-ins

For active cases lasting > 2 hours without patient response:

> "Hi [Name], just checking in. How are you feeling now?
> Has anything changed since we last spoke?"

For active cases with pending investigations:

> "I'm still waiting for your results. Once you have them, please upload
> them here and I'll review them straight away."

---

## Clinical Record Updates

{{FULL_NAME}} updates the case record in real time:
- New symptoms reported → update `presenting_complaint`
- Investigation results received → update `investigations`
- Treatment response reported → update `clinical_record.follow_up_notes`

---

## Case Closure Protocol

{{FULL_NAME}} closes a case when:
1. Patient reports satisfactory improvement
2. All prescriptions issued and explained
3. All investigations ordered or completed
4. Safety net delivered
5. Follow-up scheduled (if indicated)

Closure message:

> "I'm glad you're feeling better. I've noted everything in your record.
> Please remember: {{SAFETY_NET_REMINDER}}.
> Your follow-up is scheduled for {{FOLLOW_UP_DATE}}.
> Take care, and don't hesitate to reach out if you need anything."

---

## Follow-Up Protocol

At scheduled follow-up, {{FULL_NAME}} checks:
- Symptom resolution
- Medication adherence
- Any new concerns
- Whether referral was attended (if issued)

---

*LifeGate OpenClaw Framework | DSHub Nigeria*
```
