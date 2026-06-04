/**
 * High-Frequency Audiometry Screen (9–12 kHz)
 *
 * Extended-range testing beyond the standard PTA sweep (8 kHz).
 * Tests at 9, 10, and 12 kHz which are accessible on most consumer headphones.
 *
 * Uses the same Hughson-Westlake staircase as PTA:
 *   ↓10 dB on "heard", ↑5 dB on "not heard", done after 3 ascending reversals.
 *
 * Flow: 9 kHz → 10 kHz → 12 kHz → results
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import { File as FSFile, Paths as FSPaths } from 'expo-file-system';
import { useHearingStore } from 'stores/hearing-store';
import { generateStereoToneWAV } from 'services/audio-calibration-engine';
import {
  hfDbHLToAmplitude,
  estimateHFThreshold,
  HF_PATTERN_LABEL,
  HF_PATTERN_COLOR,
  HF_PATTERN_ICON,
} from 'services/hf-audiometry-engine';
import type { HFFrequency } from 'types/hearing-types';
import { HF_FREQUENCIES } from 'types/hearing-types';

// ─── Constants ─────────────────────────────────────────────────────────────

const TEAL   = '#0AADA2';
const TEAL_D = '#0f766e';

/** Randomised inter-trial interval to prevent rhythmic anticipation */
const ITI_MIN_MS = 400;
const ITI_MAX_MS = 800;
function randomITI(): number {
  return Math.round(ITI_MIN_MS + Math.random() * (ITI_MAX_MS - ITI_MIN_MS));
}

/** Maximum time (ms) the user has to respond before auto-advancing. */
const RESPONSE_TIMEOUT_MS = 3_000;

const HF_FREQ_COLORS: Record<HFFrequency, string> = {
  9000:  '#f59e0b',
  10000: '#ef4444',
  12000: '#a855f7',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function freqLabel(hz: HFFrequency): string {
  return `${hz / 1000} kHz`;
}

/** Progress bar strip showing 3 frequency slots */
function FreqStrip({ currentIdx }: { currentIdx: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 18, marginBottom: 12 }}>
      {HF_FREQUENCIES.map((f, i) => (
        <View
          key={f}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor:
              i < currentIdx  ? TEAL :
              i === currentIdx ? '#fff' :
              '#1f2937',
          }}
        />
      ))}
    </View>
  );
}

/** Mini bar chart of HF thresholds collected so far */
function HFMiniChart({ hfFreqIndex, hfStaircases }: {
  hfFreqIndex: number;
  hfStaircases: Record<HFFrequency, import('types/hearing-types').HFStaircase>;
}) {
  const completed = HF_FREQUENCIES.slice(0, hfFreqIndex);
  if (completed.length === 0) {
    return (
      <Text style={{ fontSize: 12, color: '#374151', textAlign: 'center', paddingVertical: 16 }}>
        Thresholds will appear as each frequency completes
      </Text>
    );
  }

  const BAR_MAX_H = 80;
  const DBHL_MAX  = 80;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 18, paddingVertical: 8 }}>
      {completed.map((f) => {
        const dbHL  = estimateHFThreshold(hfStaircases[f]);
        const barH  = Math.max(6, (dbHL / DBHL_MAX) * BAR_MAX_H);
        const color = HF_FREQ_COLORS[f];
        return (
          <View key={f} style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 10, color, fontWeight: '700' }}>{dbHL} dB</Text>
            <View style={{ width: 32, height: barH, backgroundColor: color, borderRadius: 4, opacity: 0.85 }} />
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{freqLabel(f)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main HF screen ──────────────────────────────────────────────────────────

export default function HFTest() {
  const {
    hfFreqIndex,
    hfStaircases,
    hfResult,
    deviceProfile,
    recordHFTrial,
    finaliseHFFreq,
    finaliseHF,
    startHFTest,
  } = useHearingStore();

  const soundRef   = useRef<Audio.Sound | null>(null);
  const trialStart = useRef(0);
  const blobUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<'intro' | 'countdown' | 'playing' | 'waiting' | 'responded' | 'done'>('intro');
  const [countdown, setCountdown] = useState(3);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const currentFreq      = HF_FREQUENCIES[hfFreqIndex] as HFFrequency;
  const currentStaircase = hfStaircases[currentFreq];

  // ── Reset HF state on mount ─────────────────────────────────────────────
  useEffect(() => {
    startHFTest();
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // ── Pulse while playing ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'playing') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.16, duration: 420, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 420, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // ── Countdown ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          playCurrentTone();
          return 0;
        }
        return c - 1;
      });
    }, 1_000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Play tone ────────────────────────────────────────────────────────────
  const playCurrentTone = useCallback(async () => {
    const state = useHearingStore.getState();
    const freq  = HF_FREQUENCIES[state.hfFreqIndex] as HFFrequency;
    const s     = state.hfStaircases[freq];
    if (s.done) return;

    setPhase('playing');
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      const amplitude = hfDbHLToAmplitude(
        s.currentDbHL,
        freq,
        state.deviceProfile.estimatedMaxDbSPL,
      );

      // Route both channels with equal amplitude (no lateralisation for HF)
      const wavBytes = generateStereoToneWAV(freq, 1_500, amplitude, 'both');

      // Revoke any previous web blob URL to free memory
      if (Platform.OS === 'web' && blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      let audioUri: string;
      if (Platform.OS === 'web') {
        const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        audioUri = URL.createObjectURL(blob);
        blobUrlRef.current = audioUri;
      } else {
        const wavFile  = new FSFile(FSPaths.cache, `hf_${freq}_${s.currentDbHL}.wav`);
        wavFile.write(wavBytes);
        audioUri = wavFile.uri;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, volume: 1.0 },
      );
      soundRef.current = sound;
      trialStart.current = Date.now();

      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && st.didJustFinish) {
          if (Platform.OS === 'web' && blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          setPhase('waiting');
          // Response window; default to "not heard" on timeout
          setTimeout(() => {
            setPhase((prev) => {
              if (prev === 'waiting') {
                handleResponse(false);
                return 'responded';
              }
              return prev;
            });
          }, RESPONSE_TIMEOUT_MS);
        }
      });
    } catch (e) {
      console.warn('HF tone error:', e);
      setPhase('waiting');
      // Auto-timeout in error path so the test is never stuck waiting
      setTimeout(() => {
        setPhase((prev) => {
          if (prev === 'waiting') {
            handleResponse(false);
            return 'responded';
          }
          return prev;
        });
      }, RESPONSE_TIMEOUT_MS);
    }
  }, []);

  // ── Response handler ─────────────────────────────────────────────────────
  const handleResponse = useCallback((heard: boolean) => {
    setPhase('responded');
    const reactionMs = Date.now() - trialStart.current;
    soundRef.current?.stopAsync().catch(() => {});

    recordHFTrial(heard, reactionMs);

    setTimeout(() => {
      const state   = useHearingStore.getState();
      const freq    = HF_FREQUENCIES[state.hfFreqIndex] as HFFrequency;
      const updated = state.hfStaircases[freq];

      if (updated.done) {
        const nextIdx = state.hfFreqIndex + 1;
        if (nextIdx >= HF_FREQUENCIES.length) {
          finaliseHF();
          setPhase('done');
        } else {
          finaliseHFFreq();
          setCountdown(3);
          setPhase('countdown');
        }
      } else {
        setCountdown(2);
        setPhase('countdown');
      }
    }, randomITI());
  }, [recordHFTrial, finaliseHFFreq, finaliseHF]);

  // ── Navigate when done ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => {
      router.replace('/(tab)/hearingtest/results' as never);
    }, 2_000);
    return () => clearTimeout(t);
  }, [phase]);

  // ─────────────────────────────────────────────────────────────────────────
  //  Intro screen
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === 'intro') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, paddingHorizontal: 24 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 12, marginBottom: 32, alignSelf: 'flex-start', padding: 6 }}
          >
            <Ionicons name="chevron-back" size={24} color="#6b7280" />
          </Pressable>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#2d1a00', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="stats-chart-outline" size={40} color="#f59e0b" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'center' }}>
              High-Frequency Test
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ backgroundColor: '#1f2937', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>~3 min</Text>
              </View>
              <View style={{ backgroundColor: '#1f2937', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>3 frequencies</Text>
              </View>
            </View>
            <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 24 }}>
              Testing at{' '}
              <Text style={{ color: '#f59e0b', fontWeight: '700' }}>9, 10, and 12 kHz</Text>
              {' '}to detect early high-frequency hearing loss — an early indicator of noise damage before standard tests change.
            </Text>

            <View style={{ backgroundColor: '#1f2937', borderRadius: 14, padding: 14, gap: 10, width: '100%' }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="headset-outline" size={18} color="#f59e0b" />
                <Text style={{ flex: 1, fontSize: 13, color: '#d1d5db', lineHeight: 20 }}>
                  Wear over-ear headphones for best accuracy at these frequencies.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="notifications-off-outline" size={18} color="#f59e0b" />
                <Text style={{ flex: 1, fontSize: 13, color: '#d1d5db', lineHeight: 20 }}>
                  Sit in a quiet room — high-frequency tones are very soft.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle-outline" size={18} color="#6b7280" />
                <Text style={{ flex: 1, fontSize: 12, color: '#6b7280', lineHeight: 18 }}>
                  Consumer headphone accuracy above 8 kHz varies. Results are indicative only.
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
              backgroundColor: pressed ? '#b45309' : '#f59e0b',
              alignItems: 'center',
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111' }}>Begin Test</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Done screen
  // ─────────────────────────────────────────────────────────────────────────

  if (phase === 'done' && hfResult) {
    const patColor = HF_PATTERN_COLOR[hfResult.pattern];
    const patIcon  = HF_PATTERN_ICON[hfResult.pattern];
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 40 }}>{patIcon}</Text>
        <Text style={{ fontSize: 20, fontWeight: '900', color: patColor }}>
          {HF_PATTERN_LABEL[hfResult.pattern]}
        </Text>
        <Text style={{ fontSize: 14, color: '#d1d5db' }}>
          HF Average: {hfResult.hfAverage} dBHL
        </Text>
        {hfResult.nihlRiskFlag && (
          <View style={{ backgroundColor: '#7f1d1d', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: '#fca5a5', fontWeight: '700' }}>
              ⚠️ NIHL risk pattern detected
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Returning to results…</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Test screen
  // ─────────────────────────────────────────────────────────────────────────

  const freqColor = HF_FREQ_COLORS[currentFreq];
  const currentDbHL = currentStaircase?.currentDbHL ?? 60;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>High-Frequency Test</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>
              {freqLabel(currentFreq)} · {currentDbHL} dBHL
            </Text>
          </View>

          {/* Frequency badge */}
          <View style={{ backgroundColor: `${freqColor}22`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: freqColor }}>
              {freqLabel(currentFreq)}
            </Text>
          </View>
        </View>

        {/* Frequency strip */}
        <FreqStrip currentIdx={hfFreqIndex} />

        {/* Mini chart of completed thresholds */}
        <View style={{ backgroundColor: '#111827', marginHorizontal: 18, borderRadius: 14, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Thresholds collected</Text>
          <HFMiniChart hfFreqIndex={hfFreqIndex} hfStaircases={hfStaircases} />
        </View>

        {/* Central interaction */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>

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
                phase === 'playing' ? freqColor :
                phase === 'waiting'  ? '#4b5563' :
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
                <Ionicons name="radio-outline" size={48} color={freqColor} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: freqColor }}>Playing…</Text>
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

          {/* dBHL indicator */}
          <View style={{ marginTop: 24, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, color: '#4b5563' }}>Current level</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', color: '#fff' }}>
              {currentDbHL} <Text style={{ fontSize: 14, color: '#6b7280' }}>dBHL</Text>
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
                flex: 1.5,
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
