/**
 * HouseVideoAd.tsx — fullscreen self-hosted video ad (cross-platform).
 *
 * Plays one of LifeGate's promo videos (utils/houseVideos.ts) in a modal.
 * Fallback ad inventory for flows that normally show an AdMob/AdSense
 * interstitial but got no fill.
 *
 *  - `onCompleted` fires only when the video plays to the end.
 *  - `onClosed` fires when the user closes early (no reward).
 *  - `onError` fires if the video cannot load at all.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { pickHouseVideoUrl } from '../utils/houseVideos';

export interface HouseVideoAdProps {
  visible: boolean;
  onCompleted: () => void;
  onClosed: () => void;
  onError?: () => void;
}

export function HouseVideoAd({ visible, onCompleted, onClosed, onError }: HouseVideoAdProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const completed = useRef(false);

  // Pick a fresh video each time the modal opens.
  useEffect(() => {
    if (visible) {
      completed.current = false;
      setBuffering(true);
      setRemaining(null);
      setUrl(pickHouseVideoUrl());
    } else {
      setUrl(null);
    }
  }, [visible]);

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) onError?.();
      return;
    }
    setBuffering(status.isBuffering && !status.isPlaying);
    if (status.durationMillis) {
      setRemaining(
        Math.max(0, Math.ceil((status.durationMillis - status.positionMillis) / 1000))
      );
    }
    if (status.didJustFinish && !completed.current) {
      completed.current = true;
      onCompleted();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClosed}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.96)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Close (no reward) */}
        <Pressable
          onPress={onClosed}
          style={{
            position: 'absolute',
            top: 44,
            right: 20,
            zIndex: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>

        {/* Countdown chip */}
        <View
          style={{
            position: 'absolute',
            top: 48,
            left: 20,
            zIndex: 10,
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {remaining !== null ? `Reward in ${remaining}s` : 'Loading…'}
          </Text>
        </View>

        {buffering && (
          <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute', zIndex: 5 }} />
        )}

        {url && (
          <Video
            source={{ uri: url }}
            shouldPlay
            isLooping={false}
            // No playback controls — the video must play through for the reward.
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            style={{ width: '100%', height: '80%' }}
            onPlaybackStatusUpdate={handleStatus}
            onError={() => onError?.()}
          />
        )}
      </View>
    </Modal>
  );
}
