/**
 * Hearing AI Interpretation Engine
 *
 * Produces a structured AI interpretation from a completed hearing battery:
 *
 *   • Per-ear hearing loss classification (WHO grade 0–4)
 *   • Audiogram shape-based pattern detection:
 *       – Noise-induced hearing loss  (4 kHz notch / NIHL)
 *       – Age-related change          (presbycusis — bilateral sloping)
 *       – Flat / rising / cookie-bite patterns
 *   • Symmetry assessment (symmetric | asymmetric | unilateral)
 *   • Confidence score derived from behavioural reliability reports
 *   • Ordered structured remarks for the "AI Remarks" section
 *
 * Design principles
 * ─────────────────
 * • Pure functions — no React, no side effects.
 * • Pattern inferences are heuristic, not diagnostic.
 *   They are clearly labelled as "possible / likely indicators".
 * • Confidence reflects behavioural data quality (response consistency,
 *   staircase convergence) — NOT aetiology certainty.
 *
 * References
 * ──────────
 * • WHO (2021) World Report on Hearing.
 * • ASHA (2005) Guidelines for Manual Pure-Tone Threshold Audiometry.
 * • Cruickshanks KJ et al. (1998) Prevalence of hearing loss in older adults:
 *   the Epidemiology of Hearing Loss Study. Am J Epidemiol 148:879–886.
 * • Rabinowitz PM (2000) Noise-induced hearing loss. Am Fam Physician.
 * • Quaranta A et al. (1996) Audiological asymmetry — definition and clinical
 *   significance. Audiology 35:189–196.
 */

import type {
  WHOGrade,
  HearingLossCategory,
  AudiogramShape,
  EarResult,
  SINResult,
  HFResult,
  BehavioralReport,
  ReliabilityGrade,
  FrequencyThreshold,
} from 'types/hearing-types';

// ─── Output types ─────────────────────────────────────────────────────────────

/** Structured summary for one ear. */
export interface EarHearingInsight {
  ear: 'right' | 'left';
  grade: WHOGrade;
  category: HearingLossCategory;
  gradeLabel: string;
  /** PTA3 (500, 1000, 2000 Hz average) in dBHL */
  pta3: number;
  /** Audiogram shape detected by PTA engine */
  shape: AudiogramShape | null;
  /** Human-readable shape label */
  shapeLabel: string | null;
  /** 4 kHz threshold in dBHL — key NIHL indicator */
  threshold4kHz: number | null;
  /** 8 kHz threshold in dBHL */
  threshold8kHz: number | null;
}

/**
 * Dominant audiological pattern determined by cross-ear analysis.
 *
 * - `normal`               — all thresholds ≤ 25 dBHL
 * - `noise_induced`        — 4 kHz notch ± HF progression (NIHL signature)
 * - `presbycusis`          — bilateral symmetric sloping high-frequency loss
 * - `sloping_hf`           — sloping high-frequency loss (unilateral or
 *                            insufficient symmetry evidence for presbycusis)
 * - `flat`                 — flat loss across frequencies (may indicate CHL)
 * - `rising`               — better at high frequencies (low-frequency SNHL)
 * - `cookie_bite`          — mid-frequency trough
 * - `mixed`                — two or more conflicting shapes in the same ear
 * - `irregular`            — no clear clinical pattern
 */
export type HearingPattern =
  | 'normal'
  | 'noise_induced'
  | 'presbycusis'
  | 'sloping_hf'
  | 'flat'
  | 'rising'
  | 'cookie_bite'
  | 'mixed'
  | 'irregular';

export interface PatternInsight {
  dominant: HearingPattern;
  label: string;
  probability: 'high' | 'moderate' | 'low';
  /** Primary descriptive note for display */
  note: string;
  /** True when NIHL risk evidence is present (notch + HF extension) */
  nihlRisk: boolean;
  /** Ordered evidence bullets shown in "Evidence" sub-section */
  evidencePoints: string[];
}

/** Binaural symmetry of the hearing loss. */
export type SymmetryType =
  | 'symmetric'     // |right PTA3 − left PTA3| ≤ 15 dB
  | 'asymmetric'    // > 15 dB difference
  | 'unilateral'    // only one ear tested
  | 'cannot_assess'; // no ear data

export type AIHearingRemarkType = 'finding' | 'suggestion' | 'warning' | 'info';

export interface AIHearingRemark {
  /** Ionicons icon name */
  icon: string;
  text: string;
  type: AIHearingRemarkType;
}

export interface AIHearingInterpretation {
  /** Right ear insight — null when right ear was not tested */
  earRight: EarHearingInsight | null;
  /** Left ear insight — null when left ear was not tested */
  earLeft: EarHearingInsight | null;
  /** Label for the overall worst grade across both ears */
  worstGradeLabel: string;
  /** Binaural symmetry classification */
  symmetry: SymmetryType;
  symmetryNote: string;
  /** Dominant audiological pattern */
  pattern: PatternInsight;
  /** 0–100; derived from behavioural reliability data when available */
  confidenceScore: number;
  confidenceGrade: 'high' | 'moderate' | 'low';
  confidenceNote: string;
  /** Ordered structured remarks */
  remarks: AIHearingRemark[];
}

// ─── Internal constants ───────────────────────────────────────────────────────

const WHO_GRADE_LABELS: Record<WHOGrade, string> = {
  0: 'Normal Hearing',
  1: 'Slight Hearing Loss',
  2: 'Moderate Hearing Loss',
  3: 'Moderately Severe Hearing Loss',
  4: 'Severe / Profound Hearing Loss',
};

const HEARING_LOSS_LABELS: Record<HearingLossCategory, string> = {
  normal:             'Normal',
  slight:             'Slight',
  moderate:           'Moderate',
  moderately_severe:  'Moderately Severe',
  severe:             'Severe',
  profound:           'Profound',
};

const SHAPE_LABELS: Record<AudiogramShape, string> = {
  normal:      'Normal (all frequencies in range)',
  flat:        'Flat (uniform loss across frequencies)',
  sloping:     'Sloping (progressive high-frequency loss)',
  rising:      'Rising (low-frequency loss)',
  notch:       '4 kHz Notch (noise-induced pattern)',
  cookie_bite: 'Cookie-bite (mid-frequency trough)',
  irregular:   'Irregular (no clear pattern)',
};

const RELIABILITY_SCORE_TABLE: Record<ReliabilityGrade, number> = {
  excellent: 92,
  good:      76,
  fair:      54,
  poor:      28,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEarInsight(earResult: EarResult): EarHearingInsight {
  const who = earResult.who;
  return {
    ear:            earResult.ear,
    grade:          who.grade,
    category:       who.category,
    gradeLabel:     WHO_GRADE_LABELS[who.grade],
    pta3:           who.pureTonaAverage,
    shape:          earResult.audiogramShape,
    shapeLabel:     SHAPE_LABELS[earResult.audiogramShape],
    threshold4kHz:  earResult.thresholds.find((t) => t.frequency === 4000)?.dbHL ?? null,
    threshold8kHz:  earResult.thresholds.find((t) => t.frequency === 8000)?.dbHL ?? null,
  };
}

function deriveConfidence(
  rightReport: BehavioralReport | undefined,
  leftReport:  BehavioralReport | undefined,
): { score: number; grade: AIHearingInterpretation['confidenceGrade']; note: string } {
  const scores: number[] = [];
  if (rightReport) scores.push(rightReport.reliabilityScore);
  if (leftReport)  scores.push(leftReport.reliabilityScore);

  if (scores.length > 0) {
    const avg    = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
    const grade: AIHearingInterpretation['confidenceGrade'] =
      avg >= 80 ? 'high' : avg >= 55 ? 'moderate' : 'low';

    const worseGrade = [rightReport?.reliabilityGrade, leftReport?.reliabilityGrade]
      .filter(Boolean)
      .sort((a, b) => {
        const order: ReliabilityGrade[] = ['poor', 'fair', 'good', 'excellent'];
        return order.indexOf(a!) - order.indexOf(b!);
      })[0];

    const worseLabel: Record<ReliabilityGrade, string> = {
      excellent: 'excellent',
      good:      'good',
      fair:      'fair',
      poor:      'low',
    };

    const testedEars = scores.length === 2 ? 'both ears' : 'one ear';
    const note = `Based on ${worseLabel[worseGrade as ReliabilityGrade] ?? 'moderate'} behavioural reliability across ${testedEars}.`;
    return { score: avg, grade, note };
  }

  // Fallback — no behavioral data
  return {
    score: 55,
    grade: 'moderate',
    note:  'Confidence estimated without behavioral reliability data.',
  };
}

/**
 * Determines the dominant audiological pattern from per-ear shapes,
 * 4 kHz thresholds, and extended-frequency results.
 */
function detectPattern(
  rightInsight: EarHearingInsight | null,
  leftInsight:  EarHearingInsight | null,
  hfResult:     HFResult | null | undefined,
): PatternInsight {
  const evidence: string[] = [];
  let nihlRisk = false;

  // ── Collect shapes ────────────────────────────────────────────────────────
  const shapes = [rightInsight?.shape, leftInsight?.shape].filter(
    (s): s is AudiogramShape => s !== undefined && s !== null,
  );

  const hasNotch    = shapes.includes('notch');
  const hasSloping  = shapes.includes('sloping');
  const hasFlat     = shapes.includes('flat');
  const hasRising   = shapes.includes('rising');
  const hasCookie   = shapes.includes('cookie_bite');
  const bothNormal  = shapes.every((s) => s === 'normal') && shapes.length > 0;

  // ── 4 kHz threshold indicators ────────────────────────────────────────────
  const notch4Right = rightInsight?.threshold4kHz !== null &&
    rightInsight?.threshold4kHz !== undefined &&
    rightInsight.threshold4kHz > 40;

  const notch4Left  = leftInsight?.threshold4kHz !== null &&
    leftInsight?.threshold4kHz !== undefined &&
    leftInsight.threshold4kHz > 40;

  // ── HF progression indicators ─────────────────────────────────────────────
  const hfNIHL    = hfResult?.nihlRiskFlag === true;
  const hfEarlyNIHL = hfResult?.pattern === 'early_nihl';

  if (hfNIHL)      evidence.push('Extended high-frequency test shows NIHL-consistent progression (4→12 kHz).');
  if (hfEarlyNIHL) evidence.push('9–12 kHz range shows progressive worsening — early noise-induced signature.');

  // ── All normal ────────────────────────────────────────────────────────────
  const allGradesNormal =
    (rightInsight === null || rightInsight.grade === 0) &&
    (leftInsight  === null || leftInsight.grade  === 0);

  if (allGradesNormal && !hasNotch && !hfNIHL) {
    return {
      dominant:       'normal',
      label:          'No Significant Hearing Loss Pattern',
      probability:    'high',
      note:           'All thresholds are within normal limits (≤ 25 dBHL). No audiological pattern detected.',
      nihlRisk:       false,
      evidencePoints: ['All measured PTA thresholds ≤ 25 dBHL.'],
    };
  }

  // ── Noise-induced (notch-based) ───────────────────────────────────────────
  if (hasNotch || (hfNIHL && (notch4Right || notch4Left))) {
    nihlRisk = true;
    if (hasNotch)     evidence.push('Classic 4 kHz notch detected on audiogram — hallmark of noise-induced hearing loss.');
    if (notch4Right)  evidence.push(`Right ear 4 kHz threshold elevated (${rightInsight!.threshold4kHz} dBHL).`);
    if (notch4Left)   evidence.push(`Left ear 4 kHz threshold elevated (${leftInsight!.threshold4kHz} dBHL).`);
    if (hfNIHL)       evidence.push('Extended HF audiometry confirms progressive loss beyond 8 kHz.');

    return {
      dominant:       'noise_induced',
      label:          'Noise-Induced Hearing Loss (NIHL Pattern)',
      probability:    hfNIHL ? 'high' : 'moderate',
      note:
        hfNIHL
          ? 'A 4 kHz notch combined with high-frequency progression is strongly consistent with noise-induced hearing loss or ototoxic damage.'
          : 'A dip (notch) at 4 kHz is the characteristic signature of noise-induced hearing loss. Extended HF testing would increase diagnostic confidence.',
      nihlRisk,
      evidencePoints: evidence,
    };
  }

  // ── Presbycusis (bilateral symmetric sloping) ─────────────────────────────
  const bothSloping = rightInsight?.shape === 'sloping' && leftInsight?.shape === 'sloping';
  const ptaDiff =
    rightInsight !== null && leftInsight !== null
      ? Math.abs(rightInsight.pta3 - leftInsight.pta3)
      : null;

  if (bothSloping && ptaDiff !== null && ptaDiff <= 20) {
    evidence.push('Bilateral sloping high-frequency loss — classic presbycusis configuration.');
    if (ptaDiff <= 10) evidence.push(`Both ears show near-identical PTA3 averages (right: ${rightInsight!.pta3} dBHL, left: ${leftInsight!.pta3} dBHL), consistent with symmetric age-related change.`);
    return {
      dominant:       'presbycusis',
      label:          'Age-Related Hearing Loss (Presbycusis)',
      probability:    ptaDiff <= 10 ? 'high' : 'moderate',
      note:           'Bilateral symmetric sloping loss is the hallmark of presbycusis. High-frequency thresholds are disproportionately elevated compared to low frequencies.',
      nihlRisk:       hfNIHL,
      evidencePoints: evidence,
    };
  }

  // ── Sloping (unilateral or asymmetric) ────────────────────────────────────
  if (hasSloping) {
    const affectedEars = [
      rightInsight?.shape === 'sloping' ? 'right' : null,
      leftInsight?.shape  === 'sloping' ? 'left'  : null,
    ].filter(Boolean);
    evidence.push(`Sloping high-frequency loss in ${affectedEars.join(' and ')} ear${affectedEars.length > 1 ? 's' : ''}.`);
    if (hfNIHL) {
      nihlRisk = true;
      evidence.push('HF audiometry flags elevated extended-frequency thresholds — NIHL cannot be excluded.');
    }
    return {
      dominant:       'sloping_hf',
      label:          'High-Frequency Hearing Loss (Sloping)',
      probability:    'moderate',
      note:
        'Progressive high-frequency loss is the most common form of SNHL. When bilateral and symmetric, presbycusis is the primary differential; when asymmetric or with a 4 kHz dip, noise-induced loss or other causes should be considered.',
      nihlRisk,
      evidencePoints: evidence,
    };
  }

  // ── Flat ──────────────────────────────────────────────────────────────────
  if (hasFlat) {
    evidence.push('Flat (uniform) loss pattern across all tested frequencies — may reflect conductive, metabolic, or other causes.');
    return {
      dominant:    'flat',
      label:       'Flat Hearing Loss Pattern',
      probability: 'moderate',
      note:        'A flat audiogram — similar loss at all frequencies — can indicate conductive hearing loss (e.g. middle-ear pathology), metabolic conditions, or certain types of SNHL. Referral for diagnostic testing is recommended.',
      nihlRisk:    false,
      evidencePoints: evidence,
    };
  }

  // ── Rising ────────────────────────────────────────────────────────────────
  if (hasRising) {
    evidence.push('Rising pattern — better high-frequency than low-frequency thresholds. Unusual configuration; may indicate low-frequency SNHL (Menière\'s, endolymphatic hydrops) or conductive asymmetry.');
    return {
      dominant:    'rising',
      label:       'Rising (Low-Frequency) Hearing Loss Pattern',
      probability: 'moderate',
      note:        'Good hearing at high pitches with difficulty at low pitches is less common and may suggest Ménière\'s disease, endolymphatic hydrops, or early SNHL. Specialist evaluation is recommended.',
      nihlRisk:    false,
      evidencePoints: evidence,
    };
  }

  // ── Cookie-bite ───────────────────────────────────────────────────────────
  if (hasCookie) {
    evidence.push('Mid-frequency (cookie-bite) trough — worst thresholds in the 1–2 kHz range with better hearing at low and high frequencies.');
    return {
      dominant:    'cookie_bite',
      label:       'Mid-Frequency (Cookie-Bite) Hearing Loss',
      probability: 'moderate',
      note:        'A mid-frequency trough (cookie-bite configuration) is uncommon and may be hereditary (DFNA and DFNB gene variants) or associated with conductive pathology. Formal audiological evaluation is recommended.',
      nihlRisk:    false,
      evidencePoints: evidence,
    };
  }

  // ── Mixed / irregular ─────────────────────────────────────────────────────
  evidence.push('No single dominant audiological pattern identified from available data.');
  if (shapes.length > 0) {
    evidence.push(`Shapes detected: ${shapes.map((s) => SHAPE_LABELS[s]).join('; ')}.`);
  }
  return {
    dominant:    'irregular',
    label:       'No Clear Audiological Pattern',
    probability: 'low',
    note:        'The available data does not fit a single classical audiological pattern. This may reflect measurement variability, incomplete testing, or an unusual configuration. Formal audiometry is recommended for definitive characterisation.',
    nihlRisk:    hfNIHL,
    evidencePoints: evidence,
  };
}

function assessSymmetry(
  right: EarHearingInsight | null,
  left:  EarHearingInsight | null,
): { symmetry: SymmetryType; note: string } {
  if (!right && !left) {
    return { symmetry: 'cannot_assess', note: 'No ear data available to assess symmetry.' };
  }
  if (!right || !left) {
    const testedEar = right ? 'right' : 'left';
    return {
      symmetry: 'unilateral',
      note:     `Only the ${testedEar} ear was tested. Bilateral assessment is not possible.`,
    };
  }

  const diff = Math.abs(right.pta3 - left.pta3);
  if (diff <= 15) {
    return {
      symmetry: 'symmetric',
      note:     `Both ears show similar PTA3 averages (right: ${right.pta3} dBHL, left: ${left.pta3} dBHL — within 15 dB).`,
    };
  }

  const worseEar   = right.pta3 > left.pta3 ? 'right' : 'left';
  const betterEar  = worseEar === 'right' ? 'left' : 'right';
  return {
    symmetry: 'asymmetric',
    note:     `Asymmetric hearing loss: ${worseEar} ear (${(worseEar === 'right' ? right : left).pta3} dBHL) is significantly worse than ${betterEar} ear (${(betterEar === 'right' ? right : left).pta3} dBHL). Asymmetric SNHL warrants further investigation.`,
  };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * generateAIHearingInterpretation
 *
 * Accepts completed ear results, optional SIN and HF data, and returns a
 * structured `AIHearingInterpretation` object for display.
 */
export function generateAIHearingInterpretation(
  rightEar:    EarResult | null | undefined,
  leftEar:     EarResult | null | undefined,
  sinResult?:  SINResult | null,
  hfResult?:   HFResult  | null,
): AIHearingInterpretation {
  const earRight = rightEar ? buildEarInsight(rightEar) : null;
  const earLeft  = leftEar  ? buildEarInsight(leftEar)  : null;

  // ── Worst grade ────────────────────────────────────────────────────────────
  const worstGrade = Math.max(
    earRight?.grade ?? 0,
    earLeft?.grade  ?? 0,
  ) as WHOGrade;
  const worstGradeLabel = WHO_GRADE_LABELS[worstGrade];

  // ── Symmetry ─────────────────────────────────────────────────────────────
  const { symmetry, note: symmetryNote } = assessSymmetry(earRight, earLeft);

  // ── Pattern ───────────────────────────────────────────────────────────────
  const pattern = detectPattern(earRight, earLeft, hfResult);

  // ── Confidence ────────────────────────────────────────────────────────────
  const { score: confidenceScore, grade: confidenceGrade, note: confidenceNote } =
    deriveConfidence(rightEar?.behavioralReport, leftEar?.behavioralReport);

  // ── Remarks ───────────────────────────────────────────────────────────────
  const remarks: AIHearingRemark[] = [];

  // Per-ear findings
  for (const ear of [earRight, earLeft].filter((e): e is EarHearingInsight => e !== null)) {
    const earLabel = ear.ear === 'right' ? 'right' : 'left';
    if (ear.grade === 0) {
      remarks.push({
        icon: 'checkmark-circle-outline',
        text: `No significant hearing loss detected in the ${earLabel} ear (PTA3 ${ear.pta3} dBHL — normal range).`,
        type: 'finding',
      });
    } else {
      const severityStr = HEARING_LOSS_LABELS[ear.category].toLowerCase();
      remarks.push({
        icon: 'ear-outline',
        text: `${HEARING_LOSS_LABELS[ear.category]} hearing loss detected in ${earLabel} ear (PTA3 ${ear.pta3} dBHL).`,
        type: ear.grade >= 3 ? 'warning' : 'finding',
      });
      if (ear.shape === 'sloping' || ear.shape === 'notch') {
        const freqRange = ear.shape === 'notch' ? 'at 4 kHz (notch)' : 'at high frequencies';
        remarks.push({
          icon: 'analytics-outline',
          text: `${earLabel.charAt(0).toUpperCase() + earLabel.slice(1)} ear audiogram shows ${severityStr} deterioration ${freqRange}.`,
          type: 'finding',
        });
      }
    }
  }

  // Pattern remark
  switch (pattern.dominant) {
    case 'noise_induced':
      remarks.push({
        icon: 'warning-outline',
        text: `Pattern consistent with ${pattern.probability === 'high' ? 'likely' : 'possible'} noise-induced hearing loss (4 kHz notch). Consider noise exposure history.`,
        type: 'warning',
      });
      break;
    case 'presbycusis':
      remarks.push({
        icon: 'time-outline',
        text: `Bilateral symmetric high-frequency loss is consistent with age-related hearing change (presbycusis).`,
        type: 'finding',
      });
      break;
    case 'sloping_hf':
      remarks.push({
        icon: 'trending-down-outline',
        text: `High-frequency hearing loss (sloping audiogram). Consider both noise exposure and age-related causes.`,
        type: 'finding',
      });
      break;
    case 'flat':
      remarks.push({
        icon: 'remove-outline',
        text: `Flat hearing loss pattern — equal loss across frequencies may suggest conductive or metabolic involvement.`,
        type: 'finding',
      });
      break;
    case 'rising':
      remarks.push({
        icon: 'alert-circle-outline',
        text: `Rising audiogram pattern (better at high pitches). Low-frequency SNHL — Ménière's or endolymphatic hydrops possible.`,
        type: 'warning',
      });
      break;
    case 'cookie_bite':
      remarks.push({
        icon: 'alert-circle-outline',
        text: `Mid-frequency cookie-bite pattern detected. This configuration may have a hereditary or conductive origin.`,
        type: 'finding',
      });
      break;
  }

  // Symmetry remark
  if (symmetry === 'asymmetric') {
    remarks.push({
      icon: 'git-compare-outline',
      text: `Asymmetric hearing loss detected. A difference > 15 dB between ears warrants audiological and medical follow-up to exclude retrocochlear pathology.`,
      type: 'warning',
    });
  }

  // NIHL risk remark from HF
  if (pattern.nihlRisk && hfResult) {
    remarks.push({
      icon: 'pulse-outline',
      text: `Extended high-frequency audiometry (9–12 kHz) shows ${hfResult.pattern === 'early_nihl' ? 'early NIHL progression pattern' : `elevated thresholds (avg ${hfResult.hfAverage} dBHL)`}.`,
      type: 'warning',
    });
  }

  // SIN correlation
  if (sinResult) {
    if (sinResult.grade !== 'normal') {
      remarks.push({
        icon: 'volume-high-outline',
        text: `Speech-in-Noise test shows ${sinResult.grade} difficulty (SNR loss ${sinResult.snrLoss.toFixed(1)} dB). Combined with elevated thresholds, this suggests functional impact in noisy environments.`,
        type: 'finding',
      });
    } else {
      remarks.push({
        icon: 'volume-high-outline',
        text: `Speech-in-Noise test result is normal (SNR loss ${sinResult.snrLoss.toFixed(1)} dB). Speech comprehension in noise is preserved.`,
        type: 'finding',
      });
    }
  }

  // Referral suggestion
  const needsReferral =
    worstGrade >= 1 ||
    pattern.nihlRisk ||
    symmetry === 'asymmetric' ||
    pattern.dominant === 'rising' ||
    pattern.dominant === 'cookie_bite';

  if (needsReferral) {
    remarks.push({
      icon: 'calendar-outline',
      text: 'Recommend formal audiometry with a qualified audiologist for a comprehensive evaluation and threshold confirmation.',
      type: 'suggestion',
    });
  }

  // Confidence note
  remarks.push({
    icon: 'information-circle-outline',
    text: `Interpretation confidence: ${confidenceScore}% — ${confidenceNote}`,
    type: 'info',
  });

  // Disclaimer
  remarks.push({
    icon: 'shield-checkmark-outline',
    text: 'These AI insights are heuristic estimates from a screening tool and do not constitute a clinical diagnosis.',
    type: 'info',
  });

  return {
    earRight,
    earLeft,
    worstGradeLabel,
    symmetry,
    symmetryNote,
    pattern,
    confidenceScore,
    confidenceGrade,
    confidenceNote,
    remarks,
  };
}
