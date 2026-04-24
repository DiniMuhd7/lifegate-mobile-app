import { create } from 'zustand';
import type { HealthTimelineEntry, PreventiveAlert } from 'types/health-types';
import type { DiagnosisDetail } from 'types/diagnosis-types';
import { HealthService } from 'services/health-service';

// ─────────────────────────────────────────────────────────────────────────────
// Patient health store
//
// Owns: patient timeline, patient preventive alerts, fetch timestamps.
// Exported as both `usePatientHealthStore` (explicit) and `useHealthStore`
// (backward-compat alias) so no existing patient-screen import needs updating.
// ─────────────────────────────────────────────────────────────────────────────

interface PatientHealthState {
  patientTimeline: HealthTimelineEntry[];
  timelineLoading: boolean;
  timelineError: string | null;

  patientAlerts: PreventiveAlert[];
  alertsLoading: boolean;
  alertsError: string | null;
  unreadAlertCount: number;

  // Staleness timestamps — screens skip refetch when data is fresh.
  lastTimelineFetchAt: number | null;
  lastAlertsFetchAt: number | null;

  fetchPatientTimeline: () => Promise<void>;
  patchTimelineEntry: (detail: DiagnosisDetail) => void;
  fetchPatientAlerts: () => Promise<void>;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  reset: () => void;
}

export const usePatientHealthStore = create<PatientHealthState>((set) => ({
  patientTimeline: [],
  timelineLoading: false,
  timelineError: null,

  patientAlerts: [],
  alertsLoading: false,
  alertsError: null,
  unreadAlertCount: 0,

  lastTimelineFetchAt: null,
  lastAlertsFetchAt: null,

  patchTimelineEntry: (detail: DiagnosisDetail) => {
    set((state) => ({
      patientTimeline: state.patientTimeline.map((e) =>
        e.id === detail.id
          ? {
              ...e,
              condition: detail.condition,
              urgency: detail.urgency as HealthTimelineEntry['urgency'],
              status: detail.status as HealthTimelineEntry['status'],
              confidence: detail.confidence,
              physicianNotes: detail.physicianNotes,
              physicianHealthTips: detail.physicianHealthTips,
              physicianName: detail.physicianName,
              physicianDecision: detail.physicianDecision,
              hasPrescription: detail.hasPrescription,
              investigations: detail.investigations,
              updatedAt: detail.updatedAt,
            }
          : e
      ),
    }));
  },

  fetchPatientTimeline: async () => {
    set({ timelineLoading: true, timelineError: null });
    try {
      const res = await HealthService.getPatientTimeline();
      set({ patientTimeline: res.entries, timelineLoading: false, lastTimelineFetchAt: Date.now() });
    } catch (e) {
      set({
        timelineLoading: false,
        timelineError: e instanceof Error ? e.message : 'Failed to load timeline',
      });
    }
  },

  fetchPatientAlerts: async () => {
    set({ alertsLoading: true, alertsError: null });
    try {
      const res = await HealthService.getPatientAlerts();
      const unread = (res.alerts ?? []).filter((a) => !a.isRead).length;
      set({ patientAlerts: res.alerts ?? [], alertsLoading: false, unreadAlertCount: unread, lastAlertsFetchAt: Date.now() });
    } catch (e) {
      set({
        alertsLoading: false,
        alertsError: e instanceof Error ? e.message : 'Failed to load alerts',
      });
    }
  },

  markAlertRead: (id: string) => {
    set((state) => {
      const updated = state.patientAlerts.map((a) =>
        a.id === id ? { ...a, isRead: true } : a
      );
      return { patientAlerts: updated, unreadAlertCount: updated.filter((a) => !a.isRead).length };
    });
  },

  markAllAlertsRead: () => {
    set((state) => ({
      patientAlerts: state.patientAlerts.map((a) => ({ ...a, isRead: true })),
      unreadAlertCount: 0,
    }));
  },

  reset: () =>
    set({
      patientTimeline: [],
      timelineError: null,
      patientAlerts: [],
      alertsError: null,
      unreadAlertCount: 0,
      lastTimelineFetchAt: null,
      lastAlertsFetchAt: null,
    }),
}));

/**
 * Backward-compatible alias.
 * All existing patient screens import `useHealthStore` and continue to work
 * without modification. Only physician screens need to switch to
 * `usePhysicianHealthStore`.
 */
export const useHealthStore = usePatientHealthStore;

// ─────────────────────────────────────────────────────────────────────────────
// Physician health store
//
// Owns: physician timeline + physician preventive alerts.
// Completely separate Zustand instance — physician writes never touch the
// patient store, eliminating cross-domain re-renders.
// ─────────────────────────────────────────────────────────────────────────────

interface PhysicianHealthState {
  physicianTimeline: HealthTimelineEntry[];
  physicianTimelineLoading: boolean;
  physicianTimelineError: string | null;

  physicianAlerts: PreventiveAlert[];
  physicianAlertsLoading: boolean;
  physicianAlertsError: string | null;
  unreadPhysicianAlertCount: number;

  fetchPhysicianTimeline: () => Promise<void>;
  fetchPhysicianAlerts: () => Promise<void>;
  markPhysicianAlertRead: (id: string) => void;
  markAllPhysicianAlertsRead: () => void;
  reset: () => void;
}

export const usePhysicianHealthStore = create<PhysicianHealthState>((set) => ({
  physicianTimeline: [],
  physicianTimelineLoading: false,
  physicianTimelineError: null,

  physicianAlerts: [],
  physicianAlertsLoading: false,
  physicianAlertsError: null,
  unreadPhysicianAlertCount: 0,

  fetchPhysicianTimeline: async () => {
    set({ physicianTimelineLoading: true, physicianTimelineError: null });
    try {
      const res = await HealthService.getPhysicianTimeline();
      set({ physicianTimeline: res.entries, physicianTimelineLoading: false });
    } catch (e) {
      set({
        physicianTimelineLoading: false,
        physicianTimelineError: e instanceof Error ? e.message : 'Failed to load timeline',
      });
    }
  },

  fetchPhysicianAlerts: async () => {
    set({ physicianAlertsLoading: true, physicianAlertsError: null });
    try {
      const res = await HealthService.getPhysicianAlerts();
      const unread = (res.alerts ?? []).filter((a) => !a.isRead).length;
      set({
        physicianAlerts: res.alerts ?? [],
        physicianAlertsLoading: false,
        unreadPhysicianAlertCount: unread,
      });
    } catch (e) {
      set({
        physicianAlertsLoading: false,
        physicianAlertsError: e instanceof Error ? e.message : 'Failed to load alerts',
      });
    }
  },

  markPhysicianAlertRead: (id: string) => {
    set((state) => {
      const updated = state.physicianAlerts.map((a) =>
        a.id === id ? { ...a, isRead: true } : a
      );
      return {
        physicianAlerts: updated,
        unreadPhysicianAlertCount: updated.filter((a) => !a.isRead).length,
      };
    });
  },

  markAllPhysicianAlertsRead: () => {
    set((state) => ({
      physicianAlerts: state.physicianAlerts.map((a) => ({ ...a, isRead: true })),
      unreadPhysicianAlertCount: 0,
    }));
  },

  reset: () =>
    set({
      physicianTimeline: [],
      physicianTimelineError: null,
      physicianAlerts: [],
      physicianAlertsError: null,
      unreadPhysicianAlertCount: 0,
    }),
}));
