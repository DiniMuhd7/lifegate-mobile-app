/**
 * RewardedAdButton.web.tsx — self-hosted rewarded video for Expo Web.
 *
 * Web AdSense has no rewarded format, so this plays LifeGate's own promo
 * videos (hosted on Google Drive) in a fullscreen overlay. The reward is
 * granted ONLY when the video plays to the end ('ended' event); closing
 * early fires `onDismissed` with no reward — same contract as the native
 * AdMob rewarded flow in RewardedAdButton.tsx.
 *
 * Video sources: set EXPO_PUBLIC_WEB_REWARDED_VIDEO_URLS (comma-separated)
 * to override the built-in list.
 */
import React, { useRef, useState } from 'react';
import { Pressable, View, Text, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Google Drive direct-download links stream fine in an HTML5 <video> tag.
const DEFAULT_VIDEO_IDS = [
  '1MD05PTJXlKLif3s6YdAJUk5qfKeLzWQ8',
  '1eCUblwhPekf6cRF7xMg1kRuJWa3MTTC4',
  '1V_ndFSaDCJRLsq7aEWWFduxAE0j_ARmu',
  '1jBOL2o10PPF9aBXGwYnEpUphVaNqJB2y',
];

const VIDEO_URLS: string[] = (() => {
  const env = process.env.EXPO_PUBLIC_WEB_REWARDED_VIDEO_URLS;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  return DEFAULT_VIDEO_IDS.map(
    (id) => `https://drive.google.com/uc?export=download&id=${id}`
  );
})();

function pickVideoUrl(): string {
  return VIDEO_URLS[Math.floor(Math.random() * VIDEO_URLS.length)];
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
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const videoUrl = useRef<string>('');
  const completed = useRef(false);

  if (typeof window === 'undefined') return null;

  const open = () => {
    if (disabled || playing) return;
    videoUrl.current = pickVideoUrl();
    completed.current = false;
    setBuffering(true);
    setRemaining(null);
    setError(false);
    setPlaying(true);
  };

  const close = (rewarded: boolean) => {
    setPlaying(false);
    if (rewarded) onRewarded();
    else onDismissed?.();
  };

  return (
    <>
      <Pressable
        onPress={open}
        disabled={disabled || playing}
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
        <Ionicons name="play-circle-outline" size={20} color="#d97706" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400e' }}>{label}</Text>
          {sublabel && (
            <Text style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>{sublabel}</Text>
          )}
        </View>
        {coinsLabel && (
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

      <Modal visible={playing} transparent animationType="fade" onRequestClose={() => close(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.95)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Close (no reward) */}
          <Pressable
            onPress={() => close(completed.current)}
            style={{
              position: 'absolute',
              top: 20,
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

          {/* Countdown / status chip */}
          <View
            style={{
              position: 'absolute',
              top: 24,
              left: 20,
              zIndex: 10,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {error
                ? 'Could not load video'
                : completed.current
                  ? 'Reward earned 🎉'
                  : remaining !== null
                    ? `Reward in ${remaining}s`
                    : 'Loading…'}
            </Text>
          </View>

          {buffering && !error && (
            <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute' }} />
          )}

          {error ? (
            <Pressable
              onPress={() => close(false)}
              style={{
                backgroundColor: '#fff',
                borderRadius: 12,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontWeight: '700', color: '#111' }}>Close</Text>
            </Pressable>
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={videoUrl.current}
              autoPlay
              playsInline
              // No controls — the user must watch to the end to earn the
              // reward; seeking/skipping would defeat the mechanic.
              controls={false}
              style={{ width: '100%', maxWidth: 720, maxHeight: '80%' }}
              onCanPlay={() => setBuffering(false)}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => setBuffering(false)}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (Number.isFinite(v.duration) && v.duration > 0) {
                  setRemaining(Math.max(0, Math.ceil(v.duration - v.currentTime)));
                }
              }}
              onEnded={() => {
                completed.current = true;
                setRemaining(0);
                // Brief beat so the "Reward earned" chip is visible.
                setTimeout(() => close(true), 900);
              }}
              onError={() => {
                setBuffering(false);
                setError(true);
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}
