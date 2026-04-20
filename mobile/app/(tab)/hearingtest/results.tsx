/**
 * Hearing Test Results Screen
 *
 * Displays a full audiogram (right + left ear), WHO classification badges,
 * PTA3 averages, audiogram shape labels, and clinical recommendations.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useHearingStore } from 'stores/hearing-store';
import { estimateThreshold, AUDIOGRAM_SHAPE_LABELS, AUDIOGRAM_SHAPE_ICON } from 'services/pta-engine';
import { SIN_GRADE_COLOR, SIN_GRADE_ICON } from 'services/speech-in-noise-engine';
import { HF_PATTERN_LABEL, HF_PATTERN_COLOR, HF_PATTERN_ICON } from 'services/hf-audiometry-engine';
import {
  RELIABILITY_GRADE_COLOR,
  RELIABILITY_GRADE_LABEL,
  RELIABILITY_GRADE_DESCRIPTION,
  FLAG_TYPE_ICON,
} from 'services/behavioral-analysis-engine';
import { generateAIHearingInterpretation } from 'services/hearing-ai-engine';
import type { AIHearingInterpretation } from 'services/hearing-ai-engine';
import { interpretHearing } from 'services/sensor-interpretation-service';
import type { SensorInterpretResponse } from 'services/sensor-interpretation-service';
import { openHearingPDF } from 'services/hearing-pdf';
import { useAuthStore } from 'stores/auth-store';
import type { PTAFrequency, TestEar, WHOGrade, SINResult, HFResult, BehavioralReport } from 'types/hearing-types';
import { PTA_FREQUENCIES, HF_FREQUENCIES } from 'types/hearing-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const TEAL = '#0AADA2';
const TEAL_D = '#0f766e';

const CHART_MARGIN_LEFT = 40; // space for dBHL labels
const CHART_MARGIN_BOTTOM = 28; // space for frequency labels
const CHART_W = SCREEN_W - 48 - CHART_MARGIN_LEFT;
const CHART_H = 220;
const DBHL_MIN = -10;
const DBHL_MAX = 90;
const DB_RANGE = DBHL_MAX - DBHL_MIN;
const DB_GRIDLINES = [-10, 0, 10, 20, 25, 30, 40, 50, 60, 70, 80, 90];

const RIGHT_COLOR = '#ef4444';
const LEFT_COLOR  = '#3b82f6';

// ─── WHO Grade UI ─────────────────────────────────────────────────────────────

const WHO_BADGE_COLOR: Record<WHOGrade, string> = {
  0: '#16a34a',
  1: '#65a30d',
  2: '#d97706',
  3: '#ea580c',
  4: '#dc2626',
};

const WHO_GRADE_LABEL: Record<WHOGrade, string> = {
  0: 'Normal',
  1: 'Slight Loss',
  2: 'Moderate Loss',
  3: 'Moderately Severe',
  4: 'Severe / Profound',
};

// ─── Audiogram chart ──────────────────────────────────────────────────────────

interface ThresholdPoint {
  frequency: PTAFrequency;
  dbHL: number;
}

function yFor(dbHL: number): number {
  return ((dbHL - DBHL_MIN) / DB_RANGE) * CHART_H;
}

function xFor(freq: PTAFrequency): number {
  const idx = PTA_FREQUENCIES.indexOf(freq);
  return (idx / (PTA_FREQUENCIES.length - 1)) * CHART_W;
}

function freqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

/** Human-readable frequency label for chips: "250 Hz", "1 kHz", etc. */
function chipFreqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

function AudiogramChart({
  right,
  left,
}: {
  right: ThresholdPoint[];
  left: ThresholdPoint[];
}) {
  return (
    <View style={{ marginLeft: CHART_MARGIN_LEFT, marginBottom: CHART_MARGIN_BOTTOM }}>
      <View style={{ width: CHART_W, height: CHART_H, position: 'relative' }}>

        {/* Normal hearing zone (≤25 dBHL) — green shaded */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: yFor(25),
            backgroundColor: '#f0fdf4',
          }}
        />

        {/* Grid lines */}
        {DB_GRIDLINES.map((db) => (
          <React.Fragment key={db}>
            <View
              style={{
                position: 'absolute',
                left: 0, right: 0,
                top: yFor(db),
                height: db === 25 ? 2 : 1,
                backgroundColor: db === 25 ? '#86efac' : db === 0 ? '#d1d5db' : '#f3f4f6',
              }}
            />
            {/* dBHL label */}
            <Text
              style={{
                position: 'absolute',
                left: -CHART_MARGIN_LEFT,
                top: yFor(db) - 8,
                width: CHART_MARGIN_LEFT - 4,
                fontSize: 9,
                color: db === 25 ? '#16a34a' : '#9ca3af',
                textAlign: 'right',
              }}
            >
              {db}
            </Text>
          </React.Fragment>
        ))}

        {/* Frequency vertical guides */}
        {PTA_FREQUENCIES.map((f) => (
          <View
            key={f}
            style={{
              position: 'absolute',
              left: xFor(f),
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: '#f3f4f6',
            }}
          />
        ))}

        {/* Right ear connecting lines */}
        {right.slice(1).map((t, i) => {
          const prev = right[i];
          const x1 = xFor(prev.frequency), y1 = yFor(prev.dbHL);
          const x2 = xFor(t.frequency),    y2 = yFor(t.dbHL);
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={`r-line-${t.frequency}`}
              style={{
                position: 'absolute',
                left: x1, top: y1,
                width: len, height: 2,
                backgroundColor: RIGHT_COLOR,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 1px',
                opacity: 0.7,
              } as any}
            />
          );
        })}

        {/* Left ear connecting lines */}
        {left.slice(1).map((t, i) => {
          const prev = left[i];
          const x1 = xFor(prev.frequency), y1 = yFor(prev.dbHL);
          const x2 = xFor(t.frequency),    y2 = yFor(t.dbHL);
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={`l-line-${t.frequency}`}
              style={{
                position: 'absolute',
                left: x1, top: y1,
                width: len, height: 2,
                backgroundColor: LEFT_COLOR,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 1px',
                opacity: 0.7,
              } as any}
            />
          );
        })}

        {/* Right ear symbols (○ circle) */}
        {right.map((t) => (
          <View
            key={`r-${t.frequency}`}
            style={{
              position: 'absolute',
              left: xFor(t.frequency) - 10,
              top: yFor(t.dbHL) - 10,
              width: 20, height: 20,
              borderRadius: 10,
              borderWidth: 2.5,
              borderColor: RIGHT_COLOR,
              backgroundColor: '#fff',
            }}
          />
        ))}

        {/* Left ear symbols (✕ cross) */}
        {left.map((t) => (
          <View
            key={`l-${t.frequency}`}
            style={{
              position: 'absolute',
              left: xFor(t.frequency) - 10,
              top: yFor(t.dbHL) - 10,
              width: 20, height: 20,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <View style={{ position: 'absolute', width: 18, height: 2.5, backgroundColor: LEFT_COLOR, transform: [{ rotate: '45deg' }] }} />
            <View style={{ position: 'absolute', width: 18, height: 2.5, backgroundColor: LEFT_COLOR, transform: [{ rotate: '-45deg' }] }} />
          </View>
        ))}

        {/* Frequency labels at bottom */}
        {PTA_FREQUENCIES.map((f) => (
          <Text
            key={`lbl-${f}`}
            style={{
              position: 'absolute',
              left: xFor(f) - 14,
              top: CHART_H + 4,
              fontSize: 9,
              color: '#6b7280',
              width: 28,
              textAlign: 'center',
            }}
          >
            {freqLabel(f)}
          </Text>
        ))}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 20, marginTop: CHART_MARGIN_BOTTOM + 4, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: RIGHT_COLOR, backgroundColor: '#fff' }} />
          <Text style={{ fontSize: 11, color: '#6b7280' }}>Right (○)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: 14, height: 2.5, backgroundColor: LEFT_COLOR, transform: [{ rotate: '45deg' }] }} />
            <View style={{ position: 'absolute', width: 14, height: 2.5, backgroundColor: LEFT_COLOR, transform: [{ rotate: '-45deg' }] }} />
          </View>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>Left (×)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 16, height: 10, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' }} />
          <Text style={{ fontSize: 11, color: '#6b7280' }}>Normal zone</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Ear result card ──────────────────────────────────────────────────────────

function EarCard({
  ear,
  thresholds,
  who,
  shape,
}: {
  ear: TestEar;
  thresholds: ThresholdPoint[];
  who: import('types/hearing-types').WHOClassification | null;
  shape: import('types/hearing-types').AudiogramShape | null;
}) {
  const color = ear === 'right' ? RIGHT_COLOR : LEFT_COLOR;
  const label = ear === 'right' ? 'Right Ear' : 'Left Ear';
  const symbol = ear === 'right' ? '○' : '×';

  if (!who) {
    return (
      <View style={{ backgroundColor: '#f9fafb', borderRadius: 16, padding: 16, opacity: 0.5, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>{label} — not tested</Text>
      </View>
    );
  }

  const badgeColor = WHO_BADGE_COLOR[who.grade];

  return (
    <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#f3f4f6', marginBottom: 12, gap: 10 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color }}>{symbol}</Text>
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: '#111827' }}>{label}</Text>
        <View style={{ backgroundColor: `${badgeColor}20`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: badgeColor }}>Grade {who.grade}</Text>
        </View>
      </View>

      {/* WHO classification */}
      <View style={{ backgroundColor: `${badgeColor}10`, borderRadius: 10, padding: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: badgeColor }}>{who.label}</Text>
        <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{who.description}</Text>
      </View>

      {/* PTA3 + shape */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>{who.pureTonaAverage.toFixed(0)}</Text>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>PTA3 dBHL</Text>
        </View>
        {shape && (
          <View style={{ flex: 1.5, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>{AUDIOGRAM_SHAPE_ICON[shape]}</Text>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{AUDIOGRAM_SHAPE_LABELS[shape]}</Text>
              <Text style={{ fontSize: 10, color: '#6b7280' }}>Shape</Text>
            </View>
          </View>
        )}
      </View>

      {/* Threshold table */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 2 }}>Threshold by frequency</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {thresholds.map((t) => (
            <View
              key={t.frequency}
              style={{
                backgroundColor: t.dbHL <= 25 ? '#f0fdf4' : t.dbHL <= 40 ? '#fefce8' : '#fff7ed',
                borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 4,
                alignItems: 'center',
                minWidth: 54,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>{t.dbHL} dBHL</Text>
              <Text style={{ fontSize: 9, color: '#9ca3af' }}>{chipFreqLabel(t.frequency)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recommendation */}
      {who.recommendation && (
        <View style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={16} color="#3b82f6" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: '#1e40af', lineHeight: 18 }}>{who.recommendation}</Text>
        </View>
      )}
    </View>
  );
}
// ─── Reliability panel ────────────────────────────────────────────────────────

function ReliabilityPanel({ report, ear }: { report: BehavioralReport; ear: TestEar }) {
  const [expanded, setExpanded] = React.useState(false);
  const gradeColor = RELIABILITY_GRADE_COLOR[report.reliabilityGrade];
  const gradeLabel = RELIABILITY_GRADE_LABEL[report.reliabilityGrade];
  const earLabel   = ear === 'right' ? 'Right' : 'Left';

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#f3f4f6', marginBottom: 10, overflow: 'hidden' }}>
      {/* Header row — always visible */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}
      >
        {/* Score ring */}
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          borderWidth: 3, borderColor: gradeColor,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: `${gradeColor}12`,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: gradeColor }}>
            {report.reliabilityScore}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827' }}>
            {earLabel} Ear — Reliability
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${gradeColor}20`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: gradeColor }}>{gradeLabel}</Text>
            </View>
            {report.flags.filter(f => f.severity === 'warning').length > 0 && (
              <Text style={{ fontSize: 11, color: '#d97706' }}>
                ⚠️ {report.flags.filter(f => f.severity === 'warning').length} warning{report.flags.filter(f => f.severity === 'warning').length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#9ca3af"
        />
      </Pressable>

      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>

          {/* Grade description */}
          <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18 }}>
            {RELIABILITY_GRADE_DESCRIPTION[report.reliabilityGrade]}
          </Text>

          {/* Key metrics row */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#111827' }}>
                {report.globalMeanReactionMs > 0 ? `${report.globalMeanReactionMs}` : '—'}
              </Text>
              <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'center' }}>Avg RT (ms)</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{
                fontSize: 15, fontWeight: '900',
                color: report.globalReactionCV > 0.5 ? '#d97706' : '#111827',
              }}>
                {report.globalReactionCV > 0 ? report.globalReactionCV.toFixed(2) : '—'}
              </Text>
              <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'center' }}>RT Variability (CV)</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{
                fontSize: 15, fontWeight: '900',
                color: report.spuriousFastRate > 0.1 ? '#d97706' : '#111827',
              }}>
                {Math.round(report.spuriousFastRate * 100)}%
              </Text>
              <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'center' }}>Fast Responses</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{
                fontSize: 15, fontWeight: '900',
                color: report.suprathresholdMissRate > 0.1 ? '#d97706' : '#111827',
              }}>
                {Math.round(report.suprathresholdMissRate * 100)}%
              </Text>
              <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'center' }}>Missed Tones</Text>
            </View>
          </View>

          {/* Per-frequency convergence table */}
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 2 }}>Convergence by frequency</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {report.frequencyMetrics.map((fm) => {
                const confColor =
                  fm.confidence === 'high'   ? '#16a34a' :
                  fm.confidence === 'medium' ? '#d97706' :
                  '#dc2626';
                return (
                  <View
                    key={fm.frequency}
                    style={{
                      backgroundColor: `${confColor}12`,
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      alignItems: 'center',
                      minWidth: 52,
                      borderWidth: 1,
                      borderColor: `${confColor}30`,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '800', color: confColor }}>
                      {fm.frequency >= 1000 ? `${fm.frequency / 1000}k` : fm.frequency}
                    </Text>
                    <Text style={{ fontSize: 9, color: confColor, marginTop: 1 }}>
                      {fm.ascendingReversalCount}/3 rev
                    </Text>
                    {fm.spreadDB > 0 && (
                      <Text style={{ fontSize: 8, color: '#9ca3af' }}>±{fm.spreadDB} dB</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Flags */}
          {report.flags.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280' }}>Observations</Text>
              {report.flags.map((flag, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: flag.severity === 'warning' ? '#fffbeb' : '#f8fafc',
                    borderRadius: 10,
                    padding: 10,
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{FLAG_TYPE_ICON[flag.type]}</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: flag.severity === 'warning' ? '#92400e' : '#374151', lineHeight: 18 }}>
                    {flag.description}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {report.flags.length === 0 && (
            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#16a34a" />
              <Text style={{ fontSize: 12, color: '#166534' }}>No reliability concerns detected.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
// ─── SIN result card ──────────────────────────────────────────────────────────

function SINResultCard({ result }: { result: SINResult }) {
  const gradeColor = SIN_GRADE_COLOR[result.grade];
  const gradeIcon  = SIN_GRADE_ICON[result.grade];
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#f3f4f6', marginBottom: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 22 }}>{gradeIcon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Speech-in-Noise</Text>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>QuickSIN-inspired protocol</Text>
        </View>
        <View style={{ backgroundColor: `${gradeColor}20`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: gradeColor }}>{result.grade.toUpperCase()}</Text>
        </View>
      </View>

      <View style={{ backgroundColor: `${gradeColor}10`, borderRadius: 10, padding: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: gradeColor }}>{result.label}</Text>
        <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{result.recommendation}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>{result.snr50.toFixed(1)}</Text>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>SNR₅₀ (dBSNR)</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: result.snrLoss > 7 ? '#ea580c' : '#111827' }}>
            {result.snrLoss.toFixed(1)}
          </Text>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>SNR Loss (dB)</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>{result.trials.length}</Text>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>Levels tested</Text>
        </View>
      </View>

      {/* Limitation note — tones ≠ sentences */}
      <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fde68a', flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text style={{ fontSize: 14 }}>ℹ️</Text>
        <Text style={{ fontSize: 11, color: '#92400e', flex: 1, lineHeight: 16 }}>
          <Text style={{ fontWeight: '700' }}>Note: </Text>
          This test uses tones in noise. Clinical QuickSIN uses sentence lists, which also measures phoneme discrimination. A tone-based result may underestimate real-world speech-in-noise difficulty. A formal audiologist assessment is recommended if any noise-related difficulty is experienced.
        </Text>
      </View>
    </View>
  );
}

// ─── HF result card ───────────────────────────────────────────────────────────

function HFResultCard({ result }: { result: HFResult }) {
  const patColor = HF_PATTERN_COLOR[result.pattern];
  const patIcon  = HF_PATTERN_ICON[result.pattern];
  const BAR_MAX_H = 60;
  const DBHL_MAX  = 80;

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#f3f4f6', marginBottom: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 22 }}>{patIcon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>High-Frequency Test</Text>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>9 – 12 kHz extended range</Text>
        </View>
        {result.nihlRiskFlag && (
          <View style={{ backgroundColor: '#fee2e2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>⚠️ NIHL</Text>
          </View>
        )}
      </View>

      <View style={{ backgroundColor: `${patColor}10`, borderRadius: 10, padding: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: patColor }}>
          {HF_PATTERN_LABEL[result.pattern]}
        </Text>
        <Text style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
          HF Average: {result.hfAverage} dBHL
        </Text>
      </View>

      {/* Mini bar chart */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingVertical: 4 }}>
        {result.thresholds.map((t) => {
          const barH = Math.max(6, (t.dbHL / DBHL_MAX) * BAR_MAX_H);
          const barColor = t.dbHL <= 25 ? '#16a34a' : t.dbHL <= 40 ? '#d97706' : '#dc2626';
          return (
            <View key={t.frequency} style={{ alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: barColor }}>{t.dbHL} dB</Text>
              <View style={{ width: 36, height: barH, backgroundColor: barColor, borderRadius: 4, opacity: 0.8 }} />
              <Text style={{ fontSize: 9, color: '#9ca3af' }}>
                {t.frequency >= 1000 ? `${t.frequency / 1000}k` : `${t.frequency}`} Hz
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Extended tests section ───────────────────────────────────────────────────

function ExtendedTestsSection({
  sinResult,
  hfResult,
}: {
  sinResult: SINResult | null;
  hfResult: HFResult | null;
}) {
  const allDone = sinResult !== null && hfResult !== null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 10 }}>
        Extended Tests
      </Text>

      {/* SIN */}
      {sinResult ? (
        <SINResultCard result={sinResult} />
      ) : (
        <Pressable
          onPress={() => router.push('/(tab)/hearingtest/sin' as never)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#f3f4f6' : '#fff',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            borderStyle: 'dashed',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
          })}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="ear-outline" size={24} color="#0AADA2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>Speech-in-Noise Test</Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Detect noise tolerance · 6 SNR levels</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </Pressable>
      )}

      {/* HF */}
      {hfResult ? (
        <HFResultCard result={hfResult} />
      ) : (
        <Pressable
          onPress={() => router.push('/(tab)/hearingtest/hf' as never)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#f3f4f6' : '#fff',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            borderStyle: 'dashed',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          })}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fffbeb', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="stats-chart-outline" size={24} color="#f59e0b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>High-Frequency Test</Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Early NIHL detection · 9–12 kHz</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </Pressable>
      )}

      {allDone && (
        <View style={{ marginTop: 8, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#16a34a" />
          <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>All extended tests complete!</Text>
        </View>
      )}
    </View>
  );
}

// ─── AI Interpretation Panel ──────────────────────────────────────────────────

const AI_CONF_COLOR: Record<AIHearingInterpretation['confidenceGrade'], string> = {
  high:     '#16a34a',
  moderate: '#d97706',
  low:      '#dc2626',
};

const AI_REMARK_ICON_COLOR: Record<string, string> = {
  finding:    '#0AADA2',
  suggestion: '#7c3aed',
  warning:    '#d97706',
  info:       '#6b7280',
};

const AI_REMARK_BG: Record<string, string> = {
  finding:    '#f0fdfc',
  suggestion: '#f5f3ff',
  warning:    '#fffbeb',
  info:       '#f9fafb',
};

const PATTERN_COLOR: Record<AIHearingInterpretation['pattern']['dominant'], string> = {
  normal:         '#16a34a',
  noise_induced:  '#dc2626',
  presbycusis:    '#7c3aed',
  sloping_hf:     '#d97706',
  flat:           '#6b7280',
  rising:         '#3b82f6',
  cookie_bite:    '#ea580c',
  mixed:          '#92400e',
  irregular:      '#9ca3af',
};

const SYMMETRY_ICON: Record<AIHearingInterpretation['symmetry'], string> = {
  symmetric:      'checkmark-circle-outline',
  asymmetric:     'git-compare-outline',
  unilateral:     'remove-circle-outline',
  cannot_assess:  'help-circle-outline',
};

function AIConfidenceBar({
  score,
  grade,
}: {
  score: number;
  grade: AIHearingInterpretation['confidenceGrade'];
}) {
  const color = AI_CONF_COLOR[grade];
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Confidence
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color }}>
          {score}% · {grade.charAt(0).toUpperCase() + grade.slice(1)}
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${score}%` as any, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
}

function AIEarRow({
  insight,
}: {
  insight: AIHearingInterpretation['earRight'];
}) {
  if (!insight) return null;
  const ear      = insight.ear;
  const earColor = ear === 'right' ? RIGHT_COLOR : LEFT_COLOR;
  const earLabel = ear === 'right' ? 'Right Ear' : 'Left Ear';
  const symbol   = ear === 'right' ? '○' : '×';

  const gradeColor =
    insight.grade === 0 ? '#16a34a'
    : insight.grade === 1 ? '#65a30d'
    : insight.grade === 2 ? '#d97706'
    : insight.grade === 3 ? '#ea580c'
    : '#dc2626';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: `${earColor}18`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '900', color: earColor }}>{symbol}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>{earLabel}</Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: gradeColor }}>
          {insight.gradeLabel}
        </Text>
        {insight.shapeLabel ? (
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {insight.shapeLabel}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '900', color: gradeColor }}>
          {insight.pta3}
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#9ca3af' }}> dBHL</Text>
        </Text>
        <View
          style={{
            backgroundColor: `${gradeColor}20`,
            borderRadius: 6,
            paddingHorizontal: 7,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: gradeColor }}>
            Grade {insight.grade}
          </Text>
        </View>
      </View>
    </View>
  );
}

function AIHearingInterpretationPanel({
  session,
  sinResult,
  hfResult,
}: {
  session: import('types/hearing-types').HearingSession | null;
  sinResult: SINResult | null;
  hfResult:  HFResult  | null;
}) {
  const ai = generateAIHearingInterpretation(
    session?.rightEar ?? null,
    session?.leftEar  ?? null,
    sinResult,
    hfResult,
  );

  const patternColor = PATTERN_COLOR[ai.pattern.dominant];

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        padding: 16,
        marginBottom: 16,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#f0fdfc',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="sparkles" size={20} color={TEAL} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>
            AI Interpretation
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>
            Algorithmic clinical insights — not a diagnosis
          </Text>
        </View>
        <View
          style={{
            backgroundColor: `${AI_CONF_COLOR[ai.confidenceGrade]}18`,
            borderRadius: 8,
            paddingHorizontal: 9,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: AI_CONF_COLOR[ai.confidenceGrade],
              textTransform: 'uppercase',
            }}
          >
            {ai.confidenceScore}% conf.
          </Text>
        </View>
      </View>

      {/* ── Per-ear classification ──────────────────────────────────────────── */}
      <View style={{ marginBottom: 2 }}>
        <Text
          style={{
            fontSize: 11,
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 4,
          }}
        >
          Hearing Loss Classification
        </Text>
        <AIEarRow insight={ai.earRight} />
        <AIEarRow insight={ai.earLeft} />
        {!ai.earRight && !ai.earLeft && (
          <Text style={{ fontSize: 12, color: '#9ca3af', paddingVertical: 8 }}>
            No ear data available.
          </Text>
        )}
      </View>

      {/* ── Pattern detection ───────────────────────────────────────────────── */}
      <View
        style={{
          marginTop: 12,
          backgroundColor: `${patternColor}0e`,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: `${patternColor}30`,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Ionicons name="analytics-outline" size={16} color={patternColor} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: '#111827' }}>
            Pattern Detection
          </Text>
          <View
            style={{
              backgroundColor: `${patternColor}22`,
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: patternColor,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {ai.pattern.probability} probability
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: patternColor, marginBottom: 5 }}>
          {ai.pattern.label}
        </Text>
        <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18, marginBottom: 8 }}>
          {ai.pattern.note}
        </Text>

        {/* Evidence points */}
        {ai.pattern.evidencePoints.length > 0 && (
          <View style={{ gap: 4 }}>
            {ai.pattern.evidencePoints.map((pt, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Text style={{ color: patternColor, fontSize: 12, marginTop: 1 }}>•</Text>
                <Text style={{ flex: 1, fontSize: 11, color: '#6b7280', lineHeight: 17 }}>
                  {pt}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* NIHL risk badge */}
        {ai.pattern.nihlRisk && (
          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#fee2e2',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              alignSelf: 'flex-start',
            }}
          >
            <Ionicons name="warning-outline" size={13} color="#dc2626" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>
              NIHL Risk Flagged
            </Text>
          </View>
        )}
      </View>

      {/* ── Symmetry ────────────────────────────────────────────────────────── */}
      <View
        style={{
          marginTop: 12,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: '#f3f4f6',
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor:
              ai.symmetry === 'symmetric' ? '#f0fdf4'
              : ai.symmetry === 'asymmetric' ? '#fef2f2'
              : '#f9fafb',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={SYMMETRY_ICON[ai.symmetry] as React.ComponentProps<typeof Ionicons>['name']}
            size={16}
            color={
              ai.symmetry === 'symmetric' ? '#16a34a'
              : ai.symmetry === 'asymmetric' ? '#dc2626'
              : '#6b7280'
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
            Binaural Symmetry
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color:
                ai.symmetry === 'symmetric' ? '#16a34a'
                : ai.symmetry === 'asymmetric' ? '#dc2626'
                : '#374151',
            }}
          >
            {ai.symmetry === 'symmetric'    ? 'Symmetric'
             : ai.symmetry === 'asymmetric' ? 'Asymmetric'
             : ai.symmetry === 'unilateral' ? 'Unilateral (one ear tested)'
             : 'Cannot Assess'}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 16 }}>
            {ai.symmetryNote}
          </Text>
        </View>
      </View>

      {/* ── Confidence bar ──────────────────────────────────────────────────── */}
      <AIConfidenceBar score={ai.confidenceScore} grade={ai.confidenceGrade} />

      {/* ── Additional remarks ──────────────────────────────────────────────── */}
      {ai.remarks.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text
            style={{
              fontSize: 11,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            Additional Remarks
          </Text>
          <View style={{ gap: 6 }}>
            {ai.remarks.map((remark, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                  backgroundColor: AI_REMARK_BG[remark.type],
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Ionicons
                  name={remark.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={15}
                  color={AI_REMARK_ICON_COLOR[remark.type]}
                  style={{ marginTop: 1 }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: remark.type === 'info' ? '#6b7280' : '#374151',
                    lineHeight: 18,
                  }}
                >
                  {remark.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── EDIS Interpretation Panel ────────────────────────────────────────────────

const H_URGENCY_COLOR: Record<string, string> = {
  LOW:      '#16a34a',
  MEDIUM:   '#d97706',
  HIGH:     '#dc2626',
  CRITICAL: '#7c2d12',
};
const H_URGENCY_BG: Record<string, string> = {
  LOW:      '#f0fdf4',
  MEDIUM:   '#fffbeb',
  HIGH:     '#fef2f2',
  CRITICAL: '#fff1f2',
};
const H_SEVERITY_COLOR: Record<string, string> = {
  low:    '#16a34a',
  medium: '#d97706',
  high:   '#dc2626',
};
const H_INVEST_COLOR: Record<string, string> = {
  ROUTINE: '#0AADA2',
  URGENT:  '#d97706',
  STAT:    '#dc2626',
};

function EDISHearingPanel({ edis }: { edis: SensorInterpretResponse }) {
  const urgency  = edis.urgency?.toUpperCase() ?? 'LOW';
  const urgColor = H_URGENCY_COLOR[urgency] ?? '#374151';
  const urgBg    = H_URGENCY_BG[urgency]   ?? '#f9fafb';

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        padding: 16,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#f0fdfc', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cloud-outline" size={20} color={TEAL} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>
            LifeGate Interpretation
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>
            Powered by DSHub
          </Text>
        </View>
        <View style={{ backgroundColor: urgBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: urgColor, textTransform: 'uppercase' }}>
            {urgency}
          </Text>
        </View>
      </View>

      {/* Assessment */}
      {edis.assessment ? (
        <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>{edis.assessment}</Text>
        </View>
      ) : null}

      {/* Conditions */}
      {edis.conditions.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Differential / Conditions
          </Text>
          <View style={{ gap: 8 }}>
            {edis.conditions.map((c, i) => {
              const barColor = c.confidence >= 70 ? TEAL : c.confidence >= 40 ? '#d97706' : '#9ca3af';
              return (
                <View key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' }}>{c.condition}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: barColor }}>{c.confidence}%</Text>
                  </View>
                  <View style={{ height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                    <View style={{ height: 5, width: `${c.confidence}%` as any, backgroundColor: barColor, borderRadius: 3 }} />
                  </View>
                  {c.description ? (
                    <Text style={{ fontSize: 11, color: '#6b7280', lineHeight: 16 }}>{c.description}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Risk flags */}
      {edis.riskFlags.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Risk Flags
          </Text>
          <View style={{ gap: 6 }}>
            {edis.riskFlags.map((rf, i) => {
              const sev = rf.severity?.toLowerCase() ?? 'low';
              const sc = H_SEVERITY_COLOR[sev] ?? '#6b7280';
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8,
                    backgroundColor: sc + '12',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Ionicons name="warning-outline" size={14} color={sc} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: sc }}>{rf.flag}</Text>
                    {rf.description ? (
                      <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 16 }}>{rf.description}</Text>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: sc + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: sc, textTransform: 'uppercase' }}>{sev}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Investigations */}
      {edis.investigations.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            Recommended Investigations
          </Text>
          <View style={{ gap: 6 }}>
            {edis.investigations.map((inv, i) => {
              const urg = inv.urgency?.toUpperCase() ?? 'ROUTINE';
              const ic = H_INVEST_COLOR[urg] ?? '#374151';
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    paddingVertical: 8,
                    borderBottomWidth: i < edis.investigations.length - 1 ? 1 : 0,
                    borderBottomColor: '#f3f4f6',
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: ic + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="flask-outline" size={14} color={ic} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{inv.test}</Text>
                    {inv.reason ? (
                      <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{inv.reason}</Text>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: ic + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: ic }}>{urg}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Physician review banner */}
      {edis.needsPhysicianReview ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eff6ff', borderRadius: 10, padding: 10 }}>
          <Ionicons name="person-outline" size={16} color="#3b82f6" />
          <Text style={{ flex: 1, fontSize: 12, color: '#1e40af', fontWeight: '600', lineHeight: 17 }}>
            Physician review recommended. Please share these results with a healthcare provider.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main results screen ──────────────────────────────────────────────────────

export default function HearingResults() {
  const { session, staircases, sinResult, hfResult } = useHearingStore();
  const resetAll = useHearingStore((s) => s.resetAll);
  const user = useAuthStore((s) => s.user);

  // Computed patient age
  const userAge = useMemo(() => {
    if (!user?.dob) return undefined;
    const dob = new Date(user.dob);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }, [user]);

  // EDIS interpretation state
  const [edisResult, setEdisResult] = useState<SensorInterpretResponse | null>(null);
  const [edisLoading, setEdisLoading] = useState(false);

  useEffect(() => {
    if (!session?.rightEar && !session?.leftEar) return;
    let cancelled = false;
    setEdisLoading(true);
    interpretHearing(
      session?.rightEar ?? null,
      session?.leftEar  ?? null,
      sinResult,
      hfResult,
    )
      .then((res) => { if (!cancelled) setEdisResult(res); })
      .catch(() => { /* silently fall back to local AI panel */ })
      .finally(() => { if (!cancelled) setEdisLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build threshold arrays from completed staircases + session ear results
  const rightThresholds: ThresholdPoint[] = PTA_FREQUENCIES.map((f) => ({
    frequency: f,
    dbHL: session?.rightEar?.thresholds.find((t) => t.frequency === f)?.dbHL
      ?? estimateThreshold(staircases[f]),
  })).filter((t) => t.dbHL !== undefined) as ThresholdPoint[];

  const leftThresholds: ThresholdPoint[] = session?.leftEar
    ? (PTA_FREQUENCIES.map((f) => {
        const found = session.leftEar!.thresholds.find((t) => t.frequency === f);
        return found ? { frequency: f, dbHL: found.dbHL } : null;
      }).filter((t): t is ThresholdPoint => t !== null))
    : [];

  const rightWHO   = session?.rightEar?.who ?? null;
  const leftWHO    = session?.leftEar?.who ?? null;
  const rightShape = session?.rightEar?.audiogramShape ?? null;
  const leftShape  = session?.leftEar?.audiogramShape ?? null;

  const worstGrade = Math.max(rightWHO?.grade ?? 0, leftWHO?.grade ?? 0) as WHOGrade;
  const overallColor = WHO_BADGE_COLOR[worstGrade];

  const handleRetake = () => {
    resetAll();
    router.replace('/(tab)/hearingtest' as never);
  };

  const handleDone = () => {
    router.replace('/(tab)/chatScreen' as never);
  };

  const handleExport = async () => {
    if (Platform.OS === 'web') {
      openHearingPDF({
        session,
        sinResult,
        hfResult,
        user: user ? { name: user.name, dob: user.dob } : null,
        userAge,
        edisResult,
      });
    } else {
      const lines = [
        `LifeGate Hearing Results — ${new Date().toDateString()}`,
        '',
        rightWHO ? `Right Ear: Grade ${rightWHO.grade} — ${rightWHO.label} (PTA ${rightWHO.pureTonaAverage.toFixed(0)} dBHL)` : 'Right Ear: Not tested',
        leftWHO  ? `Left Ear:  Grade ${leftWHO.grade} — ${leftWHO.label} (PTA ${leftWHO.pureTonaAverage.toFixed(0)} dBHL)` : 'Left Ear:  Not tested',
        '',
        'Screening only — not a clinical diagnosis.',
      ];
      try {
        await Share.share({ message: lines.join('\n') });
      } catch { /* dismissed */ }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 }}>
          <Pressable onPress={handleExport} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name={Platform.OS === 'web' ? 'document-outline' : 'share-outline'} size={20} color="#374151" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' }}>
            Hearing Results
          </Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary hero */}
          <LinearGradient
            colors={[TEAL, TEAL_D]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 22, padding: 24, alignItems: 'center', marginBottom: 20 }}
          >
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Ionicons name="ear-outline" size={44} color="#fff" />
            </View>
            {user?.name ? (
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 }}>{user.name}</Text>
            ) : null}
            {/* Age + Gender chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {userAge !== undefined ? (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Age {userAge}</Text>
                </View>
              ) : null}
              {user?.gender ? (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600', textTransform: 'capitalize' }}>{user.gender}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 21, fontWeight: '900', color: '#fff' }}>
              {WHO_GRADE_LABEL[worstGrade]}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 6, textAlign: 'center' }}>
              Pure Tone Audiometry · {new Date().toLocaleDateString()}
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Grade {worstGrade}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>
                  ○ Right: {rightWHO ? `${rightWHO.pureTonaAverage.toFixed(0)} dBHL` : '—'}
                </Text>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>
                  × Left: {leftWHO ? `${leftWHO.pureTonaAverage.toFixed(0)} dBHL` : '—'}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Audiogram */}
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 4 }}>Audiogram</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>
              Lower is better (0 dBHL = normal). Green zone = normal hearing range.
            </Text>
            <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fde68a', marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ fontSize: 14 }}>⚠️</Text>
              <Text style={{ fontSize: 11, color: '#92400e', flex: 1, lineHeight: 16 }}>
                Consumer headphones are not calibrated audiometers. Absolute dBHL values can vary by about ±10 to 15 dB. Use this as a screening trend, and confirm abnormal results with a clinical audiology test.
              </Text>
            </View>
            {/* Y-axis label */}
            <Text style={{ position: 'absolute', top: 80, left: 8, fontSize: 9, color: '#9ca3af', transform: [{ rotate: '-90deg' }] }}>
              dB HL →
            </Text>
            <AudiogramChart right={rightThresholds} left={leftThresholds.length > 0 ? leftThresholds : []} />
          </View>

          {/* Ear cards + reliability panels */}
          <EarCard ear="right" thresholds={rightThresholds} who={rightWHO} shape={rightShape} />
          {session?.rightEar?.behavioralReport && (
            <ReliabilityPanel report={session.rightEar.behavioralReport} ear="right" />
          )}
          <EarCard ear="left"  thresholds={leftThresholds}  who={leftWHO}  shape={leftShape} />
          {session?.leftEar?.behavioralReport && (
            <ReliabilityPanel report={session.leftEar.behavioralReport} ear="left" />
          )}

          {/* Extended tests */}
          <ExtendedTestsSection sinResult={sinResult} hfResult={hfResult} />

          {/* AI / EDIS Interpretation */}
          {edisLoading ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 24, marginBottom: 16, alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color={TEAL} />
              <Text style={{ fontSize: 13, color: '#9ca3af' }}>Generating LifeGate interpretation…</Text>
            </View>
          ) : edisResult?.success ? (
            <EDISHearingPanel edis={edisResult} />
          ) : (
            <AIHearingInterpretationPanel
              session={session}
              sinResult={sinResult}
              hfResult={hfResult}
            />
          )}

          {/* Disclaimer */}
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 4 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 17 }}>
              This is a screening test and not a clinical diagnosis. Results may be affected by device limitations, ambient noise, and headphone type. Please consult an audiologist for confirmed hearing evaluation.
            </Text>
          </View>

          {/* Actions */}
          <View style={{ gap: 10, marginTop: 16 }}>
            <Pressable
              onPress={handleExport}
              style={({ pressed }) => ({
                paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#d1d5db',
                backgroundColor: pressed ? '#f3f4f6' : '#fff',
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              })}
            >
              <Ionicons name={Platform.OS === 'web' ? 'document-outline' : 'share-social-outline'} size={18} color="#374151" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>
                {Platform.OS === 'web' ? 'Export Results' : 'Share Results'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleRetake}
              style={({ pressed }) => ({
                paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#d1d5db',
                backgroundColor: pressed ? '#f3f4f6' : '#fff',
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              })}
            >
              <Ionicons name="refresh-outline" size={18} color="#374151" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Retake Test</Text>
            </Pressable>
            <Pressable
              onPress={handleDone}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
            >
              <LinearGradient
                colors={[TEAL, TEAL_D]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Done</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
