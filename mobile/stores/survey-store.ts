import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'survey_store_v1';

// ── Types ────────────────────────────────────────────────────────────────────

// Supported providers: Pollfish · InBrain · BitLabs · Tap Research
export type SurveyProvider = 'Pollfish' | 'InBrain' | 'BitLabs' | 'TapResearch' | null;

export interface Survey {
  id: string;
  title: string;
  description: string;
  category: string;
  coins: number;
  estimatedMinutes: number;
  /** Real external survey URL — loaded in a WebView for the user to complete. */
  surveyUrl: string;
  completedDate: string | null; // YYYY-MM-DD
  // Sponsored fields
  sponsored: boolean;
  provider: SurveyProvider;
  sponsorName: string | null;
  sponsorAccentColor: string | null;
  providerLabel: string | null;
}

// ── Real survey catalogue ─────────────────────────────────────────────────────
//
// Sponsored surveys → real market-research platform respondent portals
// Organic surveys   → real validated clinical / public-health screening tools
//   · Mental Health America (MHA) screenings: gold-standard, free, no login required
//
const SEED_SURVEYS: Omit<Survey, 'completedDate'>[] = [
  // ── Sponsored: Pollfish ─────────────────────────────────────────────────
  {
    id: 'sponsored_pollfish_nutrition',
    title: 'Nutrition & Supplement Habits',
    description: 'Earn Lifecoins sharing your diet and supplement preferences with a leading nutrition brand.',
    category: 'Sponsored Research',
    coins: 5,
    estimatedMinutes: 3,
    surveyUrl: 'https://www.pollfish.com/respondent/',
    sponsored: true,
    provider: 'Pollfish',
    sponsorName: 'NutriBrand',
    sponsorAccentColor: '#f59e0b',
    providerLabel: 'Powered by Pollfish',
  },
  // ── Sponsored: InBrain ──────────────────────────────────────────────────
  {
    id: 'sponsored_inbrain_insurance',
    title: 'Health Insurance Preferences',
    description: 'A healthcare insurer wants to know what matters most to you when choosing cover.',
    category: 'Sponsored Research',
    coins: 7,
    estimatedMinutes: 4,
    surveyUrl: 'https://inbrain.ai/',
    sponsored: true,
    provider: 'InBrain',
    sponsorName: 'CoverHealth',
    sponsorAccentColor: '#0ea5e9',
    providerLabel: 'Powered by InBrain',
  },
  // ── Sponsored: BitLabs ──────────────────────────────────────────────────
  {
    id: 'sponsored_bitlabs_pharma',
    title: 'Medication & Pharmacy Experience',
    description: 'A pharmacy group wants to improve how patients access and refill their medications.',
    category: 'Sponsored Research',
    coins: 4,
    estimatedMinutes: 3,
    surveyUrl: 'https://bitlabs.ai/',
    sponsored: true,
    provider: 'BitLabs',
    sponsorName: 'PharmaCo',
    sponsorAccentColor: '#10b981',
    providerLabel: 'Powered by BitLabs',
  },
  // ── Sponsored: Tap Research ─────────────────────────────────────────────
  {
    id: 'sponsored_tapresearch_wearables',
    title: 'Wearable Health Tech Survey',
    description: 'A leading tech company is researching how people use health wearables and fitness trackers.',
    category: 'Sponsored Research',
    coins: 6,
    estimatedMinutes: 3,
    surveyUrl: 'https://www.tapresearch.com/',
    sponsored: true,
    provider: 'TapResearch',
    sponsorName: 'TechHealth Co.',
    sponsorAccentColor: '#8b5cf6',
    providerLabel: 'Powered by Tap Research',
  },
  // ── Organic: PHQ-9 Depression Screening ────────────────────────────────
  // Mental Health America — gold-standard validated depression screening tool
  {
    id: 'survey_phq9_depression',
    title: 'Depression Screening (PHQ-9)',
    description: 'The Patient Health Questionnaire-9 is the gold-standard clinical depression screen used by doctors worldwide.',
    category: 'Mental Health',
    coins: 3,
    estimatedMinutes: 2,
    surveyUrl: 'https://screening.mhanational.org/screening-tools/depression/',
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
  },
  // ── Organic: GAD-7 Anxiety Screening ───────────────────────────────────
  // Mental Health America — validated Generalised Anxiety Disorder screening
  {
    id: 'survey_gad7_anxiety',
    title: 'Anxiety Screening (GAD-7)',
    description: 'The GAD-7 is a validated 7-question anxiety assessment used by clinicians to measure symptom severity.',
    category: 'Mental Health',
    coins: 3,
    estimatedMinutes: 2,
    surveyUrl: 'https://screening.mhanational.org/screening-tools/anxiety/',
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
  },
  // ── Organic: AUDIT Alcohol Use ──────────────────────────────────────────
  // Mental Health America — WHO-developed alcohol use disorder screen
  {
    id: 'survey_audit_alcohol',
    title: 'Alcohol Use Screening (AUDIT)',
    description: 'The AUDIT questionnaire, developed by the WHO, screens for harmful and hazardous alcohol use.',
    category: 'Health & Wellness',
    coins: 3,
    estimatedMinutes: 3,
    surveyUrl: 'https://screening.mhanational.org/screening-tools/alcohol/',
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
  },
  // ── Organic: General Mental Health Check ───────────────────────────────
  // Mental Health America — overall mental wellness screening hub
  {
    id: 'survey_mha_general',
    title: 'General Mental Health Check',
    description: 'A comprehensive mental wellness check covering mood, sleep, energy, and social wellbeing.',
    category: 'Mental Health',
    coins: 4,
    estimatedMinutes: 4,
    surveyUrl: 'https://screening.mhanational.org/screening-tools/',
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
  },
];

// ── Persisted shape ───────────────────────────────────────────────────────────

interface PersistedSurveyData {
  surveys: Survey[];
  totalCoinsEarned: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface SurveyState extends PersistedSurveyData {
  initialized: boolean;
  initialize: () => Promise<void>;
  completeSurvey: (id: string) => Promise<{ coinsEarned: number }>;
}

async function persist(data: PersistedSurveyData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const useSurveyStore = create<SurveyState>((set, get) => ({
  surveys: SEED_SURVEYS.map((s) => ({ ...s, completedDate: null })),
  totalCoinsEarned: 0,
  initialized: false,

  initialize: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedSurveyData = JSON.parse(raw);
        // Merge persisted completion dates onto seed surveys (handles new surveys added later)
        const surveys = SEED_SURVEYS.map((s) => ({
          ...s,
          completedDate: data.surveys?.find((x) => x.id === s.id)?.completedDate ?? null,
        }));
        set({ surveys, totalCoinsEarned: data.totalCoinsEarned ?? 0, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }
  },

  completeSurvey: async (id: string) => {
    const { surveys, totalCoinsEarned } = get();
    const survey = surveys.find((s) => s.id === id);
    if (!survey || survey.completedDate) return { coinsEarned: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const updatedSurveys = surveys.map((s) =>
      s.id === id ? { ...s, completedDate: today } : s
    );
    const next: PersistedSurveyData = {
      surveys: updatedSurveys,
      totalCoinsEarned: totalCoinsEarned + survey.coins,
    };
    set(next);
    await persist(next);
    return { coinsEarned: survey.coins };
  },
}));
