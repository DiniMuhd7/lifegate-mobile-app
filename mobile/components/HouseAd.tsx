/**
 * HouseAd.tsx — self-promotion ("house") ad card.
 *
 * Rotates through LifeGate's own creatives (Premium upsell, referrals,
 * LifeCoins redemption). Used as the fallback when a third-party ad slot has
 * no fill (web) and can be placed directly anywhere a banner fits.
 *
 * No SDK, no network call, no policy risk — taps navigate in-app.
 */
import React, { useMemo } from 'react';
import { Pressable, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface HouseCreative {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  cta: string;
  route: string;
  /** Card accent colors */
  bg: string;
  border: string;
  accent: string;
  text: string;
}

const CREATIVES: HouseCreative[] = [
  {
    id: 'premium',
    icon: 'sparkles',
    title: 'Go Premium',
    body: 'Remove ads and unlock full health reports.',
    cta: 'Upgrade',
    route: '/(tab)/settings/subscription',
    bg: '#eef2ff',
    border: '#c7d2fe',
    accent: '#4f46e5',
    text: '#3730a3',
  },
  {
    id: 'referral',
    icon: 'people',
    title: 'Invite a friend',
    body: 'Earn LifeCoins for every friend who joins LifeGate.',
    cta: 'Invite',
    route: '/(tab)/health/referrals',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    accent: '#059669',
    text: '#065f46',
  },
  {
    id: 'redeem',
    icon: 'gift',
    title: 'Redeem your LifeCoins',
    body: 'Trade coins for rewards and discounts.',
    cta: 'Redeem',
    route: '/(tab)/health/redeem',
    bg: '#fffbeb',
    border: '#fde68a',
    accent: '#d97706',
    text: '#92400e',
  },
];

export interface HouseAdProps {
  /** Pin a specific creative instead of random rotation. */
  creativeId?: 'premium' | 'referral' | 'redeem';
}

export function HouseAd({ creativeId }: HouseAdProps) {
  const router = useRouter();

  const creative = useMemo(() => {
    if (creativeId) {
      const pinned = CREATIVES.find((c) => c.id === creativeId);
      if (pinned) return pinned;
    }
    return CREATIVES[Math.floor(Math.random() * CREATIVES.length)];
  }, [creativeId]);

  return (
    <Pressable
      onPress={() => router.push(creative.route as never)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: creative.border,
        backgroundColor: creative.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: creative.border,
        }}
      >
        <Ionicons name={creative.icon} size={20} color={creative.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: creative.text }}>
          {creative.title}
        </Text>
        <Text style={{ fontSize: 12, color: creative.text, opacity: 0.8, marginTop: 1 }}>
          {creative.body}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: creative.accent,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{creative.cta}</Text>
      </View>
    </Pressable>
  );
}
