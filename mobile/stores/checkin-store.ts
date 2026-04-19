import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'checkin_store_v1';

// ── Slot schedule ────────────────────────────────────────────────────────────
// Each slot unlocks at a specific hour (24-hr). Resets daily at midnight.

export interface HourlySlot {
  id: number;
  label: string;
  unlockHour: number; // 0-23
  coins: number;
  claimedDate: string | null; // YYYY-MM-DD
}

const SLOT_SCHEDULE: Omit<HourlySlot, 'claimedDate'>[] = [
  { id: 1, label: 'Morning Boost',   unlockHour: 6,  coins: 3 },
  { id: 2, label: 'Mid-Morning',     unlockHour: 9,  coins: 3 },
  { id: 3, label: 'Noon Reward',     unlockHour: 12, coins: 3 },
  { id: 4, label: 'Afternoon',       unlockHour: 15, coins: 3 },
  { id: 5, label: 'Evening',         unlockHour: 18, coins: 3 },
  { id: 6, label: 'Night Bonus',     unlockHour: 21, coins: 4 },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Persisted state shape ────────────────────────────────────────────────────

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
  dailyCheckin: () => Promise<{ alreadyDone: boolean; coinsEarned: number }>;
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

  dailyCheckin: async () => {
    const { lifecoins, streak, lastDailyCheckinDate } = get();
    const today = todayStr();
    if (lastDailyCheckinDate === today) {
      return { alreadyDone: true, coinsEarned: 0 };
    }

    // Check streak continuity
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = lastDailyCheckinDate === yesterday ? streak + 1 : 1;
    const coinsEarned = 1 + Math.floor(newStreak / 7); // bonus coin every 7 days

    const next: PersistedCheckinData = {
      lifecoins: lifecoins + coinsEarned,
      streak: newStreak,
      lastDailyCheckinDate: today,
      slots: get().slots,
    };
    set(next);
    await persist(next);
    return { alreadyDone: false, coinsEarned };
  },

  claimSlot: async (id: number) => {
    const { slots, lifecoins } = get();
    const today = todayStr();
    const now = new Date();
    const slot = slots.find((s) => s.id === id);
    if (!slot) return { success: false, coinsEarned: 0 };
    if (slot.claimedDate === today) return { success: false, coinsEarned: 0 };
    if (now.getHours() < slot.unlockHour) return { success: false, coinsEarned: 0 };

    const updatedSlots = slots.map((s) =>
      s.id === id ? { ...s, claimedDate: today } : s
    );
    const next: PersistedCheckinData = {
      lifecoins: lifecoins + slot.coins,
      streak: get().streak,
      lastDailyCheckinDate: get().lastDailyCheckinDate,
      slots: updatedSlots,
    };
    set(next);
    await persist(next);
    return { success: true, coinsEarned: slot.coins };
  },
}));
