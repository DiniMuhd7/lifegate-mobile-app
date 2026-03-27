# PRODUCT REQUIREMENTS DOCUMENT (PRD)

## Product Name

Lifegate by DHSub

## Version

3.1 (Final Submission Draft)

## Date

March 2026

---

# 1. Executive Summary

Lifegate by DHSub is a mobile-native digital health platform that delivers AI-assisted medical triage with mandatory physician validation for clinical cases. It is designed as a **continuous personal health companion**, combining conversational AI, early detection intelligence, and licensed physician oversight.

The platform is built to meet **clinical safety standards, regulatory compliance (NDPA 2023), and scalable system design**, while maintaining an intuitive and empathetic user experience.

---

# 2. Product Vision

To provide every individual with access to a trusted, always-available digital health companion that enables early detection, informed decision-making, and continuous care.

---

# 3. Product Scope

## In Scope

* AI-powered conversational health triage
* Early Detection Intelligence System (EDIS)
* Physician validation workflow
* Health history tracking
* Preventive insights and alerts

## Out of Scope (Phase 1)

* Live telemedicine (video/audio consultations)
* Prescription issuance
* External EMR integrations

---

# 4. User Segments

### Patients (Primary Users)

Individuals seeking accessible, reliable, and fast health insights.

### Physicians

Licensed professionals responsible for validating AI-generated outputs.

### Administrators

Internal operators responsible for system monitoring, compliance, and analytics.

---

# 5. Core Product Modes

## 5.1 General Health Mode (AI-Only)

**Purpose:** Provide instant responses to non-clinical health inquiries.

**Characteristics:**

* AI-only interaction
* No physician involvement
* Immediate response time
* Informational guidance only

**Safety Guardrails:**

* No diagnosis or clinical claims
* No risk scoring
* Automatic escalation to clinical mode when risk is detected

---

## 5.2 Clinical Diagnosis Mode (AI + Physician)

**Purpose:** Deliver structured, clinically validated diagnostic support.

**Workflow:**

1. Symptom intake
2. AI triage (EDIS)
3. Preliminary AI output
4. Physician validation
5. Final patient report

**Critical Requirement:**
All clinical outputs must be reviewed and approved by a licensed physician.

---

# 6. Functional Requirements

## 6.1 Patient Application

### Core Capabilities

* Secure onboarding and NDPA-compliant consent
* Profile and health data management
* Symptom input (text-first, extensible to voice)
* Conversational AI interface
* Real-time status tracking
* AI + physician diagnosis reports
* Health timeline/history
* Preventive alerts and follow-ups

### UX Requirements

* AI response latency < 500ms
* Clear feedback states (loading, processing, review)
* Empathetic, human-centered tone

---

## 6.2 Physician System

* Secure authentication with 2FA
* Case queue (prioritized by urgency and risk)
* Structured case review interface
* Decision actions: approve, edit, reject
* Physician notes and recommendations
* Earnings and performance tracking

---

## 6.3 Admin System

* System performance dashboard
* Comprehensive audit logs
* Notification and alert controls
* Compliance monitoring tools

---

# 7. AI System (EDIS)

## Capabilities

* Multi-tier symptom analysis
* Context-aware questioning
* Probabilistic reasoning engine
* Early-stage risk detection

## Outputs

* Possible conditions
* Confidence score
* Early-stage risk flags

## Safety Constraint

AI outputs are advisory and must be physician-validated in clinical mode.

---

# 8. System Architecture

## Frontend

* React Native (iOS & Android)

## Backend

* Go-based microservices architecture

## Messaging Layer

* NATS with JetStream (event-driven communication)

## Data Layer

* PostgreSQL (primary database)
* Redis (optional caching layer)

## Real-Time Layer

* WebSockets for live updates

---

# 9. API & Event Contracts

## REST APIs

* POST /auth/login
* POST /symptoms
* GET /diagnosis/{id}

## WebSocket Events

* diagnosis.update
* physician.review.status

## NATS Subjects

* patient.symptom.submitted
* ai.question.generated
* ai.diagnosis.preliminary
* early_flag.detected
* physician.review.completed

---

# 10. Non-Functional Requirements

## Performance

* AI response latency < 500ms
* High-throughput messaging system

## Scalability

* Horizontally scalable services
* Stateless architecture

## Security

* End-to-end encryption
* Role-based access control
* NDPA 2023 compliance

## Reliability

* 99.9% uptime target
* Durable messaging via JetStream

---

# 11. Privacy & Compliance

* NDPA 2023 compliance
* Encryption (in transit and at rest)
* Full auditability of system actions
* Physician-reviewed clinical outputs

---

# 12. Business Model

## Consumer Pricing

* ₦500 – ₦1,500 per diagnosis

## Credit Bundles

* ₦2,000 → 5 diagnoses
* ₦5,000 → 15 diagnoses
* ₦10,000 → 40 diagnoses

## Physician Compensation

* ₦1,000 – ₦1,500 per validated case

## Unit Economics Example

* User pays: ₦1,500
* Physician: ₦1,050 (70%)
* Platform: ₦450 (30%)

---

# 13. Risk Management

* AI misdiagnosis → mitigated by mandatory physician validation
* Data breach → mitigated by encryption and audit logging
* User over-reliance → mitigated by clear disclaimers
* System downtime → mitigated by distributed architecture

---

# 14. Acceptance Criteria (High-Level)

* Users can complete full diagnosis flow end-to-end
* Physicians can review and validate cases within defined SLA
* All system actions are logged for audit and compliance
* AI responses adhere to defined safety guardrails

---
