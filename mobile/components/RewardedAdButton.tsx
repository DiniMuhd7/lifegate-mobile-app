/**
 * RewardedAdButton.tsx — self-hosted rewarded video button (all platforms).
 *
 * Third-party ad networks have been removed. Pressing the button plays one
 * of LifeGate's promo videos fullscreen (HouseVideoAd); the reward is
 * granted ONLY when the video plays to the end. Closing early fires
 * `onDismissed` with no reward.
 */
import React, { useState } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HouseVideoAd } from './HouseVideoAd';

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
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => { if (!disabled && !playing && !unavailable) setPlaying(true); }}
        disabled={disabled || playing || unavailable}
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
          opacity: disabled || unavailable ? 0.5 : 1,
        })}
      >
        <Ionicons name="play-circle-outline" size={20} color="#d97706" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400e' }}>
            {unavailable ? 'No ad available right now' : label}
          </Text>
          {sublabel && !unavailable && (
            <Text style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>{sublabel}</Text>
          )}
        </View>
        {coinsLabel && !unavailable && (
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

      <HouseVideoAd
        visible={playing}
        onCompleted={() => { setPlaying(false); onRewarded(); }}
        onClosed={() => { setPlaying(false); onDismissed?.(); }}
        onError={() => { setPlaying(false); setUnavailable(true); onDismissed?.(); }}
      />
    </>
  );
}
