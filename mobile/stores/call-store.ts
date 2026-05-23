import { create } from 'zustand';
import {
  ActiveCall,
  IncomingCall,
  CallType,
  CallRingingPayload,
  CallAnsweredPayload,
  CallRejectedPayload,
  CallEndedPayload,
  CallIceCandidatePayload,
} from '../types/call-types';
import { CallService } from '../services/call-service';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface CallState {
  /** The call currently in progress (outgoing or accepted incoming). */
  activeCall: ActiveCall | null;

  /** An incoming call waiting for the user to accept or reject. */
  incomingCall: IncomingCall | null;

  /**
   * ICE candidates queued while the WebView is still initialising.
   * The call screen drains this queue once its WebView is ready.
   */
  pendingIceCandidates: RTCIceCandidateInit[];

  /**
   * SDP answer queued from call.answered before the caller's WebView has
   * called setLocalDescription (i.e. before it sends back 'ready').
   */
  pendingSdpAnswer: string | null;

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Open a new outgoing call.  The call screen mounts a WebView that will
   * generate the SDP offer and then call `setCallId` + `offerReady`.
   */
  initiateCall: (peerId: string, peerName: string, callType: CallType, diagnosisId: string, peerAvatarUrl?: string) => void;

  /**
   * Called by the call screen once the WebView has generated an SDP offer.
   * Sends it to the server and stores the returned callId.
   */
  offerReady: (sdpOffer: string) => Promise<void>;

  /** Called by the call screen once the WebView has generated an SDP answer. */
  answerReady: (sdpAnswer: string) => Promise<void>;

  /** Accept an incoming call — moves it from incomingCall to activeCall. */
  acceptIncomingCall: () => void;

  /** Reject an incoming call (callee declines). */
  rejectIncomingCall: () => Promise<void>;

  /** End the active call (either party). */
  endActiveCall: () => Promise<void>;

  /** Store the callId once the server returns it after POST /calls/offer. */
  setCallId: (callId: string, calleeName?: string) => void;

  /** Mark the call as active (media flowing). */
  setCallActive: () => void;

  // ── WebSocket event handlers ─────────────────────────────────────────────────

  /** Inbound call.ringing — an incoming call arrived for us. */
  onCallRinging: (payload: CallRingingPayload) => void;

  /** Inbound call.answered — our outgoing call was accepted. */
  onCallAnswered: (payload: CallAnsweredPayload) => void;

  /** Inbound call.rejected — our outgoing call was rejected. */
  onCallRejected: (payload: CallRejectedPayload) => void;

  /** Inbound call.ended — remote party ended the call. */
  onCallEnded: (payload: CallEndedPayload) => void;

  /** Inbound call.ice-candidate — relay to local WebView. */
  onIceCandidate: (payload: CallIceCandidatePayload) => void;

  /** Drain queued ICE candidates (called by the call screen when WebView ready). */
  drainIceCandidates: () => RTCIceCandidateInit[];

  /** Clear the active call state (e.g. after screen unmounts). */
  clearActiveCall: () => void;

  /** Clear the incoming call banner. */
  clearIncomingCall: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCallStore = create<CallState>((set, get) => ({
  activeCall: null,
  incomingCall: null,
  pendingIceCandidates: [],
  pendingSdpAnswer: null,

  // ── Caller initiates ─────────────────────────────────────────────────────────

  initiateCall: (peerId, peerName, callType, diagnosisId, peerAvatarUrl) => {
    set({
      activeCall: {
        callId: null,
        peerId,
        peerName,
        peerAvatarUrl,
        callType,
        status: 'calling',
        role: 'caller',
        diagnosisId,
      },
      pendingIceCandidates: [],
      pendingSdpAnswer: null,
    });
  },

  offerReady: async (sdpOffer) => {
    const { activeCall } = get();
    if (!activeCall || activeCall.role !== 'caller') return;
    try {
      const result = await CallService.sendOffer(
        activeCall.diagnosisId,
        activeCall.callType,
        sdpOffer,
      );
      set((s) => ({
        activeCall: s.activeCall
          ? {
              ...s.activeCall,
              callId: result.call_id,
              peerName: result.callee_name || s.activeCall.peerName,
              peerAvatarUrl: result.callee_avatar_url || s.activeCall.peerAvatarUrl,
              // Don't regress status if call.answered already advanced it to
              // 'connecting' (OpenClaw WS arrives before HTTP response).
              status: s.activeCall.status === 'calling' ? 'ringing' : s.activeCall.status,
            }
          : null,
      }));
    } catch {
      // If offer fails, clear the call so screen can show error.
      set({ activeCall: null });
    }
  },

  setCallId: (callId, calleeName) => {
    set((s) => ({
      activeCall: s.activeCall
        ? {
            ...s.activeCall,
            callId,
            peerName: calleeName || s.activeCall.peerName,
          }
        : null,
    }));
  },

  // ── Callee accepts ───────────────────────────────────────────────────────────

  acceptIncomingCall: () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    set({
      activeCall: {
        callId: incomingCall.callId,
        peerId: incomingCall.callerId,
        peerName: incomingCall.callerName,
        peerAvatarUrl: incomingCall.callerAvatarUrl,
        callType: incomingCall.callType,
        status: 'connecting',
        role: 'callee',
        diagnosisId: incomingCall.diagnosisId,
      },
      incomingCall: null,
      pendingIceCandidates: [],
      pendingSdpAnswer: null,
    });
  },

  answerReady: async (sdpAnswer) => {
    const { activeCall } = get();
    if (!activeCall?.callId) return;
    await CallService.sendAnswer(activeCall.callId, sdpAnswer);
    set((s) => ({
      activeCall: s.activeCall ? { ...s.activeCall, status: 'connecting' } : null,
    }));
  },

  setCallActive: () => {
    set((s) => ({
      activeCall: s.activeCall
        ? { ...s.activeCall, status: 'active', startedAt: Date.now() }
        : null,
    }));
  },

  // ── Reject / End ─────────────────────────────────────────────────────────────

  rejectIncomingCall: async () => {
    const { incomingCall } = get();
    if (!incomingCall) return;
    set({ incomingCall: null });
    try {
      await CallService.rejectCall(incomingCall.callId);
    } catch {}
  },

  endActiveCall: async () => {
    const { activeCall } = get();
    if (!activeCall) return;
    // Show 'ended' briefly so the user sees feedback before the screen unmounts.
    set({
      activeCall: { ...activeCall, status: 'ended' },
      pendingIceCandidates: [],
      pendingSdpAnswer: null,
    });
    setTimeout(() => {
      if (get().activeCall?.status === 'ended') set({ activeCall: null });
    }, 1500);
    if (!activeCall.callId) return;
    try {
      await CallService.endCall(activeCall.callId);
    } catch {}
  },

  // ── WebSocket event handlers ─────────────────────────────────────────────────

  onCallRinging: (payload) => {
    // We are the callee — an incoming call arrived.
    set({
      incomingCall: {
        callId: payload.call_id,
        callerId: payload.caller_id,
        callerName: payload.caller_name,
        callerAvatarUrl: payload.caller_avatar_url,
        callType: payload.call_type,
        sdpOffer: payload.sdp_offer,
        diagnosisId: payload.diagnosis_id,
      },
    });
  },

  onCallAnswered: (payload) => {
    // We are the caller — callee (or AI physician) accepted and sent their SDP answer.
    const { activeCall } = get();
    if (!activeCall) return;
    // For OpenClaw AI calls the WebSocket message arrives BEFORE the HTTP response
    // returns, so callId may still be null.  Accept the answer if callId matches
    // OR has not been set yet (null).
    if (activeCall.callId !== null && activeCall.callId !== payload.call_id) return;
    // Queue the answer; call screen will consume it once its WebView is ready.
    // Also store callId and advance status in case the WS beat the HTTP response.
    set((s) => ({
      pendingSdpAnswer: payload.sdp_answer,
      activeCall: s.activeCall
        ? {
            ...s.activeCall,
            callId: s.activeCall.callId ?? payload.call_id,
            status: 'connecting',
          }
        : null,
    }));
  },

  onCallRejected: (payload) => {
    const { activeCall } = get();
    if (!activeCall) return;
    // Same null-callId guard as onCallAnswered — WS may arrive before HTTP.
    if (activeCall.callId !== null && activeCall.callId !== payload.call_id) return;
    set({
      activeCall: {
        ...activeCall,
        callId: activeCall.callId ?? payload.call_id,
        status: 'rejected',
      },
      pendingIceCandidates: [],
      pendingSdpAnswer: null,
    });
    // Auto-dismiss after a short delay so the user sees "Call declined" feedback.
    setTimeout(() => {
      if (get().activeCall?.status === 'rejected') set({ activeCall: null });
    }, 2500);
  },

  onCallEnded: (payload) => {
    const { activeCall } = get();
    if (!activeCall || activeCall.callId !== payload.call_id) return;
    set({
      activeCall: { ...activeCall, status: 'ended' },
      pendingIceCandidates: [],
      pendingSdpAnswer: null,
    });
    // Auto-dismiss after a short delay so the user sees "Call ended" feedback.
    setTimeout(() => {
      if (get().activeCall?.status === 'ended') set({ activeCall: null });
    }, 2500);
  },

  onIceCandidate: (payload) => {
    set((s) => ({
      pendingIceCandidates: [...s.pendingIceCandidates, payload.candidate],
    }));
  },

  drainIceCandidates: () => {
    const candidates = get().pendingIceCandidates;
    set({ pendingIceCandidates: [] });
    return candidates;
  },

  clearActiveCall: () => {
    set({ activeCall: null, pendingIceCandidates: [], pendingSdpAnswer: null });
  },

  clearIncomingCall: () => {
    set({ incomingCall: null });
  },
}));
