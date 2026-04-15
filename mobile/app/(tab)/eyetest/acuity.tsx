/**
 * Visual Acuity Test — LogMAR Bayesian Adaptive Staircase
 *
 * Presents a single random optotype letter at the current LogMAR level.
 * User selects from a 5-letter forced-choice panel.
 * Staircase terminates after 6 reversals → finaliseAcuity() → next test.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StatusBar, Animated, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import {
  LOGMAR_LEVELS,
  logmarToLetterHeightPx,
  randomOptotype,
  randomOptotypes,
} from 'services/adaptive-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';
const NUM_CHOICES = 5;

function nextScreen(testStatus: Record<string, string>) {
  if (testStatus.color === 'active')       return '/(tab)/eyetest/color';
  if (testStatus.astigmatism === 'active') return '/(tab)/eyetest/astigmatism';
  if (testStatus.contrast === 'active')    return '/(tab)/eyetest/contrast';
  if (testStatus.near === 'active')        return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

export default function AcuityTest() {
  const {
    acuityStaircase,
    acuityTrials,
    deviceCalibration,
    viewingDistanceCm,
    selectedTests,
    testStatus,
    startAcuityTest,
    recordAcuityTrial,
    finaliseAcuity,
    markTestSkipped,
    recordEyeSwitch,
  } = useVisionStore();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const trialStart = useRef(Date.now());

  // ── Eye-switch compliance tracking ─────────────────────────────────────────
  // We prompt once, after the 4th trial, asking the user to cover the other eye.
  const [eyeSide, setEyeSide] = useState<'left' | 'right'>('left');
  const [showSwitchPrompt, setShowSwitchPrompt] = useState(false);
  const switchPromptTime = useRef<number>(0);
  const switchTriggered = useRef(false);

  // Current target letter + choices — regenerated each trial
  const [target, setTarget] = useState(() => randomOptotype());
  const [choices, setChoices] = useState(() => {
    const opts = randomOptotypes(NUM_CHOICES - 1);
    const t = randomOptotype(opts[opts.length - 1]);
    const all = [...opts, t].sort(() => Math.random() - 0.5);
    return all;
  });
  const [answered, setAnswered] = useState<string | null>(null);

  // Guard + init
  useEffect(() => {
    if (!testStatus || testStatus.acuity !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
      return;
    }
    startAcuityTest();
  }, []);

  // When staircase done → finalise
  useEffect(() => {
    if (acuityStaircase?.done && !answered) {
      finaliseAcuity();
      router.replace(nextScreen(testStatus) as never);
    }
  }, [acuityStaircase?.done]);

  const currentLogMAR = acuityStaircase
    ? LOGMAR_LEVELS[acuityStaircase.levelIdx]
    : 0.5;

  const letterPx = useMemo(() => {
    if (!deviceCalibration) return 60;
    return logmarToLetterHeightPx(currentLogMAR, viewingDistanceCm, deviceCalibration);
  }, [currentLogMAR, deviceCalibration, viewingDistanceCm]);

  const handleAnswer = useCallback((chosen: string) => {
    if (answered) return;
    const reactionMs = Date.now() - trialStart.current;
    const correct = chosen === target;
    setAnswered(chosen);

    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      recordAcuityTrial({ logMAR: currentLogMAR, letterHeightPx: letterPx, letter: target, response: correct ? 'correct' : 'incorrect', reactionMs });

      // Next trial
      const newTarget = randomOptotype();
      const opts = randomOptotypes(NUM_CHOICES - 1);
      const all = [...opts, newTarget].sort(() => Math.random() - 0.5);
      setTarget(newTarget);
      setChoices(all);
      setAnswered(null);
      trialStart.current = Date.now();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }, [answered, target, currentLogMAR, letterPx]);

  const trialsCount = acuityTrials.length;
  const reversals = acuityStaircase?.reversals.length ?? 0;
  const progress = Math.min(reversals / 6, 1);

  // Trigger the eye-switch prompt once after the 4th trial
  useEffect(() => {
    if (trialsCount === 4 && !switchTriggered.current) {
      switchTriggered.current = true;
      switchPromptTime.current = Date.now();
      setShowSwitchPrompt(true);
    }
  }, [trialsCount]);

  const handleSwitchConfirm = useCallback(() => {
    const side: 'left' | 'right' = eyeSide === 'left' ? 'right' : 'left';
    recordEyeSwitch({
      testId: 'acuity',
      promptedAt: switchPromptTime.current,
      confirmedAt: Date.now(),
      trialIndexAtSwitch: trialsCount,
      side,
      complied: true,
    });
    setEyeSide(side);
    setShowSwitchPrompt(false);
    trialStart.current = Date.now();
  }, [eyeSide, trialsCount, recordEyeSwitch]);

  const handleSwitchDismiss = useCallback(() => {
    recordEyeSwitch({
      testId: 'acuity',
      promptedAt: switchPromptTime.current,
      confirmedAt: null,
      trialIndexAtSwitch: trialsCount,
      side: eyeSide === 'left' ? 'right' : 'left',
      complied: false,
    });
    setShowSwitchPrompt(false);
    trialStart.current = Date.now();
  }, [eyeSide, trialsCount, recordEyeSwitch]);


  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
          <Pressable onPress={() => { markTestSkipped('acuity'); router.replace(nextScreen({ ...testStatus, acuity: 'skipped' }) as never); }} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Visual Acuity</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>Trial {trialsCount + 1} · LogMAR {currentLogMAR.toFixed(1)}</Text>
          </View>
          <View style={{ backgroundColor: '#f0fdfc', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: TEAL }}>{reversals}/6 reversals</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: '#e5e7eb' }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: TEAL, borderRadius: 2 }} />
        </View>

        {/* Instruction */}
        <Text style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginTop: 14, paddingHorizontal: 24 }}>
          Cover your <Text style={{ fontWeight: '800', color: eyeSide === 'left' ? '#3b82f6' : '#8b5cf6' }}>{eyeSide}</Text> eye. Identify the letter shown.
        </Text>

        {/* Optotype display */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text
            style={{
              fontSize: Math.max(16, Math.min(letterPx, 200)),
              fontWeight: '900',
              color: '#111827',
              fontFamily: 'Courier New',
              opacity: answered ? (answered === target ? 1 : 0.5) : fadeAnim,
            }}
          >
            {target}
          </Animated.Text>
        </View>

        {/* Choice panel */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
          <Text style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
            Which letter is it?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {choices.map((c) => {
              const isCorrect = c === target;
              const wasChosen = c === answered;
              let bg = '#f3f4f6';
              let border = '#e5e7eb';
              let textColor = '#374151';
              if (wasChosen && isCorrect) { bg = '#f0fdf4'; border = '#86efac'; textColor = '#16a34a'; }
              else if (wasChosen && !isCorrect) { bg = '#fef2f2'; border = '#fca5a5'; textColor = '#dc2626'; }
              return (
                <Pressable
                  key={c}
                  onPress={() => handleAnswer(c)}
                  disabled={!!answered}
                  style={({ pressed }) => ({
                    width: 64, height: 64, borderRadius: 14,
                    backgroundColor: bg, borderWidth: 2, borderColor: border,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontSize: 28, fontWeight: '900', color: textColor, fontFamily: 'Courier New' }}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <PatientBottomTabBar />

        {/* Eye-switch compliance modal */}
        <Modal transparent animationType="fade" visible={showSwitchPrompt} onRequestClose={handleSwitchDismiss}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28 }}>&#x1F441;</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' }}>
                Switch Eye
              </Text>
              <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 }}>
                You have tested your{' '}
                <Text style={{ fontWeight: '700', color: eyeSide === 'left' ? '#3b82f6' : '#8b5cf6' }}>{eyeSide}</Text>
                {' '}eye.{'\n'}Now cover it and continue with your{' '}
                <Text style={{ fontWeight: '700', color: eyeSide === 'left' ? '#8b5cf6' : '#3b82f6' }}>
                  {eyeSide === 'left' ? 'right' : 'left'}
                </Text>{' '}eye.
              </Text>
              <Pressable
                onPress={handleSwitchConfirm}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? TEAL_DARK : TEAL,
                  borderRadius: 12, paddingVertical: 13, paddingHorizontal: 32, width: '100%', alignItems: 'center',
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>I&apos;ve switched</Text>
              </Pressable>
              <Pressable onPress={handleSwitchDismiss} style={{ paddingVertical: 8 }}>
                <Text style={{ fontSize: 14, color: '#9ca3af' }}>Skip (test both eyes together)</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
