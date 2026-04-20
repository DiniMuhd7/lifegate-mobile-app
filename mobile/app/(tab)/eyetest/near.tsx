/**
 * Near Vision Test
 *
 * Presents paragraphs from large → small. User states whether they can read.
 * Identifies smallest legible size (N-notation / point equivalent).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { NEAR_VISION_LEVELS } from 'services/adaptive-engine';
import { lookupNearVision } from 'services/clinical-standards-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

// Show levels from large → small (reverse array — start easiest)
const LEVELS_ASC = [...NEAR_VISION_LEVELS].reverse(); // 36pt → 4pt

export default function NearVisionTest() {
  const { testStatus, session, recordTestResult, markTestSkipped } = useVisionStore();
  const [levelIdx, setLevelIdx] = useState(0);
  const [smallestRead, setSmallestRead] = useState<number | null>(null);
  const [distanceConfirmed, setDistanceConfirmed] = useState(false);
  const [distanceCountdown, setDistanceCountdown] = useState(3);

  useEffect(() => {
    if (!testStatus || testStatus.near !== 'active') {
      router.replace('/(tab)/eyetest/battery' as never);
    }
  }, []);

  useEffect(() => {
    if (distanceConfirmed || distanceCountdown <= 0) return;
    const timer = setTimeout(() => {
      setDistanceCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [distanceConfirmed, distanceCountdown]);

  const currentLevel = LEVELS_ASC[levelIdx];
  const isLast = levelIdx >= LEVELS_ASC.length - 1;
  const progress = levelIdx / LEVELS_ASC.length;

  const handleCanRead = useCallback(() => {
    setSmallestRead(currentLevel.points);
    if (isLast) { finishTest(currentLevel.points); return; }
    setLevelIdx((i) => i + 1);
  }, [currentLevel, isLast]);

  const handleCannotRead = useCallback(() => {
    // smallestRead is null when user failed even the largest text (N36)
    finishTest(smallestRead ?? 0);
  }, [smallestRead]);

  const finishTest = useCallback((bestPoints: number) => {
    if (bestPoints <= 0) {
      // Cannot read any level — severe near vision impairment
      recordTestResult({
        testId: 'near',
        smallestReadablePoints: 0,
        nNotation: 'N/A',
        jaegerNotation: 'J20+',
        snellenNearEquivalent: 'Unable to read',
        completedAt: Date.now(),
      });
      router.replace('/(tab)/eyetest/battery-results' as never);
      return;
    }
    const level = NEAR_VISION_LEVELS.find((l) => l.points === bestPoints);
    const nv = lookupNearVision(bestPoints);
    recordTestResult({
      testId: 'near',
      smallestReadablePoints: bestPoints,
      nNotation: level?.nNotation ?? 'N/A',
      jaegerNotation: nv.jaeger,
      snellenNearEquivalent: nv.snellenEquivalent,
      completedAt: Date.now(),
    });
    router.replace('/(tab)/eyetest/battery-results' as never);
  }, [recordTestResult]);

  if (!currentLevel) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 }}>
          <Pressable onPress={() => { markTestSkipped('near'); router.replace('/(tab)/eyetest/battery-results' as never); }} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Near Vision</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af' }}>
              {currentLevel.nNotation} · {currentLevel.points} pt
            </Text>
          </View>
        </View>

        <View style={{ height: 3, backgroundColor: '#e5e7eb' }}>
          <View style={{ height: 3, width: `${progress * 100}%`, backgroundColor: '#f59e0b', borderRadius: 2 }} />
        </View>

        {!distanceConfirmed ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 }}>
            <LinearGradient
              colors={['#f0fdfa', '#ecfeff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 18, borderWidth: 1.5, borderColor: '#99f6e4', padding: 18 }}
            >
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: `${TEAL}18`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="phone-portrait-outline" size={28} color={TEAL_DARK} />
                </View>
              </View>
              <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0f172a' }}>Set reading distance to 40 cm</Text>
              <Text style={{ textAlign: 'center', fontSize: 12, color: '#475569', marginTop: 10, lineHeight: 18 }}>
                Hold your phone about 40 cm from your eyes (roughly forearm length), at eye level, with normal room lighting.
              </Text>
              <Text style={{ textAlign: 'center', fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 18 }}>
                Keep this distance throughout the test for clinically meaningful near-vision grading.
              </Text>

              <View style={{ marginTop: 16, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#ccfbf1', padding: 12 }}>
                <Text style={{ textAlign: 'center', fontSize: 12, color: '#0f766e', fontWeight: '700' }}>
                  {distanceCountdown > 0 ? `Confirm button unlocks in ${distanceCountdown}s` : 'Distance ready'}
                </Text>
              </View>

              <Pressable
                onPress={() => setDistanceConfirmed(true)}
                disabled={distanceCountdown > 0}
                style={({ pressed }) => ({
                  marginTop: 14,
                  paddingVertical: 13,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: distanceCountdown > 0 ? '#94a3b8' : (pressed ? TEAL_DARK : TEAL),
                  opacity: distanceCountdown > 0 ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>I am at 40 cm</Text>
              </Pressable>
            </LinearGradient>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 20 }}>
            <Text style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginBottom: 24, lineHeight: 18 }}>
              Keep your phone at approximately <Text style={{ fontWeight: '700', color: '#374151' }}>40 cm</Text>.
              Can you read ALL the text below clearly without squinting?
            </Text>

            {/* Text sample */}
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 22, borderWidth: 1.5, borderColor: '#e5e7eb', marginBottom: 24,
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ backgroundColor: '#f0fdfc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: `${TEAL}30` }}>
                  <Text style={{ fontSize: 11, color: TEAL, fontWeight: '700' }}>{currentLevel.nNotation}</Text>
                </View>
                <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600' }}>{currentLevel.points} pt</Text>
                </View>
              </View>
              <Text style={{ fontSize: currentLevel.fontSize, color: '#111827', lineHeight: currentLevel.fontSize * 1.6, textAlign: 'left' }}>
                {currentLevel.sampleText}
              </Text>
            </View>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={handleCannotRead}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 22, borderRadius: 16, alignItems: 'center', gap: 6,
                  backgroundColor: pressed ? '#fef2f2' : '#fff',
                  borderWidth: 2, borderColor: '#fca5a5',
                })}
              >
                <Ionicons name="close-circle-outline" size={28} color="#dc2626" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#dc2626' }}>Can't read</Text>
              </Pressable>

              <Pressable
                onPress={handleCanRead}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 22, borderRadius: 16, alignItems: 'center', gap: 6,
                  backgroundColor: pressed ? '#f0fdf4' : '#fff',
                  borderWidth: 2, borderColor: '#86efac',
                })}
              >
                <Ionicons name="checkmark-circle-outline" size={28} color="#16a34a" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#16a34a' }}>
                  {isLast ? 'Yes — finish' : 'Yes — next'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
