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
import * as FileSystem from 'expo-file-system/legacy';
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
        encoding: 'base64',
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
  const textRef = useRef('');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [ocrState, setOcrState] = useState<'idle' | 'camera' | 'scanning'>('idle');
  // Captured photo URI shown as preview while OCR is running.
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  // True for ~1.5s after a quick tap so we can show "Hold to record" hint.
  const [showHoldHint, setShowHoldHint] = useState(false);
  // Which camera lens is active — toggled by the flip button in the scanner modal.
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const autoSubmitExtractedText = useCallback(
    (extracted: string, separator: string) => {
      const cleaned = extracted.trim();
      if (!cleaned) return;

      const existing = textRef.current.trim();
      const payload = existing ? `${existing}${separator}${cleaned}` : cleaned;

      if (onSend && !disabled) {
        onSend(payload);
        textRef.current = '';
        setText('');
      } else {
        textRef.current = payload;
        setText(payload);
      }
    },
    [onSend, disabled]
  );

  // ── voiceState ref — always in sync with voiceState ──────────────────────
  // handleMicPressOut uses a ref so it is never stale in its useCallback
  // closure, which would cause the recording to run forever when the user
  // releases the button in the ~50 ms window between setVoiceState('recording')
  // and React re-rendering the Pressable with the updated onPressOut handler.
  const voiceStateRef = useRef<VoiceState>('idle');
  const setVoiceStateAndRef = useCallback((s: VoiceState) => {
    voiceStateRef.current = s;
    setVoiceState(s);
  }, []);

  // Tracks whether the browser has already granted microphone permission.
  // Set to true the first time getUserMedia succeeds so subsequent holds
  // skip the permission-check path and go straight to recording.
  const webMicPermissionGrantedRef = useRef(false);

  // Same pattern for camera — avoids the camera modal opening while the
  // browser permission dialog is also visible on first press.
  const webCameraPermissionGrantedRef = useRef(false);

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
      // If microphone permission hasn't been granted yet, request it now.
      // We must NOT start recording during the dialog — the browser dialog's
      // "Allow" click fires pointerleave on the Pressable which would cancel
      // the hold gesture. So we request, mark granted, and return false so
      // the user simply presses the mic again to start the actual recording.
      if (!webMicPermissionGrantedRef.current) {
        let alreadyGranted = false;
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          alreadyGranted = result.state === 'granted';
        } catch {
          // permissions API not supported — fall through to getUserMedia check
        }
        if (!alreadyGranted) {
          // This may show a browser permission dialog; return false so that
          // the hold gesture is not active while the dialog is open.
          await navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((s) => { s.getTracks().forEach((t) => t.stop()); webMicPermissionGrantedRef.current = true; })
            .catch(() => {});
          return false;
        }
        webMicPermissionGrantedRef.current = true;
      }

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

    if (Platform.OS === 'web') {
      // On web, CameraView triggers the browser's getUserMedia dialog when it
      // mounts. To avoid the camera modal opening at the same time as the
      // permission dialog, we request camera access on the first press and
      // return early. The user presses the icon again to open the camera once
      // permission is granted.
      if (!webCameraPermissionGrantedRef.current) {
        let alreadyGranted = false;
        try {
          const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
          alreadyGranted = result.state === 'granted';
        } catch {
          // permissions API not supported — fall through to getUserMedia
        }
        if (!alreadyGranted) {
          await navigator.mediaDevices
            ?.getUserMedia({ video: true })
            .then((s) => { s.getTracks().forEach((t) => t.stop()); webCameraPermissionGrantedRef.current = true; })
            .catch(() => {});
          return;
        }
        webCameraPermissionGrantedRef.current = true;
      }
    } else {
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

    // Tracks whether the post-capture state has already been explicitly reset
    // by one of the alert button handlers. Used in the finally block to avoid
    // a double-reset that would fight with the "Scan Again" → camera flow.
    let stateHandled = false;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.72,
      });

      // Show the captured photo inside the modal with a scanning overlay
      // instead of closing the modal first.
      setCapturedUri(photo.uri);
      setOcrState('scanning');

      // On web, expo-camera returns a full data-URI in photo.base64
      // (e.g. "data:image/jpeg;base64,xxxx"). Strip the prefix so we only
      // send the raw base64 payload — the backend adds the prefix itself
      // when building the OpenAI Vision URL.
      const rawCapture = photo.base64 ?? (await imageUriToBase64(photo.uri));
      const base64 = rawCapture?.includes(',') ? rawCapture.split(',')[1]! : rawCapture;
      if (!base64) {
        Alert.alert(
          'Camera Error',
          'Could not read the captured image. Please try again.',
          [
            { text: 'Try Again', onPress: () => { stateHandled = true; setCapturedUri(null); setOcrState('camera'); } },
            { text: 'Cancel', style: 'cancel', onPress: () => { stateHandled = true; setCapturedUri(null); setOcrState('idle'); } },
          ],
          // Prevent Android back-button from dismissing without a choice — that
          // would leave ocrState stuck at 'scanning' and permanently disable mic.
          { cancelable: false },
        );
        return;
      }

      const result = await OcrService.scanImage(base64, 'image/jpeg');

      if (!result.isMedical) {
        Alert.alert(
          'Not a Medical Document',
          "This image doesn't appear to be a medical document.\n\nPlease scan lab results, prescriptions, X-ray reports, medical notes, or similar clinical documents.",
          [
            { text: 'Scan Again', onPress: () => { stateHandled = true; setCapturedUri(null); setOcrState('camera'); } },
            { text: 'Done', style: 'cancel', onPress: () => { stateHandled = true; setCapturedUri(null); setOcrState('idle'); } },
          ],
          { cancelable: false },
        );
        return;
      }

      if (result.text) {
        const formatted = `[Medical Document Scan]\n${result.text}`;
        autoSubmitExtractedText(formatted, '\n\n');
      }
      stateHandled = true;
      setCapturedUri(null);
      setOcrState('idle');
    } catch (err: unknown) {
      console.error('[OCR] capture error:', err);
      // Check for 429 scan-limit response from the server.
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      const errCode = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (httpStatus === 429 || errCode === 'SCAN_LIMIT_EXCEEDED') {
        stateHandled = true;
        setCapturedUri(null);
        setOcrState('idle');
        Alert.alert(
          'Daily Scan Limit Reached',
          'Free users can scan up to 5 medical documents per day. Upgrade to LifeGate Premium for unlimited scans.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Upgrade to Premium', onPress: () => { const { router } = require('expo-router'); router.push('/(tab)/settings/subscription'); } },
          ],
          { cancelable: false },
        );
        return;
      }
      Alert.alert(
        'Scan Error',
        'Could not analyze the image. Please try again.',
        [
          { text: 'Try Again', onPress: () => { stateHandled = true; setCapturedUri(null); setOcrState('camera'); } },
          { text: 'Cancel', style: 'cancel', onPress: () => { stateHandled = true; setCapturedUri(null); setOcrState('idle'); } },
        ],
        { cancelable: false },
      );
    } finally {
      // Safety net: if no alert button was pressed (e.g. the alert was somehow
      // dismissed without firing a handler), reset state here so the mic is
      // never permanently disabled.
      if (!stateHandled) {
        setCapturedUri(null);
        setOcrState('idle');
      }
    }
  }, [autoSubmitExtractedText]);

  // ── Shared stop + transcribe logic ───────────────────────────────────────
  // Used by both the native release handler and the web second-tap handler.

  const stopAndTranscribe = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopWaveAnimation();
    stopDurationCounter();

    const elapsed = Date.now() - recordStartRef.current;

    if (elapsed < MIN_RECORD_MS) {
      // Recording too short — cancel and show hint.
      if (Platform.OS === 'web') await stopRecordingWeb();
      else await stopRecordingNative();
      barAnims.forEach((a) => a.setValue(0.15));
      setVoiceStateAndRef('idle');
      setRecordingDuration(0);
      setShowHoldHint(true);
      setTimeout(() => setShowHoldHint(false), 2000);
      return;
    }

    setVoiceStateAndRef('transcribing');

    try {
      if (Platform.OS === 'web') {
        const blob = await stopRecordingWeb();
        if (blob && blob.size > 1000) {
          const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
          const transcript = await VoiceService.transcribeBlob(blob, `audio.${ext}`);
          if (transcript) autoSubmitExtractedText(transcript, ' ');
        }
      } else {
        const uri = await stopRecordingNative();
        if (uri) {
          const transcript = await VoiceService.transcribeUri(uri);
          if (transcript) autoSubmitExtractedText(transcript, ' ');
        }
      }
    } catch (err) {
      console.error('[Voice] transcription error:', err);
      Alert.alert('Voice Error', 'Could not transcribe the recording. Please try again.');
    } finally {
      setVoiceStateAndRef('idle');
      setRecordingDuration(0);
    }
  }, [stopWaveAnimation, stopDurationCounter, stopRecordingWeb, stopRecordingNative, barAnims, setVoiceStateAndRef, autoSubmitExtractedText]);

  // ── Platform-specific recording interaction ───────────────────────────────
  //
  // WEB  → Tap-to-toggle:  first tap starts, second tap stops.
  //        Reason: hold-to-record is unreliable on web because getUserMedia
  //        takes 50-200ms to initialise audio hardware even with pre-granted
  //        permission. Any pointer-leave or gesture-cancel during that async
  //        gap silently cancels the recording before the waveform ever shows.
  //
  // NATIVE → Hold-to-record: press-in starts, release stops (the classic UX).

  const handleMicPressIn = useCallback(async () => {
    if (disabled) return;

    // Web tap-to-toggle: if already recording, this second tap = stop.
    if (Platform.OS === 'web' && voiceStateRef.current === 'recording') {
      await stopAndTranscribe();
      return;
    }

    if (voiceStateRef.current !== 'idle') return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    recordStartRef.current = Date.now();
    pressActiveRef.current = true;

    const started = Platform.OS === 'web'
      ? await startRecordingWeb()
      : await startRecordingNative();

    if (!started) {
      // Recording failed to start — tell the user rather than failing silently.
      pressActiveRef.current = false;
      Alert.alert(
        'Microphone Unavailable',
        'Could not access the microphone. Please check your browser or device permissions and try again.',
        [{ text: 'OK' }],
      );
      return;
    }

    // Native only: if user already released before getUserMedia resolved, cancel.
    if (Platform.OS !== 'web' && !pressActiveRef.current) {
      await stopRecordingNative();
      return;
    }

    setVoiceStateAndRef('recording');
    startDurationCounter();
    startWaveAnimation();
  }, [disabled, startRecordingWeb, startRecordingNative, stopRecordingNative, startDurationCounter, startWaveAnimation, setVoiceStateAndRef, stopAndTranscribe]);

  const handleMicPressOut = useCallback(async () => {
    pressActiveRef.current = false;

    // Web uses tap-to-toggle — ignore the release event entirely.
    if (Platform.OS === 'web') return;

    // Native hold-to-record: release = stop.
    if (voiceStateRef.current !== 'recording') return;
    await stopAndTranscribe();
  }, [stopAndTranscribe]);

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
            {Platform.OS === 'web' ? 'Recording… tap mic to stop' : 'Recording… release to send'}
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
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10 }}>
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
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 10 }}>
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
          testID="mic-button"
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

      {/* Hold-to-record hint — shown always when idle + empty, or briefly after a quick tap */}
      {voiceState === 'idle' && ocrState === 'idle' && !disabled && (
        <Text
          style={{
            textAlign: 'center',
            marginTop: 6,
            fontSize: showHoldHint ? 12 : 10.5,
            color: showHoldHint ? '#0d9488' : (hasText ? 'transparent' : '#94a3b8'),
            fontWeight: showHoldHint ? '600' : '400',
            letterSpacing: 0.3,
          }}
        >
          {showHoldHint
            ? (Platform.OS === 'web' ? '⬆ Tap the mic to start recording' : '⬆ Hold the mic button to record')
            : (Platform.OS === 'web' ? 'Tap mic to record · Tap camera to scan a document' : 'Hold mic to record · Tap camera to scan a document')
          }
        </Text>
      )}

      {/* ── Medical Document Scanner Modal ─────────────────────────────────── */}
      <Modal
        visible={ocrState !== 'idle'}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        statusBarTranslucent
        onRequestClose={() => { setCapturedUri(null); setOcrState('idle'); setCameraFacing('back'); }}
      >
        {/* Semi-transparent overlay — app UI visible at ~10% behind */}
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.90)' }}>

          {/* ── LIVE CAMERA VIEW ── */}
          {ocrState === 'camera' && (
            <>
              {/* Camera feed — constrained to the scan frame only */}
              <View style={{
                position: 'absolute',
                top: 148,
                left: (SCREEN_W - FRAME_W) / 2,
                width: FRAME_W,
                height: FRAME_H,
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <CameraView
                  key={cameraFacing}
                  ref={cameraRef}
                  style={{ flex: 1 }}
                  facing={cameraFacing}
                />
              </View>

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
                    onPress={() => { setCapturedUri(null); setOcrState('idle'); setCameraFacing('back'); }}
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

                  {/* Flip camera */}
                  <TouchableOpacity
                    onPress={() => setCameraFacing((f) => (f === 'back' ? 'front' : 'back'))}
                    activeOpacity={0.7}
                    style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>Flip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* ── SCANNING OVERLAY: show captured photo + spinner ── */}
          {ocrState === 'scanning' && (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
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
