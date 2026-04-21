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
import { router, useNavigation } from 'expo-router';
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

// ── Motion styles ────────────────────────────────────────────────────────────
/** Visual animation applied to the optotype during motion trials */
type MotionStyle =
  | 'slide-h'    // horizontal oscillation ±54 px
  | 'slide-v'    // vertical oscillation ±36 px
  | 'diagonal'   // diagonal ↗↙ ±44 × ±28 px
  | 'rotate'     // gentle clockwise / counter-clockwise ±12°
  | 'pulse'      // scale breathe 1 → 1.28 → 0.80 → 1
  | 'shake'      // rapid lateral jitter
  | 'orbit'      // circular (diamond) orbit ±36 px
  | 'pendulum';  // wide pendulum swing ±20°

const MOTION_STYLES: MotionStyle[] = [
  'slide-h', 'slide-v', 'diagonal', 'rotate', 'pulse', 'shake', 'orbit', 'pendulum',
];

function randomMotionStyle(): MotionStyle {
  return MOTION_STYLES[Math.floor(Math.random() * MOTION_STYLES.length)];
}

const MOTION_STYLE_LABEL: Record<MotionStyle, string> = {
  'slide-h':  '↔ Slide',
  'slide-v':  '↕ Drift',
  'diagonal': '↗ Diagonal',
  'rotate':   '↻ Rotate',
  'pulse':    '◉ Pulse',
  'shake':    '≋ Shake',
  'orbit':    '○ Orbit',
  'pendulum': '⌛ Swing',
};

type EyePhase       = 'left' | 'right' | 'both';
type ClarityLevel   = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type TrialType      = 'static' | 'motion';

/** How the optotype is visually rendered, independent of logMAR difficulty */
type PresentationMode =
  | 'very-clear'     // crisp, high-contrast, medium-large
  | 'clear'          // standard clear presentation
  | 'normal'         // default rendering
  | 'dim'            // low opacity ~0.45, no blur (simulate contrast loss)
  | 'ghost'          // very low opacity ~0.28 (extreme contrast loss)
  | 'slightly-blurry'// 1 ghost layer offset
  | 'blurry'         // 2-3 ghost layers
  | 'very-blurry'    // 4-6 ghost layers + reduced opacity
  | 'tiny'           // force 55% size
  | 'small'          // 72% size
  | 'big'            // 130% size
  | 'huge';          // 165% size

const ALL_MODES: PresentationMode[] = [
  'very-clear', 'clear', 'normal', 'dim', 'ghost',
  'slightly-blurry', 'blurry', 'very-blurry',
  'tiny', 'small', 'big', 'huge',
];

function randomMode(): PresentationMode {
  return ALL_MODES[Math.floor(Math.random() * ALL_MODES.length)];
}

const MODE_LABEL: Record<PresentationMode, string> = {
  'very-clear':     'Very Clear',
  'clear':          'Clear',
  'normal':         'Normal',
  'dim':            'Dim',
  'ghost':          'Ghost',
  'slightly-blurry':'Slightly Blurry',
  'blurry':         'Blurry',
  'very-blurry':    'Very Blurry',
  'tiny':           'Tiny',
  'small':          'Small',
  'big':            'Big',
  'huge':           'Huge',
};

const MODE_ICON: Record<PresentationMode, string> = {
  'very-clear': '✦', 'clear': '◉', 'normal': '●',
  'dim': '◌', 'ghost': '○',
  'slightly-blurry': '⬡', 'blurry': '⬢', 'very-blurry': '✦',
  'tiny': '·', 'small': '•', 'big': '◈', 'huge': '◆',
};

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


const CLARITY_LABEL: Record<ClarityLevel, string> = {
  1: 'Crystal Clear', 2: 'Clear', 3: 'Normal', 4: 'Slightly Blurred',
  5: 'Blurred', 6: 'Very Blurred', 7: 'Extreme Blur',
};

const CLARITY_COLOR: Record<ClarityLevel, string> = {
  1: '#4ade80', 2: TEAL, 3: '#94a3b8', 4: '#fbbf24', 5: '#f97316', 6: '#ef4444', 7: '#dc2626',
};

function clarityFromLogMAR(logMAR: number): ClarityLevel {
  if (logMAR <= -0.1) return 1;
  if (logMAR <=  0.0) return 2;
  if (logMAR <=  0.2) return 3;
  if (logMAR <=  0.4) return 4;
  if (logMAR <=  0.7) return 5;
  if (logMAR <=  1.0) return 6;
  return 7;
}

function nextScreen(ts: Record<string, string>) {
  if (ts.color === 'active')       return '/(tab)/eyetest/color';
  if (ts.astigmatism === 'active') return '/(tab)/eyetest/astigmatism';
  if (ts.contrast === 'active')    return '/(tab)/eyetest/contrast';
  if (ts.near === 'active')        return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

// ── OptotypeLetter — rich multi-mode display ─────────────────────────────────
function OptotypeLetter({
  letter,
  baseSize,
  mode,
}: {
  letter: string;
  baseSize: number; // px from logMAR calibration
  mode: PresentationMode;
}) {
  type L = { dx: number; dy: number; opacity: number; scale?: number };

  // ── Size multiplier per mode ────────────────────────────────────────────────
  const sizeMap: Record<PresentationMode, number> = {
    'very-clear': 1.10, 'clear': 1.00, 'normal': 1.00,
    'dim': 0.95, 'ghost': 0.92,
    'slightly-blurry': 1.00, 'blurry': 1.05, 'very-blurry': 1.08,
    'tiny': 0.45, 'small': 0.68, 'big': 1.35, 'huge': 1.70,
  };
  const sz = Math.max(22, Math.min(baseSize * sizeMap[mode], 200));

  // ── Blur ghost layers ───────────────────────────────────────────────────────
  const layers: L[] = [];
  if (mode === 'slightly-blurry') {
    layers.push({ dx: 2, dy: 2, opacity: 0.20 }, { dx: -2, dy: -1, opacity: 0.14 });
  } else if (mode === 'blurry') {
    layers.push(
      { dx: 3,  dy: 3,  opacity: 0.22 },
      { dx: -3, dy: 2,  opacity: 0.16 },
      { dx: 5,  dy: -2, opacity: 0.12 },
      { dx: -1, dy: -4, opacity: 0.09 },
    );
  } else if (mode === 'very-blurry') {
    layers.push(
      { dx: 5,  dy: 4,  opacity: 0.24 },
      { dx: -4, dy: 3,  opacity: 0.20 },
      { dx: 7,  dy: -3, opacity: 0.16 },
      { dx: -2, dy: -5, opacity: 0.13 },
      { dx: 8,  dy: 6,  opacity: 0.10 },
      { dx: -6, dy: -2, opacity: 0.08 },
    );
  }

  // ── Main letter opacity ─────────────────────────────────────────────────────
  const opacityMap: Record<PresentationMode, number> = {
    'very-clear': 1.00, 'clear': 1.00, 'normal': 1.00,
    'dim': 0.42, 'ghost': 0.22,
    'slightly-blurry': 0.88, 'blurry': 0.70, 'very-blurry': 0.52,
    'tiny': 1.00, 'small': 1.00, 'big': 1.00, 'huge': 1.00,
  };
  const mainOpacity = opacityMap[mode];

  // ── Font weight — very-clear gets extra weight ──────────────────────────────
  const weight: '900' | '800' | '400' =
    mode === 'very-clear' ? '900'
    : mode === 'ghost' || mode === 'dim' ? '400'
    : '900';

  // ── Colour tint ─────────────────────────────────────────────────────────────
  const letterColor =
    mode === 'very-clear' ? '#ffffff'
    : mode === 'huge'     ? '#e2e8f0'
    : '#ffffff';

  const base = {
    fontSize: sz,
    fontWeight: weight,
    fontFamily: 'Courier New',
    color: letterColor,
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
          selectable={false}
        >
          {letter}
        </Text>
      ))}
      <Text
        style={[base, {
          opacity: mainOpacity,
          textShadowColor:
            mode === 'very-clear' ? 'rgba(255,255,255,0.6)'
            : mode === 'clear'    ? 'rgba(255,255,255,0.25)'
            : 'transparent',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: mode === 'very-clear' ? 14 : 6,
        }]}
        selectable={false}
      >
        {letter}
      </Text>
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
  letter, index, isCorrect, wasChosen, revealRight, dimmed, phaseColor, onPress, disabled,
}: {
  letter: string;
  index: number;
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
    Animated.spring(pressAnim, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 10 }).start();
  };

  // ── State-driven visual tokens ──────────────────────────────────────────────
  let bg         = 'rgba(255,255,255,0.11)';   // frosted-glass card — high contrast
  let border     = 'rgba(255,255,255,0.30)';    // clearly visible outline
  let textColor  = '#ffffff';
  let labelColor = `${phaseColor}bb`;
  let glow: object = {};
  let statusIcon: React.ReactNode = null;

  if (wasChosen && isCorrect) {
    bg = 'rgba(74,222,128,0.18)';
    border = '#4ade80';
    textColor = '#4ade80';
    labelColor = '#4ade8099';
    glow = { shadowColor: '#4ade80', shadowOpacity: 0.55, shadowRadius: 20, elevation: 10 };
    statusIcon = (
      <View style={{
        position: 'absolute', top: 10, right: 10,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#4ade80', alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="checkmark" size={13} color="#000" />
      </View>
    );
  } else if (wasChosen && !isCorrect) {
    bg = 'rgba(248,113,113,0.18)';
    border = '#f87171';
    textColor = '#f87171';
    labelColor = '#f8717199';
    glow = { shadowColor: '#f87171', shadowOpacity: 0.55, shadowRadius: 20, elevation: 10 };
    statusIcon = (
      <View style={{
        position: 'absolute', top: 10, right: 10,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#f87171', alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="close" size={13} color="#fff" />
      </View>
    );
  } else if (revealRight) {
    bg = 'rgba(74,222,128,0.10)';
    border = '#4ade8066';
    textColor = '#4ade80';
    labelColor = '#4ade8066';
    statusIcon = (
      <View style={{
        position: 'absolute', top: 10, right: 10,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(74,222,128,0.2)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: '#4ade8055',
      }}>
        <Ionicons name="checkmark" size={12} color="#4ade80" />
      </View>
    );
  }

  return (
    <Animated.View style={[{ transform: [{ scale: pressAnim }], flex: 1 }, glow]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={{
          height: 96,
          borderRadius: 20,
          backgroundColor: bg,
          borderWidth: 1.5,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: dimmed ? 0.22 : 1,
          overflow: 'hidden',
        }}
      >
        {/* Top-edge highlight strip */}
        <View style={{
          position: 'absolute', top: 0, left: 12, right: 12, height: 1,
          backgroundColor: dimmed ? 'transparent'
            : wasChosen && isCorrect ? 'rgba(74,222,128,0.5)'
            : wasChosen && !isCorrect ? 'rgba(248,113,113,0.5)'
            : 'rgba(255,255,255,0.15)',
          borderRadius: 2,
        }} />

        {/* Index label — top left */}
        <Text style={{
          position: 'absolute', top: 9, left: 12,
          fontSize: 9, fontWeight: '700',
          color: labelColor,
          letterSpacing: 0.5,
        }}>
          {String.fromCharCode(65 + index)}
        </Text>

        {/* Status icon — top right */}
        {statusIcon}

        {/* Main letter */}
        <Text
          selectable={false}
          style={{
            fontSize: 42,
            fontWeight: '900',
            color: textColor,
            fontFamily: 'Courier New',
            letterSpacing: 3,
            textShadowColor: wasChosen && isCorrect ? 'rgba(74,222,128,0.55)'
              : wasChosen && !isCorrect ? 'rgba(248,113,113,0.55)'
              : 'rgba(255,255,255,0.30)',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: wasChosen ? 12 : 6,
          }}
        >
          {letter}
        </Text>

        {/* Status label — below letter */}
        {(wasChosen || revealRight) && (
          <Text style={{
            marginTop: 3,
            fontSize: 8,
            fontWeight: '800',
            letterSpacing: 1.8,
            color: wasChosen && isCorrect ? '#4ade80'
              : wasChosen && !isCorrect ? '#f87171'
              : '#4ade8099',
          }}>
            {wasChosen && isCorrect ? 'CORRECT ✓'
              : wasChosen && !isCorrect ? 'WRONG ✗'
              : 'ANSWER'}
          </Text>
        )}
      </Pressable>
    </Animated.View>
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
  const fadeAnim        = useRef(new Animated.Value(1)).current;
  const scaleAnim       = useRef(new Animated.Value(1)).current;
  const motionAnim      = useRef(new Animated.Value(0)).current;  // translateX
  const motionYAnim     = useRef(new Animated.Value(0)).current;  // translateY
  const motionRotAnim   = useRef(new Animated.Value(0)).current;  // −1..+1 → degrees
  const motionScaleAnim = useRef(new Animated.Value(1)).current;  // pulse scale
  const motionLoop      = useRef<Animated.CompositeAnimation | null>(null);

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
  const [trialType,         setTrialType]        = useState<TrialType>('static');
  const [motionStyle,       setMotionStyle]       = useState<MotionStyle>('slide-h');
  const [presentationMode,  setPresentationMode] = useState<PresentationMode>('normal');
  const [{ target, choices }, setStimulus] = useState(() => {
    const t = randomOptotype();
    const d = randomOptotypes(NUM_CHOICES - 1);
    return { target: t, choices: [...d, t].sort(() => Math.random() - 0.5) };
  });
  const [answered,       setAnswered]       = useState<string | null>(null);
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const [streak,         setStreak]         = useState(0);
  const trialStart = useRef(Date.now());

  // Exit confirmation
  const navigation = useNavigation();


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
    motionYAnim.setValue(0);
    motionRotAnim.setValue(0);
    motionScaleAnim.setValue(1);
  }, [motionAnim, motionYAnim, motionRotAnim, motionScaleAnim]);

  const startMotion = useCallback((style: MotionStyle) => {
    // Reset all motion values before starting the chosen style.
    motionAnim.setValue(0);
    motionYAnim.setValue(0);
    motionRotAnim.setValue(0);
    motionScaleAnim.setValue(1);

    let loop: Animated.CompositeAnimation;

    switch (style) {
      // ── Vertical drift ──────────────────────────────────────────────────
      case 'slide-v':
        loop = Animated.loop(Animated.sequence([
          Animated.timing(motionYAnim, { toValue:  36, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionYAnim, { toValue: -36, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionYAnim, { toValue:   0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        break;

      // ── Diagonal ↗↙ ─────────────────────────────────────────────────────
      case 'diagonal':
        loop = Animated.loop(Animated.sequence([
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue:  44, duration: 780, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue: -28, duration: 780, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue: -44, duration: 780, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue:  28, duration: 780, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue: 0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        ]));
        break;

      // ── Gentle rotation ±12° ────────────────────────────────────────────
      case 'rotate':
        loop = Animated.loop(Animated.sequence([
          Animated.timing(motionRotAnim, { toValue:  0.6, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionRotAnim, { toValue: -0.6, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionRotAnim, { toValue:  0,   duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        break;

      // ── Scale pulse ─────────────────────────────────────────────────────
      case 'pulse':
        loop = Animated.loop(Animated.sequence([
          Animated.timing(motionScaleAnim, { toValue: 1.28, duration: 580, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionScaleAnim, { toValue: 0.80, duration: 580, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionScaleAnim, { toValue: 1,    duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        break;

      // ── Rapid lateral shake ─────────────────────────────────────────────
      case 'shake':
        loop = Animated.loop(Animated.sequence([
          Animated.timing(motionAnim, { toValue:  11, duration: 55, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue: -11, duration: 55, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue:   8, duration: 55, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue:  -8, duration: 55, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue:   4, duration: 55, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue:   0, duration: 55, easing: Easing.linear, useNativeDriver: true }),
          Animated.delay(360),
        ]));
        break;

      // ── Diamond orbit ───────────────────────────────────────────────────
      case 'orbit':
        motionAnim.setValue(36); // start at 3 o'clock
        loop = Animated.loop(Animated.sequence([
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue:  0,  duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue:  36, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue: -36, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue:  0,  duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue:  0,  duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue: -36, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(motionAnim,  { toValue:  36, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(motionYAnim, { toValue:  0,  duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        ]));
        break;

      // ── Wide pendulum swing ±20° ────────────────────────────────────────
      case 'pendulum':
        loop = Animated.loop(Animated.sequence([
          Animated.timing(motionRotAnim, { toValue:  1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(motionRotAnim, { toValue: -1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]));
        break;

      // ── Horizontal slide (default) ──────────────────────────────────────
      default:
        loop = Animated.loop(Animated.sequence([
          Animated.timing(motionAnim, { toValue:  54, duration: 680, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue: -54, duration: 680, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(motionAnim, { toValue:   0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
    }

    loop.start();
    motionLoop.current = loop;
  }, [motionAnim, motionYAnim, motionRotAnim, motionScaleAnim]);

  // Animate letter in
  const animateIn = useCallback((isMotion: boolean, style: MotionStyle = 'slide-h') => {
    scaleAnim.setValue(1.55);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true }),
    ]).start(() => { if (isMotion) startMotion(style); });
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
      const nextMStyle   = nextIsMotion ? randomMotionStyle() : 'slide-h';
      setStimulus({ target: newT, choices: [...newD, newT].sort(() => Math.random() - 0.5) });
      setTrialType(nextIsMotion ? 'motion' : 'static');
      setMotionStyle(nextMStyle);
      setPresentationMode(randomMode());
      setAnswered(null);
      trialStart.current = Date.now();
      animateIn(nextIsMotion, nextMStyle);
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

  const handleExit = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopMotion();
    markTestSkipped('acuity');
    router.replace(nextScreen({ ...testStatus, acuity: 'skipped' }) as never);
  }, [stopMotion, markTestSkipped, testStatus]);

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
            onPress={handleExit}
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

              {/* Motion badge — shows current style name */}
              {trialType === 'motion' && (
                <View style={{ backgroundColor: 'rgba(251,191,36,0.14)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fbbf24' }}>
                    {MOTION_STYLE_LABEL[motionStyle]}
                  </Text>
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

          {/* Letter — entry animation (outer) + motion style (inner) */}
          <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: fadeAnim }}>
            <Animated.View style={{
              transform: [
                { translateX: motionAnim },
                { translateY: motionYAnim },
                { rotate: motionRotAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-20deg', '20deg'] }) },
                { scale: motionScaleAnim },
              ],
            }}>
              <OptotypeLetter
                letter={target}
                baseSize={Math.max(28, Math.min(letterPx, 180))}
                mode={presentationMode}
              />
            </Animated.View>
          </Animated.View>

          {/* Mode label — shown briefly below letter */}
          <View style={{
            position: 'absolute', bottom: 22,
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ fontSize: 9, color: clarityColor, opacity: 0.7 }}>
              {MODE_ICON[presentationMode]}
            </Text>
            <Text style={{
              fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.35)',
              letterSpacing: 1.2, textTransform: 'uppercase',
            }}>
              {MODE_LABEL[presentationMode]}
            </Text>
          </View>


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

        {/* ── Choice buttons — 2 rows: top 3 equal · bottom 2 equal ──── */}
        <View key={trialsCount} style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
          {/* Row 1 — A B C */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {choices.slice(0, 3).map((c, idx) => {
              const isCorrect   = c === target;
              const wasChosen   = c === answered;
              const revealRight = !!answered && isCorrect && !wasChosen;
              const dimmed      = !!answered && !wasChosen && !revealRight;
              return (
                <ChoiceButton
                  key={c}
                  letter={c}
                  index={idx}
                  isCorrect={isCorrect}
                  wasChosen={wasChosen}
                  revealRight={revealRight}
                  dimmed={dimmed}
                  phaseColor={phaseConf.color}
                  onPress={() => handleAnswer(c)}
                  disabled={!!answered}
                />
              );
            })}
          </View>

          {/* Row 2 — D E (wider, centred) */}
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: '8%' }}>
            {choices.slice(3).map((c, idx) => {
              const isCorrect   = c === target;
              const wasChosen   = c === answered;
              const revealRight = !!answered && isCorrect && !wasChosen;
              const dimmed      = !!answered && !wasChosen && !revealRight;
              return (
                <ChoiceButton
                  key={c}
                  letter={c}
                  index={3 + idx}
                  isCorrect={isCorrect}
                  wasChosen={wasChosen}
                  revealRight={revealRight}
                  dimmed={dimmed}
                  phaseColor={phaseConf.color}
                  onPress={() => handleAnswer(c)}
                  disabled={!!answered}
                />
              );
            })}
          </View>
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
