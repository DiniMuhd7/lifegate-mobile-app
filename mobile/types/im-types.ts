// Types for the instant-messaging feature (patient ↔ physician per diagnosis).

// ── Call-transcript metadata ──────────────────────────────────────────────────

export interface CallTranscriptTurn {
  speaker: 'patient' | 'physician';
  text: string;
}

export interface CallTranscriptMeta {
  type: 'call_transcript';
  call_type: 'voice' | 'video';
  turns: CallTranscriptTurn[];
}

// ── Message ───────────────────────────────────────────────────────────────────

export interface IMMessage {
  id: string;
  diagnosis_id: string;
  sender_id: string;
  sender_role: 'user' | 'professional';
  sender_name: string;
  content: string;
  created_at: string; // ISO-8601
  read_at: string | null;
  /** Structured payload for special message types (e.g. call transcripts). */
  metadata?: CallTranscriptMeta | null;
  /** Client-side only — set to true when an optimistic send fails. */
  _failed?: boolean;
}

export interface IMConversation {
  diagnosisId: string;
  messages: IMMessage[];
  /** Unread count of messages sent TO the current user */
  unreadCount: number;
  loading: boolean;
  /** True while a pull-to-refresh is in flight (keeps messages visible). */
  refreshing: boolean;
  sending: boolean;
  error: string | null;
  /** True when the counterpart is actively typing (from im.typing WS event). */
  counterpartTyping?: boolean;
}
