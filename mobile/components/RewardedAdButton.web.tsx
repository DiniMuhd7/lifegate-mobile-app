/**
 * RewardedAdButton.web.tsx — AdSense Rewarded Ad for Expo Web.
 *
 * Uses the adsbygoogle adBreak() API with type='reward'.
 * Requires a dedicated AdSense rewarded web unit created at:
 *   adsense.google.com → Ads → By ad unit → Rewarded ad
 * Set EXPO_PUBLIC_ADMOB_WEB_REWARDED_UNIT_ID=ca-pub-XXXXXXXX/SLOT_ID
 *
 * `onRewarded` is invoked only when the user watches the full ad.
 * The button is hidden on dev/unapproved origins (same rule as BannerAd.web.tsx).
 *
 * Publisher ID : ca-pub-8968729342650927
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-pub-8968729342650927';
// Must be an AdSense *rewarded web* unit: ca-pub-XXXXXXXX/SLOT_ID
// Do NOT reuse the banner or interstitial slot IDs here.
const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_REWARDED_UNIT_ID ?? undefined;

declare global {
  interface Window {
    adsbygoogle: unknown[];
    adBreak?: (config: AdBreakConfig) => void;
  }
}

interface AdBreakConfig {
  type: 'reward';
  adUnitId?: string;
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
}

// Dev-mode: always enabled so test ads render on localhost / Codespaces.
function isProduction(): boolean {
  return typeof window !== 'undefined';
}

let adConfigured = false;

function ensureAdConfig() {
  if (typeof document === 'undefined' || adConfigured) return;
  adConfigured = true;

  // Load adsbygoogle SDK once.
  if (!document.getElementById('adsense-rewarded-script')) {
    const s = document.createElement('script');
    s.id = 'adsense-rewarded-script';
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  // Initialize adsbygoogle array before any push (required by the SDK).
  window.adsbygoogle = window.adsbygoogle || [];
  // H5 Ads config — must be pushed exactly once before any adBreak calls.
  (window.adsbygoogle as unknown[]).push({
    preloadAdBreaks: 'on',
    google_ad_client: PUBLISHER_ID,
  });
}

export interface RewardedAdButtonProps {
  /** Called when the user finishes watching the full ad. Grant the reward here. */
  onRewarded: () => void;
  /** Called when the user dismisses the ad early (no reward). */
  onDismissed?: () => void;
  label?: string;
  sublabel?: string;
  /** Short pill shown on the right edge, e.g. "+5 LC". */
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

  useEffect(() => {
    ensureAdConfig();
  }, []);

  // Hidden on non-production origins.
  if (!isProduction()) return null;

  const handlePress = () => {
    if (disabled || loading) return;
    setLoading(true);

    // Use window.adBreak if the SDK has already loaded it, otherwise fall
    // back to pushing it via the adsbygoogle array.
    const adBreak: (cfg: AdBreakConfig) => void =
      window.adBreak ??
      ((cfg) => {
        (window.adsbygoogle as unknown[]).push(cfg);
      });

    adBreak({
      type: 'reward',
      ...(AD_UNIT_ID ? { adUnitId: AD_UNIT_ID } : {}),
      name: 'lifecoins-reward',
      beforeAd: () => { /* ad is shown fullscreen by the SDK */ },
      afterAd: () => { setLoading(false); },
      adDismissed: () => {
        setLoading(false);
        onDismissed?.();
      },
      adViewed: () => {
        onRewarded();
      },
      beforeReward: (showAd) => { showAd(); },
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
