/**
 * Lifecoins Redemption Screen — Redesigned
 *
 * Two-tab layout:
 *   Redeem  — progressive form (recipient → amount → confirm)
 *   History — filterable transaction log (All / Earned / Redeemed)
 *
 * Key UX decisions:
 *   • Hero header surfaces balance + Naira value at a glance
 *   • History is a peer tab, not buried below the form
 *   • Bank picker is a bottom-sheet Modal with search
 *   • Live conversion ticker updates as the user types
 *   • Sticky CTA floats above the keyboard, always reachable
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Animated,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCheckinStore } from 'stores/checkin-store';
import { useExploreStore } from 'stores/explore-store';
import { useReferralStore } from 'stores/referral-store';
import {
  useLifecoinsWalletStore,
  DEFAULT_NAIRA_PER_COIN,
  LifecoinTx,
} from 'stores/lifecoins-wallet-store';

// ── Minimum redemption threshold ──────────────────────────────────────────────
const MIN_COINS = 100;

// ── Nigerian banks (common codes) ─────────────────────────────────────────────
const NIGERIAN_BANKS: { label: string; code: string }[] = [
  { label: 'Access Bank',           code: '044' },
  { label: 'First Bank of Nigeria', code: '011' },
  { label: 'Guaranty Trust Bank',   code: '058' },
  { label: 'United Bank for Africa',code: '033' },
  { label: 'Zenith Bank',           code: '057' },
  { label: 'Sterling Bank',         code: '232' },
  { label: 'Fidelity Bank',         code: '070' },
  { label: 'Union Bank',            code: '032' },
  { label: 'Stanbic IBTC Bank',     code: '221' },
  { label: 'Ecobank Nigeria',       code: '050' },
  { label: 'Heritage Bank',         code: '030' },
  { label: 'Polaris Bank',          code: '076' },
  { label: 'Wema Bank',             code: '035' },
  { label: 'Titan Trust Bank',      code: '102' },
  { label: 'Providus Bank',         code: '101' },
];

function formatNaira(n: number): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  success:          { color: '#16a34a', bg: '#dcfce7', label: 'Paid',          icon: 'checkmark-circle' },
  failed:           { color: '#dc2626', bg: '#fee2e2', label: 'Failed',        icon: 'close-circle' },
  pending_approval: { color: '#d97706', bg: '#fef3c7', label: 'Under Review',  icon: 'time' },
  rejected:         { color: '#dc2626', bg: '#fee2e2', label: 'Rejected',      icon: 'close-circle' },
  processing:       { color: '#2563eb', bg: '#dbeafe', label: 'Processing',    icon: 'sync-circle' },
  pending:          { color: '#6b7280', bg: '#f3f4f6', label: 'Pending',       icon: 'ellipsis-horizontal-circle' },
};

// ── Source labels ─────────────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = {
  checkin:  'Health Check-in',
  explore:  'Explore Video',
  referral: 'Referral Bonus',
  survey:   'Health Survey',
  offer:    'Special Offer',
  redeem:   'Redemption',
};

// ── Transaction card ──────────────────────────────────────────────────────────

function TxCard({ tx }: { tx: LifecoinTx }) {
  const isEarn = tx.type === 'earn';
  const cfg = STATUS_CONFIG[tx.transferStatus ?? ''] ?? { color: '#6b7280', bg: '#f3f4f6', label: tx.transferStatus ?? '', icon: 'help-circle' };
  return (
    <View style={{
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#F1F5F9',
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: isEarn ? '#dcfce7' : '#fef3c7',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Ionicons
            name={(isEarn ? 'add-circle' : 'arrow-redo-circle') as any}
            size={24}
            color={isEarn ? '#16a34a' : '#d97706'}
          />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {SOURCE_LABEL[tx.source] ?? tx.description}
          </Text>
          {tx.healthFirmName ? (
            <Text style={{ fontSize: 11, color: '#6b7280' }}>→ {tx.healthFirmName}</Text>
          ) : null}
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(tx.createdAt)}</Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: isEarn ? '#16a34a' : '#d97706' }}>
            {isEarn ? '+' : '−'}{tx.coins} LC
          </Text>
          {!isEarn && (
            <View style={{ backgroundColor: cfg.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
            </View>
          )}
        </View>
      </View>

      {tx.transferStatus === 'rejected' && tx.adminNote ? (
        <View style={{ marginTop: 10, backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 6 }}>
          <Ionicons name="alert-circle-outline" size={13} color="#b91c1c" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 11, color: '#991b1b' }}>Reason: {tx.adminNote}</Text>
        </View>
      ) : null}
      {tx.transferStatus === 'pending_approval' ? (
        <View style={{ marginTop: 10, backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 6 }}>
          <Ionicons name="time-outline" size={13} color="#92400e" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 11, color: '#92400e' }}>Awaiting admin review — usually within 24 hours.</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Labelled field wrapper ────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

// ── Preview key-value row ─────────────────────────────────────────────────────
function PreviewRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text style={{ fontSize: 13, color: '#92400E' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: accent ? '900' : '700', color: accent ? '#B45309' : '#78350F' }}>
        {value}
      </Text>
    </View>
  );
}

// ── Tab pill ──────────────────────────────────────────────────────────────────
function TabPill({ label, active, onPress, badge }: {
  label: string; active: boolean; onPress: () => void; badge?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flex: 1, paddingVertical: 10, borderRadius: 12,
        backgroundColor: active ? '#F59E0B' : 'transparent',
        alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '800', color: active ? '#fff' : 'rgba(255,255,255,0.55)' }}>
        {label}
      </Text>
      {badge !== undefined && badge > 0 && (
        <View style={{
          backgroundColor: active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)',
          borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        backgroundColor: active ? '#111827' : '#F3F4F6',
        borderWidth: active ? 0 : 1, borderColor: '#E5E7EB',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : '#6B7280' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'redeem' | 'history';
type HistoryFilter = 'all' | 'earn' | 'redeem';

// ═════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═════════════════════════════════════════════════════════════════════════════

export default function RedeemScreen() {
  // ── Store selectors ──────────────────────────────────────────────────────
  const checkinCoins       = useCheckinStore((s) => s.lifecoins);
  const checkinInitialized = useCheckinStore((s) => s.initialized);
  const initializeCheckin  = useCheckinStore((s) => s.initialize);
  const exploreCoins       = useExploreStore((s) => s.lifecoins);
  const exploreInitialized = useExploreStore((s) => s.initialized);
  const initializeExplore  = useExploreStore((s) => s.initialize);
  const referralCoins      = useReferralStore((s) => s.stats?.bonusEarned ?? 0);
  const fetchReferralStats = useReferralStore((s) => s.fetchStats);
  const localTotal         = checkinCoins + exploreCoins + referralCoins;

  const {
    balance: walletBalance,
    totalEarned,
    nairaPerCoin,
    transactions,
    loading,
    synced,
    syncFromBackend,
    redeemCoins,
  } = useLifecoinsWalletStore();

  const pendingCoins = transactions
    .filter((tx) => tx.type === 'redeem' && tx.transferStatus === 'pending_approval')
    .reduce((sum, tx) => sum + tx.coins, 0);

  const rawBalance     = synced ? walletBalance : Math.max(walletBalance, localTotal);
  const displayBalance = Math.max(0, rawBalance - pendingCoins);
  const nairaPer       = nairaPerCoin || DEFAULT_NAIRA_PER_COIN;
  const displayEarned  = synced ? totalEarned : Math.max(totalEarned, localTotal);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [tab, setTab]               = useState<TabKey>('redeem');
  const [histFilter, setHistFilter] = useState<HistoryFilter>('all');
  const [healthFirmName, setFirmName] = useState('');
  const [accountNumber, setAccNum]  = useState('');
  const [selectedBank, setBank]     = useState<{ label: string; code: string } | null>(null);
  const [coinsInput, setCoinsInput] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [showBankModal, setShowBankModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const coins      = parseInt(coinsInput, 10) || 0;
  const nairaEquiv = coins * nairaPer;

  const isFormValid =
    healthFirmName.trim().length >= 2 &&
    accountNumber.trim().length === 10 &&
    selectedBank !== null &&
    coins >= MIN_COINS &&
    coins <= displayBalance;

  const filteredBanks = useMemo(
    () => bankSearch.trim()
      ? NIGERIAN_BANKS.filter((b) => b.label.toLowerCase().includes(bankSearch.toLowerCase()))
      : NIGERIAN_BANKS,
    [bankSearch],
  );

  const filteredTxs = useMemo(() => {
    const base = transactions.slice(0, 50);
    if (histFilter === 'earn')   return base.filter((t) => t.type === 'earn');
    if (histFilter === 'redeem') return base.filter((t) => t.type === 'redeem');
    return base;
  }, [transactions, histFilter]);

  const earnCount   = transactions.filter((t) => t.type === 'earn').length;
  const redeemCount = transactions.filter((t) => t.type === 'redeem').length;

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    syncFromBackend();
    fetchReferralStats();
    if (!checkinInitialized) initializeCheckin();
    if (!exploreInitialized) initializeExplore();
  }, []);

  // Deep-link guard: redirect if balance drops below minimum
  useEffect(() => {
    if (!loading && synced && displayBalance < MIN_COINS) {
      router.replace('/(tab)/health');
    }
  }, [loading, synced, displayBalance]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSetMax = useCallback(() => setCoinsInput(String(displayBalance)), [displayBalance]);

  const handleConfirm = async () => {
    if (!isFormValid || !selectedBank) return;
    setShowConfirm(false);
    setSubmitting(true);
    const result = await redeemCoins({
      coins,
      healthFirmName: healthFirmName.trim(),
      accountNumber: accountNumber.trim(),
      bankCode: selectedBank.code,
      bankName: selectedBank.label,
    });
    setSubmitting(false);
    if (result.success) {
      setCoinsInput(''); setFirmName(''); setAccNum(''); setBank(null);
      setTab('history');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FA' }} edges={['top']}>

        {/* ── HERO HEADER ────────────────────────────────────────────── */}
        <LinearGradient
          colors={['#1C1C1E', '#2D2D30']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: 12, paddingBottom: 0, paddingHorizontal: 20 }}
        >
          {/* Back */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 18 }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.65)" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.65)' }}>Back</Text>
          </TouchableOpacity>

          {/* Balance row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 }}>
                AVAILABLE BALANCE
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <Text style={{ fontSize: 42, fontWeight: '900', color: '#F59E0B', lineHeight: 48 }}>
                  {displayBalance}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: 'rgba(255,255,255,0.45)', marginBottom: 7 }}>
                  LC
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                ≈ {formatNaira(displayBalance * nairaPer)}
              </Text>
            </View>

            {/* Side pills */}
            <View style={{ gap: 8, alignItems: 'flex-end' }}>
              <View style={{
                backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 7,
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}>
                <Ionicons name="trophy-outline" size={13} color="#F59E0B" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#F59E0B' }}>
                  {displayEarned} earned
                </Text>
              </View>
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 7,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}>
                <Ionicons name="swap-horizontal-outline" size={13} color="rgba(255,255,255,0.4)" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)' }}>
                  {nairaPer} NGN / LC
                </Text>
              </View>
            </View>
          </View>

          {loading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Syncing wallet…</Text>
            </View>
          )}

          {/* Tab bar */}
          <View style={{
            flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)',
            borderRadius: 14, padding: 4,
          }}>
            <TabPill label="Redeem"  active={tab === 'redeem'}  onPress={() => setTab('redeem')} />
            <TabPill label="History" active={tab === 'history'} onPress={() => setTab('history')} badge={transactions.length} />
          </View>

          {/* Curve bridge to body */}
          <View style={{
            height: 22, backgroundColor: '#F7F8FA',
            marginHorizontal: -20, marginTop: 12,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
          }} />
        </LinearGradient>

        {/* ── BODY ───────────────────────────────────────────────────── */}
        {tab === 'redeem' ? (

          /* ───── REDEEM TAB ───── */
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 }}
          >
            {/* Section heading */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={{ width: 4, height: 20, backgroundColor: '#F59E0B', borderRadius: 2 }} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Recipient Details</Text>
            </View>

            <View style={{ gap: 16 }}>

              {/* Pharmacy name */}
              <Field label="Pharmacy / Health Firm">
                <TextInput
                  value={healthFirmName}
                  onChangeText={setFirmName}
                  placeholder="e.g. MedPlus Pharmacy, HealthPlan Nigeria"
                  placeholderTextColor="#C4C9D4"
                  returnKeyType="next"
                  style={{
                    backgroundColor: '#fff', borderRadius: 14,
                    borderWidth: 1.5, borderColor: healthFirmName.length >= 2 ? '#F59E0B' : '#E5E7EB',
                    paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: '#111827',
                  }}
                />
              </Field>

              {/* Bank picker */}
              <Field label="Bank">
                <TouchableOpacity
                  onPress={() => { setBankSearch(''); setShowBankModal(true); }}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: '#fff', borderRadius: 14,
                    borderWidth: 1.5, borderColor: selectedBank ? '#F59E0B' : '#E5E7EB',
                    paddingHorizontal: 16, paddingVertical: 14,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    {selectedBank ? (
                      <>
                        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#D97706' }}>{selectedBank.code}</Text>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{selectedBank.label}</Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 14, color: '#C4C9D4' }}>Select your bank…</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </Field>

              {/* Account number */}
              <Field label="Account Number">
                <TextInput
                  value={accountNumber}
                  onChangeText={(v) => setAccNum(v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit NUBAN"
                  placeholderTextColor="#C4C9D4"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={{
                    backgroundColor: '#fff', borderRadius: 14,
                    borderWidth: 1.5, borderColor: accountNumber.length === 10 ? '#F59E0B' : '#E5E7EB',
                    paddingHorizontal: 16, paddingVertical: 14,
                    fontSize: 18, fontWeight: '700', color: '#111827', letterSpacing: 3,
                  }}
                />
                {accountNumber.length > 0 && accountNumber.length < 10 && (
                  <Text style={{ fontSize: 11, color: '#EF4444', marginLeft: 4 }}>
                    {10 - accountNumber.length} more digit{10 - accountNumber.length !== 1 ? 's' : ''} needed
                  </Text>
                )}
              </Field>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 }} />

              {/* Amount heading */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 4, height: 20, backgroundColor: '#F59E0B', borderRadius: 2 }} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Amount</Text>
              </View>

              {/* Coins input */}
              <Field label={`Lifecoins to Redeem (min ${MIN_COINS})`}>
                <View>
                  <TextInput
                    value={coinsInput}
                    onChangeText={setCoinsInput}
                    placeholder={`${MIN_COINS} – ${displayBalance}`}
                    placeholderTextColor="#C4C9D4"
                    keyboardType="number-pad"
                    style={{
                      backgroundColor: '#fff', borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: coins >= MIN_COINS && coins <= displayBalance ? '#F59E0B' : '#E5E7EB',
                      paddingHorizontal: 16, paddingVertical: 14, paddingRight: 80,
                      fontSize: 24, fontWeight: '900', color: '#111827',
                    }}
                  />
                  <TouchableOpacity
                    onPress={handleSetMax}
                    activeOpacity={0.8}
                    style={{
                      position: 'absolute', right: 10,
                      top: '50%', transform: [{ translateY: -14 }],
                      backgroundColor: '#FEF3C7', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 5,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706' }}>MAX</Text>
                  </TouchableOpacity>
                </View>

                {/* Live conversion ticker */}
                {coins > 0 && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, gap: 8,
                    borderWidth: 1, borderColor: '#FDE68A', marginTop: 4,
                  }}>
                    <Ionicons name="swap-horizontal" size={15} color="#D97706" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>
                      {coins} LC = {formatNaira(nairaEquiv)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#B45309', marginLeft: 'auto' }}>
                      @ {nairaPer} NGN/LC
                    </Text>
                  </View>
                )}
                {coins > displayBalance && (
                  <Text style={{ fontSize: 12, color: '#EF4444', marginLeft: 4 }}>
                    Exceeds your balance ({displayBalance} LC)
                  </Text>
                )}
              </Field>

              {/* Disbursement preview */}
              {isFormValid && selectedBank && (
                <View style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: '#FDE68A' }}>
                  <View style={{ backgroundColor: '#FFFBEB', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="receipt-outline" size={16} color="#D97706" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>Disbursement Preview</Text>
                  </View>
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 2 }}>
                    <PreviewRow label="Recipient"   value={healthFirmName.trim()} />
                    <View style={{ height: 1, backgroundColor: '#FEF9EE', marginVertical: 2 }} />
                    <PreviewRow label="Account"     value={accountNumber} />
                    <PreviewRow label="Bank"        value={selectedBank.label} />
                    <View style={{ height: 1, backgroundColor: '#FEF9EE', marginVertical: 2 }} />
                    <PreviewRow label="Lifecoins"   value={`${coins} LC`} />
                    <PreviewRow label="You receive" value={formatNaira(nairaEquiv)} accent />
                  </View>
                </View>
              )}

              {/* Disclaimer */}
              <View style={{ flexDirection: 'row', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 11, color: '#64748B', lineHeight: 17 }}>
                  Processed via Flutterwave within 24 hours. Coins are non-transferable and redeemable
                  only at registered health firms. Minimum is {MIN_COINS} LC ({formatNaira(MIN_COINS * nairaPer)}).
                </Text>
              </View>
            </View>
          </ScrollView>

        ) : (

          /* ───── HISTORY TAB ───── */
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 4 }}>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              <FilterChip label={`All  ${transactions.length}`}  active={histFilter === 'all'}    onPress={() => setHistFilter('all')} />
              <FilterChip label={`Earned  ${earnCount}`}          active={histFilter === 'earn'}   onPress={() => setHistFilter('earn')} />
              <FilterChip label={`Redeemed  ${redeemCount}`}      active={histFilter === 'redeem'} onPress={() => setHistFilter('redeem')} />
            </ScrollView>

            {filteredTxs.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="receipt-outline" size={28} color="#D1D5DB" />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#6B7280' }}>No transactions yet</Text>
                <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                  Your Lifecoin activity will appear here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredTxs}
                keyExtractor={(t) => t.id}
                renderItem={({ item }) => <TxCard tx={item} />}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              />
            )}
          </View>
        )}

        {/* ── STICKY REDEEM BUTTON ────────────────────────────────────── */}
        {tab === 'redeem' && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: '#F7F8FA',
            paddingHorizontal: 20, paddingTop: 12,
            paddingBottom: Platform.OS === 'ios' ? 34 : 20,
            borderTopWidth: 1, borderTopColor: '#E5E7EB',
          }}>
            <TouchableOpacity
              onPress={() => isFormValid && setShowConfirm(true)}
              disabled={!isFormValid || submitting}
              activeOpacity={0.9}
              style={{ borderRadius: 16, overflow: 'hidden', opacity: (!isFormValid || submitting) ? 0.38 : 1 }}
            >
              <LinearGradient
                colors={['#F59E0B', '#D97706']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 17, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }}>
                      {coins >= MIN_COINS ? `Redeem ${coins} Lifecoins` : 'Redeem Lifecoins'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── BANK PICKER MODAL (bottom sheet) ───────────────────────── */}
        <Modal visible={showBankModal} animationType="slide" transparent onRequestClose={() => setShowBankModal(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowBankModal(false)}>
            <Pressable
              style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 40 : 28, maxHeight: '80%' }}
              onPress={() => {}}
            >
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', paddingHorizontal: 20, marginBottom: 14 }}>
                Select Bank
              </Text>

              {/* Search bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F3F4F6', borderRadius: 12, marginHorizontal: 20, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  value={bankSearch}
                  onChangeText={setBankSearch}
                  placeholder="Search banks…"
                  placeholderTextColor="#C4C9D4"
                  style={{ flex: 1, fontSize: 14, color: '#111827' }}
                  autoFocus
                />
                {bankSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setBankSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={filteredBanks}
                keyExtractor={(b) => b.code}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => { setBank(item); setShowBankModal(false); }}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#D97706' }}>{item.code}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' }}>{item.label}</Text>
                    {selectedBank?.code === item.code && (
                      <Ionicons name="checkmark-circle" size={20} color="#F59E0B" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── CONFIRM MODAL ───────────────────────────────────────────── */}
        <Modal visible={showConfirm} animationType="fade" transparent onRequestClose={() => setShowConfirm(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setShowConfirm(false)}>
            <Pressable style={{ backgroundColor: '#fff', borderRadius: 24, width: '100%', overflow: 'hidden' }} onPress={() => {}}>
              <LinearGradient colors={['#F59E0B', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 5 }} />
              <View style={{ padding: 24, gap: 16 }}>
                {/* Title area */}
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="send" size={24} color="#D97706" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>Confirm Redemption</Text>
                  <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                    Please review the details before proceeding.
                  </Text>
                </View>

                {/* Summary */}
                <View style={{ backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, gap: 2, borderWidth: 1, borderColor: '#FDE68A' }}>
                  <PreviewRow label="Recipient"    value={healthFirmName.trim()} />
                  <View style={{ height: 1, backgroundColor: '#FEF9EE', marginVertical: 3 }} />
                  <PreviewRow label="Account"      value={accountNumber} />
                  <PreviewRow label="Bank"         value={selectedBank?.label ?? ''} />
                  <View style={{ height: 1, backgroundColor: '#FEF9EE', marginVertical: 3 }} />
                  <PreviewRow label="Lifecoins"    value={`${coins} LC`} />
                  <PreviewRow label="Disbursement" value={formatNaira(nairaEquiv)} accent />
                </View>

                {/* Buttons */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setShowConfirm(false)}
                    activeOpacity={0.8}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#6B7280' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirm}
                    activeOpacity={0.85}
                    style={{ flex: 2, borderRadius: 14, overflow: 'hidden' }}
                  >
                    <LinearGradient
                      colors={['#F59E0B', '#D97706']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>Confirm</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
