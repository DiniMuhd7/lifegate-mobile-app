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
  Easing,
  View,
  Text,
  Pressable,
  StatusBar,
  Animated,
  Modal,
  Dimensions,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
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
/** Time budget per ear. Auto-finalises the ear and switches (or navigates) when reached. */
const PER_EAR_DURATION_MS = 3 * 60 * 1_000; // 180 s per ear
/** Per-frequency time slice — ensures all 6 frequencies are covered within the 3 min budget. */
const PER_FREQ_BUDGET_MS  = Math.floor(PER_EAR_DURATION_MS / PTA_FREQUENCIES.length); // 30 000 ms

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
  inProgress,
  pending,
}: {
  thresholds: Array<{ frequency: PTAFrequency; dbHL: number }>;
  ear: TestEar;
  inProgress?: { frequency: PTAFrequency; dbHL: number };
  pending?: PTAFrequency[];
}) {

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
            backgroundColor: db === 25 ? '#1a3a2a' : '#1a1f2e',
          }}
        />
      ))}
      <Text style={{ position: 'absolute', left: 0, top: yFor(25) - 12, fontSize: 9, color: '#374151' }}>25</Text>
      <Text style={{ position: 'absolute', left: 0, top: yFor(50) - 12, fontSize: 9, color: '#374151' }}>50</Text>
      <Text style={{ position: 'absolute', left: 0, top: yFor(75) - 12, fontSize: 9, color: '#374151' }}>75</Text>

      {/* Pending frequency placeholders — faint dashes at 40 dBHL */}
      {(pending ?? []).map((f) => (
        <View key={`pending-${f}`}
          style={{
            position: 'absolute',
            left: xFor(f) - 6,
            top: yFor(40) - 6,
            width: 12, height: 12, borderRadius: 6,
            backgroundColor: '#1f2937',
            borderWidth: 1, borderColor: '#374151',
          }}
        />
      ))}

      {/* In-progress frequency — dimmed symbol at current staircase dBHL */}
      {inProgress && (() => {
        const x = xFor(inProgress.frequency);
        const y = yFor(inProgress.dbHL);
        const color = FREQ_COLORS[inProgress.frequency];
        return (
          <View key="inprogress"
            style={{
              position: 'absolute',
              left: x - 10, top: y - 10,
              width: 20, height: 20,
              borderRadius: ear === 'right' ? 10 : 3,
              borderWidth: 2,
              borderColor: color,
              opacity: 0.35,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {ear === 'left' && (
              <>
                <View style={{ position: 'absolute', width: 13, height: 1.5, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
                <View style={{ position: 'absolute', width: 13, height: 1.5, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
              </>
            )}
          </View>
        );
      })()}

      {/* Completed threshold connector lines */}
      {thresholds.map((t, i) => {
        if (i === 0) return null;
        const prev = thresholds[i - 1];
        const px = xFor(prev.frequency); const py = yFor(prev.dbHL);
        const x  = xFor(t.frequency);   const y  = yFor(t.dbHL);
        const dx = x - px; const dy = y - py;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View key={`line-${t.frequency}`}
            style={{
              position: 'absolute', left: px, top: py,
              width: len, height: 1.5,
              backgroundColor: '#374151',
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0 0.75px',
            } as any}
          />
        );
      })}

      {/* Completed threshold symbols */}
      {thresholds.map((t) => {
        const x = xFor(t.frequency);
        const y = yFor(t.dbHL);
        const color = FREQ_COLORS[t.frequency];
        return (
          <View key={t.frequency}
            style={{
              position: 'absolute',
              left: x - 10, top: y - 10,
              width: 20, height: 20,
              borderRadius: ear === 'right' ? 10 : 0,
              borderWidth: 2.5,
              borderColor: color,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {ear === 'left' && (
              <>
                <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
                <View style={{ position: 'absolute', width: 16, height: 2, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
              </>
            )}
          </View>
        );
      })}

      {/* Frequency labels at bottom */}
      {PTA_FREQUENCIES.map((f) => {
        const isDone    = thresholds.some((t) => t.frequency === f);
        const isCurrent = inProgress?.frequency === f;
        return (
          <Text
            key={f}
            style={{
              position: 'absolute',
              left: xFor(f) - 16,
              top: CHART_H + 4,
              fontSize: 8,
              color: isDone ? FREQ_COLORS[f] : isCurrent ? '#4b5563' : '#1f2937',
              fontWeight: isDone ? '700' : '400',
              width: 32,
              textAlign: 'center',
            }}
          >
            {freqLabel(f)}
          </Text>
        );
      })}
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
  const timeExpiredRef        = useRef(false);
  const earStartRef           = useRef(Date.now()); // tracks per-ear elapsed time
  const earSwitchTriggeredRef = useRef(false);     // prevents double ear-switch trigger
  const freqStartRef          = useRef(Date.now()); // tracks per-frequency elapsed time
  const freqBudgetExpiredRef  = useRef(false);     // true when per-freq 25 s slice is up

  const [tonePhase, setTonePhase] = useState<'countdown' | 'playing' | 'waiting' | 'responded'>('countdown');
  const [countdown, setCountdown] = useState(2);
  const [responseCountdown, setResponseCountdown] = useState(RESPONSE_TIMEOUT_MS / 1000);
  const [showEarSwitch, setShowEarSwitch] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [earElapsed, setEarElapsed] = useState(0); // seconds since current ear started
  const exitConfirmedRef = useRef(false); // gates beforeRemove so confirmed nav is allowed
  // Start at 1 — circle is visible from the first countdown (3 → 2 → 1).
  // Previously 0 made the countdown invisible until playback started.
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const wave1Anim = useRef(new Animated.Value(0)).current;
  const wave2Anim = useRef(new Animated.Value(0)).current;
  const wave3Anim = useRef(new Animated.Value(0)).current;
  const testStartRef = useRef(Date.now());

  // ── Timer-pause tracking ───────────────────────────────────────────────────
  // Timers freeze while the response cards (tonePhase === 'waiting') or the
  // ear-switch modal are visible. We accumulate total paused ms per scope and
  // subtract them from elapsed calculations so budgets don't burn during UI.
  const pauseStartRef    = useRef<number | null>(null); // non-null while paused
  const earPausedMsRef   = useRef(0);  // total ms paused for current ear budget
  const freqPausedMsRef  = useRef(0);  // total ms paused for current freq slice
  const testPausedMsRef  = useRef(0);  // total ms paused for overall elapsed

  const currentFreq = PTA_FREQUENCIES[freqIndex];
  const currentStaircase = staircases[currentFreq];

  // ── Reset per-frequency timer whenever frequency advances ─────────────────
  useEffect(() => {
    freqStartRef.current         = Date.now();
    freqBudgetExpiredRef.current = false;
    freqPausedMsRef.current      = 0; // fresh paused-ms accumulator for this freq
  }, [freqIndex]);

  // Guard: must have a session
  useEffect(() => {
    if (!session) {
      router.replace('/(tab)/hearingtest' as never);
    }
  }, []);

  // ── Navigation guard — confirm before leaving while test is active ────────
  const navigation = useNavigation();

  // Intercept stack-pop (back gesture on iOS / in-app back button)
  useEffect(() => {
    const unsub = (navigation as any).addListener('beforeRemove', (e: any) => {
      if (exitConfirmedRef.current) return; // user already confirmed — allow
      e.preventDefault();
      setShowExitConfirm(true);
    });
    return unsub;
  }, [navigation]);

  // Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowExitConfirm(true);
      return true; // prevent default back
    });
    return () => sub.remove();
  }, []);

  // ── Elapsed time counter + per-ear 2.5-minute expiry ──────────────────────
  // Each ear independently gets up to PER_EAR_DURATION_MS (2.5 min).
  // timeExpiredRef is reset on ear-switch so the left ear gets a fresh budget.
  // freqBudgetExpiredRef fires every PER_FREQ_BUDGET_MS (25 s) to force-advance
  // through all 6 frequencies within the 2.5-minute window.
  useEffect(() => {
    const t = setInterval(() => {
      // While response cards or ear-switch modal are visible, freeze all timers.
      if (pauseStartRef.current !== null) return;

      const secs = Math.floor((Date.now() - testStartRef.current - testPausedMsRef.current) / 1000);
      setElapsed(secs);

      const earMs   = Date.now() - earStartRef.current - earPausedMsRef.current;
      const earSecs = Math.floor(earMs / 1000);
      setEarElapsed(earSecs);

      // Full-ear budget expired
      if (earMs >= PER_EAR_DURATION_MS && !timeExpiredRef.current) {
        timeExpiredRef.current = true;
      }
      // Per-frequency slice expired — force-advance to next frequency
      const freqElapsedMs = Date.now() - freqStartRef.current - freqPausedMsRef.current;
      if (freqElapsedMs >= PER_FREQ_BUDGET_MS && !freqBudgetExpiredRef.current && !earSwitchTriggeredRef.current) {
        freqBudgetExpiredRef.current = true;
      }
    }, 1_000);
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
      // ── 2.5-minute ear budget exhausted ───────────────────────────────────
      if (timeExpiredRef.current) {
        if (activeEar === 'right' && !earSwitchTriggeredRef.current) {
          // Right ear timed out → switch ears (left ear still needs testing)
          earSwitchTriggeredRef.current = true;
          setShowEarSwitch(true);
        } else {
          finaliseEar();
          router.replace('/(tab)/hearingtest/results' as never);
        }
        return;
      }

      // ── Per-frequency 25-second slice exhausted — force advance ───────────
      if (freqBudgetExpiredRef.current && !earSwitchTriggeredRef.current) {
        freqBudgetExpiredRef.current = false;
        const nextIdx = useHearingStore.getState().freqIndex + 1;
        if (nextIdx < PTA_FREQUENCIES.length) {
          finaliseCurrentFreq();
          setTonePhase('countdown');
          setCountdown(1);
        } else {
          if (activeEar === 'right') {
            earSwitchTriggeredRef.current = true;
            setShowEarSwitch(true);
          } else {
            finaliseEar();
            router.replace('/(tab)/hearingtest/results' as never);
          }
        }
        return;
      }

      const updated = useHearingStore.getState().staircases[currentFreq];
      if (updated.done) {
        // This frequency is complete
        const nextIdx = freqIndex + 1;
        if (nextIdx >= PTA_FREQUENCIES.length) {
          // All frequencies for this ear done
          if (activeEar === 'right') {
            earSwitchTriggeredRef.current = true; // prevent timer from double-triggering
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

  // ── Pause / unpause timers when UI overlays are visible ──────────────────
  // Fires whenever the response cards (tonePhase === 'waiting') or the
  // ear-switch modal appear/disappear.
  useEffect(() => {
    const shouldPause = tonePhase === 'waiting' || showEarSwitch;
    if (shouldPause) {
      // Start a new pause window if not already paused
      if (pauseStartRef.current === null) {
        pauseStartRef.current = Date.now();
      }
    } else {
      // Unpause: accumulate the duration into each budget's paused ms
      if (pauseStartRef.current !== null) {
        const dur = Date.now() - pauseStartRef.current;
        earPausedMsRef.current  += dur;
        freqPausedMsRef.current += dur;
        testPausedMsRef.current += dur;
        pauseStartRef.current = null;
      }
    }
  }, [tonePhase, showEarSwitch]);

  // ── Sound-wave ring animations (while playing) ─────────────────────────────
  useEffect(() => {
    if (tonePhase !== 'playing') {
      wave1Anim.setValue(0);
      wave2Anim.setValue(0);
      wave3Anim.setValue(0);
      return;
    }

    wave1Anim.setValue(0);
    wave2Anim.setValue(0);
    wave3Anim.setValue(0);

    let active = true;
    const loops: Array<{ stop: () => void }> = [];
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const makeRing = (anim: Animated.Value, delay: number) => {
      const t = setTimeout(() => {
        if (!active) return;
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 1_400, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            Animated.timing(anim, { toValue: 0, duration: 0,     useNativeDriver: true }),
          ]),
        );
        loops.push(loop);
        loop.start();
      }, delay);
      timers.push(t);
    };

    makeRing(wave1Anim, 0);
    makeRing(wave2Anim, 467);
    makeRing(wave3Anim, 933);

    return () => {
      active = false;
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
      wave1Anim.setValue(0);
      wave2Anim.setValue(0);
      wave3Anim.setValue(0);
    };
  }, [tonePhase]);

  // ── Exit test confirmation ─────────────────────────────────────────────────

  const handleExitConfirm = useCallback(() => {
    setShowExitConfirm(false);
    exitConfirmedRef.current = true;
    // Clean up audio resources before leaving
    soundRef.current?.stopAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
    soundRef.current = null;
    recordRef.current?.stopAndUnloadAsync().catch(() => {});
    recordRef.current = null;
    router.replace('/(tab)/hearingtest' as never);
  }, []);

  // ── Ear-switch modal confirm ───────────────────────────────────────────────

  const handleEarSwitchConfirm = () => {
    setShowEarSwitch(false);
    finaliseEar();
    startEarTest('left');
    earStartRef.current           = Date.now(); // reset per-ear clock for left ear
    freqStartRef.current          = Date.now(); // reset per-freq clock
    timeExpiredRef.current        = false;      // left ear gets its own fresh 2.5 minutes
    freqBudgetExpiredRef.current  = false;
    // ↓ MUST reset: this flag gates per-frequency force-advance in both the
    //   timer and handleResponse. Leaving it true disables the 25 s per-freq
    //   budget for the entire left ear session, so slow staircases can starve
    //   later frequencies of time.
    earSwitchTriggeredRef.current = false;
    // Reset paused-ms accumulators for the fresh ear budget.
    // Also clear any active pause window (the modal is about to close).
    earPausedMsRef.current  = 0;
    freqPausedMsRef.current = 0;
    pauseStartRef.current   = null;
    setEarElapsed(0);
    setTonePhase('countdown');
    setCountdown(2);
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const currentDbHL = currentStaircase.currentDbHL;
  // Frequency-based progress — each of the 12 frequency slots (6 per ear) = 1/12.
  // This ensures the bar advances in step with actual audiogram coverage,
  // regardless of how long each staircase takes.
  const TOTAL_FREQS    = PTA_FREQUENCIES.length * 2; // 12
  const doneFreqCount  = activeEar === 'right' ? freqIndex : PTA_FREQUENCIES.length + freqIndex;
  const overallProgress = doneFreqCount / TOTAL_FREQS;

  // 3-minute per-ear countdown display
  const timeLeftSecs = Math.max(0, PER_EAR_DURATION_MS / 1_000 - earElapsed);
  const countdownMins = Math.floor(timeLeftSecs / 60);
  const countdownSecs = timeLeftSecs % 60;
  const countdownStr  = `${countdownMins}:${String(countdownSecs).padStart(2, '0')}`;
  const countdownUrgent = timeLeftSecs <= 60;

  const completedThresholds = PTA_FREQUENCIES
    .slice(0, freqIndex)
    .map((f) => ({ frequency: f, dbHL: estimateThreshold(staircases[f]) }));

  // In-progress frequency — shown dimmed at its current staircase dBHL
  const inProgressThreshold = !currentStaircase.done
    ? { frequency: currentFreq, dbHL: currentStaircase.currentDbHL }
    : undefined;

  // Frequencies not yet started
  const pendingFrequencies = PTA_FREQUENCIES.slice(freqIndex + 1);

  return (
    <View style={{ flex: 1, backgroundColor: '#080810' }}>
      <StatusBar barStyle="light-content" backgroundColor="#080810" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
          {/* Exit button */}
          <Pressable
            onPress={() => setShowExitConfirm(true)}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 34, height: 34, borderRadius: 17,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? '#1a1a2e' : 'transparent',
            })}
          >
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>

          {/* Ear pill */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: activeEar === 'right' ? '#0c2340' : '#1a0c38',
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
            borderWidth: 1, borderColor: activeEar === 'right' ? '#1e4080' : '#3b1f70',
          }}>
            <Ionicons name="headset" size={14} color={activeEar === 'right' ? '#60a5fa' : '#a78bfa'} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: activeEar === 'right' ? '#93c5fd' : '#c4b5fd' }}>
              {activeEar === 'right' ? 'Right Ear' : 'Left Ear'}
            </Text>
          </View>

          {/* Current frequency + level */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#e5e7eb' }}>{freqLabel(currentFreq)}</Text>
            <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{currentDbHL} dBHL</Text>
          </View>

          {/* Per-ear countdown timer */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: countdownUrgent ? '#450a0a' : '#111827',
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
            borderWidth: 1, borderColor: countdownUrgent ? '#7f1d1d' : '#1f2937',
          }}>
            <Ionicons name="timer-outline" size={12} color={countdownUrgent ? '#f87171' : '#6b7280'} />
            <Text style={{ fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], color: countdownUrgent ? '#fca5a5' : '#9ca3af' }}>
              {countdownStr}
            </Text>
          </View>
        </View>

        {/* ── Frequency Stepper ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#60a5fa', marginRight: 2 }}>R</Text>
            {PTA_FREQUENCIES.map((f, i) => {
              const done   = activeEar === 'left' || i < freqIndex;
              const active = activeEar === 'right' && i === freqIndex;
              return (
                <View key={`R-${f}`} style={{
                  width: active ? 20 : 10, height: 10, borderRadius: 5,
                  backgroundColor: done || active ? FREQ_COLORS[f] : '#1f2937',
                  opacity: active ? 1 : done ? 0.85 : 0.35,
                }} />
              );
            })}
            <View style={{ width: 1, height: 16, backgroundColor: '#374151', marginHorizontal: 4 }} />
            {PTA_FREQUENCIES.map((f, i) => {
              const done   = activeEar === 'left' && i < freqIndex;
              const active = activeEar === 'left' && i === freqIndex;
              return (
                <View key={`L-${f}`} style={{
                  width: active ? 20 : 10, height: 10, borderRadius: 5,
                  backgroundColor: done || active ? FREQ_COLORS[f] : '#1f2937',
                  opacity: active ? 1 : done ? 0.85 : 0.25,
                }} />
              );
            })}
            <Text style={{ fontSize: 9, fontWeight: '800', color: activeEar === 'left' ? '#a78bfa' : '#374151', marginLeft: 2 }}>L</Text>
          </View>
          {/* Combined progress bar */}
          <View style={{ height: 2, backgroundColor: '#1f2937', borderRadius: 1 }}>
            <View style={{ height: 2, width: `${overallProgress * 100}%`, backgroundColor: TEAL, borderRadius: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#4b5563' }}>{Math.round(overallProgress * 100)}% complete</Text>
          </View>
        </View>

        {/* ── Noise Pause Banner ── */}
        {noisePauseActive && (
          <View style={{
            marginHorizontal: 20, marginBottom: 8,
            backgroundColor: '#431407', borderRadius: 12, padding: 12,
            flexDirection: 'row', gap: 10, alignItems: 'center',
            borderWidth: 1, borderColor: '#7c2d12',
          }}>
            <Ionicons name="warning-outline" size={18} color="#fdba74" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fdba74' }}>Environment Too Noisy</Text>
              <Text style={{ fontSize: 11, color: '#fb923c', marginTop: 1 }}>Please wait for quieter surroundings…</Text>
            </View>
          </View>
        )}

        {/* ── Live Audiogram Panel ── */}
        <View style={{
          backgroundColor: '#0d1117', marginHorizontal: 20, borderRadius: 16,
          padding: 12, marginBottom: 4, borderWidth: 1, borderColor: '#1f2937',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Live Audiogram
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#1f2937' }} />
            <Text style={{ fontSize: 10, color: '#374151' }}>{activeEar === 'right' ? '○ Right' : '× Left'}</Text>
          </View>
          {completedThresholds.length > 0 || inProgressThreshold
            ? <MiniAudiogram
                thresholds={completedThresholds}
                ear={activeEar}
                inProgress={inProgressThreshold}
                pending={pendingFrequencies}
              />
            : (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <Ionicons name="bar-chart-outline" size={20} color="#1f2937" />
                <Text style={{ fontSize: 11, color: '#374151', marginTop: 5, textAlign: 'center' }}>
                  Thresholds appear as each frequency completes
                </Text>
              </View>
            )
          }
        </View>

        {/* ── Tone Visualiser ── */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>

          {/* Wave rings + main circle */}
          <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>

            {/* Expanding sound-wave rings (animate while playing) */}
            {[wave1Anim, wave2Anim, wave3Anim].map((anim, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  width: 160, height: 160, borderRadius: 80,
                  borderWidth: 1.5,
                  borderColor: FREQ_COLORS[currentFreq],
                  transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }) }],
                  opacity: anim.interpolate({ inputRange: [0, 0.1, 0.6, 1], outputRange: [0, 0.6, 0.2, 0] }),
                }}
              />
            ))}

            {/* Main circle */}
            <Animated.View style={{
              width: 160, height: 160, borderRadius: 80,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2.5,
              borderColor:
                tonePhase === 'playing'   ? FREQ_COLORS[currentFreq] :
                tonePhase === 'waiting'   ? '#374151' :
                tonePhase === 'responded' ? '#16a34a' : TEAL,
              backgroundColor:
                tonePhase === 'playing'   ? `${FREQ_COLORS[currentFreq]}1a` :
                tonePhase === 'responded' ? '#052e16' : '#080c14',
              opacity: fadeAnim,
              transform: [{ scale: pulseAnim }],
            }}>
              {tonePhase === 'countdown' && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 58, fontWeight: '900', color: '#fff', lineHeight: 64 }}>{countdown}</Text>
                  <Text style={{ fontSize: 10, color: '#6b7280', letterSpacing: 1.5, marginTop: 2 }}>READY</Text>
                </View>
              )}
              {tonePhase === 'playing' && (
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="volume-high" size={42} color={FREQ_COLORS[currentFreq]} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#f9fafb' }}>{freqLabel(currentFreq)}</Text>
                  <Text style={{ fontSize: 9, color: '#9ca3af', letterSpacing: 1.2 }}>PLAYING</Text>
                </View>
              )}
              {tonePhase === 'waiting' && (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="ear-outline" size={44} color="#9ca3af" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', textAlign: 'center', lineHeight: 16 }}>
                    Did you{'\n'}hear it?
                  </Text>
                </View>
              )}
              {tonePhase === 'responded' && (
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={54} color="#22c55e" />
                  <Text style={{ fontSize: 9, color: '#4ade80', letterSpacing: 1 }}>RECORDED</Text>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Phase instruction text */}
          <Text style={{
            fontSize: tonePhase === 'waiting' ? 17 : 13,
            fontWeight: tonePhase === 'waiting' ? '800' : '500',
            color: tonePhase === 'waiting' ? '#f3f4f6' : '#6b7280',
            textAlign: 'center', lineHeight: 22, marginBottom: 14,
          }}>
            {tonePhase === 'countdown'
              ? `Listen for a ${freqLabel(currentFreq)} tone`
              : tonePhase === 'playing'
              ? 'Listen carefully…'
              : tonePhase === 'waiting'
              ? 'Did you hear it? Tap a card below'
              : 'Response recorded — preparing next tone…'}
          </Text>

          {/* Response timeout bar */}
          {tonePhase === 'waiting' && (
            <View style={{ width: '78%', alignItems: 'center', gap: 4 }}>
              <View style={{ width: '100%', height: 4, backgroundColor: '#1f2937', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{
                  height: 4,
                  width: `${(responseCountdown / (RESPONSE_TIMEOUT_MS / 1000)) * 100}%`,
                  backgroundColor: responseCountdown <= 1 ? '#ef4444' : responseCountdown <= 2 ? '#f97316' : '#4b5563',
                  borderRadius: 2,
                }} />
              </View>
              <Text style={{ fontSize: 10, color: '#374151', fontVariant: ['tabular-nums'] }}>{responseCountdown}s</Text>
            </View>
          )}
        </View>

        {/* ── Response Cards ── */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', gap: 10 }}>

          {/* Card — Didn't Hear It */}
          <Pressable
            onPress={() => tonePhase === 'waiting' && handleResponse(false)}
            disabled={tonePhase !== 'waiting'}
            style={({ pressed }) => ({
              flex: 1,
              height: 80,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: tonePhase === 'waiting'
                ? (pressed ? '#1a1a2e' : '#141420')
                : '#0c0c14',
              borderWidth: 1.5,
              borderColor: tonePhase === 'waiting'
                ? (pressed ? '#374151' : '#252540')
                : '#111827',
              opacity: tonePhase === 'waiting' ? 1 : 0.2,
              paddingHorizontal: 14,
            })}
          >
            <Ionicons
              name="volume-mute"
              size={20}
              color={tonePhase === 'waiting' ? '#6b7280' : '#1f2937'}
            />
            <Text style={{
              fontSize: 13, fontWeight: '700',
              color: tonePhase === 'waiting' ? '#9ca3af' : '#1f2937',
              flexShrink: 1,
            }}>
              Didn't Hear It
            </Text>
          </Pressable>

          {/* Card — I Heard It */}
          <Pressable
            onPress={() => tonePhase === 'waiting' && handleResponse(true)}
            disabled={tonePhase !== 'waiting'}
            style={({ pressed }) => ({
              flex: 1,
              height: 80,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingHorizontal: 16,
              backgroundColor: tonePhase === 'waiting'
                ? (pressed ? TEAL_D : TEAL)
                : '#071312',
              opacity: tonePhase === 'waiting' ? 1 : 0.2,
              shadowColor: TEAL,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: tonePhase === 'waiting' ? 0.45 : 0,
              shadowRadius: 14,
              elevation: tonePhase === 'waiting' ? 8 : 0,
            })}
          >
            <Ionicons
              name="ear"
              size={24}
              color={tonePhase === 'waiting' ? '#fff' : '#071312'}
            />
            <Text style={{
              fontSize: 16, fontWeight: '900',
              color: tonePhase === 'waiting' ? '#fff' : '#071312',
              letterSpacing: 0.2,
              flexShrink: 1,
            }}>
              I Heard It
            </Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 10, color: '#1f2937' }}>Freq {freqIndex + 1}/{PTA_FREQUENCIES.length}</Text>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#1f2937' }} />
          <Text style={{ fontSize: 10, color: '#374151' }}>{freqLabel(currentFreq)} · {currentDbHL} dBHL</Text>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#1f2937' }} />
          <Text style={{ fontSize: 10, color: '#374151', fontVariant: ['tabular-nums'] }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </Text>
        </View>

        {/* ── Exit Confirmation Modal ── */}
        <Modal transparent animationType="fade" visible={showExitConfirm}>
          <View style={{ flex: 1, backgroundColor: 'rgba(4,4,12,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
            <View style={{
              backgroundColor: '#0d1117', borderRadius: 24, padding: 28,
              width: '100%', alignItems: 'center', gap: 16,
              borderWidth: 1, borderColor: '#1f2937',
            }}>
              {/* Warning icon */}
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: '#450a0a', alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#7f1d1d',
              }}>
                <Ionicons name="warning-outline" size={30} color="#f87171" />
              </View>

              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff', textAlign: 'center' }}>
                End Test Session?
              </Text>
              <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 }}>
                Your current test progress will be discarded.{'\n'}Are you sure you want to exit?
              </Text>

              <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 }}>
                {/* Cancel */}
                <Pressable
                  onPress={() => setShowExitConfirm(false)}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: pressed ? '#1a1a2e' : 'transparent',
                    borderWidth: 1.5, borderColor: '#374151',
                  })}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#9ca3af' }}>Continue Test</Text>
                </Pressable>

                {/* Exit */}
                <Pressable
                  onPress={handleExitConfirm}
                  style={({ pressed }) => ({
                    flex: 1, paddingVertical: 14, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: pressed ? '#7f1d1d' : '#991b1b',
                    borderWidth: 1.5, borderColor: '#b91c1c',
                  })}
                >
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>End Test</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Ear Switch Modal ── */}
        <Modal transparent animationType="fade" visible={showEarSwitch}>
          <View style={{ flex: 1, backgroundColor: 'rgba(4,4,12,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
            <View style={{
              backgroundColor: '#0d1117', borderRadius: 28, padding: 28,
              width: '100%', alignItems: 'center', gap: 14,
              borderWidth: 1, borderColor: '#1f2937',
            }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: '#0c2340', alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#1e4080',
              }}>
                <Ionicons name="swap-horizontal-outline" size={34} color="#93c5fd" />
              </View>

              <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', lineHeight: 28 }}>
                Right Ear Complete!
              </Text>
              <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 }}>
                Move the headphone to your{' '}
                <Text style={{ fontWeight: '800', color: '#c4b5fd' }}>left ear</Text>
                {' '}and tap when ready.
              </Text>

              {/* Ear diagram */}
              <View style={{
                flexDirection: 'row', gap: 20, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#080c14', borderRadius: 16, padding: 16, width: '100%',
                borderWidth: 1, borderColor: '#1f2937',
              }}>
                <View style={{ alignItems: 'center', gap: 4, opacity: 0.45 }}>
                  <Ionicons name="headset" size={28} color="#60a5fa" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#60a5fa' }}>Right ✓</Text>
                </View>
                <Ionicons name="arrow-forward-outline" size={22} color="#374151" />
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Ionicons name="headset" size={34} color="#a78bfa" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#a78bfa' }}>Left →</Text>
                </View>
              </View>

              <Pressable
                onPress={handleEarSwitchConfirm}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#4c1d95' : VIOLET,
                  borderRadius: 16, paddingVertical: 16, width: '100%',
                  alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  shadowColor: VIOLET, shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.45, shadowRadius: 14, elevation: 6,
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Start Left Ear Test</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}
