/**
 * Color Vision Test — Synthetic Ishihara-style plates
 *
 * Each plate is rendered as a canvas-like grid of colored circles.
 * The "figure" dots spell out a digit. The user types/selects the digit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StatusBar, TextInput, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { COLOR_PLATES, getPlateScheme } from 'services/adaptive-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import type { ColorPlate } from 'types/vision-types';

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';
const PLATE_SIZE = Math.min(Dimensions.get('window').width - 48, 320);
const DOT_RADIUS_RANGE = [PLATE_SIZE * 0.018, PLATE_SIZE * 0.038];

// ─── Plate renderer (deterministic pseudo-random dots) ───────────────────────

function seededRand(seed: number) {
  // Simple LCG
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

interface Dot { x: number; y: number; r: number; color: string; }
interface FigureRect { x1: number; y1: number; x2: number; y2: number; }

function buildPlateDots(plate: ColorPlate): Dot[] {
  const scheme = getPlateScheme(plate.id);
  const rand = seededRand(plate.id * 7919);
  const figureStr = plate.correctAnswer || plate.deficientAnswer;

  const DIGIT_BITMASK: Record<string, number[]> = {
    '0': [1,1,1, 1,0,1, 1,0,1, 1,0,1, 1,1,1],
    '1': [0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0],
    '2': [1,1,1, 0,0,1, 1,1,1, 1,0,0, 1,1,1],
    '3': [1,1,1, 0,0,1, 0,1,1, 0,0,1, 1,1,1],
    '4': [1,0,1, 1,0,1, 1,1,1, 0,0,1, 0,0,1],
    '5': [1,1,1, 1,0,0, 1,1,1, 0,0,1, 1,1,1],
    '6': [1,1,1, 1,0,0, 1,1,1, 1,0,1, 1,1,1],
    '7': [1,1,1, 0,0,1, 0,1,0, 0,1,0, 0,1,0],
    '8': [1,1,1, 1,0,1, 1,1,1, 1,0,1, 1,1,1],
    '9': [1,1,1, 1,0,1, 1,1,1, 0,0,1, 1,1,1],
  };

  const chars = figureStr.split('').filter((c) => DIGIT_BITMASK[c]);
  const numChars = Math.max(chars.length, 1);

  // Figure region: digits occupy ~44% of plate width, centred
  const cellW = (PLATE_SIZE * 0.44) / (numChars * 3);
  const cellH = (PLATE_SIZE * 0.46) / 5;
  const offsetX = (PLATE_SIZE - numChars * 3 * cellW) / 2;
  const offsetY = (PLATE_SIZE - 5 * cellH) / 2;

  const figureRects: FigureRect[] = [];
  chars.forEach((ch, ci) => {
    (DIGIT_BITMASK[ch] ?? []).forEach((on, bi) => {
      if (!on) return;
      const col = bi % 3;
      const row = Math.floor(bi / 3); // FIXED: was bi/5 which gave wrong row
      figureRects.push({
        x1: offsetX + (ci * 3 + col) * cellW,
        y1: offsetY + row * cellH,
        x2: offsetX + (ci * 3 + col + 1) * cellW,
        y2: offsetY + (row + 1) * cellH,
      });
    });
  });

  function isInFigure(x: number, y: number): boolean {
    return figureRects.some((r) => x >= r.x1 && x < r.x2 && y >= r.y1 && y < r.y2);
  }

  const cx = PLATE_SIZE / 2;
  const cy = PLATE_SIZE / 2;
  const radius = PLATE_SIZE * 0.47;
  const dots: Dot[] = [];
  let attempts = 0;

  while (dots.length < 520 && attempts < 4000) {
    attempts++;
    const x = rand() * PLATE_SIZE;
    const y = rand() * PLATE_SIZE;
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius) continue;
    const r = DOT_RADIUS_RANGE[0] + rand() * (DOT_RADIUS_RANGE[1] - DOT_RADIUS_RANGE[0]);
    const figure = isInFigure(x, y);
    const palette = figure ? scheme.figure : scheme.background;
    dots.push({ x, y, r, color: palette[Math.floor(rand() * palette.length)] });
  }
  return dots;
}

// ─── SVG-free plate using absolute-positioned Views ─────────────────────────

function PseudoPlate({ plate }: { plate: ColorPlate }) {
  const dots = useMemo(() => buildPlateDots(plate), [plate.id]);
  return (
    <View style={{ width: PLATE_SIZE, height: PLATE_SIZE, borderRadius: PLATE_SIZE / 2, backgroundColor: '#e8e8e8', overflow: 'hidden', alignSelf: 'center' }}>
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: d.x - d.r,
            top: d.y - d.r,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: d.r,
            backgroundColor: d.color,
          }}
        />
      ))}
    </View>
  );
}

// ─── Next screen helper ───────────────────────────────────────────────────────

function nextScreen(testStatus: Record<string, string>) {
  if (testStatus.astigmatism === 'active') return '/(tab)/eyetest/astigmatism';
  if (testStatus.contrast === 'active')    return '/(tab)/eyetest/contrast';
  if (testStatus.near === 'active')        return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

// ─── DIGIT BUTTONS for answer ─────────────────────────────────────────────────

const DIGIT_ROWS = [['1','2','3'], ['4','5','6'], ['7','8','9']] as const;

export default function ColorVisionTest() {
  const {
    colorPlateIndex,
    colorTrials,
    testStatus,
    startColorTest,
    recordColorTrial,
    finaliseColor,
    markTestSkipped,
  } = useVisionStore();

  const [inputVal, setInputVal] = useState('');
  const trialStart = useRef(Date.now());

  useEffect(() => {
    if (!testStatus || testStatus.color !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
      return;
    }
    startColorTest();
  }, []);

  const plate = COLOR_PLATES[colorPlateIndex];
  const isLast = colorPlateIndex >= COLOR_PLATES.length - 1;

  useEffect(() => {
    setInputVal('');
    trialStart.current = Date.now();
  }, [colorPlateIndex]);

  const handleSubmit = useCallback((answer: string) => {
    if (!plate) return;
    const reactionMs = Date.now() - trialStart.current;
    const isCorrect = answer === plate.correctAnswer;
    recordColorTrial({ plateId: plate.id, givenAnswer: answer, isCorrect, reactionMs });

    if (isLast || colorPlateIndex >= COLOR_PLATES.length - 1) {
      finaliseColor();
      router.replace(nextScreen(testStatus) as never);
    }
  }, [plate, isLast, colorPlateIndex, testStatus]);

  if (!plate) return null;

  // ── Demo plate (plate 1) ── show a practice overlay, don't require digit input
  if (plate.id === 1) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
            <View style={{ width: 38, height: 38 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Color Vision</Text>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>Practice plate</Text>
            </View>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 }}>
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle-outline" size={20} color="#3b82f6" />
              <Text style={{ flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 20 }}>
                <Text style={{ fontWeight: '800' }}>Practice plate</Text>
                {' — '}everyone should see the number{' '}
                <Text style={{ fontWeight: '800' }}>12</Text>.
                {' '}Each plate will show a number hidden in coloured dots.
                Tap the number you see, or tap{' '}
                <Text style={{ fontWeight: '700' }}>?</Text>
                {' '}if you see nothing.
              </Text>
            </View>
            <PseudoPlate plate={plate} />
            <Pressable
              onPress={() => handleSubmit('12')}
              style={({ pressed }) => ({
                backgroundColor: pressed ? TEAL_DARK : TEAL,
                borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>I see 12 — Start Test →</Text>
            </Pressable>
          </View>
          <PatientBottomTabBar />
        </SafeAreaView>
      </View>
    );
  }

  const progress = colorPlateIndex / COLOR_PLATES.length;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
          <Pressable onPress={() => { markTestSkipped('color'); router.replace(nextScreen({ ...testStatus, color: 'skipped' }) as never); }} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Color Vision</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>Plate {colorPlateIndex + 1} of {COLOR_PLATES.length}</Text>
          </View>
        </View>

        <View style={{ height: 3, backgroundColor: '#e5e7eb' }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: '#f59e0b', borderRadius: 2 }} />
        </View>

        <View style={{ flex: 1, justifyContent: 'space-between', paddingBottom: 12 }}>
          {/* Plate */}
          <View style={{ paddingTop: 20, paddingHorizontal: 24 }}>
            <Text style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              What number do you see in the dots?{' '}
              <Text style={{ fontWeight: '700', color: '#374151' }}>Tap the number</Text>
              {' '}or tap{' '}
              <Text style={{ fontWeight: '700', color: '#374151' }}>?</Text>
              {' '}if you cannot see any.
            </Text>
            <PseudoPlate plate={plate} />
          </View>

          {/* Digit pad — 3×3 grid + I-see-nothing */}
          <View style={{ paddingHorizontal: 18, marginTop: 12, gap: 8 }}>
            {DIGIT_ROWS.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 8 }}>
                {row.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => handleSubmit(d)}
                    style={({ pressed }) => ({
                      flex: 1, height: 60, borderRadius: 14,
                      backgroundColor: pressed ? '#f0fdfc' : '#f9fafb',
                      borderWidth: 1.5, borderColor: '#e5e7eb',
                      alignItems: 'center', justifyContent: 'center',
                    })}
                  >
                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#374151' }}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {/* Nothing / can’t see button — full width */}
            <Pressable
              onPress={() => handleSubmit('')}
              style={({ pressed }) => ({
                height: 54, borderRadius: 14, marginTop: 2,
                backgroundColor: pressed ? '#fef2f2' : '#fff7f7',
                borderWidth: 2, borderColor: '#fca5a5',
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 8,
              })}
            >
              <Ionicons name="eye-off-outline" size={19} color="#dc2626" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#dc2626' }}>I see nothing</Text>
            </Pressable>
          </View>
        </View>

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
