/**
 * battery-pdf.ts
 * Generates a styled HTML report for the vision battery results and opens it
 * in a new browser tab. Calling window.print() from the opened tab allows the
 * user to save as PDF.
 *
 * Web-only — guard with Platform.OS === 'web' before calling openBatteryPDF.
 */

import type {
  SingleTestResult,
  AcuityResult,
  ColorResult,
  AstigmatismResult,
  ContrastResult,
  NearVisionResult,
  BehavioralReport,
} from 'types/vision-types';
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
import type { SensorInterpretResponse } from 'services/sensor-interpretation-service';

// ─── Colours (mirror the app) ─────────────────────────────────────────────────
const TEAL = '#0AADA2';
const TEAL_DARK = '#0f766e';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pill(label: string, bg: string, color: string): string {
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:8px;padding:2px 10px;font-size:11px;font-weight:700;">${esc(label)}</span>`;
}

function tag(label: string, color: string = '#374151', bg: string = '#f3f4f6'): string {
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;">${esc(label)}</span>`;
}

function sectionHeader(title: string, subtitle = ''): string {
  return `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
    <div style="width:36px;height:36px;border-radius:10px;background:#f0fdfc;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <span style="font-size:18px;">👁</span>
    </div>
    <div>
      <div style="font-size:14px;font-weight:800;color:#111827;">${esc(title)}</div>
      ${subtitle ? `<div style="font-size:11px;color:#9ca3af;">${esc(subtitle)}</div>` : ''}
    </div>
  </div>`;
}

// ─── Per-test card builders ───────────────────────────────────────────────────

function acuitySection(r: AcuityResult): string {
  const catInfo = r.acuityCategory ? WHO_VISUAL_CATEGORY_INFO[r.acuityCategory] : null;
  const good = r.logMAR <= 0.30;
  const cardBg = good ? '#f0fdf4' : '#fffbeb';
  const borderColor = good ? '#86efac' : '#fde68a';
  return `
  <div class="card" style="background:${cardBg};border-color:${borderColor};">
    <div class="card-title">Visual Acuity</div>
    <div class="row-item">
      <span class="row-label">Snellen / LogMAR</span>
      <span class="row-value" style="color:${good ? '#16a34a' : '#d97706'};">${esc(r.snellen)} &nbsp;(LogMAR ${r.logMAR.toFixed(2)})</span>
    </div>
    ${r.snellenDecimal !== undefined && r.etdrsLetters !== undefined ? `
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
      ${tag(`Decimal ${r.snellenDecimal.toFixed(2)}`)}
      ${tag(`ETDRS ~${r.etdrsLetters} letters`)}
    </div>` : ''}
    ${catInfo ? `<div style="margin-top:6px;font-size:11px;font-weight:600;color:${catInfo.color};">${esc(catInfo.label)}</div>` : ''}
    <div class="sub-text">${r.trials.length} adaptive trials</div>
  </div>`;
}

function colorSection(r: ColorResult): string {
  const good = r.score >= 80;
  const cardBg = good ? '#f0fdf4' : '#fff7ed';
  const borderColor = good ? '#86efac' : '#fed7aa';
  const cvdInfo = r.cvdType ? CVD_TYPE_INFO[r.cvdType] : null;
  return `
  <div class="card" style="background:${cardBg};border-color:${borderColor};">
    <div class="card-title">Colour Vision</div>
    <div class="row-item">
      <span class="row-label">Score</span>
      <span class="row-value" style="color:${good ? '#16a34a' : '#ea580c'};">${r.score}% correct (${r.correctCount}/${r.platesTotal} plates)</span>
    </div>
    <div style="margin-top:6px;">${tag(r.category)}</div>
    ${cvdInfo ? `<div style="margin-top:6px;font-size:11px;color:${cvdInfo.color};font-weight:600;">${esc(cvdInfo.label)}</div>` : ''}
  </div>`;
}

function astigmatismSection(r: AstigmatismResult): string {
  const none = r.severity === 'none';
  const cardBg = none ? '#f0fdf4' : '#fffbeb';
  const borderColor = none ? '#86efac' : '#fde68a';
  return `
  <div class="card" style="background:${cardBg};border-color:${borderColor};">
    <div class="card-title">Astigmatism</div>
    <div class="row-item">
      <span class="row-label">Severity</span>
      <span class="row-value" style="text-transform:capitalize;color:${none ? '#16a34a' : '#d97706'};">${esc(r.severity)}</span>
    </div>
    ${r.detectedAxis != null ? `
    <div class="row-item">
      <span class="row-label">Axis</span>
      <span class="row-value">${r.cylinderNotation ?? `${r.detectedAxis}°`}</span>
    </div>` : ''}
    ${r.axisRule && r.axisRule !== 'none' ? `<div style="margin-top:6px;">${tag(r.axisRule.replace(/_/g, ' '))}</div>` : ''}
  </div>`;
}

function contrastSection(r: ContrastResult, userAge?: number): string {
  const logCS = r.pelliRobsonLogCS;
  const good = logCS !== undefined ? logCS >= 1.5 : true;
  const cardBg = good ? '#f0fdf4' : '#fffbeb';
  const borderColor = good ? '#86efac' : '#fde68a';
  const grade = r.grade;
  const gradeLabel = grade != null ? PR_GRADE_LABEL[grade] : null;
  const gradeColor = grade != null ? PR_GRADE_COLOR[grade] : '#6b7280';
  const pct = logCS !== undefined && userAge !== undefined
    ? lookupCSPercentile(logCS, userAge)
    : null;
  return `
  <div class="card" style="background:${cardBg};border-color:${borderColor};">
    <div class="card-title">Contrast Sensitivity</div>
    ${logCS !== undefined ? `
    <div class="row-item">
      <span class="row-label">Pelli-Robson log CS</span>
      <span class="row-value" style="color:${good ? '#16a34a' : '#d97706'};">${logCS.toFixed(2)}</span>
    </div>` : ''}
    ${gradeLabel ? `<div style="margin-top:6px;">${pill(gradeLabel, gradeColor + '22', gradeColor)}</div>` : ''}
    ${pct ? `<div style="margin-top:6px;font-size:11px;color:#9ca3af;">${pct.label} — ${pct.interpretation}</div>` : ''}
    ${r.curve.length > 0 ? `
    <div style="margin-top:8px;">
      <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Spatial Frequency Curve</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${r.curve.map((c) => tag(`${c.sf} cpd → ${c.threshold}%`, '#374151', '#f3f4f6')).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function nearVisionSection(r: NearVisionResult): string {
  const grade = r.presbyopiaGrade;
  const gradeLabel = grade != null ? NEAR_GRADE_LABEL[grade] : null;
  const gradeColor = grade != null ? NEAR_GRADE_COLOR[grade] : '#6b7280';
  const good = grade == null || grade === 'none';
  const cardBg = good ? '#f0fdf4' : '#fffbeb';
  const borderColor = good ? '#86efac' : '#fde68a';
  return `
  <div class="card" style="background:${cardBg};border-color:${borderColor};">
    <div class="card-title">Near Vision</div>
    <div class="row-item">
      <span class="row-label">N-Notation</span>
      <span class="row-value" style="color:${good ? '#16a34a' : '#d97706'};">${esc(r.nNotation)}${r.jaegerNotation ? ` / ${esc(r.jaegerNotation)}` : ''}</span>
    </div>
    <div style="margin-top:6px;font-size:12px;color:#374151;">Smallest: ${r.smallestReadablePoints}pt font${r.snellenNearEquivalent ? ` · ${esc(r.snellenNearEquivalent)}` : ''}</div>
    ${gradeLabel ? `<div style="margin-top:6px;">${pill(gradeLabel, gradeColor + '22', gradeColor)}</div>` : ''}
  </div>`;
}

// ─── Clinical Summary ─────────────────────────────────────────────────────────

function clinicalSummarySection(results: SingleTestResult[]): string {
  const acuity    = results.find((r) => r.testId === 'acuity')       as AcuityResult | undefined;
  const color     = results.find((r) => r.testId === 'color')        as ColorResult  | undefined;
  const contrast  = results.find((r) => r.testId === 'contrast')     as ContrastResult | undefined;
  const astig     = results.find((r) => r.testId === 'astigmatism')  as AstigmatismResult | undefined;
  const near      = results.find((r) => r.testId === 'near')         as NearVisionResult | undefined;

  const summary = buildClinicalSummary({
    acuityLogMAR:        acuity?.logMAR,
    colorVisionPassed:   color ? color.score >= 80 : undefined,
    contrastPRScore:     contrast?.pelliRobsonLogCS,
    astigmatismSeverity: astig?.severity,
    nearVisionPoints:    near?.smallestReadablePoints,
  });

  const urgencyColor: Record<string, string> = { routine: '#16a34a', soon: '#d97706', urgent: '#dc2626' };
  const urgencyBg:    Record<string, string> = { routine: '#f0fdf4', soon: '#fffbeb', urgent: '#fef2f2' };
  const uc = urgencyColor[summary.urgency] ?? '#374151';
  const ub = urgencyBg[summary.urgency]    ?? '#f9fafb';

  return `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div>
        <div style="font-size:14px;font-weight:800;color:#111827;">Clinical Summary</div>
        <div style="font-size:11px;color:#9ca3af;">Standardised screening interpretation</div>
      </div>
      <div style="margin-left:auto;">${pill(summary.urgency.toUpperCase(), ub, uc)}</div>
    </div>
    <div style="background:${ub};border-radius:12px;padding:12px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;color:${uc};">${esc(summary.headline)}</div>
    </div>
    ${summary.details.length > 0 ? `
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${summary.details.map((d) => `
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <span style="color:${TEAL};font-size:14px;margin-top:1px;">•</span>
        <span style="font-size:12px;color:#374151;line-height:18px;">${esc(d)}</span>
      </div>`).join('')}
    </div>` : `<div style="font-size:12px;color:#9ca3af;">No significant findings.</div>`}
    ${summary.referralRecommended ? `
    <div style="margin-top:12px;display:flex;align-items:center;gap:8px;background:#eff6ff;border-radius:10px;padding:10px;">
      <span style="font-size:16px;">👨‍⚕️</span>
      <span style="font-size:12px;color:#1e40af;font-weight:600;line-height:17px;">Referral to an eye-care professional is recommended.</span>
    </div>` : ''}
  </div>`;
}

// ─── AI Interpretation ────────────────────────────────────────────────────────

function aiSection(results: SingleTestResult[], behavioralReport: BehavioralReport | null): string {
  const ai = generateAIInterpretation(results, behavioralReport);

  const confColor: Record<string, string> = { high: '#16a34a', moderate: '#d97706', low: '#dc2626' };
  const probColor: Record<string, string> = { none: '#16a34a', low: '#6b7280', moderate: '#d97706', high: '#dc2626', definite: '#7c2d12' };
  const cc = confColor[ai.confidenceGrade] ?? '#374151';

  const remarkBg: Record<string, string>   = { info: '#f9fafb', warning: '#fffbeb', alert: '#fef2f2' };
  const remarkIconColor: Record<string, string> = { info: '#9ca3af', warning: '#d97706', alert: '#dc2626' };

  return `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div>
        <div style="font-size:14px;font-weight:800;color:#111827;">AI Interpretation</div>
        <div style="font-size:11px;color:#9ca3af;">Probabilistic pattern analysis · not a diagnosis</div>
      </div>
      <div style="margin-left:auto;">${pill(`${ai.confidenceScore}% conf.`, cc + '22', cc)}</div>
    </div>

    ${ai.acuity ? `
    <div class="insight-row">
      <div class="insight-label">Visual Acuity</div>
      <div style="font-size:13px;font-weight:700;color:${ai.acuity.logMAR <= 0.10 ? '#16a34a' : ai.acuity.logMAR <= 0.30 ? '#d97706' : '#dc2626'};">
        ${esc(ai.acuity.logMAR.toFixed(1))} LogMAR ≈ ${esc(ai.acuity.snellen6)}
      </div>
      <div class="insight-sub">${esc(ai.acuity.description)}</div>
    </div>` : ''}

    <div class="insight-row">
      <div class="insight-label">Refractive Error Likelihood</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-size:13px;font-weight:700;color:#111827;">${esc(ai.refractive.label)}</span>
        ${pill(ai.refractive.probability, (probColor[ai.refractive.probability] ?? '#6b7280') + '22', probColor[ai.refractive.probability] ?? '#6b7280')}
      </div>
      <div class="insight-sub">${esc(ai.refractive.description)}</div>
      ${ai.refractive.estimatedRange ? `<div style="margin-top:4px;">${tag(`Est. sphere: ${ai.refractive.estimatedRange}`, TEAL, '#f0fdfc')}</div>` : ''}
    </div>

    <div class="insight-row">
      <div class="insight-label">Astigmatism Probability</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-size:13px;font-weight:700;color:#111827;">
          ${ai.astigmatism.detected
            ? `${ai.astigmatism.probability.charAt(0).toUpperCase() + ai.astigmatism.probability.slice(1)} probability`
            : 'Not detected'}
        </span>
        ${ai.astigmatism.axisEstimate !== null ? pill(`×${ai.astigmatism.axisEstimate}°`, '#fef3c7', '#92400e') : ''}
      </div>
      ${ai.astigmatism.detected && ai.astigmatism.note ? `<div class="insight-sub">${esc(ai.astigmatism.note)}</div>` : ''}
      ${ai.astigmatism.axisTypeLabel ? `<div style="margin-top:4px;">${tag(ai.astigmatism.axisTypeLabel, '#92400e', '#fef3c7')}</div>` : ''}
    </div>

    <div class="insight-row">
      <div class="insight-label">Colour Deficiency Classification</div>
      <div style="font-size:13px;font-weight:700;color:${ai.colorVision.classification === 'normal_trichromacy' ? '#16a34a' : ai.colorVision.classification === 'insufficient_data' ? '#9ca3af' : '#d97706'};">
        ${esc(ai.colorVision.label)}
      </div>
      <div class="insight-sub">${esc(ai.colorVision.note)}</div>
    </div>

    <!-- Confidence bar -->
    <div style="margin:14px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Result Confidence</span>
        <span style="font-size:12px;font-weight:700;color:${cc};">${ai.confidenceScore}% — ${ai.confidenceGrade.charAt(0).toUpperCase() + ai.confidenceGrade.slice(1)}</span>
      </div>
      <div style="height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
        <div style="height:7px;width:${ai.confidenceScore}%;background:${cc};border-radius:4px;"></div>
      </div>
    </div>

    ${ai.remarks.length > 0 ? `
    <div style="margin-top:14px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Additional Remarks</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${ai.remarks.map((r) => `
        <div style="display:flex;align-items:flex-start;gap:8px;background:${remarkBg[r.type] ?? '#f9fafb'};border-radius:10px;padding:10px;">
          <span style="color:${remarkIconColor[r.type] ?? '#9ca3af'};font-size:14px;margin-top:1px;">ℹ</span>
          <span style="flex:1;font-size:12px;color:${r.type === 'info' ? '#6b7280' : '#374151'};line-height:18px;">${esc(r.text)}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

// ─── EDIS Panel ───────────────────────────────────────────────────────────────

function edisSection(edis: SensorInterpretResponse): string {
  const urgency  = edis.urgency?.toUpperCase() ?? 'LOW';
  const urgColor: Record<string, string> = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626', CRITICAL: '#7c2d12' };
  const urgBg:    Record<string, string> = { LOW: '#f0fdf4', MEDIUM: '#fffbeb', HIGH: '#fef2f2', CRITICAL: '#fff1f2' };
  const uc = urgColor[urgency] ?? '#374151';
  const ub = urgBg[urgency]   ?? '#f9fafb';

  const sevColor: Record<string, string>  = { low: '#16a34a', medium: '#d97706', high: '#dc2626' };
  const invColor: Record<string, string>  = { ROUTINE: TEAL, URGENT: '#d97706', STAT: '#dc2626' };

  return `
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div>
        <div style="font-size:14px;font-weight:800;color:#111827;">LifeGate Interpretation</div>
        <div style="font-size:11px;color:#9ca3af;">${edis.providerName ? `Powered by ${esc(edis.providerName.replace(/openai/gi, 'DSHub'))}` : 'AI-backed probabilistic analysis'}</div>
      </div>
      <div style="margin-left:auto;">${pill(urgency, ub, uc)}</div>
    </div>

    ${edis.assessment ? `<div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px;color:#374151;line-height:20px;">${esc(edis.assessment)}</div>` : ''}

    ${edis.conditions.length > 0 ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Differential / Conditions</div>
      ${edis.conditions.map((c) => {
        const bc = c.confidence >= 70 ? TEAL : c.confidence >= 40 ? '#d97706' : '#9ca3af';
        return `
        <div style="background:#f9fafb;border-radius:12px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="flex:1;font-size:13px;font-weight:700;color:#111827;">${esc(c.condition)}</span>
            <span style="font-size:12px;font-weight:800;color:${bc};">${c.confidence}%</span>
          </div>
          <div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:6px;">
            <div style="height:5px;width:${c.confidence}%;background:${bc};border-radius:3px;"></div>
          </div>
          ${c.description ? `<div style="font-size:11px;color:#6b7280;line-height:16px;">${esc(c.description)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>` : ''}

    ${edis.riskFlags.length > 0 ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Risk Flags</div>
      ${edis.riskFlags.map((rf) => {
        const sev = rf.severity?.toLowerCase() ?? 'low';
        const sc = sevColor[sev] ?? '#6b7280';
        return `
        <div style="display:flex;align-items:flex-start;gap:8px;background:${sc}12;border-radius:10px;padding:10px;margin-bottom:6px;">
          <span style="color:${sc};font-size:14px;">⚠</span>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:${sc};">${esc(rf.flag)}</div>
            ${rf.description ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;line-height:16px;">${esc(rf.description)}</div>` : ''}
          </div>
          ${pill(sev.toUpperCase(), sc + '22', sc)}
        </div>`;
      }).join('')}
    </div>` : ''}

    ${edis.investigations.length > 0 ? `
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">Recommended Investigations</div>
      ${edis.investigations.map((inv) => {
        const urg = inv.urgency?.toUpperCase() ?? 'ROUTINE';
        const ic = invColor[urg] ?? '#374151';
        return `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;">
          <div style="width:28px;height:28px;border-radius:7px;background:${ic}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="font-size:13px;">🧪</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:#111827;">${esc(inv.test)}</div>
            ${inv.reason ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${esc(inv.reason)}</div>` : ''}
          </div>
          ${pill(urg, ic + '20', ic)}
        </div>`;
      }).join('')}
    </div>` : ''}

    ${edis.needsPhysicianReview ? `
    <div style="display:flex;align-items:center;gap:8px;background:#eff6ff;border-radius:10px;padding:10px;">
      <span style="font-size:16px;">👨‍⚕️</span>
      <span style="flex:1;font-size:12px;color:#1e40af;font-weight:600;line-height:17px;">Physician review recommended. Please share these results with a healthcare provider.</span>
    </div>` : ''}
  </div>`;
}

// ─── Behavioural Panel ────────────────────────────────────────────────────────

function behavioralSection(report: BehavioralReport): string {
  const reliabilityColor: Record<string, string> = { strong: '#16a34a', acceptable: '#d97706', poor: '#dc2626' };

  return `
  <div class="card">
    <div class="card-title">Behavioural Signals</div>
    ${report.reliabilityScores.length > 0 ? `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Reliability</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${report.reliabilityScores.map((rs) => {
          const color = reliabilityColor[rs.grade] ?? '#6b7280';
          return `<span style="display:inline-flex;align-items:center;gap:4px;background:${color}12;border-radius:8px;padding:4px 10px;">
            <span style="font-size:11px;font-weight:700;color:${color};text-transform:capitalize;">${esc(rs.dimension)}</span>
            <span style="font-size:11px;color:${color};">· ${esc(rs.grade)}</span>
          </span>`;
        }).join('')}
      </div>
    </div>` : ''}
    ${report.avgResponseMs !== undefined ? `
    <div class="row-item">
      <span class="row-label">Avg. Response Latency</span>
      <span class="row-value">${Math.round(report.avgResponseMs)} ms</span>
    </div>` : ''}
    ${report.eyeSwitchCompliance !== undefined ? `
    <div class="row-item">
      <span class="row-label">Eye-Switch Compliance</span>
      <span class="row-value">${Math.round(report.eyeSwitchCompliance * 100)}%</span>
    </div>` : ''}
  </div>`;
}

// ─── Full HTML document ───────────────────────────────────────────────────────

export interface BatteryPDFOptions {
  results: SingleTestResult[];
  behavioralReport: BehavioralReport | null;
  user: { name?: string; dob?: string } | null;
  userAge?: number;
  viewingDistanceCm: number;
  duration: number | null;
  edisResult: SensorInterpretResponse | null;
}

function buildHTML(opts: BatteryPDFOptions): string {
  const { results, behavioralReport, user, userAge, viewingDistanceCm, duration, edisResult } = opts;
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const acuity   = results.find((r) => r.testId === 'acuity')       as AcuityResult | undefined;
  const color    = results.find((r) => r.testId === 'color')        as ColorResult  | undefined;
  const astig    = results.find((r) => r.testId === 'astigmatism')  as AstigmatismResult | undefined;
  const contrast = results.find((r) => r.testId === 'contrast')     as ContrastResult | undefined;
  const near     = results.find((r) => r.testId === 'near')         as NearVisionResult | undefined;

  const testBadges = results.map((r) =>
    `<span style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:3px 12px;font-size:12px;color:#fff;font-weight:600;text-transform:capitalize;">${esc(r.testId)}</span>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LifeGate Vision Report — ${esc(user?.name ?? 'Patient')}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f9fafb;
      color: #111827;
      padding: 24px;
      max-width: 720px;
      margin: 0 auto;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      border: 1.5px solid #e5e7eb;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 800;
      color: #111827;
      margin-bottom: 10px;
    }
    .row-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .row-item:last-of-type { border-bottom: none; }
    .row-label { font-size: 12px; color: #6b7280; }
    .row-value { font-size: 13px; font-weight: 700; color: #111827; }
    .sub-text  { font-size: 11px; color: #9ca3af; margin-top: 6px; }
    .insight-row {
      padding: 9px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .insight-row:last-of-type { border-bottom: none; }
    .insight-label { font-size: 11px; color: #9ca3af; margin-bottom: 3px; }
    .insight-sub   { font-size: 12px; color: #374151; line-height: 18px; margin-top: 3px; }
    .hero {
      background: linear-gradient(135deg, ${TEAL}, ${TEAL_DARK});
      border-radius: 22px;
      padding: 24px;
      text-align: center;
      color: #fff;
      margin-bottom: 20px;
    }
    .patient-card {
      background: #fff;
      border-radius: 16px;
      border: 1.5px solid #e5e7eb;
      padding: 16px 20px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .patient-avatar {
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, ${TEAL}, ${TEAL_DARK});
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; color: #fff; flex-shrink: 0;
    }
    .disclaimer {
      background: #f3f4f6;
      border-radius: 12px;
      padding: 12px;
      margin-top: 4px;
      margin-bottom: 16px;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
      line-height: 17px;
    }
    .print-btn {
      display: block;
      width: 100%;
      padding: 14px;
      border-radius: 14px;
      border: none;
      background: linear-gradient(135deg, ${TEAL}, ${TEAL_DARK});
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      margin-bottom: 24px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-btn { display: none !important; }
    }
  </style>
</head>
<body>

  <!-- Print button (fallback if auto-print is dismissed) -->
  <button class="print-btn" onclick="window.print()">🖨 Save as PDF / Print</button>

  <!-- Patient info -->
  <div class="patient-card">
    <div class="patient-avatar">👤</div>
    <div>
      <div style="font-size:16px;font-weight:800;color:#111827;">${esc(user?.name ?? 'Patient')}</div>
      ${userAge !== undefined ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">Age: ${userAge}</div>` : ''}
      <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Report generated: ${esc(dateStr)}</div>
    </div>
    <div style="margin-left:auto;text-align:right;">
      <div style="font-size:11px;color:#9ca3af;">Distance</div>
      <div style="font-size:13px;font-weight:700;color:#374151;">${viewingDistanceCm} cm</div>
      ${duration != null ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">Duration: ${Math.ceil(duration / 60)} min</div>` : ''}
    </div>
  </div>

  <!-- Hero -->
  <div class="hero">
    <div style="font-size:42px;margin-bottom:8px;">✅</div>
    <div style="font-size:21px;font-weight:900;margin-bottom:6px;">Assessment Complete</div>
    <div style="font-size:13px;opacity:0.75;margin-bottom:14px;">
      ${results.length} test${results.length !== 1 ? 's' : ''} completed${duration != null ? `  ·  ${Math.ceil(duration / 60)} min` : ''}
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">${testBadges}</div>
  </div>

  <!-- Clinical Summary -->
  ${results.length > 0 ? clinicalSummarySection(results) : ''}

  <!-- AI / EDIS interpretation -->
  ${results.length > 0
    ? edisResult?.success
      ? edisSection(edisResult)
      : aiSection(results, behavioralReport)
    : ''}

  <!-- Individual test cards -->
  ${acuity   ? acuitySection(acuity)                       : ''}
  ${color    ? colorSection(color)                         : ''}
  ${astig    ? astigmatismSection(astig)                   : ''}
  ${contrast ? contrastSection(contrast, userAge)          : ''}
  ${near     ? nearVisionSection(near)                     : ''}

  <!-- Behavioural -->
  ${behavioralReport ? behavioralSection(behavioralReport) : ''}

  <!-- Disclaimer -->
  <div class="disclaimer">
    These results are from a screening tool only and do not replace a professional eye examination.
    Consult an eye-care professional for a formal assessment.
  </div>

</body>
<script>window.onload = function() { setTimeout(function() { window.print(); }, 400); };</script>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens the battery results as a styled HTML report in a new browser tab.
 * Call `window.print()` from that tab to save as PDF.
 * This function must only be called when `Platform.OS === 'web'`.
 */
export function openBatteryPDF(opts: BatteryPDFOptions): void {
  const html = buildHTML(opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke the object URL after the tab has had time to load it
  if (win) {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
