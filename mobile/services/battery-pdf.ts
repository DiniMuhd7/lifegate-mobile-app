/**
 * Battery Results → PDF
 * Generates an HTML document that closely mirrors the battery-results UI,
 * then uses expo-print to render it as a PDF.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type {
  SingleTestResult,
  AcuityResult,
  ColorResult,
  AstigmatismResult,
  ContrastResult,
  NearVisionResult,
  BehavioralReport,
  ColorVisionCategory,
} from 'types/vision-types';
import {
  buildClinicalSummary,
  WHO_VISUAL_CATEGORY_INFO,
  CVD_TYPE_INFO,
  PR_GRADE_LABEL,
  NEAR_GRADE_LABEL,
  NEAR_GRADE_COLOR,
  lookupCSPercentile,
} from 'services/clinical-standards-engine';

const TEAL      = '#0AADA2';
const TEAL_DARK = '#0f766e';

// ─── Utility ──────────────────────────────────────────────────────────────────
function esc(s: string | number | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pill(text: string, color: string, bg: string): string {
  return `<span class="pill" style="background:${bg};color:${color};border:1px solid ${color}33">${esc(text)}</span>`;
}

function card(title: string, titleColor: string, borderColor: string, bgColor: string, body: string): string {
  return `
  <div class="card" style="border-left:4px solid ${borderColor};background:${bgColor}">
    <div class="card-title" style="color:${titleColor}">${esc(title)}</div>
    ${body}
  </div>`;
}

function row(label: string, value: string, good: boolean): string {
  const icon  = good ? '✓' : '⚠';
  const color = good ? '#16a34a' : '#d97706';
  return `
  <div class="data-row">
    <span class="data-icon" style="color:${color}">${icon}</span>
    <div class="data-body">
      <div class="data-label">${esc(label)}</div>
      <div class="data-value">${esc(value)}</div>
    </div>
  </div>`;
}

// ─── Per-test card builders ───────────────────────────────────────────────────
function acuityCard(r: AcuityResult): string {
  const good    = r.logMAR <= 0.30;
  const catInfo = r.acuityCategory ? WHO_VISUAL_CATEGORY_INFO[r.acuityCategory] : null;
  let body = row('Visual Acuity', `${r.snellen}  (LogMAR ${r.logMAR.toFixed(2)})`, good);
  if (r.snellenDecimal !== undefined && r.etdrsLetters !== undefined) {
    body += `<div class="chips">
      ${pill(`Decimal ${r.snellenDecimal.toFixed(2)}`, '#374151', '#f3f4f6')}
      ${pill(`ETDRS ~${r.etdrsLetters} letters`, '#374151', '#f3f4f6')}
    </div>`;
  }
  if (catInfo) {
    body += `<div class="sub-note" style="color:${catInfo.color}">${esc(catInfo.label)}</div>`;
  }
  body += `<div class="sub-note">${r.trials.length} adaptive trials</div>`;
  return card('Visual Acuity', good ? '#16a34a' : '#d97706', good ? '#86efac' : '#fde68a', good ? '#f0fdf4' : '#fffbeb', body);
}

function colorCard(r: ColorResult): string {
  const good = r.category === 'normal';
  const labels: Record<ColorVisionCategory, string> = {
    normal: 'Normal trichromacy',
    mild_deficiency: 'Mild deficiency',
    moderate_deficiency: 'Moderate deficiency',
    severe_deficiency: 'Severe deficiency',
  };
  const cvdInfo = r.cvdType ? CVD_TYPE_INFO[r.cvdType] : null;
  let body = row('Color Vision', labels[r.category], good);
  if (cvdInfo && !good) {
    body += `<div class="sub-note" style="color:${cvdInfo.color}">${esc(cvdInfo.label)} — ${esc(cvdInfo.clinicalNote)}</div>`;
  }
  body += `<div class="sub-note">${r.score}% correct on plates</div>`;
  return card('Color Vision', good ? '#16a34a' : '#dc2626', good ? '#86efac' : '#fca5a5', good ? '#f0fdf4' : '#fef2f2', body);
}

function astigmatismCard(r: AstigmatismResult): string {
  const good = r.severity === 'none';
  const sevLabel = { none: 'No astigmatism detected', mild: 'Mild', moderate: 'Moderate', marked: 'Marked' }[r.severity];
  const ruleLabel: Record<string, string> = {
    with_the_rule: 'With-the-Rule', against_the_rule: 'Against-the-Rule', oblique: 'Oblique', none: '',
  };
  const valueStr = good ? sevLabel : `${sevLabel}${r.detectedAxis != null ? ` × ${r.detectedAxis}°` : ''}`;
  let body = row('Astigmatism', valueStr, good);
  if (!good && r.axisRule && r.axisRule !== 'none') {
    body += `<div class="chips">
      ${pill(ruleLabel[r.axisRule] ?? r.axisRule, '#92400e', '#fef3c7')}
      ${r.cylinderNotation ? pill(`Cyl ${r.cylinderNotation}`, '#374151', '#f3f4f6') : ''}
    </div>`;
  }
  body += `<div class="sub-note">${r.trials.length} rounds</div>`;
  return card('Astigmatism', good ? '#16a34a' : '#d97706', good ? '#86efac' : '#fde68a', good ? '#f0fdf4' : '#fef3c7', body);
}

function contrastCard(r: ContrastResult, age?: number): string {
  const logCS   = r.pelliRobsonLogCS;
  const grade   = r.contrastGrade;
  const good    = logCS !== undefined ? logCS >= 1.65 : false;
  const gradeLabel  = grade ? PR_GRADE_LABEL[grade] : null;
  const percentile  = logCS !== undefined ? lookupCSPercentile(logCS, age) : null;
  const valStr = logCS !== undefined
    ? `Peak log CS ${logCS.toFixed(2)}`
    : r.curve.length > 0 ? `Best threshold: ${Math.min(...r.curve.map((c) => c.threshold))}%` : 'No data';
  let body = row('Contrast Sensitivity', valStr, good);
  if (gradeLabel) {
    body += `<div class="chips">${pill(gradeLabel, grade ? '#d97706' : '#6b7280', `${grade ? '#d97706' : '#6b7280'}25`)} <span class="chip-note">Pelli-Robson equivalent</span></div>`;
  }
  if (percentile) {
    body += `<div class="chips">${pill(`Better than ${percentile.percentile}% (${percentile.ageBandLabel})`, '#0369a1', '#e0f2fe')} <span class="chip-note">Age-matched percentile</span></div>`;
  }
  if (r.curve.length > 0) {
    body += `<div class="chips">`;
    r.curve.forEach((c) => {
      body += pill(`${c.sf} cpd · log CS ${(Math.log10(100 / c.threshold)).toFixed(2)}`, '#374151', '#f3f4f6');
    });
    body += `</div>`;
  }
  return card('Contrast Sensitivity', good ? '#16a34a' : '#d97706', good ? '#86efac' : '#fde68a', good ? '#f0fdf4' : '#fffbeb', body);
}

function nearCard(r: NearVisionResult): string {
  const good = r.smallestReadablePoints <= 8;
  const nearGrade: keyof typeof NEAR_GRADE_COLOR =
    r.smallestReadablePoints <= 6  ? 'normal'
    : r.smallestReadablePoints <= 10 ? 'mild_presbyopia'
    : r.smallestReadablePoints <= 14 ? 'moderate_presbyopia'
    : 'severe_near_loss';
  const gradeColor = NEAR_GRADE_COLOR[nearGrade];
  let body = row('Near Vision', `${r.nNotation}  (${r.smallestReadablePoints}pt)`, good);
  body += `<div class="chips">
    ${r.jaegerNotation ? pill(r.jaegerNotation, '#374151', '#f3f4f6') : ''}
    ${r.snellenNearEquivalent ? pill(r.snellenNearEquivalent, '#374151', '#f3f4f6') : ''}
    ${pill(NEAR_GRADE_LABEL[nearGrade], gradeColor, gradeColor + '25')}
  </div>`;
  return card('Near Vision', good ? '#16a34a' : '#d97706', good ? '#86efac' : '#fde68a', good ? '#f0fdf4' : '#fffbeb', body);
}

// ─── Clinical summary ─────────────────────────────────────────────────────────
function clinicalSummaryCard(results: SingleTestResult[]): string {
  const acuity   = results.find((r) => r.testId === 'acuity')      as AcuityResult | undefined;
  const color    = results.find((r) => r.testId === 'color')        as ColorResult | undefined;
  const contrast = results.find((r) => r.testId === 'contrast')     as ContrastResult | undefined;
  const astig    = results.find((r) => r.testId === 'astigmatism')  as AstigmatismResult | undefined;
  const near     = results.find((r) => r.testId === 'near')         as NearVisionResult | undefined;

  const summary = buildClinicalSummary({
    acuityLogMAR:        acuity?.logMAR,
    colorVisionPassed:   color ? color.category === 'normal' : undefined,
    contrastPRScore:     contrast?.pelliRobsonLogCS,
    astigmatismSeverity: astig?.severity,
    nearVisionPoints:    near?.smallestReadablePoints,
  });

  const uc = summary.urgency === 'urgent' ? '#dc2626' : summary.urgency === 'soon' ? '#d97706' : '#16a34a';
  const ub = summary.urgency === 'urgent' ? '#fef2f2' : summary.urgency === 'soon' ? '#fffbeb' : '#f0fdf4';
  const ul = summary.urgency === 'urgent' ? 'Urgent'  : summary.urgency === 'soon' ? 'Review Soon' : 'Routine';

  return `
  <div class="card" style="border-left:4px solid ${uc};background:${ub}">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div class="card-title" style="color:${uc};margin:0;flex:1">⚕ Clinical Summary</div>
      ${pill(ul, uc, uc + '20')}
    </div>
    <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:6px">${esc(summary.headline)}</div>
    ${summary.details.map((d) => `<div class="detail-row">• ${esc(d)}</div>`).join('')}
    ${summary.referralRecommended ? `<div class="referral-banner" style="border-color:${uc};color:${uc};background:${uc}15">📅 Professional eye examination recommended</div>` : ''}
  </div>`;
}

// ─── Behavioral panel ─────────────────────────────────────────────────────────
function behavioralCard(report: BehavioralReport): string {
  const GRADE_COLOR: Record<string, string> = {
    excellent: '#16a34a', good: '#0AADA2', fair: '#d97706', poor: '#dc2626',
  };
  const GRADE_BG: Record<string, string> = {
    excellent: '#f0fdf4', good: '#f0fdfc', fair: '#fffbeb', poor: '#fef2f2',
  };
  const oc = GRADE_COLOR[report.overallReliability] ?? '#374151';
  const ob = GRADE_BG[report.overallReliability]   ?? '#f9fafb';

  const labelMap: Record<string, string> = {
    acuity: 'Acuity', color: 'Color', astigmatism: 'Astigmatism', contrast: 'Contrast', near: 'Near',
  };

  let body = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <div class="card-title" style="margin:0;flex:1">📊 Behavioral Signals</div>
    ${pill(report.overallReliability.toUpperCase(), oc, ob)}
  </div>`;

  if (report.reliabilityScores.length > 0) {
    body += `<div class="section-label">Reliability Scores</div>
    <div class="chips">`;
    report.reliabilityScores.forEach((s) => {
      const c = GRADE_COLOR[s.grade] ?? '#374151';
      const b = GRADE_BG[s.grade]   ?? '#f9fafb';
      body += `<div class="rel-chip" style="background:${b};border:1px solid ${c}33">
        <div style="color:#9ca3af;font-size:9px">${esc(labelMap[s.testId] ?? s.testId)}</div>
        <div style="color:${c};font-size:14px;font-weight:800">${esc(s.score)}</div>
        <div style="color:${c};font-size:9px;text-transform:uppercase">${esc(s.grade)}</div>
      </div>`;
    });
    body += `</div>`;
  }

  const latencyEntries = Object.entries(report.latencyByTest) as Array<
    [string, NonNullable<BehavioralReport['latencyByTest'][keyof BehavioralReport['latencyByTest']]>]
  >;
  if (latencyEntries.length > 0) {
    body += `<div class="section-label" style="margin-top:10px">Response Latency</div>`;
    latencyEntries.forEach(([id, stats]) => {
      body += `<div class="lat-row">
        <span style="width:80px;font-weight:600">${esc(labelMap[id] ?? id)}</span>
        <span style="flex:1;color:#6b7280">med ${esc(stats.median)} ms</span>
        <span style="color:#9ca3af">CV ${stats.cv.toFixed(2)}</span>
        ${stats.fastResponses > 0 ? `<span class="fast-badge">${stats.fastResponses} fast</span>` : ''}
      </div>`;
    });
  }

  if (report.eyeSwitchEvents.length > 0) {
    const pct = Math.round(report.eyeSwitchComplianceRate * 100);
    const barColor = pct >= 80 ? '#16a34a' : '#d97706';
    body += `<div class="section-label" style="margin-top:10px">Eye-Switch Compliance</div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden">
        <div style="height:8px;width:${pct}%;background:${barColor};border-radius:4px"></div>
      </div>
      <span style="font-size:13px;font-weight:700;color:#374151">${pct}%</span>
    </div>`;
  }

  return `<div class="card" style="border-left:4px solid #e5e7eb;background:#fff">${body}</div>`;
}

// ─── Full HTML document ───────────────────────────────────────────────────────
function buildHtml(
  patientName: string,
  results: SingleTestResult[],
  behavioralReport: BehavioralReport | null | undefined,
  viewingDistanceCm: number,
  durationSeconds: number | null,
  userAge: number | undefined,
): string {
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const acuity   = results.find((r) => r.testId === 'acuity')     as AcuityResult | undefined;
  const color    = results.find((r) => r.testId === 'color')       as ColorResult | undefined;
  const astig    = results.find((r) => r.testId === 'astigmatism') as AstigmatismResult | undefined;
  const contrast = results.find((r) => r.testId === 'contrast')    as ContrastResult | undefined;
  const near     = results.find((r) => r.testId === 'near')        as NearVisionResult | undefined;

  const testCards = [
    acuity   ? acuityCard(acuity)                   : '',
    color    ? colorCard(color)                      : '',
    astig    ? astigmatismCard(astig)               : '',
    contrast ? contrastCard(contrast, userAge)      : '',
    near     ? nearCard(near)                        : '',
  ].join('');

  const durationStr = durationSeconds != null
    ? `${Math.ceil(durationSeconds / 60)} min`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>LifeGate Vision Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #f9fafb; color: #111827; font-size: 14px; }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 28px 48px; }

  /* ── Hero ── */
  .hero {
    background: linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%);
    border-radius: 20px; padding: 28px 24px 24px; margin-bottom: 24px; color: #fff;
  }
  .hero-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
  .hero-logo { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
  .hero-logo span { opacity: 0.65; font-weight: 400; font-size: 14px; }
  .hero-date { font-size: 12px; opacity: 0.7; text-align: right; line-height: 1.5; }
  .hero-body { text-align: center; }
  .hero-icon { font-size: 40px; display: block; margin-bottom: 8px; }
  .hero-title { font-size: 22px; font-weight: 900; }
  .hero-sub { font-size: 13px; opacity: 0.75; margin-top: 4px; }
  .hero-patient {
    display: inline-block; margin-top: 14px;
    background: rgba(255,255,255,0.18); border-radius: 10px;
    padding: 6px 16px; font-size: 14px; font-weight: 700;
  }
  .hero-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 14px; }
  .hero-chip { background: rgba(255,255,255,0.18); border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: 600; }

  /* ── Cards ── */
  .card {
    background: #fff; border-radius: 14px;
    border: 1.5px solid #e5e7eb; padding: 16px; margin-bottom: 14px;
  }
  .card-title { font-size: 14px; font-weight: 800; color: #111827; margin-bottom: 10px; }

  /* ── Data rows ── */
  .data-row { display: flex; align-items: flex-start; gap: 10px; }
  .data-icon { font-size: 16px; line-height: 1; margin-top: 1px; }
  .data-body { flex: 1; }
  .data-label { font-size: 10px; color: #9ca3af; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.4px; }
  .data-value { font-size: 14px; font-weight: 700; color: #111827; }
  .sub-note { font-size: 11px; color: #6b7280; margin-top: 5px; }
  .detail-row { font-size: 12px; color: #374151; line-height: 1.6; padding-left: 10px; }

  /* ── Chips ── */
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
  .pill {
    display: inline-block; border-radius: 20px;
    padding: 2px 10px; font-size: 10px; font-weight: 700;
  }
  .chip-note { font-size: 11px; color: #9ca3af; }

  /* ── Reliability chips ── */
  .rel-chip { border-radius: 10px; padding: 6px 10px; text-align: center; min-width: 72px; }
  .lat-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  .fast-badge { background: #fef2f2; color: #dc2626; font-size: 10px; font-weight: 700; border-radius: 4px; padding: 1px 5px; }
  .section-label { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }

  /* ── Referral banner ── */
  .referral-banner { border-radius: 8px; border: 1px solid; padding: 8px 10px; margin-top: 10px; font-size: 11px; font-weight: 600; }

  /* ── Section heading ── */
  .section-heading { font-size: 12px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px; }

  /* ── Footer ── */
  .footer { margin-top: 28px; padding: 14px; background: #f3f4f6; border-radius: 10px; font-size: 11px; color: #9ca3af; text-align: center; line-height: 1.6; }
  .footer strong { color: #374151; }

  @media print {
    body { background: #fff; }
    .page { max-width: 100%; padding: 16px; }
    .card { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Hero -->
  <div class="hero">
    <div class="hero-top">
      <div class="hero-logo">LifeGate <span>Vision Report</span></div>
      <div class="hero-date">${esc(dateStr)}<br/>${esc(timeStr)}</div>
    </div>
    <div class="hero-body">
      <span class="hero-icon">✅</span>
      <div class="hero-title">Assessment Complete</div>
      <div class="hero-sub">
        ${results.length} test${results.length !== 1 ? 's' : ''} completed
        ${durationStr ? `&nbsp;·&nbsp;${esc(durationStr)}` : ''}
        &nbsp;·&nbsp;${esc(viewingDistanceCm)} cm distance
      </div>
      <div class="hero-patient">👤 ${esc(patientName || 'Patient')}</div>
      <div class="hero-chips">
        ${results.map((r) => `<div class="hero-chip">${esc(r.testId)}</div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Patient info -->
  <div class="card">
    <div class="card-title">Patient Information</div>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="font-size:11px;color:#9ca3af;padding:4px 0;width:120px">Patient Name</td>
        <td style="font-size:13px;font-weight:700;color:#111827">${esc(patientName || '—')}</td>
        <td style="font-size:11px;color:#9ca3af;padding:4px 0;width:120px">Date of Report</td>
        <td style="font-size:13px;font-weight:700;color:#111827">${esc(dateStr)}</td>
      </tr>
      <tr>
        <td style="font-size:11px;color:#9ca3af;padding:4px 0">Age</td>
        <td style="font-size:13px;font-weight:700;color:#111827">${userAge != null ? esc(String(userAge)) + ' yrs' : '—'}</td>
        <td style="font-size:11px;color:#9ca3af;padding:4px 0">Viewing Distance</td>
        <td style="font-size:13px;font-weight:700;color:#111827">${esc(viewingDistanceCm)} cm</td>
      </tr>
    </table>
  </div>

  <!-- Clinical Summary -->
  ${results.length > 0 ? clinicalSummaryCard(results) : ''}

  <!-- Test Results -->
  ${results.length > 0 ? `<div class="section-heading">Individual Test Results</div>` : ''}
  ${testCards}

  <!-- Behavioral Signals -->
  ${behavioralReport ? behavioralCard(behavioralReport) : ''}

  <!-- Disclaimer -->
  <div class="footer">
    <strong>Screening Notice</strong><br/>
    These results are from a screening tool only and do not replace a professional eye examination.
    Consult a qualified eye-care professional for a formal clinical assessment.<br/>
    Generated by <strong>LifeGate Health</strong> on ${esc(dateStr)} at ${esc(timeStr)}.
  </div>

</div>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function exportBatteryResultsPDF(opts: {
  patientName: string;
  results: SingleTestResult[];
  behavioralReport?: BehavioralReport | null;
  viewingDistanceCm: number;
  durationSeconds: number | null;
  userAge?: number;
}): Promise<void> {
  const html = buildHtml(
    opts.patientName,
    opts.results,
    opts.behavioralReport,
    opts.viewingDistanceCm,
    opts.durationSeconds,
    opts.userAge,
  );

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Save or Share Vision Report',
      UTI: 'com.adobe.pdf',
    });
  }
}
