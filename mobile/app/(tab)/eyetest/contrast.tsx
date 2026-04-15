/**
 * Contrast Sensitivity Test
 *
 * Shows a vertical sine-wave grating at a given spatial frequency and
 * contrast level. User reports whether they can see the pattern.
 * Staircase per frequency → outputs a CS curve.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { CS_SPATIAL_FREQS } from 'services/adaptive-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';
const GRATING_SIZE = Math.min(Dimensions.get('window').width - 48, 280);
const SF_COLORS = ['#0AADA2','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#16a34a'];

function nextScreen(testStatus: Record<string, string>) {
  if (testStatus.near === 'active') return '/(tab)/eyetest/near';
  return '/(tab)/eyetest/battery-results';
}

// ─── Sine grating renderer (pure View columns) ───────────────────────────────

function SineGrating({ spatialFreq, contrastPercent }: { spatialFreq: number; contrastPercent: number }) {
  const numCols = Math.max(4, Math.min(Math.round(spatialFreq * 12), 80));
  const cols = useMemo(() => {
    const result = [];
    for (let i = 0; i < numCols; i++) {
      const phase = (i / numCols) * 2 * Math.PI;
      const sine = Math.sin(phase); // -1..1
      // Map to grey: 128 ± amplitude
      const amplitude = (contrastPercent / 100) * 128;
      const grey = Math.round(128 + sine * amplitude);
      const hex = grey.toString(16).padStart(2, '0');
      result.push(`#${hex}${hex}${hex}`);
    }
    return result;
  }, [numCols, contrastPercent]);

  return (
    <View style={{ width: GRATING_SIZE, height: GRATING_SIZE, flexDirection: 'row', alignSelf: 'center', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
      {cols.map((color, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ContrastTest() {
  const {
    contrastSfIndex,
    contrastStaircases,
    testStatus,
    startContrastTest,
    recordContrastTrial,
    advanceContrastSf,
    markTestSkipped,
  } = useVisionStore();

  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (!testStatus || testStatus.contrast !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
      return;
    }
    startContrastTest();
  }, []);

  useEffect(() => { setAnswered(false); }, [contrastSfIndex, contrastStaircases[contrastSfIndex]?.contrastPercent]);

  const sf = CS_SPATIAL_FREQS[contrastSfIndex];
  const staircase = contrastStaircases[contrastSfIndex];
  const contrastPct = staircase?.contrastPercent ?? 50;
  const sfDone = staircase?.done ?? false;

  const trialStart = useRef(Date.now());

  const handleResponse = useCallback((seen: boolean) => {
    if (answered || !sf) return;
    setAnswered(true);
    const reactionMs = Date.now() - trialStart.current;
    recordContrastTrial({ spatialFrequency: sf, contrastPercent: contrastPct, response: seen ? 'seen' : 'not_seen', reactionMs });
    trialStart.current = Date.now();

    setTimeout(() => {
      setAnswered(false);
      if (sfDone) {
        advanceContrastSf();
      }
    }, 300);
  }, [answered, sf, contrastPct, sfDone]);

  const totalSf = CS_SPATIAL_FREQS.length;
  const progress = (contrastSfIndex + (sfDone ? 1 : 0)) / totalSf;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
          <Pressable onPress={() => { markTestSkipped('contrast'); router.replace(nextScreen({ ...testStatus, contrast: 'skipped' }) as never); }} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Contrast Sensitivity</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>
              Frequency {contrastSfIndex + 1}/{totalSf} · {sf} cpd · {contrastPct}% contrast
            </Text>
          </View>
        </View>

        <View style={{ height: 3, backgroundColor: '#e5e7eb' }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: SF_COLORS[contrastSfIndex % SF_COLORS.length], borderRadius: 2 }} />
        </View>

        <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 20, paddingHorizontal: 24 }}>
          <Text style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', lineHeight: 20 }}>
            Look at the box below without squinting.{' '}
            <Text style={{ fontWeight: '800' }}>Can you see any stripes or banding</Text>
            , however faint?{' '}
            {sf >= 8 && (
              <Text style={{ color: '#d97706', fontWeight: '600' }}>Fine detail — look carefully at the centre. </Text>
            )}
            {sf <= 1 && (
              <Text style={{ color: '#6b7280' }}>Coarse, wide stripes. </Text>
            )}
          </Text>

          <View style={{ alignItems: 'center', gap: 14 }}>
            <SineGrating spatialFreq={sf} contrastPercent={contrastPct} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {CS_SPATIAL_FREQS.map((f, i) => (
                <View key={f} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === contrastSfIndex ? SF_COLORS[i % SF_COLORS.length] : (contrastStaircases[i]?.done ? '#d1d5db' : '#e5e7eb') }} />
              ))}
            </View>
          </View>

          {/* Response buttons */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => handleResponse(false)}
              disabled={answered}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center',
                backgroundColor: pressed ? '#fef2f2' : '#fff',
                borderWidth: 2, borderColor: '#fca5a5',
                opacity: answered ? 0.5 : 1,
              })}
            >
              <Ionicons name="eye-off-outline" size={22} color="#dc2626" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#dc2626', marginTop: 4 }}>Can't see it</Text>
            </Pressable>
            <Pressable
              onPress={() => handleResponse(true)}
              disabled={answered}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center',
                backgroundColor: pressed ? '#f0fdf4' : '#fff',
                borderWidth: 2, borderColor: '#86efac',
                opacity: answered ? 0.5 : 1,
              })}
            >
              <Ionicons name="eye-outline" size={22} color="#16a34a" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#16a34a', marginTop: 4 }}>I see it</Text>
            </Pressable>
          </View>
        </View>

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
