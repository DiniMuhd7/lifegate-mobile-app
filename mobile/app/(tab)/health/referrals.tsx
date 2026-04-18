import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { useReferralStore } from 'stores/referral-store';
import type { ReferralItem } from 'types/referral-types';

// ── Reward tiers ──────────────────────────────────────────────────────────────

const COINS_PER_REFERRAL = 5;

const TIERS = [
  { threshold: 1,  label: 'First Referral',  bonus: 10,  icon: 'star-outline' as const,         color: '#d97706' },
  { threshold: 5,  label: '5 Referrals',     bonus: 25,  icon: 'trophy-outline' as const,        color: '#0284c7' },
  { threshold: 10, label: '10 Referrals',    bonus: 50,  icon: 'ribbon-outline' as const,        color: '#7c3aed' },
  { threshold: 25, label: '25 Referrals',    bonus: 150, icon: 'diamond-outline' as const,       color: '#dc2626' },
  { threshold: 50, label: '50 Referrals',    bonus: 400, icon: 'planet-outline' as const,        color: '#059669' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function maskId(id: string): string {
  // Show first 4 and last 4 chars of the referred user ID for privacy
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

// ── TierCard ──────────────────────────────────────────────────────────────────

function TierCard({
  threshold,
  label,
  bonus,
  icon,
  color,
  total,
}: (typeof TIERS)[number] & { total: number }) {
  const reached = total >= threshold;
  const isCurrent =
    total < threshold &&
    (TIERS.findIndex((t) => t.threshold === threshold) === 0 ||
      total >= (TIERS.find((_, i, arr) => arr[i + 1]?.threshold === threshold)?.threshold ?? 0));

  return (
    <View
      style={{
        flex: 1,
        minWidth: 100,
        backgroundColor: reached ? color + '15' : '#f9fafb',
        borderRadius: 16,
        padding: 14,
        alignItems: 'center',
        gap: 6,
        borderWidth: 1.5,
        borderColor: reached ? color : isCurrent ? color + '55' : '#e5e7eb',
        opacity: reached || isCurrent ? 1 : 0.6,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: reached ? color + '25' : '#f3f4f6',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={reached ? icon : 'lock-closed-outline'} size={20} color={reached ? color : '#9ca3af'} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: reached ? color : '#9ca3af', textAlign: 'center' }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          backgroundColor: reached ? color + '18' : '#f3f4f6',
          borderRadius: 8,
          paddingHorizontal: 7,
          paddingVertical: 2,
        }}
      >
        <Ionicons name="logo-bitcoin" size={10} color={reached ? color : '#9ca3af'} />
        <Text style={{ fontSize: 11, fontWeight: '800', color: reached ? color : '#9ca3af' }}>
          +{bonus} bonus
        </Text>
      </View>
    </View>
  );
}

// ── ReferralRow ───────────────────────────────────────────────────────────────

function ReferralRow({ item, index }: { item: ReferralItem; index: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: index === -1 ? 0 : 1,
        borderBottomColor: '#f3f4f6',
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: item.bonusGranted ? '#d1fae5' : '#fef3c7',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={item.bonusGranted ? 'checkmark-circle' : 'time-outline'}
          size={20}
          color={item.bonusGranted ? '#16a34a' : '#d97706'}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
          User {maskId(item.referredId)}
        </Text>
        <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Joined {formatDate(item.createdAt)}</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: item.bonusGranted ? '#d1fae5' : '#fef3c7',
          borderRadius: 10,
          paddingHorizontal: 9,
          paddingVertical: 4,
        }}
      >
        <Ionicons name="logo-bitcoin" size={11} color={item.bonusGranted ? '#16a34a' : '#d97706'} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: item.bonusGranted ? '#15803d' : '#b45309' }}>
          {item.bonusGranted ? `+${COINS_PER_REFERRAL} earned` : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ReferralsScreen() {
  const user = useAuthStore((s) => s.user);
  const { stats, loading, error, fetchStats } = useReferralStore();

  // Copied-code flash state
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const referralCode = (stats?.referralCode ?? user?.referral_code ?? '').trim();
  const totalReferrals = stats?.totalReferrals ?? 0;
  const lifecoinsEarned = stats?.bonusEarned ?? 0;
  const referralList: ReferralItem[] = stats?.referrals ?? [];

  // Calculate total Lifecoins including tier bonuses
  const tierBonusEarned = TIERS.filter((t) => totalReferrals >= t.threshold).reduce(
    (sum, t) => sum + t.bonus,
    0,
  );
  const totalLifecoins = lifecoinsEarned + tierBonusEarned;

  const nextTier = TIERS.find((t) => t.threshold > totalReferrals);
  const toNextTier = nextTier ? nextTier.threshold - totalReferrals : 0;

  const handleShare = useCallback(async () => {
    if (!referralCode) {
      Alert.alert('Code unavailable', 'Your referral code is not ready yet. Please try again shortly.');
      return;
    }
    try {
      await Share.share({
        title: 'Join LifeGate — Your Health Companion',
        message: `Join me on LifeGate and take control of your health! Use my referral code ${referralCode} when signing up.\n\nWe both earn Lifecoins when you complete your first consultation.`,
      });
    } catch {
      // User cancelled share sheet — no action needed
    }
  }, [referralCode]);

  const handleCopyCode = useCallback(() => {
    // expo-clipboard is available in the project; import dynamically to keep
    // this file dependency-free if the module is missing on web.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard');
      Clipboard.setStringAsync(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Copy failed', 'Could not copy code. Please copy it manually.');
    }
  }, [referralCode]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <LinearGradient
        colors={['#dc2626', '#991b1b']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: 8, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>Referrals</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
              Invite friends · earn Lifecoins together
            </Text>
          </View>
          {loading && <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />}
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Referrals', value: totalReferrals, icon: 'people-outline' as const, color: '#fca5a5' },
            { label: 'Lifecoins', value: totalLifecoins, icon: 'logo-bitcoin' as const, color: '#fbbf24' },
            { label: 'Next Tier', value: nextTier ? `${toNextTier} more` : '🏆 Max', icon: 'ribbon-outline' as const, color: '#a5b4fc' },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {error && (
          <View
            style={{
              backgroundColor: '#fef2f2',
              borderRadius: 14,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderColor: '#fecaca',
            }}
          >
            <Ionicons name="warning-outline" size={18} color="#dc2626" />
            <Text style={{ flex: 1, fontSize: 13, color: '#dc2626', fontWeight: '600' }}>
              Could not load referral data. {error}
            </Text>
            <Pressable
              onPress={fetchStats}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Referral code card */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            gap: 16,
            shadowColor: '#dc2626',
            shadowOpacity: 0.06,
            shadowRadius: 10,
            elevation: 3,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
              Your Referral Code
            </Text>
            <Pressable
              onPress={handleCopyCode}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#fef2f2',
                borderRadius: 14,
                paddingHorizontal: 18,
                paddingVertical: 16,
                borderWidth: 1.5,
                borderColor: '#fecaca',
                borderStyle: 'dashed',
              })}
            >
              <Text style={{ fontSize: 26, fontWeight: '900', color: '#dc2626', letterSpacing: 4 }}>
                {referralCode || '—'}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: copied ? '#d1fae5' : '#dc262618',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Ionicons
                  name={copied ? 'checkmark-done-outline' : 'copy-outline'}
                  size={14}
                  color={copied ? '#16a34a' : '#dc2626'}
                />
                <Text style={{ fontSize: 12, fontWeight: '700', color: copied ? '#16a34a' : '#dc2626' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Share button */}
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, borderRadius: 14, overflow: 'hidden' })}
          >
            <LinearGradient
              colors={['#dc2626', '#991b1b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Ionicons name="share-social-outline" size={20} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Share Referral Code</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* How it works */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            padding: 16,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>How It Works</Text>
          {[
            { icon: 'share-outline' as const,             color: '#dc2626', text: 'Share your code with a friend' },
            { icon: 'person-add-outline' as const,        color: '#0284c7', text: 'They sign up using your referral code' },
            { icon: 'chatbubbles-outline' as const,       color: '#7c3aed', text: 'They complete their first consultation' },
            { icon: 'logo-bitcoin' as const,              color: '#d97706', text: `You earn ${COINS_PER_REFERRAL} Lifecoins — instantly` },
          ].map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: step.color + '15',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={step.icon} size={17} color={step.color} />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '500', flex: 1 }}>{step.text}</Text>
                {i < 3 && (
                  <Ionicons name="arrow-forward-outline" size={14} color="#d1d5db" />
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Milestone tiers */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Milestone Bonuses
            </Text>
            {nextTier && (
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#dc2626' }}>
                {toNextTier} more to unlock +{nextTier.bonus} LC bonus
              </Text>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {TIERS.map((tier) => (
              <TierCard key={tier.threshold} {...tier} total={totalReferrals} />
            ))}
          </ScrollView>
        </View>

        {/* Progress bar to next tier */}
        {nextTier && (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                Progress to {nextTier.label}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af' }}>
                {totalReferrals}/{nextTier.threshold}
              </Text>
            </View>
            <View style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 4 }}>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: nextTier.color,
                  width: `${Math.min(100, (totalReferrals / nextTier.threshold) * 100)}%`,
                }}
              />
            </View>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              {toNextTier} more referral{toNextTier !== 1 ? 's' : ''} to earn{' '}
              <Text style={{ fontWeight: '700', color: nextTier.color }}>+{nextTier.bonus} bonus Lifecoins</Text>
            </Text>
          </View>
        )}

        {/* Referral history */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Referral History
            </Text>
            {totalReferrals > 0 && (
              <View
                style={{
                  backgroundColor: '#fee2e2',
                  borderRadius: 8,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>{totalReferrals}</Text>
              </View>
            )}
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
            }}
          >
            {loading && (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#dc2626" />
              </View>
            )}

            {!loading && referralList.length === 0 && (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="people-outline" size={28} color="#dc2626" />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>No referrals yet</Text>
                <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 18 }}>
                  Share your code to start earning Lifecoins for every friend who joins!
                </Text>
              </View>
            )}

            {!loading &&
              referralList.map((item, i) => (
                <ReferralRow
                  key={item.id}
                  item={item}
                  index={i < referralList.length - 1 ? i : -1}
                />
              ))}
          </View>
        </View>

        {/* Disclaimer */}
        <View
          style={{
            backgroundColor: '#f9fafb',
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: '#e5e7eb',
          }}
        >
          <Text style={{ fontSize: 11, color: '#9ca3af', lineHeight: 16, textAlign: 'center' }}>
            Lifecoins are awarded once a referred user completes their first consultation. Referral bonuses are subject to review. Self-referrals are not permitted.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
