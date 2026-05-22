import api from './api';

export const CallService = {
  /**
   * Initiate a call. Caller sends their SDP offer; backend resolves the callee
   * from the diagnosisId and broadcasts call.ringing to them.
   * Returns { call_id, callee_name } on success.
   */
  sendOffer: async (
    diagnosisId: string,
    callType: 'voice' | 'video',
    sdpOffer: string,
  ): Promise<{ call_id: string; callee_name: string }> => {
    const res = await api.post('/calls/offer', {
      diagnosis_id: diagnosisId,
      call_type: callType,
      sdp_offer: sdpOffer,
    });
    return res.data?.data as { call_id: string; callee_name: string };
  },

  /**
   * Accept an incoming call. Callee sends their SDP answer; backend forwards it
   * to the caller via call.answered.
   */
  sendAnswer: async (callId: string, sdpAnswer: string): Promise<void> => {
    await api.post('/calls/answer', {
      call_id: callId,
      sdp_answer: sdpAnswer,
    });
  },

  /** Decline an incoming call. Broadcasts call.rejected to the caller. */
  rejectCall: async (callId: string): Promise<void> => {
    await api.post(`/calls/${callId}/reject`);
  },

  /** End an active call. Broadcasts call.ended to the remote party. */
  endCall: async (callId: string): Promise<void> => {
    await api.post(`/calls/${callId}/end`);
  },

  /** Relay a WebRTC ICE candidate to the remote peer. */
  sendIceCandidate: async (
    callId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    await api.post(`/calls/${callId}/ice`, { candidate });
  },
};
