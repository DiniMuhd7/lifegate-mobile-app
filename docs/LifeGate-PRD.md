PRODUCT REQUIREMENTS DOCUMENT
Lifegate by DHSub
Your trusted digital health companion.
Version 3.1  ·  Final Draft  ·  March 2026


1. Executive Summary
Lifegate is a mobile-first digital health platform built for people who deserve more than a Google search when they feel unwell. It combines conversational AI with mandatory physician validation — so users get fast, accessible health guidance that is also clinically accountable.
The platform is built around three core values: safety first, intelligent triage, and human oversight. Every clinical output passes through a licensed physician before it reaches the user. No exceptions.
Lifegate is designed to meet clinical safety standards and Nigeria's NDPA 2023 data privacy regulations, while remaining approachable and intuitive for everyday users.


2. Product Vision
To give every individual access to a trusted, always-available health companion — one that supports early detection, helps people make informed decisions, and connects them to the care they need without the friction they have come to expect.


3. The Problem We're Solving
Most people in Nigeria don't have easy access to quality healthcare. Clinics are far away, queues are long, and costs add up quickly. When something feels off, the default response is to search online, ask a friend, or wait and hope it goes away.
The result is a broken middle ground — people either over-react with expensive, unnecessary hospital visits, or under-react and catch serious conditions too late. Lifegate fills that gap with a medically credible first step that is fast, affordable, and available from any phone at any time of day.


4. Product Scope
Included in Phase 1
AI-powered conversational health triage
Early Detection Intelligence System (EDIS)
Physician verification via MDCN WebView
Physician validation workflow with pending, active, and completed case states
Health history tracking
Preventive insights and alerts
Admin monitoring and compliance dashboard
Out of Scope for Phase 1
Live telemedicine — video or audio consultations
Prescription issuance
External EMR integrations


5. Who We're Building For
Patients — Primary Users
People looking for fast, reliable, and affordable health guidance. They may not have easy access to a clinic, or they want a trusted first step before deciding whether to see a doctor in person.
Physicians
Licensed medical professionals who review and validate AI-generated outputs. They are the backbone of Lifegate's clinical credibility. Physicians go through a mandatory MDCN licence verification immediately after sign-up, before they can access any cases.
Administrators
Internal operators responsible for keeping the platform healthy — monitoring system performance, managing compliance, reviewing physician accounts, and responding to escalations.


6. How the Product Works
6.1 General Health Mode (AI-Only)
This mode handles everyday, non-clinical health questions — the kind of things people normally Google. The AI responds immediately with informational guidance. No physician is involved, no risk scoring happens, and no clinical claims are made.
If the conversation shifts toward something clinically significant, the system automatically escalates to Clinical Mode. The user doesn't need to do anything — Lifegate handles the transition quietly in the background.
6.2 Clinical Diagnosis Mode (AI + Physician)
When a case needs real clinical attention, this is the mode that takes over. The flow works like this:
Patient describes their symptoms
EDIS processes the input and generates a preliminary output with confidence scores
The case enters the physician queue as a Pending case
A physician picks it up — it becomes an Active case
The physician approves, edits, or rejects the AI output with their clinical notes
The case moves to Completed, and the patient receives their final validated report

No clinical output ever reaches a patient without physician sign-off. That is a hard requirement, not a guideline.


7. What the System Needs to Do
7.1 Patient App
Core Capabilities
Secure onboarding with NDPA-compliant consent — users know exactly what they are agreeing to
Health profile and data management
Symptom input via text, with voice input extensible in future phases
Conversational AI interface that feels natural, not clinical
Real-time case status tracking throughout the diagnosis flow
Access to AI and physician diagnosis reports
Full health timeline and history
Preventive alerts and follow-up prompts
Experience Standards
AI response latency under 500ms — responses should feel instant
Clear feedback at every state: loading, processing, under physician review
Empathetic, human tone throughout — never robotic, never cold

7.2 Physician System
Onboarding & Licence Verification
Immediately after a physician completes sign-up, they are taken through a mandatory MDCN licence verification step before gaining any access to the platform. This is implemented via an embedded WebView that loads the Medical and Dental Council of Nigeria (MDCN) verification portal directly within the app.

Implementation note: The WebView loads the MDCN website (mdcn.gov.ng) in a controlled in-app browser. The physician enters their registration number, and the result is captured and stored against their profile. Until verification is confirmed, the physician account remains in a 'Pending Verification' state and cannot access the case queue.


WebView loads MDCN portal immediately after sign-up is complete
Physician enters their MDCN registration number on the MDCN site
Verification status is recorded and tied to the physician's profile
Account stays in Pending Verification state until confirmed — no case access during this window
If verification fails or the portal is unreachable, the physician is prompted to retry or contact support
Admin can manually override verification status if needed (e.g., MDCN portal downtime)
Case Queue & States
Every case in the physician queue exists in one of three states. The interface surfaces these clearly, and transitions between them are logged for audit purposes.

Pending: Case has been submitted by the patient and processed by EDIS. It is waiting to be picked up by a physician.
Active: A physician has opened the case and is currently reviewing it. The case is locked to that physician while active.
Completed: The physician has submitted their decision — approved, edited, or rejected. The patient has been notified.

Physician Actions & Features
Secure login with two-factor authentication
Case queue displaying Pending, Active, and Completed cases with clear visual distinction
Structured review interface — AI output, patient history, and symptom timeline in one view
Decision actions: approve the AI output, edit it with corrections, or reject it with a mandatory reason
Physician notes and personalised recommendations attached to every completed case
Earnings and performance tracking dashboard
Push or in-app notifications when a new Pending case is assigned

7.3 Admin System
Platform Monitoring
Administrators have a real-time view of everything happening on the platform. The monitoring dashboard is the primary tool for catching problems before they affect users.
Live dashboard showing active users, cases by state (Pending, Active, Completed), and physician availability
SLA tracking — visibility into how long Pending cases have been waiting and which are approaching breach
Physician account management — view verification status, case history, breach count, and the ability to flag or suspend accounts
Auto-reassignment log — a full record of every case that was reassigned due to inactivity or SLA breach
EDIS performance metrics — escalation rates, average confidence scores, and flag frequency
Payment and credit transaction log — every purchase, refund, and payout in one place
Compliance & Audit
Comprehensive audit log of all system actions — case transitions, physician decisions, admin overrides, and escalations
NDPA 2023 compliance monitoring tools
Notification and alert controls — configure thresholds for SLA breach alerts, unusual activity flags, and physician verification failures
Ability to manually verify a physician account if the MDCN WebView is unavailable
Export tools for compliance reporting


8. The AI Engine — EDIS
EDIS (Early Detection Intelligence System) is the AI backbone of Lifegate. It is not a symptom checker — it is a probabilistic reasoning engine designed to surface early-stage risk signals that a standard triage tool would miss.
What It Does
Multi-tier symptom analysis — asks contextual follow-up questions based on what the user shares
Context-aware questioning — the conversation adapts dynamically, not from a fixed script
Probabilistic reasoning — surfaces possible conditions with confidence scores, not absolutes
Early-stage risk detection — flags cases that need physician attention before they escalate
Automatic mode escalation — moves a session from General Mode to Clinical Mode when risk threshold is crossed, logging the trigger reason for audit
What It Outputs
A ranked list of possible conditions
A confidence score for each condition
Early-stage risk flags where applicable
A Hard Boundary
EDIS outputs are advisory. In Clinical Mode, every output enters the physician queue as a Pending case and must be reviewed before anything reaches the patient. The AI recommends — the physician decides.


9. System Architecture
Frontend: React Native — single codebase for iOS and Android
Backend: Go-based microservices — stateless and horizontally scalable
Messaging: NATS with JetStream — event-driven, durable message delivery
Primary Database: PostgreSQL
Cache: Redis — optional layer for performance-sensitive paths
Real-Time Updates: WebSockets — live case status without polling
Physician Verification: Embedded WebView loading mdcn.gov.ng post sign-up


10. API & Event Contracts
REST APIs
Auth
·       POST /api/auth/register/start — Initiate registration with OTP
·       POST /api/auth/register/verify — Verify OTP and complete registration
·       POST /api/auth/register/resend — Resend registration OTP
·       POST /api/auth/login — Authenticate user and return token
·       GET /api/auth/me — Get current authenticated user
·       POST /api/auth/email/send-code — Send email verification code
·       POST /api/auth/email/verify — Verify email with code
·       POST /api/auth/email/resend-code — Resend email verification code
·       POST /api/auth/password/send-reset-code — Send password reset code
·       POST /api/auth/password/verify-reset-code — Verify reset code
·       POST /api/auth/password/reset — Reset password
Health
·       GET / — Service health check
Patient Reports
·       POST /api/reports — Submit a patient report
·       GET /api/reports — Get all patient reports
·       GET /api/reports/{reportId} — Get report details
·       POST /api/reports/{reportId}/attachments — Add attachment to report
Professional
·       GET /api/professional/me — Get professional profile
·       GET /api/professional/reports — Get reports dashboard
·       GET /api/professional/reports/{reportId} — Get report details for review
·       GET /api/professional/patients/{patientId} — Get patient profile
·       POST /api/professional/reports/{reportId}/respond — Respond to report
·       PATCH /api/professional/reports/{reportId}/status — Update report status
Chat (Sessions)
·       POST /api/chat/sessions/{sessionId}/messages — Store chat message
·       GET /api/chat/sessions/{sessionId}/messages — Get session messages
·       POST /api/chat/sessions/{sessionId}/ai-message — Send message to AI and store response
·       POST /api/chat/sessions/{sessionId}/finalize — Finalize session and generate report
Chat (Conversations)
·       POST /api/chat/conversations — Create new conversation
·       GET /api/chat/conversations — Get all conversations
·       GET /api/chat/conversations/{conversationId} — Get conversation with messages
·       PUT /api/chat/conversations/{conversationId} — Update conversation title
·       DELETE /api/chat/conversations/{conversationId} — Delete conversation
POST /api/chat/conversations/{conversationId}/messages — Add message to conversation
GenAI
·       POST /api/genai/chat — Send message to AI service
·       POST /api/genai/health-check — Check GenAI health
·       GET /api/genai/status — Get GenAI configuration status
Implementation Status 
Already Implemented
POST /api/auth/login — Fully implemented authentication flow
POST /api/reports — Patient symptom/report submission (equivalent to /symptoms)
GET /api/reports/{reportId} — Retrieve report details (serves diagnosis retrieval purpose)
GET /api/professional/reports — Reports dashboard (partial equivalent to admin cases)
In Progress (Partially Implemented)
Professional Verification Flow
Current: Integrated into registration (register/start + verify)
Gap: No dedicated verification endpoint like /auth/physician/verify-mdcn
Diagnosis Handling
Current: Embedded inside report responses
Gap: No standalone /diagnosis/{id} endpoint
Case Management (Admin vs Professional)
Current: Professional dashboard exists
Gap: Lacks full admin-level filtering and control
Not Yet Started
Admin Case Management APIs
Missing: GET /admin/cases with full administrative privileges
Physician Management APIs
Missing: GET /admin/physicians
Missing: Create/update/delete physician accounts
Dedicated Verification Endpoint
Missing: Explicit physician verification endpoint (e.g., MDCN verification flow)
Explicit Diagnosis Service
Missing: Separate diagnosis resource and endpoint

WebSocket Events
diagnosis.update
physician.review.status
case.state.changed — fires on every Pending, Active, Completed transition
NATS Message Subjects
patient.symptom.submitted
ai.question.generated
ai.diagnosis.preliminary
early_flag.detected
physician.review.completed
physician.verification.confirmed
admin.sla.breach.alert


11. Error States & Edge Cases
Patient App
AI unavailable: surface a clear message, allow retry, or hold the session in queue until service recovers
Payment fails: block the diagnosis from starting and surface a plain-language retry prompt
Session abandoned mid-flow: save state server-side for 24 hours and prompt the user to resume on next visit
Report delivery fails: notify the user, log the failure, and retry automatically
Physician System
MDCN portal unreachable during verification: show a retry option and surface a support contact; admin can manually override
Physician leaves a case Active without submitting: case returns to Pending after a defined inactivity timeout and admin is notified
Physician rejects a case: patient is notified with a clear reason and offered a re-queue or refund
No physicians available: patient sees an estimated wait time; admin is alerted
AI / EDIS
Low-confidence output: flagged for mandatory physician review regardless of the originating mode
Escalation from General to Clinical: trigger reason is logged to the audit trail
AI service timeout: graceful fallback message shown to user — no raw error exposed


12. Physician SLAs
SLA windows apply from the moment a case becomes Pending. The auto-reassignment logic must be live before the platform opens to users.
Cases unactioned after 4 hours in Pending state: auto-reassigned to the next available physician
Admin is notified on every auto-reassignment
The original physician is also notified when their case is reassigned
3 or more reassignments from the same physician in a single week: account flagged for admin review

Open question: Should a tighter SLA window apply to cases where EDIS has flagged high risk? Define the threshold and window before the queue logic is built.



13. Non-Functional Requirements
Performance
AI response latency under 500ms
Messaging layer must handle peak load without queuing delays
Scalability
All services horizontally scalable
Stateless architecture throughout — no per-instance session state
Security
End-to-end encryption for all health data in transit and at rest
Role-based access control: patients, physicians, and admins each see only what they need
NDPA 2023 compliance
Reliability
99.9% uptime target
JetStream guarantees message durability — no events lost during service restarts


14. Privacy & Compliance
Health data is sensitive. Lifegate treats it that way at every layer of the stack.
Full NDPA 2023 compliance
Encryption in transit and at rest
Complete auditability — every system action is logged and retrievable
Physician licence verification recorded and tied to each account permanently
All clinical outputs physician-reviewed before delivery — no exceptions


15. Business Model
What Patients Pay
₦500 – ₦1,500 per diagnosis
Credit Bundles
₦2,000 → 5 diagnoses
₦5,000 → 15 diagnoses
₦10,000 → 40 diagnoses
Physician Compensation
₦1,000 – ₦1,500 per validated case
Unit Economics Example
User pays: ₦1,500
Physician receives: ₦1,050 (70%)
Platform keeps: ₦450 (30%)


16. How We'll Measure Success
User Engagement
Diagnosis completion rate above 70%
Month-1 retention above 40%
Session abandonment rate tracked by step — so we know exactly where people drop off
Clinical Quality
Median time from Pending to Completed under 2 hours
AI escalation accuracy — how often General Mode correctly escalates to Clinical Mode
Physician rejection rate — a high rate signals AI output quality needs attention
Business Health
Average revenue per user
Physician satisfaction score — critical for supply-side retention
Platform margin per diagnosis


17. Risks & Mitigations
AI misdiagnosis: mitigated by mandatory physician validation before any clinical output reaches the user
Unverified physicians accessing the platform: mitigated by MDCN WebView gate post sign-up — no case access until confirmed
Data breach: mitigated by end-to-end encryption and comprehensive audit logging
User over-reliance on AI: mitigated by clear disclaimers at every interaction
System downtime: mitigated by distributed, fault-tolerant architecture and JetStream durability
MDCN portal unavailability blocking physician onboarding: mitigated by admin manual override capability


18. Dependencies & Open Questions
Dependencies to Resolve Before Build
AI model / vendor for EDIS: not yet specified. This affects latency, accuracy, cost, and architecture. Must be locked in before EDIS development begins.
Payment gateway: Paystack or Flutterwave assumed — needs confirmation before patient app flow is finalised.
MDCN WebView behaviour: the MDCN portal must be tested for mobile WebView compatibility and consistent response format before the verification flow is built.
Open Questions
Should a tighter SLA apply to high EDIS risk-score cases, and if so, what is the threshold?
Is the AI model fine-tuned for Nigerian and African health contexts, or general-purpose?
When exactly are physician earnings calculated and paid out — per case, weekly, or monthly?
What is the session persistence strategy for abandoned flows — local device, backend, or both?
Does the admin manual override for MDCN verification require a second admin to approve?


19. Acceptance Criteria
All of the following must pass before the platform goes to beta.
A patient can complete the full diagnosis flow — from symptom input to validated final report — without errors or dead ends
A physician who completes sign-up is taken immediately to the MDCN WebView verification step and cannot access cases until verified
The physician case queue correctly displays Pending, Active, and Completed states with accurate transitions and timestamps
The system correctly auto-escalates a high-risk General Mode session to Clinical Mode and logs the trigger reason
Admin can view all cases by state, monitor SLA windows in real time, and act on physician account flags
All system actions are logged and retrievable for audit and compliance review
AI responses stay within the defined safety guardrails — no clinical claims in General Mode
Cases unactioned for 4 hours in Pending state are auto-reassigned and admin is notified
Payment failure is handled gracefully — no diagnosis starts without confirmed payment
Abandoned sessions are recoverable within 24 hours
