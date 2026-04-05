import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { useHealthStore } from 'stores/health-store';
import { useDiagnosisStore } from 'stores/diagnosis-store';
import { useAuthStore } from 'stores/auth/auth-store';
import type { HealthTimelineEntry } from 'types/health-types';
import type { DiagnosisPrescription } from 'types/diagnosis-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const URGENCY_COLOR: Record<string, string> = {
  LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626', CRITICAL: '#7c3aed',
};
const URGENCY_BG: Record<string, string> = {
  LOW: '#f0fdf4', MEDIUM: '#fffbeb', HIGH: '#fef2f2', CRITICAL: '#faf5ff',
};
const URGENCY_BORDER: Record<string, string> = {
  LOW: '#bbf7d0', MEDIUM: '#fde68a', HIGH: '#fecaca', CRITICAL: '#ddd6fe',
};
const URGENCY_LABEL: Record<string, string> = {
  LOW: 'Low Risk', MEDIUM: 'Moderate', HIGH: 'High Risk', CRITICAL: 'Critical',
};
const STATUS_COLOR: Record<string, string> = {
  Pending: '#d97706', Active: '#2563eb', Completed: '#16a34a',
};

type ExportFormat = 'pdf' | 'png' | 'jpeg';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function deriveOverallStatus(entries: HealthTimelineEntry[]) {
  const active = entries.filter((e) => e.status !== 'Completed');
  const check = active.length > 0 ? active[0] : entries[0];
  if (!check) return { label: 'Stable', color: '#16a34a' };
  if (check.urgency === 'CRITICAL') return { label: 'Critical', color: '#7c3aed' };
  if (check.urgency === 'HIGH') return { label: 'High Risk', color: '#dc2626' };
  if (check.urgency === 'MEDIUM') return { label: 'Monitor', color: '#d97706' };
  return { label: 'Stable', color: '#16a34a' };
}

function detectRecurring(entries: HealthTimelineEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = (e.condition || e.title).toLowerCase().trim();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const set = new Set<string>();
  counts.forEach((n, k) => { if (n >= 2) set.add(k); });
  return set;
}

function urgencyDistribution(entries: HealthTimelineEntry[]) {
  const dist: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  entries.forEach((e) => { dist[e.urgency] = (dist[e.urgency] ?? 0) + 1; });
  return dist;
}

// ─── HTML Report Generator ───────────────────────────────────────────────────

function groupByMonth(entries: HealthTimelineEntry[]): { month: string; items: HealthTimelineEntry[] }[] {
  const groups: { month: string; items: HealthTimelineEntry[] }[] = [];
  const seen = new Map<string, number>();
  for (const e of entries) {
    let key = '';
    try { key = new Date(e.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch { key = 'Unknown'; }
    if (seen.has(key)) { groups[seen.get(key)!].items.push(e); }
    else { seen.set(key, groups.length); groups.push({ month: key, items: [e] }); }
  }
  return groups;
}

function buildReportHTML(
  patientName: string,
  entries: HealthTimelineEntry[],
  reportDate: string,
  prescriptionMap: Map<string, DiagnosisPrescription>
): string {
  const status = deriveOverallStatus(entries);
  const dist = urgencyDistribution(entries);
  const abnormal = entries.filter((e) => e.urgency === 'HIGH' || e.urgency === 'CRITICAL');
  const escalated = entries.filter((e) => e.escalated);
  const completed = entries.filter((e) => e.status === 'Completed').length;
  const active = entries.filter((e) => e.status !== 'Completed').length;
  const recurringSet = detectRecurring(entries);
  const groups = groupByMonth(entries);

  // Per-entry full detail card
  const entryCard = (e: HealthTimelineEntry) => {
    const rx = prescriptionMap.get(e.id);
    const isRecurring = recurringSet.has((e.condition || e.title).toLowerCase().trim());
    const isAbnormal = e.urgency === 'HIGH' || e.urgency === 'CRITICAL';
    const tags = [
      isAbnormal ? `<span style="font-size:10px;font-weight:700;color:#dc2626;background:#fef2f2;padding:2px 8px;border-radius:20px;border:1px solid #fecaca;">⚠ Abnormal</span>` : '',
      isRecurring ? `<span style="font-size:10px;font-weight:700;color:#d97706;background:#fffbeb;padding:2px 8px;border-radius:20px;border:1px solid #fde68a;">↻ Recurring</span>` : '',
      e.escalated ? `<span style="font-size:10px;font-weight:700;color:#7c3aed;background:#faf5ff;padding:2px 8px;border-radius:20px;border:1px solid #ddd6fe;">↑ Escalated</span>` : '',
    ].filter(Boolean).join(' ');

    return `
    <div style="margin-bottom:14px;padding:14px;background:${URGENCY_BG[e.urgency]};border:1px solid ${URGENCY_BORDER[e.urgency]};border-radius:10px;page-break-inside:avoid;">
      <!-- Entry header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:#111827;">${e.condition || e.title}</div>
          ${e.condition && e.title && e.title !== e.condition ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${e.title}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:12px;">
          <span style="font-size:11px;font-weight:700;color:${URGENCY_COLOR[e.urgency]};background:${URGENCY_COLOR[e.urgency]}18;padding:3px 10px;border-radius:20px;">${URGENCY_LABEL[e.urgency]}</span>
          <span style="font-size:11px;font-weight:600;color:${STATUS_COLOR[e.status] ?? '#6b7280'};background:#fff;padding:3px 10px;border-radius:20px;border:1px solid ${STATUS_COLOR[e.status] ?? '#e5e7eb'}44;">${e.status}</span>
        </div>
      </div>

      <!-- Tags -->
      ${tags ? `<div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;">${tags}</div>` : ''}

      <!-- Description -->
      ${e.description ? `<p style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:8px;">${e.description}</p>` : ''}

      <!-- Meta row -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#6b7280;border-top:1px solid ${URGENCY_BORDER[e.urgency]};padding-top:8px;margin-top:4px;">
        <span>📅 <strong>Date:</strong> ${formatDate(e.createdAt)}</span>
        ${e.updatedAt && e.updatedAt !== e.createdAt ? `<span>🔄 <strong>Updated:</strong> ${formatDate(e.updatedAt)}</span>` : ''}
        ${e.confidence > 0 ? `<span>🤖 <strong>AI Confidence:</strong> ${e.confidence}%</span>` : ''}
      </div>

      <!-- Physician Notes -->
      ${e.physicianNotes ? `
      <div style="margin-top:10px;padding:10px;background:#f0f4ff;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;">
        <div style="font-size:10px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">👨‍⚕️ Physician Notes</div>
        <p style="font-size:12px;color:#1e3a8a;line-height:1.6;">${e.physicianNotes}</p>
      </div>` : ''}

      <!-- Prescription -->
      ${rx ? `
      <div style="margin-top:10px;padding:10px;background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 8px 8px 0;">
        <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">💊 Prescription</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tr><td style="color:#6b7280;width:90px;padding:2px 0;">Medicine</td><td style="color:#111827;font-weight:700;">${rx.medicine}</td></tr>
          <tr><td style="color:#6b7280;padding:2px 0;">Dosage</td><td style="color:#111827;font-weight:600;">${rx.dosage}</td></tr>
          <tr><td style="color:#6b7280;padding:2px 0;">Frequency</td><td style="color:#111827;">${rx.frequency}</td></tr>
          <tr><td style="color:#6b7280;padding:2px 0;">Duration</td><td style="color:#111827;">${rx.duration}</td></tr>
          ${rx.instructions ? `<tr><td style="color:#6b7280;padding:2px 0;">Instructions</td><td style="color:#374151;font-style:italic;">${rx.instructions}</td></tr>` : ''}
        </table>
      </div>` : ''}
    </div>`;
  };

  // Month-grouped timeline HTML
  const timelineHTML = groups.map((g) => `
    <div style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;margin-bottom:10px;">
        <span style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">${g.month}</span>
        <div style="flex:1;height:1px;background:#f3f4f6;margin:0 10px;"></div>
        <span style="font-size:11px;color:#9ca3af;">${g.items.length} case${g.items.length !== 1 ? 's' : ''}</span>
      </div>
      ${g.items.map(entryCard).join('')}
    </div>
  `).join('');

  // Key concerns section
  const concernsHTML = abnormal.length > 0 ? `
  <div class="section">
    <h2>⚠ Key Concerns — Abnormal Entries (${abnormal.length})</h2>
    ${abnormal.map(entryCard).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #f9fafb; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 820px; margin: 0 auto; padding: 32px 24px; background: #fff; }
  h2 { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #f3f4f6; }
  .section { margin-bottom: 32px; }
  @media print { .page { padding: 16px; } }
</style>
</head>
<body>
<div class="page">

  <!-- ── Cover Header ── -->
  <div style="padding:24px;margin-bottom:28px;background:linear-gradient(135deg,#0AADA2,#0d7c74);border-radius:16px;color:#fff;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">LifeGate · Comprehensive Health Report</div>
        <div style="font-size:26px;font-weight:800;">${patientName}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:6px;">Generated on ${reportDate}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:.8px;font-weight:600;">Overall Status</div>
        <div style="font-size:22px;font-weight:800;margin-top:4px;">${status.label}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;">${entries.length} total record${entries.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  </div>

  <!-- ── Executive Summary ── -->
  <div class="section">
    <h2>Executive Summary</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${[
        { label: 'Total Cases', value: entries.length, color: '#0891b2' },
        { label: 'Active', value: active, color: '#d97706' },
        { label: 'Completed', value: completed, color: '#16a34a' },
        { label: 'Pending', value: entries.filter((e: HealthTimelineEntry) => e.status === 'Pending').length, color: '#6b7280' },
        { label: 'Abnormal', value: abnormal.length, color: '#dc2626' },
        { label: 'Escalated', value: escalated.length, color: '#7c3aed' },
      ].map((s) => `
        <div style="flex:1;min-width:110px;padding:14px 10px;background:#f9fafb;border-radius:12px;text-align:center;border:1px solid #f3f4f6;">
          <div style="font-size:28px;font-weight:800;color:${s.color};">${s.value}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${s.label}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ── Severity Distribution ── -->
  <div class="section">
    <h2>Severity Distribution</h2>
    <div style="display:flex;gap:10px;">
      ${(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((u) => {
        const total = entries.length || 1;
        const pct = Math.round((dist[u] / total) * 100);
        return `
        <div style="flex:1;padding:14px;background:${URGENCY_BG[u]};border:1px solid ${URGENCY_BORDER[u]};border-radius:12px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${URGENCY_COLOR[u]};">${dist[u]}</div>
          <div style="font-size:10px;font-weight:700;color:${URGENCY_COLOR[u]};text-transform:uppercase;margin-top:3px;">${URGENCY_LABEL[u]}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${pct}% of total</div>
          <!-- Bar -->
          <div style="margin-top:8px;height:4px;background:#e5e7eb;border-radius:2px;">
            <div style="height:4px;background:${URGENCY_COLOR[u]};border-radius:2px;width:${pct}%;"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ── Key Concerns ── -->
  ${concernsHTML}

  <!-- ── Full Diagnosis Timeline ── -->
  <div class="section">
    <h2>Complete Diagnosis Timeline (${entries.length} record${entries.length !== 1 ? 's' : ''})</h2>
    ${timelineHTML}
  </div>

  <!-- ── Footer ── -->
  <div style="margin-top:40px;padding-top:16px;border-top:2px solid #f3f4f6;text-align:center;">
    <div style="font-size:13px;font-weight:700;color:#0AADA2;margin-bottom:6px;">LifeGate · AI-Powered Health Intelligence</div>
    <p style="font-size:11px;color:#9ca3af;line-height:1.6;">This report is generated from data recorded in the LifeGate health platform and covers all ${entries.length} diagnosis record${entries.length !== 1 ? 's' : ''} on file.</p>
    <p style="font-size:11px;color:#9ca3af;margin-top:4px;">It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.</p>
    <p style="font-size:10px;color:#d1d5db;margin-top:8px;">Report ID: LG-${Date.now()} · ${reportDate}</p>
  </div>

</div>
</body>
</html>`;
}

// ─── Report Section Components ────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={14} color="#0AADA2" />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#111827', textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Text>
    </View>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

function EntryRow({ entry, isRecurring, prescription }: { entry: HealthTimelineEntry; isRecurring: boolean; prescription?: DiagnosisPrescription }) {
  const color = URGENCY_COLOR[entry.urgency] ?? '#6b7280';
  const isAbnormal = entry.urgency === 'HIGH' || entry.urgency === 'CRITICAL';

  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginTop: 4, flexShrink: 0 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {entry.condition || entry.title}
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{formatDate(entry.createdAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <View style={{ backgroundColor: color + '18', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color }}>{URGENCY_LABEL[entry.urgency]}</Text>
          </View>
          {entry.escalated && (
            <View style={{ backgroundColor: '#faf5ff', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#7c3aed' }}>↑</Text>
            </View>
          )}
          {isAbnormal && (
            <View style={{ backgroundColor: '#fef2f2', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626' }}>⚠</Text>
            </View>
          )}
          {isRecurring && (
            <View style={{ backgroundColor: '#fffbeb', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#d97706' }}>↻</Text>
            </View>
          )}
        </View>
      </View>
      {/* Description */}
      {!!entry.description && (
        <Text style={{ fontSize: 12, color: '#374151', lineHeight: 18, marginTop: 6, marginLeft: 20 }} numberOfLines={4}>
          {entry.description}
        </Text>
      )}
      {/* Physician Notes */}
      {!!entry.physicianNotes && (
        <View style={{ marginTop: 6, marginLeft: 20, padding: 8, backgroundColor: '#f0f4ff', borderLeftWidth: 2, borderLeftColor: '#2563eb', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#2563eb', marginBottom: 2 }}>PHYSICIAN NOTES</Text>
          <Text style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 17 }} numberOfLines={3}>
            {entry.physicianNotes}
          </Text>
        </View>
      )}
      {/* Prescription */}
      {!!prescription && (
        <View style={{ marginTop: 6, marginLeft: 20, padding: 8, backgroundColor: '#f0fdf4', borderLeftWidth: 2, borderLeftColor: '#16a34a', borderRadius: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d', marginBottom: 4 }}>PRESCRIPTION</Text>
          <Text style={{ fontSize: 12, color: '#166534', fontWeight: '700' }}>{prescription.medicine}</Text>
          <Text style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>{prescription.dosage} · {prescription.frequency} · {prescription.duration}</Text>
          {!!prescription.instructions && (
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>{prescription.instructions}</Text>
          )}
        </View>
      )}
      {/* Confidence */}
      {entry.confidence > 0 && (
        <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, marginLeft: 20 }}>
          AI Confidence: {entry.confidence}%
        </Text>
      )}
    </View>
  );
}

// ─── Export Button ────────────────────────────────────────────────────────────

function ExportButton({
  icon,
  label,
  sublabel,
  color,
  onPress,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  color: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        backgroundColor: pressed ? color + '18' : '#f9fafb',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: color + '33',
        opacity: loading ? 0.6 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={22} color={color} />
      )}
      <Text style={{ fontSize: 11, fontWeight: '700', color, marginTop: 5 }}>{label}</Text>
      <Text style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{sublabel}</Text>
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HealthReportScreen() {
  const { patientTimeline } = useHealthStore();
  const { diagnoses, fetchDiagnoses } = useDiagnosisStore();
  const { user } = useAuthStore();

  // Load diagnoses (which carry prescription data) if not yet fetched
  React.useEffect(() => { if (diagnoses.length === 0) fetchDiagnoses(); }, []);

  // Build id → prescription lookup
  const prescriptionMap = useMemo(() => {
    const map = new Map<string, DiagnosisPrescription>();
    for (const d of diagnoses) { if (d.prescription) map.set(d.id, d.prescription); }
    return map;
  }, [diagnoses]);

  const viewShotRef = useRef<ViewShot>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const patientName = user?.name ?? 'Patient';
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const recurringSet = useMemo(() => detectRecurring(patientTimeline), [patientTimeline]);
  const dist = useMemo(() => urgencyDistribution(patientTimeline), [patientTimeline]);
  const abnormal = useMemo(() => patientTimeline.filter((e) => e.urgency === 'HIGH' || e.urgency === 'CRITICAL'), [patientTimeline]);
  const status = useMemo(() => deriveOverallStatus(patientTimeline), [patientTimeline]);
  const completed = patientTimeline.filter((e) => e.status === 'Completed').length;
  const active = patientTimeline.filter((e) => e.status !== 'Completed').length;
  const escalatedCount = patientTimeline.filter((e) => e.escalated).length;
  const preview = patientTimeline;

  const exportPDF = useCallback(async () => {
    try {
      setExporting('pdf');
      const html = buildReportHTML(patientName, patientTimeline, reportDate, prescriptionMap);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Health Report (PDF)' });
      } else {
        Alert.alert('Saved', `Report saved to: ${uri}`);
      }
    } catch (err) {
      Alert.alert('Export Failed', 'Could not generate the PDF report. Please try again.');
    } finally {
      setExporting(null);
    }
  }, [patientName, patientTimeline, reportDate]);

  const exportImage = useCallback(async (format: 'png' | 'jpeg') => {
    try {
      setExporting(format);
      const ref = viewShotRef.current;
      if (!ref) throw new Error('No view ref');
      // @ts-ignore - capture method exists at runtime
      const uri: string = await ref.capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
          dialogTitle: `Share Health Report (${format.toUpperCase()})`,
        });
      } else {
        Alert.alert('Saved', `Image saved to: ${uri}`);
      }
    } catch (err) {
      Alert.alert('Export Failed', `Could not capture the report as ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  }, []);

  const hasSharingAvailable = Platform.OS !== 'web';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
        <Pressable onPress={() => router.back()} style={{ padding: 6, marginRight: 8, borderRadius: 20, backgroundColor: '#f3f4f6' }} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>Health Report</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>Preview · Export as PDF, PNG or JPEG</Text>
        </View>
        <Pressable
          onPress={exportPDF}
          disabled={exporting !== null}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0AADA2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          {exporting === 'pdf' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="download-outline" size={15} color="#fff" />
          )}
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>PDF</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

        {/* === Report Preview === */}
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1 }}
          style={{ backgroundColor: '#fff' }}
        >
          {/* Report Title Banner */}
          <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 12, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ backgroundColor: '#0AADA2', padding: 20 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>
                LifeGate · Health Report
              </Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 4 }}>{patientName}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>Generated {reportDate}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', fontWeight: '600' }}>Status</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 1 }}>{status.label}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Summary strip */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'Total', value: patientTimeline.length, color: '#0891b2' },
                { label: 'Active', value: active, color: '#d97706' },
                { label: 'Completed', value: completed, color: '#16a34a' },
              ].map((s, i, arr) => (
                <View key={s.label} style={{ flex: 1, borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: '#f3f4f6' }}>
                  <StatCell {...s} />
                </View>
              ))}
            </View>
            <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'Abnormal', value: abnormal.length, color: '#dc2626' },
                { label: 'Escalated', value: escalatedCount, color: '#7c3aed' },
                { label: 'Recurring', value: patientTimeline.filter((e) => recurringSet.has((e.condition || e.title).toLowerCase().trim())).length, color: '#ea580c' },
              ].map((s, i, arr) => (
                <View key={s.label} style={{ flex: 1, borderRightWidth: i < arr.length - 1 ? 1 : 0, borderRightColor: '#f3f4f6' }}>
                  <StatCell {...s} />
                </View>
              ))}
            </View>
          </View>

          {/* Severity Distribution */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 14 }}>
            <SectionHeader title="Severity Distribution" icon="bar-chart-outline" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((u) => {
                const total = patientTimeline.length || 1;
                const pct = Math.round((dist[u] / total) * 100);
                return (
                  <View key={u} style={{ flex: 1, alignItems: 'center', backgroundColor: URGENCY_BG[u], borderRadius: 12, borderWidth: 1, borderColor: URGENCY_BORDER[u], padding: 10 }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: URGENCY_COLOR[u] }}>{dist[u]}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: URGENCY_COLOR[u], marginTop: 2 }}>{URGENCY_LABEL[u]}</Text>
                    <Text style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Key Concerns */}
          {abnormal.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#fecaca', padding: 14 }}>
              <SectionHeader title="Key Concerns" icon="warning-outline" />
              {abnormal.slice(0, 5).map((e) => (
                <View key={e.id} style={{ marginBottom: 8, padding: 10, backgroundColor: URGENCY_BG[e.urgency], borderRadius: 10, borderWidth: 1, borderColor: URGENCY_BORDER[e.urgency] }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1 }} numberOfLines={1}>{e.condition || e.title}</Text>
                    <View style={{ backgroundColor: URGENCY_COLOR[e.urgency] + '22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: URGENCY_COLOR[e.urgency] }}>{URGENCY_LABEL[e.urgency]}</Text>
                    </View>
                  </View>
                  {!!e.description && (
                    <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }} numberOfLines={2}>{e.description}</Text>
                  )}
                  <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{formatDate(e.createdAt)}</Text>
                </View>
              ))}
              {abnormal.length > 5 && (
                <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>+ {abnormal.length - 5} more abnormal entries in full report</Text>
              )}
            </View>
          )}

          {/* Symptom Log */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 14 }}>
            <SectionHeader title={`Symptom Log${patientTimeline.length > 20 ? ` (Latest 20 of ${patientTimeline.length})` : ''}`} icon="list-outline" />
            {preview.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#9ca3af' }}>No records found</Text>
              </View>
            ) : (
              preview.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  isRecurring={recurringSet.has((e.condition || e.title).toLowerCase().trim())}
                  prescription={prescriptionMap.get(e.id)}
                />
              ))
            )}
          </View>

          {/* Disclaimer */}
          <View style={{ marginHorizontal: 16, marginBottom: 16, padding: 14, backgroundColor: '#f9fafb', borderRadius: 14 }}>
            <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', lineHeight: 16 }}>
              This report is generated from LifeGate health data and is not a substitute for professional medical advice, diagnosis, or treatment.
            </Text>
          </View>
        </ViewShot>
      </ScrollView>

      {/* Export Actions Bar (fixed bottom) */}
      {hasSharingAvailable && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6',
          paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, textAlign: 'center' }}>
            Export Report As
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ExportButton
              icon="document-text-outline"
              label="PDF"
              sublabel="Full report"
              color="#0AADA2"
              onPress={exportPDF}
              loading={exporting === 'pdf'}
            />
            <ExportButton
              icon="image-outline"
              label="PNG"
              sublabel="Lossless image"
              color="#2563eb"
              onPress={() => exportImage('png')}
              loading={exporting === 'png'}
            />
            <ExportButton
              icon="camera-outline"
              label="JPEG"
              sublabel="Compressed image"
              color="#7c3aed"
              onPress={() => exportImage('jpeg')}
              loading={exporting === 'jpeg'}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
