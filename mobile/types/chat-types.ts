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

// Structured diagnosis data from AI
export type Diagnosis = {
  condition: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
};

// Structured prescription data from AI
export type Prescription = {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
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
};

// Conversation (session of messages)
export type Conversation = {
  id: string; // Conversation/session ID
  userId: string; // User who owns this conversation
  messages: Message[];
  title?: string; // Auto-generated from first user message or explicit title
  category?: ConversationCategory; // Topic set when started from a suggested action
  createdAt: number;
  updatedAt: number; // For sorting history
};

// AI response structure (parsed from Gemini JSON)
export type AIResponse = {
  text: string; // Main conversational response
  diagnosis?: Diagnosis;
  prescription?: Prescription;
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
