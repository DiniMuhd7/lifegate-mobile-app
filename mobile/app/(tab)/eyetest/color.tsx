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

function buildPlateDots(plate: ColorPlate): Dot[] {
  const scheme = getPlateScheme(plate.id);
  const rand = seededRand(plate.id * 7919);
  const dots: Dot[] = [];
  const total = 380;
  const figureDigit = plate.correctAnswer || plate.deficientAnswer;

  // Pre-compute simple bitmask for digits 0-9 on a 3x5 grid
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

  // Build a set of figure positions (cells for each digit character)
  const figureSet = new Set<string>();
  const chars = figureDigit.split('');
  chars.forEach((ch, ci) => {
    const mask = DIGIT_BITMASK[ch] ?? [];
    mask.forEach((on, bi) => {
      if (!on) return;
      const col = bi % 3;
      const row = Math.floor(bi / 5);
      const gx = Math.floor(PLATE_SIZE * (0.25 + ci * 0.28 + col * 0.08));
      const gy = Math.floor(PLATE_SIZE * (0.3 + row * 0.1));
      figureSet.add(`${Math.round(gx / 18)},${Math.round(gy / 18)}`);
    });
  });

  for (let i = 0; i < total; i++) {
    const x = rand() * (PLATE_SIZE - 10) + 5;
    const y = rand() * (PLATE_SIZE - 10) + 5;
    const r = DOT_RADIUS_RANGE[0] + rand() * (DOT_RADIUS_RANGE[1] - DOT_RADIUS_RANGE[0]);
    const key = `${Math.round(x / 18)},${Math.round(y / 18)}`;
    const isFigure = figureSet.has(key);
    const palette = isFigure ? scheme.figure : scheme.background;
    const color = palette[Math.floor(rand() * palette.length)];
    dots.push({ x, y, r, color });
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

const DIGIT_CHOICES = ['1','2','3','4','5','6','7','8','9','?'];

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
              What number do you see? Tap "?" if you can't see any.
            </Text>
            <PseudoPlate plate={plate} />
          </View>

          {/* Digit buttons */}
          <View style={{ paddingHorizontal: 18, marginTop: 16 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {DIGIT_CHOICES.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => handleSubmit(d === '?' ? '' : d)}
                  style={({ pressed }) => ({
                    width: 52, height: 52, borderRadius: 12,
                    backgroundColor: pressed ? '#f0fdfc' : '#f9fafb',
                    borderWidth: 2, borderColor: '#e5e7eb',
                    alignItems: 'center', justifyContent: 'center',
                  })}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#374151' }}>{d}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
