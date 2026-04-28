/**
 * ChatInputBar
 *
 * Text input with hold-to-record voice messaging.
 *
 * Voice flow:
 *   1. User HOLDS the mic button  →  recording starts immediately
 *   2. WhatsApp-style animated waveform + duration timer shown
 *   3. User RELEASES the mic button → recording stops, Whisper transcription begins
 *   4. Transcribed text injected into the input field
 *   5. Temporary audio file deleted from device after transcription (pass or fail)
 *
 * Platforms:
 *   - iOS / Android: expo-av Audio.Recording with real metering
 *   - Web: MediaRecorder + AudioContext AnalyserNode for metering
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  Animated,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { VoiceService } from 'services/voice-service';
import { OcrService } from 'services/ocr-service';

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState = 'idle' | 'recording' | 'transcribing';

interface ChatInputBarProps {
  onSend?: (message: string) => void;
  /** @deprecated voice is now self-contained. Kept for API compat. */
  onMicPress?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_BARS = 9;
// Per-bar height envelope — center bars reach full height, edges shorter.
const BAR_ENVELOPE = [0.32, 0.52, 0.72, 0.9, 1.0, 0.9, 0.72, 0.52, 0.32];
const MAX_CHARS = 5000;
// Minimum recording duration (ms) before we attempt transcription.
const MIN_RECORD_MS = 400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Normalise dBFS metering value (-160..0) → 0–1 amplitude fraction. */
function normaliseMeter(dbFS: number): number {
  return Math.min(1, Math.max(0, (dbFS + 60) / 60));
}

/**
 * Converts a captured image URI to a raw base64 string.
 * Fallback for when expo-camera returns a URI without the base64 field.
 */
async function imageUriToBase64(uri: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const r = await fetch(uri);
      const blob = await r.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1] ?? res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  } catch {
    return null;
  }
}

// ─── Camera scanner constants ─────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const FRAME_W = SCREEN_W * 0.84;
const FRAME_H = FRAME_W * 1.35;

// ─── Component ────────────────────────────────────────────────────────────────

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSend,
  placeholder = 'How are you feeling...',
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [ocrState, setOcrState] = useState<'idle' | 'camera' | 'scanning'>('idle');
  // Captured photo URI shown as preview while OCR is running.
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Pre-warm microphone permission on web so the getUserMedia call inside
  // startRecordingWeb resolves immediately (no permission dialog during a hold)
  // and avoids the race condition where the dialog's "Allow" click triggers a
  // pointerup that fires onPressOut before recording can start.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => {/* user may deny – that's fine, handled at press time */});
  }, []);

  // ── Waveform bar animations ──────────────────────────────────────────────
  const barAnims = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.15))
  ).current;

  // ── Send button spring ───────────────────────────────────────────────────
  const sendScaleAnim = useRef(new Animated.Value(1)).current;

  // ── Idle attention shake ──────────────────────────────────────────────────
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Mic pulse (recording state) ───────────────────────────────────────────
  const micPulse = useRef(new Animated.Value(1)).current;

  // ── Recording refs ───────────────────────────────────────────────────────
  const nativeRecordingRef = useRef<Audio.Recording | null>(null);
  const meterLevelRef = useRef<number>(-60);
  const recordStartRef = useRef<number>(0);

  // Wave animation interval
  const waveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Duration counter interval
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against the race where the user releases the button before
  // getUserMedia / Audio.requestPermissionsAsync resolves.
  const pressActiveRef = useRef(false);

  // Web-specific refs
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webAnalyserRef = useRef<AnalyserNode | null>(null);
  const webAnimFrameRef = useRef<number | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);

  // ── Wave animation ────────────────────────────────────────────────────────

  const startWaveAnimation = useCallback(() => {
    if (waveIntervalRef.current) clearInterval(waveIntervalRef.current);

    const tick = () => {
      const level = normaliseMeter(meterLevelRef.current);
      const t = Date.now() / 260;
      barAnims.forEach((anim, i) => {
        const phase = (i / NUM_BARS) * Math.PI * 1.8;
        const wave = 0.5 + 0.5 * Math.sin(t + phase);
        const jitter = Math.random() * 0.06;
        const target = 0.12 + BAR_ENVELOPE[i] * (0.3 + level * 0.7 + jitter) * wave;
        Animated.timing(anim, {
          toValue: Math.min(0.97, Math.max(0.1, target)),
          duration: 80,
          useNativeDriver: true,
        }).start();
      });
    };

    tick();
    waveIntervalRef.current = setInterval(tick, 80);
  }, [barAnims]);

  const stopWaveAnimation = useCallback(() => {
    if (waveIntervalRef.current) {
      clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = null;
    }
    barAnims.forEach((anim) => {
      Animated.timing(anim, { toValue: 0.15, duration: 150, useNativeDriver: true }).start();
    });
  }, [barAnims]);

  // ── Duration counter ──────────────────────────────────────────────────────

  const startDurationCounter = useCallback(() => {
    setRecordingDuration(0);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1);
    }, 1000);
  }, []);

  const stopDurationCounter = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // ── Mic pulse loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (voiceState === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.14, duration: 450, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1.0, duration: 450, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => { loop.stop(); micPulse.setValue(1); };
    } else {
      micPulse.setValue(1);
    }
  }, [voiceState, micPulse]);

  // ── Idle attention shake ──────────────────────────────────────────────────

  const hasText = text.trim().length > 0;

  useEffect(() => {
    if (!hasText && !disabled && voiceState === 'idle') {
      const shake = Animated.loop(
        Animated.sequence([
          Animated.delay(3500),
          Animated.timing(shakeAnim, { toValue: -5, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 5, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -4, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ])
      );
      shake.start();
      return () => { shake.stop(); shakeAnim.setValue(0); };
    } else {
      shakeAnim.setValue(0);
    }
  }, [hasText, disabled, voiceState, shakeAnim]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopWaveAnimation();
      stopDurationCounter();
      nativeRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
      webMediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      if (webAnimFrameRef.current) cancelAnimationFrame(webAnimFrameRef.current);
      webAudioCtxRef.current?.close().catch(() => {});
    };
  }, [stopWaveAnimation, stopDurationCounter]);

  // ── Native recording ──────────────────────────────────────────────────────

  const startRecordingNative = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone Access Required',
          'Please allow microphone access in your device settings to use voice messages.'
        );
        return false;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      rec.setOnRecordingStatusUpdate((s) => {
        if (s.isRecording && s.metering !== undefined) {
          meterLevelRef.current = s.metering;
        }
      });
      await rec.startAsync();
      nativeRecordingRef.current = rec;
      meterLevelRef.current = -60;
      return true;
    } catch (err) {
      console.error('[Voice] startRecordingNative:', err);
      return false;
    }
  }, []);

  const stopRecordingNative = useCallback(async (): Promise<string | null> => {
    const rec = nativeRecordingRef.current;
    if (!rec) return null;
    nativeRecordingRef.current = null;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return rec.getURI() ?? null;
    } catch (err) {
      console.error('[Voice] stopRecordingNative:', err);
      return null;
    }
  }, []);

  // ── Web recording ─────────────────────────────────────────────────────────

  const startRecordingWeb = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      webAudioCtxRef.current = ctx;
      webAnalyserRef.current = analyser;

      const updateMeter = () => {
        if (!webAnalyserRef.current) return;
        const data = new Uint8Array(webAnalyserRef.current.frequencyBinCount);
        webAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        meterLevelRef.current = -60 + (avg / 255) * 60;
        webAnimFrameRef.current = requestAnimationFrame(updateMeter);
      };
      webAnimFrameRef.current = requestAnimationFrame(updateMeter);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      webChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) webChunksRef.current.push(e.data); };
      mr.start(100);
      webMediaRecorderRef.current = mr;
      meterLevelRef.current = -60;
      return true;
    } catch (err) {
      console.error('[Voice] startRecordingWeb:', err);
      return false;
    }
  }, []);

  const stopRecordingWeb = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = webMediaRecorderRef.current;
      if (!mr) { resolve(null); return; }

      if (webAnimFrameRef.current) { cancelAnimationFrame(webAnimFrameRef.current); webAnimFrameRef.current = null; }
      webAnalyserRef.current = null;
      webAudioCtxRef.current?.close().catch(() => {});
      webAudioCtxRef.current = null;

      mr.addEventListener('stop', () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        const chunks = webChunksRef.current;
        webChunksRef.current = [];
        webMediaRecorderRef.current = null;
        if (chunks.length === 0) { resolve(null); return; }
        resolve(new Blob(chunks, { type: chunks[0].type || 'audio/webm' }));
      }, { once: true });
      mr.stop();
    });
  }, []);

  // ── Camera / OCR handlers ────────────────────────────────────────────────

  const handleCameraPress = useCallback(async () => {
    if (disabled || voiceState !== 'idle' || ocrState !== 'idle') return;

    // On web, CameraView triggers the browser's own getUserMedia permission
    // dialog when it mounts — navigator.permissions.request is not supported
    // in Chrome so we must NOT call requestCameraPermission() on web.
    if (Platform.OS !== 'web') {
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();
        if (!result.granted) {
          Alert.alert(
            'Camera Access Required',
            'Please allow camera access in your device settings to scan medical documents.',
          );
          return;
        }
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOcrState('camera');
  }, [disabled, voiceState, ocrState, cameraPermission, requestCameraPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.72,
        // Skip saving to gallery — in-memory only
        skipProcessing: true,
      });

      // Show the captured photo inside the modal with a scanning overlay
      // instead of closing the modal first.
      setCapturedUri(photo.uri);
      setOcrState('scanning');

      const base64 = photo.base64 ?? (await imageUriToBase64(photo.uri));
      if (!base64) {
        Alert.alert('Camera Error', 'Could not read the captured image. Please try again.');
        setOcrState('camera');
        setCapturedUri(null);
        return;
      }

      const result = await OcrService.scanImage(base64, 'image/jpeg');

      if (!result.isMedical) {
        Alert.alert(
          'Not a Medical Document',
          "This image doesn't appear to be a medical document.\n\nPlease scan lab results, prescriptions, X-ray reports, medical notes, or similar clinical documents.",
          [
            { text: 'Scan Again', onPress: () => { setCapturedUri(null); setOcrState('camera'); } },
            { text: 'Done', style: 'cancel', onPress: () => { setCapturedUri(null); setOcrState('idle'); } },
          ],
        );
        return;
      }

      if (result.text) {
        const formatted = `[Medical Document Scan]\n${result.text}`;
        setText((prev) => (prev ? `${prev}\n\n${formatted}` : formatted));
      }
      setCapturedUri(null);
      setOcrState('idle');
    } catch (err) {
      console.error('[OCR] capture error:', err);
      Alert.alert('Scan Error', 'Could not analyze the image. Please try again.',
        [{ text: 'Try Again', onPress: () => { setCapturedUri(null); setOcrState('camera'); } },
         { text: 'Cancel', style: 'cancel', onPress: () => { setCapturedUri(null); setOcrState('idle'); } }],
      );
    }
  }, []);

  // ── Hold-to-record handlers ───────────────────────────────────────────────

  const handleMicPressIn = useCallback(async () => {
    if (disabled || voiceState !== 'idle') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    recordStartRef.current = Date.now();
    pressActiveRef.current = true;

    const started = Platform.OS === 'web'
      ? await startRecordingWeb()
      : await startRecordingNative();

    // User released the button before permission prompt resolved — cancel.
    if (!started || !pressActiveRef.current) {
      if (started) {
        if (Platform.OS === 'web') await stopRecordingWeb();
        else await stopRecordingNative();
      }
      return;
    }
    setVoiceState('recording');
    startDurationCounter();
    startWaveAnimation();
  }, [disabled, voiceState, startRecordingWeb, startRecordingNative, stopRecordingWeb, stopRecordingNative, startDurationCounter, startWaveAnimation]);

  const handleMicPressOut = useCallback(async () => {
    pressActiveRef.current = false;
    if (voiceState !== 'recording') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopWaveAnimation();
    stopDurationCounter();

    const elapsed = Date.now() - recordStartRef.current;

    if (elapsed < MIN_RECORD_MS) {
      // Too short — cancel silently
      if (Platform.OS === 'web') await stopRecordingWeb();
      else await stopRecordingNative();
      barAnims.forEach((a) => a.setValue(0.15));
      setVoiceState('idle');
      setRecordingDuration(0);
      return;
    }

    setVoiceState('transcribing');

    try {
      if (Platform.OS === 'web') {
        const blob = await stopRecordingWeb();
        if (blob && blob.size > 1000) {
          const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
          const transcript = await VoiceService.transcribeBlob(blob, `audio.${ext}`);
          if (transcript) setText((p) => (p ? `${p} ${transcript}` : transcript));
        }
      } else {
        const uri = await stopRecordingNative();
        if (uri) {
          // transcribeUri deletes the file regardless of success/failure
          const transcript = await VoiceService.transcribeUri(uri);
          if (transcript) setText((p) => (p ? `${p} ${transcript}` : transcript));
        }
      }
    } catch (err) {
      console.error('[Voice] transcription error:', err);
      Alert.alert('Voice Error', 'Could not transcribe the recording. Please try again.');
    } finally {
      setVoiceState('idle');
      setRecordingDuration(0);
    }
  }, [voiceState, stopWaveAnimation, stopDurationCounter, stopRecordingWeb, stopRecordingNative, barAnims]);

  // ── Send handler ──────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    if (!text.trim() || disabled || voiceState !== 'idle') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.timing(sendScaleAnim, { toValue: 0.84, duration: 70, useNativeDriver: true }),
      Animated.spring(sendScaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 5 }),
    ]).start();

    onSend?.(text.trim());
    setText('');
  }, [text, disabled, voiceState, sendScaleAnim, onSend]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const charCount = text.length;
  const showCounter = charCount > 4000;
  const isNearLimit = charCount > 4500;
  const isVoiceActive = voiceState !== 'idle' || ocrState !== 'idle';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 28 : 14,
      }}
    >
      {/* Status label */}
      {voiceState === 'recording' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#0d9488' }} />
          <Text style={{ fontSize: 12, color: '#0d9488', fontWeight: '600', letterSpacing: 0.4 }}>
            Recording… release to send
          </Text>
        </View>
      )}
      {voiceState === 'transcribing' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 8 }}>
          <ActivityIndicator size="small" color="#0d9488" />
          <Text style={{ fontSize: 12, color: '#0d9488', fontWeight: '600', letterSpacing: 0.4 }}>
            Transcribing…
          </Text>
        </View>
      )}
      {ocrState === 'scanning' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 8 }}>
          <ActivityIndicator size="small" color="#0d9488" />
          <Text style={{ fontSize: 12, color: '#0d9488', fontWeight: '600', letterSpacing: 0.4 }}>
            Analyzing medical scan…
          </Text>
        </View>
      )}

      {/* Character counter */}
      {showCounter && voiceState === 'idle' && (
        <Text style={{
          fontSize: 11, textAlign: 'right', marginBottom: 4, marginRight: 4,
          color: isNearLimit ? '#dc2626' : '#64748b',
          fontWeight: isNearLimit ? '600' : '400',
        }}>
          {charCount}/{MAX_CHARS}
        </Text>
      )}

      {/* Input row */}
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderRadius: 30,
          paddingLeft: 4,
          paddingRight: 6,
          paddingVertical: 6,
          opacity: disabled ? 0.55 : 1,
          transform: [{ translateX: shakeAnim }],
          borderWidth: voiceState === 'recording' ? 1.5 : 0,
          borderColor: voiceState === 'recording' ? 'rgba(13,148,136,0.35)' : 'transparent',
        }}
      >
        {/* ── Camera scan button (left edge, idle only) ── */}
        {voiceState === 'idle' && ocrState === 'idle' && (
          <TouchableOpacity
            onPress={handleCameraPress}
            disabled={disabled}
            activeOpacity={0.7}
            style={{ marginLeft: 6, marginRight: 2, padding: 4 }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: 'rgba(13,148,136,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="camera-outline" size={19} color="#0d9488" />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Recording: duration + WhatsApp waveform ── */}
        {voiceState === 'recording' && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0d9488', minWidth: 42, letterSpacing: 0.5 }}>
              {formatDuration(recordingDuration)}
            </Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 32 }}>
              {barAnims.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={{
                    width: 3,
                    height: 28,
                    backgroundColor: '#0d9488',
                    borderRadius: 2,
                    transform: [{ scaleY: anim }],
                  }}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Transcribing: spinner ── */}
        {voiceState === 'transcribing' && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <ActivityIndicator size="small" color="#0d9488" />
            <Text style={{ fontSize: 14, color: '#0d9488', fontWeight: '500' }}>
              Transcribing voice…
            </Text>
          </View>
        )}

        {/* ── Scanning: OCR in progress ── */}
        {ocrState === 'scanning' && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 12 }}>
            <ActivityIndicator size="small" color="#0d9488" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: '#0d9488', fontWeight: '600' }}>
                Analyzing medical image…
              </Text>
              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                AI is reading your document
              </Text>
            </View>
          </View>
        )}

        {/* ── Idle: text input ── */}
        {voiceState === 'idle' && ocrState !== 'scanning' && (
          <View style={{ flex: 1, justifyContent: 'center', minHeight: 44 }}>
            {!hasText && (
              <View
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
              >
                <Text numberOfLines={1} style={{ fontSize: 14.5, color: '#7db9b4' }}>
                  {placeholder}
                </Text>
              </View>
            )}
            <TextInput
              style={{ fontSize: 14.5, color: '#134e4a', lineHeight: 20, paddingVertical: 6, maxHeight: 110 }}
              value={text}
              onChangeText={setText}
              placeholder=""
              placeholderTextColor="transparent"
              multiline
              returnKeyType="default"
              selectionColor="#0d9488"
              editable={!disabled}
              maxLength={MAX_CHARS}
            />
          </View>
        )}

        {/* ── Mic button (hold to record) ── */}
        <Pressable
          onPressIn={handleMicPressIn}
          onPressOut={handleMicPressOut}
          disabled={disabled || voiceState === 'transcribing' || ocrState === 'scanning'}
          style={{ marginRight: 4, padding: 4 }}
        >
          <Animated.View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', transform: [{ scale: micPulse }] }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(13,148,136,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={voiceState === 'transcribing' ? 'mic-off-outline' : voiceState === 'recording' ? 'mic' : 'mic-outline'}
                size={20}
                color={voiceState === 'transcribing' ? '#94a3b8' : '#0d9488'}
              />
            </View>
          </Animated.View>
        </Pressable>

        {/* ── Send button ── */}
        <Animated.View style={{ transform: [{ scale: sendScaleAnim }] }}>
          <TouchableOpacity
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={disabled || !hasText || isVoiceActive}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: hasText && !disabled && !isVoiceActive ? '#0f766e' : '#b2d8d4',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#0d4a40',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: hasText && !disabled && !isVoiceActive ? 0.28 : 0.06,
              shadowRadius: 6,
              elevation: hasText && !disabled && !isVoiceActive ? 5 : 1,
            }}
          >
            <Ionicons name="arrow-up" size={22} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Hold-to-record hint */}
      {voiceState === 'idle' && ocrState === 'idle' && !hasText && !disabled && (
        <Text style={{ textAlign: 'center', marginTop: 6, fontSize: 10.5, color: '#94a3b8', letterSpacing: 0.3 }}>
          Hold mic to record · Tap camera to scan a document
        </Text>
      )}

      {/* ── Medical Document Scanner Modal ─────────────────────────────────── */}
      <Modal
        visible={ocrState !== 'idle'}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => { setCapturedUri(null); setOcrState('idle'); }}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>

          {/* ── LIVE CAMERA VIEW ── */}
          {ocrState === 'camera' && (
            <CameraView
              ref={cameraRef}
              style={{ flex: 1 }}
              facing={Platform.OS === 'web' ? 'front' : 'back'}
            >
              {/* Absolute UI layer — does NOT cover the camera feed with a background */}

              {/* Dark mask TOP */}
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 148, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              {/* Dark mask LEFT */}
              <View style={{ position: 'absolute', top: 148, left: 0, width: (SCREEN_W - FRAME_W) / 2, bottom: 180, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              {/* Dark mask RIGHT */}
              <View style={{ position: 'absolute', top: 148, right: 0, width: (SCREEN_W - FRAME_W) / 2, bottom: 180, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              {/* Dark mask BOTTOM */}
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, backgroundColor: 'rgba(0,0,0,0.55)' }} />

              {/* Top instruction card */}
              <View style={{ position: 'absolute', top: 54, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', maxWidth: 320 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                    <Ionicons name="scan-outline" size={16} color="#0d9488" />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Scan Medical Document</Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
                    Lab results · Prescriptions · X-ray reports · Medical notes
                  </Text>
                </View>
              </View>

              {/* Document scan frame — 4 corner brackets only (camera visible through centre) */}
              <View style={{ position: 'absolute', top: 148, left: (SCREEN_W - FRAME_W) / 2, width: FRAME_W, height: FRAME_H }}>
                {/* TL */}<View style={{ position: 'absolute', top: 0, left: 0, width: 36, height: 36, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#0d9488', borderTopLeftRadius: 8 }} />
                {/* TR */}<View style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#0d9488', borderTopRightRadius: 8 }} />
                {/* BL */}<View style={{ position: 'absolute', bottom: 0, left: 0, width: 36, height: 36, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#0d9488', borderBottomLeftRadius: 8 }} />
                {/* BR */}<View style={{ position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#0d9488', borderBottomRightRadius: 8 }} />
                {/* Centre crosshair (subtle) */}
                <View style={{ position: 'absolute', top: '50%', left: '50%', width: 16, height: 16, marginTop: -8, marginLeft: -8, opacity: 0.4 }}>
                  <View style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 2, backgroundColor: '#0d9488' }} />
                  <View style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, backgroundColor: '#0d9488' }} />
                </View>
              </View>

              {/* Bottom controls */}
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 40, justifyContent: 'space-between' }}>

                  {/* Cancel */}
                  <TouchableOpacity
                    onPress={() => { setCapturedUri(null); setOcrState('idle'); }}
                    activeOpacity={0.7}
                    style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="close" size={22} color="#fff" />
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>Cancel</Text>
                  </TouchableOpacity>

                  {/* Capture shutter */}
                  <TouchableOpacity
                    onPress={handleCapture}
                    activeOpacity={0.85}
                    style={{ alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{ width: 82, height: 82, borderRadius: 41, borderWidth: 3.5, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#0d9488' }} />
                      </View>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 8 }}>Capture</Text>
                  </TouchableOpacity>

                  {/* Torch / Flash placeholder (symmetry) */}
                  <View style={{ width: 56, height: 56 }} />
                </View>
              </View>

            </CameraView>
          )}

          {/* ── SCANNING OVERLAY: show captured photo + spinner ── */}
          {ocrState === 'scanning' && (
            <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
              {capturedUri ? (
                <>
                  <View style={{ width: FRAME_W, height: FRAME_H, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#0d9488' }}>
                    <Image
                      source={{ uri: capturedUri }}
                      style={{ width: FRAME_W, height: FRAME_H }}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: 20, paddingHorizontal: 32, paddingVertical: 24, alignItems: 'center', gap: 14 }}>
                      <ActivityIndicator size="large" color="#0d9488" />
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 }}>Analyzing Document…</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' }}>AI is reading your medical document</Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ alignItems: 'center', gap: 16 }}>
                  <ActivityIndicator size="large" color="#0d9488" />
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Analyzing Document…</Text>
                </View>
              )}
            </View>
          )}

        </View>
      </Modal>
    </View>
  );
};
