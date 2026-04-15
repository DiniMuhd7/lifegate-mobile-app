/**
 * Hearing Test Results Screen
 *
 * Displays a full audiogram (right + left ear), WHO classification badges,
 * PTA3 averages, audiogram shape labels, and clinical recommendations.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  Dimensions,
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
import type { PTAFrequency, TestEar, WHOGrade, SINResult, HFResult, BehavioralReport } from 'types/hearing-types';
import { PTA_FREQUENCIES, HF_FREQUENCIES } from 'types/hearing-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const TEAL = '#0AADA2';

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

// ─── Main results screen ──────────────────────────────────────────────────────

export default function HearingResults() {
  const { session, staircases, sinResult, hfResult } = useHearingStore();
  const resetAll = useHearingStore((s) => s.resetAll);

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

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Hearing Results</Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>Pure Tone Audiometry — {new Date().toLocaleDateString()}</Text>
          </View>
          <View style={{ backgroundColor: `${overallColor}22`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: overallColor }}>
              {WHO_GRADE_LABEL[worstGrade]}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary hero */}
          <LinearGradient
            colors={[`${overallColor}20`, `${overallColor}08`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: `${overallColor}30` }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8 }}>
                  HEARING ASSESSMENT
                </Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827' }}>
                  {WHO_GRADE_LABEL[worstGrade]}
                </Text>
              </View>
              <View style={{ backgroundColor: overallColor, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>Grade {worstGrade}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 3 }}>
                <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: RIGHT_COLOR, marginBottom: 2 }} />
                <Text style={{ fontSize: 17, fontWeight: '900', color: RIGHT_COLOR }}>
                  {rightWHO ? `${rightWHO.pureTonaAverage.toFixed(0)}` : '—'}
                </Text>
                <Text style={{ fontSize: 9, color: '#6b7280' }}>Right dBHL</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 3 }}>
                <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                  <View style={{ position: 'absolute', width: 12, height: 2.5, backgroundColor: LEFT_COLOR, transform: [{ rotate: '45deg' }] }} />
                  <View style={{ position: 'absolute', width: 12, height: 2.5, backgroundColor: LEFT_COLOR, transform: [{ rotate: '-45deg' }] }} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '900', color: leftWHO ? LEFT_COLOR : '#9ca3af' }}>
                  {leftWHO ? `${leftWHO.pureTonaAverage.toFixed(0)}` : '—'}
                </Text>
                <Text style={{ fontSize: 9, color: '#6b7280' }}>{leftWHO ? 'Left dBHL' : 'Left — N/A'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 3 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16a34a" style={{ marginBottom: 2 }} />
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#111827' }}>PTA</Text>
                <Text style={{ fontSize: 9, color: '#6b7280' }}>Complete</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Audiogram */}
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 4 }}>Audiogram</Text>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>
              Lower is better (0 dBHL = normal). Green zone = normal hearing range.
            </Text>
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

          {/* Disclaimer */}
          <View style={{ backgroundColor: '#fffbeb', borderRadius: 14, padding: 14, marginTop: 4, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name="warning-outline" size={18} color="#d97706" />
            <Text style={{ flex: 1, fontSize: 11, color: '#92400e', lineHeight: 18 }}>
              This is a screening test and not a clinical diagnosis. Results may be affected by device limitations, ambient noise, and headphone type. Please consult an audiologist for confirmed hearing evaluation.
            </Text>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable
              onPress={handleRetake}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                backgroundColor: pressed ? '#f3f4f6' : '#fff',
                borderWidth: 1.5, borderColor: '#e5e7eb',
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>Retake Test</Text>
            </Pressable>
            <Pressable
              onPress={handleDone}
              style={({ pressed }) => ({
                flex: 1.4, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                backgroundColor: pressed ? '#0f766e' : TEAL,
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Done</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
