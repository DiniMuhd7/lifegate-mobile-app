/**
 * Eye Test — Calibration Wizard
 *
 * Step 1 · Device  — detect screen metrics, let user tune PPI via card bar
 * Step 2 · Lighting — ambient lux via LightSensor (or manual override)
 * Step 3 · Distance — slider for viewing distance (cm)
 * Step 4 · Review  — summary then launch the chart
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  Dimensions,
  PanResponder,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { LightSensor } from 'expo-sensors';
import { useVisionStore } from 'stores/vision-store';

import {
  CREDIT_CARD_MM,
  classifyLux,
  estimateScreenWidthMm,
  estimateScreenHeightMm,
} from 'services/calibration-engine';
import type { CalibrationStep } from 'types/vision-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS: CalibrationStep[] = ['device', 'lighting', 'distance', 'review'];
const MIN_DISTANCE_CM = 20;
const MAX_DISTANCE_CM = 100;
const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepIndex(step: CalibrationStep) {
  return STEPS.indexOf(step);
}

function stepTitle(step: CalibrationStep) {
  switch (step) {
    case 'device':   return 'Screen Calibration';
    case 'lighting': return 'Ambient Lighting';
    case 'distance': return 'Viewing Distance';
    case 'review':   return 'Ready to Test';
  }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current }: { current: CalibrationStep }) {
  const idx = stepIndex(current);
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      {STEPS.map((s, i) => (
        <View
          key={s}
          style={{
            width: i === idx ? 20 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i <= idx ? TEAL : '#d1d5db',
          }}
        />
      ))}
    </View>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[
        {
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#e5e7eb',
          padding: 18,
          marginBottom: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Step 1: Device calibration ───────────────────────────────────────────────

function DeviceStep() {
  const {
    deviceCalibration,
    cardBarPx,
    setCardBarPx,
    confirmCardCalibration,
    initCalibration,
  } = useVisionStore();

  useEffect(() => {
    initCalibration();
  }, []);

  const screenW = Dimensions.get('window').width;
  const sliderTrackWidth = screenW - 36 * 2;
  const minPx = 100;
  const maxPx = Math.round(screenW * 0.92);

  // pan responder for the card bar slider
  const barRef = useRef(cardBarPx);
  barRef.current = cardBarPx;

  const panX = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        panX.current = 0;
      },
      onPanResponderMove: (_, gs) => {
        const delta = gs.dx - panX.current;
        panX.current = gs.dx;
        const next = Math.max(minPx, Math.min(maxPx, barRef.current + delta));
        setCardBarPx(next);
      },
    }),
  ).current;

  if (!deviceCalibration) {
    return (
      <Card>
        <Text style={{ color: '#6b7280', textAlign: 'center' }}>
          Measuring screen…
        </Text>
      </Card>
    );
  }

  const widthMm = estimateScreenWidthMm(deviceCalibration).toFixed(0);
  const heightMm = estimateScreenHeightMm(deviceCalibration).toFixed(0);

  // thumb position on track
  const thumbLeft =
    ((cardBarPx - minPx) / (maxPx - minPx)) * sliderTrackWidth;

  return (
    <>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 12 }}>
          Detected Screen Metrics
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Logical size', value: `${deviceCalibration.logicalWidth} × ${deviceCalibration.logicalHeight} px` },
            { label: 'Pixel ratio',  value: `×${deviceCalibration.pixelRatio}` },
            { label: 'Est. PPI',     value: `${deviceCalibration.estimatedPPI}` },
            { label: 'Screen size',  value: `${widthMm} × ${heightMm} mm` },
          ].map(({ label, value }) => (
            <View
              key={label}
              style={{
                flex: 1,
                minWidth: 130,
                backgroundColor: '#f9fafb',
                borderRadius: 10,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{value}</Text>
            </View>
          ))}
        </View>
        {deviceCalibration.isUserCalibrated && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 12,
              backgroundColor: '#f0fdf4',
              borderRadius: 8,
              padding: 8,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600' }}>
              Calibrated by card — {deviceCalibration.estimatedPPI} PPI
            </Text>
          </View>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 4 }}>
          Optional: Card Width Calibration
        </Text>
        <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 18 }}>
          Hold a standard ID card against the screen. Drag the teal
          bar until it matches the <Text style={{ fontWeight: '700' }}>short edge</Text> of the card
          ({CREDIT_CARD_MM.height} mm).
        </Text>

        {/* Credit-card height label */}
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>
            Bar width: {cardBarPx} px ≈{' '}
            {(cardBarPx * deviceCalibration.mmPerLogicalPixel).toFixed(1)} mm
          </Text>
        </View>

        {/* The draggable bar */}
        <View
          style={{
            height: 54,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <View
            {...panResponder.panHandlers}
            style={{
              width: cardBarPx,
              height: 48,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: TEAL,
              backgroundColor: 'rgba(10,173,162,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'center',
            }}
          >
            <Text style={{ fontSize: 11, color: TEAL, fontWeight: '700' }}>
              ← drag to resize →
            </Text>
          </View>
        </View>

        <Pressable
          onPress={confirmCardCalibration}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingHorizontal: 24,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: pressed ? TEAL_DARK : TEAL,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
            Apply Card Calibration
          </Text>
        </Pressable>
      </Card>
    </>
  );
}

// ─── Step 2: Ambient lighting ─────────────────────────────────────────────────

function LightingStep() {
  const {
    lightSensorAvailable,
    currentLux,
    luxCategory,
    setLightSensorAvailable,
    updateLux,
  } = useVisionStore();

  const subRef = useRef<ReturnType<typeof LightSensor.addListener> | null>(null);

  useEffect(() => {
    let mounted = true;

    LightSensor.isAvailableAsync().then((available) => {
      if (!mounted) return;
      setLightSensorAvailable(available);
      if (available) {
        LightSensor.setUpdateInterval(1000);
        subRef.current = LightSensor.addListener(({ illuminance }) => {
          if (mounted) updateLux(illuminance);
        });
      }
    });

    return () => {
      mounted = false;
      subRef.current?.remove();
    };
  }, []);

  const info = currentLux != null ? classifyLux(currentLux) : null;

  return (
    <Card>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 12 }}>
        Ambient Light Reading
      </Text>

      {lightSensorAvailable === false && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            backgroundColor: '#fef3c7',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Ionicons name="warning-outline" size={18} color="#d97706" />
          <Text style={{ flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 }}>
            Light sensor not available on this device. Ensure you're in a
            well-lit room (≥ 100 lux) before proceeding.
          </Text>
        </View>
      )}

      {lightSensorAvailable === true && currentLux == null && (
        <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>
          Waiting for sensor reading…
        </Text>
      )}

      {info && (
        <View
          style={{
            backgroundColor: info.bgColor,
            borderRadius: 12,
            padding: 14,
            marginBottom: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Ionicons
              name={
                info.suitable ? 'sunny' : luxCategory === 'dark' ? 'moon' : 'partly-sunny'
              }
              size={24}
              color={info.color}
            />
            <View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: info.color }}>
                {info.label}
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280' }}>
                {currentLux!.toFixed(0)} lux
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>
            {info.recommendation}
          </Text>
        </View>
      )}

      {lightSensorAvailable !== true && (
        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 8, lineHeight: 18 }}>
          Tip: Perform this test in a normally lit room. Avoid direct sunlight
          on the screen and reduce reflections.
        </Text>
      )}
    </Card>
  );
}

// ─── Step 3: Viewing distance — real-world diagram ───────────────────────────

interface DistanceReference {
  headline: string;
  body: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  cautionColor?: string;
}

function getDistanceReference(cm: number): DistanceReference {
  if (cm <= 24) {
    return {
      headline: 'Very close — shorter than a pencil',
      body: 'This is closer than most people can focus comfortably. Consider moving the phone further away.',
      iconName: 'alert-circle-outline',
      cautionColor: '#f97316',
    };
  }
  if (cm <= 33) {
    return {
      headline: '≈ length of a standard 30 cm ruler',
      body: 'Picture a school ruler placed flat between your phone screen and your eyes — that is how far away to hold it.',
      iconName: 'remove-outline',
    };
  }
  if (cm <= 45) {
    return {
      headline: '≈ your forearm (elbow to wrist)',
      body: 'Rest your elbow on a table and extend your arm toward the screen — your wrist should be roughly where the screen is.',
      iconName: 'body-outline',
    };
  }
  if (cm <= 58) {
    return {
      headline: '≈ elbow to fingertips (forearm + hand)',
      body: 'Fully extend your arm from elbow to open palm. That gap between your fingertips and your face is your target distance.',
      iconName: 'hand-right-outline',
    };
  }
  if (cm <= 72) {
    return {
      headline: '≈ about two-thirds of an arm\'s length',
      body: 'Hold the phone with your arm roughly two-thirds extended — elbow slightly bent.',
      iconName: 'resize-outline',
    };
  }
  return {
    headline: '≈ a full outstretched arm',
    body: 'This is unusually far for a phone. Hold it at a complete arm\'s stretch away from your face.',
    iconName: 'warning-outline',
    cautionColor: '#f97316',
  };
}

function DistanceDiagram({ cm }: { cm: number }) {
  const screenW = Dimensions.get('window').width;
  // Available width: card has 18px padding × 2, outer margins ~20px × 2
  const containerW = screenW - 40 - 36;
  const ICON_D = 40; // icon circle diameter
  const GAP = 10;    // space between icon and line
  const maxLineW = containerW - ICON_D * 2 - GAP * 4;
  const fraction = (cm - MIN_DISTANCE_CM) / (MAX_DISTANCE_CM - MIN_DISTANCE_CM);
  const lineW = Math.round(24 + fraction * (maxLineW - 24));

  const ref = getDistanceReference(cm);
  const accentColor = ref.cautionColor ?? TEAL;

  // Tick mark count along the ruler line — one per ~10 cm, max 8
  const tickCount = Math.min(8, Math.floor(cm / 10));

  return (
    <View style={{ marginTop: 20 }}>
      {/* Section label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          What this looks like
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
      </View>

      {/* Top-view schematic diagram */}
      <View style={{
        backgroundColor: '#f8fafc',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 16,
        alignItems: 'center',
        marginBottom: 12,
        overflow: 'hidden',
      }}>
        {/* Label */}
        <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12, letterSpacing: 0.5 }}>
          TOP VIEW (not to scale)
        </Text>

        {/* Icon row: eye — ruler line — phone */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>

          {/* Eye / face icon */}
          <View style={{
            width: ICON_D, height: ICON_D, borderRadius: ICON_D / 2,
            backgroundColor: '#ecfdf5', borderWidth: 1.5, borderColor: '#6ee7b7',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="eye-outline" size={20} color="#059669" />
          </View>

          {/* Gap + animated ruler line */}
          <View style={{ width: GAP }} />
          <View style={{ width: lineW, alignItems: 'center' }}>
            {/* Ruler ticks above the line */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 4, marginBottom: 2 }}>
              {Array.from({ length: tickCount + 1 }).map((_, i) => (
                <View key={i} style={{ width: 1, height: i === 0 || i === tickCount ? 8 : 5, backgroundColor: '#94a3b8' }} />
              ))}
            </View>
            {/* Main line */}
            <View style={{ width: '100%', height: 2, backgroundColor: accentColor, borderRadius: 1 }} />
            {/* cm label below */}
            <Text style={{ fontSize: 13, fontWeight: '800', color: accentColor, marginTop: 4 }}>
              {cm} cm
            </Text>
          </View>
          <View style={{ width: GAP }} />

          {/* Phone icon */}
          <View style={{
            width: ICON_D, height: ICON_D, borderRadius: 10,
            backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#93c5fd',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="phone-portrait-outline" size={20} color="#2563eb" />
          </View>
        </View>

        {/* Legend labels */}
        <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: '#94a3b8', marginLeft: 2 }}>Your eyes</Text>
          <Text style={{ fontSize: 9, color: '#94a3b8', marginRight: 2 }}>Your phone</Text>
        </View>
      </View>

      {/* Real-world reference card */}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        backgroundColor: ref.cautionColor ? '#fff7ed' : '#f0fdf4',
        borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: ref.cautionColor ? '#fed7aa' : '#bbf7d0',
      }}>
        <View style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: ref.cautionColor ? '#ffedd5' : '#dcfce7',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Ionicons name={ref.iconName} size={18} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b', marginBottom: 3, lineHeight: 18 }}>
            {ref.headline}
          </Text>
          <Text style={{ fontSize: 12, color: '#475569', lineHeight: 17 }}>
            {ref.body}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Step 3: Viewing distance ─────────────────────────────────────────────────

function DistanceStep() {
  const { viewingDistanceCm, setViewingDistance, distanceSource } = useVisionStore();

  const screenW = Dimensions.get('window').width;
  const trackWidth = screenW - 36 * 2 - 48;
  const range = MAX_DISTANCE_CM - MIN_DISTANCE_CM;
  const thumbLeft = ((viewingDistanceCm - MIN_DISTANCE_CM) / range) * trackWidth;

  const panX = useRef(0);
  const distRef = useRef(viewingDistanceCm);
  distRef.current = viewingDistanceCm;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        panX.current = 0;
      },
      onPanResponderMove: (_, gs) => {
        const delta = gs.dx - panX.current;
        panX.current = gs.dx;
        const pxPerCm = trackWidth / range;
        const cmDelta = delta / pxPerCm;
        const next = Math.max(
          MIN_DISTANCE_CM,
          Math.min(MAX_DISTANCE_CM, distRef.current + cmDelta),
        );
        setViewingDistance(Math.round(next), 'manual');
      },
    }),
  ).current;

  const PRESETS = [30, 40, 50, 60];

  return (
    <Card>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 4 }}>
        How far will you hold the phone?
      </Text>
      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 18, lineHeight: 18 }}>
        Typical reading distance is 40 cm (≈ 16 in). Be honest — accuracy
        depends on this value.
      </Text>

      {/* Big distance display */}
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <LinearGradient
          colors={[TEAL, TEAL_DARK]}
          style={{
            width: 110,
            height: 110,
            borderRadius: 55,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff' }}>
            {viewingDistanceCm}
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: -2 }}>
            cm
          </Text>
        </LinearGradient>
        {distanceSource === 'manual' && (
          <Text style={{ fontSize: 11, color: TEAL, marginTop: 8, fontWeight: '600' }}>
            Manually set
          </Text>
        )}
      </View>

      {/* Slider track */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginBottom: 18,
          paddingHorizontal: 6,
        }}
      >
        <Text style={{ fontSize: 11, color: '#9ca3af', width: 28, textAlign: 'right' }}>
          {MIN_DISTANCE_CM}
        </Text>
        <View style={{ flex: 1, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 }}>
          {/* Fill */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: 6,
              width: thumbLeft + 12,
              backgroundColor: TEAL,
              borderRadius: 3,
            }}
          />
          {/* Thumb */}
          <View
            {...panResponder.panHandlers}
            style={{
              position: 'absolute',
              left: thumbLeft,
              top: -9,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: TEAL,
              borderWidth: 3,
              borderColor: '#fff',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.18,
              shadowRadius: 4,
              elevation: 4,
            }}
          />
        </View>
        <Text style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>
          {MAX_DISTANCE_CM}
        </Text>
      </View>

      {/* Preset buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PRESETS.map((cm) => (
          <Pressable
            key={cm}
            onPress={() => setViewingDistance(cm, 'manual')}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor:
                viewingDistanceCm === cm
                  ? TEAL
                  : pressed
                  ? '#f3f4f6'
                  : '#f9fafb',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: viewingDistanceCm === cm ? TEAL : '#e5e7eb',
            })}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: viewingDistanceCm === cm ? '#fff' : '#374151',
              }}
            >
              {cm} cm
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Real-world distance diagram */}
      <DistanceDiagram cm={viewingDistanceCm} />
    </Card>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function ReviewStep() {
  const {
    deviceCalibration,
    currentLux,
    luxCategory,
    lightSensorAvailable,
    viewingDistanceCm,
    distanceSource,
    completeCalibration,
  } = useVisionStore();

  if (!deviceCalibration) return null;

  const luxInfo = currentLux != null ? classifyLux(currentLux) : null;

  const lightIconName: React.ComponentProps<typeof Ionicons>['name'] =
    luxCategory === 'dark'
      ? 'moon'
      : luxCategory === 'dim'
      ? 'cloudy'
      : luxCategory === 'adequate' || luxCategory === 'bright'
      ? 'sunny'
      : 'partly-sunny';

  const summaryRows = [
    {
      icon: 'phone-portrait-outline' as const,
      label: 'Screen PPI',
      value: `${deviceCalibration.estimatedPPI} PPI${deviceCalibration.isUserCalibrated ? ' (card-calibrated)' : ' (estimated)'}`,
      ok: true,
    },
    {
      icon: lightIconName,
      label: 'Lighting',
      value: luxInfo ? `${luxInfo.label} (${currentLux!.toFixed(0)} lux)` : lightSensorAvailable === false ? 'No sensor — manual check' : 'Unknown',
      ok: luxInfo ? luxInfo.suitable : lightSensorAvailable === false,
    },
    {
      icon: 'resize-outline' as const,
      label: 'Viewing distance',
      value: `${viewingDistanceCm} cm${distanceSource === 'manual' ? ' (manual)' : ''}`,
      ok: true,
    },
  ];

  return (
    <>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 12 }}>
          Calibration Summary
        </Text>
        {summaryRows.map(({ icon, label, value, ok }) => (
          <View
            key={label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: '#f3f4f6',
              gap: 12,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: ok ? '#f0fdf4' : '#fef3c7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={icon} size={18} color={ok ? '#16a34a' : '#d97706'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>{label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{value}</Text>
            </View>
            <Ionicons
              name={ok ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={ok ? '#16a34a' : '#d97706'}
            />
          </View>
        ))}
      </Card>

      <Card style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Ionicons name="information-circle-outline" size={20} color="#16a34a" />
          <Text style={{ flex: 1, fontSize: 12, color: '#15803d', lineHeight: 19 }}>
            This is a screening tool, not a medical examination. Results do not
            replace a professional eye examination. If you notice significant
            changes in vision, consult an eye-care professional.
          </Text>
        </View>
      </Card>
    </>
  );
}

// ─── Main wizard screen ───────────────────────────────────────────────────────

export default function EyeTestCalibration() {
  const { calibrationStep, goToStep, completeCalibration } = useVisionStore();

  const idx = stepIndex(calibrationStep);

  const canGoNext = calibrationStep !== 'review';
  const canGoBack = idx > 0;

  const handleNext = useCallback(() => {
    const next = STEPS[idx + 1];
    if (next) goToStep(next);
  }, [idx, goToStep]);

  const handleBack = useCallback(() => {
    const prev = STEPS[idx - 1];
    if (prev) goToStep(prev);
  }, [idx, goToStep]);

  const handleStart = useCallback(() => {
    completeCalibration();
    router.push('/(tab)/eyetest/battery' as never);
  }, [completeCalibration]);

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
            onPress={() => {
              if (canGoBack) {
                handleBack();
              } else {
                router.back();
              }
            }}
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

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
              {stepTitle(calibrationStep)}
            </Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
              Step {idx + 1} of {STEPS.length}
            </Text>
          </View>

          <StepDots current={calibrationStep} />
        </View>

        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: '#e5e7eb', marginHorizontal: 18 }}>
          <View
            style={{
              height: 3,
              width: `${((idx + 1) / STEPS.length) * 100}%`,
              backgroundColor: TEAL,
              borderRadius: 2,
            }}
          />
        </View>

        {/* Content */}
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Step-level intro */}
          <View style={{ marginBottom: 16 }}>
            {calibrationStep === 'device' && (
              <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 21 }}>
                We detect your screen metrics automatically. For best accuracy,
                optionally calibrate using a credit card.
              </Text>
            )}
            {calibrationStep === 'lighting' && (
              <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 21 }}>
                Good lighting reduces eye strain and improves result accuracy.
              </Text>
            )}
            {calibrationStep === 'distance' && (
              <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 21 }}>
                Set how far you'll hold the phone during the test. Letter
                sizes are computed from this distance.
              </Text>
            )}
            {calibrationStep === 'review' && (
              <Text style={{ fontSize: 14, color: '#6b7280', lineHeight: 21 }}>
                Review your settings, then start the vision assessment.
              </Text>
            )}
          </View>

          {calibrationStep === 'device'   && <DeviceStep />}
          {calibrationStep === 'lighting' && <LightingStep />}
          {calibrationStep === 'distance' && <DistanceStep />}
          {calibrationStep === 'review'   && <ReviewStep />}
        </ScrollView>

        {/* Footer buttons */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 8,
            borderTopWidth: 1,
            borderTopColor: '#f3f4f6',
            backgroundColor: '#fff',
          }}
        >
          {calibrationStep === 'review' ? (
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <LinearGradient
                colors={[TEAL, TEAL_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  borderRadius: 14,
                  paddingVertical: 15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Ionicons name="eye-outline" size={20} color="#fff" />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                  Start Vision Test
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNext}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <LinearGradient
                colors={[TEAL, TEAL_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  borderRadius: 14,
                  paddingVertical: 15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                  Continue
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}
