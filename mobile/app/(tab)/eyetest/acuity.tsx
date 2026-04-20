/**
 * Visual Acuity Test — Three-phase (Left Eye | Right Eye | Both Eyes)
 * LogMAR Bayesian Adaptive Staircase with static & motion-tracking trials
 *
 * • Phase 1 (100s): Left Eye   — cover right eye
 * • Phase 2 (100s): Right Eye  — cover left eye
 * • Phase 3 (100s): Both Eyes  — binocular / tracking
 * • ~33% of trials are motion trials: letter oscillates horizontally
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StatusBar, Animated, Easing, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import {
  LOGMAR_LEVELS,
  logmarToLetterHeightPx,
  logmarToSnellen,
  randomOptotype,
  randomOptotypes,
} from 'services/adaptive-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

// ── Constants ─────────────────────────────────────────────────────────────────
const TEAL         = '#0AADA2';
const NUM_CHOICES  = 5;
const TEST_SECONDS = 300;
const SESSION_SECS = 100; // 3 × 100 s = 5 min
const MOTION_PROB  = 0.33;

type EyePhase    = 'left' | 'right' | 'both';
type ClarityLevel = 1 | 2 | 3 | 4 | 5;
type TrialType    = 'static' | 'motion';

interface PhaseConf {
  label: string;
  instruction: string;
  color: string;
  phaseNum: 1 | 2 | 3;
}

const PHASE: Record<EyePhase, PhaseConf> = {
  left:  { label: 'Left Eye',  instruction: 'Cover your RIGHT eye · Tap the letter you see',     color: '#60a5fa', phaseNum: 1 },
  right: { label: 'Right Eye', instruction: 'Cover your LEFT eye · Tap the letter you see',      color: '#a78bfa', phaseNum: 2 },
  both:  { label: 'Both Eyes', instruction: 'Open both eyes · Track and tap the letter',          color: '#4ade80', phaseNum: 3 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function clarityFromLogMAR(logMAR: number): ClarityLevel {
  if (logMAR <= 0.0) return 1;
  if (logMAR <= 0.2) return 2;
  if (logMAR <= 0.4) return 3;
  if (logMAR <= 0.7) return 4;
  return 5;
}

const CLARITY_LABEL: Record<ClarityLevel, string> = {
  1: 'Crystal Clear', 2: 'Clear', 3: 'Slightly Blurred', 4: 'Blurred', 5: 'Very Blurred',
};

const CLARITY_COLOR: Record<ClarityLevel, string> = {
  1: '#4ade80', 2: TEAL, 3: '#fbbf24', 4: '#f97316', 5: '#ef4444',
};

function nextScreen(ts: Record<string, string>) {
  if (ts.color === 'active')       return '/(tab)/eyetest/color';
  if (ts.astigmatism === 'active') return '/(tab)/eyetest/astigmatism';
  if (ts.contrast === 'active')    return '/(tab)/eyetest/contrast';
  if (ts.near === 'active')        return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

// ── BlurryLetter ──────────────────────────────────────────────────────────────
function BlurryLetter({
  letter, fontSize, clarityLevel,
}: {
  letter: string; fontSize: number; clarityLevel: ClarityLevel;
}) {
  type L = { dx: number; dy: number; opacity: number };
  const layers: L[] = [];
  if (clarityLevel >= 3) layers.push({ dx: 2,  dy: 2,  opacity: 0.18 });
  if (clarityLevel >= 4) layers.push({ dx: -2, dy: 1, opacity: 0.14 }, { dx: 3, dy: -1, opacity: 0.11 });
  if (clarityLevel >= 5) layers.push({ dx: -3, dy: -2, opacity: 0.09 }, { dx: 4, dy: 3, opacity: 0.08 }, { dx: -1, dy: 4, opacity: 0.07 });

  const sz = Math.max(28, Math.min(fontSize, 180));
  const mainOpacity = clarityLevel === 5 ? 0.60 : clarityLevel === 4 ? 0.74 : clarityLevel === 3 ? 0.86 : 1;
  const base = { fontSize: sz, fontWeight: '900' as const, fontFamily: 'Courier New', color: '#ffffff' };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {layers.map((l, i) => (
        <Text
          key={i}
          style={[base, {
            position: 'absolute',
            opacity: l.opacity,
            transform: [{ translateX: l.dx }, { translateY: l.dy }],
          }]}
        >
          {letter}
        </Text>
      ))}
      <Text style={[base, { opacity: mainOpacity }]}>{letter}</Text>
    </View>
  );
}

// ── CircularTimer ─────────────────────────────────────────────────────────────
function CircularTimer({ timeLeft, phaseColor }: { timeLeft: number; phaseColor: string }) {
  const urgent = timeLeft <= 60;
  const color  = urgent ? '#ef4444' : phaseColor;
  const mm     = Math.floor(timeLeft / 60);
  const ss     = String(timeLeft % 60).padStart(2, '0');

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 56, height: 56 }}>
      <View style={{
        position: 'absolute', width: 50, height: 50, borderRadius: 25,
        borderWidth: 2.5, borderColor: color, opacity: urgent ? 1 : 0.55,
      }} />
      <Text style={{ fontSize: 14, fontWeight: '800', color, letterSpacing: -0.5 }}>{mm}:{ss}</Text>
    </View>
  );
}

// ── PhaseTransitionModal ──────────────────────────────────────────────────────
function PhaseTransitionModal({
  visible, fromPhase, toPhase, onConfirm, onSkip,
}: {
  visible: boolean; fromPhase: EyePhase; toPhase: EyePhase;
  onConfirm: () => void; onSkip: () => void;
}) {
  const from = PHASE[fromPhase];
  const to   = PHASE[toPhase];

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onSkip}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22,
      }}>
        <View style={{
          backgroundColor: '#0d1527', borderRadius: 28, width: '100%',
          overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        }}>

          {/* ── Header band ─────────────────────────────────────────────── */}
          <View style={{
            paddingTop: 28, paddingBottom: 22, paddingHorizontal: 24,
            alignItems: 'center', gap: 10,
            borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
          }}>
            {/* Step pills */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['left', 'right', 'both'] as EyePhase[]).map((p) => {
                const isCurrent = p === toPhase;
                const isPast    = PHASE[p].phaseNum < to.phaseNum;
                return (
                  <View
                    key={p}
                    style={{
                      height: 6,
                      width: isCurrent ? 28 : 8,
                      borderRadius: 3,
                      backgroundColor: isCurrent ? to.color
                        : isPast ? `${to.color}55`
                        : 'rgba(255,255,255,0.12)',
                    }}
                  />
                );
              })}
            </View>

            {/* Eye icon halo */}
            <View style={{
              width: 82, height: 82, borderRadius: 41,
              backgroundColor: `${to.color}18`,
              borderWidth: 2, borderColor: `${to.color}35`,
              alignItems: 'center', justifyContent: 'center', marginTop: 4,
            }}>
              <Text style={{ fontSize: 38 }}>{toPhase === 'both' ? '👀' : '👁️'}</Text>
            </View>

            <Text style={{
              fontSize: 10, fontWeight: '700', color: `${to.color}bb`,
              letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 2,
            }}>
              Phase {to.phaseNum} of 3
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center' }}>
              {to.label}
            </Text>
          </View>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <View style={{ padding: 20, gap: 12 }}>

            {/* From → To transition card */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
            }}>
              {/* From side */}
              <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: `${from.color}20`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="checkmark-circle" size={22} color={from.color} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: from.color }}>{from.label}</Text>
                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontWeight: '700', letterSpacing: 1 }}>
                  DONE ✓
                </Text>
              </View>

              {/* Arrow */}
              <View style={{
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: 'rgba(255,255,255,0.05)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.3)" />
              </View>

              {/* To side */}
              <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: `${to.color}20`,
                  borderWidth: 1.5, borderColor: `${to.color}50`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="eye-outline" size={18} color={to.color} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: to.color }}>{to.label}</Text>
                <Text style={{ fontSize: 9, color: `${to.color}99`, fontWeight: '700', letterSpacing: 1 }}>
                  UP NEXT
                </Text>
              </View>
            </View>

            {/* Instruction callout */}
            <View style={{
              backgroundColor: `${to.color}0d`, borderRadius: 12,
              paddingHorizontal: 14, paddingVertical: 12,
              flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              borderWidth: 1, borderColor: `${to.color}1e`,
            }}>
              <Ionicons name="information-circle-outline" size={18} color={to.color} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 20 }}>
                {toPhase === 'both'
                  ? 'Excellent! Open both eyes fully. Some letters will move — track them and tap what you see.'
                  : `Cover your ${fromPhase} eye with your hand or an eye patch. Read letters using only your ${toPhase} eye.`}
              </Text>
            </View>

            {/* CTA */}
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => ({
                backgroundColor: pressed ? `${to.color}cc` : to.color,
                borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 2,
                shadowColor: to.color, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                {toPhase === 'both' ? "Ready — Open Both Eyes" : `Ready — Switch to ${to.label}`}
              </Text>
            </Pressable>

            <Pressable onPress={onSkip} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Continue without switching</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── ChoiceButton ──────────────────────────────────────────────────────────────
function ChoiceButton({
  letter, isCorrect, wasChosen, revealRight, dimmed, phaseColor, onPress, disabled,
}: {
  letter: string;
  isCorrect: boolean;
  wasChosen: boolean;
  revealRight: boolean;
  dimmed: boolean;
  phaseColor: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const pressAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(pressAnim, { toValue: 0.90, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  let bg        = 'rgba(14,22,46,0.95)';
  let border    = 'rgba(255,255,255,0.08)';
  let textColor = '#e2e8f0';
  let glow: object = {};

  if (wasChosen && isCorrect) {
    bg = 'rgba(74,222,128,0.14)'; border = '#4ade80'; textColor = '#4ade80';
    glow = { shadowColor: '#4ade80', shadowOpacity: 0.5, shadowRadius: 18, elevation: 8 };
  } else if (wasChosen && !isCorrect) {
    bg = 'rgba(248,113,113,0.14)'; border = '#f87171'; textColor = '#f87171';
    glow = { shadowColor: '#f87171', shadowOpacity: 0.5, shadowRadius: 18, elevation: 8 };
  } else if (revealRight) {
    bg = 'rgba(74,222,128,0.08)'; border = `${phaseColor}55`; textColor = '#4ade80';
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        {
          flex: 1, height: 90, borderRadius: 22,
          backgroundColor: bg, borderWidth: 1.5, borderColor: border,
          alignItems: 'center', justifyContent: 'center',
          opacity: dimmed ? 0.32 : 1,
        },
        glow,
      ]}
    >
      <Animated.View style={{ transform: [{ scale: pressAnim }], alignItems: 'center' }}>
        {/* Status icon (top-right corner) */}
        {wasChosen && isCorrect && (
          <View style={{ position: 'absolute', top: -28, right: -24 }}>
            <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
          </View>
        )}
        {wasChosen && !isCorrect && (
          <View style={{ position: 'absolute', top: -28, right: -24 }}>
            <Ionicons name="close-circle" size={18} color="#f87171" />
          </View>
        )}

        <Text style={{
          fontSize: 34, fontWeight: '900', color: textColor,
          fontFamily: 'Courier New', letterSpacing: 2,
        }}>
          {letter}
        </Text>

        {wasChosen && !isCorrect && (
          <Text style={{ fontSize: 8, color: '#f87171', marginTop: 1, fontWeight: '800', letterSpacing: 1.5 }}>
            WRONG
          </Text>
        )}
        {revealRight && (
          <Text style={{ fontSize: 8, color: '#4ade80', marginTop: 1, fontWeight: '800', letterSpacing: 1.5 }}>
            CORRECT
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AcuityTest() {
  const {
    acuityStaircase, acuityTrials, deviceCalibration, viewingDistanceCm,
    testStatus, startAcuityTest, restartAcuityStaircase, recordAcuityTrial,
    finaliseAcuity, markTestSkipped, recordEyeSwitch,
  } = useVisionStore();

  // Animations
  const fadeAnim   = useRef(new Animated.Value(1)).current;
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const motionAnim = useRef(new Animated.Value(0)).current;
  const motionLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState(TEST_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase
  const [eyePhase,       setEyePhase]       = useState<EyePhase>('left');
  const [showTransition, setShowTransition] = useState(false);
  const [pendingPhase,   setPendingPhase]   = useState<EyePhase>('right');
  const phase2Done = useRef(false);
  const phase3Done = useRef(false);

  // Trial
  const [trialType, setTrialType] = useState<TrialType>('static');
  const [{ target, choices }, setStimulus] = useState(() => {
    const t = randomOptotype();
    const d = randomOptotypes(NUM_CHOICES - 1);
    return { target: t, choices: [...d, t].sort(() => Math.random() - 0.5) };
  });
  const [answered,       setAnswered]       = useState<string | null>(null);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const [streak,         setStreak]         = useState(0);
  const trialStart = useRef(Date.now());

  // Init
  useEffect(() => {
    if (!testStatus || testStatus.acuity !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
      return;
    }
    startAcuityTest();
  }, []);

  // Timer + phase triggers
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;

        if (next === 200 && !phase2Done.current) {
          phase2Done.current = true;
          setPendingPhase('right');
          setShowTransition(true);
        }
        if (next === 100 && !phase3Done.current) {
          phase3Done.current = true;
          setPendingPhase('both');
          setShowTransition(true);
        }
        if (next <= 0) {
          clearInterval(timerRef.current!);
          finaliseAcuity();
          router.replace(nextScreen(testStatus) as never);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      motionLoop.current?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Staircase restart (never exit early)
  useEffect(() => {
    if (acuityStaircase?.done) restartAcuityStaircase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acuityStaircase?.done]);

  // Derived
  const currentLogMAR = acuityStaircase ? LOGMAR_LEVELS[acuityStaircase.levelIdx] : 0.5;
  const clarityLevel  = clarityFromLogMAR(currentLogMAR);
  const trialsCount   = acuityTrials.length;
  const phaseConf     = PHASE[eyePhase];

  const letterPx = useMemo(() => {
    if (!deviceCalibration) return 60;
    return logmarToLetterHeightPx(currentLogMAR, viewingDistanceCm, deviceCalibration);
  }, [currentLogMAR, deviceCalibration, viewingDistanceCm]);

  // Motion helpers
  const stopMotion = useCallback(() => {
    motionLoop.current?.stop();
    motionLoop.current = null;
    motionAnim.setValue(0);
  }, [motionAnim]);

  const startMotion = useCallback(() => {
    motionAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motionAnim, {
          toValue: 54, duration: 680,
          easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(motionAnim, {
          toValue: -54, duration: 680,
          easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(motionAnim, {
          toValue: 0, duration: 400,
          easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    motionLoop.current = loop;
  }, [motionAnim]);

  // Animate letter in
  const animateIn = useCallback((isMotion: boolean) => {
    scaleAnim.setValue(1.55);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true }),
    ]).start(() => { if (isMotion) startMotion(); });
  }, [fadeAnim, scaleAnim, startMotion]);

  useEffect(() => { animateIn(false); }, []);

  // Answer
  const handleAnswer = useCallback((chosen: string) => {
    if (answered) return;
    stopMotion();
    const reactionMs = Date.now() - trialStart.current;
    const correct    = chosen === target;
    setAnswered(chosen);
    setLastReactionMs(reactionMs);
    setStreak((s) => (correct ? s + 1 : 0));

    Animated.timing(fadeAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      recordAcuityTrial({
        logMAR: currentLogMAR, letterHeightPx: letterPx,
        letter: target, response: correct ? 'correct' : 'incorrect', reactionMs,
      });
      const newT         = randomOptotype();
      const newD         = randomOptotypes(NUM_CHOICES - 1);
      const nextIsMotion = Math.random() < MOTION_PROB;
      setStimulus({ target: newT, choices: [...newD, newT].sort(() => Math.random() - 0.5) });
      setTrialType(nextIsMotion ? 'motion' : 'static');
      setAnswered(null);
      trialStart.current = Date.now();
      animateIn(nextIsMotion);
    });
  }, [answered, target, currentLogMAR, letterPx, animateIn, fadeAnim, recordAcuityTrial, stopMotion]);

  // Phase handlers
  const handlePhaseConfirm = useCallback(() => {
    recordEyeSwitch({
      testId: 'acuity', promptedAt: Date.now(), confirmedAt: Date.now(),
      trialIndexAtSwitch: trialsCount,
      side: pendingPhase === 'both' ? 'right' : pendingPhase,
      complied: true,
    });
    setEyePhase(pendingPhase);
    setShowTransition(false);
    trialStart.current = Date.now();
  }, [pendingPhase, trialsCount, recordEyeSwitch]);

  const handlePhaseSkip = useCallback(() => {
    recordEyeSwitch({
      testId: 'acuity', promptedAt: Date.now(), confirmedAt: null,
      trialIndexAtSwitch: trialsCount,
      side: pendingPhase === 'both' ? 'right' : pendingPhase,
      complied: false,
    });
    setShowTransition(false);
    trialStart.current = Date.now();
  }, [pendingPhase, trialsCount, recordEyeSwitch]);

  const clarityColor = CLARITY_COLOR[clarityLevel];

  // Time-based segment fills (independent of eyePhase state)
  const segFill = (idx: number) =>
    Math.min(1, Math.max(0, (300 - idx * SESSION_SECS - timeLeft) / SESSION_SECS));

  return (
    <View style={{ flex: 1, backgroundColor: '#080d1a' }}>
      <StatusBar barStyle="light-content" backgroundColor="#080d1a" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
          gap: 10,
        }}>
          <Pressable
            onPress={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              stopMotion();
              markTestSkipped('acuity');
              router.replace(nextScreen({ ...testStatus, acuity: 'skipped' }) as never);
            }}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
              alignItems: 'center', justifyContent: 'center',
            })}
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Visual Acuity</Text>

              {/* Phase badge */}
              <View style={{
                backgroundColor: `${phaseConf.color}1e`, borderRadius: 6,
                paddingHorizontal: 7, paddingVertical: 2,
                borderWidth: 1, borderColor: `${phaseConf.color}30`,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: phaseConf.color }}>
                  Phase {phaseConf.phaseNum}/3
                </Text>
              </View>

              {/* Motion badge */}
              {trialType === 'motion' && (
                <View style={{ backgroundColor: 'rgba(251,191,36,0.14)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fbbf24' }}>🎯 MOTION</Text>
                </View>
              )}
            </View>

            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              {phaseConf.label} · Trial {trialsCount + 1} · {logmarToSnellen(currentLogMAR)}
            </Text>
          </View>

          <CircularTimer timeLeft={timeLeft} phaseColor={phaseConf.color} />
        </View>

        {/* ── Tri-segment progress bar ───────────────────────────────────── */}
        <View style={{ flexDirection: 'row', height: 3, gap: 2 }}>
          {(['left', 'right', 'both'] as EyePhase[]).map((p, idx) => (
            <View key={p} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <View style={{ height: 3, width: `${segFill(idx) * 100}%`, backgroundColor: PHASE[p].color, borderRadius: 2 }} />
            </View>
          ))}
        </View>

        {/* ── Info strip ────────────────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 7,
        }}>
          {/* Clarity pill */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: `${clarityColor}14`, borderRadius: 20,
            paddingHorizontal: 11, paddingVertical: 4,
            borderWidth: 1, borderColor: `${clarityColor}25`,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: clarityColor }} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: clarityColor }}>
              {CLARITY_LABEL[clarityLevel]}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {streak >= 2 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 13 }}>🔥</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fbbf24' }}>{streak}</Text>
              </View>
            )}
            {lastReactionMs !== null && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
                paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Ionicons name="flash" size={10} color={TEAL} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: TEAL }}>
                  {(lastReactionMs / 1000).toFixed(2)}s
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Optotype display ──────────────────────────────────────────── */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {/* Concentric rings */}
          {[280, 200, 130].map((sz) => (
            <View key={sz} style={{
              position: 'absolute', width: sz, height: sz, borderRadius: sz / 2,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)',
            }} />
          ))}
          {/* Phase-coloured ring */}
          <View style={{
            position: 'absolute', width: 148, height: 148, borderRadius: 74,
            borderWidth: 1.5, borderColor: `${phaseConf.color}1e`,
          }} />

          {/* Letter — scale + motion */}
          <Animated.View style={{
            transform: [{ scale: scaleAnim }, { translateX: motionAnim }],
            opacity: fadeAnim,
          }}>
            <BlurryLetter
              letter={target}
              fontSize={Math.max(28, Math.min(letterPx, 180))}
              clarityLevel={clarityLevel}
            />
          </Animated.View>

          {/* Answer feedback */}
          {answered !== null && (
            <View style={{ position: 'absolute', bottom: 14, alignItems: 'center' }}>
              <Text style={{
                fontSize: 14, fontWeight: '800',
                color: answered === target ? '#4ade80' : '#f87171',
              }}>
                {answered === target ? '✓ Correct' : `✗  Correct: "${target}"`}
              </Text>
            </View>
          )}
        </View>

        {/* ── Trial history dots ────────────────────────────────────────── */}
        {trialsCount > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, paddingBottom: 5 }}>
            {acuityTrials.slice(-12).map((t, i) => (
              <View key={i} style={{
                width: 7, height: 7, borderRadius: 3.5,
                backgroundColor: t.response === 'correct' ? '#4ade80' : '#f87171',
                opacity: 0.75,
              }} />
            ))}
          </View>
        )}

        {/* ── Instruction bar ───────────────────────────────────────────── */}
        <View style={{
          marginHorizontal: 14, marginBottom: 10,
          backgroundColor: `${phaseConf.color}0d`, borderRadius: 10,
          paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1, borderColor: `${phaseConf.color}1e`,
        }}>
          <Ionicons
            name={eyePhase === 'both' ? 'eye-outline' : 'eye-off-outline'}
            size={14} color={phaseConf.color}
          />
          <Text style={{ flex: 1, fontSize: 12, color: phaseConf.color, lineHeight: 16, fontWeight: '600' }}>
            {phaseConf.instruction}
          </Text>
          {trialType === 'motion' && (
            <View style={{
              backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 8,
              paddingHorizontal: 7, paddingVertical: 3,
            }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#fbbf24' }}>TRACKING</Text>
            </View>
          )}
        </View>

        {/* ── Choice buttons — 3 + 2 grid ──────────────────────────────── */}
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 9 }}>
          {[choices.slice(0, 3), choices.slice(3)].map((row, rowIdx) => (
            <View
              key={rowIdx}
              style={{
                flexDirection: 'row',
                gap: 9,
                justifyContent: row.length < 3 ? 'center' : 'space-between',
              }}
            >
              {row.map((c) => {
                const isCorrect   = c === target;
                const wasChosen   = c === answered;
                const revealRight = !!answered && isCorrect && !wasChosen;
                const dimmed      = !!answered && !wasChosen && !revealRight;

                return (
                  <View
                    key={c}
                    style={{
                      flex: row.length < 3 ? 0 : 1,
                      width: row.length < 3 ? 108 : undefined,
                    }}
                  >
                    <ChoiceButton
                      letter={c}
                      isCorrect={isCorrect}
                      wasChosen={wasChosen}
                      revealRight={revealRight}
                      dimmed={dimmed}
                      phaseColor={phaseConf.color}
                      onPress={() => handleAnswer(c)}
                      disabled={!!answered}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <PatientBottomTabBar />

        {/* ── Phase Transition Modal ────────────────────────────────────── */}
        <PhaseTransitionModal
          visible={showTransition}
          fromPhase={eyePhase}
          toPhase={pendingPhase}
          onConfirm={handlePhaseConfirm}
          onSkip={handlePhaseSkip}
        />

      </SafeAreaView>
    </View>
  );
}
