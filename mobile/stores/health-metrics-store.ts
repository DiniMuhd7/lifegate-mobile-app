import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Health Metrics Store
//
// Holds live step / activity counters tracked by the background health monitor.
// Values are updated in real time from the Pedometer listener and synced to the
// backend every 5 minutes (foreground) or ~15 minutes (background-fetch).
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthMetricsState {
  /** Steps taken today (since midnight, local time). */
  stepsToday: number;
  /** Cumulative active minutes today derived from step bursts. */
  activeMinutes: number;
  /** Estimated distance walked today in meters. */
  distanceMeters: number;
  /** Estimated calories burned today (step-based estimate). */
  calories: number;
  /** Whether the device pedometer is available. */
  pedometerAvailable: boolean | null;
  /** ISO-8601 timestamp of the last successful backend sync. */
  lastSyncAt: string | null;
  /** Whether monitoring is currently running. */
  isMonitoring: boolean;

  // Actions
  setMonitoringAvailable: (available: boolean) => void;
  setIsMonitoring: (monitoring: boolean) => void;
  updateSteps: (steps: number) => void;
  setTodaySummary: (steps: number, activeMinutes: number, distanceMeters: number, calories: number, lastSyncAt: string | null) => void;
  markSynced: (at: string) => void;
  reset: () => void;
}

const STEP_LENGTH_M = 0.762;           // average stride length ~76 cm
const CALORIES_PER_STEP = 0.04;        // rough estimate: ~40 kcal per 1000 steps

function stepsToDistance(steps: number): number {
  return Math.round(steps * STEP_LENGTH_M * 10) / 10;
}

function stepsToCalories(steps: number): number {
  return Math.round(steps * CALORIES_PER_STEP * 10) / 10;
}

export const useHealthMetricsStore = create<HealthMetricsState>((set) => ({
  stepsToday: 0,
  activeMinutes: 0,
  distanceMeters: 0,
  calories: 0,
  pedometerAvailable: null,
  lastSyncAt: null,
  isMonitoring: false,

  setMonitoringAvailable: (available) =>
    set({ pedometerAvailable: available }),

  setIsMonitoring: (monitoring) =>
    set({ isMonitoring: monitoring }),

  updateSteps: (steps) =>
    set({
      stepsToday: steps,
      distanceMeters: stepsToDistance(steps),
      calories: stepsToCalories(steps),
    }),

  setTodaySummary: (steps, activeMinutes, distanceMeters, calories, lastSyncAt) =>
    set({ stepsToday: steps, activeMinutes, distanceMeters, calories, lastSyncAt }),

  markSynced: (at) => set({ lastSyncAt: at }),

  reset: () =>
    set({
      stepsToday: 0,
      activeMinutes: 0,
      distanceMeters: 0,
      calories: 0,
      pedometerAvailable: null,
      lastSyncAt: null,
      isMonitoring: false,
    }),
}));
