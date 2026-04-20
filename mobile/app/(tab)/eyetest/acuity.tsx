/**
 * Visual Acuity Test — Interactive LogMAR Bayesian Adaptive Staircase
 *
 * • 5-minute timed session (auto-finalises on timeout)
 * • Animated zoom-in per letter presentation
 * • Simulated clarity levels (clear → blurred) driven by logMAR
 * • Reaction-time logging + live display
 * • Streak counter + per-trial history dots
 * • Dark "examination room" theme
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  Animated,
  Modal,
} from 'react-native';
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

const TEAL        = '#0AADA2';
const TEAL_DARK   = '#0f766e';
const NUM_CHOICES = 5;
const TEST_SECONDS = 300; // 5 minutes

type ClarityLevel = 1 | 2 | 3 | 4 | 5;

function clarityFromLogMAR(logMAR: number): ClarityLevel {
  if (logMAR <= 0.0) return 1;
  if (logMAR <= 0.2) return 2;
  if (logMAR <= 0.4) return 3;
  if (logMAR <= 0.7) return 4;
  return 5;
}

const CLARITY_LABEL: Record<ClarityLevel, string> = {
  1: 'Crystal Clear',
  2: 'Clear',
  3: 'Slightly Blurred',
  4: 'Blurred',
  5: 'Very Blurred',
};

const CLARITY_COLOR: Record<ClarityLevel, string> = {
  1: '#4ade80',
  2: TEAL,
  3: '#fbbf24',
  4: '#f97316',
  5: '#ef4444',
};

function nextScreen(testStatus: Record<string, string>) {
  if (testStatus.color === 'active')       return '/(tab)/eyetest/color';
  if (testStatus.astigmatism === 'active') return '/(tab)/eyetest/astigmatism';
  if (testStatus.contrast === 'active')    return '/(tab)/eyetest/contrast';
  if (testStatus.near === 'active')        return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

function BlurryLetter({
  letter,
  fontSize,
  clarityLevel,
}: {
  letter: string;
  fontSize: number;
  clarityLevel: ClarityLevel;
}) {
  type Layer = { dx: number; dy: number; opacity: number };
  const layers: Layer[] = [];
  if (clarityLevel >= 3) layers.push({ dx: 2,  dy: 2,  opacity: 0.18 });
  if (clarityLevel >= 4) layers.push(
    { dx: -2, dy: 1,  opacity: 0.14 },
    { dx: 3,  dy: -1, opacity: 0.11 },
  );
  if (clarityLevel >= 5) layers.push(
    { dx: -3, dy: -2, opacity: 0.09 },
    { dx: 4,  dy: 3,  opacity: 0.08 },
    { dx: -1, dy: 4,  opacity: 0.07 },
  );

  const clampedSize = Math.max(24, Math.min(fontSize, 200));
  const mainOpacity =
    clarityLevel === 5 ? 0.60 :
    clarityLevel === 4 ? 0.74 :
    clarityLevel === 3 ? 0.86 : 1;

  const base = {
    fontSize: clampedSize,
    fontWeight: '900' as const,
    fontFamily: 'Courier New',
    color: '#ffffff',
  };

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

function CircularTimer({ timeLeft, total }: { timeLeft: number; total: number }) {
  const urgent = timeLeft <= 60;
  const color  = urgent ? '#ef4444' : TEAL;
  const mm     = Math.floor(timeLeft / 60);
  const ss     = String(timeLeft % 60).padStart(2, '0');

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 58, height: 58 }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        borderWidth: 2.5, borderColor: color,
        opacity: urgent ? 1 : 0.5,
        position: 'absolute',
      }} />
      <Text style={{ fontSize: 13, fontWeight: '800', color, letterSpacing: -0.5 }}>
        {mm}:{ss}
      </Text>
    </View>
  );
}

export default function AcuityTest() {
  const {
    acuityStaircase,
    acuityTrials,
    deviceCalibration,
    viewingDistanceCm,
    testStatus,
    startAcuityTest,
    restartAcuityStaircase,
    recordAcuityTrial,
    finaliseAcuity,
    markTestSkipped,
    recordEyeSwitch,
  } = useVisionStore();

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const [timeLeft, setTimeLeft] = useState(TEST_SECONDS);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [eyeSide, setEyeSide]                   = useState<'left' | 'right'>('left');
  const [showSwitchPrompt, setShowSwitchPrompt] = useState(false);
  const switchPromptTime  = useRef<number>(0);
  const switchTriggered   = useRef(false);

  const [{ target, choices }, setStimulus] = useState(() => {
    const t = randomOptotype();
    const d = randomOptotypes(NUM_CHOICES - 1);
    return { target: t, choices: [...d, t].sort(() => Math.random() - 0.5) };
  });
  const [answered,       setAnswered]      = useState<string | null>(null);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const [streak,         setStreak]         = useState(0);
  const trialStart = useRef(Date.now());

  useEffect(() => {
    if (!testStatus || testStatus.acuity !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
      return;
    }
    startAcuityTest();
  }, []);

  // 5-minute countdown
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          finaliseAcuity();
          router.replace(nextScreen(testStatus) as never);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the staircase converges, restart it so the test continues until the 5-min timer fires
  useEffect(() => {
    if (acuityStaircase?.done) {
      restartAcuityStaircase();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acuityStaircase?.done]);

  const currentLogMAR = acuityStaircase ? LOGMAR_LEVELS[acuityStaircase.levelIdx] : 0.5;
  const clarityLevel  = clarityFromLogMAR(currentLogMAR);
  const trialsCount   = acuityTrials.length;
  const reversals     = acuityStaircase?.reversals.length ?? 0;
  const progress      = Math.min(reversals / 8, 1);

  const letterPx = useMemo(() => {
    if (!deviceCalibration) return 60;
    return logmarToLetterHeightPx(currentLogMAR, viewingDistanceCm, deviceCalibration);
  }, [currentLogMAR, deviceCalibration, viewingDistanceCm]);

  const animateIn = useCallback(() => {
    scaleAnim.setValue(1.6);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  useEffect(() => { animateIn(); }, []);

  const handleAnswer = useCallback((chosen: string) => {
    if (answered) return;
    const reactionMs = Date.now() - trialStart.current;
    const correct    = chosen === target;
    setAnswered(chosen);
    setLastReactionMs(reactionMs);
    setStreak((s) => (correct ? s + 1 : 0));

    Animated.timing(fadeAnim, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      recordAcuityTrial({
        logMAR: currentLogMAR,
        letterHeightPx: letterPx,
        letter: target,
        response: correct ? 'correct' : 'incorrect',
        reactionMs,
      });
      const newT = randomOptotype();
      const newD = randomOptotypes(NUM_CHOICES - 1);
      setStimulus({ target: newT, choices: [...newD, newT].sort(() => Math.random() - 0.5) });
      setAnswered(null);
      trialStart.current = Date.now();
      animateIn();
    });
  }, [answered, target, currentLogMAR, letterPx, animateIn, fadeAnim, recordAcuityTrial]);

  useEffect(() => {
    if (trialsCount === 4 && !switchTriggered.current) {
      switchTriggered.current = true;
      switchPromptTime.current = Date.now();
      setShowSwitchPrompt(true);
    }
  }, [trialsCount]);

  const handleSwitchConfirm = useCallback(() => {
    const side: 'left' | 'right' = eyeSide === 'left' ? 'right' : 'left';
    recordEyeSwitch({ testId: 'acuity', promptedAt: switchPromptTime.current, confirmedAt: Date.now(), trialIndexAtSwitch: trialsCount, side, complied: true });
    setEyeSide(side);
    setShowSwitchPrompt(false);
    trialStart.current = Date.now();
  }, [eyeSide, trialsCount, recordEyeSwitch]);

  const handleSwitchDismiss = useCallback(() => {
    recordEyeSwitch({ testId: 'acuity', promptedAt: switchPromptTime.current, confirmedAt: null, trialIndexAtSwitch: trialsCount, side: eyeSide === 'left' ? 'right' : 'left', complied: false });
    setShowSwitchPrompt(false);
    trialStart.current = Date.now();
  }, [eyeSide, trialsCount, recordEyeSwitch]);

  const clarityColor = CLARITY_COLOR[clarityLevel];

  return (
    <View style={{ flex: 1, backgroundColor: '#080d1a' }}>
      <StatusBar barStyle="light-content" backgroundColor="#080d1a" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
          gap: 10,
        }}>
          <Pressable
            onPress={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              markTestSkipped('acuity');
              router.replace(nextScreen({ ...testStatus, acuity: 'skipped' }) as never);
            }}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
              alignItems: 'center', justifyContent: 'center',
            })}
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Visual Acuity</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {eyeSide === 'left' ? 'Left' : 'Right'} eye · Trial {trialsCount + 1} · {logmarToSnellen(currentLogMAR)}
            </Text>
          </View>

          <CircularTimer timeLeft={timeLeft} total={TEST_SECONDS} />
        </View>

        {/* Staircase progress bar */}
        <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.07)' }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: TEAL, borderRadius: 2 }} />
        </View>

        {/* Info strip */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 8,
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: `${clarityColor}18`,
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
            borderWidth: 1, borderColor: `${clarityColor}30`,
          }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: clarityColor }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: clarityColor }}>
              {CLARITY_LABEL[clarityLevel]}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {streak >= 2 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 14 }}>🔥</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fbbf24' }}>{streak}</Text>
              </View>
            )}
            {lastReactionMs !== null && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Ionicons name="flash" size={11} color={TEAL} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: TEAL }}>
                  {(lastReactionMs / 1000).toFixed(2)}s
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Optotype display */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {[260, 190, 130].map((size) => (
            <View key={size} style={{
              position: 'absolute',
              width: size, height: size, borderRadius: size / 2,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
            }} />
          ))}
          <View style={{
            position: 'absolute',
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }} />

          <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: fadeAnim }}>
            <BlurryLetter
              letter={target}
              fontSize={Math.max(24, Math.min(letterPx, 200))}
              clarityLevel={clarityLevel}
            />
          </Animated.View>

          {answered !== null && (
            <View style={{ position: 'absolute', bottom: 20 }}>
              <Text style={{
                fontSize: 15, fontWeight: '800',
                color: answered === target ? '#4ade80' : '#f87171',
              }}>
                {answered === target ? '✓ Correct' : `✗  "${target}"`}
              </Text>
            </View>
          )}
        </View>

        {/* Trial history dots */}
        {trialsCount > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, paddingBottom: 8 }}>
            {acuityTrials.slice(-10).map((t, i) => (
              <View key={i} style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: t.response === 'correct' ? '#4ade80' : '#f87171',
              }} />
            ))}
          </View>
        )}

        {/* Eye instruction */}
        <View style={{
          marginHorizontal: 16, marginBottom: 8,
          backgroundColor: 'rgba(10,173,162,0.09)',
          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1, borderColor: 'rgba(10,173,162,0.2)',
        }}>
          <Ionicons name="eye-off-outline" size={15} color={TEAL} />
          <Text style={{ flex: 1, fontSize: 12, color: TEAL, lineHeight: 17 }}>
            Cover your <Text style={{ fontWeight: '800' }}>{eyeSide.toUpperCase()}</Text> eye. Tap the letter you see.
          </Text>
        </View>

        {/* Choice panel — 3 on top row, 2 centred on bottom row */}
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
          {[choices.slice(0, 3), choices.slice(3)].map((row, rowIdx) => (
            <View
              key={rowIdx}
              style={{
                flexDirection: 'row',
                gap: 8,
                justifyContent: row.length < 3 ? 'center' : 'space-between',
              }}
            >
              {row.map((c) => {
                const isCorrect   = c === target;
                const wasChosen   = c === answered;
                const revealRight = !!answered && isCorrect && !wasChosen;

                let bg     = 'rgba(255,255,255,0.05)';
                let border = 'rgba(255,255,255,0.13)';
                let color  = 'rgba(255,255,255,0.92)';
                let shadow = {};

                if (wasChosen && isCorrect) {
                  bg = 'rgba(74,222,128,0.18)'; border = '#4ade80'; color = '#4ade80';
                  shadow = { shadowColor: '#4ade80', shadowOpacity: 0.35, shadowRadius: 10, elevation: 4 };
                } else if (wasChosen) {
                  bg = 'rgba(248,113,113,0.18)'; border = '#f87171'; color = '#f87171';
                  shadow = { shadowColor: '#f87171', shadowOpacity: 0.35, shadowRadius: 10, elevation: 4 };
                } else if (revealRight) {
                  bg = 'rgba(74,222,128,0.10)'; border = 'rgba(74,222,128,0.45)'; color = '#4ade80';
                }

                return (
                  <Pressable
                    key={c}
                    onPress={() => handleAnswer(c)}
                    disabled={!!answered}
                    style={({ pressed }) => ([
                      {
                        width: row.length < 3 ? 100 : undefined,
                        flex: row.length < 3 ? 0 : 1,
                        height: 80,
                        borderRadius: 20,
                        backgroundColor: bg,
                        borderWidth: 1.5,
                        borderColor: border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: answered && !wasChosen && !revealRight ? 0.45 : 1,
                        transform: [{ scale: pressed ? 0.93 : 1 }],
                      },
                      shadow,
                    ])}
                  >
                    <Text style={{
                      fontSize: 30,
                      fontWeight: '900',
                      color,
                      fontFamily: 'Courier New',
                      letterSpacing: 1,
                    }}>
                      {c}
                    </Text>
                    {wasChosen && !isCorrect && (
                      <Text style={{ fontSize: 9, color: '#f87171', marginTop: 2, fontWeight: '700' }}>WRONG</Text>
                    )}
                    {revealRight && (
                      <Text style={{ fontSize: 9, color: '#4ade80', marginTop: 2, fontWeight: '700' }}>CORRECT</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <PatientBottomTabBar />

        {/* Eye-switch modal */}
        <Modal transparent animationType="fade" visible={showSwitchPrompt} onRequestClose={handleSwitchDismiss}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
            alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
          }}>
            <View style={{
              backgroundColor: '#111827', borderRadius: 24, padding: 28,
              width: '100%', alignItems: 'center', gap: 14,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
            }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: 'rgba(10,173,162,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 32 }}>👁</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' }}>Switch Eye</Text>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22 }}>
                You have tested your{' '}
                <Text style={{ fontWeight: '700', color: eyeSide === 'left' ? '#60a5fa' : '#a78bfa' }}>{eyeSide}</Text>
                {'  '} eye.{'\n'}Now cover it and continue with your{'  '}
                <Text style={{ fontWeight: '700', color: eyeSide === 'left' ? '#a78bfa' : '#60a5fa' }}>
                  {eyeSide === 'left' ? 'right' : 'left'}
                </Text>{'  '} eye.
              </Text>
              <Pressable
                onPress={handleSwitchConfirm}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? TEAL_DARK : TEAL,
                  borderRadius: 14, paddingVertical: 13, width: '100%', alignItems: 'center',
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>I&apos;ve switched</Text>
              </Pressable>
              <Pressable onPress={handleSwitchDismiss} style={{ paddingVertical: 8 }}>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>Skip (test both eyes together)</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}
