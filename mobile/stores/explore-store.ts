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
  durationSeconds: number;   // original content length
  coins: number;
  thumbnailColor: string;    // gradient accent
  thumbnailIcon: string;     // Ionicons name for placeholder thumbnail
  instructor: string;
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
    coins: 20,
    thumbnailColor: '#ef4444',
    thumbnailIcon: 'heart-outline',
    instructor: 'Dr. Amara Osei',
  },
  {
    id: 'vid_mediterranean_diet',
    title: 'Mediterranean Diet Basics',
    description: 'Explore the science-backed eating pattern that reduces heart disease, diabetes, and inflammation.',
    category: 'Nutrition',
    durationSeconds: 300,
    coins: 25,
    thumbnailColor: '#f59e0b',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'Nutritionist Fatima Bello',
  },
  {
    id: 'vid_morning_stretch',
    title: '5-Minute Morning Stretch Routine',
    description: 'A simple stretch sequence to reduce stiffness, improve posture and boost energy every morning.',
    category: 'Fitness',
    durationSeconds: 300,
    coins: 20,
    thumbnailColor: '#10b981',
    thumbnailIcon: 'body-outline',
    instructor: 'Coach Emeka Nwosu',
  },
  {
    id: 'vid_stress_anxiety',
    title: 'Managing Stress & Anxiety',
    description: 'Evidence-based techniques — deep breathing, grounding, and cognitive reframing — for daily stress.',
    category: 'Mental Health',
    durationSeconds: 360,
    coins: 30,
    thumbnailColor: '#8b5cf6',
    thumbnailIcon: 'happy-outline',
    instructor: 'Psychologist Dr. Ngozi Eze',
  },
  {
    id: 'vid_vaccines',
    title: 'How Vaccines Work',
    description: 'A clear explanation of how vaccines train your immune system and why they are essential for public health.',
    category: 'Prevention',
    durationSeconds: 240,
    coins: 20,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'Dr. Samuel Adeyemi',
  },
  {
    id: 'vid_gut_health',
    title: 'Gut Health & Probiotics',
    description: 'Discover how your gut microbiome affects immunity, mood, and digestion — and how to improve it.',
    category: 'Nutrition',
    durationSeconds: 300,
    coins: 25,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'flask-outline',
    instructor: 'Dr. Chidinma Okafor',
  },
  {
    id: 'vid_sleep_hygiene',
    title: 'Sleep Hygiene Tips',
    description: 'Why quality sleep matters and the proven habits that help you fall asleep faster and wake up refreshed.',
    category: 'Mental Health',
    durationSeconds: 240,
    coins: 20,
    thumbnailColor: '#4f46e5',
    thumbnailIcon: 'moon-outline',
    instructor: 'Dr. Adaeze Nwankwo',
  },
  {
    id: 'vid_medication_labels',
    title: 'Reading Your Medication Labels',
    description: 'How to interpret dosage instructions, warnings, and storage guidance on prescription and OTC medications.',
    category: 'Medication',
    durationSeconds: 240,
    coins: 25,
    thumbnailColor: '#059669',
    thumbnailIcon: 'medkit-outline',
    instructor: 'Pharmacist Tunde Afolabi',
  },
  {
    id: 'vid_cardio_vs_strength',
    title: 'Cardio vs Strength Training',
    description: 'Which exercise burns more fat? Which builds more health? Learn how to combine both for best results.',
    category: 'Fitness',
    durationSeconds: 360,
    coins: 30,
    thumbnailColor: '#dc2626',
    thumbnailIcon: 'barbell-outline',
    instructor: 'Coach Yemi Adeyinka',
  },
  {
    id: 'vid_diabetes_prevention',
    title: 'Diabetes Prevention Guide',
    description: 'Simple diet and activity changes that significantly lower your risk of developing type 2 diabetes.',
    category: 'Prevention',
    durationSeconds: 300,
    coins: 25,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'pulse-outline',
    instructor: 'Dr. Blessing Okonkwo',
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
