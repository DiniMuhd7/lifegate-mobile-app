/**
 * InterstitialAdSlot.web.tsx — Web stub for the AdMob Interstitial Ad slot.
 *
 * Uses the H5 Game Ads API (adBreak / type:'next') which is the web equivalent
 * of a full-screen interstitial.  The row is tappable and triggers the ad
 * the same way the native version does.
 *
 * App ID  : ca-app-pub-4516568539037938~3922174578
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-app-pub-3940256099942544';
const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_INTERSTITIAL_UNIT_ID ??
  'ca-app-pub-3940256099942544/1033173712';

declare global {
  interface Window {
    adsbygoogle: unknown[];
    adBreak?: (config: AdBreakConfig) => void;
  }
}

interface AdBreakConfig {
  type: 'start' | 'pause' | 'next' | 'browse' | 'reward';
  adUnitId?: string;
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adDismissed?: () => void;
}

function isProduction(): boolean {
  return typeof window !== 'undefined';
}

let adConfigured = false;

function ensureAdConfig() {
  if (typeof document === 'undefined' || adConfigured) return;
  adConfigured = true;

  if (!document.getElementById('admob-h5-script')) {
    const s = document.createElement('script');
    s.id = 'admob-h5-script';
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  (window.adsbygoogle as unknown[]).push({
    preloadAdBreaks: 'on',
    google_ad_client: PUBLISHER_ID,
  });
}

export interface InterstitialAdSlotProps {
  onDismissed?: () => void;
  label?: string;
}

export function InterstitialAdSlot({
  onDismissed,
  label = 'Support LifeGate — watch a short ad',
}: InterstitialAdSlotProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ensureAdConfig();
  }, []);

  if (!isProduction()) return null;

  const handlePress = () => {
    if (loading) return;
    setLoading(true);

    const adBreak: (cfg: AdBreakConfig) => void =
      window.adBreak ??
      ((cfg) => {
        (window.adsbygoogle as unknown[]).push(cfg);
      });

    adBreak({
      type: 'next',
      adUnitId: AD_UNIT_ID,
      name: 'explore-interstitial',
      beforeAd: () => { /* SDK takes over fullscreen */ },
      afterAd: () => { setLoading(false); },
      adDismissed: () => {
        setLoading(false);
        onDismissed?.();
      },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        opacity: loading ? 0.6 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
      ) : (
        <Ionicons name="tv-outline" size={16} color="rgba(255,255,255,0.35)" />
      )}
      <Text style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>
        {loading ? 'Loading ad…' : label}
      </Text>
      <View style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.3)' }}>Ad</Text>
      </View>
    </Pressable>
  );
}
