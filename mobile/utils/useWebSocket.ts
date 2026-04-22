import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useDiagnosisStore } from 'stores/diagnosis-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { getToken } from 'utils/tokenStorage';
import { useProfessionalStore } from 'stores/professional-store';
import { useNotificationStore } from 'stores/notification-store';
import { CaseQueueItem, ReportStatus } from 'types/professional-types';

/** Derive the WebSocket base URL from the same env-var logic used by the HTTP client. */
function resolveWsBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    // e.g. https://lifegate-backend.onrender.com/api → wss://lifegate-backend.onrender.com/ws
    return envUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
  }
  if (typeof window === 'undefined') {
    return 'wss://lifegate-backend.onrender.com/ws';
  }
  const { hostname, protocol } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const codespaceMatch = hostname.match(/^(.+?)-(\d+)(\.app\.github\.dev)$/);
  if (codespaceMatch) {
    return `wss://${codespaceMatch[1]}-80${codespaceMatch[3]}/ws`;
  }
  return `${wsProtocol}//${hostname}/ws`;
}

const WS_BASE = resolveWsBase();

/** Send a subscribe control frame so the server filters events for this client. */
function sendSubscribe(ws: WebSocket, events: string[]) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'subscribe', events }));
  }
}

/**
 * Maintains a WebSocket connection to the backend hub and dispatches
 * `diagnosis.update` events into the diagnosis store so the UI can
 * reflect real-time status changes without polling.
 *
 * The hook is a no-op when the user is not authenticated.
 */
export function useDiagnosisWebSocket() {
  const { user } = useAuthStore();
  const updateDiagnosisStatus = useDiagnosisStore((s) => s.updateDiagnosisStatus);
  const fetchDiagnosisDetail = useDiagnosisStore((s) => s.fetchDiagnosisDetail);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function connect() {
      if (!active) return;

      const token = await getToken();
      if (!token) return;

      const url = `${WS_BASE}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        sendSubscribe(ws, ['diagnosis.update']);
      };

      ws.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : '';
        const colonIdx = raw.indexOf(':');
        if (colonIdx === -1) return;

        const eventName = raw.slice(0, colonIdx);
        const payload = raw.slice(colonIdx + 1);

        if (eventName === 'diagnosis.update') {
          try {
            const { diagnosisId, status, decision } = JSON.parse(payload) as {
              diagnosisId: string;
              status?: 'Pending' | 'Active' | 'Completed';
              decision?: string;
            };
            if (diagnosisId) {
              // Always refetch for fresh physician-edited fields (condition,
              // urgency, prescription, investigations, notes).
              fetchDiagnosisDetail(diagnosisId);

              // Also apply an optimistic status patch so the list updates immediately.
              if (status) {
                updateDiagnosisStatus(diagnosisId, status, decision);
              }

              // Show an in-app alert when the physician completes the review.
              if (status === 'Completed' && decision) {
                const approved = decision === 'Approved';
                Alert.alert(
                  approved ? '✅ Case Approved' : '📋 Case Reviewed',
                  approved
                    ? 'Good news! A physician has approved your AI diagnosis. Open the app to view your results and prescription.'
                    : 'A physician has reviewed your health report and provided updated notes. Open the app for details.',
                  [{ text: 'OK' }],
                );
              }
            }
          } catch {
            // Ignore malformed payloads
          }
        }
      };

      ws.onclose = () => {
        if (!active) return;
        // Reconnect after 3 seconds on unexpected close
        retryTimer.current = setTimeout(() => connect(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      active = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, updateDiagnosisStatus, fetchDiagnosisDetail]);
}

/**
 * Maintains a WebSocket connection for physicians and dispatches:
 * - `physician.case.new`       → refetches full case queue + adds notification
 * - `physician.review.status`  → updates case status in queue
 */
export function usePhysicianWebSocket() {
  const { user } = useAuthStore();
  const { fetchCaseQueue, updateCaseStatus } = useProfessionalStore();
  const { addNotification } = useNotificationStore();
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'professional') return;

    let active = true;

    async function connect() {
      if (!active) return;

      const token = await getToken();
      if (!token) return;

      const url = `${WS_BASE}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        sendSubscribe(ws, ['physician.case.new', 'physician.review.status']);
      };

      ws.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : '';
        const colonIdx = raw.indexOf(':');
        if (colonIdx === -1) return;

        const eventName = raw.slice(0, colonIdx);
        const payload = raw.slice(colonIdx + 1);

        if (eventName === 'physician.case.new') {
          try {
            const { caseId, urgency, escalated } = JSON.parse(payload) as {
              caseId: string;
              urgency: string;
              escalated: boolean;
            };
            // Refetch the full queue so the new case appears with all fields intact.
            fetchCaseQueue();
            if (caseId) {
              addNotification({
                type: 'new_case',
                caseId,
                message: `New ${urgency ?? ''} case assigned${escalated ? ' — Escalated' : ''}`,
              });
            }
          } catch {
            // Ignore malformed payloads
          }
        }

        if (eventName === 'physician.review.status') {
          try {
            const { caseId, status } = JSON.parse(payload) as {
              caseId: string;
              status: ReportStatus;
            };
            if (caseId && status) {
              updateCaseStatus(caseId, status);
            }
          } catch {
            // Ignore malformed payloads
          }
        }
      };

      ws.onclose = () => {
        if (!active) return;
        retryTimer.current = setTimeout(() => connect(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      active = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, fetchCaseQueue, updateCaseStatus, addNotification]);
}

/**
 * Maintains a WebSocket connection for admin users and dispatches:
 * - `case.state.changed` → refreshes the admin dashboard store / notification
 */
export function useAdminWebSocket() {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    let active = true;

    async function connect() {
      if (!active) return;

      const token = await getToken();
      if (!token) return;

      const url = `${WS_BASE}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        sendSubscribe(ws, ['case.state.changed']);
      };

      ws.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : '';
        const colonIdx = raw.indexOf(':');
        if (colonIdx === -1) return;

        const eventName = raw.slice(0, colonIdx);
        const payload = raw.slice(colonIdx + 1);

        if (eventName === 'case.state.changed') {
          try {
            const data = JSON.parse(payload) as { message?: string };
            addNotification({
              type: 'new_case',
              caseId: '',
              message: data.message ?? 'System update — refresh dashboard',
            });
          } catch {
            // Ignore malformed payloads
          }
        }
      };

      ws.onclose = () => {
        if (!active) return;
        retryTimer.current = setTimeout(() => connect(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      active = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, addNotification]);
}

