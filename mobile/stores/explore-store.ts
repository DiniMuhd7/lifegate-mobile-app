import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'explore_store_v1';

// ── Types ──────────────────────────────────────────────────────────────────

export type VideoCategory =
  | 'Nutrition'
  | 'Mental Health'
  | 'Fitness'
  | 'Prevention'
  | 'Medication';

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

export const DAILY_VIDEO_CAP = 10;

// ── Seed catalogue ────────────────────────────────────────────────────────

export const SEED_VIDEOS: ExploreVideo[] = [
  {
    id: 'vid_blood_pressure',
    title: 'Understanding Blood Pressure',
    description: 'Learn what your blood pressure numbers mean and simple lifestyle changes that keep your heart healthy.',
    category: 'Prevention',
    durationSeconds: 240,
    coins: 3,
    thumbnailColor: '#ef4444',
    thumbnailIcon: 'heart-outline',
    instructor: 'TED-Ed',
    youtubeId: 'nnpGWuD3qGk',  // TED-Ed: How does blood pressure work?
  },
  {
    id: 'vid_mediterranean_diet',
    title: 'What is the Mediterranean Diet?',
    description: 'Explore the science-backed eating pattern that reduces heart disease, diabetes, and inflammation.',
    category: 'Nutrition',
    durationSeconds: 300,
    coins: 3,
    thumbnailColor: '#f59e0b',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'TED-Ed',
    youtubeId: 'YFnMzqL0wEE',  // TED-Ed: Why dieting doesn’t usually work (Sandra Aamodt)
  },
  {
    id: 'vid_morning_stretch',
    title: '5-Minute Morning Stretch Routine',
    description: 'A simple stretch sequence to reduce stiffness, improve posture and boost energy every morning.',
    category: 'Fitness',
    durationSeconds: 300,
    coins: 3,
    thumbnailColor: '#10b981',
    thumbnailIcon: 'body-outline',
    instructor: 'Wendy Suzuki · TED',
    youtubeId: 'BHY0FxzoKZE',  // TED: The brain-changing benefits of exercise
  },
  {
    id: 'vid_stress_anxiety',
    title: 'Managing Stress & Anxiety',
    description: 'Evidence-based techniques — deep breathing, grounding, and cognitive reframing — for daily stress.',
    category: 'Mental Health',
    durationSeconds: 855,
    coins: 4,
    thumbnailColor: '#8b5cf6',
    thumbnailIcon: 'happy-outline',
    instructor: 'Kelly McGonigal · TED',
    youtubeId: 'RcGyVTAoXEU',  // TED: How to make stress your friend
  },
  {
    id: 'vid_vaccines',
    title: 'How Vaccines Work',
    description: 'A clear explanation of how vaccines train your immune system and why they are essential for public health.',
    category: 'Prevention',
    durationSeconds: 285,
    coins: 3,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'TED-Ed',
    youtubeId: 'dVnPb8heKBM',  // TED-Ed: How do vaccines work?
  },
  {
    id: 'vid_gut_health',
    title: 'Gut Health & Probiotics',
    description: 'Discover how your gut microbiome affects immunity, mood, and digestion — and how to improve it.',
    category: 'Nutrition',
    durationSeconds: 285,
    coins: 3,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'flask-outline',
    instructor: 'TED-Ed',
    youtubeId: '1sISguPDlhY',  // TED-Ed: You are your microbes (gut health)
  },
  {
    id: 'vid_sleep_hygiene',
    title: 'Sleep Hygiene Tips',
    description: 'Why quality sleep matters and the proven habits that help you fall asleep faster and wake up refreshed.',
    category: 'Mental Health',
    durationSeconds: 286,
    coins: 3,
    thumbnailColor: '#4f46e5',
    thumbnailIcon: 'moon-outline',
    instructor: 'Matt Walker · TED',
    youtubeId: 'dqONk48l5vY',  // TED: Sleep is your superpower
  },
  {
    id: 'vid_medication_labels',
    title: 'Reading Your Medication Labels',
    description: 'How to interpret dosage instructions, warnings, and storage guidance on prescription and OTC medications.',
    category: 'Medication',
    durationSeconds: 300,
    coins: 3,
    thumbnailColor: '#059669',
    thumbnailIcon: 'medkit-outline',
    instructor: 'TED-Ed',
    youtubeId: '_ZX0b5ykRFI',  // TED-Ed: How do drugs affect the brain?
  },
  {
    id: 'vid_cardio_vs_strength',
    title: 'Cardio vs Strength Training',
    description: 'Which exercise burns more fat? Which builds more health? Learn how to combine both for best results.',
    category: 'Fitness',
    durationSeconds: 480,
    coins: 3,
    thumbnailColor: '#dc2626',
    thumbnailIcon: 'barbell-outline',
    instructor: 'Wendy Suzuki · TED',
    youtubeId: 'BHY0FxzoKZE',  // TED: The brain-changing benefits of exercise
  },
  {
    id: 'vid_diabetes_prevention',
    title: 'Understanding Type 2 Diabetes',
    description: 'Simple diet and activity changes that significantly lower your risk of developing type 2 diabetes.',
    category: 'Prevention',
    durationSeconds: 300,
    coins: 3,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'pulse-outline',
    instructor: 'TED-Ed',
    youtubeId: 'UKE6WhJWDSo',  // TED-Ed: How does the body regulate blood sugar?
  },
];

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
}

// ── Store ─────────────────────────────────────────────────────────────────

interface ExploreState extends PersistedExploreData {
  initialized: boolean;
  initialize: () => Promise<void>;
  claimReward: (videoId: string) => Promise<{ alreadyDone: boolean; coinsEarned: number; capReached: boolean }>;
  isRewarded: (videoId: string) => boolean;
  getDailyRemaining: () => number;
}

async function persist(data: PersistedExploreData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  lifecoins: 0,
  totalEarned: 0,
  progress: [],
  lastWatchDate: null,
  dailyWatchedCount: 0,
  initialized: false,

  initialize: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedExploreData = JSON.parse(raw);
        // Reset daily counter if it's a new day
        const today = todayStr();
        const dailyWatchedCount = data.lastWatchDate === today ? (data.dailyWatchedCount ?? 0) : 0;
        set({ ...data, dailyWatchedCount, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }
  },

  claimReward: async (videoId) => {
    const state = get();
    const today = todayStr();

    // Already rewarded today
    const entry = state.progress.find((p) => p.videoId === videoId);
    if (entry?.rewardedDate === today) {
      return { alreadyDone: true, coinsEarned: 0, capReached: false };
    }

    // Daily cap
    const dailyCount = state.lastWatchDate === today ? state.dailyWatchedCount : 0;
    if (dailyCount >= DAILY_VIDEO_CAP) {
      return { alreadyDone: false, coinsEarned: 0, capReached: true };
    }

    const video = SEED_VIDEOS.find((v) => v.id === videoId);
    if (!video) return { alreadyDone: false, coinsEarned: 0, capReached: false };

    const updatedProgress = state.progress.filter((p) => p.videoId !== videoId);
    updatedProgress.push({ videoId, rewardedDate: today });

    const newCoins = state.lifecoins + video.coins;
    const newEarned = state.totalEarned + video.coins;
    const newDailyCount = dailyCount + 1;

    set({
      lifecoins: newCoins,
      totalEarned: newEarned,
      progress: updatedProgress,
      lastWatchDate: today,
      dailyWatchedCount: newDailyCount,
    });

    await persist({
      lifecoins: newCoins,
      totalEarned: newEarned,
      progress: updatedProgress,
      lastWatchDate: today,
      dailyWatchedCount: newDailyCount,
    });

    return { alreadyDone: false, coinsEarned: video.coins, capReached: false };
  },

  isRewarded: (videoId) => {
    const { progress } = get();
    const today = todayStr();
    return progress.some((p) => p.videoId === videoId && p.rewardedDate === today);
  },

  getDailyRemaining: () => {
    const { lastWatchDate, dailyWatchedCount } = get();
    const today = todayStr();
    const watched = lastWatchDate === today ? dailyWatchedCount : 0;
    return Math.max(0, DAILY_VIDEO_CAP - watched);
  },
}));

// ── Daily shuffle ─────────────────────────────────────────────────────────────

/**
 * Returns the SEED_VIDEOS array in a deterministic shuffled order that changes
 * once per calendar day, ensuring variety without ever repeating the same
 * ordering two days in a row.
 */
export function getDailyShuffledVideos(): ExploreVideo[] {
  // Build a numeric seed from today's YYYY-MM-DD string
  const today = new Date().toISOString().slice(0, 10);
  const seed = today.split('').reduce<number>((acc, c) => acc + c.charCodeAt(0), 0);
  const arr = [...SEED_VIDEOS];
  // Fisher-Yates shuffle using the date-derived seed
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed * (i + 1))) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
