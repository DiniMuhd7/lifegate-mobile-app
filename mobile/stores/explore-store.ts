import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';

const STORAGE_KEY = 'explore_store_v4';

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

// ── YouTube Data API ──────────────────────────────────────────────────────

const YT_API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? '';
const YT_RESULTS_PER_CAT = 10; // videos fetched per category per day

/** Search queries for each health category — mirrors backend/internal/explore/refresher.go */
const CATEGORY_QUERIES: Record<VideoCategory, string> = {
  Nutrition:         'healthy nutrition diet tips science education',
  'Mental Health':   'mental health stress anxiety wellness education',
  Fitness:           'exercise workout fitness health benefits',
  Prevention:        'disease prevention health screening checkup',
  Medication:        'medication safety how medicines work pharmacy',
  'Maternal Health': 'maternal health pregnancy antenatal care mother',
  'Public Health':   'public health community disease prevention epidemiology',
  'Primary Care':    'primary care family doctor general practitioner checkup',
};

/** Display metadata per category */
const CATEGORY_META: Record<VideoCategory, { color: string; icon: string }> = {
  Nutrition:         { color: '#f59e0b', icon: 'nutrition-outline' },
  'Mental Health':   { color: '#8b5cf6', icon: 'happy-outline' },
  Fitness:           { color: '#10b981', icon: 'barbell-outline' },
  Prevention:        { color: '#0284c7', icon: 'shield-checkmark-outline' },
  Medication:        { color: '#059669', icon: 'medkit-outline' },
  'Maternal Health': { color: '#db2777', icon: 'rose-outline' },
  'Public Health':   { color: '#0891b2', icon: 'earth-outline' },
  'Primary Care':    { color: '#16a34a', icon: 'home-outline' },
};

/** Parse ISO 8601 durations like PT4M13S → seconds */
function parseISO8601Duration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0') * 3600) +
         (parseInt(m[2] ?? '0') * 60) +
          parseInt(m[3] ?? '0');
}

/** Derive coin reward from duration: 5 min = 3, 10 min = 4, 15 min+ = 5 */
function coinsForDuration(seconds: number): number {
  if (seconds >= 900) return 5;
  if (seconds >= 600) return 4;
  return 3;
}

/**
 * Fetch a fresh daily catalogue straight from the YouTube Data API.
 * Searches each health category for medium-length videos (5–20 min),
 * resolves exact durations via videos.list, and returns ExploreVideo[]
 * ready for the store. Returns null if the API key is absent or any call fails.
 */
async function fetchFromYouTube(): Promise<ExploreVideo[] | null> {
  if (!YT_API_KEY) return null;

  const categories = Object.keys(CATEGORY_QUERIES) as VideoCategory[];
  const all: ExploreVideo[] = [];

  for (const category of categories) {
    try {
      const query = encodeURIComponent(CATEGORY_QUERIES[category]);
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet&q=${query}&type=video&videoDuration=medium` +
        `&maxResults=${YT_RESULTS_PER_CAT}&relevanceLanguage=en` +
        `&safeSearch=strict&key=${YT_API_KEY}`;

      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json() as {
        items?: Array<{
          id: { videoId: string };
          snippet: { title: string; description: string; channelTitle: string };
        }>;
      };

      const items = searchData.items ?? [];
      if (items.length === 0) continue;

      const ids = items.map((it) => it.id.videoId).join(',');
      const detailsUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=contentDetails&id=${encodeURIComponent(ids)}&key=${YT_API_KEY}`;

      const detailsRes = await fetch(detailsUrl);
      if (!detailsRes.ok) continue;
      const detailsData = await detailsRes.json() as {
        items?: Array<{ id: string; contentDetails: { duration: string } }>;
      };

      const durationMap = new Map<string, number>();
      for (const d of detailsData.items ?? []) {
        durationMap.set(d.id, parseISO8601Duration(d.contentDetails.duration));
      }

      const meta = CATEGORY_META[category];
      const snippetMap = new Map(items.map((it) => [it.id.videoId, it.snippet]));

      for (const it of items) {
        const vid = it.id.videoId;
        const dur = durationMap.get(vid) ?? 0;
        // Keep only 5–20 min videos (300–1200 s)
        if (dur < 300 || dur > 1200) continue;

        let desc = it.snippet.description ?? '';
        if (desc.length > 180) desc = desc.slice(0, 177) + '\u2026';
        desc = desc.replace(/\n/g, ' ');

        all.push({
          id: `yt_${category.toLowerCase().replace(/\s+/g, '_')}_${vid}`,
          title: it.snippet.title,
          description: desc || `${category} educational video.`,
          category,
          durationSeconds: dur,
          coins: coinsForDuration(dur),
          thumbnailColor: meta.color,
          thumbnailIcon: meta.icon,
          instructor: it.snippet.channelTitle,
          youtubeId: vid,
        });
      }

      // Small delay between categories to be quota-friendly
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // Skip failed categories — continue with others
      continue;
    }
  }

  return all.length > 0 ? all : null;
}

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

/** Fetch videos + today's rewarded IDs. Tries YouTube Data API first, falls back to backend. */
async function fetchRemote(): Promise<{ videos: ExploreVideo[]; rewardedIds: string[]; dailyCap: number } | null> {
  // ── 1. Try YouTube Data API directly ─────────────────────────────────────
  const ytVideos = await fetchFromYouTube();

  // ── 2. Fetch rewards from backend regardless of video source ──────────────
  let rewardedIds: string[] = [];
  let dailyCap = DAILY_VIDEO_CAP;

  try {
    const res = await api.get<{
      success: boolean;
      data: { videos: ExploreVideo[]; rewardedIds: string[]; dailyCap: number };
    }>('/explore/videos');
    if (res.data.success) {
      rewardedIds = res.data.data.rewardedIds ?? [];
      dailyCap = res.data.data.dailyCap ?? DAILY_VIDEO_CAP;
      // If YouTube fetch failed or key not set, use backend videos as fallback
      if (!ytVideos) {
        const backendVideos = Array.isArray(res.data.data.videos) && res.data.data.videos.length > 0
          ? res.data.data.videos
          : null;
        if (!backendVideos) return null;
        return { videos: backendVideos, rewardedIds, dailyCap };
      }
    }
  } catch {
    // Backend unreachable — if YouTube gave us videos, still return them
    if (ytVideos) return { videos: ytVideos, rewardedIds: [], dailyCap: DAILY_VIDEO_CAP };
    return null;
  }

  if (!ytVideos) return null;
  return { videos: ytVideos, rewardedIds, dailyCap };
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
