import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';
import { useLifecoinsWalletStore } from './lifecoins-wallet-store';

const STORAGE_KEY = 'checkin_store_v1';

// ── Slot schedule ────────────────────────────────────────────────────────────
// Each slot unlocks at a specific hour (24-hr). All reward 1 Lifecoin.

export interface HourlySlot {
  id: number;
  label: string;
  unlockHour: number; // 0-23
  coins: number;
  claimedDate: string | null; // YYYY-MM-DD
}

const SLOT_SCHEDULE: Omit<HourlySlot, 'claimedDate'>[] = [
  { id: 1, label: 'Morning',   unlockHour: 6,  coins: 1 },
  { id: 3, label: 'Noon',      unlockHour: 12, coins: 1 },
  { id: 5, label: 'Evening',   unlockHour: 18, coins: 1 },
  { id: 6, label: 'Night',     unlockHour: 21, coins: 1 },
];

// ── Health Check-in Question Types ───────────────────────────────────────────

export type QuestionType = 'scale' | 'choice' | 'yesno';

export interface CheckinQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];             // for 'choice'
  scaleMin?: number;              // for 'scale'
  scaleMax?: number;              // for 'scale'
  scaleLabels?: [string, string]; // [low, high]
}

export interface CheckinAnswer {
  questionId: string;
  value: string | number;
}

// ── Condition → Symptom phrase mapping ───────────────────────────────────────

const CONDITION_SYMPTOM_MAP: [string, string][] = [
  ['malaria',           'fever and chills'],
  ['hypertension',      'headaches or dizziness'],
  ['high blood pressure', 'headaches or dizziness'],
  ['diabetes',          'blood sugar levels and energy'],
  ['pneumonia',         'breathing and chest discomfort'],
  ['typhoid',           'abdominal pain and fever'],
  ['gastroenteritis',   'nausea and stomach discomfort'],
  ['anemia',            'fatigue and weakness'],
  ['sickle cell',       'pain episodes and fatigue'],
  ['asthma',            'breathing and wheezing'],
  ['respiratory',       'congestion and sore throat'],
  ['flu',               'fever, body aches and congestion'],
  ['influenza',         'fever, body aches and congestion'],
  ['covid',             'respiratory symptoms and fatigue'],
  ['urinary',           'pain or discomfort during urination'],
  ['arthritis',         'joint pain and stiffness'],
  ['migraine',          'headache and light sensitivity'],
  ['ulcer',             'stomach pain and discomfort'],
  ['hepatitis',         'abdominal discomfort and fatigue'],
  ['tuberculosis',      'cough and breathing'],
  ['tb',                'cough and breathing'],
];

function getConditionSymptom(condition: string): string {
  const lower = condition.toLowerCase();
  for (const [key, symptom] of CONDITION_SYMPTOM_MAP) {
    if (lower.includes(key)) return symptom;
  }
  return 'your main symptoms';
}

// ── Per-slot question sets ────────────────────────────────────────────────────

export function getSlotQuestions(
  slotId: number,
  condition: string | null,
  hasPrescription: boolean,
): CheckinQuestion[] {
  const symptom = condition ? getConditionSymptom(condition) : 'your symptoms';

  const symptomQ: CheckinQuestion = {
    id: 'symptom',
    text: `How is ${symptom} compared to earlier?`,
    type: 'choice',
    options: ['Much better', 'Slightly better', 'About the same', 'Slightly worse'],
  };

  const medQ: CheckinQuestion = {
    id: 'medication',
    text: 'Have you taken your prescribed medication?',
    type: 'yesno',
  };

  switch (slotId) {
    case 1: { // Morning Boost
      const qs: CheckinQuestion[] = [
        {
          id: 'morning_feeling',
          text: 'How are you feeling this morning?',
          type: 'scale',
          scaleMin: 1, scaleMax: 5,
          scaleLabels: ['Very unwell', 'Feeling great'],
        },
        symptomQ,
      ];
      if (hasPrescription) qs.push({ ...medQ, text: 'Have you taken your morning medication?' });
      return qs;
    }
    case 2: { // Mid-Morning
      return [
        {
          id: 'energy',
          text: 'What is your energy level right now?',
          type: 'scale',
          scaleMin: 1, scaleMax: 5,
          scaleLabels: ['Very low', 'Very high'],
        },
        symptomQ,
        {
          id: 'hydration',
          text: 'Have you eaten or had enough water?',
          type: 'yesno',
        },
      ];
    }
    case 3: { // Noon
      return [
        {
          id: 'noon_health',
          text: 'How would you rate your health at midday?',
          type: 'scale',
          scaleMin: 1, scaleMax: 5,
          scaleLabels: ['Very unwell', 'Feeling well'],
        },
        symptomQ,
        {
          id: 'new_symptoms',
          text: 'Any new or worsening symptoms since this morning?',
          type: 'yesno',
        },
      ];
    }
    case 5: { // Evening
      const qs: CheckinQuestion[] = [
        {
          id: 'day_health',
          text: 'How has your health been today overall?',
          type: 'scale',
          scaleMin: 1, scaleMax: 5,
          scaleLabels: ['Very bad', 'Very good'],
        },
        symptomQ,
      ];
      if (hasPrescription) qs.push({ ...medQ, text: 'Did you take your evening medication?' });
      return qs;
    }
    case 6: { // Night Boost
      const qs: CheckinQuestion[] = [
        {
          id: 'night_progress',
          text: 'Overall symptom progress compared to this morning?',
          type: 'choice',
          options: ['Much improved', 'Slightly improved', 'No change', 'Worsened'],
        },
        {
          id: 'pain',
          text: 'Pain or discomfort level tonight?',
          type: 'scale',
          scaleMin: 1, scaleMax: 5,
          scaleLabels: ['No pain', 'Severe pain'],
        },
      ];
      if (hasPrescription) qs.push({ ...medQ, text: 'Did you take all your medications today?' });
      return qs;
    }
    default:
      return [symptomQ];
  }
}

// ── Persisted state shape ────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PersistedCheckinData {
  lifecoins: number;
  streak: number;
  lastDailyCheckinDate: string | null;
  slots: HourlySlot[];
}

// ── Store ────────────────────────────────────────────────────────────────────

interface CheckinState extends PersistedCheckinData {
  initialized: boolean;
  initialize: () => Promise<void>;
  claimSlot: (id: number) => Promise<{ success: boolean; coinsEarned: number }>;
}

function defaultSlots(): HourlySlot[] {
  return SLOT_SCHEDULE.map((s) => ({ ...s, claimedDate: null }));
}

async function persist(data: PersistedCheckinData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const useCheckinStore = create<CheckinState>((set, get) => ({
  lifecoins: 0,
  streak: 0,
  lastDailyCheckinDate: null,
  slots: defaultSlots(),
  initialized: false,

  initialize: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedCheckinData = JSON.parse(raw);
        // Merge stored slot claim dates onto the fixed schedule
        const slots = SLOT_SCHEDULE.map((s) => ({
          ...s,
          claimedDate: data.slots?.find((x) => x.id === s.id)?.claimedDate ?? null,
        }));
        set({ ...data, slots, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }
  },

  claimSlot: async (id: number) => {
    const { slots, lifecoins, streak, lastDailyCheckinDate } = get();
    const today = todayStr();
    const now = new Date();
    const slot = slots.find((s) => s.id === id);
    if (!slot) return { success: false, coinsEarned: 0 };
    if (slot.claimedDate === today) return { success: false, coinsEarned: 0 };
    if (now.getHours() < slot.unlockHour) return { success: false, coinsEarned: 0 };

    // Maintain streak — advance on first claim of the day
    let newStreak = streak;
    let newLastDate = lastDailyCheckinDate;
    if (lastDailyCheckinDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      newStreak = lastDailyCheckinDate === yesterday ? streak + 1 : 1;
      newLastDate = today;
    }

    const updatedSlots = slots.map((s) =>
      s.id === id ? { ...s, claimedDate: today } : s
    );
    const next: PersistedCheckinData = {
      lifecoins: lifecoins + slot.coins,
      streak: newStreak,
      lastDailyCheckinDate: newLastDate,
      slots: updatedSlots,
    };
    set(next);
    // Persist to AsyncStorage — wrapped so a storage failure never prevents
    // the wallet from being updated (addCoins must always run).
    try { await persist(next); } catch { /* non-fatal */ }

    // Update the wallet store immediately so the profile total reflects the new coins.
    useLifecoinsWalletStore.getState().addCoins('checkin', slot.coins, 'Daily check-in bonus');

    // Persist to backend (best-effort — local state is the source of truth for slot locking).
    api.post('/lifecoins/checkin', { slot_id: id, coins: slot.coins }).catch(() => {});

    return { success: true, coinsEarned: slot.coins };
  },
}));
