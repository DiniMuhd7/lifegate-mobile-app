/**
 * Hearing Test — Audio Calibration Wizard
 *
 * Step 1 · Headphone  — type selection + validation prompt
 * Step 2 · Volume     — guidance to set device volume to 70%
 * Step 3 · Reference  — plays 1 kHz 60 dBHL tone; user confirms audible
 * Step 4 · Noise      — 3-second mic recording to measure ambient noise
 * Step 5 · Ready      — summary → launch PTA test
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  ScrollView,
  Animated,
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
  generateToneWAV,
  dbHLToAmplitude,
  analyzeNoiseSamples,
  HEADPHONE_TYPE_LABELS,
  DEFAULT_DEVICE_MAX_DBSPL,
} from 'services/audio-calibration-engine';
import type { HearingCalibrationStep, HeadphoneStatus } from 'types/hearing-types';

const TEAL   = '#0AADA2';
const TEAL_D = '#0f766e';
const VIOLET = '#7c3aed';

const ALL_STEPS: HearingCalibrationStep[] = ['headphone', 'volume', 'reference', 'noise', 'ready'];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBadges({ current }: { current: HearingCalibrationStep }) {
  const idx = ALL_STEPS.indexOf(current);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {ALL_STEPS.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 24, height: 24, borderRadius: 12,
                backgroundColor: done || active ? TEAL : '#f3f4f6',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: done || active ? TEAL : '#e5e7eb',
              }}
            >
              {done
                ? <Ionicons name="checkmark" size={13} color="#fff" />
                : <Text style={{ fontSize: 11, fontWeight: '800', color: active ? '#fff' : '#9ca3af' }}>{i + 1}</Text>
              }
            </View>
            {i < ALL_STEPS.length - 1 && (
              <View style={{ width: 8, height: 2, backgroundColor: done ? TEAL : '#e5e7eb' }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Animated recording rings ───────────────────────────────────────────────────────────

function RecordingRings() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.9, duration: 900, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1.0, duration: 0,   useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.8, duration: 0,   useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 80, height: 80, borderRadius: 40,
          borderWidth: 2, borderColor: '#dc2626',
          opacity, transform: [{ scale }],
        }}
      />
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="mic" size={40} color="#dc2626" />
      </View>
    </View>
  );
}

// ─── Step 1: Headphone check ──────────────────────────────────────────────────

function HeadphoneStep() {
  const { deviceProfile, setHeadphoneStatus, validateHeadphones, setCalibrationStep } = useHearingStore();

  const options: Array<{ key: HeadphoneStatus; label: string; icon: string; desc: string }> = [
    { key: 'wired',    label: 'Wired Earphones / Headphones', icon: 'ear-outline',       desc: 'Best accuracy. Recommended.' },
    { key: 'wireless', label: 'Bluetooth Headphones',         icon: 'bluetooth-outline',  desc: 'Good accuracy. Ensure low battery.' },
    { key: 'builtin',  label: 'Device Speaker',               icon: 'volume-high-outline', desc: 'Not recommended — unreliable results.' },
  ];

  const canContinue = deviceProfile.headphoneStatus !== 'unknown';

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 6 }}>
        Select Your Headphones
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 22 }}>
        For accurate audiometry, please use{' '}
        <Text style={{ fontWeight: '700' }}>wired earphones or headphones</Text> placed correctly in
        both ears before continuing.
      </Text>

      {options.map((opt) => {
        const selected = deviceProfile.headphoneStatus === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => setHeadphoneStatus(opt.key)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderRadius: 14,
              marginBottom: 10,
              borderWidth: 2,
              borderColor: selected ? TEAL : '#e5e7eb',
              backgroundColor: selected ? '#f0fdfc' : (pressed ? '#f9fafb' : '#fff'),
            })}
          >
            <Ionicons
              name={opt.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={26}
              color={selected ? TEAL : '#9ca3af'}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{opt.label}</Text>
              <Text style={{ fontSize: 12, color: opt.key === 'builtin' ? '#dc2626' : '#6b7280', marginTop: 2 }}>
                {opt.desc}
              </Text>
            </View>
            {selected && <Ionicons name="checkmark-circle" size={22} color={TEAL} />}
          </Pressable>
        );
      })}

      <View style={{ marginTop: 8, backgroundColor: '#fffbeb', borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10 }}>
        <Ionicons name="warning-outline" size={18} color="#d97706" />
        <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 }}>
          This is a screening tool only. Results are{' '}
          <Text style={{ fontWeight: '700' }}>not a clinical diagnosis</Text>. Consult an audiologist for a formal evaluation.
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => { validateHeadphones(); setCalibrationStep('volume'); }}
        disabled={!canContinue}
        style={({ pressed }) => ({
          borderRadius: 14, paddingVertical: 15, alignItems: 'center',
          backgroundColor: canContinue ? (pressed ? TEAL_D : TEAL) : '#e5e7eb',
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: canContinue ? '#fff' : '#9ca3af' }}>
          Continue →
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Step 2: Volume guidance ──────────────────────────────────────────────────

function VolumeStep() {
  const { setCalibrationStep } = useHearingStore();
  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 6 }}>
        Set Your Volume
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 22, marginBottom: 24 }}>
        For calibrated results, set your device volume to{' '}
        <Text style={{ fontWeight: '800', color: TEAL }}>70%</Text>.
      </Text>

      {/* Visual volume indicator */}
      <View style={{ backgroundColor: '#f3f4f6', borderRadius: 20, overflow: 'hidden', height: 22, marginBottom: 24 }}>
        <View style={{ height: 22, width: '70%', backgroundColor: TEAL, borderRadius: 20 }} />
        <View style={{ position: 'absolute', right: 12, top: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>70%</Text>
        </View>
      </View>

      {[
        { icon: 'volume-high-outline', text: 'Press your device volume buttons until the indicator shows approximately 70%.' },
        { icon: 'headset-outline', text: 'Ensure headphones are seated comfortably in both ears.' },
        { icon: 'moon-outline', text: 'Disable "Do Not Disturb" mode to ensure tones are not silenced.' },
      ].map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0fdfc', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={TEAL} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, color: '#374151', lineHeight: 22, paddingTop: 8 }}>{item.text}</Text>
        </View>
      ))}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => setCalibrationStep('reference')}
        style={({ pressed }) => ({
          borderRadius: 14, paddingVertical: 15, alignItems: 'center',
          backgroundColor: pressed ? TEAL_D : TEAL,
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Volume is set → Continue</Text>
      </Pressable>
    </View>
  );
}

// ─── Step 3: Reference tone ───────────────────────────────────────────────────

function ReferenceStep() {
  const { deviceProfile, setCalibrationStep, setDeviceMaxDbSPL } = useHearingStore();
  const soundRef   = useRef<Audio.Sound | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'playing' | 'done'>('idle');
  const [heard, setHeard] = useState<boolean | null>(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const playReferenceTone = useCallback(async () => {
    if (status === 'playing') return;
    setStatus('playing');
    setHeard(null);

    try {
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
      if (Platform.OS === 'web' && blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      // Generate reference tone: 1 kHz, 60 dBHL, 2 seconds
      const amplitude = dbHLToAmplitude(60, 1000, deviceProfile.estimatedMaxDbSPL);
      const wavBytes = generateToneWAV(1000, 2000, amplitude);

      let audioUri: string;
      if (Platform.OS === 'web') {
        const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        audioUri = URL.createObjectURL(blob);
        blobUrlRef.current = audioUri;
      } else {
        const wavFile = new FSFile(FSPaths.cache, 'ref_1000hz.wav');
        wavFile.write(wavBytes);
        audioUri = wavFile.uri;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true, volume: 1.0 },
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          if (Platform.OS === 'web' && blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          setStatus('done');
        }
      });
    } catch (e) {
      console.warn('Reference tone playback error:', e);
      setStatus('done');
    }
  }, [status, deviceProfile.estimatedMaxDbSPL]);

  const handleResponse = (canHear: boolean) => {
    soundRef.current?.stopAsync().catch(() => {});
    setHeard(canHear);
    setStatus('done');
    if (!canHear) {
      // User can't hear reference — increase device max SPL estimate (device louder than assumed)
      setDeviceMaxDbSPL(deviceProfile.estimatedMaxDbSPL + 10);
    }
  };

  const canContinue = heard !== null;

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 6 }}>
        Reference Tone Check
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 22, marginBottom: 24 }}>
        Tap the button below to play a{' '}
        <Text style={{ fontWeight: '700' }}>1 kHz reference tone at 60 dBHL</Text>.
        This should be clearly audible. Let us know if you can hear it.
      </Text>

      {/* Play button */}
      <Pressable
        onPress={playReferenceTone}
        disabled={status === 'playing'}
        style={({ pressed }) => ({
          alignSelf: 'center',
          width: 120, height: 120,
          borderRadius: 60,
          backgroundColor: status === 'playing' ? TEAL : (pressed ? TEAL_D : TEAL),
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 32,
          opacity: status === 'playing' ? 0.7 : 1,
          shadowColor: TEAL,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 8,
        })}
      >
        <Ionicons
          name={status === 'playing' ? 'volume-high' : 'play-circle-outline'}
          size={52}
          color="#fff"
        />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
          {status === 'playing' ? 'Playing…' : 'Play Tone'}
        </Text>
      </Pressable>

      {status !== 'idle' && (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <Pressable
            onPress={() => handleResponse(true)}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
              backgroundColor: heard === true ? '#f0fdf4' : (pressed ? '#f9fafb' : '#fff'),
              borderWidth: 2, borderColor: heard === true ? '#86efac' : '#e5e7eb',
            })}
          >
            <Ionicons name="ear-outline" size={24} color={heard === true ? '#16a34a' : '#9ca3af'} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: heard === true ? '#16a34a' : '#374151', marginTop: 4 }}>
              I can hear it
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleResponse(false)}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
              backgroundColor: heard === false ? '#fef2f2' : (pressed ? '#f9fafb' : '#fff'),
              borderWidth: 2, borderColor: heard === false ? '#fca5a5' : '#e5e7eb',
            })}
          >
            <Ionicons name="volume-mute-outline" size={24} color={heard === false ? '#dc2626' : '#9ca3af'} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: heard === false ? '#dc2626' : '#374151', marginTop: 4 }}>
              Can't hear it
            </Text>
          </Pressable>
        </View>
      )}

      {heard === false && (
        <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: '#92400e', lineHeight: 18 }}>
            The reference level has been adjusted. If you still cannot hear tones during the test,
            increase your device volume.
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => setCalibrationStep('noise')}
        disabled={!canContinue}
        style={({ pressed }) => ({
          borderRadius: 14, paddingVertical: 15, alignItems: 'center',
          backgroundColor: canContinue ? (pressed ? TEAL_D : TEAL) : '#e5e7eb',
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: canContinue ? '#fff' : '#9ca3af' }}>
          Continue →
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Step 4: Background noise check ──────────────────────────────────────────

function NoiseStep() {
  const { setNoiseAnalysis, completeCalibration } = useHearingStore();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'done'>('idle');
  const meteringValues = useRef<number[]>([]);
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeNoiseSamples> | null>(null);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const startNoiseMeasurement = useCallback(async () => {
    setPhase('recording');
    meteringValues.current = [];

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        skipNoise();
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.LOW_QUALITY,
          isMeteringEnabled: true,
        },
        (status) => {
          if (status.isRecording && status.metering !== undefined) {
            meteringValues.current.push(status.metering);
          }
        },
        50, // update interval ms
      );
      recordingRef.current = recording;

      // Record for 3 seconds
      setTimeout(async () => {
        try {
          await recording.stopAndUnloadAsync();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        } catch { /* already unloaded */ }
        const result = analyzeNoiseSamples(meteringValues.current);
        setAnalysis(result);
        setNoiseAnalysis(result);
        setPhase('done');
      }, 3_000);
    } catch (e) {
      console.warn('Noise measurement error:', e);
      skipNoise();
    }
  }, []);

  const skipNoise = () => {
    const fallback = analyzeNoiseSamples([]); // returns 'unknown' / acceptable
    setAnalysis(fallback);
    setNoiseAnalysis(fallback);
    setPhase('done');
  };

  const envColor = (env: string) => {
    if (env === 'quiet')   return '#16a34a';
    if (env === 'moderate') return '#d97706';
    return '#dc2626';
  };

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 6 }}>
        Background Noise Check
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 22, marginBottom: 24 }}>
        We'll briefly listen to your environment to ensure{' '}
        <Text style={{ fontWeight: '700' }}>ambient noise won't interfere</Text> with the test.
      </Text>

      {phase === 'idle' && (
        <>
          <View style={{ backgroundColor: '#f0fdfc', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24 }}>
            <Ionicons name="mic-outline" size={48} color={TEAL} />
            <Text style={{ fontSize: 14, color: '#374151', textAlign: 'center', marginTop: 10, lineHeight: 20 }}>
              Press the button to measure ambient noise for 3 seconds.
              {'\n'}No audio is recorded — only sound levels are measured.
            </Text>
          </View>

          <Pressable
            onPress={startNoiseMeasurement}
            style={({ pressed }) => ({
              borderRadius: 14, paddingVertical: 15, alignItems: 'center',
              backgroundColor: pressed ? TEAL_D : TEAL, marginBottom: 12,
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
              Measure Noise (3 s)
            </Text>
          </Pressable>

          <Pressable onPress={skipNoise} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>Skip this step</Text>
          </Pressable>
        </>
      )}

      {phase === 'recording' && (
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 32 }}>
          <RecordingRings />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Listening…</Text>
          <Text style={{ fontSize: 13, color: '#6b7280' }}>Please remain quiet for 3 seconds</Text>
        </View>
      )}

      {phase === 'done' && analysis && (
        <>
          <View style={{
            backgroundColor: analysis.acceptable ? '#f0fdf4' : '#fef2f2',
            borderRadius: 16, padding: 16, marginBottom: 20,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Ionicons
                name={analysis.acceptable ? 'checkmark-circle' : 'warning'}
                size={22}
                color={envColor(analysis.environment)}
              />
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827', textTransform: 'capitalize' }}>
                {analysis.environment} Environment
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>{analysis.advisory}</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
              Estimated ~{analysis.estimatedDbSPL} dBSPL
            </Text>
          </View>

          {!analysis.acceptable && (
            <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', gap: 8 }}>
              <Ionicons name="information-circle-outline" size={18} color="#d97706" />
              <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 }}>
                You can still proceed but results may be less accurate at quiet test levels. The test will automatically pause if noise spikes during testing.
              </Text>
            </View>
          )}

          <Pressable
            onPress={completeCalibration}
            style={({ pressed }) => ({
              borderRadius: 14, paddingVertical: 15, alignItems: 'center',
              backgroundColor: pressed ? TEAL_D : TEAL,
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
              {analysis.acceptable ? 'Start Test →' : 'Continue Anyway →'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─── Step 5: Ready ────────────────────────────────────────────────────────────

function ReadyStep() {
  const { deviceProfile, noiseAnalysis, startSession } = useHearingStore();

  const handleStart = () => {
    startSession();
    router.replace('/(tab)/hearingtest/pta' as never);
  };

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 6 }}>
        Ready to Begin
      </Text>
      <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 22, marginBottom: 24 }}>
        All checks complete. Here's your setup summary:
      </Text>

      {[
        {
          icon: 'headset-outline',
          label: 'Headphones',
          value: HEADPHONE_TYPE_LABELS[deviceProfile.headphoneStatus] ?? 'Unknown',
          ok: deviceProfile.headphoneStatus !== 'builtin',
        },
        {
          icon: 'volume-medium-outline',
          label: 'Device Max (estimate)',
          value: `${deviceProfile.estimatedMaxDbSPL} dBSPL`,
          ok: true,
        },
        {
          icon: 'mic-outline',
          label: 'Ambient Noise',
          value: noiseAnalysis ? `${noiseAnalysis.environment} (~${noiseAnalysis.estimatedDbSPL} dBSPL)` : 'Not checked',
          ok: noiseAnalysis?.acceptable !== false,
        },
      ].map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={row.ok ? TEAL : '#d97706'} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>{row.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{row.value}</Text>
          </View>
          <Ionicons name={row.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={row.ok ? '#16a34a' : '#d97706'} />
        </View>
      ))}

      <View style={{ marginTop: 20, backgroundColor: '#f0fdfc', borderRadius: 12, padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>What happens next:</Text>
        {[
          'You will hear a series of tones at different frequencies',
          'Press "I heard it" each time you detect a tone — no matter how faint',
          'Test right ear first, then left ear',
          'Total duration: ~5–8 minutes',
        ].map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 13, color: TEAL, fontWeight: '800' }}>{i + 1}.</Text>
            <Text style={{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 }}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={handleStart}
        style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
      >
        <LinearGradient
          colors={[TEAL, TEAL_D]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }}>Start PTA Test →</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function HearingTestIndex() {
  const { calibrationStep, setCalibrationStep, resetCalibration } = useHearingStore();

  const stepTitles: Record<HearingCalibrationStep, string> = {
    headphone: 'Headphone Setup',
    volume:    'Volume Setup',
    reference: 'Reference Tone',
    noise:     'Noise Check',
    ready:     'Ready',
  };

  const currentIdx = ALL_STEPS.indexOf(calibrationStep);

  const goBack = () => {
    if (currentIdx > 0) {
      setCalibrationStep(ALL_STEPS[currentIdx - 1]);
    } else {
      resetCalibration();
      router.replace('/(tab)/profile' as never);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6',
              alignItems: 'center', justifyContent: 'center',
            })}
          >
            <Ionicons name="arrow-back" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
              Hearing Test
            </Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>
              {stepTitles[calibrationStep]}
            </Text>
          </View>
          <StepBadges current={calibrationStep} />
        </View>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {calibrationStep === 'headphone'  && <HeadphoneStep />}
          {calibrationStep === 'volume'     && <VolumeStep />}
          {calibrationStep === 'reference'  && <ReferenceStep />}
          {calibrationStep === 'noise'      && <NoiseStep />}
          {calibrationStep === 'ready'      && <ReadyStep />}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
