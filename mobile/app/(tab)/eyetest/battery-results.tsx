/**
 * Battery Results — Aggregated report for all completed sub-tests
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StatusBar, Share, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVisionStore } from 'stores/vision-store';
import { useAuthStore } from 'stores/auth-store';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import { interpretVision } from 'services/sensor-interpretation-service';
import type { SensorInterpretResponse } from 'services/sensor-interpretation-service';
import {
  buildClinicalSummary,
  WHO_VISUAL_CATEGORY_INFO,
  CVD_TYPE_INFO,
  PR_GRADE_COLOR,
  PR_GRADE_LABEL,
  NEAR_GRADE_COLOR,
  NEAR_GRADE_LABEL,
  lookupCSPercentile,
} from 'services/clinical-standards-engine';
import { generateAIInterpretation } from 'services/vision-ai-engine';
import type { AIInterpretation } from 'services/vision-ai-engine';
import type {
  SingleTestResult, AcuityResult, ColorResult,
  AstigmatismResult, ContrastResult, NearVisionResult,
  ColorVisionCategory, BehavioralReport, ReliabilityScore,
} from 'types/vision-types';

const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

// ─── Per-test summary cards ───────────────────────────────────────────────────

function AcuityCard({ r }: { r: AcuityResult }) {
  const good = r.logMAR <= 0.30;
  const catInfo = r.acuityCategory ? WHO_VISUAL_CATEGORY_INFO[r.acuityCategory] : null;
  return (
    <View style={cardStyle(good ? '#f0fdf4' : '#fffbeb', good ? '#86efac' : '#fde68a')}>
      <Row icon="eye-outline" label="Visual Acuity" value={`${r.snellen}  (LogMAR ${r.logMAR.toFixed(2)})`} good={good} />
      {r.snellenDecimal !== undefined && r.etdrsLetters !== undefined && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '600' }}>Decimal {r.snellenDecimal.toFixed(2)}</Text>
          </View>
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '600' }}>ETDRS ~{r.etdrsLetters} letters</Text>
          </View>
        </View>
      )}
      {catInfo && (
        <Text style={{ fontSize: 11, color: catInfo.color, fontWeight: '600', marginTop: 5 }}>
          {catInfo.label}
        </Text>
      )}
      <Text style={subText}>{r.trials.length} adaptive trials</Text>
    </View>
  );
}

function ColorCard({ r }: { r: ColorResult }) {
  const good = r.category === 'normal';
  const labels: Record<ColorVisionCategory, string> = {
    normal: 'Normal trichromacy',
    mild_deficiency: 'Mild deficiency',
    moderate_deficiency: 'Moderate deficiency',
    severe_deficiency: 'Severe deficiency',
  };
  const cvdInfo = r.cvdType ? CVD_TYPE_INFO[r.cvdType] : null;
  return (
    <View style={cardStyle(good ? '#f0fdf4' : '#fef2f2', good ? '#86efac' : '#fca5a5')}>
      <Row icon="color-palette-outline" label="Color Vision" value={labels[r.category]} good={good} />
      {cvdInfo && !good && (
        <Text style={{ fontSize: 11, color: cvdInfo.color, fontWeight: '600', marginTop: 5 }}>
          {cvdInfo.label} — {cvdInfo.clinicalNote}
        </Text>
      )}
      <Text style={subText}>{r.score}% correct on plates</Text>
    </View>
  );
}

function AstigmatismCard({ r }: { r: AstigmatismResult }) {
  const good = r.severity === 'none';
  const sevLabel = { none: 'No astigmatism detected', mild: 'Mild', moderate: 'Moderate', marked: 'Marked' }[r.severity];
  const ruleLabel: Record<string, string> = {
    with_the_rule: 'With-the-Rule',
    against_the_rule: 'Against-the-Rule',
    oblique: 'Oblique',
    none: '',
  };
  return (
    <View style={cardStyle(good ? '#f0fdf4' : '#fef3c7', good ? '#86efac' : '#fde68a')}>
      <Row icon="compass-outline" label="Astigmatism"
        value={good ? sevLabel : `${sevLabel}${r.detectedAxis != null ? ` × ${r.detectedAxis}°` : ''}`}
        good={good} />
      {!good && r.axisRule && r.axisRule !== 'none' && (
        <View style={{ marginTop: 6, flexDirection: 'row', gap: 8 }}>
          <View style={{ backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#92400e' }}>{ruleLabel[r.axisRule]}</Text>
          </View>
          {r.cylinderNotation && (
            <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151' }}>Cyl {r.cylinderNotation}</Text>
            </View>
          )}
        </View>
      )}
      <Text style={subText}>{r.trials.length} rounds</Text>
    </View>
  );
}

function ContrastCard({ r, age }: { r: ContrastResult; age?: number }) {
  const logCS = r.pelliRobsonLogCS;
  const grade = r.contrastGrade;
  const good = logCS !== undefined ? logCS >= 1.65 : false;
  const lowest = r.curve.length > 0 ? Math.min(...r.curve.map((c) => c.threshold)) : null;
  const gradeColor = grade ? PR_GRADE_COLOR[grade] : '#6b7280';
  const gradeLabel = grade ? PR_GRADE_LABEL[grade] : null;
  const percentile = logCS !== undefined ? lookupCSPercentile(logCS, age) : null;
  return (
    <View style={cardStyle(good ? '#f0fdf4' : '#fffbeb', good ? '#86efac' : '#fde68a')}>
      <Row icon="contrast-outline" label="Contrast Sensitivity"
        value={logCS !== undefined ? `Peak log CS ${logCS.toFixed(2)}` : lowest != null ? `Best threshold: ${lowest}%` : 'No data'}
        good={good} />
      {gradeLabel && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <View style={{ backgroundColor: gradeColor + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: gradeColor }}>{gradeLabel}</Text>
          </View>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>Pelli-Robson equivalent</Text>
        </View>
      )}
      {percentile && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: '#e0f2fe', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369a1' }}>
              Better than {percentile.percentile}% ({percentile.ageBandLabel})
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>Age-matched normative percentile</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {r.curve.map((c) => (
          <View key={c.sf} style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '600' }}>
              {c.sf} cpd · log CS {(Math.log10(100 / c.threshold)).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NearCard({ r }: { r: NearVisionResult }) {
  const good = r.smallestReadablePoints <= 8;
  const nearGrade: keyof typeof NEAR_GRADE_COLOR =
    r.smallestReadablePoints <= 6  ? 'normal'
    : r.smallestReadablePoints <= 10 ? 'mild_presbyopia'
    : r.smallestReadablePoints <= 14 ? 'moderate_presbyopia'
    : 'severe_near_loss';
  const gradeColor = NEAR_GRADE_COLOR[nearGrade];
  return (
    <View style={cardStyle(good ? '#f0fdf4' : '#fffbeb', good ? '#86efac' : '#fde68a')}>
      <Row icon="reader-outline" label="Near Vision" value={`${r.nNotation}  (${r.smallestReadablePoints}pt)`} good={good} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {r.jaegerNotation && (
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '600' }}>{r.jaegerNotation}</Text>
          </View>
        )}
        {r.snellenNearEquivalent && (
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '600' }}>{r.snellenNearEquivalent}</Text>
          </View>
        )}
        <View style={{ backgroundColor: gradeColor + '25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: gradeColor }}>{NEAR_GRADE_LABEL[nearGrade]}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Clinical summary panel ───────────────────────────────────────────────────

function ClinicalSummaryPanel({ results }: { results: SingleTestResult[] }) {
  const acuity   = results.find((r) => r.testId === 'acuity')   as AcuityResult | undefined;
  const color    = results.find((r) => r.testId === 'color')    as ColorResult | undefined;
  const contrast = results.find((r) => r.testId === 'contrast') as ContrastResult | undefined;
  const astig    = results.find((r) => r.testId === 'astigmatism') as AstigmatismResult | undefined;
  const near     = results.find((r) => r.testId === 'near')     as NearVisionResult | undefined;

  const summary = buildClinicalSummary({
    acuityLogMAR:        acuity?.logMAR,
    colorVisionPassed:   color ? color.category === 'normal' : undefined,
    contrastPRScore:     contrast?.pelliRobsonLogCS,
    astigmatismSeverity: astig?.severity,
    nearVisionPoints:    near?.smallestReadablePoints,
  });

  const urgencyColor = summary.urgency === 'urgent' ? '#dc2626' : summary.urgency === 'soon' ? '#d97706' : '#16a34a';
  const urgencyBg    = summary.urgency === 'urgent' ? '#fef2f2' : summary.urgency === 'soon' ? '#fffbeb' : '#f0fdf4';
  const urgencyLabel = summary.urgency === 'urgent' ? 'Urgent' : summary.urgency === 'soon' ? 'Review Soon' : 'Routine';

  return (
    <View style={{ backgroundColor: urgencyBg, borderRadius: 16, borderWidth: 1.5, borderColor: urgencyColor + '40', padding: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="medical-outline" size={18} color={urgencyColor} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: '#111827' }}>Clinical Summary</Text>
        <View style={{ backgroundColor: urgencyColor + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: urgencyColor, textTransform: 'uppercase' }}>{urgencyLabel}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: summary.details.length > 0 ? 8 : 0 }}>
        {summary.headline}
      </Text>
      {summary.details.map((d, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
          <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 1 }}>•</Text>
          <Text style={{ flex: 1, fontSize: 12, color: '#374151', lineHeight: 18 }}>{d}</Text>
        </View>
      ))}
      {summary.referralRecommended && (
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: urgencyColor + '15', borderRadius: 8, padding: 8 }}>
          <Ionicons name="calendar-outline" size={14} color={urgencyColor} />
          <Text style={{ fontSize: 11, color: urgencyColor, fontWeight: '600', flex: 1 }}>
            Professional eye examination recommended
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

const cardStyle = (bg: string, border: string) => ({
  backgroundColor: bg,
  borderRadius: 16,
  borderWidth: 1.5,
  borderColor: border,
  padding: 14,
  marginBottom: 12,
});

const subText = { fontSize: 11, color: '#6b7280', marginTop: 4 } as const;

function Row({ icon, label, value, good }: { icon: string; label: string; value: string; good: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={good ? '#16a34a' : '#d97706'} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: '#9ca3af' }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{value}</Text>
      </View>
      <Ionicons name={good ? 'checkmark-circle' : 'alert-circle'} size={18} color={good ? '#16a34a' : '#d97706'} />
    </View>
  );
}

// ─── Behavioral signal panel ──────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  excellent: '#16a34a',
  good: '#0AADA2',
  fair: '#d97706',
  poor: '#dc2626',
};

const GRADE_BG: Record<string, string> = {
  excellent: '#f0fdf4',
  good: '#f0fdfc',
  fair: '#fffbeb',
  poor: '#fef2f2',
};

function ReliabilityChip({ score }: { score: ReliabilityScore }) {
  const labelMap: Record<string, string> = {
    acuity: 'Acuity',
    color: 'Color',
    astigmatism: 'Astigmatism',
    contrast: 'Contrast',
    near: 'Near',
  };
  const c = GRADE_COLOR[score.grade];
  const bg = GRADE_BG[score.grade];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 80 }}>
      <Text style={{ fontSize: 10, color: '#9ca3af' }}>{labelMap[score.testId] ?? score.testId}</Text>
      <Text style={{ fontSize: 13, fontWeight: '800', color: c }}>{score.score}</Text>
      <Text style={{ fontSize: 10, fontWeight: '700', color: c, textTransform: 'uppercase' }}>{score.grade}</Text>
    </View>
  );
}

function LatencyRow({ testId, stats }: { testId: string; stats: NonNullable<BehavioralReport['latencyByTest'][keyof BehavioralReport['latencyByTest']]> }) {
  const labelMap: Record<string, string> = {
    acuity: 'Acuity', color: 'Color', astigmatism: 'Astigm.', contrast: 'Contrast', near: 'Near',
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
      <Text style={{ width: 72, fontSize: 12, color: '#374151', fontWeight: '600' }}>{labelMap[testId] ?? testId}</Text>
      <Text style={{ flex: 1, fontSize: 12, color: '#6b7280' }}>med {stats.median} ms</Text>
      <Text style={{ fontSize: 11, color: '#9ca3af' }}>CV {(stats.cv).toFixed(2)}</Text>
      {stats.fastResponses > 0 && (
        <View style={{ marginLeft: 6, backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '700' }}>{stats.fastResponses} fast</Text>
        </View>
      )}
    </View>
  );
}

function BehavioralPanel({ report }: { report: BehavioralReport }) {
  const overallColor = GRADE_COLOR[report.overallReliability];
  const overallBg   = GRADE_BG[report.overallReliability];
  const latencyEntries = Object.entries(report.latencyByTest) as Array<[string, NonNullable<BehavioralReport['latencyByTest'][keyof BehavioralReport['latencyByTest']]>]>;

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 16, marginBottom: 12 }}>
      {/* Section heading */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Ionicons name="analytics-outline" size={18} color="#374151" />
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827', flex: 1 }}>Behavioral Signals</Text>
        <View style={{ backgroundColor: overallBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: overallColor, textTransform: 'uppercase' }}>
            {report.overallReliability}
          </Text>
        </View>
      </View>

      {/* Per-test reliability grades */}
      {report.reliabilityScores.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>Reliability Scores</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {report.reliabilityScores.map((s) => <ReliabilityChip key={s.testId} score={s} />)}
          </View>
        </>
      )}

      {/* Response latency */}
      {latencyEntries.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Response Latency</Text>
          {latencyEntries.map(([id, stats]) => <LatencyRow key={id} testId={id} stats={stats} />)}
          <View style={{ marginTop: 6, marginBottom: 14 }} />
        </>
      )}

      {/* Eye-switch compliance */}
      {report.eyeSwitchEvents.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Eye-Switch Compliance</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {/* Compliance bar */}
            <View style={{ flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.round(report.eyeSwitchComplianceRate * 100)}%`, backgroundColor: report.eyeSwitchComplianceRate >= 0.8 ? '#16a34a' : '#d97706', borderRadius: 4 }} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', minWidth: 36, textAlign: 'right' }}>
              {Math.round(report.eyeSwitchComplianceRate * 100)}%
            </Text>
          </View>
        </>
      )}

      {/* Error clusters */}
      {report.errorClusters.length > 0 && (
        <>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Error Pattern</Text>
          {report.errorClusters.map((ec, i) => {
            const clusterColor = ec.severity === 'high' ? '#dc2626' : ec.severity === 'medium' ? '#d97706' : '#6b7280';
            const clusterBg    = ec.severity === 'high' ? '#fef2f2' : ec.severity === 'medium' ? '#fffbeb' : '#f9fafb';
            return (
              <View key={i} style={{ backgroundColor: clusterBg, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="warning-outline" size={16} color={clusterColor} />
                <Text style={{ flex: 1, fontSize: 12, color: clusterColor, fontWeight: '600' }}>
                  {ec.type.replace('_', ' ')} pattern — {ec.frequency} error{ec.frequency !== 1 ? 's' : ''} ({ec.severity} severity)
                </Text>
              </View>
            );
          })}
        </>
      )}

      <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 16 }}>
        Behavioral signals are supplementary quality indicators and do not affect displayed test thresholds.
      </Text>
    </View>
  );
}

// ─── AI Interpretation Panel ──────────────────────────────────────────────────

const CONF_COLOR: Record<AIInterpretation['confidenceGrade'], string> = {
  high:     '#16a34a',
  moderate: '#d97706',
  low:      '#dc2626',
};
const CONF_BG: Record<AIInterpretation['confidenceGrade'], string> = {
  high:     '#f0fdf4',
  moderate: '#fffbeb',
  low:      '#fef2f2',
};
const PROB_COLOR: Record<string, string> = {
  likely:   '#0AADA2',
  possible: '#d97706',
  unlikely: '#9ca3af',
};
const REMARK_ICON_COLOR: Record<string, string> = {
  finding:    '#0AADA2',
  suggestion: '#7c3aed',
  warning:    '#d97706',
  info:       '#6b7280',
};
const REMARK_BG: Record<string, string> = {
  finding:    '#f0fdfc',
  suggestion: '#f5f3ff',
  warning:    '#fffbeb',
  info:       '#f9fafb',
};

function ConfidenceBar({ score, grade }: { score: number; grade: AIInterpretation['confidenceGrade'] }) {
  const color = CONF_COLOR[grade];
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
        <View
          style={{
            height: 6,
            width: `${score}%`,
            backgroundColor: color,
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

function InsightRow({
  icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 9,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: '#f0fdfc',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={TEAL} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: valueColor ?? '#111827' }}>{value}</Text>
        {sub ? (
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 16 }}>{sub}</Text>
        ) : null}
      </View>
    </View>
  );
}

function AIInterpretationPanel({
  results,
  behavioralReport,
}: {
  results: SingleTestResult[];
  behavioralReport?: BehavioralReport | null;
}) {
  const ai = generateAIInterpretation(results, behavioralReport);

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        padding: 16,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: '#f0fdfc',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="sparkles" size={18} color={TEAL} />
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
            backgroundColor: CONF_BG[ai.confidenceGrade],
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: CONF_COLOR[ai.confidenceGrade],
              textTransform: 'uppercase',
            }}
          >
            {ai.confidenceScore}% conf.
          </Text>
        </View>
      </View>

      {/* ── Visual Acuity ── */}
      {ai.acuity ? (
        <InsightRow
          icon="eye-outline"
          label="Visual Acuity"
          value={`${ai.acuity.logMAR.toFixed(1)} LogMAR ≈ ${ai.acuity.snellen6}`}
          sub={ai.acuity.description}
          valueColor={ai.acuity.logMAR <= 0.10 ? '#16a34a' : ai.acuity.logMAR <= 0.30 ? '#d97706' : '#dc2626'}
        />
      ) : null}

      {/* ── Refractive Error ── */}
      <View
        style={{
          paddingVertical: 9,
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: '#f0fdfc',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="glasses-outline" size={16} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
              Refractive Error Likelihood
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
              {ai.refractive.label}
            </Text>
          </View>
          <View
            style={{
              backgroundColor:
                PROB_COLOR[ai.refractive.probability] + '22',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: PROB_COLOR[ai.refractive.probability],
                textTransform: 'capitalize',
              }}
            >
              {ai.refractive.probability}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18, marginLeft: 42 }}>
          {ai.refractive.description}
        </Text>
        {ai.refractive.estimatedRange ? (
          <View style={{ marginLeft: 42 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#f0fdfc',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
                alignSelf: 'flex-start',
              }}
            >
              <Ionicons name="resize-outline" size={13} color={TEAL} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: TEAL }}>
                Est. sphere: {ai.refractive.estimatedRange}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Astigmatism ── */}
      <View
        style={{
          paddingVertical: 9,
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: '#f0fdfc',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="compass-outline" size={16} color={TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
              Astigmatism Probability
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
              {ai.astigmatism.detected
                ? `${ai.astigmatism.probability.charAt(0).toUpperCase() + ai.astigmatism.probability.slice(1)} probability`
                : 'Not detected'}
            </Text>
          </View>
          {ai.astigmatism.axisEstimate !== null ? (
            <View
              style={{
                backgroundColor: '#fef3c7',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>
                ×{ai.astigmatism.axisEstimate}°
              </Text>
            </View>
          ) : null}
        </View>
        {ai.astigmatism.detected ? (
          <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18, marginLeft: 42 }}>
            {ai.astigmatism.note}
          </Text>
        ) : null}
        {ai.astigmatism.axisTypeLabel ? (
          <View style={{ marginLeft: 42 }}>
            <View
              style={{
                backgroundColor: '#fef3c7',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#92400e' }}>
                {ai.astigmatism.axisTypeLabel}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Color Vision ── */}
      <InsightRow
        icon="color-palette-outline"
        label="Color Deficiency Classification"
        value={ai.colorVision.label}
        sub={ai.colorVision.note}
        valueColor={
          ai.colorVision.classification === 'normal_trichromacy'
            ? '#16a34a'
            : ai.colorVision.classification === 'insufficient_data'
            ? '#9ca3af'
            : '#d97706'
        }
      />

      {/* ── Confidence bar ── */}
      <ConfidenceBar score={ai.confidenceScore} grade={ai.confidenceGrade} />

      {/* ── Remarks ── */}
      {ai.remarks.length > 0 ? (
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
                  backgroundColor: REMARK_BG[remark.type],
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <Ionicons
                  name={remark.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={15}
                  color={REMARK_ICON_COLOR[remark.type]}
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
      ) : null}
    </View>
  );
}

// ─── EDIS Interpretation Panel ───────────────────────────────────────────────

const URGENCY_COLOR: Record<string, string> = {
  LOW:      '#16a34a',
  MEDIUM:   '#d97706',
  HIGH:     '#dc2626',
  CRITICAL: '#7c2d12',
};
const URGENCY_BG: Record<string, string> = {
  LOW:      '#f0fdf4',
  MEDIUM:   '#fffbeb',
  HIGH:     '#fef2f2',
  CRITICAL: '#fff1f2',
};
const SEVERITY_COLOR: Record<string, string> = {
  low:    '#16a34a',
  medium: '#d97706',
  high:   '#dc2626',
};
const INVEST_COLOR: Record<string, string> = {
  ROUTINE: '#0AADA2',
  URGENT:  '#d97706',
  STAT:    '#dc2626',
};

function EDISVisionPanel({ edis }: { edis: SensorInterpretResponse }) {
  const urgency     = edis.urgency?.toUpperCase() ?? 'LOW';
  const urgColor    = URGENCY_COLOR[urgency] ?? '#374151';
  const urgBg       = URGENCY_BG[urgency]   ?? '#f9fafb';

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
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
            EDIS Clinical Interpretation
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>
            {edis.providerName ? `Powered by ${edis.providerName}` : 'AI-backed probabilistic analysis'}
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
              const sc = SEVERITY_COLOR[sev] ?? '#6b7280';
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
              const ic = INVEST_COLOR[urg] ?? '#374151';
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

// ─── Share helper ────────────────────────────────────────────────────────────────

function buildShareText(results: SingleTestResult[], distanceCm: number): string {
  const lines: string[] = [`LifeGate Vision Battery — ${new Date().toDateString()}`, `Distance: ${distanceCm} cm`, ''];
  for (const r of results) {
    if (r.testId === 'acuity') {
      const ar = r as AcuityResult;
      lines.push(`Visual Acuity: ${ar.snellen} (LogMAR ${ar.logMAR.toFixed(2)})${ar.etdrsLetters !== undefined ? ` · ETDRS ~${ar.etdrsLetters}` : ''}`);
    }
    if (r.testId === 'color') {
      const cr = r as ColorResult;
      lines.push(`Color Vision: ${cr.category} — ${cr.score}% correct${cr.cvdType ? ` · ${cr.cvdType.replace(/_/g, ' ')}` : ''}`);
    }
    if (r.testId === 'astigmatism') {
      const ar = r as AstigmatismResult;
      lines.push(`Astigmatism: ${ar.severity}${ar.detectedAxis != null ? ` ${ar.cylinderNotation ?? `at ${ar.detectedAxis}°`}` : ''}${ar.axisRule && ar.axisRule !== 'none' ? ` (${ar.axisRule.replace(/_/g, ' ')})` : ''}`);
    }
    if (r.testId === 'contrast') {
      const cr = r as ContrastResult;
      lines.push(`Contrast: ${cr.pelliRobsonLogCS !== undefined ? `log CS ${cr.pelliRobsonLogCS.toFixed(2)}` : cr.curve.map((c) => `${c.sf}cpd→${c.threshold}%`).join(', ')}`);
    }
    if (r.testId === 'near') {
      const nr = r as NearVisionResult;
      lines.push(`Near Vision: ${nr.nNotation}${nr.jaegerNotation ? ` / ${nr.jaegerNotation}` : ''} (${nr.smallestReadablePoints}pt)${nr.snellenNearEquivalent ? ` · ${nr.snellenNearEquivalent}` : ''}`);
    }
  }
  lines.push('', 'Screening only — not a medical examination.');
  return lines.join('\n');
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BatteryResults() {
  const { session, viewingDistanceCm, resetBattery, behavioralReport } = useVisionStore();
  const user = useAuthStore((s) => s.user);

  const results = session?.results ?? [];
  const duration = session && session.completedAt
    ? Math.round((session.completedAt - session.startedAt) / 1000)
    : null;

  const userAge = useMemo(() => {
    if (!user?.dob) return undefined;
    const dob = new Date(user.dob);
    if (Number.isNaN(dob.getTime())) return undefined;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDelta = now.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age >= 0 ? age : undefined;
  }, [user?.dob]);

  // EDIS interpretation state
  const [edisResult, setEdisResult] = useState<SensorInterpretResponse | null>(null);
  const [edisLoading, setEdisLoading] = useState(false);

  useEffect(() => {
    if (results.length === 0) return;
    let cancelled = false;
    setEdisLoading(true);
    interpretVision(results, behavioralReport)
      .then((res) => { if (!cancelled) setEdisResult(res); })
      .catch(() => { /* silently fall back to local AI panel */ })
      .finally(() => { if (!cancelled) setEdisLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({ message: buildShareText(results, viewingDistanceCm) });
    } catch { /* dismissed */ }
  };

  const handleRetake = () => {
    resetBattery();
    router.replace('/(tab)/eyetest' as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 }}>
          <Pressable onPress={handleShare} hitSlop={10}
            style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: pressed ? '#e5e7eb' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' })}>
            <Ionicons name="share-outline" size={20} color="#374151" />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' }}>
            Battery Results
          </Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <LinearGradient
            colors={[TEAL, TEAL_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 22, padding: 24, alignItems: 'center', marginBottom: 20 }}
          >
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Ionicons name="checkmark-done-circle" size={44} color="#fff" />
            </View>
            <Text style={{ fontSize: 21, fontWeight: '900', color: '#fff' }}>
              Assessment Complete
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 6, textAlign: 'center' }}>
              {results.length} test{results.length !== 1 ? 's' : ''} completed
              {duration != null ? `  ·  ${Math.ceil(duration / 60)} min` : ''}
            </Text>
            {results.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                {results.map((r) => (
                  <View key={r.testId} style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600', textTransform: 'capitalize' }}>{r.testId}</Text>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>

          {/* Clinical summary */}
          {results.length > 0 && <ClinicalSummaryPanel results={results} />}

          {/* AI / EDIS Interpretation */}
          {results.length > 0 && (
            edisLoading ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 24, marginBottom: 16, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size="small" color={TEAL} />
                <Text style={{ fontSize: 13, color: '#9ca3af' }}>Generating EDIS clinical interpretation…</Text>
              </View>
            ) : edisResult?.success ? (
              <EDISVisionPanel edis={edisResult} />
            ) : (
              <AIInterpretationPanel results={results} behavioralReport={behavioralReport} />
            )
          )}

          {/* Individual results */}
          {results.map((r) => {
            if (r.testId === 'acuity')       return <AcuityCard key="acuity" r={r as AcuityResult} />;
            if (r.testId === 'color')        return <ColorCard key="color" r={r as ColorResult} />;
            if (r.testId === 'astigmatism')  return <AstigmatismCard key="astigmatism" r={r as AstigmatismResult} />;
            if (r.testId === 'contrast')     return <ContrastCard key="contrast" r={r as ContrastResult} age={userAge} />;
            if (r.testId === 'near')         return <NearCard key="near" r={r as NearVisionResult} />;
            return null;
          })}

          {results.length === 0 && (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center' }}>
              <Ionicons name="alert-circle-outline" size={32} color="#9ca3af" />
              <Text style={{ color: '#6b7280', marginTop: 8 }}>No tests were completed.</Text>
            </View>
          )}

          {/* Behavioral signals */}
          {behavioralReport && <BehavioralPanel report={behavioralReport} />}

          {/* Disclaimer */}
          <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 17 }}>
              These results are from a screening tool only and do not replace a professional eye examination.
              Consult an eye-care professional for a formal assessment.
            </Text>
          </View>

          {/* Actions */}
          <View style={{ gap: 10 }}>
            <Pressable onPress={handleShare}
              style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: pressed ? '#f3f4f6' : '#fff', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 })}>
              <Ionicons name="share-social-outline" size={18} color="#374151" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Share Results</Text>
            </Pressable>
            <Pressable onPress={handleRetake}
              style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: pressed ? '#f3f4f6' : '#fff', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 })}>
              <Ionicons name="refresh-outline" size={18} color="#374151" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151' }}>Retake Battery</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/(tab)/health' as never)}
              style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
              <LinearGradient colors={[TEAL, TEAL_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="heart-outline" size={18} color="#fff" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Back to Dashboard</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>

        <PatientBottomTabBar />
      </SafeAreaView>
    </View>
  );
}
