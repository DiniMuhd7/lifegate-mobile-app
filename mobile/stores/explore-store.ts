import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';
import { useAuthStore } from 'stores/auth/auth-store';
import { useLifecoinsWalletStore } from './lifecoins-wallet-store';

const STORAGE_KEY = 'explore_store_v5';

// ── Types ──────────────────────────────────────────────────────────────────

// VideoCategory is an open string so the pool can grow without touching
// every consumer.  The concrete values are enumerated in ALL_CATEGORIES.
export type VideoCategory = string;

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
// 10 videos per category × 16 categories = 160.
export const DAILY_VIDEO_CAP = 160;

// ── YouTube Data API ──────────────────────────────────────────────────────

const YT_API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? '';
const YT_RESULTS_PER_CAT = 10; // videos fetched per category per day

// ── Category pool ─────────────────────────────────────────────────────────
// Mirrors backend/internal/explore/refresher.go.  All 16 categories are
// fetched daily; the mobile client re-orders them per user context.

/** YouTube search queries for each health category. */
const CATEGORY_QUERIES: Record<string, string> = {
  // Platform pillars
  Nutrition:           'healthy nutrition diet tips science education',
  'Mental Health':     'mental health stress anxiety wellness education',
  Fitness:             'exercise workout fitness health benefits',
  Prevention:          'disease prevention health screening checkup',
  Medication:          'medication safety how medicines work pharmacy',
  'Public Health':     'public health community disease prevention epidemiology',
  'Primary Care':      'primary care family doctor general practitioner checkup',
  // Condition-specific / demographic
  'Maternal Health':   'maternal health pregnancy antenatal care mother',
  Cardiology:          'heart health cardiovascular disease blood pressure hypertension',
  Diabetes:            'diabetes management blood sugar insulin type 2 diabetes',
  'Chronic Disease':   'chronic disease management long-term condition lifestyle',
  Pediatrics:          'child health pediatric care child development vaccination',
  "Women's Health":    "women health gynecology hormonal health PCOS menstrual",
  "Men's Health":      'men health prostate testosterone sexual health men wellness',
  'Sleep & Recovery':  'sleep health insomnia sleep disorders recovery rest',
  Dermatology:         'skin health dermatology eczema acne skincare',
};

/**
 * Display metadata (colour + icon) for every category.
 * Exported so the explore screen and other consumers can resolve metadata
 * for any category string without importing a separate lookup.
 */
export const CATEGORY_META: Record<string, { color: string; icon: string }> = {
  // Platform pillars
  Nutrition:           { color: '#f59e0b', icon: 'nutrition-outline' },
  'Mental Health':     { color: '#8b5cf6', icon: 'happy-outline' },
  Fitness:             { color: '#10b981', icon: 'barbell-outline' },
  Prevention:          { color: '#0284c7', icon: 'shield-checkmark-outline' },
  Medication:          { color: '#059669', icon: 'medkit-outline' },
  'Public Health':     { color: '#0891b2', icon: 'earth-outline' },
  'Primary Care':      { color: '#16a34a', icon: 'home-outline' },
  // Condition-specific / demographic
  'Maternal Health':   { color: '#db2777', icon: 'rose-outline' },
  Cardiology:          { color: '#ef4444', icon: 'heart-outline' },
  Diabetes:            { color: '#f97316', icon: 'fitness-outline' },
  'Chronic Disease':   { color: '#dc2626', icon: 'pulse-outline' },
  Pediatrics:          { color: '#06b6d4', icon: 'people-outline' },
  "Women's Health":    { color: '#ec4899', icon: 'female-outline' },
  "Men's Health":      { color: '#3b82f6', icon: 'male-outline' },
  'Sleep & Recovery':  { color: '#6366f1', icon: 'moon-outline' },
  Dermatology:         { color: '#84cc16', icon: 'color-palette-outline' },
};

/** Ordered list of all available categories (used as filter pills). */
export const ALL_CATEGORIES: string[] = Object.keys(CATEGORY_META);

// ── User-context category derivation ──────────────────────────────────────

/** Platform pillars shown for every user regardless of health profile. */
const PILLAR_CATEGORIES = ['Primary Care', 'Prevention', 'Mental Health', 'Nutrition', 'Fitness'];

/** Maps text patterns found in user health context to a category. */
const CONDITION_CATEGORY_MAP: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /cardio|heart|hypertension|blood.?pressure|cardiac|coronary/i, category: 'Cardiology' },
  { pattern: /diabet|glucose|insulin|blood.?sugar/i,                        category: 'Diabetes' },
  { pattern: /anxiety|depress|mental|stress|psychiatr|bipolar/i,            category: 'Mental Health' },
  { pattern: /sleep|insomnia|fatigue|tired/i,                               category: 'Sleep & Recovery' },
  { pattern: /skin|dermat|eczema|acne|rash|psoriasis/i,                     category: 'Dermatology' },
  { pattern: /pregnan|antenatal|maternal|prenatal|postpartum/i,             category: 'Maternal Health' },
  { pattern: /child|pediatr|infant|toddler|newborn/i,                       category: 'Pediatrics' },
  { pattern: /pcos|gynecol|menstrual|menopause|hormonal/i,                  category: "Women's Health" },
  { pattern: /prostate|testosterone|erectile/i,                             category: "Men's Health" },
  { pattern: /nutrition|vitamin|anemia|iron|deficien|malnouris/i,           category: 'Nutrition' },
  { pattern: /chronic|long.?term|ongoing|persistent/i,                      category: 'Chronic Disease' },
  { pattern: /malaria|typhoid|infectious|epidemic|vaccin/i,                 category: 'Public Health' },
  { pattern: /medic|drug|pharmacol|prescription|dosage/i,                   category: 'Medication' },
  { pattern: /fitness|exercise|obesity|overweight|sedentary/i,              category: 'Fitness' },
];

/**
 * Returns a personalised category order for the explore screen.
 *
 * Priority:
 *   1. Platform pillars (Primary Care, Prevention, Mental Health, Nutrition, Fitness)
 *   2. Gender-specific categories
 *   3. Categories matched from the user's medical history, current medications,
 *      health history, allergies, and diagnosed conditions
 *   4. Remaining categories from the full pool
 *
 * The caller supplies `diagnosedConditions` — typically the `condition` field
 * from each DiagnosisDetail in the patient's health timeline.
 */
export function deriveUserCategories(
  user: {
    gender?: string;
    medical_history?: string | null;
    current_medications?: string | null;
    health_history?: string | null;
    allergies?: string | null;
  } | null,
  diagnosedConditions: string[] = [],
): string[] {
  const ranked = new Set<string>(PILLAR_CATEGORIES);

  // Gender-based additions
  const gender = (user?.gender ?? '').toLowerCase();
  if (gender === 'female' || gender === 'f') {
    ranked.add('Maternal Health');
    ranked.add("Women's Health");
  } else if (gender === 'male' || gender === 'm') {
    ranked.add("Men's Health");
  }

  // Add Medication when the user is actively on medications
  if (user?.current_medications) ranked.add('Medication');

  // Keyword-match across the user's full health text corpus
  const corpus = [
    user?.medical_history ?? '',
    user?.current_medications ?? '',
    user?.health_history ?? '',
    user?.allergies ?? '',
    ...diagnosedConditions,
  ].join(' ');

  for (const { pattern, category } of CONDITION_CATEGORY_MAP) {
    if (pattern.test(corpus)) ranked.add(category);
  }

  // Append every remaining category so all are still accessible
  for (const cat of ALL_CATEGORIES) ranked.add(cat);

  return Array.from(ranked);
}

/** Parse ISO 8601 durations like PT4M13S → seconds */
function parseISO8601Duration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0') * 3600) +
         (parseInt(m[2] ?? '0') * 60) +
          parseInt(m[3] ?? '0');
}

/** Derive coin reward from duration: ~5 min = 1 LC, ~10 min = 3 LC, ~15–20 min = 5 LC */
function coinsForDuration(seconds: number): number {
  if (seconds >= 900) return 5;
  if (seconds >= 600) return 3;
  return 1;
}

/**
 * Fetch a fresh daily catalogue straight from the YouTube Data API.
 * Searches each health category for medium-length videos (5–20 min),
 * resolves exact durations via videos.list, and returns ExploreVideo[]
 * ready for the store. Returns null if the API key is absent or any call fails.
 */
function resolveExploreLanguage(language?: string | null): string {
  const raw = (language ?? '').trim().toLowerCase();
  if (!raw) return 'en';
  const map: Record<string, string> = {
    english: 'en',
    eng: 'en',
    french: 'fr',
    francais: 'fr',
    'français': 'fr',
    spanish: 'es',
    espanol: 'es',
    'español': 'es',
    yoruba: 'yo',
    igbo: 'ig',
    hausa: 'ha',
  };
  return map[raw] ?? raw.slice(0, 2) ?? 'en';
}

async function fetchCategoryVideos(category: string, language = 'en'): Promise<ExploreVideo[]> {
  const query = encodeURIComponent(CATEGORY_QUERIES[category]);
  const relevanceLanguage = encodeURIComponent(resolveExploreLanguage(language));
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&q=${query}&type=video&videoDuration=medium` +
    `&maxResults=${YT_RESULTS_PER_CAT}&relevanceLanguage=${relevanceLanguage}` +
    `&safeSearch=strict&key=${YT_API_KEY}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json() as {
    items?: Array<{
      id: { videoId: string };
      snippet: { title: string; description: string; channelTitle: string };
    }>;
  };

  const items = searchData.items ?? [];
  if (items.length === 0) return [];

  const ids = items.map((it) => it.id.videoId).join(',');
  const detailsUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=contentDetails&id=${encodeURIComponent(ids)}&key=${YT_API_KEY}`;

  const detailsRes = await fetch(detailsUrl);
  if (!detailsRes.ok) return [];
  const detailsData = await detailsRes.json() as {
    items?: Array<{ id: string; contentDetails: { duration: string } }>;
  };

  const durationMap = new Map<string, number>();
  for (const d of detailsData.items ?? []) {
    durationMap.set(d.id, parseISO8601Duration(d.contentDetails.duration));
  }

  const meta = CATEGORY_META[category];
  const videos: ExploreVideo[] = [];

  for (const it of items) {
    const vid = it.id.videoId;
    const dur = durationMap.get(vid) ?? 0;
    // Keep only 3–20 min videos (180–1200 s)
    if (dur < 180 || dur > 1200) continue;

    let desc = it.snippet.description ?? '';
    if (desc.length > 180) desc = desc.slice(0, 177) + '\u2026';
    desc = desc.replace(/\n/g, ' ');

    videos.push({
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

  return videos;
}

async function fetchFromYouTube(language?: string | null): Promise<ExploreVideo[] | null> {
  if (!YT_API_KEY) return null;

  const categories = Object.keys(CATEGORY_QUERIES);

  // Fetch all categories in parallel — reduces wait from ~16 sequential
  // network calls to the latency of the single slowest category.
  const results = await Promise.all(
    categories.map((category) =>
      fetchCategoryVideos(category, language ?? 'en').catch(() => [] as ExploreVideo[])
    )
  );

  const all = results.flat();
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
  /** Reset all in-memory state. Call on logout so the next user starts clean. */
  reset: () => void;
}

async function persist(data: PersistedExploreData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function persistVideos(videos: ExploreVideo[], fetchDate: string, existing: PersistedExploreData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, cachedVideos: videos, lastVideoFetchDate: fetchDate }));
}

/**
 * Fetch videos + today's rewarded IDs.
 *
 * Priority:
 *   1. Backend /explore/videos — the authoritative catalogue populated by the
 *      server's daily YouTube refresher. Using the backend as primary avoids
 *      consuming the shared YouTube API quota from every client session.
 *   2. YouTube Data API (client-side) — emergency fallback used only when the
 *      backend returns an empty catalogue (e.g. first deploy before the
 *      refresher has run). This preserves quota for the backend refresher and
 *      ensures all 16 categories are populated consistently for every user.
 */
async function fetchRemote(): Promise<{ videos: ExploreVideo[]; rewardedIds: string[]; dailyCap: number } | null> {
  const userLanguage = useAuthStore.getState().user?.language ?? 'en';
  // ── 1. Primary: backend catalogue ────────────────────────────────────────
  try {
    const res = await api.get<{
      success: boolean;
      data: { videos: ExploreVideo[]; rewardedIds: string[]; dailyCap: number };
    }>('/explore/videos');

    if (res.data.success) {
      const rewardedIds   = res.data.data.rewardedIds ?? [];
      const dailyCap      = res.data.data.dailyCap    ?? DAILY_VIDEO_CAP;
      const backendVideos =
        Array.isArray(res.data.data.videos) && res.data.data.videos.length > 0
          ? (res.data.data.videos as ExploreVideo[])
          : null;

      if (backendVideos) {
        return { videos: backendVideos, rewardedIds, dailyCap };
      }

      // Backend reachable but catalogue is empty (refresher hasn't run yet).
      // Fall back to a direct YouTube fetch so the screen isn't empty.
      const ytVideos = await fetchFromYouTube(userLanguage);
      if (ytVideos) return { videos: ytVideos, rewardedIds, dailyCap };
      return null;
    }
  } catch {
    // Backend unreachable — try YouTube so the screen isn't left empty.
    const ytVideos = await fetchFromYouTube(userLanguage);
    if (ytVideos) return { videos: ytVideos, rewardedIds: [], dailyCap: DAILY_VIDEO_CAP };
    return null;
  }

  return null;
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  lifecoins: 0,
  totalEarned: 0,
  progress: [],
  lastWatchDate: null,
  dailyWatchedCount: 0,
  cachedVideos: [],
  lastVideoFetchDate: null,
  initialized: false,
  videos: [],
  dailyCap: DAILY_VIDEO_CAP,
  lastVideoRefreshDate: null,

  initialize: async () => {
    const today = todayStr();
    let persisted: PersistedExploreData | null = null;

    // 1. Restore all persisted data from AsyncStorage and mark initialized
    //    immediately so the screen can render cached content right away.
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        persisted = JSON.parse(raw) as PersistedExploreData;
        const dailyWatchedCount = persisted.lastWatchDate === today ? (persisted.dailyWatchedCount ?? 0) : 0;
        const cachedVideos = persisted.cachedVideos ?? [];
        // Set lastVideoRefreshDate: today immediately so useFocusEffect does
        // not trigger a parallel refreshVideos() while step 2 fetch is in-flight.
        set({ ...persisted, videos: cachedVideos, dailyWatchedCount, initialized: true, lastVideoRefreshDate: today });
      } else {
        set({ initialized: true, lastVideoRefreshDate: today });
      }
    } catch {
      set({ initialized: true, lastVideoRefreshDate: today });
    }

    // 2. Refresh video catalogue if stale (fetched before today)
    const lastFetch = persisted?.lastVideoFetchDate ?? null;
    if (lastFetch !== today) {
      const remote = await fetchRemote();
      if (remote) {
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
          lastVideoFetchDate: today,  // keep in-memory state in sync with storage
        });
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
      }
      return;
    }

    // 3. Cache is fresh — just sync today’s rewarded IDs from the server
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
      lastVideoFetchDate: today,  // keep in-memory state in sync with storage
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
          useLifecoinsWalletStore.getState().addCoins('explore', coinsEarned, 'Explore video reward');
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
    useLifecoinsWalletStore.getState().addCoins('explore', video.coins, 'Explore video reward');
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

  reset: () => {
    set({
      lifecoins: 0,
      totalEarned: 0,
      progress: [],
      lastWatchDate: null,
      dailyWatchedCount: 0,
      cachedVideos: [],
      lastVideoFetchDate: null,
      initialized: false,
      videos: [],
      dailyCap: DAILY_VIDEO_CAP,
      lastVideoRefreshDate: null,
    });
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
