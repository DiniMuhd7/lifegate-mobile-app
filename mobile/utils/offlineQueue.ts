/**
 * Offline Queue
 *
 * When a mutating API call fails because the device is offline the caller
 * can push a job descriptor onto this queue via `enqueue()`.  When the
 * device comes back online `flushQueue()` replays all pending jobs in
 * order.  Jobs are persisted to AsyncStorage so they survive app restarts.
 *
 * Usage:
 *   import { offlineQueue } from '../utils/offlineQueue';
 *
 *   // In an API service call:
 *   if (isOffline) {
 *     await offlineQueue.enqueue({ key: 'push-token', fn: () => api.post('/push-token', data) });
 *     return;
 *   }
 *
 *   // In the root layout, wire up auto-flush when connectivity returns:
 *   useEffect(() => {
 *     if (isOnline) offlineQueue.flush();
 *   }, [isOnline]);
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type QueuedJob = {
  id: string;
  key: string;          // dedup key — only the last enqueue with a given key runs
  endpoint: string;     // readable label for debugging
  method: string;       // 'GET' | 'POST' | 'PATCH' | …
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  enqueuedAt: string;
};

const STORAGE_KEY = 'lifegate_offline_queue';

class OfflineQueue {
  private running = false;

  // ── Persistence ──────────────────────────────────────────────────────────

  private async load(): Promise<QueuedJob[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as QueuedJob[]) : [];
    } catch {
      return [];
    }
  }

  private async save(jobs: QueuedJob[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch {
      // storage full or unavailable — best-effort
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Add a job to the queue.  If a job with the same `key` already exists
   * it is replaced (last-write-wins), preventing duplicate replay.
   */
  async enqueue(job: Omit<QueuedJob, 'id' | 'enqueuedAt'>): Promise<void> {
    const jobs = await this.load();
    const idx = jobs.findIndex((j) => j.key === job.key);
    const entry: QueuedJob = {
      ...job,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      enqueuedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      jobs[idx] = entry;
    } else {
      jobs.push(entry);
    }
    await this.save(jobs);
  }

  /** Remove a job by id (called after successful replay). */
  async dequeue(id: string): Promise<void> {
    const jobs = await this.load();
    await this.save(jobs.filter((j) => j.id !== id));
  }

  /** Count of pending jobs. */
  async size(): Promise<number> {
    return (await this.load()).length;
  }

  /**
   * Replay all queued jobs in order using the provided executor function.
   * The executor receives a job and should return true on success.
   * Successfully replayed jobs are removed; failed jobs are retained.
   */
  async flush(
    executor: (job: QueuedJob) => Promise<boolean>
  ): Promise<{ replayed: number; failed: number }> {
    if (this.running) return { replayed: 0, failed: 0 };
    this.running = true;

    let replayed = 0;
    let failed = 0;

    try {
      const jobs = await this.load();
      for (const job of jobs) {
        try {
          const ok = await executor(job);
          if (ok) {
            await this.dequeue(job.id);
            replayed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
    } finally {
      this.running = false;
    }

    return { replayed, failed };
  }

  /** Clear all queued jobs (e.g. on logout). */
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export const offlineQueue = new OfflineQueue();
