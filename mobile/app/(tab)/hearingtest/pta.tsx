/**
 * PTA Test Screen — Adaptive Pure Tone Audiometry
 *
 * Modified Hughson-Westlake staircase:
 *   Down 10 dB on heard, Up 5 dB on not-heard.
 *   Done after 3 ascending reversals; threshold = mean of ascending levels.
 *
 * Frequency sweep: 250 → 500 → 1k → 2k → 4k → 8k Hz
 * Each subsequent frequency starts near the prior threshold (adaptive).
 *
 * Ear isolation:
 *   Tones are generated as stereo WAV files. The tone is routed exclusively
 *   to the channel matching the ear under test; the opposite channel carries
 *   digital silence.  This prevents cross-ear contamination without masking.
 *
 * Flow:
 *   Right ear (250→8 kHz) → Left ear (250→8 kHz) → results
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import { File as FSFile, Paths as FSPaths } from 'expo-file-system';
import { useHearingStore } from 'stores/hearing-store';
import {
  generateStereoToneWAV,
  dbHLToAmplitude,
  analyzeNoiseSamples,
} from 'services/audio-calibration-engine';
import { estimateThreshold } from 'services/pta-engine';
import type { PTAFrequency, TestEar } from 'types/hearing-types';
import { PTA_FREQUENCIES } from 'types/hearing-types';

// ─── Inter-trial gap jitter ───────────────────────────────────────────────────
// Randomise the gap between response and next tone presentation to eliminate
// rhythmic anticipation (a known source of false positives in automated PTA).
const ITI_MIN_MS = 800;
const ITI_MAX_MS = 1_800;
function randomITI(): number {
  return Math.round(ITI_MIN_MS + Math.random() * (ITI_MAX_MS - ITI_MIN_MS));
}

const TEAL   = '#0AADA2';
const TEAL_D = '#0f766e';
const VIOLET = '#7c3aed';
const SCREEN_W = Dimensions.get('window').width;

// ─── Frequency label helpers ──────────────────────────────────────────────────

function freqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

const FREQ_COLORS: Record<PTAFrequency, string> = {
  250:  '#6366f1',
  500:  '#3b82f6',
  1000: '#0AADA2',
  2000: '#16a34a',
  4000: '#d97706',
  8000: '#dc2626',
};

// ─── Mini audiogram chart ──────────────────────────────────────────────────────

const CHART_W = SCREEN_W - 48;
const CHART_H = 130;
const DBHL_CHART_MIN = -10;
const DBHL_CHART_MAX = 90;

function MiniAudiogram({
  thresholds,
  ear,
}: {
  thresholds: Array<{ frequency: PTAFrequency; dbHL: number }>;
  ear: TestEar;
}) {
  if (thresholds.length === 0) return null;

  const xFor = (freq: PTAFrequency) => {
    const idx = PTA_FREQUENCIES.indexOf(freq);
    return (idx / (PTA_FREQUENCIES.length - 1)) * CHART_W;
  };

  const yFor = (dbHL: number) => {
    const normalised = (dbHL - DBHL_CHART_MIN) / (DBHL_CHART_MAX - DBHL_CHART_MIN);
    return normalised * CHART_H;
  };

  return (
    <View style={{ width: CHART_W, height: CHART_H + 20, alignSelf: 'center', marginVertical: 8 }}>
      {/* Grid lines at 0, 25, 50, 75 dBHL */}
      {[0, 25, 50, 75].map((db) => (
        <View
          key={db}
          style={{
            position: 'absolute',
            left: 0, right: 0,
            top: yFor(db),
            height: 1,
            backgroundColor: db === 25 ? '#bbf7d0' : '#f3f4f6',
          }}
        />
      ))}
      <Text style={{ position: 'absolute', left: 0, top: yFor(25) - 12, fontSize: 9, color: '#9ca3af' }}>25</Text>
      <Text style={{ position: 'absolute', left: 0, top: yFor(50) - 12, fontSize: 9, color: '#9ca3af' }}>50</Text>
      <Text style={{ position: 'absolute', left: 0, top: yFor(75) - 12, fontSize: 9, color: '#9ca3af' }}>75</Text>

      {/* Threshold dots + connecting lines */}
      {thresholds.map((t, i) => {
        const x = xFor(t.frequency);
        const y = yFor(t.dbHL);
        const color = FREQ_COLORS[t.frequency];

        return (
          <React.Fragment key={t.frequency}>
            {/* Connector line to previous point */}
            {i > 0 && (() => {
              const prev = thresholds[i - 1];
              const px = xFor(prev.frequency);
              const py = yFor(prev.dbHL);
              const dx = x - px;
              const dy = y - py;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              return (
                <View
                  style={{
                    position: 'absolute',
                    left: px,
                    top: py,
                    width: len,
                    height: 2,
                    backgroundColor: '#d1d5db',
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: '0 1px',
                  } as any}
                />
              );
            })()}

            {/* Symbol: O for right, X for left */}
            <View
              style={{
                position: 'absolute',
                left: x - 10,
                top: y - 10,
                width: 20,
                height: 20,
                borderRadius: ear === 'right' ? 10 : 0,
                backgroundColor: ear === 'right' ? 'transparent' : 'transparent',
                borderWidth: 2.5,
                borderColor: color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ear === 'left' && (
                <>
                  <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
                  <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
                </>
              )}
            </View>
          </React.Fragment>
        );
      })}

      {/* Frequency labels at bottom */}
      {PTA_FREQUENCIES.map((f) => (
        <Text
          key={f}
          style={{
            position: 'absolute',
            left: xFor(f) - 16,
            top: CHART_H + 4,
            fontSize: 8,
            color: '#9ca3af',
            width: 32,
            textAlign: 'center',
          }}
        >
          {freqLabel(f)}
        </Text>
      ))}
    </View>
  );
}

// ─── Main PTA screen ──────────────────────────────────────────────────────────

export default function PTATest() {
  const {
    session,
    activeEar,
    freqIndex,
    staircases,
    deviceProfile,
    noisePauseActive,
    recordTrial,
    finaliseCurrentFreq,
    startEarTest,
    appendMeteringSample,
    evaluateNoisePause,
    finaliseEar,
  } = useHearingStore();

  const soundRef   = useRef<Audio.Sound | null>(null);
  const recordRef  = useRef<Audio.Recording | null>(null);
  const trialStart = useRef<number>(0);

  const [tonePhase, setTonePhase] = useState<'countdown' | 'playing' | 'waiting' | 'responded'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [showEarSwitch, setShowEarSwitch] = useState(false);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const currentFreq = PTA_FREQUENCIES[freqIndex];
  const currentStaircase = staircases[currentFreq];

  // Guard: must have a session
  useEffect(() => {
    if (!session) {
      router.replace('/(tab)/hearingtest' as never);
    }
  }, []);

  // ── Start noise monitoring via microphone ──────────────────────────────────
  useEffect(() => {
    let active = true;
    let rec: Audio.Recording | null = null;

    (async () => {
      try {
        const { status } = await Audio.getPermissionsAsync();
        if (status !== 'granted') return;

        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

        const { recording } = await Audio.Recording.createAsync(
          { ...Audio.RecordingOptionsPresets.LOW_QUALITY, isMeteringEnabled: true },
          (s) => {
            if (!active) return;
            if (s.isRecording && s.metering !== undefined) {
              appendMeteringSample(s.metering);
              evaluateNoisePause();
            }
          },
          200,
        );
        if (!active) { recording.stopAndUnloadAsync().catch(() => {}); return; }
        rec = recording;
        recordRef.current = recording;
      } catch { /* microphone unavailable — skip noise monitoring */ }
    })();

    return () => {
      active = false;
      rec?.stopAndUnloadAsync().catch(() => {});
      recordRef.current = null;
    };
  }, []);

  // ── Tone lifecycle ────────────────────────────────────────────────────────

  const playCurrentTone = useCallback(async () => {
    if (currentStaircase.done) return;
    const { currentDbHL } = currentStaircase;

    setTonePhase('playing');
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();

    try {
      // Stop noise monitoring while playing
      await recordRef.current?.pauseAsync().catch(() => {});
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const amplitude = dbHLToAmplitude(currentDbHL, currentFreq, deviceProfile.estimatedMaxDbSPL);
      // Stereo WAV with tone routed exclusively to the active ear's channel
      const wavBytes = generateStereoToneWAV(
        currentFreq, 1_500, amplitude,
        activeEar === 'right' ? 'right' : 'left',
      );
      const wavFile = new FSFile(FSPaths.cache, `tone_${activeEar}_${currentFreq}_${currentDbHL}.wav`);
      wavFile.write(wavBytes);

      const { sound } = await Audio.Sound.createAsync(
        { uri: wavFile.uri },
        { shouldPlay: true, volume: 1.0 },
      );
      soundRef.current = sound;
      trialStart.current = Date.now();

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          // Tone ended — wait a bit for user to respond
          setTonePhase('waiting');
          // Auto-timeout: if no response in 4 s, mark as not heard
          setTimeout(() => {
            setTonePhase((prev) => {
              if (prev === 'waiting') {
                handleResponse(false);
                return 'responded';
              }
              return prev;
            });
          }, 4_000);
        }
      });
    } catch (e) {
      console.warn('Tone playback error:', e);
      setTonePhase('waiting');
    }
  }, [currentStaircase, currentFreq, deviceProfile]);

  // ── User response ──────────────────────────────────────────────────────────

  const handleResponse = useCallback((heard: boolean) => {
    setTonePhase('responded');
    const reactionMs = Date.now() - trialStart.current;

    soundRef.current?.stopAsync().catch(() => {});

    // Resume noise monitor
    Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      .then(() => recordRef.current?.startAsync())
      .catch(() => {});

    recordTrial(heard, reactionMs);

    // Randomised inter-trial interval to prevent rhythmic anticipation
    setTimeout(() => {
      const updated = useHearingStore.getState().staircases[currentFreq];
      if (updated.done) {
        // This frequency is complete
        const nextIdx = freqIndex + 1;
        if (nextIdx >= PTA_FREQUENCIES.length) {
          // All frequencies for this ear done
          if (activeEar === 'right') {
            setShowEarSwitch(true);
          } else {
            finaliseEar();
            router.replace('/(tab)/hearingtest/results' as never);
          }
        } else {
          finaliseCurrentFreq();
          setTonePhase('countdown');
          setCountdown(2);
        }
      } else {
        // Next trial for same frequency
        setTonePhase('countdown');
        setCountdown(2);
      }
    }, randomITI());
  }, [currentFreq, freqIndex, activeEar, recordTrial, finaliseCurrentFreq, finaliseEar]);

  // ── Countdown before tone ──────────────────────────────────────────────────

  useEffect(() => {
    if (tonePhase !== 'countdown') return;
    if (noisePauseActive) return;

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
  }, [tonePhase, noisePauseActive]);

  // ── Pulse animation while playing ─────────────────────────────────────────
  useEffect(() => {
    if (tonePhase === 'playing') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.13, duration: 480, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 480, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [tonePhase]);

  // ── Ear-switch modal confirm ───────────────────────────────────────────────

  const handleEarSwitchConfirm = () => {
    setShowEarSwitch(false);
    finaliseEar();
    startEarTest('left');
    setTonePhase('countdown');
    setCountdown(3);
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const currentDbHL = currentStaircase.currentDbHL;
  const progress = freqIndex / PTA_FREQUENCIES.length;
  const earFreqProgress = ((freqIndex + (tonePhase === 'responded' ? 0.9 : 0)) / PTA_FREQUENCIES.length);

  const completedThresholds = PTA_FREQUENCIES
    .slice(0, freqIndex)
    .map((f) => ({ frequency: f, dbHL: estimateThreshold(staircases[f]) }));

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
              PTA — {activeEar === 'right' ? 'Right Ear' : 'Left Ear'}
            </Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>
              {freqLabel(currentFreq)} · {currentDbHL} dBHL
            </Text>
          </View>

          {/* Ear badge */}
          <View style={{ backgroundColor: activeEar === 'right' ? '#1e3a5f' : '#3b1f6b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: activeEar === 'right' ? '#93c5fd' : '#c4b5fd' }}>
              {activeEar === 'right' ? 'R' : 'L'}
            </Text>
          </View>

          {/* Headphone channel indicator */}
          <View style={{ backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name="headset-outline"
              size={16}
              color={tonePhase === 'playing' ? FREQ_COLORS[currentFreq] : '#4b5563'}
            />
            <Text style={{ fontSize: 11, fontWeight: '700', color: tonePhase === 'playing' ? '#d1d5db' : '#4b5563' }}>
              {activeEar === 'right' ? 'Right' : 'Left'}
            </Text>
          </View>
        </View>

        {/* Frequency progress bar */}
        <View style={{ marginHorizontal: 18, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            {PTA_FREQUENCIES.map((f, i) => (
              <Text key={f} style={{ fontSize: 9, color: i === freqIndex ? '#fff' : (i < freqIndex ? FREQ_COLORS[f] : '#374151'), fontWeight: i === freqIndex ? '800' : '400' }}>
                {freqLabel(f)}
              </Text>
            ))}
          </View>
          <View style={{ height: 4, backgroundColor: '#1f2937', borderRadius: 2 }}>
            <View style={{ height: 4, width: `${earFreqProgress * 100}%`, backgroundColor: FREQ_COLORS[currentFreq], borderRadius: 2 }} />
          </View>
        </View>

        {/* Noise pause banner */}
        {noisePauseActive && (
          <View style={{ marginHorizontal: 18, marginBottom: 8, backgroundColor: '#7c2d12', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Ionicons name="pause-circle-outline" size={18} color="#fed7aa" />
            <Text style={{ flex: 1, fontSize: 12, color: '#fed7aa', fontWeight: '600' }}>
              Paused — environment too noisy. Please wait for quiet.
            </Text>
          </View>
        )}

        {/* Live audiogram */}
        <View style={{ backgroundColor: '#111827', marginHorizontal: 18, borderRadius: 16, padding: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            Audiogram — {activeEar === 'right' ? 'Right (○)' : 'Left (×)'}
          </Text>
          {completedThresholds.length > 0
            ? <MiniAudiogram thresholds={completedThresholds} ear={activeEar} />
            : <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', paddingVertical: 20 }}>
                Thresholds will appear as testing progresses
              </Text>
          }
        </View>

        {/* Main tone interaction area */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>

          {/* Tone visualiser */}
          <Animated.View
            style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              borderWidth: 3,
              borderColor: tonePhase === 'waiting' ? '#4b5563' : FREQ_COLORS[currentFreq],
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tonePhase === 'playing' ? `${FREQ_COLORS[currentFreq]}22` : 'transparent',
              opacity: fadeAnim,
              marginBottom: 28,
              transform: [{ scale: pulseAnim }],
            }}
          >
            {tonePhase === 'countdown' && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 52, fontWeight: '900', color: '#fff' }}>{countdown}</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>Ready…</Text>
              </View>
            )}
            {tonePhase === 'playing' && (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="musical-note" size={48} color={FREQ_COLORS[currentFreq]} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 4 }}>
                  {freqLabel(currentFreq)}
                </Text>
              </View>
            )}
            {tonePhase === 'waiting' && (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="ear-outline" size={48} color="#9ca3af" />
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Did you hear it?</Text>
              </View>
            )}
            {tonePhase === 'responded' && (
              <Ionicons name="checkmark-circle-outline" size={56} color="#16a34a" />
            )}
          </Animated.View>

          <Text style={{
            fontSize: tonePhase === 'waiting' ? 16 : 14,
            fontWeight: tonePhase === 'waiting' ? '800' : '600',
            color: tonePhase === 'waiting' ? '#e5e7eb' : '#6b7280',
            textAlign: 'center',
            marginBottom: 28,
            lineHeight: 22,
          }}>
            {tonePhase === 'countdown'
              ? `Listen for a ${freqLabel(currentFreq)} tone.`
              : tonePhase === 'playing'
              ? 'Listen carefully…'
              : tonePhase === 'waiting'
              ? 'Press the button if you heard the tone'
              : 'Response recorded'}
          </Text>

          {/* Response buttons */}
          <View style={{ flexDirection: 'row', gap: 14, width: '100%' }}>
            <Pressable
              onPress={() => tonePhase === 'waiting' && handleResponse(false)}
              disabled={tonePhase !== 'waiting'}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 18,
                borderRadius: 18,
                alignItems: 'center',
                backgroundColor: tonePhase === 'waiting' ? (pressed ? '#1f1f2e' : '#111827') : '#0d0d14',
                borderWidth: 1.5,
                borderColor: tonePhase === 'waiting' ? '#374151' : '#1f2937',
                opacity: tonePhase === 'waiting' ? 1 : 0.4,
              })}
            >
              <Ionicons name="volume-mute" size={28} color="#6b7280" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280', marginTop: 6 }}>Not heard</Text>
            </Pressable>

            <Pressable
              onPress={() => tonePhase === 'waiting' && handleResponse(true)}
              disabled={tonePhase !== 'waiting'}
              style={({ pressed }) => ({
                flex: 1.5,
                paddingVertical: 18,
                borderRadius: 18,
                alignItems: 'center',
                backgroundColor: tonePhase === 'waiting' ? (pressed ? TEAL_D : TEAL) : '#0d1a19',
                opacity: tonePhase === 'waiting' ? 1 : 0.4,
                shadowColor: TEAL,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: tonePhase === 'waiting' ? 0.45 : 0,
                shadowRadius: 14,
                elevation: tonePhase === 'waiting' ? 6 : 0,
              })}
            >
              <Ionicons name="ear" size={32} color="#fff" />
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff', marginTop: 6 }}>I heard it</Text>
            </Pressable>
          </View>
        </View>

        {/* Progress indicator */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 12 }}>
          <Text style={{ fontSize: 11, color: '#4b5563', textAlign: 'center' }}>
            {activeEar === 'right' ? 'Right' : 'Left'} ear · Frequency {freqIndex + 1} of {PTA_FREQUENCIES.length}
          </Text>
        </View>

        {/* Ear switch modal */}
        <Modal transparent animationType="fade" visible={showEarSwitch}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <View style={{ backgroundColor: '#111827', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="swap-horizontal-outline" size={32} color="#93c5fd" />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', textAlign: 'center' }}>
                Right Ear Complete
              </Text>
              <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 }}>
                Right ear testing is done.{'\n'}
                Now place the headphone on your{' '}
                <Text style={{ fontWeight: '800', color: '#c4b5fd' }}>left ear</Text> and confirm when ready.
              </Text>
              <Pressable
                onPress={handleEarSwitchConfirm}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#5b21b6' : VIOLET,
                  borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center',
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Start Left Ear →</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}
