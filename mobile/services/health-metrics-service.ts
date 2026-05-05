/**
 * Health Metrics Service
 *
 * Thin API client for the continuous background monitoring endpoints:
 *   POST /api/health-metrics/sync   — upload an activity snapshot
 *   GET  /api/health-metrics/today  — retrieve today's aggregated summary
 */
import api from './api';

export interface HealthMetricsSyncPayload {
  stepsToday: number;
  activeMinutes: number;
  distanceMeters: number;
  calories: number;
}

export interface HealthMetricsTodaySummary {
  stepsToday: number;
  activeMinutes: number;
  distanceMeters: number;
  calories: number;
  lastSyncAt: string | null;
}

export async function syncHealthMetrics(
  payload: HealthMetricsSyncPayload,
): Promise<void> {
  await api.post('/health-metrics/sync', payload);
}

export async function fetchTodayHealthMetrics(): Promise<HealthMetricsTodaySummary> {
  const { data } = await api.get<Partial<HealthMetricsTodaySummary>>(
    '/health-metrics/today',
  );
  return {
    stepsToday:     data?.stepsToday     ?? 0,
    activeMinutes:  data?.activeMinutes  ?? 0,
    distanceMeters: data?.distanceMeters ?? 0,
    calories:       data?.calories       ?? 0,
    lastSyncAt:     data?.lastSyncAt     ?? null,
  };
}
