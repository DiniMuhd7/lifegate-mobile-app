/**
 * StreakBanner — displays the patient's daily check-in streak and current
 * LifeCoins bonus multiplier.
 *
 * Shows:
 *   • A fire emoji + "X-day streak" headline
 *   • The active coins multiplier badge (hidden when ×1)
 *   • A subtle progress bar toward the next multiplier tier
 *   • A nudge message if the user hasn't checked in today
 *
 * Mount it at the top of the health check-in screen or the chat home header.
 * It reads directly from `useCheckinStore` so no props are needed.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useCheckinStore } from 'stores/checkin-store';

// Tier thresholds that unlock a higher multiplier.
const TIERS = [
  { threshold: 7,  multiplier: 2, label: 'day 7'  },
  { threshold: 14, multiplier: 3, label: 'day 14' },
  { threshold: 30, multiplier: 5, label: 'day 30' },
];

function nextTier(streak: number): { threshold: number; multiplier: number; label: string } | null {
  for (const tier of TIERS) {
    if (streak < tier.threshold) return tier;
  }
  return null;
}

export default function StreakBanner() {
  const streak       = useCheckinStore((s) => s.streak);
  const multiplier   = useCheckinStore((s) => s.bonusMultiplier);
  const lastCheckin  = useCheckinStore((s) => s.lastDailyCheckinDate);
  const syncStreak   = useCheckinStore((s) => s.syncStreak);
  const router       = useRouter();

  const today        = new Date().toISOString().slice(0, 10);
  const checkedInToday = lastCheckin === today;

  const next   = useMemo(() => nextTier(streak), [streak]);
  // Progress toward the next tier as a fraction 0-1.
  const prevThreshold = useMemo(() => {
    for (let i = TIERS.length - 1; i >= 0; i--) {
      if (streak >= TIERS[i].threshold) return TIERS[i].threshold;
    }
    return 0;
  }, [streak]);
  const progress = next
    ? (streak - prevThreshold) / (next.threshold - prevThreshold)
    : 1;

  // No streak yet — render a compact invitation card instead.
  if (streak === 0) {
    return (
      <TouchableOpacity
        onPress={() => router.push('/(tab)/health')}
        activeOpacity={0.85}
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#fed7aa',
          backgroundColor: '#fff7ed',
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 22 }}>🔥</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#9a3412' }}>
            Start your check-in streak
          </Text>
          <Text style={{ fontSize: 12, color: '#c2410c', marginTop: 1 }}>
            Check in daily to earn bonus LifeCoins — up to ×5 at day 30!
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => { void syncStreak(); router.push('/(tab)/health'); }}
      activeOpacity={0.85}
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: checkedInToday ? '#bbf7d0' : '#fde68a',
        backgroundColor: checkedInToday ? '#f0fdf4' : '#fffbeb',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 6,
      }}
    >
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 20 }}>🔥</Text>

        <Text style={{ fontSize: 14, fontWeight: '700', color: checkedInToday ? '#166534' : '#92400e', flex: 1 }}>
          {streak}-day streak{checkedInToday ? ' · today ✓' : ' · check in now!'}
        </Text>

        {/* Multiplier badge — only shown when above ×1 */}
        {multiplier > 1 && (
          <View style={{
            backgroundColor: '#7c3aed',
            borderRadius: 8,
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              ×{multiplier} coins
            </Text>
          </View>
        )}
      </View>

      {/* Progress bar toward next tier */}
      {next && (
        <View style={{ gap: 3 }}>
          <View style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: '#e5e7eb',
            overflow: 'hidden',
          }}>
            <View style={{
              height: 5,
              borderRadius: 3,
              backgroundColor: checkedInToday ? '#16a34a' : '#f59e0b',
              width: `${Math.round(progress * 100)}%` as `${number}%`,
            }} />
          </View>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>
            {next.threshold - streak} more day{next.threshold - streak !== 1 ? 's' : ''} to ×{next.multiplier} bonus ({next.label})
          </Text>
        </View>
      )}

      {/* Max-tier celebration */}
      {!next && (
        <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>
          🏆 Max streak — ×5 LifeCoins on every check-in!
        </Text>
      )}
    </TouchableOpacity>
  );
}
