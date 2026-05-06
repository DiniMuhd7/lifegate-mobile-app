/**
 * RewardedAdButton.tsx — AdMob Rewarded Ad for native (iOS / Android).
 *
 * App ID  : ca-app-pub-3940256099942544~3347511713  (test — iOS)
 * App ID  : ca-app-pub-3940256099942544~1458002511  (test — Android)
 * Unit ID : ca-app-pub-3940256099942544/5224354917  (test rewarded)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? TestIds.REWARDED;

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
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const rewarded = useRef(RewardedAd.createForAdRequest(AD_UNIT_ID)).current;

  useEffect(() => {
    const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setLoaded(true);
      setLoading(false);
    });
    const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      onRewarded();
    });
    const unsubClosed = rewarded.addAdEventListener('adClosed' as RewardedAdEventType, () => {
      setLoaded(false);
      onDismissed?.();
      // Preload the next ad
      rewarded.load();
    });

    rewarded.load();

    return () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
    };
  }, []);

  const handlePress = () => {
    if (disabled || loading) return;
    if (loaded) {
      rewarded.show();
    } else {
      setLoading(true);
      rewarded.load();
    }
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
