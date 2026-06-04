/**
 * Engagement Service
 * Tracks foreground app session duration for patients and physicians.
 *
 * Endpoints (require auth):
 *   POST /sessions/app/start     → { sessionId: string }
 *   POST /sessions/app/:id/end   → 200 OK
 */

import api from './api';

let _currentSessionId: string | null = null;

export const EngagementService = {
  /** Call when the app comes to the foreground (or on initial mount). */
  async startSession(): Promise<void> {
    // Don't double-start if a session is already active
    if (_currentSessionId) return;
    try {
      const { data } = await api.post<{ sessionId: string }>('/sessions/app/start');
      _currentSessionId = data?.sessionId ?? null;
    } catch {
      // Non-critical — silently ignore
    }
  },

  /** Call when the app goes to the background or unmounts. */
  async endSession(): Promise<void> {
    if (!_currentSessionId) return;
    const id = _currentSessionId;
    _currentSessionId = null; // clear before await so re-entry is safe
    try {
      await api.post(`/sessions/app/${id}/end`);
    } catch {
      // Non-critical — silently ignore
    }
  },

  /** The active session ID, or null when none is in progress. */
  get currentSessionId(): string | null {
    return _currentSessionId;
  },
};
