/**
 * Eye Test — Results Screen
 *
 * Receives row results via URL query param `data` (JSON array of RowResult).
 * Displays:
 *  • Visual acuity estimate (best row passed)
 *  • Row-by-row breakdown
 *  • Recommendation banner
 *  • Actions: retake / share / back to dashboard
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';


// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

// Snellen denominator → plain-language label
const ACUITY_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  '20/10':  { label: 'Exceptional',        color: '#0AADA2', bg: '#f0fdfc', icon: 'star' },
  '20/15':  { label: 'Above Average',      color: '#16a34a', bg: '#f0fdf4', icon: 'trending-up' },
  '20/20':  { label: 'Normal',             color: '#16a34a', bg: '#f0fdf4', icon: 'checkmark-circle' },
  '20/25':  { label: 'Near Normal',        color: '#65a30d', bg: '#f7fee7', icon: 'checkmark' },
  '20/30':  { label: 'Mild Reduction',     color: '#d97706', bg: '#fffbeb', icon: 'alert-circle' },
  '20/40':  { label: 'Mild Reduction',     color: '#d97706', bg: '#fffbeb', icon: 'alert-circle' },
  '20/50':  { label: 'Moderate Reduction', color: '#ea580c', bg: '#fff7ed', icon: 'warning' },
  '20/70':  { label: 'Moderate Reduction', color: '#ea580c', bg: '#fff7ed', icon: 'warning' },
  '20/100': { label: 'Significant Loss',   color: '#dc2626', bg: '#fef2f2', icon: 'medical' },
  '20/200': { label: 'Significant Loss',   color: '#dc2626', bg: '#fef2f2', icon: 'medical' },
  none:     { label: 'Could Not Read Any Row', color: '#dc2626', bg: '#fef2f2', icon: 'eye-off' },
};

const ACUITY_ORDER = [
  '20/10', '20/15', '20/20', '20/25', '20/30',
  '20/40', '20/50', '20/70', '20/100', '20/200',
];

interface RowResult {
  acuity: string;
  passed: boolean;
}

function bestAcuity(results: RowResult[]): string {
  const passed = results.filter((r) => r.passed).map((r) => r.acuity);
  for (const a of ACUITY_ORDER) {
    if (passed.includes(a)) return a;
  }
  return 'none';
}

function getRecommendation(acuity: string): string {
  if (acuity === '20/10' || acuity === '20/15') return 'Excellent vision — no action needed.';
  if (acuity === '20/20' || acuity === '20/25') return 'Normal visual acuity. Continue regular eye check-ups.';
  if (acuity === '20/30' || acuity === '20/40') return 'Mild reduction detected. Consider scheduling a professional eye examination.';
  if (acuity === '20/50' || acuity === '20/70') return 'Moderate reduction detected. Schedule a professional eye examination soon.';
  return 'Significant reduction detected. Please consult an eye-care professional promptly.';
}

// ─── Results Screen ───────────────────────────────────────────────────────────

export default function EyeTestResults() {
  const params = useLocalSearchParams<{ data?: string }>();
  const { viewingDistanceCm, deviceCalibration, resetCalibration } = useVisionStore();

  const results = useMemo<RowResult[]>(() => {
    try {
      return params.data ? JSON.parse(decodeURIComponent(params.data)) : [];
    } catch {
      return [];
    }
  }, [params.data]);

  const best = useMemo(() => bestAcuity(results), [results]);
  const info = ACUITY_LABELS[best] ?? ACUITY_LABELS.none;
  const recommendation = getRecommendation(best);

  const handleRetake = () => {
    resetCalibration();
    router.replace('/(tab)/eyetest' as never);
  };

  const handleShare = async () => {
    const lines = results.map((r) => `${r.acuity}: ${r.passed ? '✓ Read' : '✗ Not read'}`);
    const body =
      `LifeGate Eye Test Results\n` +
      `Date: ${new Date().toDateString()}\n` +
      `Distance: ${viewingDistanceCm} cm\n` +
      `Best acuity: ${best === 'none' ? 'Could not read any row' : best} (${info.label})\n\n` +
      lines.join('\n') +
      `\n\nRecommendation: ${recommendation}\n\n` +
      `This is a screening tool only — not a medical examination.`;
    try {
      await Share.share({ message: body });
    } catch {
      // user dismissed
    }
  };

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 18,
            paddingVertical: 12,
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: '#111827' }}>
            Your Results
          </Text>
          <Pressable
            onPress={handleShare}
            hitSlop={10}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="share-outline" size={20} color="#374151" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Acuity hero card */}
          <LinearGradient
            colors={[TEAL, TEAL_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 20,
              padding: 24,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Ionicons name="eye" size={30} color="#fff" />
            </View>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
              Best visual acuity
            </Text>
            <Text style={{ fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: 1 }}>
              {best === 'none' ? '—' : best}
            </Text>
            <View
              style={{
                marginTop: 8,
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                {info.label}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.65)',
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              {viewingDistanceCm} cm distance ·{' '}
              {deviceCalibration?.isUserCalibrated ? 'card-calibrated' : 'auto-detected'} PPI
            </Text>
          </LinearGradient>

          {/* Stats row */}
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {[
              { icon: 'checkmark-circle' as const, label: 'Read',     value: totalPassed, color: '#16a34a', bg: '#f0fdf4' },
              { icon: 'close-circle' as const,    label: 'Not read',  value: totalFailed, color: '#dc2626', bg: '#fef2f2' },
              { icon: 'list' as const,            label: 'Rows total', value: results.length, color: TEAL, bg: '#f0fdfc' },
            ].map(({ icon, label, value, color, bg }) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  backgroundColor: bg,
                  borderRadius: 14,
                  padding: 12,
                  alignItems: 'center',
                }}
              >
                <Ionicons name={icon} size={20} color={color} />
                <Text style={{ fontSize: 20, fontWeight: '800', color, marginTop: 4 }}>
                  {value}
                </Text>
                <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Recommendation */}
          <View
            style={{
              backgroundColor: info.bg,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Ionicons name={info.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={info.color} />
            <Text style={{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 21 }}>
              {recommendation}
            </Text>
          </View>

          {/* Row-by-row breakdown */}
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              marginBottom: 14,
              overflow: 'hidden',
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>
                Row Breakdown
              </Text>
            </View>
            {results.map((r, i) => (
              <View
                key={r.acuity}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: '#f3f4f6',
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', width: 54 }}>
                  {r.acuity}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 6,
                    backgroundColor: '#f3f4f6',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      width: r.passed ? '100%' : '0%',
                      backgroundColor: r.passed ? '#16a34a' : '#f3f4f6',
                      borderRadius: 3,
                    }}
                  />
                </View>
                <Ionicons
                  name={r.passed ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={r.passed ? '#16a34a' : '#dc2626'}
                />
              </View>
            ))}
          </View>

          {/* Disclaimer */}
          <View
            style={{
              backgroundColor: '#f9fafb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 11, color: '#9ca3af', lineHeight: 17, textAlign: 'center' }}>
              This is a screening tool only, not a substitute for a professional
              eye examination. Consult an eye-care professional for a formal assessment.
            </Text>
          </View>

          {/* CTA buttons */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={handleRetake}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: '#d1d5db',
                backgroundColor: pressed ? '#f3f4f6' : '#fff',
                alignItems: 'center',
              })}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>
                Retake Test
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace('/(tab)/health' as never)}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <LinearGradient
                colors={[TEAL, TEAL_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  Back to Dashboard
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>

      </SafeAreaView>
    </View>
  );
}
