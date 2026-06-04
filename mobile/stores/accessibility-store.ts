import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'lifegate:accessibility-settings';

export type AccessibilityPreferences = {
  largerText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
};

type AccessibilityStore = AccessibilityPreferences & {
  initialized: boolean;
  initialize: () => Promise<void>;
  setLargerText: (value: boolean) => Promise<void>;
  setHighContrast: (value: boolean) => Promise<void>;
  setReduceMotion: (value: boolean) => Promise<void>;
  resetPreferences: () => Promise<void>;
};

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  largerText: false,
  highContrast: false,
  reduceMotion: true,
};

function getPersistedPreferences(state: AccessibilityPreferences): AccessibilityPreferences {
  return {
    largerText: state.largerText,
    highContrast: state.highContrast,
    reduceMotion: state.reduceMotion,
  };
}

async function persistPreferences(preferences: AccessibilityPreferences) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export const useAccessibilityStore = create<AccessibilityStore>((set, get) => ({
  ...DEFAULT_PREFERENCES,
  initialized: false,

  initialize: async () => {
    if (get().initialized) {
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ initialized: true });
        return;
      }

      const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>;
      set({
        largerText: parsed.largerText ?? DEFAULT_PREFERENCES.largerText,
        highContrast: parsed.highContrast ?? DEFAULT_PREFERENCES.highContrast,
        reduceMotion: parsed.reduceMotion ?? DEFAULT_PREFERENCES.reduceMotion,
        initialized: true,
      });
    } catch {
      set({ initialized: true });
    }
  },

  setLargerText: async (value) => {
    set({ largerText: value, initialized: true });
    await persistPreferences({ ...getPersistedPreferences(get()), largerText: value });
  },

  setHighContrast: async (value) => {
    set({ highContrast: value, initialized: true });
    await persistPreferences({ ...getPersistedPreferences(get()), highContrast: value });
  },

  setReduceMotion: async (value) => {
    set({ reduceMotion: value, initialized: true });
    await persistPreferences({ ...getPersistedPreferences(get()), reduceMotion: value });
  },

  resetPreferences: async () => {
    set({ ...DEFAULT_PREFERENCES, initialized: true });
    await persistPreferences(DEFAULT_PREFERENCES);
  },
}));