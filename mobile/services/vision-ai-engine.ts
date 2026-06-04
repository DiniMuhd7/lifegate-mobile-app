/**
 * Vision AI Interpretation Engine
 *
 * Produces a structured AI interpretation layer from completed vision battery
 * results and an optional behavioral reliability report.
 *
 * Design principles
 * ─────────────────
 * • Pure functions — no React, no side-effects.
 * • All probabilities and diopter estimates are heuristic / epidemiological;
 *   they are clearly labelled as estimates, NOT clinical prescriptions.
 * • Confidence is derived from behavioral reliability signals when available,
 *   falling back to trial-count heuristics.
 * • Refractive error typing uses the distance–near acuity discrepancy pattern
 *   (the classical clinical screening heuristic).
 *
 * References
 * ──────────
 * • Holladay JT (2004) Visual acuity measurements. J Cataract Refract Surg.
 * • Millodot M (2009) Dictionary of Optometry and Visual Science.
 * • WHO (2019) ICD-11 vision impairment classification.
 * • Duke-Elder S (1973) System of Ophthalmology, Vol V.
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
import { lookupAcuity, WHO_VISUAL_CATEGORY_INFO } from './clinical-standards-engine';

// ─── Output types ─────────────────────────────────────────────────────────────

export type RefractiveLikelihood = 'likely' | 'possible' | 'unlikely';

export type RefractiveCondition =
  | 'normal'
  | 'myopia'
  | 'hyperopia'
  | 'presbyopia'
  | 'mixed'
  | 'insufficient_data';

export interface AcuityInsight {
  logMAR: number;
  /** US Snellen, e.g. "20/20" */
  snellen20: string;
  /** Metric Snellen, e.g. "6/6" */
  snellen6: string;
  /** Decimal acuity, e.g. 1.00 */
  decimal: number;
  /** Human-readable WHO category label */
  whoLabel: string;
  /** Summary sentence for display */
  description: string;
}

export interface RefractiveInsight {
  condition: RefractiveCondition;
  /** Display label */
  label: string;
  probability: RefractiveLikelihood;
  /**
   * Estimated dioptric range — indicative only, not a prescription.
   * Present when myopia or hyperopia is likely/possible.
   */
  estimatedRange: string | null;
  description: string;
}

export interface AstigmatismInsight {
  detected: boolean;
  /** How certain is the finding */
  probability: 'high' | 'moderate' | 'low' | 'none';
  /** TABO axis in degrees (0–180), or null */
  axisEstimate: number | null;
  /** Qualitative axis type */
  axisType: 'with_the_rule' | 'against_the_rule' | 'oblique' | null;
  axisTypeLabel: string | null;
  /** Human-readable note about the finding */
  note: string;
}

export interface ColorVisionInsight {
  classification:
    | 'normal_trichromacy'
    | 'red_green_deficiency'
    | 'protan'
    | 'deutan'
    | 'insufficient_data';
  label: string;
  severity: 'none' | 'mild' | 'moderate' | 'severe' | null;
  note: string;
}

export interface InterpretationRemark {
  /** Ionicons name */
  icon: string;
  text: string;
  type: 'finding' | 'suggestion' | 'warning' | 'info';
}

export interface AIInterpretation {
  /** Visual acuity structured insight — null when acuity test was not run */
  acuity: AcuityInsight | null;
  /** Refractive error likelihood (myopia / hyperopia / normal) */
  refractive: RefractiveInsight;
  /** Astigmatism findings */
  astigmatism: AstigmatismInsight;
  /** Color vision classification */
  colorVision: ColorVisionInsight;
  /**
   * 0–100 confidence in the overall interpretation.
   * Derived from behavioral reliability when available.
   */
  confidenceScore: number;
  confidenceGrade: 'high' | 'moderate' | 'low';
  confidenceNote: string;
  /** Ordered list of structured remarks for the "AI Remarks" section */
  remarks: InterpretationRemark[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Approximate sphere diopter range from distance LogMAR.
 * These are population-level screening estimates based on the
 * Holladay (2004) LogMAR–diopter conversion heuristic.
 */
function myopiaDiopterRange(logMAR: number): string {
  if (logMAR <= 0.30) return '−0.50D to −0.75D';
  if (logMAR <= 0.50) return '−0.75D to −1.50D';
  if (logMAR <= 0.70) return '−1.50D to −2.50D';
  if (logMAR <= 1.00) return '−2.50D to −4.00D';
  return '> −4.00D';
}

function hyperopiaNote(distanceLogMAR: number, nearPoints: number | undefined): string {
  if (nearPoints !== undefined && nearPoints >= 14 && distanceLogMAR <= 0.20) {
    return 'Near vision difficulty with adequate distance acuity suggests latent hyperopia or early presbyopia.';
  }
  return 'Combined distance and near acuity reduction may indicate hyperopia or a mixed refractive error.';
}

function getAxisTypeLabel(
  axis: number,
): { type: AstigmatismInsight['axisType']; label: string } {
  const a = ((axis % 180) + 180) % 180;
  if (a <= 20 || a >= 160) return { type: 'with_the_rule',    label: 'With-the-Rule (axis ~180°)' };
  if (a >= 70 && a <= 110) return { type: 'against_the_rule', label: 'Against-the-Rule (axis ~90°)' };
  return                         { type: 'oblique',           label: `Oblique (axis ~${a}°)` };
}

// ─── Confidence: reliability-based derivation ─────────────────────────────────

const RELIABILITY_SCORE_MAP: Record<string, number> = {
  excellent: 92,
  good:      76,
  fair:      54,
  poor:      28,
};

function deriveConfidence(
  results: SingleTestResult[],
  behavioralReport: BehavioralReport | null | undefined,
): { score: number; grade: AIInterpretation['confidenceGrade']; note: string } {
  if (behavioralReport && behavioralReport.reliabilityScores.length > 0) {
    const scores = behavioralReport.reliabilityScores.map(
      (r) => RELIABILITY_SCORE_MAP[r.grade] ?? 50,
    );
    const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

    // Penalise if overall reliability is 'poor'
    const penalty = behavioralReport.overallReliability === 'poor' ? 10 : 0;
    const final   = Math.max(10, avg - penalty);

    const grade: AIInterpretation['confidenceGrade'] =
      final >= 80 ? 'high' : final >= 55 ? 'moderate' : 'low';

    const gradeLabel: Record<string, string> = {
      excellent: 'excellent',
      good:      'good',
      fair:      'fair',
      poor:      'low',
    };
    const note = `Based on ${gradeLabel[behavioralReport.overallReliability] ?? 'moderate'} behavioral reliability across ${behavioralReport.reliabilityScores.length} test${behavioralReport.reliabilityScores.length !== 1 ? 's' : ''}.`;
    return { score: final, grade, note };
  }

  // Fallback: estimate from trial count
  const acuity = results.find((r) => r.testId === 'acuity') as AcuityResult | undefined;
  const trials = acuity?.trials.length ?? 0;
  let base = trials >= 14 ? 72 : trials >= 10 ? 60 : trials >= 6 ? 48 : 35;
  // Bonus if multiple tests were done (more data = better cross-check)
  base = Math.min(80, base + Math.min(results.length - 1, 4) * 3);
  const grade: AIInterpretation['confidenceGrade'] =
    base >= 70 ? 'moderate' : 'low';
  const note =
    base >= 60
      ? 'Confidence estimated from trial count (no behavioral data available).'
      : 'Limited trials or missing tests reduce confidence in this interpretation.';
  return { score: base, grade, note };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * generateAIInterpretation
 *
 * Accepts the completed battery results and an optional behavioral report,
 * and returns a structured `AIInterpretation` object.
 */
export function generateAIInterpretation(
  results: SingleTestResult[],
  behavioralReport?: BehavioralReport | null,
): AIInterpretation {
  const acuityResult    = results.find((r) => r.testId === 'acuity')       as AcuityResult       | undefined;
  const colorResult     = results.find((r) => r.testId === 'color')        as ColorResult        | undefined;
  const astigResult     = results.find((r) => r.testId === 'astigmatism')  as AstigmatismResult  | undefined;
  const contrastResult  = results.find((r) => r.testId === 'contrast')     as ContrastResult     | undefined;
  const nearResult      = results.find((r) => r.testId === 'near')         as NearVisionResult   | undefined;

  // ── 1. Acuity insight ────────────────────────────────────────────────────────
  let acuityInsight: AcuityInsight | null = null;
  if (acuityResult) {
    const row = lookupAcuity(acuityResult.logMAR);
    const catInfo = WHO_VISUAL_CATEGORY_INFO[row.whoCategory];
    const logMAR = acuityResult.logMAR;
    acuityInsight = {
      logMAR,
      snellen20: row.snellen20,
      snellen6:  row.snellen6,
      decimal:   row.decimal,
      whoLabel:  catInfo.label,
      description:
        logMAR <= 0.00
          ? `${logMAR.toFixed(1)} LogMAR ≈ ${row.snellen6} — Exceptional or perfect visual acuity.`
          : logMAR <= 0.10
          ? `${logMAR.toFixed(1)} LogMAR ≈ ${row.snellen6} — Normal visual acuity.`
          : logMAR <= 0.30
          ? `${logMAR.toFixed(1)} LogMAR ≈ ${row.snellen6} — Near-normal acuity; mild reduction.`
          : logMAR <= 0.60
          ? `${logMAR.toFixed(1)} LogMAR ≈ ${row.snellen6} — Moderate reduction in distance acuity.`
          : `${logMAR.toFixed(1)} LogMAR ≈ ${row.snellen6} — Significant reduction in visual acuity.`,
    };
  }

  // ── 2. Refractive error likelihood ──────────────────────────────────────────
  const distanceLogMAR  = acuityResult?.logMAR;
  const nearPoints      = nearResult?.smallestReadablePoints;
  let refractive: RefractiveInsight;

  if (distanceLogMAR === undefined) {
    refractive = {
      condition:      'insufficient_data',
      label:          'Insufficient Data',
      probability:    'unlikely',
      estimatedRange: null,
      description:    'Visual acuity test was not completed. Distance acuity is required to estimate refractive error type.',
    };
  } else if (distanceLogMAR <= 0.10 && (nearPoints === undefined || nearPoints <= 8)) {
    // Good distance + good near → no significant refractive error
    refractive = {
      condition:      'normal',
      label:          'No Significant Refractive Error',
      probability:    'likely',
      estimatedRange: null,
      description:    'Distance and near acuity are both within normal limits. No significant refractive error is indicated.',
    };
  } else if (distanceLogMAR >= 0.30 && (nearPoints === undefined || nearPoints <= 8)) {
    // Distance reduced + near preserved → classic myopia pattern
    const range = myopiaDiopterRange(distanceLogMAR);
    const prob: RefractiveLikelihood = distanceLogMAR >= 0.50 ? 'likely' : 'possible';
    refractive = {
      condition:      'myopia',
      label:          'Myopia (Short-Sightedness)',
      probability:    prob,
      estimatedRange: range,
      description:    `Reduced distance acuity with preserved near vision is the classic myopia pattern. Estimated sphere: ${range}.`,
    };
  } else if (distanceLogMAR <= 0.20 && nearPoints !== undefined && nearPoints >= 10) {
    // Distance preserved + near reduced → hyperopia / presbyopia
    const condition: RefractiveCondition =
      nearPoints >= 14 ? 'presbyopia' : 'hyperopia';
    refractive = {
      condition,
      label:          condition === 'presbyopia' ? 'Presbyopia / Latent Hyperopia' : 'Hyperopia (Long-Sightedness)',
      probability:    'possible',
      estimatedRange: null,
      description:    hyperopiaNote(distanceLogMAR, nearPoints),
    };
  } else if (distanceLogMAR >= 0.20 && nearPoints !== undefined && nearPoints >= 12) {
    // Both reduced → mixed / compound ametropia
    refractive = {
      condition:      'mixed',
      label:          'Mixed / Compound Refractive Error',
      probability:    'possible',
      estimatedRange: null,
      description:    'Both distance and near acuity are reduced. This pattern may indicate compound myopia, high hyperopia, or an uncorrected astigmatism component.',
    };
  } else if (distanceLogMAR >= 0.20) {
    // Distance reduced, near unknown → lean toward myopia but uncertain
    const range = myopiaDiopterRange(distanceLogMAR);
    refractive = {
      condition:      'myopia',
      label:          'Possible Myopia',
      probability:    'possible',
      estimatedRange: range,
      description:    `Distance acuity is below normal. Myopia is possible (estimated ${range}), though near vision data was not collected to confirm the pattern.`,
    };
  } else {
    refractive = {
      condition:      'normal',
      label:          'Likely Within Normal Range',
      probability:    'likely',
      estimatedRange: null,
      description:    'Acuity measurements are within or near normal limits.',
    };
  }

  // ── 3. Astigmatism insight ───────────────────────────────────────────────────
  let astigmatism: AstigmatismInsight;

  if (!astigResult || astigResult.severity === 'none') {
    astigmatism = {
      detected:    false,
      probability: 'none',
      axisEstimate: null,
      axisType:    null,
      axisTypeLabel: null,
      note:        'No astigmatism detected on clock-dial assessment.',
    };
  } else {
    const probMap: Record<string, AstigmatismInsight['probability']> = {
      mild:     'low',
      moderate: 'moderate',
      marked:   'high',
    };
    const prob = probMap[astigResult.severity] ?? 'low';
    const axis = astigResult.detectedAxis;
    const axisInfo = axis !== null ? getAxisTypeLabel(axis) : null;

    astigmatism = {
      detected:      true,
      probability:   prob,
      axisEstimate:  axis,
      axisType:      axisInfo?.type ?? null,
      axisTypeLabel: axisInfo?.label ?? null,
      note:
        axis !== null
          ? `${astigResult.severity.charAt(0).toUpperCase() + astigResult.severity.slice(1)} astigmatism suspected along the ${axis}° axis (${axisInfo?.label ?? ''}).`
          : `${astigResult.severity.charAt(0).toUpperCase() + astigResult.severity.slice(1)} astigmatism suspected; axis not precisely determined.`,
    };
  }

  // ── 4. Color vision insight ──────────────────────────────────────────────────
  let colorVision: ColorVisionInsight;

  if (!colorResult) {
    colorVision = {
      classification: 'insufficient_data',
      label:          'Not Tested',
      severity:       null,
      note:           'Color vision screening was not completed.',
    };
  } else if (colorResult.category === 'normal') {
    colorVision = {
      classification: 'normal_trichromacy',
      label:          'Normal Trichromacy',
      severity:       'none',
      note:           'All Ishihara screening plates passed. No colour vision deficiency detected.',
    };
  } else {
    const cvdType = colorResult.cvdType;
    type ClassificationType = ColorVisionInsight['classification'];
    const classMap: Record<string, ClassificationType> = {
      protan:          'protan',
      deutan:          'deutan',
      protan_or_deutan:'red_green_deficiency',
      insufficient_data: 'insufficient_data',
    };
    const sevMap: Record<string, ColorVisionInsight['severity']> = {
      mild:     'mild',
      moderate: 'moderate',
      severe:   'severe',
      none:     'none',
    };

    const classification: ClassificationType = cvdType
      ? (classMap[cvdType] ?? 'red_green_deficiency')
      : 'red_green_deficiency';

    const labelMap: Record<ClassificationType, string> = {
      normal_trichromacy:  'Normal Trichromacy',
      red_green_deficiency:'Red-Green Colour Deficiency',
      protan:             'Protan Deficiency (Red-Weak)',
      deutan:             'Deutan Deficiency (Green-Weak)',
      insufficient_data:  'Insufficient Data',
    };

    const catSev = colorResult.category === 'severe_deficiency' ? 'severe'
      : colorResult.category === 'moderate_deficiency' ? 'moderate'
      : 'mild';

    colorVision = {
      classification,
      label:    labelMap[classification],
      severity: sevMap[catSev] ?? null,
      note:
        classification === 'protan'
          ? 'Reduced red-channel sensitivity detected. Likely protanomaly or protanopia (X-linked).'
          : classification === 'deutan'
          ? 'Reduced green-channel sensitivity detected. Likely deuteranomaly or deuteranopia (X-linked).'
          : `Red-green colour vision deficiency detected. Further testing (full 38-plate Ishihara or anomaloscope) recommended to classify protan vs deutan.`,
    };
  }

  // ── 5. Confidence ────────────────────────────────────────────────────────────
  const { score: confidenceScore, grade: confidenceGrade, note: confidenceNote } =
    deriveConfidence(results, behavioralReport);

  // ── 6. Remarks ───────────────────────────────────────────────────────────────
  const remarks: InterpretationRemark[] = [];

  // Acuity-based finding
  if (acuityResult) {
    const logMAR = acuityResult.logMAR;
    if (logMAR <= 0.10) {
      remarks.push({
        icon: 'checkmark-circle-outline',
        text: `Visual acuity is ${acuityInsight?.snellen6 ?? acuityResult.snellen} — within the normal range.`,
        type: 'finding',
      });
    } else {
      remarks.push({
        icon: 'eye-outline',
        text: acuityInsight?.description ?? `Visual acuity: ${acuityResult.snellen} (LogMAR ${logMAR.toFixed(2)}).`,
        type: 'finding',
      });
    }
  }

  // Refractive error remark
  if (refractive.condition === 'myopia' && refractive.estimatedRange) {
    remarks.push({
      icon: 'glasses-outline',
      text: `Findings consistent with ${refractive.probability === 'likely' ? 'likely' : 'possible'} myopia (${refractive.estimatedRange} estimated sphere).`,
      type: 'finding',
    });
  } else if (refractive.condition === 'hyperopia') {
    remarks.push({
      icon: 'glasses-outline',
      text: 'Near vision difficulty with good distance acuity — consistent with hyperopia or early presbyopia.',
      type: 'finding',
    });
  } else if (refractive.condition === 'presbyopia') {
    remarks.push({
      icon: 'reader-outline',
      text: 'Near vision reduction with adequate distance acuity is typical of presbyopia. Reading correction may be beneficial.',
      type: 'finding',
    });
  } else if (refractive.condition === 'mixed') {
    remarks.push({
      icon: 'alert-circle-outline',
      text: 'Both distance and near acuity are reduced — a compound or mixed refractive error cannot be excluded.',
      type: 'warning',
    });
  }

  // Astigmatism remark
  if (astigmatism.detected && astigmatism.axisEstimate !== null) {
    remarks.push({
      icon: 'compass-outline',
      text: `Astigmatism suspected along the ${astigmatism.axisEstimate}° axis (${astigmatism.axisTypeLabel ?? astigmatism.axisType ?? ''}).`,
      type: 'finding',
    });
  } else if (astigmatism.detected) {
    remarks.push({
      icon: 'compass-outline',
      text: `${astigmatism.probability === 'high' ? 'Marked' : 'Mild to moderate'} astigmatism suspected on clock-dial assessment.`,
      type: 'finding',
    });
  }

  // Color vision remark
  if (colorVision.classification !== 'normal_trichromacy' && colorVision.classification !== 'insufficient_data') {
    remarks.push({
      icon: 'color-palette-outline',
      text: `Colour vision deficiency detected (${colorVision.label}). This is typically hereditary and cannot be corrected.`,
      type: 'finding',
    });
  }

  // Contrast remark
  if (contrastResult?.contrastGrade === 'reduced' || contrastResult?.contrastGrade === 'severely_reduced') {
    remarks.push({
      icon: 'contrast-outline',
      text: `Reduced contrast sensitivity (log CS ${contrastResult.pelliRobsonLogCS?.toFixed(2) ?? '—'}) — may affect night driving and reading in dim light.`,
      type: 'warning',
    });
  }

  // Referral suggestion
  const needsReferral =
    (distanceLogMAR !== undefined && distanceLogMAR >= 0.30) ||
    astigResult?.severity === 'moderate' ||
    astigResult?.severity === 'marked' ||
    (nearPoints !== undefined && nearPoints >= 10) ||
    contrastResult?.contrastGrade === 'reduced' ||
    contrastResult?.contrastGrade === 'severely_reduced';

  if (needsReferral) {
    remarks.push({
      icon: 'calendar-outline',
      text: 'Recommend an in-person refraction test with a qualified optometrist or ophthalmologist.',
      type: 'suggestion',
    });
  }

  // Confidence caveat
  remarks.push({
    icon: 'information-circle-outline',
    text: `Interpretation confidence: ${confidenceScore}% — ${confidenceNote}`,
    type: 'info',
  });

  // Disclaimer
  remarks.push({
    icon: 'shield-checkmark-outline',
    text: 'These insights are algorithmic estimates from a screening tool and do not constitute a clinical diagnosis or prescription.',
    type: 'info',
  });

  return {
    acuity:         acuityInsight,
    refractive,
    astigmatism,
    colorVision,
    confidenceScore,
    confidenceGrade,
    confidenceNote,
    remarks,
  };
}
