import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'survey_store_v1';

// ── Types ────────────────────────────────────────────────────────────────────

export type QuestionType = 'single' | 'multi' | 'scale';

export interface SurveyQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  min?: number;
  max?: number;
}

// ── Sponsored survey provider info ───────────────────────────────────────────
// Supported providers: Pollfish · InBrain · BitLabs · Tap Research
export type SurveyProvider = 'Pollfish' | 'InBrain' | 'BitLabs' | 'TapResearch' | null;

export interface Survey {
  id: string;
  title: string;
  description: string;
  category: string;
  coins: number;
  estimatedMinutes: number;
  questions: SurveyQuestion[];
  completedDate: string | null; // YYYY-MM-DD
  // Sponsored fields
  sponsored: boolean;
  provider: SurveyProvider;
  sponsorName: string | null;      // Brand commissioning the research
  sponsorAccentColor: string | null;
  providerLabel: string | null;    // "Powered by Pollfish" etc.
}

// ── Seed surveys ─────────────────────────────────────────────────────────────

const SEED_SURVEYS: Omit<Survey, 'completedDate'>[] = [
  // ── Sponsored: Pollfish ──────────────────────────────────────────────────
  // Pollfish connects apps to Fortune-500 brand research. API: pollfish.com/docs
  {
    id: 'sponsored_pollfish_nutrition',
    title: 'Nutrition & Supplement Habits',
    description: 'A leading nutrition brand wants to understand your supplement and diet preferences.',
    category: 'Sponsored Research',
    coins: 30,
    estimatedMinutes: 3,
    sponsored: true,
    provider: 'Pollfish',
    sponsorName: 'NutriBrand',
    sponsorAccentColor: '#f59e0b',
    providerLabel: 'Powered by Pollfish',
    questions: [
      {
        id: 'q1',
        text: 'How often do you take dietary supplements (vitamins, minerals, protein)?',
        type: 'single',
        options: ['Daily', 'A few times a week', 'Rarely', 'Never'],
      },
      {
        id: 'q2',
        text: 'Which supplements do you currently take? (Select all)',
        type: 'multi',
        options: ['Multivitamin', 'Vitamin C', 'Omega-3', 'Protein powder', 'Iron', 'None'],
      },
      {
        id: 'q3',
        text: 'Where do you primarily buy supplements?',
        type: 'single',
        options: ['Pharmacy', 'Supermarket', 'Online', 'Health store', 'I don\'t buy them'],
      },
      {
        id: 'q4',
        text: 'How important is the price when choosing a supplement brand?',
        type: 'scale',
        min: 1,
        max: 5,
      },
    ],
  },

  // ── Sponsored: InBrain Surveys ───────────────────────────────────────────
  // InBrain is purpose-built for reward apps. API: inbrain.ai/docs
  {
    id: 'sponsored_inbrain_insurance',
    title: 'Health Insurance Preferences',
    description: 'A healthcare insurer is researching what matters most to patients when choosing cover.',
    category: 'Sponsored Research',
    coins: 40,
    estimatedMinutes: 4,
    sponsored: true,
    provider: 'InBrain',
    sponsorName: 'CoverHealth',
    sponsorAccentColor: '#0ea5e9',
    providerLabel: 'Powered by InBrain',
    questions: [
      {
        id: 'q1',
        text: 'Do you currently have health insurance?',
        type: 'single',
        options: ['Yes, full cover', 'Yes, partial cover', 'No, but I plan to get it', 'No'],
      },
      {
        id: 'q2',
        text: 'What matters most when choosing health insurance? (Select up to 3)',
        type: 'multi',
        options: ['Affordable premiums', 'Broad coverage', 'Fast claims', 'Telemedicine access', 'Family plan', 'Medications covered'],
      },
      {
        id: 'q3',
        text: 'How satisfied are you with your current health cover?',
        type: 'scale',
        min: 1,
        max: 5,
      },
      {
        id: 'q4',
        text: 'Would you switch to a digital-first health insurance app?',
        type: 'single',
        options: ['Definitely yes', 'Possibly', 'Unlikely', 'No'],
      },
    ],
  },

  // ── Sponsored: BitLabs ───────────────────────────────────────────────────
  // BitLabs monetises apps via premium survey inventory. API: bitlabs.ai/docs
  {
    id: 'sponsored_bitlabs_pharma',
    title: 'Medication & Pharmacy Experience',
    description: 'A pharmacy group wants to improve how patients access and refill their medications.',
    category: 'Sponsored Research',
    coins: 25,
    estimatedMinutes: 3,
    sponsored: true,
    provider: 'BitLabs',
    sponsorName: 'PharmaCo',
    sponsorAccentColor: '#10b981',
    providerLabel: 'Powered by BitLabs',
    questions: [
      {
        id: 'q1',
        text: 'How do you usually get your prescription medications?',
        type: 'single',
        options: ['Walk in to pharmacy', 'Home delivery', 'Via a health app', 'Hospital dispensary'],
      },
      {
        id: 'q2',
        text: 'What problems do you face when getting medications? (Select all)',
        type: 'multi',
        options: ['Long wait times', 'Stock-outs', 'High cost', 'Travel distance', 'None'],
      },
      {
        id: 'q3',
        text: 'How likely are you to use a pharmacy delivery service?',
        type: 'scale',
        min: 1,
        max: 5,
      },
      {
        id: 'q4',
        text: 'Would a subscription plan for medications save you money?',
        type: 'single',
        options: ['Yes, definitely', 'Maybe', 'I don\'t take regular medications', 'No'],
      },
    ],
  },

  // ── Sponsored: Tap Research ──────────────────────────────────────────────
  // Tap Research powers surveys in major reward apps. API: tapresearch.com/docs
  {
    id: 'sponsored_tapresearch_wearables',
    title: 'Wearable Health Tech Survey',
    description: 'A leading tech company is researching how people use health wearables and fitness trackers.',
    category: 'Sponsored Research',
    coins: 35,
    estimatedMinutes: 3,
    sponsored: true,
    provider: 'TapResearch',
    sponsorName: 'TechHealth Co.',
    sponsorAccentColor: '#8b5cf6',
    providerLabel: 'Powered by Tap Research',
    questions: [
      {
        id: 'q1',
        text: 'Do you currently use a wearable health device?',
        type: 'single',
        options: ['Yes, daily', 'Yes, occasionally', 'I own one but rarely use it', 'No'],
      },
      {
        id: 'q2',
        text: 'Which features do you value in a health wearable? (Select all)',
        type: 'multi',
        options: ['Heart rate monitoring', 'Sleep tracking', 'Blood oxygen', 'Step counting', 'ECG', 'Stress detection'],
      },
      {
        id: 'q3',
        text: 'How much would you spend on a health wearable?',
        type: 'single',
        options: ['Under $30', '$30–$80', '$80–$150', 'Over $150'],
      },
      {
        id: 'q4',
        text: 'How much has a wearable improved your health awareness?',
        type: 'scale',
        min: 1,
        max: 5,
      },
    ],
  },

  // ── Organic surveys ──────────────────────────────────────────────────────
  {
    id: 'survey_health_habits',
    title: 'Daily Health Habits',
    description: 'Help us understand how people manage their everyday health routines.',
    category: 'Health & Wellness',
    coins: 10,
    estimatedMinutes: 2,
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
    questions: [
      {
        id: 'q1',
        text: 'How many glasses of water do you drink daily?',
        type: 'single',
        options: ['Less than 4', '4–6 glasses', '7–8 glasses', 'More than 8'],
      },
      {
        id: 'q2',
        text: 'How often do you exercise per week?',
        type: 'single',
        options: ['Never', '1–2 times', '3–4 times', '5+ times'],
      },
      {
        id: 'q3',
        text: 'Which of these apply to your diet? (Select all)',
        type: 'multi',
        options: ['High in vegetables', 'Low sugar', 'High protein', 'Plant-based', 'No restrictions'],
      },
      {
        id: 'q4',
        text: 'Rate your overall energy levels this week.',
        type: 'scale',
        min: 1,
        max: 5,
      },
    ],
  },
  {
    id: 'survey_mental_wellbeing',
    title: 'Mental Wellbeing Check',
    description: 'Share your stress and mental health experience to improve care resources.',
    category: 'Mental Health',
    coins: 15,
    estimatedMinutes: 3,
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
    questions: [
      {
        id: 'q1',
        text: 'How often do you feel stressed in a typical week?',
        type: 'single',
        options: ['Rarely', 'Sometimes', 'Often', 'Almost always'],
      },
      {
        id: 'q2',
        text: 'Which activities help you relax? (Select all)',
        type: 'multi',
        options: ['Exercise', 'Meditation', 'Reading', 'Music', 'Talking to someone', 'Sleep'],
      },
      {
        id: 'q3',
        text: 'How would you rate your sleep quality this month?',
        type: 'scale',
        min: 1,
        max: 5,
      },
      {
        id: 'q4',
        text: 'Have you spoken to a health professional about mental health?',
        type: 'single',
        options: ['Yes, recently', 'Yes, in the past', 'No, but I would like to', 'No'],
      },
    ],
  },
  {
    id: 'survey_healthcare_access',
    title: 'Healthcare Access',
    description: 'Your experience accessing healthcare helps shape better services for everyone.',
    category: 'Research',
    coins: 20,
    estimatedMinutes: 4,
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
    questions: [
      {
        id: 'q1',
        text: 'How far is the nearest health facility from your home?',
        type: 'single',
        options: ['Under 1 km', '1–5 km', '5–15 km', 'Over 15 km'],
      },
      {
        id: 'q2',
        text: 'What barriers prevent you from accessing healthcare? (Select all)',
        type: 'multi',
        options: ['Cost', 'Distance', 'Long wait times', 'Lack of trust', 'No barriers', 'Other'],
      },
      {
        id: 'q3',
        text: 'How satisfied are you with healthcare services in your area?',
        type: 'scale',
        min: 1,
        max: 5,
      },
      {
        id: 'q4',
        text: 'Do you prefer in-person or telemedicine consultations?',
        type: 'single',
        options: ['In-person only', 'Telemedicine only', 'Both equally', 'No preference'],
      },
    ],
  },
  {
    id: 'survey_app_feedback',
    title: 'App Experience Feedback',
    description: 'Tell us about your experience using this app so we can improve it for you.',
    category: 'Product',
    coins: 8,
    estimatedMinutes: 2,
    sponsored: false,
    provider: null,
    sponsorName: null,
    sponsorAccentColor: null,
    providerLabel: null,
    questions: [
      {
        id: 'q1',
        text: 'Which features do you use most? (Select all)',
        type: 'multi',
        options: ['AI Diagnosis', 'Health Timeline', 'Vision Test', 'Hearing Test', 'Check-ins', 'Alerts'],
      },
      {
        id: 'q2',
        text: 'How easy is the app to use overall?',
        type: 'scale',
        min: 1,
        max: 5,
      },
      {
        id: 'q3',
        text: 'How likely are you to recommend this app to a friend?',
        type: 'scale',
        min: 1,
        max: 10,
      },
      {
        id: 'q4',
        text: 'What would most improve your experience?',
        type: 'single',
        options: ['Faster results', 'More features', 'Better design', 'More doctors', 'Lower prices'],
      },
    ],
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
