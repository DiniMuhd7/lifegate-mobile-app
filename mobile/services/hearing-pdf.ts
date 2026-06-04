/**
 * hearing-pdf.ts
 * Generates a styled HTML report for the hearing test results and opens it
 * in a new browser tab with an automatic print dialog for Save-as-PDF.
 *
 * Web-only — guard with Platform.OS === 'web' before calling openHearingPDF.
 */

import type {
  HearingSession,
  EarResult,
  FrequencyThreshold,
  PTAFrequency,
  WHOGrade,
  SINResult,
  HFResult,
  BehavioralReport,
  ReliabilityGrade,
} from 'types/hearing-types';
import { PTA_FREQUENCIES, HF_FREQUENCIES } from 'types/hearing-types';
import { generateAIHearingInterpretation } from 'services/hearing-ai-engine';
import type { SensorInterpretResponse } from 'services/sensor-interpretation-service';

// ─── Colours ──────────────────────────────────────────────────────────────────
const TEAL      = '#0AADA2';
const TEAL_DARK = '#0f766e';
const RIGHT_COLOR = '#ef4444';
const LEFT_COLOR  = '#3b82f6';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface HearingPDFOptions {
  session: HearingSession | null;
  sinResult: SINResult | null;
  hfResult: HFResult | null;
  /** Logged-in user for the patient header */
  user: { name?: string; dob?: string; gender?: string } | null;
  /** Pre-computed age, or undefined */
  userAge?: number;
  /** EDIS result if available */
  edisResult?: SensorInterpretResponse | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pill(label: string, bg: string, color: string): string {
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:8px;padding:3px 12px;font-size:12px;font-weight:700;">${esc(label)}</span>`;
}

function tag(label: string, color = '#374151', bg = '#f3f4f6'): string {
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;">${esc(label)}</span>`;
}

// ─── WHO labels ───────────────────────────────────────────────────────────────

const WHO_GRADE_LABELS: Record<WHOGrade, string> = {
  0: 'Normal Hearing',
  1: 'Slight Hearing Loss',
  2: 'Moderate Hearing Loss',
  3: 'Moderately Severe Hearing Loss',
  4: 'Severe / Profound Hearing Loss',
};

const WHO_GRADE_COLOR: Record<WHOGrade, string> = {
  0: '#16a34a',
  1: '#65a30d',
  2: '#d97706',
  3: '#ea580c',
  4: '#dc2626',
};

const WHO_GRADE_BG: Record<WHOGrade, string> = {
  0: '#f0fdf4',
  1: '#f7fee7',
  2: '#fffbeb',
  3: '#fff7ed',
  4: '#fef2f2',
};

// ─── Audiogram SVG ────────────────────────────────────────────────────────────

const SVG_W  = 560;
const SVG_H  = 300;
const ML = 52; // margin left  (space for dBHL labels)
const MR = 20; // margin right
const MT = 20; // margin top
const MB = 36; // margin bottom (space for freq labels)
const CW = SVG_W - ML - MR; // chart width  = 488
const CH = SVG_H - MT - MB; // chart height = 244

const DBHL_MIN = -10;
const DBHL_MAX = 90;
const DB_RANGE  = DBHL_MAX - DBHL_MIN;

const FREQ_X: Record<number, number> = {};
PTA_FREQUENCIES.forEach((f, i) => {
  FREQ_X[f] = ML + (i / (PTA_FREQUENCIES.length - 1)) * CW;
});

function svgX(freq: number): number { return FREQ_X[freq] ?? ML; }
function svgY(dbHL: number): number {
  return MT + ((dbHL - DBHL_MIN) / DB_RANGE) * CH;
}

function freqLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function audiogramSVG(
  right: FrequencyThreshold[],
  left:  FrequencyThreshold[],
): string {
  const gridLines = [-10, 0, 10, 20, 25, 30, 40, 50, 60, 70, 80, 90];

  let lines = '';
  // Grid lines
  gridLines.forEach((db) => {
    const y = svgY(db);
    const isNormal = db === 25;
    lines += `<line x1="${ML}" x2="${SVG_W - MR}" y1="${y}" y2="${y}" stroke="${isNormal ? '#86efac' : '#f3f4f6'}" stroke-width="${isNormal ? 1.5 : 1}" stroke-dasharray="${isNormal ? '0' : '3 3'}" />`;
  });

  // Normal hearing zone shading (0–25 dBHL)
  const y0  = svgY(0);
  const y25 = svgY(25);
  lines += `<rect x="${ML}" y="${y0}" width="${CW}" height="${y25 - y0}" fill="#f0fdf4" opacity="0.6" />`;

  // Y-axis labels
  [0, 20, 25, 40, 60, 80].forEach((db) => {
    lines += `<text x="${ML - 6}" y="${svgY(db) + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${db}</text>`;
  });

  // X-axis frequency labels
  PTA_FREQUENCIES.forEach((f) => {
    lines += `<text x="${svgX(f)}" y="${SVG_H - MB + 16}" text-anchor="middle" font-size="9" fill="#9ca3af">${freqLabel(f)} Hz</text>`;
  });

  // dBHL axis label (rotated)
  lines += `<text transform="rotate(-90)" x="${-(MT + CH / 2)}" y="${ML - 36}" text-anchor="middle" font-size="9" fill="#9ca3af">Hearing Level (dBHL)</text>`;

  // Legend
  lines += `<circle cx="${ML + 20}" cy="${MT - 8}" r="5" fill="none" stroke="${RIGHT_COLOR}" stroke-width="2.5" />`;
  lines += `<text x="${ML + 30}" y="${MT - 4}" font-size="10" fill="${RIGHT_COLOR}" font-weight="600">Right Ear (○)</text>`;
  lines += `<line x1="${ML + 120}" x2="${ML + 132}" y1="${MT - 8}" y2="${MT - 2}" stroke="${LEFT_COLOR}" stroke-width="2.5" />`;
  lines += `<line x1="${ML + 120}" x2="${ML + 132}" y1="${MT - 2}" y2="${MT - 8}" stroke="${LEFT_COLOR}" stroke-width="2.5" />`;
  lines += `<text x="${ML + 138}" y="${MT - 4}" font-size="10" fill="${LEFT_COLOR}" font-weight="600">Left Ear (×)</text>`;

  // Right ear — circles + connecting lines
  const rightSorted = [...right].sort((a, b) => PTA_FREQUENCIES.indexOf(a.frequency) - PTA_FREQUENCIES.indexOf(b.frequency));
  for (let i = 1; i < rightSorted.length; i++) {
    const a = rightSorted[i - 1], b = rightSorted[i];
    lines += `<line x1="${svgX(a.frequency)}" y1="${svgY(a.dbHL)}" x2="${svgX(b.frequency)}" y2="${svgY(b.dbHL)}" stroke="${RIGHT_COLOR}" stroke-width="1.5" stroke-opacity="0.5" />`;
  }
  rightSorted.forEach((t) => {
    lines += `<circle cx="${svgX(t.frequency)}" cy="${svgY(t.dbHL)}" r="7" fill="none" stroke="${RIGHT_COLOR}" stroke-width="2.5" />`;
  });

  // Left ear — X marks + connecting lines
  const leftSorted = [...left].sort((a, b) => PTA_FREQUENCIES.indexOf(a.frequency) - PTA_FREQUENCIES.indexOf(b.frequency));
  for (let i = 1; i < leftSorted.length; i++) {
    const a = leftSorted[i - 1], b = leftSorted[i];
    lines += `<line x1="${svgX(a.frequency)}" y1="${svgY(a.dbHL)}" x2="${svgX(b.frequency)}" y2="${svgY(b.dbHL)}" stroke="${LEFT_COLOR}" stroke-width="1.5" stroke-opacity="0.5" />`;
  }
  leftSorted.forEach((t) => {
    const cx = svgX(t.frequency), cy = svgY(t.dbHL), d = 6;
    lines += `<line x1="${cx - d}" y1="${cy - d}" x2="${cx + d}" y2="${cy + d}" stroke="${LEFT_COLOR}" stroke-width="2.5" />`;
    lines += `<line x1="${cx + d}" y1="${cy - d}" x2="${cx - d}" y2="${cy + d}" stroke="${LEFT_COLOR}" stroke-width="2.5" />`;
  });

  // Border
  lines += `<rect x="${ML}" y="${MT}" width="${CW}" height="${CH}" fill="none" stroke="#e5e7eb" stroke-width="1" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" style="width:100%;max-width:${SVG_W}px;">${lines}</svg>`;
}

// ─── Frequency threshold table ────────────────────────────────────────────────

function thresholdTable(right: FrequencyThreshold[], left: FrequencyThreshold[]): string {
  const gradeColor = (db: number) => db <= 25 ? '#16a34a' : db <= 40 ? '#d97706' : db <= 60 ? '#ea580c' : '#dc2626';
  const getDb = (arr: FrequencyThreshold[], f: number) => arr.find((t) => t.frequency === f)?.dbHL;

  let rows = '';
  PTA_FREQUENCIES.forEach((f) => {
    const rDb = getDb(right, f);
    const lDb = getDb(left, f);
    rows += `
    <tr>
      <td style="font-weight:600;color:#374151;">${freqLabel(f)} Hz</td>
      <td style="text-align:center;font-weight:700;color:${rDb !== undefined ? gradeColor(rDb) : '#9ca3af'};">${rDb !== undefined ? `${rDb} dBHL` : '—'}</td>
      <td style="text-align:center;font-weight:700;color:${lDb !== undefined ? gradeColor(lDb) : '#9ca3af'};">${lDb !== undefined ? `${lDb} dBHL` : '—'}</td>
    </tr>`;
  });

  return `
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Frequency</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:${RIGHT_COLOR};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Right (○)</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:${LEFT_COLOR};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Left (×)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

// ─── Ear summary card ─────────────────────────────────────────────────────────

function earCard(ear: EarResult | null, label: string, color: string): string {
  const symbol = label === 'Right Ear' ? '○' : '×';

  if (!ear) {
    return `
    <div class="card" style="opacity:0.5;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:16px;background:${color}20;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:${color};">${symbol}</div>
        <span style="font-size:13px;color:#9ca3af;">${esc(label)} — not tested</span>
      </div>
    </div>`;
  }

  const who   = ear.who;
  const gc    = WHO_GRADE_COLOR[who.grade];
  const gbg   = WHO_GRADE_BG[who.grade];
  const shape = ear.audiogramShape;
  const shapeLabels: Record<string, string> = {
    normal: 'Normal', flat: 'Flat', sloping: 'Sloping (High-Freq Loss)',
    rising: 'Rising (Low-Freq Loss)', notch: '4 kHz Notch (NIHL pattern)',
    cookie_bite: 'Cookie-bite (Mid-Freq)', irregular: 'Irregular',
  };

  // Threshold chips
  const thresholdChips = ear.thresholds.map((t) => {
    const chipBg = t.dbHL <= 25 ? '#f0fdf4' : t.dbHL <= 40 ? '#fefce8' : '#fff7ed';
    const chipFg = t.dbHL <= 25 ? '#16a34a' : t.dbHL <= 40 ? '#d97706' : '#ea580c';
    const fl = t.frequency >= 1000 ? `${t.frequency / 1000}k` : `${t.frequency}`;
    return `<div style="background:${chipBg};border-radius:8px;padding:5px 8px;text-align:center;min-width:54px;display:inline-block;margin:3px;">
      <div style="font-size:11px;font-weight:700;color:${chipFg};">${t.dbHL} dBHL</div>
      <div style="font-size:9px;color:#9ca3af;">${fl} Hz</div>
    </div>`;
  }).join('');

  return `
  <div class="card" style="border-color:#f3f4f6;">
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="width:32px;height:32px;border-radius:16px;background:${color}20;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:${color};">${symbol}</div>
      <div style="flex:1;font-size:15px;font-weight:800;color:#111827;">${esc(label)}</div>
      <span style="background:${gc}20;color:${gc};border-radius:10px;padding:4px 10px;font-size:12px;font-weight:700;">Grade ${who.grade}</span>
    </div>

    <!-- WHO classification block -->
    <div style="background:${gbg};border-radius:10px;padding:10px;margin-bottom:10px;">
      <div style="font-size:14px;font-weight:800;color:${gc};">${esc(WHO_GRADE_LABELS[who.grade])}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px;">${esc(who.description ?? '')}</div>
    </div>

    <!-- PTA3 + Shape row -->
    <div style="display:flex;gap:10px;margin-bottom:10px;">
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:900;color:#111827;">${who.pureTonaAverage.toFixed(0)}</div>
        <div style="font-size:10px;color:#6b7280;">PTA3 dBHL</div>
      </div>
      <div style="flex:1.5;background:#f9fafb;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#111827;">${esc(shapeLabels[shape] ?? shape)}</div>
        <div style="font-size:10px;color:#6b7280;">Audiogram Shape</div>
      </div>
    </div>

    <!-- Threshold chips -->
    <div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Threshold by Frequency</div>
      <div style="display:flex;flex-wrap:wrap;gap:0;">${thresholdChips}</div>
    </div>

    <!-- Recommendation -->
    ${who.recommendation ? `
    <div style="background:#eff6ff;border-radius:10px;padding:10px;display:flex;gap:8px;align-items:flex-start;">
      <span style="font-size:14px;flex-shrink:0;">ℹ️</span>
      <span style="font-size:12px;color:#1e40af;line-height:1.6;">${esc(who.recommendation)}</span>
    </div>` : ''}
  </div>`;
}

// ─── SIN result section ───────────────────────────────────────────────────────

function sinSection(sin: SINResult): string {
  const gradeColors: Record<string, string> = {
    normal: '#16a34a', mild: '#d97706', moderate: '#ea580c', severe: '#dc2626',
  };
  const gradeIcons: Record<string, string> = {
    normal: '✅', mild: '⚠️', moderate: '🔶', severe: '🔴',
  };
  const gc = gradeColors[sin.grade] ?? '#374151';
  const gi = gradeIcons[sin.grade] ?? 'ℹ️';

  return `
  <div class="card" style="border-color:#f3f4f6;">
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:22px;">${gi}</span>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:800;color:#111827;">Speech-in-Noise</div>
        <div style="font-size:11px;color:#6b7280;">QuickSIN-inspired protocol</div>
      </div>
      <span style="background:${gc}20;color:${gc};border-radius:10px;padding:4px 10px;font-size:12px;font-weight:700;">${sin.grade.toUpperCase()}</span>
    </div>

    <!-- Grade block -->
    <div style="background:${gc}10;border-radius:10px;padding:10px;margin-bottom:12px;">
      <div style="font-size:14px;font-weight:800;color:${gc};">${esc(sin.label)}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px;">${esc(sin.recommendation)}</div>
    </div>

    <!-- Metrics -->
    <div style="display:flex;gap:10px;margin-bottom:12px;">
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:#111827;">${sin.snr50.toFixed(1)}</div>
        <div style="font-size:10px;color:#6b7280;">SNR₅₀ (dBSNR)</div>
      </div>
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:${sin.snrLoss > 7 ? '#ea580c' : '#111827'};">${sin.snrLoss.toFixed(1)}</div>
        <div style="font-size:10px;color:#6b7280;">SNR Loss (dB)</div>
      </div>
      <div style="flex:1;background:#f9fafb;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:#111827;">${sin.trials.length}</div>
        <div style="font-size:10px;color:#6b7280;">Levels tested</div>
      </div>
    </div>

    <!-- Note -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px;font-size:11px;color:#92400e;line-height:1.6;">
      <strong>Note:</strong> This test uses tones in noise. Clinical QuickSIN uses sentence lists, which also measures phoneme discrimination. A tone-based result may underestimate real-world speech-in-noise difficulty. A formal audiologist assessment is recommended if any noise-related difficulty is experienced.
    </div>
  </div>`;
}

// ─── HF result section ────────────────────────────────────────────────────────

function hfSection(hf: HFResult): string {
  const patColors: Record<string, string> = {
    normal: '#16a34a', mild_hf_loss: '#d97706',
    early_nihl: '#dc2626', significant_hf_loss: '#dc2626',
  };
  const patLabels: Record<string, string> = {
    normal: 'Normal HF Hearing', mild_hf_loss: 'Mild HF Loss',
    early_nihl: 'NIHL Pattern (Early)', significant_hf_loss: 'Significant HF Loss',
  };
  const patIcons: Record<string, string> = {
    normal: '✅', mild_hf_loss: '⚠️', early_nihl: '🔴', significant_hf_loss: '🔴',
  };
  const gc = patColors[hf.pattern] ?? '#374151';

  // Vertical bar chart — matches HFResultCard UI
  const BAR_MAX_H = 60;
  const DBHL_MAX  = 80;
  const barCols = hf.thresholds.map((t) => {
    const barH = Math.max(6, (t.dbHL / DBHL_MAX) * BAR_MAX_H);
    const bc = t.dbHL <= 25 ? '#16a34a' : t.dbHL <= 40 ? '#d97706' : '#dc2626';
    const fl = t.frequency >= 1000 ? `${t.frequency / 1000}k` : `${t.frequency}`;
    return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:50px;">
      <span style="font-size:10px;font-weight:700;color:${bc};">${t.dbHL} dB</span>
      <div style="display:flex;align-items:flex-end;height:${BAR_MAX_H}px;">
        <div style="width:36px;height:${barH}px;background:${bc};border-radius:4px;opacity:0.85;"></div>
      </div>
      <span style="font-size:9px;color:#9ca3af;">${fl} Hz</span>
    </div>`;
  }).join('');

  return `
  <div class="card" style="border-color:#f3f4f6;">
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:22px;">${patIcons[hf.pattern] ?? 'ℹ️'}</span>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:800;color:#111827;">High-Frequency Test</div>
        <div style="font-size:11px;color:#6b7280;">9 – 12 kHz extended range</div>
      </div>
      ${hf.nihlRiskFlag ? `<span style="background:#fee2e2;border-radius:10px;padding:4px 8px;font-size:11px;font-weight:700;color:#dc2626;">⚠️ NIHL</span>` : ''}
    </div>

    <!-- Pattern block -->
    <div style="background:${gc}10;border-radius:10px;padding:10px;margin-bottom:14px;">
      <div style="font-size:14px;font-weight:800;color:${gc};">${patLabels[hf.pattern] ?? hf.pattern}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px;">HF Average: ${hf.hfAverage} dBHL</div>
    </div>

    <!-- Vertical bar chart -->
    <div style="display:flex;justify-content:space-around;align-items:flex-end;padding:4px 0;">${barCols}</div>
  </div>`;
}

// ─── Reliability section ──────────────────────────────────────────────────────

function reliabilitySection(report: BehavioralReport, ear: string): string {
  const gradeColors: Record<string, string> = {
    excellent: '#16a34a', good: '#65a30d', fair: '#d97706', poor: '#dc2626',
  };
  const gradeLabels: Record<string, string> = {
    excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor',
  };
  const gc = gradeColors[report.reliabilityGrade] ?? '#374151';
  const gl = gradeLabels[report.reliabilityGrade] ?? report.reliabilityGrade;

  // Key metric chips
  const metrics = [
    { label: 'Avg RT (ms)', value: report.globalMeanReactionMs > 0 ? `${report.globalMeanReactionMs}` : '—', warn: false },
    { label: 'RT Variability', value: report.globalReactionCV > 0 ? report.globalReactionCV.toFixed(2) : '—', warn: report.globalReactionCV > 0.5 },
    { label: 'Fast Responses', value: `${Math.round(report.spuriousFastRate * 100)}%`, warn: report.spuriousFastRate > 0.1 },
    { label: 'Missed Tones', value: `${Math.round(report.suprathresholdMissRate * 100)}%`, warn: report.suprathresholdMissRate > 0.1 },
  ];
  const metricChips = metrics.map((m) => `
    <div style="flex:1;background:#f9fafb;border-radius:10px;padding:8px;text-align:center;min-width:70px;">
      <div style="font-size:14px;font-weight:900;color:${m.warn ? '#d97706' : '#111827'};">${m.value}</div>
      <div style="font-size:9px;color:#6b7280;margin-top:2px;">${m.label}</div>
    </div>`).join('');

  // Convergence chips
  const convChips = report.frequencyMetrics.map((fm) => {
    const cc = fm.confidence === 'high' ? '#16a34a' : fm.confidence === 'medium' ? '#d97706' : '#dc2626';
    const fl = fm.frequency >= 1000 ? `${fm.frequency / 1000}k` : `${fm.frequency}`;
    return `<div style="background:${cc}12;border:1px solid ${cc}30;border-radius:8px;padding:5px 8px;text-align:center;min-width:52px;display:inline-block;margin:3px;">
      <div style="font-size:11px;font-weight:800;color:${cc};">${fl}</div>
      <div style="font-size:9px;color:${cc};margin-top:1px;">${fm.ascendingReversalCount}/3 rev</div>
    </div>`;
  }).join('');

  // Flag rows
  const flagRows = report.flags.slice(0, 5).map((f) => `
    <div style="padding:8px 10px;background:${f.severity === 'warning' ? '#fffbeb' : '#f9fafb'};border-radius:9px;margin-bottom:5px;font-size:12px;color:${f.severity === 'warning' ? '#92400e' : '#374151'};line-height:1.5;">
      ${f.severity === 'warning' ? '⚠️ ' : ''}${esc(f.description)}
    </div>`).join('');

  return `
  <div class="card" style="border-color:#f3f4f6;">
    <!-- Header row with score ring -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <div style="width:48px;height:48px;border-radius:24px;border:3px solid ${gc};background:${gc}12;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-size:14px;font-weight:900;color:${gc};">${report.reliabilityScore}</span>
      </div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:800;color:#111827;">${esc(ear)} — Reliability</div>
        <span style="display:inline-block;background:${gc}20;color:${gc};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;margin-top:3px;">${gl}</span>
      </div>
    </div>

    <!-- Key metrics -->
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">${metricChips}</div>

    <!-- Convergence chips -->
    ${report.frequencyMetrics.length > 0 ? `
    <div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Convergence by Frequency</div>
      <div>${convChips}</div>
    </div>` : ''}

    <!-- Flags -->
    ${report.flags.length > 0 ? `
    <div>
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Observations</div>
      ${flagRows}
    </div>` : `
    <div style="background:#f0fdf4;border-radius:10px;padding:10px;font-size:12px;color:#166534;">✓ No reliability concerns detected.</div>`}
  </div>`;
}

// ─── AI Interpretation section ────────────────────────────────────────────────

function aiSection(opts: HearingPDFOptions): string {
  const ai = generateAIHearingInterpretation(
    opts.session?.rightEar ?? null,
    opts.session?.leftEar  ?? null,
    opts.sinResult,
    opts.hfResult,
  );

  const pc = (() => {
    const map: Record<string, string> = {
      normal: '#16a34a', noise_induced: '#dc2626', presbycusis: '#7c3aed',
      sloping_hf: '#d97706', flat: '#6b7280', rising: '#3b82f6',
      cookie_bite: '#ea580c', mixed: '#92400e', irregular: '#9ca3af',
    };
    return map[ai.pattern.dominant] ?? '#374151';
  })();

  const confColor = ai.confidenceGrade === 'high' ? '#16a34a'
    : ai.confidenceGrade === 'moderate' ? '#d97706' : '#dc2626';

  const symmetryColor = ai.symmetry === 'symmetric' ? '#16a34a'
    : ai.symmetry === 'asymmetric' ? '#dc2626' : '#6b7280';

  const remarkRows = ai.remarks.slice(0, 6).map((r) => `
  <div style="padding:8px 10px;background:${r.type === 'warning' ? '#fffbeb' : r.type === 'finding' ? '#f0fdfc' : r.type === 'suggestion' ? '#f5f3ff' : '#f9fafb'};border-radius:8px;margin-bottom:6px;font-size:12px;color:#374151;line-height:1.5;">
    ${esc(r.text)}
  </div>`).join('');

  const evidRows = ai.pattern.evidencePoints.slice(0, 4).map((pt) =>
    `<div style="font-size:11px;color:#6b7280;padding:2px 0;">• ${esc(pt)}</div>`
  ).join('');

  return `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:10px;background:#f0fdfc;display:flex;align-items:center;justify-content:center;font-size:18px;">✨</div>
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:800;color:#111827;">AI Interpretation</div>
        <div style="font-size:11px;color:#9ca3af;">Algorithmic clinical insights — not a diagnosis</div>
      </div>
      <span style="background:${confColor}20;color:${confColor};border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800;">${ai.confidenceScore}% confidence</span>
    </div>

    <div style="margin-bottom:12px;padding:12px;background:${pc}0e;border-radius:12px;border:1px solid ${pc}30;">
      <div style="font-size:13px;font-weight:800;color:${pc};margin-bottom:5px;">${esc(ai.pattern.label)}</div>
      <div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:8px;">${esc(ai.pattern.note)}</div>
      ${evidRows}
    </div>

    <div class="row-item">
      <span class="row-label">Binaural Symmetry</span>
      <span class="row-value" style="color:${symmetryColor};">${esc(ai.symmetry.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}</span>
    </div>
    <div style="font-size:11px;color:#6b7280;margin-top:4px;margin-bottom:10px;">${esc(ai.symmetryNote)}</div>

    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Remarks</div>
    ${remarkRows}
  </div>`;
}

// ─── EDIS section ─────────────────────────────────────────────────────────────

function edisSection(edis: SensorInterpretResponse): string {
  const urgColor: Record<string, string> = {
    LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626', CRITICAL: '#7c2d12',
  };
  const urg  = (edis.urgency ?? 'LOW').toUpperCase();
  const gc   = urgColor[urg] ?? '#374151';

  const condRows = edis.conditions.slice(0, 5).map((c) => {
    const bc = c.confidence >= 70 ? TEAL : c.confidence >= 40 ? '#d97706' : '#9ca3af';
    return `
    <div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:700;color:#111827;">${esc(c.condition)}</span>
        <span style="font-size:12px;font-weight:800;color:${bc};">${c.confidence}%</span>
      </div>
      <div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;margin-bottom:4px;">
        <div style="height:4px;width:${c.confidence}%;background:${bc};border-radius:2px;"></div>
      </div>
      ${c.description ? `<div style="font-size:11px;color:#6b7280;">${esc(c.description)}</div>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:10px;background:#f0fdfc;display:flex;align-items:center;justify-content:center;font-size:18px;">☁</div>
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:800;color:#111827;">LifeGate Interpretation</div>
        <div style="font-size:11px;color:#9ca3af;">Powered by DSHub</div>
      </div>
      <span style="background:${gc}20;color:${gc};border-radius:8px;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase;">${esc(urg)}</span>
    </div>
    ${edis.assessment ? `<div style="padding:10px;background:#f8fafc;border-radius:10px;margin-bottom:12px;font-size:13px;color:#374151;line-height:1.5;">${esc(edis.assessment)}</div>` : ''}
    ${edis.conditions.length > 0 ? `<div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Differential / Conditions</div>${condRows}` : ''}
    ${edis.needsPhysicianReview ? `<div style="padding:8px 10px;background:#eff6ff;border-radius:8px;font-size:12px;color:#1e40af;font-weight:600;">Physician review recommended — share these results with a healthcare provider.</div>` : ''}
  </div>`;
}

// ─── Full HTML builder ────────────────────────────────────────────────────────

function buildHTML(opts: HearingPDFOptions): string {
  const { session, sinResult, hfResult, user, userAge, edisResult } = opts;

  const rightEar = session?.rightEar ?? null;
  const leftEar  = session?.leftEar  ?? null;

  const rightThresholds: FrequencyThreshold[] = rightEar
    ? PTA_FREQUENCIES.map((f) => {
        const found = rightEar.thresholds.find((t) => t.frequency === f);
        return found ?? { frequency: f, dbHL: 0, trialCount: 0 };
      }).filter((t) => rightEar.thresholds.some((th) => th.frequency === t.frequency))
    : [];

  const leftThresholds: FrequencyThreshold[] = leftEar
    ? PTA_FREQUENCIES.map((f) => {
        const found = leftEar.thresholds.find((t) => t.frequency === f);
        return found ?? null;
      }).filter((t): t is FrequencyThreshold => t !== null && leftEar.thresholds.some((th) => th.frequency === t.frequency))
    : [];

  const rightWHO  = rightEar?.who ?? null;
  const leftWHO   = leftEar?.who  ?? null;
  const worstGrade = Math.max(rightWHO?.grade ?? 0, leftWHO?.grade ?? 0) as WHOGrade;

  const testDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const heroName   = user?.name ?? '';
  const heroAge    = userAge ? `Age ${userAge}` : '';
  const heroGender = user?.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hearing Test Results — ${new Date().toLocaleDateString()}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f8fafc;
      color: #111827;
      padding: 0 0 40px;
    }
    .hero {
      background: linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%);
      color: #fff;
      padding: 28px 32px 28px;
      text-align: center;
      margin-bottom: 0;
    }
    .content { max-width: 700px; margin: 0 auto; padding: 20px 24px; }
    .card {
      background: #fff;
      border-radius: 16px;
      border: 1.5px solid #e5e7eb;
      padding: 16px;
      margin-bottom: 14px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 800;
      color: #374151;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .row-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 13px;
    }
    .row-label { color: #6b7280; }
    .row-value { font-weight: 700; color: #111827; }
    .sub-text { font-size: 11px; color: #9ca3af; margin-top: 4px; }
    .section-header {
      font-size: 11px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin: 20px 0 10px;
    }
    .disclaimer {
      background: #fffbeb;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 11px;
      color: #92400e;
      line-height: 1.6;
      border: 1px solid #fde68a;
      margin-top: 20px;
    }
    .print-btn {
      display: block;
      width: 200px;
      margin: 24px auto 0;
      padding: 12px 0;
      background: ${TEAL};
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      text-align: center;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-btn { display: none; }
      .card { break-inside: avoid; }
      .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- Hero — mirrors LinearGradient in results.tsx -->
  <div class="hero">
    <div style="max-width:700px;margin:0 auto;">
      <!-- Ear icon circle -->
      <div style="width:68px;height:68px;border-radius:34px;background:rgba(255,255,255,0.20);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:42px;line-height:1;">👂</div>

      <!-- Patient name -->
      ${heroName ? `<div style="font-size:15px;font-weight:800;color:#fff;margin-bottom:6px;">${esc(heroName)}</div>` : ''}

      <!-- Age + Gender chips -->
      ${(heroAge || heroGender) ? `
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px;">
        ${heroAge    ? `<span style="background:rgba(255,255,255,0.18);border-radius:12px;padding:3px 10px;font-size:12px;color:#fff;font-weight:600;">${esc(heroAge)}</span>`    : ''}
        ${heroGender ? `<span style="background:rgba(255,255,255,0.18);border-radius:12px;padding:3px 10px;font-size:12px;color:#fff;font-weight:600;">${esc(heroGender)}</span>` : ''}
      </div>` : ''}

      <!-- WHO grade label -->
      <div style="font-size:21px;font-weight:900;color:#fff;">${esc(WHO_GRADE_LABELS[worstGrade])}</div>

      <!-- Subtitle -->
      <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:6px;">Pure Tone Audiometry · ${esc(testDate)}</div>

      <!-- Grade badge -->
      <div style="display:inline-block;background:rgba(255,255,255,0.22);border-radius:20px;padding:5px 12px;margin-top:10px;font-size:13px;font-weight:900;color:#fff;">Grade ${worstGrade}</div>

      <!-- PTA pills -->
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
        <span style="background:rgba(255,255,255,0.18);border-radius:20px;padding:4px 11px;font-size:12px;color:#fff;font-weight:600;">
          ○ Right: ${rightWHO ? `${rightWHO.pureTonaAverage.toFixed(0)} dBHL` : '—'}
        </span>
        <span style="background:rgba(255,255,255,0.18);border-radius:20px;padding:4px 11px;font-size:12px;color:#fff;font-weight:600;">
          × Left: ${leftWHO ? `${leftWHO.pureTonaAverage.toFixed(0)} dBHL` : '—'}
        </span>
      </div>
    </div>
  </div>

  <div class="content">

    <!-- Audiogram -->
    <div class="card">
      <div class="card-title">Audiogram — Pure Tone Thresholds</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">Lower dBHL = better hearing. Normal range: 0–25 dBHL (shaded green).</div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:11px;color:#92400e;">
        ⚠ Consumer headphones vary by ±10–15 dBHL. These are screening results, not calibrated audiometry.
      </div>
      ${audiogramSVG(rightThresholds, leftThresholds)}
    </div>

    <!-- Frequency threshold table -->
    <div class="card">
      <div class="card-title">Frequency-by-Frequency Thresholds</div>
      ${thresholdTable(rightThresholds, leftThresholds)}
    </div>

    <!-- Per-ear cards -->
    <div class="section-header">Ear Classification</div>
    ${earCard(rightEar, 'Right Ear', RIGHT_COLOR)}
    ${rightEar?.behavioralReport ? reliabilitySection(rightEar.behavioralReport, 'Right Ear') : ''}
    ${earCard(leftEar, 'Left Ear', LEFT_COLOR)}
    ${leftEar?.behavioralReport ? reliabilitySection(leftEar.behavioralReport, 'Left Ear') : ''}

    <!-- Extended tests -->
    ${sinResult || hfResult ? `<div class="section-header">Extended Tests</div>` : ''}
    ${sinResult ? sinSection(sinResult) : ''}
    ${hfResult  ? hfSection(hfResult)   : ''}

    <!-- Interpretation -->
    <div class="section-header">Clinical Interpretation</div>
    ${edisResult?.success ? edisSection(edisResult) : aiSection(opts)}

    <!-- Disclaimer -->
    <div class="disclaimer">
      ⚠ This is a screening tool only and does not constitute a clinical diagnosis. Results may be affected by device limitations, ambient noise, headphone type, and patient cooperation. Consult a licensed audiologist for a formal Pure Tone Audiometric evaluation and confirmation of any abnormal findings.
    </div>

    <button class="print-btn" onclick="window.print()">Save as PDF / Print</button>
  </div>

<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens the hearing test results as a styled HTML report in a new browser tab.
 * The print dialog opens automatically, allowing the user to save as PDF.
 * Must only be called when `Platform.OS === 'web'`.
 */
export function openHearingPDF(opts: HearingPDFOptions): void {
  const html = buildHTML(opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
