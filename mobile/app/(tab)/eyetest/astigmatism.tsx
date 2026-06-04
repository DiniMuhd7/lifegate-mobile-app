/**
 * Astigmatism Test — Maddox Clock-Dial
 *
 * 12 lines radiate from center at 15° intervals (0–165°).
 * User selects which line appears darkest/thickest across 3 rounds.
 * Repeated selection of a non-neutral axis → astigmatism detected.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { ASTIGMATISM_AXES } from 'services/adaptive-engine';


const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';
const TOTAL_ROUNDS = 3;

function nextScreen(testStatus: Record<string, string>) {
  if (testStatus.contrast === 'active') return '/(tab)/eyetest/contrast';
  if (testStatus.near === 'active')     return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

// ─── Clock dial SVG alternative (pure RN Views) ──────────────────────────────

function ClockDial({ selected, onSelect, dialSize }: { selected: number | null; onSelect: (axis: number) => void; dialSize: number }) {
  const cx = dialSize / 2;
  const cy = dialSize / 2;
  const r  = dialSize * 0.44;

  const lines = ASTIGMATISM_AXES.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x1 = cx + r * cos;
    const y1 = cy + r * sin;
    const x2 = cx - r * cos;
    const y2 = cy - r * sin;
    const isSelected = selected === deg;

    // Hit area: a pressable dot at each line's outer end
    const hitX = cx + (r + 14) * cos;
    const hitY = cy + (r + 14) * sin;

    return { deg, x1, y1, x2, y2, cx: hitX, cy: hitY, isSelected };
  });

  return (
    <View style={{ width: dialSize, height: dialSize, alignSelf: 'center', position: 'relative' }}>
      {/* Background circle */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: dialSize, height: dialSize, borderRadius: dialSize / 2, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fafafa' }} />

      {/* Lines as thin Views rotated */}
      {lines.map(({ deg, isSelected }) => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            left: cx - 1.5,
            top: cy - r,
            width: 3,
            height: r * 2,
            backgroundColor: isSelected ? TEAL : '#1f2937',
            opacity: isSelected ? 1 : 0.65,
            transform: [{ rotate: `${deg}deg` }],
            transformOrigin: `1.5px ${r}px`,
          } as any}
        />
      ))}

      {/* Hit targets (pressable areas at outer edge — min 44×44) */}
      {lines.map(({ deg, cx: hx, cy: hy, isSelected }) => (
        <Pressable
          key={`hit-${deg}`}
          onPress={() => onSelect(deg)}
          style={{
            position: 'absolute',
            left: hx - 22,
            top: hy - 22,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isSelected ? `${TEAL}22` : 'transparent',
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected ? TEAL : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 9, color: isSelected ? TEAL : '#9ca3af', fontWeight: '700' }}>
            {deg}°
          </Text>
        </Pressable>
      ))}

      {/* Centre dot */}
      <View style={{ position: 'absolute', left: cx - 5, top: cy - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: '#374151' }} />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AstigmatismTest() {
  const {
    astigmatismRound,
    testStatus,
    startAstigmatismTest,
    recordAstigmatismTrial,
    finaliseAstigmatism,
    markTestSkipped,
  } = useVisionStore();

  const { width } = useWindowDimensions();
  const dialSize = Math.min(width - 64, 300);

  const [selected, setSelected] = useState<number | null>(null);
  const trialStart = useRef(Date.now());

  useEffect(() => {
    if (!testStatus || testStatus.astigmatism !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
      return;
    }
    startAstigmatismTest();
  }, []);

  useEffect(() => { setSelected(null); trialStart.current = Date.now(); }, [astigmatismRound]);

  const handleConfirm = useCallback(() => {
    if (selected === null) return;
    const reactionMs = Date.now() - trialStart.current;
    recordAstigmatismTrial({ selectedAxis: selected, reactionMs });

    if (astigmatismRound >= TOTAL_ROUNDS - 1) {
      finaliseAstigmatism();
      router.replace(nextScreen(useVisionStore.getState().testStatus) as never);
    }
  }, [selected, astigmatismRound]);

  const progress = astigmatismRound / TOTAL_ROUNDS;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
          <Pressable onPress={() => { markTestSkipped('astigmatism'); router.replace(nextScreen(useVisionStore.getState().testStatus) as never); }} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Astigmatism</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>Round {astigmatismRound + 1} of {TOTAL_ROUNDS}</Text>
          </View>
        </View>

        <View style={{ height: 3, backgroundColor: '#e5e7eb' }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: '#8b5cf6', borderRadius: 2 }} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 }}>
          <View style={{ backgroundColor: '#f5f3ff', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Ionicons name="eye-outline" size={16} color="#7c3aed" />
            <Text style={{ flex: 1, fontSize: 13, color: '#4c1d95', lineHeight: 20 }}>
              Relax your eyes and look at the dial naturally.
              Tap the{' '}<Text style={{ fontWeight: '800' }}>line that looks darkest or thickest</Text>.
              If all lines look the same, tap the button below the dial.
            </Text>
          </View>

          <ClockDial selected={selected} onSelect={setSelected} dialSize={dialSize} />

          {selected !== null && (
            <View style={{ backgroundColor: '#f5f3ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={14} color="#7c3aed" />
              <Text style={{ fontSize: 13, color: '#7c3aed', fontWeight: '700' }}>
                {selected === 90 ? 'No preference selected' : `Axis ${selected}° selected`}
              </Text>
            </View>
          )}

          {/* All lines equal option */}
          <Pressable
            onPress={() => setSelected(90)}
            style={({ pressed }) => ({
              borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
              borderWidth: 1.5,
              borderColor: selected === 90 ? '#7c3aed' : '#d1d5db',
              backgroundColor: selected === 90 ? '#f5f3ff' : (pressed ? '#f9fafb' : '#fff'),
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            })}
          >
            <Ionicons name="remove-circle-outline" size={18} color={selected === 90 ? '#7c3aed' : '#9ca3af'} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: selected === 90 ? '#7c3aed' : '#6b7280' }}>
              All lines look equal
            </Text>
          </Pressable>
        </View>

        {/* Confirm */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Pressable
            onPress={handleConfirm}
            disabled={selected === null}
            style={({ pressed }) => ({
              borderRadius: 14, paddingVertical: 14, alignItems: 'center',
              backgroundColor: selected !== null ? (pressed ? TEAL_DARK : TEAL) : '#e5e7eb',
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: selected !== null ? '#fff' : '#9ca3af' }}>
              {astigmatismRound >= TOTAL_ROUNDS - 1 ? 'Finish Test' : 'Next Round'}
            </Text>
          </Pressable>
        </View>

      </SafeAreaView>
    </View>
  );
}
