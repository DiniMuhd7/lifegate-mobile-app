import { create } from 'zustand';
import type { HealthTimelineEntry, PreventiveAlert } from 'types/health-types';
import { HealthService } from 'services/health-service';

interface HealthState {
  // ── Patient timeline ───────────────────────────────────────────────────────
  patientTimeline: HealthTimelineEntry[];
  timelineLoading: boolean;
  timelineError: string | null;

  // ── Physician timeline ─────────────────────────────────────────────────────
  physicianTimeline: HealthTimelineEntry[];
  physicianTimelineLoading: boolean;
  physicianTimelineError: string | null;

  // ── Patient alerts ─────────────────────────────────────────────────────────
  patientAlerts: PreventiveAlert[];
  alertsLoading: boolean;
  alertsError: string | null;
  unreadAlertCount: number;

  // ── Physician alerts ───────────────────────────────────────────────────────
  physicianAlerts: PreventiveAlert[];
  physicianAlertsLoading: boolean;
  physicianAlertsError: string | null;
  unreadPhysicianAlertCount: number;

  // ── Actions ────────────────────────────────────────────────────────────────
  fetchPatientTimeline: () => Promise<void>;
  fetchPhysicianTimeline: () => Promise<void>;
  fetchPatientAlerts: () => Promise<void>;
  fetchPhysicianAlerts: () => Promise<void>;
  markAlertRead: (id: string) => void;
  markPhysicianAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  markAllPhysicianAlertsRead: () => void;
  reset: () => void;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  patientTimeline: [],
  timelineLoading: false,
  timelineError: null,

  physicianTimeline: [],
  physicianTimelineLoading: false,
  physicianTimelineError: null,

  patientAlerts: [],
  alertsLoading: false,
  alertsError: null,
  unreadAlertCount: 0,

  physicianAlerts: [],
  physicianAlertsLoading: false,
  physicianAlertsError: null,
  unreadPhysicianAlertCount: 0,

  // ── Patient timeline ──────────────────────────────────────────────────────
  fetchPatientTimeline: async () => {
    set({ timelineLoading: true, timelineError: null });
    try {
      const res = await HealthService.getPatientTimeline();
      set({ patientTimeline: res.entries, timelineLoading: false });
    } catch (e) {
      set({
        timelineLoading: false,
        timelineError: e instanceof Error ? e.message : 'Failed to load timeline',
      });
    }
  },

  // ── Physician timeline ────────────────────────────────────────────────────
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

  // ── Patient alerts ────────────────────────────────────────────────────────
  fetchPatientAlerts: async () => {
    set({ alertsLoading: true, alertsError: null });
    try {
      const res = await HealthService.getPatientAlerts();
      const unread = (res.alerts ?? []).filter((a) => !a.isRead).length;
      set({ patientAlerts: res.alerts ?? [], alertsLoading: false, unreadAlertCount: unread });
    } catch (e) {
      set({
        alertsLoading: false,
        alertsError: e instanceof Error ? e.message : 'Failed to load alerts',
      });
    }
  },

  // ── Physician alerts ──────────────────────────────────────────────────────
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

  // ── Mark read (client-side only) ──────────────────────────────────────────
  markAlertRead: (id: string) => {
    set((state) => {
      const updated = state.patientAlerts.map((a) =>
        a.id === id ? { ...a, isRead: true } : a
      );
      return { patientAlerts: updated, unreadAlertCount: updated.filter((a) => !a.isRead).length };
    });
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

  markAllAlertsRead: () => {
    set((state) => ({
      patientAlerts: state.patientAlerts.map((a) => ({ ...a, isRead: true })),
      unreadAlertCount: 0,
    }));
  },

  markAllPhysicianAlertsRead: () => {
    set((state) => ({
      physicianAlerts: state.physicianAlerts.map((a) => ({ ...a, isRead: true })),
      unreadPhysicianAlertCount: 0,
    }));
  },

  /** Clear all user-scoped data (call on logout / user switch). */
  reset: () =>
    set({
      patientTimeline: [],
      timelineError: null,
      physicianTimeline: [],
      physicianTimelineError: null,
      patientAlerts: [],
      alertsError: null,
      unreadAlertCount: 0,
      physicianAlerts: [],
      physicianAlertsError: null,
      unreadPhysicianAlertCount: 0,
    }),
}));
