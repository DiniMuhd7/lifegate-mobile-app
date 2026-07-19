/**
 * LiveVoiceScreen — Gemini Live-style full-screen voice interface
 *
 * Launched when the user taps the mic button in ChatInputBar on chatScreen.
 * It sits as a full-screen modal above the chat (presented via router.push
 * from ChatInputBar). Closing the screen returns to chatScreen seamlessly.
 *
 * PIPELINE PER TURN
 *  1. User holds button  → native Audio.Recording starts (same as ChatInputBar)
 *  2. User releases      → audio sent to POST /genai/voice-chat
 *  3. Server            → Whisper transcription → EDIS Chat (language-aware) → TTS (mp3)
 *  4. Client            → plays mp3 via expo-av, shows transcript + AI reply
 *  5. Turn appended to the active chat-store conversation (same as text chat)
 *
 * LANGUAGE
 *  The backend reads the patient's `language` profile field and runs the full
 *  EDIS language-enforcement pass, so every AI reply is in the patient's
 *  preferred language — same as regular text chat.
 *
 * DESIGN LANGUAGE
 *  Deep navy background (#0a1628) with a single animated orb that pulses and
 *  breathes as the AI "thinks". Teal (#0AADA2) accent for brand consistency
 *  with the rest of the app. Minimal chrome: one big record button, live
 *  transcript at the bottom, no extra controls to confuse.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Alert,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';

import { VoiceChatService } from 'services/voice-service';
import { useChatStore } from 'stores/chat-store';
import { useAuthStore } from 'stores/auth/auth-store';
import type { Message } from 'types/chat-types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'        // waiting for user to press
  | 'recording'   // user is holding, mic active
  | 'processing'  // audio sent, waiting for server
  | 'speaking'    // AI audio playing back
  | 'error';      // something went wrong

type Turn = {
  id: string;
  userText: string;
  aiText: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Normalise dBFS metering value (-160..0) → 0–1 amplitude fraction. */
function normaliseMeter(dbFS: number): number {
  return Math.min(1, Math.max(0, (dbFS + 60) / 60));
}

// ── Orb component ─────────────────────────────────────────────────────────────

/**
 * AnimatedOrb — the single signature element of this screen.
 * It has four visual states that map to the Phase enum:
 *   idle       → gentle slow breathe, dim teal
 *   recording  → fast pulse synced to mic metering, bright + outer ring
 *   processing → spinning gradient ring (no outer ring), medium teal
 *   speaking   → smooth oscillating glow, emerald accent
 *   error      → subtle red tint
 */
const AnimatedOrb: React.FC<{
  phase: Phase;
  meterLevel: number; // 0–1, real-time mic amplitude
}> = ({ phase, meterLevel }) => {
  const breathe = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const outerRing = useRef(new Animated.Value(0)).current;
  const innerGlow = useRef(new Animated.Value(0.5)).current;

  // ── Breathing / pulse animation ───────────────────────────────────────────
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;

    if (phase === 'idle') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.06, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1.0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    } else if (phase === 'recording') {
      // Sync scale to meterLevel — animated on each render via direct setValue
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.18, duration: 180, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1.08, duration: 180, useNativeDriver: true }),
        ])
      );
    } else if (phase === 'speaking') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1.02, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    } else {
      breathe.setValue(1.0);
    }

    anim?.start();
    return () => { anim?.stop(); };
  }, [phase, breathe]);

  // Live meter scale during recording
  useEffect(() => {
    if (phase === 'recording') {
      const target = 1.06 + meterLevel * 0.18;
      Animated.timing(breathe, { toValue: target, duration: 60, useNativeDriver: true }).start();
    }
  }, [meterLevel, phase, breathe]);

  // ── Spinning ring (processing) ────────────────────────────────────────────
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (phase === 'processing') {
      spin.setValue(0);
      anim = Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
      );
      anim.start();
    } else {
      spin.setValue(0);
    }
    return () => { anim?.stop(); };
  }, [phase, spin]);

  // ── Outer ring pulse ─────────────────────────────────────────────────────
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (phase === 'recording') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(outerRing, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(outerRing, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      outerRing.setValue(0);
    }
    return () => { anim?.stop(); };
  }, [phase, outerRing]);

  // ── Inner glow ────────────────────────────────────────────────────────────
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (phase === 'speaking') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(innerGlow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(innerGlow, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      innerGlow.setValue(0.5);
    }
    return () => { anim?.stop(); };
  }, [phase, innerGlow]);

  const spinInterpolation = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const orbColor = {
    idle:       '#0AADA2',
    recording:  '#06b6d4',
    processing: '#0891b2',
    speaking:   '#10b981',
    error:      '#e11d48',
  }[phase];

  const ORB = 120;

  return (
    <View style={{ width: ORB + 60, height: ORB + 60, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer pulsing ring (recording only) */}
      <Animated.View
        style={{
          position: 'absolute',
          width: ORB + 48,
          height: ORB + 48,
          borderRadius: (ORB + 48) / 2,
          borderWidth: 2,
          borderColor: '#06b6d4',
          opacity: outerRing,
        }}
      />

      {/* Spinning dashed ring (processing) */}
      {phase === 'processing' && (
        <Animated.View
          style={{
            position: 'absolute',
            width: ORB + 28,
            height: ORB + 28,
            borderRadius: (ORB + 28) / 2,
            borderWidth: 2.5,
            borderColor: '#0891b2',
            borderStyle: 'dashed',
            transform: [{ rotate: spinInterpolation }],
          }}
        />
      )}

      {/* Mid ambient ring */}
      <View
        style={{
          position: 'absolute',
          width: ORB + 16,
          height: ORB + 16,
          borderRadius: (ORB + 16) / 2,
          borderWidth: 1,
          borderColor: orbColor + '40',
        }}
      />

      {/* The orb itself */}
      <Animated.View
        style={{
          width: ORB,
          height: ORB,
          borderRadius: ORB / 2,
          backgroundColor: orbColor,
          transform: [{ scale: breathe }],
          shadowColor: orbColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.7,
          shadowRadius: 28,
          elevation: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Inner glow layer */}
        <Animated.View
          style={{
            position: 'absolute',
            width: ORB * 0.65,
            height: ORB * 0.65,
            borderRadius: (ORB * 0.65) / 2,
            backgroundColor: '#ffffff',
            opacity: innerGlow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.16] }),
          }}
        />

        {/* Centre icon */}
        <Ionicons
          name={
            phase === 'recording'   ? 'mic'           :
            phase === 'processing'  ? 'hourglass-outline' :
            phase === 'speaking'    ? 'volume-medium-outline' :
            phase === 'error'       ? 'warning-outline' :
            'mic-outline'
          }
          size={40}
          color="#ffffff"
        />
      </Animated.View>
    </View>
  );
};

// ── Waveform bars (recording) ─────────────────────────────────────────────────

const NUM_BARS = 20;
const BAR_ENVELOPE = Array.from({ length: NUM_BARS }, (_, i) => {
  const t = i / (NUM_BARS - 1); // 0→1→0 envelope
  return 0.2 + 0.8 * Math.sin(t * Math.PI);
});

const WaveformBars: React.FC<{ meterLevel: number; visible: boolean }> = ({ meterLevel, visible }) => {
  const bars = useRef(Array.from({ length: NUM_BARS }, () => new Animated.Value(0.15))).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      bars.forEach((b) => Animated.timing(b, { toValue: 0.08, duration: 200, useNativeDriver: true }).start());
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const tick = () => {
      const t = Date.now() / 200;
      bars.forEach((bar, i) => {
        const phase = (i / NUM_BARS) * Math.PI * 2.4;
        const wave = 0.5 + 0.5 * Math.sin(t + phase);
        const jitter = Math.random() * 0.04;
        const target = 0.08 + BAR_ENVELOPE[i] * (0.25 + meterLevel * 0.75 + jitter) * wave;
        Animated.timing(bar, { toValue: Math.min(0.95, Math.max(0.06, target)), duration: 70, useNativeDriver: true }).start();
      });
    };
    tick();
    timerRef.current = setInterval(tick, 70);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, meterLevel, bars]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 48 }}>
      {bars.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: 44,
            borderRadius: 2,
            backgroundColor: '#0AADA2',
            transform: [{ scaleY: anim }],
          }}
        />
      ))}
    </View>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────────────

const LiveVoiceScreen: React.FC = () => {
  const [phase, setPhase]             = useState<Phase>('idle');
  const [turns, setTurns]             = useState<Turn[]>([]);
  const [liveTranscript, setLiveTx]   = useState('');   // shown while processing
  const [statusLabel, setStatusLabel] = useState('Tap and hold to speak');
  const [meterLevel, setMeterLevel]   = useState(0);

  const phaseRef = useRef<Phase>('idle');
  const setPhaseSync = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p); }, []);

  const pressActiveRef    = useRef(false);
  const recordingRef      = useRef<Audio.Recording | null>(null);
  const meterLevelRef     = useRef(0);
  const recordStartRef    = useRef(0);
  const soundRef          = useRef<Audio.Sound | null>(null);
  const meterTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef         = useRef<ScrollView>(null);

  // Web recording
  const webMrRef          = useRef<MediaRecorder | null>(null);
  const webChunksRef      = useRef<Blob[]>([]);
  const webPermGranted    = useRef(false);

  const { user }          = useAuthStore();
  const conversations     = useChatStore((s) => s.conversations);
  const activeConvId      = useChatStore((s) => s.activeConversationId);
  const sendMessage       = useChatStore((s) => s.sendMessage);

  // Build history from active conversation for context
  const history = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConvId);
    if (!conv) return [];
    return conv.messages.map((m) => ({ role: m.role, text: m.text }));
  }, [conversations, activeConvId]);

  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeConvId), [conversations, activeConvId]);

  const activeCategory = useMemo(() => activeConversation?.category ?? 'general_health', [activeConversation]);

  const latestClinicalMessage = useMemo<Message | null>(() => {
    const messages = activeConversation?.messages ?? [];
    return [...messages].reverse().find((m) =>
      m.role === 'AI' && (m.diagnosis || m.conditions?.length || m.riskFlags?.length || m.investigations?.length)
    ) ?? null;
  }, [activeConversation]);

  // ── Meter polling ────────────────────────────────────────────────────────
  const startMeterPoll = useCallback(() => {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    meterTimerRef.current = setInterval(() => {
      setMeterLevel(normaliseMeter(meterLevelRef.current));
    }, 60);
  }, []);

  const stopMeterPoll = useCallback(() => {
    if (meterTimerRef.current) { clearInterval(meterTimerRef.current); meterTimerRef.current = null; }
    setMeterLevel(0);
    meterLevelRef.current = -60;
  }, []);

  // ── Native recording ──────────────────────────────────────────────────────
  const startNative = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Required', 'Please allow microphone access to use voice chat.');
        return false;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      rec.setOnRecordingStatusUpdate((s) => {
        if (s.isRecording && s.metering !== undefined) meterLevelRef.current = s.metering;
      });
      await rec.startAsync();
      recordingRef.current = rec;
      meterLevelRef.current = -60;
      return true;
    } catch (e) {
      console.error('[LiveVoice] startNative:', e);
      return false;
    }
  }, []);

  const stopNative = useCallback(async (): Promise<string | null> => {
    const rec = recordingRef.current;
    if (!rec) return null;
    recordingRef.current = null;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return rec.getURI() ?? null;
    } catch (e) {
      console.error('[LiveVoice] stopNative:', e);
      return null;
    }
  }, []);

  // ── Web recording ─────────────────────────────────────────────────────────
  const startWeb = useCallback(async (): Promise<boolean> => {
    if (!webPermGranted.current) {
      try {
        const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (perm.state !== 'granted') {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          webPermGranted.current = true;
          return false; // ask user to press again
        }
        webPermGranted.current = true;
      } catch { return false; }
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const mr = new MediaRecorder(stream, { mimeType });
    webChunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) webChunksRef.current.push(e.data); };
    mr.start(100);
    webMrRef.current = mr;
    return true;
  }, []);

  const stopWeb = useCallback((): Promise<Blob | null> =>
    new Promise((resolve) => {
      const mr = webMrRef.current;
      if (!mr) { resolve(null); return; }
      mr.addEventListener('stop', () => {
        mr.stream.getTracks().forEach((t) => t.stop());
        const chunks = webChunksRef.current;
        webChunksRef.current = [];
        webMrRef.current = null;
        resolve(chunks.length ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' }) : null);
      }, { once: true });
      mr.stop();
    }), []);

  // ── Playback ─────────────────────────────────────────────────────────────
  const playAudioBase64 = useCallback(async (base64: string): Promise<void> => {
    if (!base64) return;
    try {
      // Write mp3 to cache then play via expo-av
      if (Platform.OS === 'web') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const uri = URL.createObjectURL(blob);
        const { sound } = await Audio.Sound.createAsync({ uri });
        soundRef.current = sound;
        await sound.playAsync();
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((s) => {
            if (s.isLoaded && s.didJustFinish) { resolve(); }
          });
        });
        URL.revokeObjectURL(uri);
        await sound.unloadAsync();
        soundRef.current = null;
      } else {
        const uri = `${FileSystem.cacheDirectory}lv_reply_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri });
        soundRef.current = sound;
        await sound.playAsync();
        await new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((s) => {
            if (s.isLoaded && s.didJustFinish) { resolve(); }
          });
        });
        await sound.unloadAsync();
        soundRef.current = null;
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } catch (e) {
      console.warn('[LiveVoice] playback error:', e);
    }
  }, []);

  // ── Core turn logic ───────────────────────────────────────────────────────
  const processTurn = useCallback(async (audioUri: string | null, audioBlob: Blob | null) => {
    setPhaseSync('processing');
    setStatusLabel('Thinking…');
    try {
      const result = await VoiceChatService.sendTurn({
        audioUri,
        audioBlob,
        history,
        category: activeCategory,
      });

      setLiveTx('');

      const newTurn: Turn = {
        id: uid(),
        userText: result.transcript,
        aiText: result.replyText,
      };
      setTurns((prev) => [...prev, newTurn]);

      // Also push both sides into the main chat-store conversation so that
      // returning to chatScreen shows the full voice session in the history.
      if (result.transcript) {
        await sendMessage(result.transcript);
      }

      // Scroll transcript to bottom
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      // Play TTS audio
      if (result.audioBase64) {
        setPhaseSync('speaking');
        setStatusLabel('LifeGate is speaking…');
        await playAudioBase64(result.audioBase64);
      }

      setPhaseSync('idle');
      setStatusLabel('Tap and hold to speak');
    } catch (err: unknown) {
      console.error('[LiveVoice] processTurn:', err);
      setPhaseSync('error');
      setLiveTx('');
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setStatusLabel(msg.length < 60 ? msg : 'Could not process your voice. Try again.');
      setTimeout(() => {
        if (phaseRef.current === 'error') {
          setPhaseSync('idle');
          setStatusLabel('Tap and hold to speak');
        }
      }, 3000);
    }
  }, [history, activeCategory, sendMessage, playAudioBase64, setPhaseSync]);

  // ── Button press/release ──────────────────────────────────────────────────
  const handlePressIn = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;

    // Web: tap-to-toggle
    if (Platform.OS === 'web') {
      if (phaseRef.current === ('recording' as Phase)) return; // handled in handlePressOut
      const started = await startWeb();
      if (!started) return;
      setPhaseSync('recording');
      setStatusLabel('Listening… tap again to send');
      startMeterPoll();
      return;
    }

    // Native: hold-to-record
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pressActiveRef.current = true;
    recordStartRef.current = Date.now();
    setLiveTx('');

    const started = await startNative();
    if (!started || !pressActiveRef.current) {
      pressActiveRef.current = false;
      return;
    }
    setPhaseSync('recording');
    setStatusLabel('Listening… release to send');
    startMeterPoll();
  }, [startNative, startWeb, startMeterPoll, setPhaseSync]);

  const handlePressOut = useCallback(async () => {
    pressActiveRef.current = false;
    if (phaseRef.current !== 'recording') return;

    const elapsed = Date.now() - recordStartRef.current;
    stopMeterPoll();

    if (elapsed < 400) {
      // Too short — cancel silently
      if (Platform.OS === 'web') await stopWeb();
      else await stopNative();
      setPhaseSync('idle');
      setStatusLabel('Too short — hold longer next time');
      setTimeout(() => setStatusLabel('Tap and hold to speak'), 1800);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === 'web') {
      const blob = await stopWeb();
      await processTurn(null, blob);
    } else {
      const uri = await stopNative();
      await processTurn(uri, null);
    }
  }, [stopNative, stopWeb, stopMeterPoll, processTurn, setPhaseSync]);

  // Web tap-to-toggle: second tap = send
  const handleWebTap = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    if (phaseRef.current === 'recording') {
      await handlePressOut();
    } else {
      await handlePressIn();
    }
  }, [handlePressIn, handlePressOut]);

  // ── Stop AI speech ────────────────────────────────────────────────────────
  const handleInterrupt = useCallback(async () => {
    if (phaseRef.current !== 'speaking') return;
    try {
      await soundRef.current?.stopAsync();
    } catch { /* best-effort */ }
    setPhaseSync('idle');
    setStatusLabel('Tap and hold to speak');
  }, [setPhaseSync]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopMeterPoll();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      webMrRef.current?.stream?.getTracks().forEach((t) => t.stop());
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, [stopMeterPoll]);

  // ── Close handler ─────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    // Stop any in-progress recording / playback before leaving
    if (phaseRef.current === 'recording') {
      stopMeterPoll();
      if (Platform.OS === 'web') await stopWeb().catch(() => {});
      else await stopNative().catch(() => {});
    }
    if (phaseRef.current === 'speaking') {
      await soundRef.current?.stopAsync().catch(() => {});
    }
    router.back();
  }, [stopNative, stopWeb, stopMeterPoll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const phaseLabel = {
    idle:       'Tap and hold to speak',
    recording:  Platform.OS === 'web' ? 'Listening… tap to send' : 'Listening… release to send',
    processing: 'Thinking…',
    speaking:   'LifeGate is speaking…',
    error:      statusLabel,
  }[phase];

  const recordButtonColor = {
    idle:       '#0AADA2',
    recording:  '#06b6d4',
    processing: '#0891b2',
    speaking:   '#10b981',
    error:      '#e11d48',
  }[phase];

  const currentPhase = phase as Phase;
  const isProcessing = currentPhase === 'processing';
  const isSpeaking = currentPhase === 'speaking';
  const canRecord = currentPhase === 'idle' || (Platform.OS === 'web' && currentPhase === 'recording');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a1628' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
          <TouchableOpacity
            onPress={handleClose}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <Ionicons name="arrow-down" size={20} color="#94a3b8" />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#e2e8f0', letterSpacing: -0.3 }}>
              Life<Text style={{ color: '#0AADA2' }}>Gate</Text> Voice
            </Text>
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2, letterSpacing: 0.4 }}>
              {user?.language && user.language.toLowerCase() !== 'english'
                ? `Responding in ${user.language}`
                : 'AI Health Assistant'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleClose}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* ── Orb ─────────────────────────────────────────────────────────── */}
        <View style={{ alignItems: 'center', marginTop: SCREEN_H * 0.04, marginBottom: SCREEN_H * 0.02 }}>
          <AnimatedOrb phase={phase} meterLevel={meterLevel} />

          {/* Phase label */}
          <Text
            style={{
              marginTop: 20,
              fontSize: 15,
              color: phase === 'error' ? '#f87171' : '#94a3b8',
              fontWeight: '500',
              letterSpacing: 0.2,
              textAlign: 'center',
              paddingHorizontal: 32,
            }}
          >
            {phaseLabel}
          </Text>

          {/* Waveform (recording) */}
          <View style={{ height: 60, justifyContent: 'center', marginTop: 10 }}>
            <WaveformBars meterLevel={meterLevel} visible={phase === 'recording'} />
          </View>
        </View>

        {/* ── Transcript scroll area ───────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >

          {latestClinicalMessage && (
            <View style={{ backgroundColor: '#0f2032', borderWidth: 1, borderColor: 'rgba(20,184,166,0.35)', borderRadius: 18, padding: 14, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="clipboard-outline" size={16} color="#5eead4" />
                <Text style={{ color: '#ccfbf1', fontWeight: '800', fontSize: 13 }}>Live triage report card</Text>
              </View>
              {latestClinicalMessage.diagnosis ? (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ color: '#e2e8f0', fontWeight: '800', fontSize: 15 }}>{latestClinicalMessage.diagnosis.condition}</Text>
                  <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 12, lineHeight: 17 }}>{latestClinicalMessage.diagnosis.description}</Text>
                  <Text style={{ color: '#5eead4', marginTop: 6, fontSize: 11, fontWeight: '800' }}>
                    {latestClinicalMessage.diagnosis.urgency} urgency{latestClinicalMessage.diagnosis.confidence ? ` · ${latestClinicalMessage.diagnosis.confidence}% confidence` : ''}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>Pre-diagnosis signals will update as LifeGate collects more symptoms.</Text>
              )}
              {!!latestClinicalMessage.conditions?.length && (
                <Text style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 18 }}>Top possibilities: {latestClinicalMessage.conditions.slice(0, 3).map((c) => `${c.condition} (${c.confidence}%)`).join(', ')}</Text>
              )}
              {!!latestClinicalMessage.riskFlags?.length && (
                <Text style={{ color: '#fecaca', fontSize: 12, lineHeight: 18, marginTop: 6 }}>Risk flags: {latestClinicalMessage.riskFlags.slice(0, 2).map((r) => r.flag.replace(/_/g, ' ')).join(', ')}</Text>
              )}
              {!!latestClinicalMessage.investigations?.length && (
                <Text style={{ color: '#bfdbfe', fontSize: 12, lineHeight: 18, marginTop: 6 }}>Suggested tests: {latestClinicalMessage.investigations.slice(0, 2).map((i) => i.test).join(', ')}</Text>
              )}
            </View>
          )}

          {turns.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 16, paddingHorizontal: 16 }}>
              <Text style={{ color: '#334155', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                {`Your conversation will appear here.\nSpeak clearly and in your preferred language.`}
              </Text>
            </View>
          )}

          {turns.map((turn) => (
            <View key={turn.id} style={{ marginBottom: 16 }}>
              {/* User bubble */}
              <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
                <View
                  style={{
                    maxWidth: '82%',
                    backgroundColor: '#1e3a5f',
                    borderRadius: 16,
                    borderBottomRightRadius: 4,
                    padding: 12,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#bae6fd', lineHeight: 19 }}>
                    {turn.userText}
                  </Text>
                </View>
              </View>

              {/* AI bubble */}
              <View style={{ alignItems: 'flex-start' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, maxWidth: '88%' }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: '#0AADA2',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    <Ionicons name="medical" size={12} color="#fff" />
                  </View>
                  <View
                    style={{
                      backgroundColor: '#0f2032',
                      borderRadius: 16,
                      borderBottomLeftRadius: 4,
                      padding: 12,
                      flex: 1,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 20 }}>
                      {turn.aiText}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          {/* Live "processing" indicator */}
          {phase === 'processing' && liveTranscript ? (
            <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
              <View style={{ maxWidth: '82%', backgroundColor: '#1e3a5f', borderRadius: 16, borderBottomRightRadius: 4, padding: 12, opacity: 0.7 }}>
                <Text style={{ fontSize: 13, color: '#93c5fd', lineHeight: 19 }}>{liveTranscript}</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* ── Controls ─────────────────────────────────────────────────────── */}
        <View
          style={{
            paddingBottom: Platform.OS === 'ios' ? 36 : 24,
            paddingTop: 12,
            paddingHorizontal: 40,
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Interrupt button (speaking only) */}
          {phase === 'speaking' && (
            <TouchableOpacity
              onPress={handleInterrupt}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(16,185,129,0.15)',
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: '#10b981',
              }}
            >
              <Ionicons name="stop-circle-outline" size={16} color="#10b981" />
              <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '600' }}>Stop</Text>
            </TouchableOpacity>
          )}

          {/* Record button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
            {/* Session info */}
            <View style={{ width: 52, alignItems: 'center' }}>
              {turns.length > 0 && (
                <>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#0AADA2' }}>{turns.length}</Text>
                  <Text style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {turns.length === 1 ? 'turn' : 'turns'}
                  </Text>
                </>
              )}
            </View>

            {/* The main record button */}
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                onPress={handleWebTap}
                disabled={isProcessing}
                activeOpacity={0.85}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: isProcessing ? '#1e293b' : recordButtonColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: recordButtonColor,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.45,
                  shadowRadius: 16,
                  elevation: 8,
                  borderWidth: phase === 'recording' ? 3 : 0,
                  borderColor: '#ffffff40',
                }}
              >
                <Ionicons
                  name={phase === 'recording' ? 'stop' : isProcessing ? 'hourglass-outline' : 'mic'}
                  size={34}
                  color="#ffffff"
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={!canRecord || isProcessing || isSpeaking}
                activeOpacity={0.85}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: (isProcessing || isSpeaking) ? '#1e293b' : recordButtonColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: recordButtonColor,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.45,
                  shadowRadius: 16,
                  elevation: 8,
                  borderWidth: phase === 'recording' ? 3 : 0,
                  borderColor: '#ffffff40',
                }}
              >
                <Ionicons
                  name={phase === 'recording' ? 'mic' : phase === 'processing' ? 'hourglass-outline' : 'mic-outline'}
                  size={34}
                  color="#ffffff"
                />
              </TouchableOpacity>
            )}

            {/* Close / end session */}
            <TouchableOpacity
              onPress={handleClose}
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: 'rgba(239,68,68,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(239,68,68,0.25)',
              }}
            >
              <Ionicons name="call" size={22} color="#ef4444" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 11, color: '#334155', textAlign: 'center', letterSpacing: 0.3 }}>
            {Platform.OS === 'web'
              ? 'Tap mic to start · tap again to send'
              : 'Hold mic to speak · release to send'}
          </Text>
        </View>
      </SafeAreaView>
    </>
  );
};

export default LiveVoiceScreen;
