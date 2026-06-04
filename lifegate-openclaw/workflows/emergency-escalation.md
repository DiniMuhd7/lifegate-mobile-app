# EMERGENCY ESCALATION WORKFLOW
## LifeGate OpenClaw | Emergency Response Step-by-Step Process

---

## Overview

This workflow describes the complete emergency escalation process from
initial trigger detection through to patient handoff to physical care.

---

## Workflow Steps

### Step 1 — Emergency Trigger Detection

Emergency triggers are detected by:
1. EDIS urgency score ≥ 70
2. Keyword detection in patient message (see shared/escalation-triggers.md)
3. Physician agent manually escalating an in-progress case
4. Patient-initiated "I need emergency help" button

---

### Step 2 — Immediate Patient Stabilisation

**Within 30 seconds of trigger:**

System displays emergency banner:
```
┌─────────────────────────────────────────────────────────┐
│  🚨 You may have a medical emergency.                   │
│  Our emergency doctor is connecting now.                │
│  Emergency line: 112 | LifeGate Emergency: 0700-CALL   │
└─────────────────────────────────────────────────────────┘
```

Relevant first-aid guidance displayed based on detected condition:
- Cardiac: "Sit or lie down. Don't exert yourself. Chew aspirin if available."
- Stroke: "Don't give anything by mouth. Time the symptoms. Note when it started."
- Obstetric: "Lie on your left side. Do not push."
- Breathing: "Sit upright. Loosen tight clothing. Try to breathe slowly."

---

### Step 3 — Emergency Agent Assignment

**E1 (Immediate):** Dr. Terseer Tyav + Dr. Bukola Adesanya + relevant specialist
**E2 (Critical):** Dr. Terseer Tyav + relevant specialist
**E3 (Emergent):** Relevant specialist — emergency queue priority
**E4 (Urgent):** Relevant specialist — top of standard queue

All emergency assignments bypass the load balancer queue entirely.

---

### Step 4 — Emergency Physician Response

Emergency physician opens case and:
1. Reviews EDIS output + any prior physician notes
2. Sends immediate stabilisation instructions (< 2 minutes E2)
3. Simultaneously triggers relevant emergency protocol (see escalation/emergency-protocols.md)
4. Contacts patient to assess real-time status

---

### Step 5 — Parallel Specialist Engagement

Where condition requires specialist input:
- Cardiac: Dr. Ibrahim Danladi engaged in parallel
- Neurological: Dr. Babatunde Fasanya engaged in parallel
- Obstetric: Dr. Aliyu Bello + Dr. Esohe Oseni engaged
- Paediatric: Dr. Garba Suleiman engaged in parallel

Specialists review case and provide specialist-specific instructions to emergency physician.

---

### Step 6 — Physical Care Direction

Emergency physician determines whether patient needs physical care:

| Decision          | Action                                                     |
|-------------------|------------------------------------------------------------|
| Must go NOW       | Issue emergency directive + surface nearest A&E + call 112 guide |
| Can be stabilised | Continue virtual management with close monitoring         |
| Unclear           | Err on side of caution — direct to hospital               |

If going to hospital:
1. Referral letter generated automatically
2. Patient shown nearest emergency-capable facilities (max 3, with distances)
3. Patient given instructions: "Tell them you have [condition] and were seen on LifeGate."

---

### Step 7 — Emergency Case Handoff

After directing patient to physical care:
1. Emergency physician writes detailed handoff note
2. Case status: `emergency_referred_to_physical`
3. Follow-up scheduled at 24h after expected hospital visit
4. Audit trail: full emergency response recorded

---

### Step 8 — Post-Emergency Follow-Up

At 24-hour follow-up:
> "Hi [Name], we're checking in after your emergency yesterday.
> Did you get to the hospital? How are you feeling now?"

If patient did not attend hospital:
- Reassess urgency
- Re-engage emergency physician if still concerning
- Document patient's decision in case record

---

*Emergency Escalation Workflow version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
