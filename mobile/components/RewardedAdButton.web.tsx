/**
 * RewardedAdButton.web.tsx — AdSense vignette-backed reward button for Expo Web.
 *
 * AdSense does not offer true rewarded ads for non-game web apps. This
 * implementation shows a vignette interstitial (adBreak type='next') instead.
 * The reward is granted via `afterAd`, which fires once the vignette is
 * dismissed — whether the user watched it fully or closed it early. This is
 * the best available mechanism on standard AdSense.
 *
 * Requires "Auto ads → Vignettes" to be enabled in your AdSense dashboard.
 * No additional ad unit ID is needed — vignettes are managed by Auto Ads.
 *
 * Publisher ID : ca-pub-8968729342650927
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-pub-8968729342650927';

declare global {
  interface Window {
    adsbygoogle: unknown[];
    adBreak?: (config: AdBreakConfig) => void;
  }
}

interface AdBreakConfig {
  type: 'start' | 'pause' | 'next' | 'browse' | 'reward';
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adDismissed?: () => void;
}

let adConfigured = false;

function ensureAdConfig() {
  if (typeof document === 'undefined' || adConfigured) return;
  adConfigured = true;

  if (!document.getElementById('adsense-vignette-script')) {
    const s = document.createElement('script');
    s.id = 'adsense-vignette-script';
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  window.adsbygoogle = window.adsbygoogle || [];
  (window.adsbygoogle as unknown[]).push({
    preloadAdBreaks: 'on',
    google_ad_client: PUBLISHER_ID,
  });
}

export interface RewardedAdButtonProps {
  onRewarded: () => void;
  onDismissed?: () => void;
  label?: string;
  sublabel?: string;
  coinsLabel?: string;
  disabled?: boolean;
}

export function RewardedAdButton({
  onRewarded,
  onDismissed,
  label = 'Watch a short ad',
  sublabel,
  coinsLabel,
  disabled = false,
}: RewardedAdButtonProps) {
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') ensureAdConfig();
  }, []);

  if (typeof window === 'undefined') return null;

  const handlePress = () => {
    if (disabled || loading || pendingRef.current) return;
    setLoading(true);
    pendingRef.current = true;

    const adBreak: (cfg: AdBreakConfig) => void =
      window.adBreak ??
      ((cfg) => {
        window.adsbygoogle = window.adsbygoogle || [];
        (window.adsbygoogle as unknown[]).push(cfg);
      });

    adBreak({
      type: 'next',
      name: 'lifecoins-vignette-reward',
      beforeAd: () => { /* fullscreen ad shown by SDK */ },
      afterAd: () => {
        // Fires after the ad is dismissed (watched or skipped).
        // Grant the reward here — best available mechanism on AdSense web.
        setLoading(false);
        pendingRef.current = false;
        onRewarded();
      },
      adDismissed: () => {
        setLoading(false);
        pendingRef.current = false;
        onDismissed?.();
      },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 13,
        paddingHorizontal: 20,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#fde68a',
        backgroundColor: pressed ? '#fffbeb' : '#fff',
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#d97706" />
      ) : (
        <Ionicons name="play-circle-outline" size={20} color="#d97706" />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400e' }}>
          {loading ? 'Loading ad…' : label}
        </Text>
        {sublabel && !loading && (
          <Text style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>{sublabel}</Text>
        )}
      </View>
      {coinsLabel && !loading && (
        <View
          style={{
            backgroundColor: '#fef3c7',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: '#fde68a',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#d97706' }}>{coinsLabel}</Text>
        </View>
      )}
    </Pressable>
  );
}
