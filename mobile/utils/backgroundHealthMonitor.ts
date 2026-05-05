/**
 * Background Health Monitor
 *
 * Implements continuous patient monitoring using:
 *
 *  1. Foreground: expo-sensors Pedometer real-time step listener — updates the
 *     Zustand store on every step change while the app is in the foreground.
 *
 *  2. Background: expo-background-fetch + expo-task-manager — wakes the app
 *     every ~15 minutes (OS-subject minimum) in the background, reads the
 *     latest step count, and syncs it to the backend.
 *
 *  3. Foreground sync loop: while the app is active, a 5-minute setInterval
 *     uploads the current snapshot to keep the server up to date.
 *
 * Call `startHealthMonitoring()` once after the patient authenticates.
 * Call `stopHealthMonitoring()` on logout.
 */

import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useHealthMetricsStore } from 'stores/health-metrics-store';
import { syncHealthMetrics, fetchTodayHealthMetrics } from 'services/health-metrics-service';

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKGROUND_TASK_NAME = 'lifegate-health-monitor';

/** Foreground sync interval: upload to backend every 5 minutes. */
const FOREGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Daily step goal used for progress display. */
export const DAILY_STEP_GOAL = 8000;

// ─── Active-minutes tracker ───────────────────────────────────────────────────
// We define an "active minute" as any 60-second window where ≥ 30 steps are
// recorded. A simple in-memory accumulator is good enough for this purpose.

let _lastStepTimestamp = 0;
let _stepsInCurrentMinute = 0;
let _activeMinuteTimer: ReturnType<typeof setInterval> | null = null;

function _startActiveMinuteTracker(): void {
  _stepsInCurrentMinute = 0;
  _activeMinuteTimer = setInterval(() => {
    if (_stepsInCurrentMinute >= 30) {
      useHealthMetricsStore.setState((s) => ({
        activeMinutes: s.activeMinutes + 1,
      }));
    }
    _stepsInCurrentMinute = 0;
  }, 60_000);
}

function _stopActiveMinuteTracker(): void {
  if (_activeMinuteTimer !== null) {
    clearInterval(_activeMinuteTimer);
    _activeMinuteTimer = null;
  }
}

// ─── Background task definition ───────────────────────────────────────────────
// Must be defined at module level (before any async code) so TaskManager can
// find it when the OS wakes the app in the background.

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const store = useHealthMetricsStore.getState();

    // Read today's step count from the device pedometer.
    const isAvailable = await Pedometer.isAvailableAsync();
    if (!isAvailable) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const { steps } = await Pedometer.getStepCountAsync(midnight, new Date());

    // Update store and upload to backend.
    store.updateSteps(steps);
    const { activeMinutes, distanceMeters, calories } =
      useHealthMetricsStore.getState();

    await syncHealthMetrics({ stepsToday: steps, activeMinutes, distanceMeters, calories });

    store.markSynced(new Date().toISOString());

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Module-level handles ─────────────────────────────────────────────────────

let _pedometerSubscription: ReturnType<typeof Pedometer.watchStepCount> | null = null;
let _foregroundSyncTimer: ReturnType<typeof setInterval> | null = null;
let _isMonitoring = false;

// ─── Foreground helpers ───────────────────────────────────────────────────────

async function _loadTodayBaseline(): Promise<void> {
  try {
    // Prefer persisted server value so the counter is accurate even after a
    // cold start mid-day.
    const summary = await fetchTodayHealthMetrics();
    if (summary.stepsToday > 0 || summary.lastSyncAt) {
      useHealthMetricsStore.getState().setTodaySummary(
        summary.stepsToday,
        summary.activeMinutes,
        summary.distanceMeters,
        summary.calories,
        summary.lastSyncAt,
      );
    }
  } catch {
    // Non-fatal — the device pedometer will provide live data regardless.
  }
}

async function _syncToBackend(): Promise<void> {
  try {
    const { stepsToday, activeMinutes, distanceMeters, calories } =
      useHealthMetricsStore.getState();
    await syncHealthMetrics({ stepsToday, activeMinutes, distanceMeters, calories });
    useHealthMetricsStore.getState().markSynced(new Date().toISOString());
  } catch {
    // Non-fatal — next tick will retry.
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start continuous health monitoring.
 *
 * - Checks pedometer availability.
 * - Loads today's server-persisted baseline.
 * - Attaches a real-time step listener (foreground).
 * - Registers a background-fetch task (background).
 * - Starts the 5-minute foreground sync loop.
 *
 * Safe to call multiple times — guards against double-start.
 */
export async function startHealthMonitoring(): Promise<void> {
  if (_isMonitoring) return;

  // Web has no pedometer — bail out gracefully.
  if (Platform.OS === 'web') {
    useHealthMetricsStore.getState().setMonitoringAvailable(false);
    return;
  }

  const available = await Pedometer.isAvailableAsync();
  useHealthMetricsStore.getState().setMonitoringAvailable(available);

  if (!available) return;

  _isMonitoring = true;
  useHealthMetricsStore.getState().setIsMonitoring(true);

  // Load persisted baseline from server.
  await _loadTodayBaseline();

  // ── Real-time foreground step listener ────────────────────────────────────
  _pedometerSubscription = Pedometer.watchStepCount(({ steps }) => {
    _stepsInCurrentMinute += steps;
    _lastStepTimestamp = Date.now();

    // Read today's cumulative total from the device.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    Pedometer.getStepCountAsync(midnight, new Date())
      .then(({ steps: todaySteps }) => {
        useHealthMetricsStore.getState().updateSteps(todaySteps);
      })
      .catch(() => {
        // Fall back: add the delta reported by the listener.
        useHealthMetricsStore.setState((s) => ({
          stepsToday: s.stepsToday + steps,
        }));
      });
  });

  // ── Active-minute tracker ─────────────────────────────────────────────────
  _startActiveMinuteTracker();

  // ── Foreground sync loop ──────────────────────────────────────────────────
  _foregroundSyncTimer = setInterval(_syncToBackend, FOREGROUND_SYNC_INTERVAL_MS);

  // ── Background-fetch registration ─────────────────────────────────────────
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Available ||
      status === BackgroundFetch.BackgroundFetchStatus.Restricted
    ) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
        minimumInterval: 15 * 60,  // 15 minutes (OS-enforced minimum)
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    // Background fetch registration is best-effort — foreground polling is
    // the primary mechanism.
  }
}

/**
 * Stop all monitoring subscriptions and unregister the background task.
 * Call on patient logout.
 */
export async function stopHealthMonitoring(): Promise<void> {
  if (!_isMonitoring) return;
  _isMonitoring = false;

  _pedometerSubscription?.remove();
  _pedometerSubscription = null;

  _stopActiveMinuteTracker();

  if (_foregroundSyncTimer !== null) {
    clearInterval(_foregroundSyncTimer);
    _foregroundSyncTimer = null;
  }

  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (registered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    }
  } catch {
    // Best-effort.
  }

  useHealthMetricsStore.getState().setIsMonitoring(false);
}
