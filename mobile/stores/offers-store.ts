import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'offers_store_v1';

// ── Types ──────────────────────────────────────────────────────────────────

export type OfferType = 'app_download' | 'product_trial' | 'signup' | 'referral_signup';
export type OfferStatus = 'available' | 'pending' | 'completed' | 'expired';

export interface Offer {
  id: string;
  title: string;
  description: string;
  type: OfferType;
  coins: number;
  sponsor: string;
  sponsorColor: string;     // accent colour for card
  sponsorLogo: string;      // Ionicons icon name used as placeholder
  expiresAt: string;        // ISO date string
  ctaLabel: string;         // Button label e.g. "Download Now"
  status: OfferStatus;
  completedDate: string | null;
}

// ── Seed offers ─────────────────────────────────────────────────────────────

const SEED_OFFERS: Omit<Offer, 'status' | 'completedDate'>[] = [
  // ── App Downloads ──────────────────────────────────────────────────────
  {
    id: 'offer_app_pillreminder',
    title: 'Download MyPill Reminder',
    description: 'Install MyPill and set your first medication reminder to earn Lifecoins.',
    type: 'app_download',
    coins: 50,
    sponsor: 'MyPill',
    sponsorColor: '#0ea5e9',
    sponsorLogo: 'medkit-outline',
    expiresAt: '2026-05-31',
    ctaLabel: 'Download App',
  },
  {
    id: 'offer_app_fittrack',
    title: 'Try FitTrack Fitness App',
    description: 'Download FitTrack and log your first workout. Earn Lifecoins for staying active.',
    type: 'app_download',
    coins: 40,
    sponsor: 'FitTrack',
    sponsorColor: '#10b981',
    sponsorLogo: 'barbell-outline',
    expiresAt: '2026-05-15',
    ctaLabel: 'Download App',
  },
  {
    id: 'offer_app_mindful',
    title: 'Install MindEase Meditation',
    description: 'Download MindEase and complete your first guided meditation session.',
    type: 'app_download',
    coins: 35,
    sponsor: 'MindEase',
    sponsorColor: '#8b5cf6',
    sponsorLogo: 'leaf-outline',
    expiresAt: '2026-06-01',
    ctaLabel: 'Download App',
  },
  // ── Product Trials ────────────────────────────────────────────────────
  {
    id: 'offer_trial_vitapack',
    title: 'Order a Free VitaPack Sample',
    description: 'Request a free vitamin supplement sample from VitaPack. Just cover shipping.',
    type: 'product_trial',
    coins: 60,
    sponsor: 'VitaPack',
    sponsorColor: '#f59e0b',
    sponsorLogo: 'flask-outline',
    expiresAt: '2026-04-30',
    ctaLabel: 'Claim Free Sample',
  },
  {
    id: 'offer_trial_glucocheck',
    title: 'Try GlucoCheck Free for 14 Days',
    description: 'Sign up for a free trial of GlucoCheck, the smart blood glucose monitoring app.',
    type: 'product_trial',
    coins: 55,
    sponsor: 'GlucoCheck',
    sponsorColor: '#ef4444',
    sponsorLogo: 'pulse-outline',
    expiresAt: '2026-05-20',
    ctaLabel: 'Start Free Trial',
  },
  // ── Service Sign-ups ──────────────────────────────────────────────────
  {
    id: 'offer_signup_telemedicine',
    title: 'Sign Up for QuickDoc Telemedicine',
    description: 'Create a free account on QuickDoc and book your first online consultation to earn Lifecoins.',
    type: 'signup',
    coins: 75,
    sponsor: 'QuickDoc',
    sponsorColor: '#0284c7',
    sponsorLogo: 'videocam-outline',
    expiresAt: '2026-06-15',
    ctaLabel: 'Create Free Account',
  },
  {
    id: 'offer_signup_healthvault',
    title: 'Join HealthVault Records',
    description: 'Create your secure digital health records account on HealthVault.',
    type: 'signup',
    coins: 45,
    sponsor: 'HealthVault',
    sponsorColor: '#059669',
    sponsorLogo: 'folder-open-outline',
    expiresAt: '2026-05-31',
    ctaLabel: 'Sign Up Free',
  },
  {
    id: 'offer_signup_pharmadoor',
    title: 'Register on PharmaDoor',
    description: 'Sign up to PharmaDoor and place your first prescription order for home delivery.',
    type: 'signup',
    coins: 65,
    sponsor: 'PharmaDoor',
    sponsorColor: '#7c3aed',
    sponsorLogo: 'home-outline',
    expiresAt: '2026-05-10',
    ctaLabel: 'Register Now',
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
          if (saved.status === 'completed') return { ...seed, status: 'completed' as OfferStatus, completedDate: saved.completedDate };
          return { ...seed, status: seed.expiresAt < today ? ('expired' as OfferStatus) : saved.status };
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
    const updated = offers.map((o) => (o.id === id ? { ...o, status: 'pending' as OfferStatus } : o));
    set({ offers: updated });
    persist({ lifecoins, totalEarned, offers: updated });
  },

  completeOffer: async (id) => {
    const { offers, lifecoins, totalEarned } = get();
    const offer = offers.find((o) => o.id === id);
    if (!offer) return { alreadyDone: false, coinsEarned: 0 };
    if (offer.status === 'completed') return { alreadyDone: true, coinsEarned: 0 };

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
