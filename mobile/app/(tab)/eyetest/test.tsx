/**
 * Eye Test — Snellen Chart Screen
 *
 * Displays a calibrated Snellen chart where each row's letter height is
 * computed from the device calibration + viewing distance.
 *
 * Flow:
 *  • Rows shown top to bottom (20/200 → 20/10)
 *  • User taps "Can read" / "Cannot read" for each row
 *  • After evaluating all displayable rows → navigate to results
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { computeSnellenRows } from 'services/calibration-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import type { SnellenRowSpec } from 'types/vision-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

/** Standard Snellen optotype letters (exclude I, O to reduce confusion) */
const OPTOTYPES = ['E', 'F', 'P', 'T', 'O', 'Z', 'L', 'P', 'E', 'D'];

/** Map acuity → a consistent set of 5 letters shown on that row */
const ROW_LETTERS: Record<string, string[]> = {
  '20/200': ['E'],
  '20/100': ['F', 'P'],
  '20/70':  ['T', 'O', 'Z'],
  '20/50':  ['L', 'P', 'E', 'D'],
  '20/40':  ['P', 'E', 'C', 'F', 'D'],
  '20/30':  ['E', 'D', 'F', 'C', 'Z'],
  '20/25':  ['F', 'E', 'L', 'O', 'P'],
  '20/20':  ['D', 'E', 'F', 'P', 'O'],
  '20/15':  ['L', 'E', 'F', 'O', 'D'],
  '20/10':  ['F', 'P', 'Z', 'D', 'L'],
};

// ─── Test result type ─────────────────────────────────────────────────────────

interface RowResult {
  acuity: string;
  passed: boolean;
}

// ─── Single chart row ─────────────────────────────────────────────────────────

interface ChartRowProps {
  row: SnellenRowSpec;
  state: 'pending' | 'current' | 'passed' | 'failed';
  onPass: () => void;
  onFail: () => void;
}

function ChartRow({ row, state, onPass, onFail }: ChartRowProps) {
  const letters = ROW_LETTERS[row.acuity] ?? ['E'];
  const isCurrent = state === 'current';

  if (!row.isDisplayable && state === 'current') {
    // Should not happen since we filter, but safety fallback
    return null;
  }

  const letterColor =
    state === 'passed'
      ? '#16a34a'
      : state === 'failed'
      ? '#dc2626'
      : state === 'pending'
      ? '#d1d5db'
      : '#111827';

  return (
    <View
      style={{
        alignItems: 'center',
        marginBottom: isCurrent ? 24 : 10,
        opacity: state === 'pending' ? 0.45 : 1,
        paddingHorizontal: 12,
      }}
    >
      {/* Acuity label */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 4,
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            color: isCurrent ? TEAL : '#9ca3af',
            letterSpacing: 0.5,
          }}
        >
          {row.acuity}
        </Text>
        {(state === 'passed' || state === 'failed') && (
          <Ionicons
            name={state === 'passed' ? 'checkmark-circle' : 'close-circle'}
            size={13}
            color={state === 'passed' ? '#16a34a' : '#dc2626'}
          />
        )}
      </View>

      {/* Optotype letters */}
      <View style={{ flexDirection: 'row', gap: row.letterHeightPx * 0.2, alignItems: 'center' }}>
        {letters.map((letter, i) => (
          <Text
            key={`${row.acuity}-${i}`}
            style={{
              fontSize: row.letterHeightPx,
              lineHeight: row.letterHeightPx * 1.15,
              fontWeight: '900',
              color: letterColor,
              // use a monospace / fixed-width feel; system sans otherwise
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
            }}
          >
            {letter}
          </Text>
        ))}
      </View>

      {/* Current row action buttons */}
      {isCurrent && (
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginTop: 14,
          }}
        >
          <Pressable
            onPress={onFail}
            style={({ pressed }) => ({
              flex: 1,
              maxWidth: 140,
              paddingVertical: 11,
              borderRadius: 12,
              backgroundColor: pressed ? '#fef2f2' : '#fff',
              borderWidth: 1.5,
              borderColor: '#fca5a5',
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            })}
          >
            <Ionicons name="close" size={16} color="#dc2626" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>
              Can't read
            </Text>
          </Pressable>

          <Pressable
            onPress={onPass}
            style={({ pressed }) => ({
              flex: 1,
              maxWidth: 140,
              paddingVertical: 11,
              borderRadius: 12,
              backgroundColor: pressed ? '#f0fdf4' : '#fff',
              borderWidth: 1.5,
              borderColor: '#86efac',
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 6,
            })}
          >
            <Ionicons name="checkmark" size={16} color="#16a34a" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#16a34a' }}>
              Can read
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Main test screen ─────────────────────────────────────────────────────────

export default function EyeTestScreen() {
  const { deviceCalibration, viewingDistanceCm, isCalibrationComplete, resetCalibration } =
    useVisionStore();

  const scrollRef = useRef<ScrollView>(null);

  // Guard: require calibration first
  useEffect(() => {
    if (!isCalibrationComplete) {
      router.replace('/(tab)/eyetest' as never);
    }
  }, [isCalibrationComplete]);

  const displayableRows = useMemo<SnellenRowSpec[]>(() => {
    if (!deviceCalibration) return [];
    return computeSnellenRows(viewingDistanceCm, deviceCalibration).filter(
      (r) => r.isDisplayable,
    );
  }, [deviceCalibration, viewingDistanceCm]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<RowResult[]>([]);

  const isComplete = currentIdx >= displayableRows.length;

  const handleResponse = useCallback(
    (passed: boolean) => {
      const row = displayableRows[currentIdx];
      if (!row) return;
      setResults((prev) => [...prev, { acuity: row.acuity, passed }]);
      setCurrentIdx((i) => i + 1);
      // scroll down slightly so the next row is visible
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: currentIdx * 80, animated: true });
      }, 80);
    },
    [currentIdx, displayableRows],
  );

  const handleRestartTest = useCallback(() => {
    setCurrentIdx(0);
    setResults([]);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const handleFinish = useCallback(() => {
    // Store results in a serialisable form via router params for the results screen
    const encoded = encodeURIComponent(JSON.stringify(results));
    router.push(`/(tab)/eyetest/results?data=${encoded}` as never);
  }, [results]);

  const getRowState = useCallback(
    (idx: number): 'pending' | 'current' | 'passed' | 'failed' => {
      if (idx < results.length) {
        return results[idx].passed ? 'passed' : 'failed';
      }
      if (idx === currentIdx) return 'current';
      return 'pending';
    },
    [results, currentIdx],
  );

  if (!deviceCalibration || displayableRows.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280' }}>Loading calibration…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#f3f4f6',
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
            <Ionicons name="arrow-back" size={20} color="#374151" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#111827' }}>
              Vision Chart
            </Text>
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>
              {viewingDistanceCm} cm · {displayableRows.length} rows
            </Text>
          </View>

          {/* Row progress chip */}
          {!isComplete && (
            <View
              style={{
                backgroundColor: '#f0fdf4',
                borderRadius: 16,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: TEAL }}>
                {currentIdx + 1}/{displayableRows.length}
              </Text>
            </View>
          )}
        </View>

        {/* Chart */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingTop: 24,
            paddingBottom: 32,
            alignItems: 'center',
          }}
          showsVerticalScrollIndicator={false}
        >
          {isComplete ? (
            /* ── Completion card ── */
            <View style={{ width: '100%', paddingHorizontal: 24, alignItems: 'center' }}>
              <LinearGradient
                colors={[TEAL, TEAL_DARK]}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Ionicons name="checkmark-done" size={38} color="#fff" />
              </LinearGradient>
              <Text
                style={{ fontSize: 22, fontWeight: '900', color: '#111827', textAlign: 'center' }}
              >
                Chart Complete
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: '#6b7280',
                  textAlign: 'center',
                  marginTop: 8,
                  lineHeight: 22,
                }}
              >
                You responded to all {displayableRows.length} rows. View your
                results or redo the chart.
              </Text>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 28, width: '100%' }}>
                <Pressable
                  onPress={handleRestartTest}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: 12,
                    backgroundColor: pressed ? '#f3f4f6' : '#fff',
                    borderWidth: 1.5,
                    borderColor: '#d1d5db',
                    alignItems: 'center',
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>
                    Redo Chart
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleFinish}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.88 : 1 })}
                >
                  <LinearGradient
                    colors={[TEAL, TEAL_DARK]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      borderRadius: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                      See Results
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>

              {/* Mini result summary */}
              <View
                style={{
                  marginTop: 28,
                  width: '100%',
                  backgroundColor: '#f9fafb',
                  borderRadius: 14,
                  padding: 14,
                  gap: 6,
                }}
              >
                {results.map((r) => (
                  <View
                    key={r.acuity}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name={r.passed ? 'checkmark-circle' : 'close-circle'}
                      size={16}
                      color={r.passed ? '#16a34a' : '#dc2626'}
                    />
                    <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>
                      {r.acuity}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: r.passed ? '#16a34a' : '#dc2626',
                        marginLeft: 'auto',
                      }}
                    >
                      {r.passed ? 'Read' : 'Not read'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            displayableRows.map((row, idx) => (
              <ChartRow
                key={row.acuity}
                row={row}
                state={getRowState(idx)}
                onPass={() => handleResponse(true)}
                onFail={() => handleResponse(false)}
              />
            ))
          )}
        </ScrollView>

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
