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
  Platform,
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

// ─── Test duration ───────────────────────────────────────────────────────────
/** Total PTA session time limit (both ears). Auto-finalises when reached. */
const TEST_DURATION_MS = 5 * 60 * 1_000; // 5 minutes

// ─── Inter-trial gap jitter ───────────────────────────────────────────────────
// Randomise the gap between response and next tone presentation to eliminate
// rhythmic anticipation (a known source of false positives in automated PTA).
const ITI_MIN_MS = 400;
const ITI_MAX_MS = 800;
function randomITI(): number {
  return Math.round(ITI_MIN_MS + Math.random() * (ITI_MAX_MS - ITI_MIN_MS));
}

/** Maximum time (ms) the user has to respond before auto-advancing. */
const RESPONSE_TIMEOUT_MS = 3_000;

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

  const soundRef      = useRef<Audio.Sound | null>(null);
  const recordRef     = useRef<Audio.Recording | null>(null);
  const trialStart    = useRef<number>(0);
  const blobUrlRef    = useRef<string | null>(null);
  const timeExpiredRef = useRef(false);
  const earStartRef           = useRef(Date.now()); // tracks per-ear elapsed time
  const earSwitchTriggeredRef = useRef(false);     // prevents double ear-switch trigger

  const [tonePhase, setTonePhase] = useState<'countdown' | 'playing' | 'waiting' | 'responded'>('countdown');
  const [countdown, setCountdown] = useState(2);
  const [responseCountdown, setResponseCountdown] = useState(RESPONSE_TIMEOUT_MS / 1000);
  const [showEarSwitch, setShowEarSwitch] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Start at 1 — circle is visible from the first countdown (3 → 2 → 1).
  // Previously 0 made the countdown invisible until playback started.
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const testStartRef = useRef(Date.now());

  const currentFreq = PTA_FREQUENCIES[freqIndex];
  const currentStaircase = staircases[currentFreq];

  // Guard: must have a session
  useEffect(() => {
    if (!session) {
      router.replace('/(tab)/hearingtest' as never);
    }
  }, []);

  // ── Elapsed time counter + 5-minute expiry ──────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const secs = Math.floor((Date.now() - testStartRef.current) / 1000);
      setElapsed(secs);
      if (secs * 1_000 >= TEST_DURATION_MS && !timeExpiredRef.current) {
        timeExpiredRef.current = true;
      }      // Per-ear 2.5-minute limit: auto-trigger ear switch at halfway mark
      const earElapsedMs = Date.now() - earStartRef.current;
      const currentEar = useHearingStore.getState().activeEar;
      if (
        earElapsedMs >= TEST_DURATION_MS / 2 &&
        currentEar === 'right' &&
        !earSwitchTriggeredRef.current
      ) {
        earSwitchTriggeredRef.current = true;
        setShowEarSwitch(true);
      }    }, 1_000);
    return () => clearInterval(t);
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

  // ── Restart noise monitoring after each tone ───────────────────────────────
  // The recording is fully stopped before each tone (stopAndUnload, not pause).
  // After the tone, this re-creates the Recording from scratch so metering
  // continues in the inter-trial gap.
  const restartNoiseMonitoring = useCallback(async () => {
    if (recordRef.current) return; // already running
    try {
      const { status } = await Audio.getPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.LOW_QUALITY, isMeteringEnabled: true },
        (s) => {
          if (s.isRecording && s.metering !== undefined) {
            appendMeteringSample(s.metering);
            evaluateNoisePause();
          }
        },
        200,
      );
      recordRef.current = recording;
    } catch { /* mic unavailable — skip */ }
  }, [appendMeteringSample, evaluateNoisePause]);

  // ── Tone lifecycle ────────────────────────────────────────────────────────

  const playCurrentTone = useCallback(async () => {
    if (currentStaircase.done) return;
    const { currentDbHL } = currentStaircase;

    setTonePhase('playing');

    try {
      // Fully stop recording before playback.
      // stopAndUnloadAsync (not pauseAsync) guarantees iOS releases the
      // AVAudioSession before we switch to Playback category.
      // A simple pauseAsync + category-switch silently fails on iOS:
      // createAsync then throws, catch sets tonePhase='waiting' with no sound,
      // and the 4-s auto-timeout marks every trial as 'not heard'.
      if (recordRef.current) {
        await recordRef.current.stopAndUnloadAsync().catch(() => {});
        recordRef.current = null;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      // Revoke any previous web blob URL to free memory
      if (Platform.OS === 'web' && blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      const amplitude = dbHLToAmplitude(currentDbHL, currentFreq, deviceProfile.estimatedMaxDbSPL);
      // Stereo WAV with tone routed exclusively to the active ear's channel
      const wavBytes = generateStereoToneWAV(
        currentFreq, 1_500, amplitude,
        activeEar === 'right' ? 'right' : 'left',
      );

      let audioUri: string;
      if (Platform.OS === 'web') {
        const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        audioUri = URL.createObjectURL(blob);
        blobUrlRef.current = audioUri;
      } else {
        const wavFile = new FSFile(FSPaths.cache, `tone_${activeEar}_${currentFreq}_${currentDbHL}.wav`);
        wavFile.write(wavBytes);
        audioUri = wavFile.uri;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, volume: 1.0 },
      );
      soundRef.current = sound;
      trialStart.current = Date.now();

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          // Revoke blob URL now that playback is done
          if (Platform.OS === 'web' && blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          // Tone ended — wait a bit for user to respond
          setTonePhase('waiting');
          // Auto-timeout: if no response, mark as not heard
          setTimeout(() => {
            setTonePhase((prev) => {
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
      console.warn('Tone playback error:', e);
      setTonePhase('waiting');
      // Auto-timeout in error path so the test is never stuck waiting
      setTimeout(() => {
        setTonePhase((prev) => {
          if (prev === 'waiting') {
            handleResponse(false);
            return 'responded';
          }
          return prev;
        });
      }, RESPONSE_TIMEOUT_MS);
    }
  }, [currentStaircase, currentFreq, deviceProfile]);

  // ── User response ──────────────────────────────────────────────────────────

  const handleResponse = useCallback((heard: boolean) => {
    setTonePhase('responded');
    const reactionMs = Date.now() - trialStart.current;

    soundRef.current?.stopAsync().catch(() => {});

    // Restart noise monitoring (recording was fully stopped before the tone;
    // restartNoiseMonitoring recreates it so the next inter-trial interval
    // is metered correctly).
    restartNoiseMonitoring();

    recordTrial(heard, reactionMs);

    // Randomised inter-trial interval to prevent rhythmic anticipation
    setTimeout(() => {
      // ── 5-minute time-up: finalise whatever we have and go to results ─────
      if (timeExpiredRef.current) {
        finaliseEar();
        router.replace('/(tab)/hearingtest/results' as never);
        return;
      }

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
          setCountdown(1);
        }
      } else {
        // Next trial for same frequency
        setTonePhase('countdown');
        setCountdown(1);
      }
    }, randomITI());
  }, [currentFreq, freqIndex, activeEar, recordTrial, finaliseCurrentFreq, finaliseEar, restartNoiseMonitoring]);

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

  // ── Response window countdown ──────────────────────────────────────────────
  useEffect(() => {
    if (tonePhase !== 'waiting') {
      setResponseCountdown(RESPONSE_TIMEOUT_MS / 1000);
      return;
    }
    setResponseCountdown(RESPONSE_TIMEOUT_MS / 1000);
    const t = setInterval(() => {
      setResponseCountdown((c) => Math.max(0, c - 1));
    }, 1_000);
    return () => clearInterval(t);
  }, [tonePhase]);

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
    earStartRef.current = Date.now(); // reset per-ear timer for left ear
    setTonePhase('countdown');
    setCountdown(2);
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const currentDbHL = currentStaircase.currentDbHL;
  const earFreqProgress = ((freqIndex + (tonePhase === 'responded' ? 0.9 : 0)) / PTA_FREQUENCIES.length);

  // Overall progress based on real elapsed time vs 5-minute session timer
  const overallProgress = Math.min(elapsed / (TEST_DURATION_MS / 1_000), 1);

  // 5-minute countdown display
  const timeLeftSecs = Math.max(0, TEST_DURATION_MS / 1_000 - elapsed);
  const countdownMins = Math.floor(timeLeftSecs / 60);
  const countdownSecs = timeLeftSecs % 60;
  const countdownStr  = `${countdownMins}:${String(countdownSecs).padStart(2, '0')}`;
  const countdownUrgent = timeLeftSecs <= 60;

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

        {/* Overall progress bar (both ears combined) */}
        <View style={{ marginHorizontal: 18, marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {/* Per-ear freq dots */}
              {PTA_FREQUENCIES.map((f, i) => (
                <View
                  key={`R-${f}`}
                  style={{
                    width: i === freqIndex && activeEar === 'right' ? 16 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: activeEar === 'left' || i < freqIndex
                      ? FREQ_COLORS[f]
                      : i === freqIndex && activeEar === 'right'
                      ? FREQ_COLORS[f]
                      : '#1f2937',
                    opacity: i === freqIndex && activeEar === 'right' ? 1 : 0.7,
                  }}
                />
              ))}
              <View style={{ width: 6, height: 8 }} />
              {PTA_FREQUENCIES.map((f, i) => (
                <View
                  key={`L-${f}`}
                  style={{
                    width: i === freqIndex && activeEar === 'left' ? 16 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: activeEar === 'left' && i < freqIndex
                      ? FREQ_COLORS[f]
                      : i === freqIndex && activeEar === 'left'
                      ? FREQ_COLORS[f]
                      : '#1f2937',
                    opacity: activeEar === 'left' && i === freqIndex ? 1 : 0.5,
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280' }}>
                {Math.round(overallProgress * 100)}%
              </Text>
              <View style={{
                backgroundColor: countdownUrgent ? '#7f1d1d' : '#1f2937',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <Ionicons name="timer-outline" size={11} color={countdownUrgent ? '#fca5a5' : '#6b7280'} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: countdownUrgent ? '#fca5a5' : '#6b7280', fontVariant: ['tabular-nums'] }}>
                  {countdownStr}
                </Text>
              </View>
            </View>
          </View>
          {/* Combined fill bar */}
          <View style={{ height: 3, backgroundColor: '#1f2937', borderRadius: 2 }}>
            <View style={{ height: 3, width: `${overallProgress * 100}%`, backgroundColor: TEAL, borderRadius: 2 }} />
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
            marginBottom: 16,
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

          {/* Response timeout bar — visible only during 'waiting' */}
          {tonePhase === 'waiting' && (
            <View style={{ width: '100%', marginBottom: 16 }}>
              <View style={{ height: 3, backgroundColor: '#1f2937', borderRadius: 2, overflow: 'hidden' }}>
                <View
                  style={{
                    height: 3,
                    width: `${(responseCountdown / (RESPONSE_TIMEOUT_MS / 1000)) * 100}%`,
                    backgroundColor: responseCountdown <= 1 ? '#dc2626' : '#4b5563',
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text style={{ fontSize: 10, color: '#4b5563', textAlign: 'right', marginTop: 3 }}>
                {responseCountdown}s
              </Text>
            </View>
          )}

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

        {/* Footer: elapsed + freq position */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 11, color: '#4b5563' }}>
            {activeEar === 'right' ? 'Right' : 'Left'} ear
          </Text>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#374151' }} />
          <Text style={{ fontSize: 11, color: '#4b5563' }}>
            {freqLabel(currentFreq)} ({freqIndex + 1}/{PTA_FREQUENCIES.length})
          </Text>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#374151' }} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', fontVariant: ['tabular-nums'] }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
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
                Right Ear Complete — Halfway There!
              </Text>
              <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 }}>
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
