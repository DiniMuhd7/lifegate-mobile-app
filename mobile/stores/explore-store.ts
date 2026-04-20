import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';

const STORAGE_KEY = 'explore_store_v1';

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
export const DAILY_VIDEO_CAP = 10;

// ── Seed catalogue ────────────────────────────────────────────────────────

export const SEED_VIDEOS: ExploreVideo[] = [
  // ── Nutrition ─────────────────────────────────────────────────────────
  {
    id: 'vid_nutrition_life',
    title: 'Nutrition for a Healthy Life',
    description: 'How everyday food choices affect your body at the cellular level and practical steps to eat for longevity.',
    category: 'Nutrition',
    durationSeconds: 266,
    coins: 3,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'Alliance for Aging Research',
    youtubeId: 'c06dTj0v0sM',
  },
  {
    id: 'vid_balanced_diet',
    title: 'Balanced Diet Explained',
    description: 'Understand all the major food groups, why each one matters, and how to build meals that cover your daily needs.',
    category: 'Nutrition',
    durationSeconds: 299,
    coins: 3,
    thumbnailColor: '#f59e0b',
    thumbnailIcon: 'nutrition-outline',
    instructor: 'FuseSchool',
    youtubeId: 'NqV1Ig4_nfI',
  },
  {
    id: 'vid_food_brain',
    title: 'How Food Affects Your Brain',
    description: 'Your brain runs on what you eat. Discover which nutrients sharpen focus and which damage cognitive function.',
    category: 'Nutrition',
    durationSeconds: 293,
    coins: 3,
    thumbnailColor: '#f97316',
    thumbnailIcon: 'flask-outline',
    instructor: 'TED-Ed',
    youtubeId: 'xyQY8a-ng6g',
  },
  {
    id: 'vid_eating_tips',
    title: '3 Simple Healthy Eating Tips',
    description: 'Three science-backed tricks to make healthier food choices without overhauling your whole lifestyle.',
    category: 'Nutrition',
    durationSeconds: 60,
    coins: 2,
    thumbnailColor: '#65a30d',
    thumbnailIcon: 'leaf-outline',
    instructor: 'BBC Ideas',
    youtubeId: '-YyGQd-kQGU',
  },
  // ── Mental Health ─────────────────────────────────────────────────────
  {
    id: 'vid_stress_adolescents',
    title: 'Understanding Stress & Anxiety',
    description: 'What stress and anxiety actually are, how they affect your body, and when to seek professional support.',
    category: 'Mental Health',
    durationSeconds: 89,
    coins: 2,
    thumbnailColor: '#7c3aed',
    thumbnailIcon: 'happy-outline',
    instructor: 'NIMH',
    youtubeId: 'wr4N-SdekqY',
  },
  {
    id: 'vid_daily_stress_habits',
    title: '6 Daily Habits to Beat Stress',
    description: 'Six small, evidence-backed daily actions — from journaling to breathing — that measurably reduce anxiety over time.',
    category: 'Mental Health',
    durationSeconds: 384,
    coins: 4,
    thumbnailColor: '#8b5cf6',
    thumbnailIcon: 'heart-outline',
    instructor: 'Psych2Go',
    youtubeId: 'o18I23HCQtE',
  },
  {
    id: 'vid_mindfulness_practice',
    title: 'How to Practice Mindfulness',
    description: 'A clear, step-by-step introduction to mindfulness from a psychologist — no experience or equipment needed.',
    category: 'Mental Health',
    durationSeconds: 224,
    coins: 3,
    thumbnailColor: '#4f46e5',
    thumbnailIcon: 'leaf-outline',
    instructor: 'Psych Hub',
    youtubeId: 'bLpChrgS0AY',
  },
  // ── Fitness ───────────────────────────────────────────────────────────
  {
    id: 'vid_start_exercising',
    title: 'What Happens When You Start Exercising',
    description: 'An animated look at real-time changes in your muscles, heart, lungs, and brain the moment you begin working out.',
    category: 'Fitness',
    durationSeconds: 546,
    coins: 4,
    thumbnailColor: '#ea580c',
    thumbnailIcon: 'barbell-outline',
    instructor: 'Practical Wisdom',
    youtubeId: 'KEhbYNmY3N4',
  },
  {
    id: 'vid_exercise_benefits',
    title: 'Top 10 Benefits of Exercise',
    description: 'Doctor Mike Hansen walks through the ten strongest science-backed reasons why regular exercise is non-negotiable.',
    category: 'Fitness',
    durationSeconds: 492,
    coins: 4,
    thumbnailColor: '#dc2626',
    thumbnailIcon: 'body-outline',
    instructor: 'Doctor Mike Hansen',
    youtubeId: 'XqTcye_acTI',
  },
  {
    id: 'vid_cardio_vs_strength',
    title: 'Cardio vs. Strength Training',
    description: 'Which is better for your health and longevity? Oncology experts break down what the research actually shows.',
    category: 'Fitness',
    durationSeconds: 66,
    coins: 2,
    thumbnailColor: '#10b981',
    thumbnailIcon: 'walk-outline',
    instructor: 'UT MD Anderson',
    youtubeId: 'YvrKIQ_Tbsk',
  },
  // ── Prevention ────────────────────────────────────────────────────────
  {
    id: 'vid_prevention_levels',
    title: 'Levels of Disease Prevention',
    description: 'Primary, secondary, and tertiary prevention explained — how public health stops disease before it starts.',
    category: 'Prevention',
    durationSeconds: 419,
    coins: 4,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: 'Level Up RN',
    youtubeId: 'wAYlurDlGAI',
  },
  {
    id: 'vid_checkup_myths',
    title: 'Health Check-Up Myths Debunked',
    description: 'A surgeon separates fact from fiction on preventive screenings — who really needs them and how often.',
    category: 'Prevention',
    durationSeconds: 117,
    coins: 2,
    thumbnailColor: '#0ea5e9',
    thumbnailIcon: 'pulse-outline',
    instructor: 'Dr. Neeraj Goel',
    youtubeId: 'eV5gz_p53ZE',
  },
  {
    id: 'vid_annual_checkup',
    title: 'What to Expect at Your Annual Checkup',
    description: 'A walkthrough of what doctors actually do during a yearly physical and why each part of the exam matters.',
    category: 'Prevention',
    durationSeconds: 84,
    coins: 2,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'medical-outline',
    instructor: 'Remix Medical',
    youtubeId: 'q55RMYf6lAU',
  },
  // ── Medication ────────────────────────────────────────────────────────
  {
    id: 'vid_medication_safety',
    title: 'Medication Safety Essentials',
    description: 'How to take, store, and dispose of medications safely — including what to do when you miss a dose.',
    category: 'Medication',
    durationSeconds: 219,
    coins: 3,
    thumbnailColor: '#059669',
    thumbnailIcon: 'medkit-outline',
    instructor: 'Medical Centric',
    youtubeId: 'iQozgr7XnoY',
  },
  {
    id: 'vid_medication_admin',
    title: 'Safe Medication Administration',
    description: 'Pharmacology basics: the five rights of medication administration, common errors, and how to read a prescription.',
    category: 'Medication',
    durationSeconds: 674,
    coins: 4,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'flask-outline',
    instructor: 'Level Up RN',
    youtubeId: 'pWlOTAe97G4',
  },
  // ── Maternal Health ──────────────────────────────────────────────────────
  {
    id: 'vid_prenatal_care',
    title: 'Prenatal Care: All Three Trimesters',
    description: 'A thorough guide to what happens at your 1st, 2nd, and 3rd trimester check-ups and why each visit matters.',
    category: 'Maternal Health',
    durationSeconds: 501,
    coins: 4,
    thumbnailColor: '#db2777',
    thumbnailIcon: 'rose-outline',
    instructor: 'Level Up RN',
    youtubeId: 'wt9-6VWbfHI',
  },
  {
    id: 'vid_antenatal_what',
    title: 'What is Antenatal Care?',
    description: 'A clear explanation of antenatal visits — what to expect, what is checked, and why early care saves lives.',
    category: 'Maternal Health',
    durationSeconds: 252,
    coins: 3,
    thumbnailColor: '#ec4899',
    thumbnailIcon: 'heart-outline',
    instructor: 'Medical Centric',
    youtubeId: 'vIIcKmKNkk8',
  },
  {
    id: 'vid_postpartum_depression',
    title: 'Baby Blues vs. Postpartum Depression',
    description: 'An ER physician explains the difference between normal post-birth emotional shifts and postpartum depression.',
    category: 'Maternal Health',
    durationSeconds: 142,
    coins: 2,
    thumbnailColor: '#f472b6',
    thumbnailIcon: 'happy-outline',
    instructor: 'Jeff Yoo MD',
    youtubeId: 'roO0PbRlfKU',
  },
  // ── Public Health ─────────────────────────────────────────────────────────
  {
    id: 'vid_what_is_public_health',
    title: 'What is Public Health?',
    description: 'A concise overview of what public health professionals do, why it matters, and how it keeps communities safe.',
    category: 'Public Health',
    durationSeconds: 334,
    coins: 3,
    thumbnailColor: '#0891b2',
    thumbnailIcon: 'earth-outline',
    instructor: "Let's Learn Public Health",
    youtubeId: 't_eWESXTnic',
  },
  {
    id: 'vid_infectious_disease_control',
    title: 'Controlling Infectious Diseases',
    description: 'The basic principles of how public health controls the spread of infectious diseases in a population.',
    category: 'Public Health',
    durationSeconds: 320,
    coins: 3,
    thumbnailColor: '#0e7490',
    thumbnailIcon: 'shield-checkmark-outline',
    instructor: "Let's Learn Public Health",
    youtubeId: '2JWku3Kjpq0',
  },
  {
    id: 'vid_communicable_diseases',
    title: 'Communicable Diseases: What, Why & How',
    description: 'National Institute explains how communicable diseases spread, how to prevent transmission, and what surveillance does.',
    category: 'Public Health',
    durationSeconds: 325,
    coins: 3,
    thumbnailColor: '#0284c7',
    thumbnailIcon: 'bug-outline',
    instructor: 'NICD South Africa',
    youtubeId: 'LBkXQ_mBO3Q',
  },
  // ── Primary Care ──────────────────────────────────────────────────────────
  {
    id: 'vid_primary_care_importance',
    title: 'Why You Need a Primary Care Physician',
    description: 'How having a regular family doctor leads to better long-term health outcomes and earlier disease detection.',
    category: 'Primary Care',
    durationSeconds: 91,
    coins: 2,
    thumbnailColor: '#16a34a',
    thumbnailIcon: 'home-outline',
    instructor: 'Dignity Health',
    youtubeId: 'ZPHLtULjL18',
  },
  {
    id: 'vid_first_primary_visit',
    title: 'How to Prepare for Your First Primary Care Visit',
    description: 'What documents to bring, questions to ask, and what to expect at your first appointment with a new doctor.',
    category: 'Primary Care',
    durationSeconds: 198,
    coins: 3,
    thumbnailColor: '#15803d',
    thumbnailIcon: 'clipboard-outline',
    instructor: 'Dena Goldberg MS CGC',
    youtubeId: 'ilr2WF0EJqw',
  },
  {
    id: 'vid_primary_care_questions',
    title: 'Top 3 Questions to Ask Your Primary Care Doctor',
    description: 'A doctor walks through the three most impactful questions patients should raise at every routine visit.',
    category: 'Primary Care',
    durationSeconds: 587,
    coins: 4,
    thumbnailColor: '#059669',
    thumbnailIcon: 'chatbubble-outline',
    instructor: 'Mighty Health',
    youtubeId: 'BhKU6uqzXFA',
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
  /** Live catalogue fetched from the server (falls back to SEED_VIDEOS). */
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
      return {
        videos: d.videos ?? SEED_VIDEOS,
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
  videos: SEED_VIDEOS,
  dailyCap: DAILY_VIDEO_CAP,
  lastVideoRefreshDate: null,

  initialize: async () => {
    // 1. Restore persisted coins/progress from AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedExploreData = JSON.parse(raw);
        const today = todayStr();
        const dailyWatchedCount = data.lastWatchDate === today ? (data.dailyWatchedCount ?? 0) : 0;
        set({ ...data, dailyWatchedCount });
      }
    } catch { /* ignore */ }

    // 2. Fetch live catalogue + today's server-side rewards
    const remote = await fetchRemote();
    if (remote) {
      const today = todayStr();
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
    } else {
      // Offline — use seed catalogue and local progress
      set({ initialized: true });
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
    set({
      videos: remote.videos,
      dailyCap: remote.dailyCap,
      progress: [...existingProgress, ...serverProgress],
      dailyWatchedCount: remote.rewardedIds.length,
      lastVideoRefreshDate: today,
    });
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
          });
        }

        return { alreadyDone: alreadyClaimed, coinsEarned, capReached };
      }
    } catch { /* fall through to offline path */ }

    // Offline fallback — use local state
    const dailyCount = state.lastWatchDate === today ? state.dailyWatchedCount : 0;
    if (dailyCount >= state.dailyCap) {
      return { alreadyDone: false, coinsEarned: 0, capReached: true };
    }

    const video = state.videos.find((v) => v.id === videoId) ?? SEED_VIDEOS.find((v) => v.id === videoId);
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
    });
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
export function getDailyShuffledVideos(videos: ExploreVideo[] = SEED_VIDEOS): ExploreVideo[] {
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
