import { useEffect, useRef } from 'react';
import { useDiagnosisStore } from 'stores/diagnosis-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { getToken } from 'utils/tokenStorage';
import Constants from 'expo-constants';
import { useProfessionalStore } from 'stores/professional-store';
import { useNotificationStore } from 'stores/notification-store';
import { CaseQueueItem, ReportStatus } from 'types/professional-types';

const WS_BASE =
  (Constants.expoConfig?.extra?.wsUrl as string | undefined) ||
  (process.env.EXPO_PUBLIC_WS_URL as string | undefined) ||
  'ws://localhost:8080/ws';

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
 * - `physician.case.new`    → appends to pendingCases + adds notification
 * - `physician.review.status` → updates case status in queue
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
