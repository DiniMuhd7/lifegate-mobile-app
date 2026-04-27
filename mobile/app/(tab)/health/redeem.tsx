/**
 * Lifecoins Redemption Screen — Health Insurance Waiver
 *
 * Allows patients to convert their earned Lifecoins into a Naira disbursement
 * sent directly to a pharmacy or health firm's bank account. The disbursement
 * acts as a prescription discount / health insurance waiver.
 *
 * Flow:
 *   1. Patient enters health firm name, account number, bank
 *   2. Selects amount of Lifecoins to redeem (min 100)
 *   3. Confirms preview (₦ equivalent)
 *   4. POST /lifecoins/redeem → Flutterwave transfer initiated
 *   5. Transaction history shown below
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  { label: 'Access Bank',         code: '044' },
  { label: 'First Bank of Nigeria', code: '011' },
  { label: 'Guaranty Trust Bank', code: '058' },
  { label: 'United Bank for Africa', code: '033' },
  { label: 'Zenith Bank',         code: '057' },
  { label: 'Sterling Bank',       code: '232' },
  { label: 'Fidelity Bank',       code: '070' },
  { label: 'Union Bank',          code: '032' },
  { label: 'Stanbic IBTC Bank',   code: '221' },
  { label: 'Ecobank Nigeria',     code: '050' },
  { label: 'Heritage Bank',       code: '030' },
  { label: 'Polaris Bank',        code: '076' },
  { label: 'Wema Bank',           code: '035' },
  { label: 'Titan Trust Bank',    code: '102' },
  { label: 'Providus Bank',       code: '101' },
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

// ── Transaction History Item ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  success:          { color: '#16a34a', label: 'Paid' },
  failed:           { color: '#dc2626', label: 'Failed' },
  pending_approval: { color: '#d97706', label: 'Awaiting Review' },
  rejected:         { color: '#dc2626', label: 'Rejected' },
  processing:       { color: '#2563eb', label: 'Processing' },
  pending:          { color: '#6b7280', label: 'Pending' },
};

function TxItem({ tx }: { tx: LifecoinTx }) {
  const isEarn = tx.type === 'earn';
  const cfg = STATUS_CONFIG[tx.transferStatus ?? ''] ?? { color: '#6b7280', label: tx.transferStatus ?? '' };
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isEarn ? '#dcfce7' : '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons
            name={isEarn ? 'add-circle-outline' : 'arrow-up-circle-outline'}
            size={20}
            color={isEarn ? '#16a34a' : '#d97706'}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {tx.description}
          </Text>
          {tx.healthFirmName && (
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>→ {tx.healthFirmName}</Text>
          )}
          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{formatDate(tx.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: isEarn ? '#16a34a' : '#d97706' }}>
            {isEarn ? '+' : '-'}{tx.coins} LC
          </Text>
          {!isEarn && (
            <View style={{ backgroundColor: cfg.color + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: cfg.color }}>
                {cfg.label}
              </Text>
            </View>
          )}
        </View>
      </View>
      {tx.transferStatus === 'rejected' && tx.adminNote && (
        <View style={{ marginLeft: 48, backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, color: '#991b1b' }}>Reason: {tx.adminNote}</Text>
        </View>
      )}
      {tx.transferStatus === 'pending_approval' && (
        <View style={{ marginLeft: 48, backgroundColor: '#fffbeb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, color: '#92400e' }}>Your request is being reviewed by an admin.</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RedeemScreen() {
  // Aggregate local coins from active activity stores (offline-first total)
  // Note: offers and surveys are excluded until those features are live.
  const checkinCoins        = useCheckinStore((s) => s.lifecoins);
  const checkinInitialized  = useCheckinStore((s) => s.initialized);
  const initializeCheckin   = useCheckinStore((s) => s.initialize);
  const exploreCoins        = useExploreStore((s) => s.lifecoins);
  const exploreInitialized  = useExploreStore((s) => s.initialized);
  const initializeExplore   = useExploreStore((s) => s.initialize);
  // Referral coins are credited server-side; bonusEarned from the last
  // fetchStats() call is used as the offline estimate so they aren't
  // invisible before the wallet sync completes.
  const referralCoins       = useReferralStore((s) => s.stats?.bonusEarned ?? 0);
  const fetchReferralStats  = useReferralStore((s) => s.fetchStats);
  const localTotal          = checkinCoins + exploreCoins + referralCoins;

  // Wallet store (synced to backend)
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

  // Coins locked in pending admin-approval redemptions are not yet deducted
  // on the server, so must be subtracted locally to avoid showing a stale balance.
  const pendingRedemptionCoins = transactions
    .filter((tx) => tx.type === 'redeem' && tx.transferStatus === 'pending_approval')
    .reduce((sum, tx) => sum + tx.coins, 0);

  // Before the first successful backend sync use localTotal as an offline-first
  // estimate.  Once synced, walletBalance is authoritative — it includes coins
  // from all sources (checkin, explore, offers, surveys all call addCoins now)
  // and correctly reflects any approved redemption deductions.
  const rawBalance    = synced ? walletBalance : Math.max(walletBalance, localTotal);
  const displayBalance = Math.max(0, rawBalance - pendingRedemptionCoins);
  const nairaPer = nairaPerCoin || DEFAULT_NAIRA_PER_COIN;

  // ── Form state ──────────────────────────────────────────────────────────────
  const [healthFirmName, setHealthFirmName] = useState('');
  const [accountNumber, setAccountNumber]   = useState('');
  const [selectedBank, setSelectedBank]     = useState<{ label: string; code: string } | null>(null);
  const [coinsInput, setCoinsInput]         = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [submitting, setSubmitting]         = useState(false);

  const coins = parseInt(coinsInput, 10) || 0;
  const nairaEquivalent = coins * nairaPer;

  const isFormValid =
    healthFirmName.trim().length >= 2 &&
    accountNumber.trim().length === 10 &&
    selectedBank !== null &&
    coins >= MIN_COINS &&
    coins <= displayBalance;

  useEffect(() => {
    syncFromBackend();
    fetchReferralStats();
    if (!checkinInitialized) initializeCheckin();
    if (!exploreInitialized) initializeExplore();
  }, [syncFromBackend, fetchReferralStats, checkinInitialized, initializeCheckin, exploreInitialized, initializeExplore]);

  const handleSetMax = useCallback(() => {
    setCoinsInput(String(displayBalance));
  }, [displayBalance]);

  const handleRedeem = async () => {
    if (!isFormValid || !selectedBank) return;

    Alert.alert(
      'Confirm Redemption',
      `You are about to redeem ${coins} Lifecoins (${formatNaira(nairaEquivalent)}) to:\n\n` +
      `${healthFirmName}\n` +
      `Account: ${accountNumber}\n` +
      `Bank: ${selectedBank.label}\n\n` +
      `The funds will be disbursed as a prescription discount.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
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
              setCoinsInput('');
              setHealthFirmName('');
              setAccountNumber('');
              setSelectedBank(null);
              Alert.alert('Redemption Initiated', result.message);
            } else {
              Alert.alert('Redemption Failed', result.message);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F0F8F8' }} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20 }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 }}>
              Redeem Lifecoins
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 20 }}>
              Convert your coins into a pharmacy prescription discount
            </Text>

            {/* Balance stats */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <Ionicons name="heart-circle-outline" size={22} color="#fff" />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4 }}>{displayBalance}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Balance</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <Ionicons name="cash-outline" size={22} color="#fff" />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4 }}>
                  {formatNaira(displayBalance * nairaPer)}
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Total Value</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
                <Ionicons name="trophy-outline" size={22} color="#fff" />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4 }}>{Math.max(totalEarned, localTotal)}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Total Earned</Text>
              </View>
            </View>
          </LinearGradient>

          {loading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10 }}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={{ fontSize: 12, color: '#6b7280' }}>Syncing wallet…</Text>
            </View>
          )}

          {/* ── Redemption Form ─────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
              Health Firm Details
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: -8 }}>
              Enter the bank details of the pharmacy or health firm that will receive the disbursement.
            </Text>

            {/* Health Firm Name */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Pharmacy / Health Firm Name</Text>
              <TextInput
                value={healthFirmName}
                onChangeText={setHealthFirmName}
                placeholder="e.g. MedPlus Pharmacy, HealthPlan Nigeria"
                placeholderTextColor="#9ca3af"
                style={{
                  borderWidth: 1.5,
                  borderColor: healthFirmName.length >= 2 ? '#F59E0B' : '#e5e7eb',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontSize: 14,
                  color: '#111827',
                  backgroundColor: '#fff',
                }}
              />
            </View>

            {/* Bank Selector */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Bank</Text>
              <TouchableOpacity
                onPress={() => setShowBankPicker(!showBankPicker)}
                activeOpacity={0.8}
                style={{
                  borderWidth: 1.5,
                  borderColor: selectedBank ? '#F59E0B' : '#e5e7eb',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  backgroundColor: '#fff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 14, color: selectedBank ? '#111827' : '#9ca3af' }}>
                  {selectedBank ? selectedBank.label : 'Select a bank…'}
                </Text>
                <Ionicons name={showBankPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
              </TouchableOpacity>
              {showBankPicker && (
                <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, marginTop: 4, backgroundColor: '#fff', maxHeight: 250, overflow: 'scroll' }}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {NIGERIAN_BANKS.map((bank) => (
                      <TouchableOpacity
                        key={bank.code}
                        onPress={() => { setSelectedBank(bank); setShowBankPicker(false); }}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 13,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f3f4f6',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, color: '#111827' }}>{bank.label}</Text>
                        {selectedBank?.code === bank.code && (
                          <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Account Number */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 }}>Account Number</Text>
              <TextInput
                value={accountNumber}
                onChangeText={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit NUBAN account number"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                maxLength={10}
                style={{
                  borderWidth: 1.5,
                  borderColor: accountNumber.length === 10 ? '#F59E0B' : '#e5e7eb',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontSize: 14,
                  color: '#111827',
                  backgroundColor: '#fff',
                  letterSpacing: 2,
                }}
              />
              {accountNumber.length > 0 && accountNumber.length < 10 && (
                <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                  {10 - accountNumber.length} more digit{10 - accountNumber.length !== 1 ? 's' : ''} required
                </Text>
              )}
            </View>

            {/* Coins Amount */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                  Lifecoins to Redeem (min {MIN_COINS})
                </Text>
                <TouchableOpacity onPress={handleSetMax} activeOpacity={0.7}>
                  <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '700' }}>Max ({displayBalance})</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={coinsInput}
                onChangeText={setCoinsInput}
                placeholder={`${MIN_COINS}–${displayBalance}`}
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                style={{
                  borderWidth: 1.5,
                  borderColor: coins >= MIN_COINS && coins <= displayBalance ? '#F59E0B' : '#e5e7eb',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontSize: 14,
                  color: '#111827',
                  backgroundColor: '#fff',
                }}
              />
              {coins > 0 && (
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  = {formatNaira(nairaEquivalent)} at {nairaPer} NGN/coin
                </Text>
              )}
              {coins > displayBalance && (
                <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                  Exceeds your balance of {displayBalance} Lifecoins
                </Text>
              )}
            </View>

            {/* Preview card */}
            {isFormValid && selectedBank && (
              <View style={{ backgroundColor: '#fffbeb', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#fde68a' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Ionicons name="information-circle" size={18} color="#d97706" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>Disbursement Preview</Text>
                </View>
                <View style={{ gap: 6 }}>
                  <Row label="Recipient" value={healthFirmName.trim()} />
                  <Row label="Account"   value={accountNumber} />
                  <Row label="Bank"      value={selectedBank.label} />
                  <Row label="Amount"    value={formatNaira(nairaEquivalent)} highlight />
                  <Row label="Coins"     value={`${coins} Lifecoins` } />
                </View>
              </View>
            )}

            {/* Redeem Button */}
            <TouchableOpacity
              onPress={handleRedeem}
              disabled={!isFormValid || submitting}
              activeOpacity={0.85}
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                opacity: (!isFormValid || submitting) ? 0.45 : 1,
              }}
            >
              <LinearGradient
                colors={['#F59E0B', '#D97706']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                      Redeem {coins > 0 ? `${coins} Lifecoins` : 'Lifecoins'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Disclaimer */}
            <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', gap: 8 }}>
              <Ionicons name="shield-checkmark-outline" size={15} color="#64748b" style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 11, color: '#64748b', lineHeight: 17 }}>
                Lifecoins redemptions are processed via Flutterwave and disbursed within 24 hours.
                Coins are non-transferable and can only be redeemed for prescription discounts at
                registered health firms. This is not a cash withdrawal. Minimum redemption is {MIN_COINS} Lifecoins
                ({formatNaira(MIN_COINS * nairaPer)}).
              </Text>
            </View>
          </View>

          {/* ── Transaction History ─────────────────────────────────────── */}
          {transactions.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12 }}>
                History
              </Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e5e7eb' }}>
                {transactions.slice(0, 20).map((tx) => (
                  <TxItem key={tx.id} tx={tx} />
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ── Helper: key-value row in preview card ─────────────────────────────────────
function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 12, color: '#92400E' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: highlight ? '900' : '700', color: highlight ? '#B45309' : '#78350F' }}>
        {value}
      </Text>
    </View>
  );
}
