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
  user: { name?: string; dob?: string } | null;
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
  if (!ear) {
    return `
    <div class="card" style="border-color:#e5e7eb;opacity:0.5;">
      <div class="card-title" style="color:${color};">${esc(label)}</div>
      <p style="font-size:12px;color:#9ca3af;">Not tested.</p>
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

  return `
  <div class="card" style="background:${gbg};border-color:${gc}40;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:20px;font-weight:900;color:${color};">${label === 'Right Ear' ? '○' : '×'}</div>
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:800;color:#111827;">${esc(label)}</div>
        <div style="font-size:11px;color:#9ca3af;">Audiometry result</div>
      </div>
      <span style="background:${gc};color:#fff;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:900;">Grade ${who.grade}</span>
    </div>
    <div class="row-item">
      <span class="row-label">WHO Classification</span>
      <span class="row-value" style="color:${gc};">${esc(WHO_GRADE_LABELS[who.grade])}</span>
    </div>
    <div class="row-item">
      <span class="row-label">PTA3 Average</span>
      <span class="row-value" style="color:${gc};">${who.pureTonaAverage} dBHL</span>
    </div>
    <div class="row-item">
      <span class="row-label">Audiogram Shape</span>
      <span class="row-value">${esc(shapeLabels[shape] ?? shape)}</span>
    </div>
    <div style="margin-top:8px;padding:8px 10px;background:#fff8;border-radius:8px;font-size:12px;color:#374151;line-height:1.5;">${esc(who.recommendation)}</div>
  </div>`;
}

// ─── SIN result section ───────────────────────────────────────────────────────

function sinSection(sin: SINResult): string {
  const gradeColors: Record<string, string> = {
    normal: '#16a34a', mild: '#d97706', moderate: '#ea580c', severe: '#dc2626',
  };
  const gc = gradeColors[sin.grade] ?? '#374151';
  return `
  <div class="card">
    <div class="card-title">Speech-in-Noise Test (QuickSIN-inspired)</div>
    <div class="row-item">
      <span class="row-label">SNR50</span>
      <span class="row-value">${sin.snr50 >= 0 ? '+' : ''}${sin.snr50} dBSNR</span>
    </div>
    <div class="row-item">
      <span class="row-label">SNR Loss</span>
      <span class="row-value" style="color:${gc};">${sin.snrLoss.toFixed(1)} dB</span>
    </div>
    <div style="margin-top:8px;">${pill(sin.label, gc + '20', gc)}</div>
    <div style="margin-top:8px;font-size:12px;color:#374151;line-height:1.5;">${esc(sin.recommendation)}</div>
    <div style="margin-top:8px;font-size:11px;color:#9ca3af;font-style:italic;">Note: Tone-in-noise protocol — not equivalent to sentence-based QuickSIN. Results are indicative only.</div>
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
  const gc = patColors[hf.pattern] ?? '#374151';

  const barRows = hf.thresholds.map((t) => {
    const bc = t.dbHL <= 25 ? '#16a34a' : t.dbHL <= 40 ? '#d97706' : '#dc2626';
    return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="width:52px;font-size:11px;color:#374151;font-weight:600;">${t.frequency / 1000} kHz</span>
      <div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;">
        <div style="width:${Math.min(100, (t.dbHL / 80) * 100)}%;height:8px;background:${bc};border-radius:4px;"></div>
      </div>
      <span style="width:52px;font-size:11px;font-weight:700;color:${bc};text-align:right;">${t.dbHL} dBHL</span>
    </div>`;
  }).join('');

  return `
  <div class="card">
    <div class="card-title">High-Frequency Audiometry (9–12 kHz)</div>
    <div class="row-item">
      <span class="row-label">HF Average</span>
      <span class="row-value" style="color:${gc};">${hf.hfAverage} dBHL</span>
    </div>
    <div style="margin-top:8px;">${pill(patLabels[hf.pattern] ?? hf.pattern, gc + '20', gc)}</div>
    ${hf.nihlRiskFlag ? `<div style="margin-top:8px;padding:6px 10px;background:#fee2e2;border-radius:8px;font-size:11px;color:#dc2626;font-weight:700;">⚠ NIHL Risk Pattern Detected at Extended HF Range</div>` : ''}
    <div style="margin-top:12px;">${barRows}</div>
  </div>`;
}

// ─── Reliability section ──────────────────────────────────────────────────────

function reliabilitySection(report: BehavioralReport, ear: string): string {
  const gradeColors: Record<string, string> = {
    excellent: '#16a34a', good: '#65a30d', fair: '#d97706', poor: '#dc2626',
  };
  const gc = gradeColors[report.reliabilityGrade] ?? '#374151';

  const flagRows = report.flags.slice(0, 4).map((f) => `
  <div style="padding:6px 8px;background:${f.severity === 'warning' ? '#fffbeb' : '#f9fafb'};border-radius:7px;margin-bottom:4px;">
    <span style="font-size:11px;color:#374151;">${esc(f.description)}</span>
  </div>`).join('');

  return `
  <div class="card" style="background:#f9fafb;">
    <div class="card-title">${esc(ear)} — Response Reliability</div>
    <div class="row-item">
      <span class="row-label">Reliability Score</span>
      <span class="row-value" style="color:${gc};">${report.reliabilityScore}/100 · ${report.reliabilityGrade.charAt(0).toUpperCase() + report.reliabilityGrade.slice(1)}</span>
    </div>
    ${report.flags.length > 0 ? `<div style="margin-top:8px;">${flagRows}</div>` : ''}
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
        <div style="font-size:14px;font-weight:800;color:#111827;">EDIS Clinical Interpretation</div>
        <div style="font-size:11px;color:#9ca3af;">${edis.providerName ? `Powered by ${esc(edis.providerName)}` : 'AI-backed probabilistic analysis'}</div>
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
  const gc = WHO_GRADE_COLOR[worstGrade];
  const gbg = WHO_GRADE_BG[worstGrade];

  const testDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Patient header
  let patientBlock = '';
  if (user?.name || userAge) {
    const name = user?.name ?? 'Patient';
    const ageStr = userAge ? `${userAge} years old` : '';
    const dobStr = user?.dob ? ` · DOB: ${new Date(user.dob).toLocaleDateString()}` : '';
    patientBlock = `
    <div style="background:#f0fdfc;border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;border:1.5px solid #99f6e4;">
      <div style="width:48px;height:48px;border-radius:24px;background:${TEAL};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-size:22px;color:#fff;">👤</span>
      </div>
      <div>
        <div style="font-size:16px;font-weight:900;color:#111827;">${esc(name)}</div>
        <div style="font-size:12px;color:#6b7280;">${esc(ageStr)}${esc(dobStr)}</div>
      </div>
    </div>`;
  }

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
      padding: 28px 32px 24px;
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

  <!-- Hero banner -->
  <div class="hero">
    <div style="max-width:700px;margin:0 auto;">
      <div style="font-size:11px;font-weight:700;opacity:0.75;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Hearing Assessment Report</div>
      <div style="font-size:26px;font-weight:900;margin-bottom:2px;">Pure Tone Audiometry</div>
      <div style="font-size:13px;opacity:0.80;">${esc(testDate)}</div>
      <div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;">
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 16px;text-align:center;">
          <div style="font-size:11px;opacity:0.75;">Overall</div>
          <div style="font-size:18px;font-weight:900;">${esc(WHO_GRADE_LABELS[worstGrade])}</div>
          <div style="font-size:11px;opacity:0.75;">Grade ${worstGrade}</div>
        </div>
        ${rightWHO ? `
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 16px;text-align:center;">
          <div style="font-size:11px;opacity:0.75;">Right PTA3</div>
          <div style="font-size:18px;font-weight:900;">${rightWHO.pureTonaAverage} dBHL</div>
          <div style="font-size:11px;opacity:0.75;">Grade ${rightWHO.grade}</div>
        </div>` : ''}
        ${leftWHO ? `
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 16px;text-align:center;">
          <div style="font-size:11px;opacity:0.75;">Left PTA3</div>
          <div style="font-size:18px;font-weight:900;">${leftWHO.pureTonaAverage} dBHL</div>
          <div style="font-size:11px;opacity:0.75;">Grade ${leftWHO.grade}</div>
        </div>` : ''}
      </div>
    </div>
  </div>

  <div class="content">
    ${patientBlock}

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
