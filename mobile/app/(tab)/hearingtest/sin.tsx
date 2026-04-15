/**
 * Speech-in-Noise (SIN) Test Screen — QuickSIN-inspired
 *
 * Protocol
 * ────────
 * Six SNR levels in descending order: +20 → +15 → +10 → +5 → 0 → −5 dBSNR.
 * At each level a 1–2 kHz tone is embedded in white-noise masker at the
 * calibrated SNR.  The patient presses "I heard it" or "Didn't hear it".
 *
 * SNR50 is computed by linear interpolation between the last-heard and
 * first-missed adjacent levels.  SNR Loss = SNR50 − 0 (normal reference).
 *
 * Clinical interpretation (adapted from QuickSIN norms):
 *   0–2 dB loss  → Normal
 *   3–7 dB       → Mild
 *   8–15 dB      → Moderate
 *   >15 dB       → Severe
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import { File as FSFile, Paths as FSPaths } from 'expo-file-system';
import { useHearingStore } from 'stores/hearing-store';
import {
  generateToneInNoiseStereoWAV,
  SIN_BASE_NOISE_AMPLITUDE,
} from 'services/audio-calibration-engine';
import {
  getSINLevels,
  sinLevelFrequency,
  SIN_STIMULUS_MS,
  SIN_GRADE_COLOR,
  SIN_GRADE_ICON,
} from 'services/speech-in-noise-engine';
import type { SNRLevel } from 'types/hearing-types';

// ─── Constants ─────────────────────────────────────────────────────────────

const TEAL   = '#0AADA2';
const TEAL_D = '#0f766e';
const LEVELS = getSINLevels(); // [20, 15, 10, 5, 0, -5]

/** ms before first level / between levels */
const INTER_LEVEL_MS = 1_200;

// ─── SNR label helpers ──────────────────────────────────────────────────────

function snrLabel(snrDB: SNRLevel): string {
  return snrDB >= 0 ? `+${snrDB} dBSNR` : `${snrDB} dBSNR`;
}

function snrDifficulty(snrDB: SNRLevel): string {
  if (snrDB >= 15) return 'Very easy';
  if (snrDB >= 10) return 'Easy';
  if (snrDB >= 5)  return 'Moderate';
  if (snrDB >= 0)  return 'Hard';
  return 'Very hard';
}

// ─── Level indicator dots ───────────────────────────────────────────────────

function LevelDots({ current }: { current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {LEVELS.map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 12 : 8,
            height: i === current ? 12 : 8,
            borderRadius: 8,
            backgroundColor:
              i < current  ? TEAL :
              i === current ? '#fff' :
              '#374151',
          }}
        />
      ))}
    </View>
  );
}

// ─── Main SIN screen ─────────────────────────────────────────────────────────

export default function SINTest() {
  const {
    sinLevelIndex,
    sinResult,
    deviceProfile,
    recordSINTrial,
    advanceSINLevel,
    finaliseSIN,
    startSINTest,
  } = useHearingStore();

  const soundRef   = useRef<Audio.Sound | null>(null);
  const trialStart = useRef(0);

  const [phase, setPhase] = useState<'intro' | 'countdown' | 'playing' | 'waiting' | 'responded' | 'done'>('intro');
  const [countdown, setCountdown] = useState(3);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const currentLevel = LEVELS[sinLevelIndex] as SNRLevel;

  // ── Guard: reset SIN state on mount ──────────────────────────────────────
  useEffect(() => {
    startSINTest();
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // ── Pulse animation while playing ────────────────────────────────────────
  useEffect(() => {
    if (phase === 'playing') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // ── Countdown ticker ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          playLevel();
          return 0;
        }
        return c - 1;
      });
    }, 1_000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Play current SNR level ─────────────────────────────────────────────
  const playLevel = useCallback(async () => {
    setPhase('playing');
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      const level = LEVELS[useHearingStore.getState().sinLevelIndex] as SNRLevel;
      const freq  = sinLevelFrequency(level);
      const wavBytes = generateToneInNoiseStereoWAV(
        freq,
        SIN_STIMULUS_MS,
        level,
        SIN_BASE_NOISE_AMPLITUDE,
      );

      const wavFile = new FSFile(FSPaths.cache, `sin_level_${level}.wav`);
      wavFile.write(wavBytes);

      const { sound } = await Audio.Sound.createAsync(
        { uri: wavFile.uri },
        { shouldPlay: true, volume: 1.0 },
      );
      soundRef.current = sound;
      trialStart.current = Date.now();

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          setPhase('waiting');
          // 5-second response window; default to "not heard" on timeout
          setTimeout(() => {
            setPhase((prev) => {
              if (prev === 'waiting') {
                handleResponse(false);
                return 'responded';
              }
              return prev;
            });
          }, 5_000);
        }
      });
    } catch (e) {
      console.warn('SIN playback error:', e);
      setPhase('waiting');
    }
  }, []);

  // ── Response handler ──────────────────────────────────────────────────
  const handleResponse = useCallback((heard: boolean) => {
    setPhase('responded');
    const reactionMs = Date.now() - trialStart.current;
    soundRef.current?.stopAsync().catch(() => {});

    recordSINTrial(heard, reactionMs);

    setTimeout(() => {
      const state = useHearingStore.getState();
      const nextIdx = state.sinLevelIndex + 1;
      if (nextIdx >= LEVELS.length) {
        finaliseSIN();
        setPhase('done');
      } else {
        advanceSINLevel();
        setCountdown(2);
        setPhase('countdown');
      }
    }, INTER_LEVEL_MS);
  }, [recordSINTrial, advanceSINLevel, finaliseSIN]);

  // ── Navigate when done ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => {
      router.replace('/(tab)/hearingtest/results' as never);
    }, 1_800);
    return () => clearTimeout(t);
  }, [phase]);

  // ─────────────────────────────────────────────────────────────────────
  //  Intro screen
  // ─────────────────────────────────────────────────────────────────────

  if (phase === 'intro') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, paddingHorizontal: 24 }}>
          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 12, marginBottom: 32, alignSelf: 'flex-start', padding: 6 }}
          >
            <Ionicons name="chevron-back" size={24} color="#6b7280" />
          </Pressable>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#0d2b29', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ear-outline" size={42} color={TEAL} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'center' }}>
              Speech-in-Noise
            </Text>
            <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 24 }}>
              You will hear tones embedded in background noise at{' '}
              <Text style={{ color: '#fff', fontWeight: '700' }}>6 difficulty levels</Text>.{'\n\n'}
              Press{' '}
              <Text style={{ color: TEAL, fontWeight: '700' }}>"I heard it"</Text>{' '}
              as soon as you detect the tone. If you don't hear anything, press{' '}
              <Text style={{ color: '#ef4444', fontWeight: '700' }}>"Didn't hear it"</Text>.
            </Text>

            <View style={{ backgroundColor: '#1f2937', borderRadius: 14, padding: 14, gap: 10, width: '100%' }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="headset-outline" size={18} color={TEAL} />
                <Text style={{ flex: 1, fontSize: 13, color: '#d1d5db', lineHeight: 20 }}>
                  Wear headphones or earbuds. This test works best in a quiet room.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="volume-high-outline" size={18} color={TEAL} />
                <Text style={{ flex: 1, fontSize: 13, color: '#d1d5db', lineHeight: 20 }}>
                  The noise level stays constant. Only the tone level changes.
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => {
              setCountdown(3);
              setPhase('countdown');
            }}
            style={({ pressed }) => ({
              marginBottom: 20,
              paddingVertical: 16,
              borderRadius: 16,
              backgroundColor: pressed ? TEAL_D : TEAL,
              alignItems: 'center',
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Begin Test</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Done screen (brief 1.8 s before auto-navigate)
  // ─────────────────────────────────────────────────────────────────────

  if (phase === 'done' && sinResult) {
    const gradeColor = SIN_GRADE_COLOR[sinResult.grade];
    const gradeIcon  = SIN_GRADE_ICON[sinResult.grade];
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 40 }}>{gradeIcon}</Text>
        <Text style={{ fontSize: 20, fontWeight: '900', color: gradeColor }}>{sinResult.label}</Text>
        <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
          SNR Loss: {sinResult.snrLoss.toFixed(1)} dB · SNR₅₀: {sinResult.snr50.toFixed(1)} dBSNR
        </Text>
        <Text style={{ fontSize: 12, color: '#6b7280' }}>Returning to results…</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Test screen (countdown / playing / waiting / responded)
  // ─────────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Speech-in-Noise Test</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>
              Level {sinLevelIndex + 1} of {LEVELS.length}
            </Text>
          </View>
          <View style={{ backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af' }}>
              {snrLabel(currentLevel)}
            </Text>
          </View>
        </View>

        {/* Level progress dots */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <LevelDots current={sinLevelIndex} />
          <Text style={{ fontSize: 10, color: '#4b5563', marginTop: 4 }}>
            {snrDifficulty(currentLevel)}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={{ marginHorizontal: 18, marginBottom: 20 }}>
          <View style={{ height: 3, backgroundColor: '#1f2937', borderRadius: 2 }}>
            <View style={{
              height: 3,
              width: `${((sinLevelIndex) / LEVELS.length) * 100}%`,
              backgroundColor: TEAL,
              borderRadius: 2,
            }} />
          </View>
        </View>

        {/* Central area */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>

          {/* Noise + tone visualiser */}
          <Animated.View
            style={{
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: '#111827',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor:
                phase === 'playing' ? TEAL :
                phase === 'waiting' ? '#4b5563' :
                '#1f2937',
              transform: [{ scale: pulseAnim }],
            }}
          >
            {phase === 'countdown' && (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#fff' }}>{countdown}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Get ready…</Text>
              </View>
            )}
            {phase === 'playing' && (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name="radio-outline" size={48} color={TEAL} />
                <Text style={{ fontSize: 13, color: TEAL, fontWeight: '700' }}>Listening…</Text>
              </View>
            )}
            {(phase === 'waiting' || phase === 'responded') && (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name="help-circle-outline" size={48} color="#6b7280" />
                <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '700' }}>
                  {phase === 'waiting' ? 'Did you hear it?' : 'Recorded'}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* SNR level info */}
          <View style={{ marginTop: 24, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#d1d5db' }}>
              Signal-to-Noise Ratio
            </Text>
            <Text style={{
              fontSize: 28,
              fontWeight: '900',
              color:
                currentLevel >= 10 ? '#22c55e' :
                currentLevel >= 0  ? '#f59e0b' :
                '#ef4444',
            }}>
              {snrLabel(currentLevel)}
            </Text>
          </View>
        </View>

        {/* Response buttons */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 28, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              disabled={phase !== 'waiting'}
              onPress={() => handleResponse(false)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 18,
                borderRadius: 16,
                backgroundColor:
                  phase !== 'waiting' ? '#1a1a2e' :
                  pressed ? '#7f1d1d' : '#991b1b',
                alignItems: 'center',
                opacity: phase !== 'waiting' ? 0.4 : 1,
              })}
            >
              <Ionicons name="close-circle-outline" size={26} color={phase === 'waiting' ? '#fca5a5' : '#4b5563'} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: phase === 'waiting' ? '#fca5a5' : '#4b5563', marginTop: 4 }}>
                Didn't hear it
              </Text>
            </Pressable>

            <Pressable
              disabled={phase !== 'waiting'}
              onPress={() => handleResponse(true)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 18,
                borderRadius: 16,
                backgroundColor:
                  phase !== 'waiting' ? '#1a1a2e' :
                  pressed ? TEAL_D : TEAL,
                alignItems: 'center',
                opacity: phase !== 'waiting' ? 0.4 : 1,
              })}
            >
              <Ionicons name="checkmark-circle-outline" size={26} color={phase === 'waiting' ? '#fff' : '#4b5563'} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: phase === 'waiting' ? '#fff' : '#4b5563', marginTop: 4 }}>
                I heard it
              </Text>
            </Pressable>
          </View>

          {/* Abort button */}
          <Pressable
            onPress={() => router.replace('/(tab)/hearingtest/results' as never)}
            style={{ alignItems: 'center', padding: 8 }}
          >
            <Text style={{ fontSize: 12, color: '#4b5563' }}>Skip test</Text>
          </Pressable>
        </View>

      </SafeAreaView>
    </View>
  );
}
