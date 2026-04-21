import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';

const STORAGE_KEY = 'explore_store_v3';

// ── Types ──────────────────────────────────────────────────────────────────

export type VideoCategory =
  | 'Nutrition'
  | 'Mental Health'
  | 'Fitness'
  | 'Prevention'
  | 'Medication'
  | 'Maternal Health'
  | 'Public Health'
  | 'Primary Care';

export interface ExploreVideo {
  id: string;
  title: string;
  description: string;
  category: VideoCategory;
  durationSeconds: number;   // approximate video length in seconds
  coins: number;
  thumbnailColor: string;    // gradient accent (shown while thumbnail loads)
  thumbnailIcon: string;     // Ionicons name fallback icon
  instructor: string;
  youtubeId: string;           // YouTube video ID (11-character string)
}

export interface VideoProgress {
  videoId: string;
  rewardedDate: string | null;  // YYYY-MM-DD when coins were claimed
}

// ── Daily cap ─────────────────────────────────────────────────────────────

// Default cap — overridden by whatever the server returns.
// 10 videos per category × 8 categories = 80.
export const DAILY_VIDEO_CAP = 80;

// ── Helpers ───────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Persisted shape ───────────────────────────────────────────────────────

interface PersistedExploreData {
  lifecoins: number;
  totalEarned: number;
  progress: VideoProgress[];   // sparse — only videos that have been rewarded
  lastWatchDate: string | null;
  dailyWatchedCount: number;
  /** Videos fetched from the API and cached locally. Used on next launch before a fresh fetch. */
  cachedVideos: ExploreVideo[];
  /** YYYY-MM-DD of the last successful API video fetch — drives the 24-hour stale check. */
  lastVideoFetchDate: string | null;
}

// ── Store ─────────────────────────────────────────────────────────────────

interface ExploreState extends PersistedExploreData {
  initialized: boolean;
  /** Live catalogue fetched from the server (empty while initial fetch is in-flight). */
  videos: ExploreVideo[];
  /** Number of rewards allowed per day (comes from server). */
  dailyCap: number;
  /** YYYY-MM-DD of the last successful remote video fetch (in-memory only). */
  lastVideoRefreshDate: string | null;
  initialize: () => Promise<void>;
  /** Refreshes just the video catalogue + today's rewards from the API. */
  refreshVideos: () => Promise<void>;
  claimReward: (videoId: string) => Promise<{ alreadyDone: boolean; coinsEarned: number; capReached: boolean }>;
  isRewarded: (videoId: string) => boolean;
  getDailyRemaining: () => number;
}

async function persist(data: PersistedExploreData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function persistVideos(videos: ExploreVideo[], fetchDate: string, existing: PersistedExploreData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, cachedVideos: videos, lastVideoFetchDate: fetchDate }));
}

/** Fetch videos + today's rewarded IDs from the API. Returns null on failure. */
async function fetchRemote(): Promise<{ videos: ExploreVideo[]; rewardedIds: string[]; dailyCap: number } | null> {
  try {
    const res = await api.get<{
      success: boolean;
      data: {
        videos: ExploreVideo[];
        rewardedIds: string[];
        dailyCap: number;
      };
    }>('/explore/videos');
    if (res.data.success) {
      const d = res.data.data;
      // Only return videos if the server actually sent some
      const videos = Array.isArray(d.videos) && d.videos.length > 0 ? d.videos : null;
      if (!videos) return null;
      return {
        videos,
        rewardedIds: d.rewardedIds ?? [],
        dailyCap: d.dailyCap ?? DAILY_VIDEO_CAP,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  lifecoins: 0,
  totalEarned: 0,
  progress: [],
  lastWatchDate: null,
  dailyWatchedCount: 0,
  initialized: false,
  videos: [],
  dailyCap: DAILY_VIDEO_CAP,
  lastVideoRefreshDate: null,

  initialize: async () => {
    const today = todayStr();
    let persisted: PersistedExploreData | null = null;

    // 1. Restore all persisted data (coins, progress, AND cached videos) from AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        persisted = JSON.parse(raw) as PersistedExploreData;
        const dailyWatchedCount = persisted.lastWatchDate === today ? (persisted.dailyWatchedCount ?? 0) : 0;
        // Immediately show cached videos so the screen is not blank while the API fetch runs
        const cachedVideos = persisted.cachedVideos ?? [];
        set({ ...persisted, videos: cachedVideos, dailyWatchedCount });
      }
    } catch { /* ignore */ }

    // 2. Only call the API if the video catalogue is stale (fetched before today)
    const lastFetch = persisted?.lastVideoFetchDate ?? null;
    const isStale = lastFetch !== today;

    if (isStale) {
      const remote = await fetchRemote();
      if (remote) {
        // Merge server-known rewarded IDs into local progress so isRewarded() is accurate
        const existingProgress = get().progress.filter((p) => p.rewardedDate !== today);
        const serverProgress: VideoProgress[] = remote.rewardedIds.map((id) => ({
          videoId: id,
          rewardedDate: today,
        }));
        const mergedProgress = [...existingProgress, ...serverProgress];
        set({
          videos: remote.videos,
          dailyCap: remote.dailyCap,
          progress: mergedProgress,
          dailyWatchedCount: remote.rewardedIds.length,
          lastVideoRefreshDate: today,
          initialized: true,
        });
        // Persist new video cache alongside coins/progress
        const current = get();
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          lifecoins: current.lifecoins,
          totalEarned: current.totalEarned,
          progress: mergedProgress,
          lastWatchDate: current.lastWatchDate,
          dailyWatchedCount: current.dailyWatchedCount,
          cachedVideos: remote.videos,
          lastVideoFetchDate: today,
        } satisfies PersistedExploreData));
        return;
      }
      // Remote fetch failed — fall through, use whatever we loaded from cache
    }

    // 3. Cache is fresh (or remote failed) — just sync today's rewarded IDs
    const rewardsRemote = await fetchRemote();
    if (rewardsRemote) {
      const existingProgress = get().progress.filter((p) => p.rewardedDate !== today);
      const serverProgress: VideoProgress[] = rewardsRemote.rewardedIds.map((id) => ({
        videoId: id,
        rewardedDate: today,
      }));
      set({
        progress: [...existingProgress, ...serverProgress],
        dailyWatchedCount: rewardsRemote.rewardedIds.length,
      });
    }

    set({ initialized: true });
  },

  refreshVideos: async () => {
    const remote = await fetchRemote();
    if (!remote) return;
    const today = todayStr();
    const existingProgress = get().progress.filter((p) => p.rewardedDate !== today);
    const serverProgress: VideoProgress[] = remote.rewardedIds.map((id) => ({
      videoId: id,
      rewardedDate: today,
    }));
    const mergedProgress = [...existingProgress, ...serverProgress];
    set({
      videos: remote.videos,
      dailyCap: remote.dailyCap,
      progress: mergedProgress,
      dailyWatchedCount: remote.rewardedIds.length,
      lastVideoRefreshDate: today,
    });
    // Persist updated video cache
    const current = get();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      lifecoins: current.lifecoins,
      totalEarned: current.totalEarned,
      progress: mergedProgress,
      lastWatchDate: current.lastWatchDate,
      dailyWatchedCount: current.dailyWatchedCount,
      cachedVideos: remote.videos,
      lastVideoFetchDate: today,
    } satisfies PersistedExploreData));
  },

  claimReward: async (videoId) => {
    const state = get();
    const today = todayStr();

    // Optimistic duplicate-check
    const entry = state.progress.find((p) => p.videoId === videoId);
    if (entry?.rewardedDate === today) {
      return { alreadyDone: true, coinsEarned: 0, capReached: false };
    }

    // Try server claim first
    try {
      const res = await api.post<{
        success: boolean;
        data: { coinsEarned: number; alreadyClaimed: boolean; capReached: boolean };
      }>('/explore/claim', { videoId });

      if (res.data.success) {
        const { coinsEarned, alreadyClaimed, capReached } = res.data.data;

        if (!alreadyClaimed && !capReached && coinsEarned > 0) {
          const updatedProgress = state.progress.filter((p) => p.videoId !== videoId);
          updatedProgress.push({ videoId, rewardedDate: today });
          const newCoins = state.lifecoins + coinsEarned;
          const newEarned = state.totalEarned + coinsEarned;
          const dailyCount = state.lastWatchDate === today ? state.dailyWatchedCount : 0;
          set({
            lifecoins: newCoins,
            totalEarned: newEarned,
            progress: updatedProgress,
            lastWatchDate: today,
            dailyWatchedCount: dailyCount + 1,
          });
          await persist({
            lifecoins: newCoins,
            totalEarned: newEarned,
            progress: updatedProgress,
            lastWatchDate: today,
            dailyWatchedCount: dailyCount + 1,
            cachedVideos: get().videos,
            lastVideoFetchDate: get().lastVideoFetchDate ?? null,
          } satisfies PersistedExploreData);
        }

        return { alreadyDone: alreadyClaimed, coinsEarned, capReached };
      }
    } catch { /* fall through to offline path */ }

    // Offline fallback — use local state
    const dailyCount = state.lastWatchDate === today ? state.dailyWatchedCount : 0;
    if (dailyCount >= state.dailyCap) {
      return { alreadyDone: false, coinsEarned: 0, capReached: true };
    }

    const video = state.videos.find((v) => v.id === videoId);
    if (!video) return { alreadyDone: false, coinsEarned: 0, capReached: false };

    const updatedProgress = state.progress.filter((p) => p.videoId !== videoId);
    updatedProgress.push({ videoId, rewardedDate: today });
    const newCoins = state.lifecoins + video.coins;
    const newEarned = state.totalEarned + video.coins;
    set({
      lifecoins: newCoins,
      totalEarned: newEarned,
      progress: updatedProgress,
      lastWatchDate: today,
      dailyWatchedCount: dailyCount + 1,
    });
    await persist({
      lifecoins: newCoins,
      totalEarned: newEarned,
      progress: updatedProgress,
      lastWatchDate: today,
      dailyWatchedCount: dailyCount + 1,
      cachedVideos: get().videos,
      lastVideoFetchDate: get().lastVideoFetchDate ?? null,
    } satisfies PersistedExploreData);
    return { alreadyDone: false, coinsEarned: video.coins, capReached: false };
  },

  isRewarded: (videoId) => {
    const { progress } = get();
    const today = todayStr();
    return progress.some((p) => p.videoId === videoId && p.rewardedDate === today);
  },

  getDailyRemaining: () => {
    const { lastWatchDate, dailyWatchedCount, dailyCap } = get();
    const today = todayStr();
    const watched = lastWatchDate === today ? dailyWatchedCount : 0;
    return Math.max(0, dailyCap - watched);
  },
}));

// ── Daily shuffle ─────────────────────────────────────────────────────────────

/**
 * Returns the video catalogue in a deterministic shuffled order that changes
 * once per calendar day, ensuring variety without ever repeating the same
 * ordering two days in a row. Pass the live videos array from the store.
 */
export function getDailyShuffledVideos(videos: ExploreVideo[] = []): ExploreVideo[] {
  // Build a numeric seed from today's YYYY-MM-DD string
  const today = new Date().toISOString().slice(0, 10);
  const seed = today.split('').reduce<number>((acc, c) => acc + c.charCodeAt(0), 0);
  const arr = [...videos];
  // Fisher-Yates shuffle using the date-derived seed
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed * (i + 1))) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
