import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useDiagnosisStore } from 'stores/diagnosis-store';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfessionalStore } from 'stores/professional-store';
import { useNotificationStore } from 'stores/notification-store';
import { useIMStore } from 'stores/im-store';
import { IMMessage } from 'types/im-types';
import { ReportStatus } from 'types/professional-types';
import wsService from 'services/websocket-service';

/**
 * Subscribes to `diagnosis.update` and `im.message` events through the shared
 * wsService singleton. No new WebSocket connection is opened — the singleton
 * connected by the patient tab layout is reused.
 *
 * The hook is a no-op when the user is not authenticated.
 */
export function useDiagnosisWebSocket() {
  const { user } = useAuthStore();
  const updateDiagnosisStatus = useDiagnosisStore((s) => s.updateDiagnosisStatus);
  const fetchDiagnosisDetail = useDiagnosisStore((s) => s.fetchDiagnosisDetail);
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!user) return;

    const unsubDiagnosis = wsService.on('diagnosis.update', (data) => {
      const { diagnosisId, status, decision } = data as {
        diagnosisId: string;
        status?: 'Pending' | 'Active' | 'Completed';
        decision?: string;
      };
      if (!diagnosisId) return;

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
    });

    const unsubIM = wsService.on('im.message', (data) => {
      const msg = data as IMMessage;
      if (!msg?.diagnosis_id) return;

      useIMStore.getState().receiveMessage(msg);
      // Notify the patient so they see a banner when the modal is closed.
      addNotification({
        type: 'im_message',
        caseId: msg.diagnosis_id,
        diagnosisId: msg.diagnosis_id,
        message: `${msg.sender_name || 'Your doctor'}: ${msg.content}`,
      });
    });

    return () => {
      unsubDiagnosis();
      unsubIM();
    };
  }, [user, updateDiagnosisStatus, fetchDiagnosisDetail, addNotification]);
}

/**
 * Subscribes to physician events through the shared wsService singleton.
 * No new WebSocket connection is opened — the singleton connected by the
 * professional tab layout is reused.
 */
export function usePhysicianWebSocket() {
  const { user } = useAuthStore();
  const { fetchCaseQueue, updateCaseStatus } = useProfessionalStore();
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!user || user.role !== 'professional') return;

    const unsubCaseNew = wsService.on('physician.case.new', (data) => {
      const { caseId, urgency, escalated } = data as {
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
    });

    const unsubReviewStatus = wsService.on('physician.review.status', (data) => {
      const { caseId, status } = data as { caseId: string; status: ReportStatus };
      if (caseId && status) {
        updateCaseStatus(caseId, status);
      }
    });

    const unsubIM = wsService.on('im.message', (data) => {
      const msg = data as IMMessage;
      if (!msg?.diagnosis_id) return;

      useIMStore.getState().receiveMessage(msg);
      addNotification({
        type: 'im_message',
        caseId: msg.diagnosis_id,
        diagnosisId: msg.diagnosis_id,
        message: `${msg.sender_name || 'Patient'}: ${msg.content}`,
      });
    });

    const unsubCheckin = wsService.on('physician.checkin.update', (data) => {
      const { patientName, slotLabel, message } = data as {
        patientId: string;
        patientName: string;
        slotLabel: string;
        message: string;
      };
      addNotification({
        type: 'im_message',
        caseId: '',
        message: message || `${patientName} completed their ${slotLabel} check-in`,
      });
    });

    return () => {
      unsubCaseNew();
      unsubReviewStatus();
      unsubIM();
      unsubCheckin();
    };
  }, [user, fetchCaseQueue, updateCaseStatus, addNotification]);
}

/**
 * Subscribes to admin events through the shared wsService singleton.
 * No new WebSocket connection is opened — the singleton connected by the
 * admin tab layout is reused.
 */
export function useAdminWebSocket() {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    const unsubCaseState = wsService.on('case.state.changed', (data) => {
      const { message } = data as { message?: string };
      addNotification({
        type: 'new_case',
        caseId: '',
        message: message ?? 'System update — refresh dashboard',
      });
    });

    return () => {
      unsubCaseState();
    };
  }, [user, addNotification]);
}

