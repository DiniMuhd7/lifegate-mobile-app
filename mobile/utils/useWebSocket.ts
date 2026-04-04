import { useEffect, useRef } from 'react';
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
            const { diagnosisId, status } = JSON.parse(payload) as {
              diagnosisId: string;
              status: 'Pending' | 'Active' | 'Completed';
            };
            if (diagnosisId && status) {
              updateDiagnosisStatus(diagnosisId, status);
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
  }, [user, updateDiagnosisStatus]);
}

/**
 * Maintains a WebSocket connection for physicians and dispatches:
 * - `physician.case.new`       → appends to pendingCases + adds notification
 * - `physician.review.status`  → updates case status in queue
 */
export function usePhysicianWebSocket() {
  const { user } = useAuthStore();
  const { appendPendingCase, updateCaseStatus } = useProfessionalStore();
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
            const item = JSON.parse(payload) as CaseQueueItem;
            if (item?.id) {
              appendPendingCase(item);
              addNotification({
                type: 'new_case',
                caseId: item.id,
                message: `New ${item.urgency} case: ${item.title} — ${item.patientName}`,
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
  }, [user, appendPendingCase, updateCaseStatus, addNotification]);
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

