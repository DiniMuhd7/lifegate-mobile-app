// Types for voice and video calling (patient ↔ physician, WebRTC signaling).

export type CallType = 'voice' | 'video';

export type CallStatus =
  | 'idle'
  | 'calling'      // outbound: waiting for callee to pick up
  | 'ringing'      // inbound: ringing on caller's side after offer sent
  | 'connecting'   // both parties accepted, WebRTC negotiating
  | 'active'       // connected, media flowing
  | 'ended'
  | 'rejected'
  | 'missed';

export interface ActiveCall {
  /** Server-assigned call ID (set after POST /calls/offer returns) */
  callId: string | null;
  peerId: string;
  peerName: string;
  callType: CallType;
  status: CallStatus;
  role: 'caller' | 'callee';
  diagnosisId: string;
  /** Unix ms timestamp when status became 'active' */
  startedAt?: number;
}

export interface IncomingCall {
  callId: string;
  callerId: string;
  callerName: string;
  callType: CallType;
  /** The SDP offer string from the caller's WebRTC peer connection */
  sdpOffer: string;
  diagnosisId: string;
}

// ── WebSocket event payloads ──────────────────────────────────────────────────

export interface CallRingingPayload {
  call_id: string;
  caller_id: string;
  caller_name: string;
  call_type: CallType;
  diagnosis_id: string;
  sdp_offer: string;
}

export interface CallAnsweredPayload {
  call_id: string;
  sdp_answer: string;
}

export interface CallRejectedPayload {
  call_id: string;
  reason?: string;
}

export interface CallEndedPayload {
  call_id: string;
}

export interface CallIceCandidatePayload {
  call_id: string;
  candidate: RTCIceCandidateInit;
}
