/**
 * Battery Selector Screen
 * User picks which sub-tests to run, sees estimated time, then starts.
 */
import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { BATTERY_META } from 'services/adaptive-engine';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import type { BatteryTestId } from 'types/vision-types';

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

const ALL_TEST_IDS: BatteryTestId[] = ['acuity', 'color', 'astigmatism', 'contrast', 'near'];

export default function BatterySelector() {
  const { selectedTests, setSelectedTests, startBattery, isCalibrationComplete } = useVisionStore();

  const toggle = useCallback((id: BatteryTestId) => {
    const next = selectedTests.includes(id)
      ? selectedTests.filter((t) => t !== id)
      : [...selectedTests, id];
    // Always keep the canonical order so the first test is predictable
    setSelectedTests(ALL_TEST_IDS.filter((t) => next.includes(t)));
  }, [selectedTests, setSelectedTests]);

  const totalSec = BATTERY_META
    .filter((m) => selectedTests.includes(m.id))
    .reduce((s, m) => s + m.estimatedSec, 0);
  const totalMin = Math.ceil(totalSec / 60);

  const SCREEN_MAP: Record<BatteryTestId, string> = {
    acuity:      '/(tab)/eyetest/acuity',
    color:       '/(tab)/eyetest/color',
    astigmatism: '/(tab)/eyetest/astigmatism',
    contrast:    '/(tab)/eyetest/contrast',
    near:        '/(tab)/eyetest/near',
  };

  const handleStart = useCallback(() => {
    if (selectedTests.length === 0) return;
    startBattery();
    router.push(SCREEN_MAP[selectedTests[0]] as never);
  }, [selectedTests, startBattery]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}
          >
            <Ionicons name="arrow-back" size={20} color="#374151" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Vision Battery</Text>
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>Select tests to include</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {/* Summary chip */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            <View style={{ flex: 1, backgroundColor: '#f0fdfc', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: TEAL }}>{selectedTests.length}</Text>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>tests selected</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#3b82f6' }}>~{totalMin}m</Text>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>estimated time</Text>
            </View>
          </View>

          {/* Test cards */}
          {BATTERY_META.map((meta) => {
            const selected = selectedTests.includes(meta.id);
            return (
              <Pressable
                key={meta.id}
                onPress={() => toggle(meta.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: selected ? '#f0fdfc' : '#fff',
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: selected ? TEAL : '#e5e7eb',
                  padding: 14,
                  marginBottom: 10,
                  gap: 14,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: selected ? TEAL : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={meta.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={selected ? '#fff' : '#9ca3af'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{meta.label}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{meta.description}</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>~{meta.estimatedSec}s</Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? TEAL : '#d1d5db'}
                />
              </Pressable>
            );
          })}

          {!isCalibrationComplete && (
            <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginTop: 4, flexDirection: 'row', gap: 10 }}>
              <Ionicons name="warning-outline" size={18} color="#d97706" />
              <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 }}>
                Device not calibrated. Tests will use estimated screen metrics.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Start button */}
        <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' }}>
          <Pressable
            onPress={handleStart}
            disabled={selectedTests.length === 0}
            style={({ pressed }) => ({ opacity: pressed || selectedTests.length === 0 ? 0.7 : 1 })}
          >
            <LinearGradient
              colors={[TEAL, TEAL_DARK]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Ionicons name="play-circle-outline" size={20} color="#fff" />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                Start {selectedTests.length} Test{selectedTests.length !== 1 ? 's' : ''}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
