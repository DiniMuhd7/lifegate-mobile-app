/**
 * Unified Lifecoins wallet store.
 *
 * Aggregates earned coins from all four activity stores:
 *   checkin-store · offers-store · explore-store · survey-store
 *
 * Also communicates with the backend for balance reads, coin earning,
 * and the health-insurance-waiver redemption flow.
 *
 * The local balance is treated as authoritative while offline and is
 * reconciled against the backend whenever the user is online.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from 'services/api';

const STORAGE_KEY = 'lifecoins_wallet_v1';

// ── Naira conversion ──────────────────────────────────────────────────────────
// Fetched from backend on hydration; falls back to local default while offline.
export const DEFAULT_NAIRA_PER_COIN = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TxSource =
  | 'checkin'
  | 'survey'
  | 'offer'
  | 'explore'
  | 'referral'
  | 'redeem';

export type TxType = 'earn' | 'redeem';

export interface LifecoinTx {
  id: string;
  type: TxType;
  source: TxSource;
  coins: number;
  nairaAmount: number;
  description: string;
  healthFirmName?: string;
  accountNumber?: string;
  bankName?: string;
  transferStatus: 'pending' | 'processing' | 'success' | 'failed' | 'pending_approval' | 'rejected';
  adminNote?: string;
  createdAt: string;
}

export interface RedeemPayload {
  coins: number;
  healthFirmName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
}

// ── Persisted shape ───────────────────────────────────────────────────────────

interface PersistedWalletData {
  balance: number;
  totalEarned: number;
  nairaPerCoin: number;
  transactions: LifecoinTx[];
}

// ── Store interface ───────────────────────────────────────────────────────────

interface LifecoinsWalletState extends PersistedWalletData {
  loading: boolean;
  synced: boolean;

  /** Pull latest balance + transactions from the backend. */
  syncFromBackend: () => Promise<void>;

  /** Add coins locally (used by activity stores after a successful earn action). */
  addCoins: (source: TxSource, coins: number, description: string) => void;

  /** Initiate health-insurance-waiver redemption. */
  redeemCoins: (payload: RedeemPayload) => Promise<{ success: boolean; message: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function persist(data: PersistedWalletData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function localTxId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLifecoinsWalletStore = create<LifecoinsWalletState>((set, get) => ({
  balance: 0,
  totalEarned: 0,
  nairaPerCoin: DEFAULT_NAIRA_PER_COIN,
  transactions: [],
  loading: false,
  synced: false,

  syncFromBackend: async () => {
    // Load persisted data first so the UI has something to show immediately.
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached: PersistedWalletData = JSON.parse(raw);
        set({ ...cached });
      }
    } catch {
      // ignore
    }

    set({ loading: true });
    try {
      const [balRes, txRes] = await Promise.all([
        api.get<{ success: boolean; data: { balance: number; totalEarned: number; nairaPerCoin: number } }>(
          '/lifecoins/balance',
        ),
        api.get<{ success: boolean; data: LifecoinTx[] }>('/lifecoins/transactions?limit=50'),
      ]);

      if (balRes.data.success && txRes.data.success) {
        const { balance, totalEarned, nairaPerCoin } = balRes.data.data;
        const transactions = txRes.data.data ?? [];
        const next: PersistedWalletData = { balance, totalEarned, nairaPerCoin, transactions };
        set({ ...next, loading: false, synced: true });
        await persist(next);
      } else {
        set({ loading: false });
      }
    } catch {
      // Network error — UI uses cached data.
      set({ loading: false });
    }
  },

  addCoins: (source, coins, description) => {
    if (coins <= 0) return;
    const { balance, totalEarned, nairaPerCoin, transactions } = get();
    const newTx: LifecoinTx = {
      id: localTxId(),
      type: 'earn',
      source,
      coins,
      nairaAmount: coins * nairaPerCoin,
      description,
      transferStatus: 'success',
      createdAt: new Date().toISOString(),
    };
    const next: PersistedWalletData = {
      balance: balance + coins,
      totalEarned: totalEarned + coins,
      nairaPerCoin,
      transactions: [newTx, ...transactions].slice(0, 200),
    };
    set(next);
    persist(next).catch(() => {});
  },

  redeemCoins: async (payload) => {
    const { balance, totalEarned, nairaPerCoin, transactions } = get();
    if (balance < payload.coins) {
      return { success: false, message: `Insufficient balance: you have ${balance} Lifecoins` };
    }

    // Optimistically deduct.
    const nairaAmount = payload.coins * nairaPerCoin;
    const pendingTx: LifecoinTx = {
      id: localTxId(),
      type: 'redeem',
      source: 'redeem',
      coins: payload.coins,
      nairaAmount,
      description: `Health waiver — ${payload.healthFirmName}`,
      healthFirmName: payload.healthFirmName,
      accountNumber: payload.accountNumber,
      bankName: payload.bankName,
      transferStatus: 'processing',
      createdAt: new Date().toISOString(),
    };
    const optimistic: PersistedWalletData = {
      balance: balance - payload.coins,
      totalEarned,
      nairaPerCoin,
      transactions: [pendingTx, ...transactions].slice(0, 200),
    };
    set(optimistic);
    await persist(optimistic);

    try {
      const res = await api.post<{ success: boolean; message: string; data: LifecoinTx }>(
        '/lifecoins/redeem',
        payload,
      );
      if (res.data.success) {
        // Update pending tx with server id + status.
        const serverTx = res.data.data;
        const { transactions: current } = get();
        const updated = current.map((t) =>
          t.id === pendingTx.id ? { ...serverTx } : t,
        );
        set({ transactions: updated });
        await persist({ ...get(), transactions: updated });
        return { success: true, message: res.data.message };
      } else {
        // Revert optimistic deduction.
        set({ balance, transactions });
        await persist({ balance, totalEarned, nairaPerCoin, transactions });
        return { success: false, message: res.data.message };
      }
    } catch (err: unknown) {
      // Revert.
      set({ balance, transactions });
      await persist({ balance, totalEarned, nairaPerCoin, transactions });
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Network error. Please try again.';
      return { success: false, message };
    }
  },
}));
