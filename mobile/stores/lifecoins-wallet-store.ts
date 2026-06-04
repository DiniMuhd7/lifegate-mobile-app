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

// All AsyncStorage keys owned by coin-earning stores — used by resetAllCoins.
export const ALL_COIN_STORAGE_KEYS = [
  STORAGE_KEY,
  'checkin_store_v1',
  'explore_store_v5',
  'survey_store_v1',
  'offers_store_v1',
] as const;

// ── Naira conversion ──────────────────────────────────────────────────────────
// Fetched from backend on hydration; falls back to local default while offline.
export const DEFAULT_NAIRA_PER_COIN = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TxSource =
  | 'checkin'
  | 'survey'
  | 'offer'
  | 'explore'
  | 'referral'
  | 'redeem'
  | 'ad_reward';

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

  /** DEV-only: wipe all coin state from memory and AsyncStorage across all coin stores. */
  resetAllCoins: () => Promise<void>;
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
    // Snapshot the current in-memory balance BEFORE we potentially overwrite it
    // with the AsyncStorage cache. addCoins() updates the store synchronously but
    // persists to AsyncStorage asynchronously, so if syncFromBackend runs before
    // the persist completes the storage snapshot will be stale. Keeping this
    // snapshot lets us use Math.max(inMemory, cached, server) during reconciliation.
    const inMemoryBalance  = get().balance;
    const inMemoryEarned   = get().totalEarned;

    // Load persisted data first so the UI has something to show immediately.
    let cached: PersistedWalletData | null = null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        cached = JSON.parse(raw) as PersistedWalletData;
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
        const { balance: serverBalance, totalEarned: serverEarned, nairaPerCoin } = balRes.data.data;
        const serverTxs = txRes.data.data ?? [];

        // If the local balance is HIGHER than the server balance it means locally-
        // earned coins haven't been persisted to the backend yet (network lag or
        // fire-and-forget race). Compare all three sources — in-memory (most current),
        // AsyncStorage cache, and server — and keep the highest to avoid jumps.
        const localBalance  = Math.max(inMemoryBalance,  cached?.balance    ?? 0);
        const localEarned   = Math.max(inMemoryEarned,   cached?.totalEarned ?? 0);
        const reconciledBalance  = Math.max(localBalance,  serverBalance);
        const reconciledEarned   = Math.max(localEarned,   serverEarned);

        // Merge: server transactions are authoritative; preserve any local-only
        // entries (those with id starting "local-") that don't have a server copy yet.
        const serverIds = new Set(serverTxs.map((t) => t.id));
        const localOnly = (cached?.transactions ?? []).filter(
          (t) => t.id.startsWith('local-') && !serverIds.has(t.id),
        );
        const mergedTxs = [...localOnly, ...serverTxs].slice(0, 200);

        const next: PersistedWalletData = {
          balance: reconciledBalance,
          totalEarned: reconciledEarned,
          nairaPerCoin,
          transactions: mergedTxs,
        };
        // Any addCoins calls that arrived while the async API calls were in-flight
        // will have updated the in-memory store; take the max to not lose them.
        const liveBalance = get().balance;
        const liveEarned  = get().totalEarned;
        next.balance     = Math.max(next.balance, liveBalance);
        next.totalEarned = Math.max(next.totalEarned, liveEarned);
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

  resetAllCoins: async () => {
    // Clear all coin-related AsyncStorage keys across every contributing store.
    await AsyncStorage.multiRemove([...ALL_COIN_STORAGE_KEYS]);
    // Reset this store's in-memory state.
    set({
      balance: 0,
      totalEarned: 0,
      nairaPerCoin: DEFAULT_NAIRA_PER_COIN,
      transactions: [],
      loading: false,
      synced: false,
    });
  },
}));
