import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'offers_store_v1';

// ── Types ──────────────────────────────────────────────────────────────────

export type OfferType = 'app_download' | 'product_trial' | 'signup';
export type OfferStatus = 'available' | 'pending' | 'completed' | 'expired';

export interface Offer {
  id: string;
  title: string;
  description: string;
  type: OfferType;
  coins: number;
  sponsor: string;
  sponsorColor: string;
  sponsorLogo: string;
  expiresAt: string;
  ctaLabel: string;
  actionUrl: string;        // real URL to open when the CTA is tapped
  status: OfferStatus;
  completedDate: string | null;
  // ISO timestamp when this offer entered 'pending' state — used for fraud check.
  pendingStartedAt: string | null;
}

// ── Seed offers ─────────────────────────────────────────────────────────────

const SEED_OFFERS: Omit<Offer, 'status' | 'completedDate' | 'pendingStartedAt'>[] = [
  // ── App Downloads ──────────────────────────────────────────────────────
  {
    id: 'offer_app_medisafe',
    title: 'Download Medisafe Pill Reminder',
    description: 'Install Medisafe — the #1 medication management app — and set up your first reminder.',
    type: 'app_download',
    coins: 5,
    sponsor: 'Medisafe',
    sponsorColor: '#0ea5e9',
    sponsorLogo: 'medkit-outline',
    expiresAt: '2026-07-31',
    ctaLabel: 'Download App',
    actionUrl: 'https://www.medisafe.com/download/',
  },
  {
    id: 'offer_app_myfitnesspal',
    title: 'Try MyFitnessPal Free',
    description: 'Download MyFitnessPal and log your first meal or workout to start your health journey.',
    type: 'app_download',
    coins: 4,
    sponsor: 'MyFitnessPal',
    sponsorColor: '#10b981',
    sponsorLogo: 'barbell-outline',
    expiresAt: '2026-06-30',
    ctaLabel: 'Download App',
    actionUrl: 'https://www.myfitnesspal.com/account/create_account',
  },
  {
    id: 'offer_app_headspace',
    title: 'Install Headspace Meditation',
    description: 'Download Headspace and complete your first guided meditation session for free.',
    type: 'app_download',
    coins: 3,
    sponsor: 'Headspace',
    sponsorColor: '#f97316',
    sponsorLogo: 'leaf-outline',
    expiresAt: '2026-07-01',
    ctaLabel: 'Download App',
    actionUrl: 'https://www.headspace.com/',
  },
  // ── Product Trials ────────────────────────────────────────────────────
  {
    id: 'offer_trial_hims',
    title: 'Try Hims Wellness — Free Intro Kit',
    description: 'Get a free personalised wellness intro kit from Hims. Just cover shipping.',
    type: 'product_trial',
    coins: 6,
    sponsor: 'Hims',
    sponsorColor: '#a3e635',
    sponsorLogo: 'flask-outline',
    expiresAt: '2026-06-15',
    ctaLabel: 'Claim Free Kit',
    actionUrl: 'https://www.forhims.com/',
  },
  {
    id: 'offer_trial_noom',
    title: 'Try Noom Free for 14 Days',
    description: 'Start a free 2-week trial of Noom — the psychology-based weight-loss and health app.',
    type: 'product_trial',
    coins: 5,
    sponsor: 'Noom',
    sponsorColor: '#ef4444',
    sponsorLogo: 'pulse-outline',
    expiresAt: '2026-06-30',
    ctaLabel: 'Start Free Trial',
    actionUrl: 'https://www.noom.com/signup/',
  },
  // ── Service Sign-ups ──────────────────────────────────────────────────
  {
    id: 'offer_signup_zocdoc',
    title: 'Book a Doctor on Zocdoc – Free',
    description: 'Create a free Zocdoc account and book your first in-person or telehealth appointment.',
    type: 'signup',
    coins: 7,
    sponsor: 'Zocdoc',
    sponsorColor: '#0284c7',
    sponsorLogo: 'videocam-outline',
    expiresAt: '2026-08-01',
    ctaLabel: 'Book a Doctor',
    actionUrl: 'https://www.zocdoc.com/',
  },
  {
    id: 'offer_signup_23andme',
    title: 'Sign Up for 23andMe Health Reports',
    description: 'Create a free account on 23andMe and explore your personalised health and ancestry reports.',
    type: 'signup',
    coins: 4,
    sponsor: '23andMe',
    sponsorColor: '#7c3aed',
    sponsorLogo: 'folder-open-outline',
    expiresAt: '2026-07-31',
    ctaLabel: 'Get Started Free',
    actionUrl: 'https://www.23andme.com/',
  },
  {
    id: 'offer_signup_capsule',
    title: 'Sign Up for Capsule Pharmacy',
    description: 'Register on Capsule and get your first prescription delivered free to your door.',
    type: 'signup',
    coins: 6,
    sponsor: 'Capsule',
    sponsorColor: '#059669',
    sponsorLogo: 'home-outline',
    expiresAt: '2026-06-10',
    ctaLabel: 'Register Free',
    actionUrl: 'https://www.capsulecares.com/',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildSeeds(): Offer[] {
  const today = todayStr();
  return SEED_OFFERS.map((o) => ({
    ...o,
    status: o.expiresAt < today ? 'expired' : 'available',
    completedDate: null,
    pendingStartedAt: null,
  }));
}

// ── Persisted shape ──────────────────────────────────────────────────────────

interface PersistedOffersData {
  lifecoins: number;
  totalEarned: number;
  offers: Offer[];
}

// ── Store ────────────────────────────────────────────────────────────────────

interface OffersState extends PersistedOffersData {
  initialized: boolean;
  initialize: () => Promise<void>;
  startOffer: (id: string) => void;                    // mark pending
  completeOffer: (id: string) => Promise<{ alreadyDone: boolean; coinsEarned: number }>;
}

async function persist(data: PersistedOffersData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const useOffersStore = create<OffersState>((set, get) => ({
  lifecoins: 0,
  totalEarned: 0,
  offers: buildSeeds(),
  initialized: false,

  initialize: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: PersistedOffersData = JSON.parse(raw);
        // Merge persisted statuses onto fresh seed (handles newly added offers)
        const today = todayStr();
        const offers = buildSeeds().map((seed) => {
          const saved = data.offers?.find((o) => o.id === seed.id);
          if (!saved) return seed;
          // If persisted as completed, keep it; else refresh expiry status
          if (saved.status === 'completed') return { ...seed, status: 'completed' as OfferStatus, completedDate: saved.completedDate, pendingStartedAt: saved.pendingStartedAt ?? null };
          return { ...seed, status: seed.expiresAt < today ? ('expired' as OfferStatus) : saved.status, pendingStartedAt: saved.pendingStartedAt ?? null };
        });
        set({ ...data, offers, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }
  },

  startOffer: (id) => {
    const { offers, lifecoins, totalEarned } = get();
    const offer = offers.find((o) => o.id === id);
    if (!offer || offer.status !== 'available') return;
    const updated = offers.map((o) =>
      o.id === id
        ? { ...o, status: 'pending' as OfferStatus, pendingStartedAt: new Date().toISOString() }
        : o,
    );
    set({ offers: updated });
    persist({ lifecoins, totalEarned, offers: updated });
  },

  completeOffer: async (id) => {
    const { offers, lifecoins, totalEarned } = get();
    const offer = offers.find((o) => o.id === id);
    if (!offer) return { alreadyDone: false, coinsEarned: 0 };
    if (offer.status === 'completed') return { alreadyDone: true, coinsEarned: 0 };

    // Anti-fraud: require the offer to have been in 'pending' state for at
    // least 30 seconds before coins can be claimed.
    if (offer.status !== 'pending' || !offer.pendingStartedAt) {
      return { alreadyDone: false, coinsEarned: 0 };
    }
    const elapsed = (Date.now() - new Date(offer.pendingStartedAt).getTime()) / 1000;
    if (elapsed < 30) {
      return { alreadyDone: false, coinsEarned: 0 };
    }

    const updated = offers.map((o) =>
      o.id === id
        ? { ...o, status: 'completed' as OfferStatus, completedDate: todayStr() }
        : o,
    );
    const newCoins = lifecoins + offer.coins;
    const newEarned = totalEarned + offer.coins;
    set({ offers: updated, lifecoins: newCoins, totalEarned: newEarned });
    await persist({ lifecoins: newCoins, totalEarned: newEarned, offers: updated });
    return { alreadyDone: false, coinsEarned: offer.coins };
  },
}));
