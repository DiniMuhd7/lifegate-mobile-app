# ROUTING RULES
## LifeGate OpenClaw | Case Routing Decision Logic

---

## Rule Hierarchy

Rules are evaluated **top-to-bottom**. The first matching rule wins.

```
Priority 1 → CRITICAL / Emergency Override
Priority 2 → Single-specialty exact match
Priority 3 → Multi-specialty composite case
Priority 4 → Uncertain → AI Validation + Consensus
Priority 5 → Default → General Medicine
```

---

## Rule 1 — Emergency Override (CRITICAL urgency)

**Trigger:** `urgency_score >= 90` OR red-flag symptoms present

Red-flag symptom set:
- Severe chest pain radiating to jaw/arm
- Loss of consciousness / unresponsive
- Severe difficulty breathing / cyanosis
- Active seizure
- GCS < 12
- Signs of septic shock (hypotension + fever + altered consciousness)
- Active haemorrhage
- Acute stroke symptoms (FAST positive)
- Obstetric emergency (eclampsia, PPH, cord prolapse)

**Action:**
1. Immediately engage `dr-terseer-tyav` (Emergency Medicine)
2. In parallel: engage the relevant specialist (e.g., Neurology for stroke)
3. Alert human escalation pathway
4. Display emergency contact instructions to patient

---

## Rule 2 — Urgent Routing (HIGH urgency)

**Trigger:** `urgency_score 60–89`

**Action:**
1. Route to primary specialist per specialty-map.md
2. Flag case as HIGH_PRIORITY
3. Require response within SLA tier 1 (see SLA policy)
4. Notify backup agent if primary not available within 5 minutes

---

## Rule 3 — Standard Routing (MEDIUM urgency)

**Trigger:** `urgency_score 30–59`

**Action:**
1. Route to primary specialist per specialty-map.md
2. Apply standard SLA (tier 2)
3. If specialist unavailable → load balancer selects next available agent

---

## Rule 4 — Wellness / Low-Acuity Routing (LOW urgency)

**Trigger:** `urgency_score < 30`

**Action:**
1. Route to General Medicine if no specific specialty match
2. May queue for async review
3. Notify patient of expected wait time

---

## Rule 5 — Multi-Specialty Case Routing

**Trigger:** AI differential contains conditions from ≥ 2 distinct specialisations

**Action:**
1. Identify all relevant specialisations from `specialty-map.md`
2. Route to all matched agents simultaneously
3. Flag for consensus engine review
4. Primary responding agent manages patient communication

---

## Rule 6 — Low-Confidence AI Triage

**Trigger:** EDIS confidence score < 65% for top differential

**Action:**
1. Route to `dr-ngozi-okafor` (AI Clinical Validation) first
2. If Dr. Ngozi confirms triage → proceed with normal routing
3. If uncertain → trigger consensus engine
4. Log event as `ai_low_confidence`

---

## Rule 7 — Scan Result Routing

**Trigger:** `session_category == scan_result` (eye test, hearing test, document scan)

**Action:**
- Eye test → `dr-emeka-ugwu` (Ophthalmology)
- Hearing test → `dr-iquo-archibong` (Audiology)
- Medical document scan → route by document specialty (auto-detected)
- Lab results → route by abnormal value specialty

---

## Rule 8 — Paediatric Override

**Trigger:** Patient age < 18

**Action:**
1. Regardless of presenting complaint, CC `dr-garba-suleiman` or `dr-yetunde-akande`
2. Primary specialist may be another department but paediatrics must be in loop
3. Exception: emergency cases route to Emergency first, paediatrics in parallel

---

## Rule 9 — Maternal Health Override

**Trigger:** Patient is pregnant (confirmed or suspected)

**Action:**
1. CC `dr-aliyu-bello` or `dr-esohe-oseni` on all cases
2. Medication safety review required for any prescription involving pregnancy
3. Any abdominal, cardiac, or neurological symptom in pregnancy → URGENT

---

## Rule 10 — No Match / Fallback

**Trigger:** No specialisation match found

**Action:**
1. Route to `dr-ahmed-musa` (General Medicine)
2. Log as `unmatched_routing`
3. Dr. Musa performs intake, re-triages, and escalates appropriately

---

## Routing Audit Requirements

Every routed case MUST produce an audit entry containing:
- `case_id`, `timestamp`, `urgency`, `rule_applied` (1–10)
- `agent_assigned`, `secondary_agents`, `routing_reason`

See `compliance/audit-logging.md` for full schema.

---

*Routing Rules version: 1.0.0 | LifeGate OpenClaw Framework | DSHub Nigeria*
