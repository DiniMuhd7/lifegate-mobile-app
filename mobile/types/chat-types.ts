/**
 * Chat Domain Types
 * Defines the core data structures for the chat system following the specification:
 * - Messages with role, status, and optional diagnosis/prescription
 * - Conversations grouped by session
 * - Structured AI responses
 */

// Message role types
export type MessageRole = 'USER' | 'AI';

// Message status for optimistic UI
export type MessageStatus = 'SENDING' | 'SENT' | 'FAILED';

// Conversation category (matches suggested action ids)
export type ConversationCategory =
  | 'doctor_consultation'
  | 'general_health'
  | 'eye_checkup'
  | 'hearing_test'
  | 'mental_health';

// High-level session mode that determines the care pathway
// - general_health: AI-only, wellness & informational (maps to 'general_health' category)
// - clinical_diagnosis: AI + physician validation (maps to 'doctor_consultation' category)
export type SessionMode = 'general_health' | 'clinical_diagnosis';

// Structured diagnosis data from AI
export type Diagnosis = {
  condition: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  confidence?: number; // 0–100 confidence score from AI
};

// Structured prescription data from AI
export type Prescription = {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
};

// Ranked probable condition from EDIS probabilistic analysis
export type ConditionScore = {
  condition: string;
  confidence: number; // 0–100
  description: string;
};

// Early-stage risk signal detected by EDIS
export type RiskFlag = {
  flag: string;        // e.g. "EARLY_INFECTION_RISK"
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
};

// Recommended medical test or diagnostic procedure
export type Investigation = {
  test: string;    // e.g. "Full Blood Count (FBC)"
  reason: string;  // brief clinical reason
  urgency: 'ROUTINE' | 'URGENT' | 'STAT';
};

// Individual message in a conversation
export type Message = {
  id: string; // UUID-like identifier
  role: MessageRole;
  status: MessageStatus; // SENDING | SENT | FAILED
  text: string;
  timestamp: number; // Unix timestamp (ms)
  diagnosis?: Diagnosis; // Optional structured diagnosis from AI
  prescription?: Prescription; // Optional structured prescription from AI
  diagnosisId?: string; // DB diagnosis record ID for navigation to report screen
  // EDIS-specific fields returned by the AI
  followUpQuestions?: string[];    // Clarifying questions for the patient to answer
  conditions?: ConditionScore[];   // Ranked differential diagnosis list
  riskFlags?: RiskFlag[];          // Early-stage risk signals
  investigations?: Investigation[]; // Recommended medical tests
};

// Conversation (session of messages)
export type Conversation = {
  id: string; // Conversation/session ID
  userId: string; // User who owns this conversation
  messages: Message[];
  title?: string; // Auto-generated from first user message or explicit title
  category?: ConversationCategory; // Derived from mode; also set by suggested actions
  mode?: SessionMode; // The session routing mode chosen by the user
  /** ID of the paired server-side chat_sessions record, if synced. */
  serverSessionId?: string;
  createdAt: number;
  updatedAt: number; // For sorting history
};

// AI response structure (parsed from backend)
export type AIResponse = {
  text: string; // Main conversational response
  diagnosis?: Diagnosis;
  prescription?: Prescription;
  // True when the backend auto-escalated this session from General Health to Clinical Diagnosis
  escalated?: boolean;
  // DB record ID of the saved diagnosis (present when a diagnosis was saved)
  diagnosisId?: string;
  // EDIS-specific fields
  followUpQuestions?: string[];
  conditions?: ConditionScore[];
  riskFlags?: RiskFlag[];
  investigations?: Investigation[];
};

// Result returned from POST /chat/sessions/:id/finalize
export type FinalizeResult = {
  diagnosisId: string;
  summary: string;
  conditions?: ConditionScore[];
  riskFlags?: RiskFlag[];
  mode: string;
};

// Message validation result
export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

// Chat service response
export type ChatServiceResponse = {
  success: boolean;
  data?: AIResponse;
  error?: string;
};

// ─── Server-side session types ────────────────────────────────────────────────

/** Lifecycle state of a server-persisted chat session. */
export type ServerSessionStatus = 'active' | 'completed' | 'abandoned';

/**
 * A chat session persisted on the server (mirrors the backend Session struct).
 * Messages are stored as the same Message shape used by the client.
 */
export type ServerSession = {
  id: string;
  userId: string;
  title: string;
  category: ConversationCategory | '';
  mode: SessionMode | '';
  status: ServerSessionStatus;
  messages: Message[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};

/** Input for POST /api/sessions */
export type CreateSessionInput = {
  title?: string;
  category?: ConversationCategory | '';
  mode?: SessionMode | '';
  messages?: Message[];
};

/** Input for PUT /api/sessions/:id — all fields are optional patches. */
export type UpdateSessionInput = {
  title?: string;
  category?: ConversationCategory | '';
  mode?: SessionMode | '';
  status?: ServerSessionStatus;
  messages?: Message[];
};
