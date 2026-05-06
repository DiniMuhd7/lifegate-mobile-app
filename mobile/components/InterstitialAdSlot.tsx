/**
 * InterstitialAdSlot.tsx — AdMob Interstitial Ad trigger row.
 *
 * Renders a compact tappable row.  On press it shows a full-screen
 * AdMob interstitial.  After the ad is dismissed the optional
 * onDismissed callback is fired.
 *
 * App ID  : ca-app-pub-3940256099942544~3347511713  (test — iOS)
 * App ID  : ca-app-pub-3940256099942544~1458002511  (test — Android)
 * Unit ID : ca-app-pub-3940256099942544/1033173712  (test interstitial)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID ?? TestIds.INTERSTITIAL;

export interface InterstitialAdSlotProps {
  /** Called after the ad is closed (regardless of whether a reward was given). */
  onDismissed?: () => void;
  /** Short label shown on the tap row. */
  label?: string;
}

export function InterstitialAdSlot({
  onDismissed,
  label = 'Support LifeGate — watch a short ad',
}: InterstitialAdSlotProps) {
  const interstitial = useRef(InterstitialAd.createForAdRequest(AD_UNIT_ID)).current;
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      setLoaded(true);
      setLoading(false);
    });
    const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      setLoaded(false);
      onDismissed?.();
      // Pre-load the next interstitial
      interstitial.load();
    });
    const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => {
      setLoading(false);
      setLoaded(false);
    });

    interstitial.load();

    return () => {
      unsubLoaded();
      unsubClosed();
      unsubError();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = () => {
    if (loading) return;
    if (loaded) {
      interstitial.show();
    } else {
      setLoading(true);
      interstitial.load();
    }
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
