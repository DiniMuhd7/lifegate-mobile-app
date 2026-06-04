/**
 * Clinical Standards Engine — Eye Test
 *
 * Provides reference tables, conversion functions, and clinical interpretation
 * aligned with established optometric / ophthalmological standards:
 *
 *  1. Visual Acuity   — Snellen / LogMAR / Decimal / WHO visual impairment (ICD-11)
 *  2. Color Vision    — Ishihara 38-plate protocol scoring (pass/fail + CVD type)
 *  3. Contrast        — Pelli-Robson log CS units + Bodis-Wollner norms
 *  4. Astigmatism     — Radial clock-dial / Maddox cross; axis labelling
 *  5. Near Vision     — Jaeger notation + N-notation + Snellen equivalent at 40 cm
 *
 * All functions are pure (no React, no side-effects).
 *
 * References
 * ──────────
 * • WHO (2019) ICD-11 vision impairment categories
 * • Ishihara S. (1972) Tests for Color-Blindness, Kanehara & Co.
 * • Pelli DG et al. (1988) The design of a new letter chart. Clin Vis Sci 2:187.
 * • Bailey IL & Lovie-Kitchin JE (2013) Visual acuity testing. Optom Vis Sci 90:e172.
 * • Arden GB & Jacobson JJ (1978) Simple grating test for CSF. Invest Ophthalmol 17:23.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1.  VISUAL ACUITY — Multi-notation table + WHO grading
// ═══════════════════════════════════════════════════════════════════════════════

export interface AcuityNotation {
  logMAR: number;
  /** Snellen fraction at 20 ft (US) */
  snellen20: string;
  /** Snellen fraction at 6 m (metric) */
  snellen6: string;
  /** Decimal acuity (1/Snellen denominator at 20 ft) */
  decimal: number;
  /** "Vision in metres" metric — distance at which MAR = 1' */
  visM: number;
  /** WHO visual function category (ICD-11 Chapter 9) */
  whoCategory: WHOVisualCategory;
}

export type WHOVisualCategory =
  | 'normal'              // LogMAR ≤ 0.30 (≥20/40)
  | 'near_normal'         // LogMAR 0.30–0.48
  | 'moderate_low_vision' // LogMAR 0.48–1.00 (<20/63 to 20/200)
  | 'severe_low_vision'   // LogMAR 1.00–1.30 (<20/200 to 20/400)
  | 'blindness';          // LogMAR > 1.30

/** Full multi-notation reference table (LogMAR 1.3 → −0.2) */
export const ACUITY_TABLE: AcuityNotation[] = [
  { logMAR: -0.20, snellen20: '20/13',  snellen6: '6/4',   decimal: 1.60, visM: 7.5,  whoCategory: 'normal' },
  { logMAR: -0.10, snellen20: '20/16',  snellen6: '6/5',   decimal: 1.25, visM: 6.0,  whoCategory: 'normal' },
  { logMAR:  0.00, snellen20: '20/20',  snellen6: '6/6',   decimal: 1.00, visM: 6.0,  whoCategory: 'normal' },
  { logMAR:  0.10, snellen20: '20/25',  snellen6: '6/7.5', decimal: 0.80, visM: 4.8,  whoCategory: 'normal' },
  { logMAR:  0.20, snellen20: '20/32',  snellen6: '6/9.5', decimal: 0.63, visM: 3.8,  whoCategory: 'normal' },
  { logMAR:  0.30, snellen20: '20/40',  snellen6: '6/12',  decimal: 0.50, visM: 3.0,  whoCategory: 'near_normal' },
  { logMAR:  0.40, snellen20: '20/50',  snellen6: '6/15',  decimal: 0.40, visM: 2.4,  whoCategory: 'near_normal' },
  { logMAR:  0.48, snellen20: '20/60',  snellen6: '6/18',  decimal: 0.33, visM: 2.0,  whoCategory: 'moderate_low_vision' },
  { logMAR:  0.50, snellen20: '20/63',  snellen6: '6/19',  decimal: 0.32, visM: 1.9,  whoCategory: 'moderate_low_vision' },
  { logMAR:  0.60, snellen20: '20/80',  snellen6: '6/24',  decimal: 0.25, visM: 1.5,  whoCategory: 'moderate_low_vision' },
  { logMAR:  0.70, snellen20: '20/100', snellen6: '6/30',  decimal: 0.20, visM: 1.2,  whoCategory: 'moderate_low_vision' },
  { logMAR:  0.80, snellen20: '20/125', snellen6: '6/38',  decimal: 0.16, visM: 0.95, whoCategory: 'moderate_low_vision' },
  { logMAR:  0.90, snellen20: '20/160', snellen6: '6/48',  decimal: 0.13, visM: 0.75, whoCategory: 'moderate_low_vision' },
  { logMAR:  1.00, snellen20: '20/200', snellen6: '6/60',  decimal: 0.10, visM: 0.6,  whoCategory: 'severe_low_vision' },
  { logMAR:  1.10, snellen20: '20/250', snellen6: '6/75',  decimal: 0.08, visM: 0.48, whoCategory: 'severe_low_vision' },
  { logMAR:  1.20, snellen20: '20/320', snellen6: '6/96',  decimal: 0.06, visM: 0.38, whoCategory: 'severe_low_vision' },
  { logMAR:  1.30, snellen20: '20/400', snellen6: '6/120', decimal: 0.05, visM: 0.30, whoCategory: 'blindness' },
];

/**
 * Look up the nearest row in ACUITY_TABLE for a given LogMAR value.
 */
export function lookupAcuity(logMAR: number): AcuityNotation {
  let best = ACUITY_TABLE[0];
  let minDiff = Math.abs(logMAR - best.logMAR);
  for (const row of ACUITY_TABLE) {
    const diff = Math.abs(logMAR - row.logMAR);
    if (diff < minDiff) { minDiff = diff; best = row; }
  }
  return best;
}

export type WHOVisualCategoryInfo = {
  category: WHOVisualCategory;
  label: string;
  description: string;
  color: string;
  recommendation: string;
};

export const WHO_VISUAL_CATEGORY_INFO: Record<WHOVisualCategory, WHOVisualCategoryInfo> = {
  normal: {
    category: 'normal',
    label: 'Normal Vision',
    description: 'Visual acuity is within the normal range (≥ 20/40).',
    color: '#16a34a',
    recommendation: 'Routine eye check every 1–2 years. No intervention required.',
  },
  near_normal: {
    category: 'near_normal',
    label: 'Near-Normal Vision',
    description: 'Mild reduction in acuity (20/40–20/60). May benefit from corrective lenses.',
    color: '#65a30d',
    recommendation: 'Consult an optometrist to assess the need for corrective lenses.',
  },
  moderate_low_vision: {
    category: 'moderate_low_vision',
    label: 'Moderate Low Vision',
    description: 'Significant acuity reduction (20/63–20/200). Difficulty with fine detail tasks.',
    color: '#d97706',
    recommendation: 'See an optometrist promptly. Low-vision rehabilitation may be helpful.',
  },
  severe_low_vision: {
    category: 'severe_low_vision',
    label: 'Severe Low Vision',
    description: 'Severe acuity reduction (20/200–20/400). Substantial functional impairment.',
    color: '#ea580c',
    recommendation: 'Urgent ophthalmology referral recommended.',
  },
  blindness: {
    category: 'blindness',
    label: 'Visual Impairment',
    description: 'Acuity worse than 20/400. Meets WHO blindness criteria.',
    color: '#dc2626',
    recommendation: 'Urgent ophthalmology referral required.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2.  COLOR VISION — Ishihara protocol scoring (14/24/38-plate scoring)
// ═══════════════════════════════════════════════════════════════════════════════

export type CVDType =
  | 'normal_trichromacy'
  | 'protan'           // red-weak (protanomaly) or red-blind (protanopia)
  | 'deutan'           // green-weak (deuteranomaly) or green-blind (deuteranopia)
  | 'protan_or_deutan' // cannot distinguish without further testing
  | 'insufficient_data';

export interface IshiharaScore {
  /**
   * Number of screening plates correctly identified (plates 2–9 in the
   * 10-plate subset used here; plate 1 is demo and not scored).
   */
  screeningCorrect: number;
  screeningTotal: number;
  /** Pass criterion: ≥7/8 correct on vanishing plates (WHO / Ishihara) */
  passed: boolean;
  /** CVD type inference based on error pattern */
  cvdType: CVDType;
  /** Qualitative severity (relevant when passed = false) */
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  /** 0–100 score for display convenience */
  percentScore: number;
}

/**
 * Classifies a set of Ishihara-style plate responses according to
 * the standard 38-plate scoring rules adapted for the 10-plate subset.
 *
 * Scoring rules (ISO / Ishihara):
 * • Pass: ≥7 correct out of 8 screening (vanishing) plates
 * • Fail: ≤6 correct → colour vision deficiency
 *
 * CVD type:
 * • Plates 8–9 distinguish protan vs deutan:
 *   – Protan: reads plate 11 differently from normals
 *   – Deutan: reads plate 12 differently
 *   (For our 10-plate subset we use plate IDs 2–9; plates 6 & 10 are
 *   deficient-only plates used to confirm CVD presence.)
 */
export function scoreIshihara(
  trials: Array<{ plateId: number; givenAnswer: string; isCorrect: boolean }>,
): IshiharaScore {
  // Screening plates (vanishing): IDs 2–5, 7–9
  const screeningIds = new Set([2, 3, 4, 5, 7, 8, 9]);
  const screeningTrials = trials.filter((t) => screeningIds.has(t.plateId));
  const screeningCorrect = screeningTrials.filter((t) => t.isCorrect).length;
  const screeningTotal   = screeningTrials.length;
  const passed           = screeningCorrect >= Math.ceil(screeningTotal * 0.75);

  // CVD-confirming plates (deficient-only): IDs 6, 10
  const deficientPlates = trials.filter((t) => [6, 10].includes(t.plateId));
  const answeredDeficient = deficientPlates.filter((t) => t.givenAnswer.trim() !== '').length;

  // ── Protan vs Deutan classification (plates 11–14) ────────────────────────
  // Plates 11–12 use protan confusion colours: protan reads deficientAnswer.
  // Plates 13–14 use deutan confusion colours: deutan reads deficientAnswer.
  const classTrials = trials.filter((t) => [11, 12, 13, 14].includes(t.plateId));
  let protanErrors = 0;
  let deutanErrors = 0;
  for (const t of classTrials) {
    if (!t.isCorrect && t.givenAnswer.trim() !== '') {
      if ([11, 12].includes(t.plateId)) protanErrors += 1;
      if ([13, 14].includes(t.plateId)) deutanErrors += 1;
    }
  }

  let cvdType: CVDType = 'normal_trichromacy';
  let severity: IshiharaScore['severity'] = 'none';
  const percentScore = screeningTotal > 0
    ? Math.round((screeningCorrect / screeningTotal) * 100)
    : 100;

  if (!passed) {
    // Classify CVD type using classification plates when available
    if (classTrials.length >= 2) {
      if (protanErrors > deutanErrors)      cvdType = 'protan';
      else if (deutanErrors > protanErrors) cvdType = 'deutan';
      else                                  cvdType = 'protan_or_deutan';
    } else {
      cvdType = answeredDeficient > 0 ? 'protan_or_deutan' : 'protan_or_deutan';
    }

    const errorRate = 1 - (screeningCorrect / Math.max(1, screeningTotal));
    if (errorRate <= 0.25)     severity = 'mild';
    else if (errorRate <= 0.5) severity = 'moderate';
    else                       severity = 'severe';
  }

  return { screeningCorrect, screeningTotal, passed, cvdType, severity, percentScore };
}

export type CVDTypeInfo = {
  label: string;
  description: string;
  clinicalNote: string;
  color: string;
};

export const CVD_TYPE_INFO: Record<CVDType, CVDTypeInfo> = {
  normal_trichromacy: {
    label: 'Normal Trichromacy',
    description: 'All three cone types function normally.',
    clinicalNote: 'Screening passed. No colour vision deficiency detected.',
    color: '#16a34a',
  },
  protan: {
    label: 'Protan Deficiency',
    description: 'Reduced sensitivity to long-wavelength (red) light.',
    clinicalNote: 'Protanomaly (mild) or protanopia (severe). X-linked inheritance. Cannot be corrected.',
    color: '#dc2626',
  },
  deutan: {
    label: 'Deutan Deficiency',
    description: 'Reduced sensitivity to medium-wavelength (green) light. Most common CVD.',
    clinicalNote: 'Deuteranomaly (mild) or deuteranopia (severe). X-linked inheritance.',
    color: '#d97706',
  },
  protan_or_deutan: {
    label: 'Red-Green Deficiency',
    description: 'Colour vision deficiency detected; type requires further testing to distinguish.',
    clinicalNote: 'Refer for full Ishihara 24/38-plate or anomaloscope testing to confirm protan vs deutan.',
    color: '#ea580c',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    description: 'Not enough plates completed to classify.',
    clinicalNote: 'Complete all screening plates for a valid result.',
    color: '#6b7280',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3.  CONTRAST SENSITIVITY — Pelli-Robson log CS units
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pelli-Robson chart uses log contrast sensitivity (log CS):
 *   log CS = log10(100 / threshold%)
 *
 * Normal CS at best spatial frequency is ≥ log CS 1.65 (Pelli-Robson score 2.0
 * using their 3-letter scoring).
 *
 * For our spatial-frequency staircase we compute log CS at each SF tested.
 */
export function thresholdToLogCS(thresholdPercent: number): number {
  if (thresholdPercent <= 0) return 2.0;
  return Math.round(Math.log10(100 / thresholdPercent) * 100) / 100;
}

export function logCSToThresholdPercent(logCS: number): number {
  return Math.round((100 / Math.pow(10, logCS)) * 10) / 10;
}

/**
 * Pelli-Robson equivalent scoring:
 * Each triplet of letters at a given contrast level scores 0.15 log units.
 * PR score = number of correctly-identified triplets × 0.15.
 * Max score on full chart = 2.0 (≈ 1% threshold, log CS 2.0).
 *
 * Reference norms (Pelli et al. 1988 + Rubin 1988):
 *   Score ≥ 1.65  → Normal (threshold ≤ 2.24%)
 *   Score 1.50    → Borderline
 *   Score < 1.50  → Reduced contrast sensitivity
 */
export interface PelliRobsonResult {
  peakLogCS: number;
  peakSpatialFreq: number;
  averageLogCS: number;
  pelliRobsonEquivalent: number;
  grade: 'normal' | 'borderline' | 'reduced' | 'severely_reduced';
  csAtEachSF: Array<{ sf: number; thresholdPercent: number; logCS: number }>;
  recommendation: string;
}

export function buildPelliRobsonResult(
  curve: Array<{ sf: number; threshold: number }>,
): PelliRobsonResult {
  if (curve.length === 0) {
    return {
      peakLogCS: 0, peakSpatialFreq: 0, averageLogCS: 0,
      pelliRobsonEquivalent: 0, grade: 'severely_reduced',
      csAtEachSF: [], recommendation: 'No data — repeat the contrast test.',
    };
  }

  const csAtEachSF = curve.map(({ sf, threshold }) => ({
    sf,
    thresholdPercent: threshold,
    logCS: thresholdToLogCS(threshold),
  }));

  const logCSValues = csAtEachSF.map((c) => c.logCS);
  const peakLogCS   = Math.max(...logCSValues);
  const peakSF      = csAtEachSF.find((c) => c.logCS === peakLogCS)?.sf ?? 0;
  const avgLogCS    = Math.round(
    (logCSValues.reduce((s, v) => s + v, 0) / logCSValues.length) * 100,
  ) / 100;

  // Pelli-Robson score uses the best (peak) log CS
  const prEquivalent = Math.round(peakLogCS * 100) / 100;

  let grade: PelliRobsonResult['grade'];
  let recommendation: string;

  if (prEquivalent >= 1.65) {
    grade = 'normal';
    recommendation = 'Contrast sensitivity is within normal limits. Routine review recommended.';
  } else if (prEquivalent >= 1.50) {
    grade = 'borderline';
    recommendation = 'Borderline contrast sensitivity. Retest under controlled conditions and consider optometry referral.';
  } else if (prEquivalent >= 1.00) {
    grade = 'reduced';
    recommendation = 'Reduced contrast sensitivity. Consult an optometrist — may affect night driving and reading in low light.';
  } else {
    grade = 'severely_reduced';
    recommendation = 'Severely reduced contrast sensitivity. Ophthalmology referral recommended to investigate underlying causes (cataract, glaucoma, etc.).';
  }

  return {
    peakLogCS,
    peakSpatialFreq: peakSF,
    averageLogCS: avgLogCS,
    pelliRobsonEquivalent: prEquivalent,
    grade,
    csAtEachSF,
    recommendation,
  };
}

export const PR_GRADE_COLOR: Record<PelliRobsonResult['grade'], string> = {
  normal:           '#16a34a',
  borderline:       '#d97706',
  reduced:          '#ea580c',
  severely_reduced: '#dc2626',
};

export const PR_GRADE_LABEL: Record<PelliRobsonResult['grade'], string> = {
  normal:           'Normal CS',
  borderline:       'Borderline',
  reduced:          'Reduced',
  severely_reduced: 'Severely Reduced',
};

export interface CSPercentileResult {
  percentile: number;
  ageBandLabel: string;
}

type CSNormativeBand = {
  minAge: number;
  maxAge: number;
  label: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

const CS_NORMATIVE_BANDS: CSNormativeBand[] = [
  { minAge: 18, maxAge: 39, label: '18-39', p5: 1.35, p25: 1.55, p50: 1.70, p75: 1.82, p90: 1.95 },
  { minAge: 40, maxAge: 59, label: '40-59', p5: 1.25, p25: 1.45, p50: 1.60, p75: 1.75, p90: 1.88 },
  { minAge: 60, maxAge: 79, label: '60-79', p5: 1.10, p25: 1.30, p50: 1.48, p75: 1.62, p90: 1.75 },
  { minAge: 80, maxAge: 120, label: '80+', p5: 0.95, p25: 1.15, p50: 1.32, p75: 1.48, p90: 1.62 },
];

const CS_NORMATIVE_FALLBACK: CSNormativeBand = {
  minAge: 18,
  maxAge: 120,
  label: 'Adults',
  p5: 1.20,
  p25: 1.42,
  p50: 1.58,
  p75: 1.73,
  p90: 1.86,
};

function clampPercentile(p: number): number {
  return Math.max(1, Math.min(99, Math.round(p)));
}

function lerpPercentile(value: number, a: number, b: number, pa: number, pb: number): number {
  if (Math.abs(b - a) < 0.0001) return pb;
  return pa + ((value - a) / (b - a)) * (pb - pa);
}

function estimatePercentileFromBand(logCS: number, band: CSNormativeBand): number {
  if (logCS <= band.p5) return clampPercentile(lerpPercentile(logCS, band.p5 - 0.30, band.p5, 1, 5));
  if (logCS <= band.p25) return clampPercentile(lerpPercentile(logCS, band.p5, band.p25, 5, 25));
  if (logCS <= band.p50) return clampPercentile(lerpPercentile(logCS, band.p25, band.p50, 25, 50));
  if (logCS <= band.p75) return clampPercentile(lerpPercentile(logCS, band.p50, band.p75, 50, 75));
  if (logCS <= band.p90) return clampPercentile(lerpPercentile(logCS, band.p75, band.p90, 75, 90));
  return clampPercentile(lerpPercentile(logCS, band.p90, band.p90 + 0.25, 90, 99));
}

/**
 * Estimates age-matched percentile rank for Pelli-Robson equivalent log CS.
 * Uses broad clinical age bands and piecewise interpolation.
 */
export function lookupCSPercentile(logCS: number, age?: number | null): CSPercentileResult {
  const band = (typeof age === 'number' && Number.isFinite(age))
    ? CS_NORMATIVE_BANDS.find((b) => age >= b.minAge && age <= b.maxAge) ?? CS_NORMATIVE_FALLBACK
    : CS_NORMATIVE_FALLBACK;

  return {
    percentile: estimatePercentileFromBand(logCS, band),
    ageBandLabel: band.label,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4.  ASTIGMATISM — Radial clock-dial / Maddox cross clinical interpretation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The clock-dial (Maddox) test:
 * 12 radial lines at 15° increments (0°–165°).  When astigmatism is present
 * one or more meridians look darker/thicker than the rest.
 *
 * Clinical axis reading:
 * The "darkest" meridian indicates the AXIS OF THE CYLINDER in standard
 * optometric notation (TABO; 0°–180°).
 *
 * "Rule": the axis corresponds to the darkest line on the dial (not
 * perpendicular to it — that would apply for a different chart variant).
 *
 * Astigmatism classification (simplified Donders):
 *   Axis 0° ± 20°  or 180° ± 20° → With-the-rule (WTR) — most common in young
 *   Axis 90° ± 20°               → Against-the-rule (ATR) — more common > 50 yrs
 *   Other                        → Oblique astigmatism
 */
export type AstigmatismType =
  | 'none'
  | 'with_the_rule'    // axis near 0° / 180°
  | 'against_the_rule' // axis near 90°
  | 'oblique';         // axis between 30°–60° or 120°–150°

export interface AstigmatismClinical {
  /** Detected TABO axis (0–180°), or null if none */
  axis: number | null;
  type: AstigmatismType;
  /** Simplified TABO cylinder notation, e.g. "× 75°" */
  cylinderNotation: string | null;
  severity: 'none' | 'mild' | 'moderate' | 'marked';
  label: string;
  recommendation: string;
  color: string;
}

export function classifyAstigmatismClinical(
  detectedAxis: number | null,
  severity: 'none' | 'mild' | 'moderate' | 'marked',
): AstigmatismClinical {
  if (detectedAxis === null || severity === 'none') {
    return {
      axis: null,
      type: 'none',
      cylinderNotation: null,
      severity: 'none',
      label: 'No Astigmatism',
      recommendation: 'No astigmatism detected. Routine review recommended.',
      color: '#16a34a',
    };
  }

  // Normalise axis to TABO (0–179°)
  const axis = ((detectedAxis % 180) + 180) % 180;

  let type: AstigmatismType;
  if (axis <= 20 || axis >= 160)           type = 'with_the_rule';
  else if (axis >= 70 && axis <= 110)      type = 'against_the_rule';
  else                                     type = 'oblique';

  const typeLabels: Record<AstigmatismType, string> = {
    none:             'No Astigmatism',
    with_the_rule:    'With-the-Rule',
    against_the_rule: 'Against-the-Rule',
    oblique:          'Oblique',
  };

  const sevLabel = { none: '', mild: 'Mild', moderate: 'Moderate', marked: 'Marked' }[severity];
  const sevColor = { none: '#16a34a', mild: '#65a30d', moderate: '#d97706', marked: '#dc2626' }[severity];

  const recommendation =
    severity === 'mild'
      ? 'Mild astigmatism detected. A refraction by an optometrist will determine if correction is needed.'
      : severity === 'moderate'
      ? 'Moderate astigmatism detected. Corrective lenses (cylindrical) are likely beneficial — see an optometrist.'
      : 'Marked astigmatism detected. Prompt optometry or ophthalmology referral is strongly recommended.';

  return {
    axis,
    type,
    cylinderNotation: `× ${axis}°`,
    severity,
    label: `${sevLabel} ${typeLabels[type]} Astigmatism`,
    recommendation,
    color: sevColor,
  };
}

/** Axis labels for each clock position (for display on the radial dial) */
export const CLOCK_AXIS_LABELS: Record<number, string> = {
  0:   '0°',
  15:  '15°',
  30:  '30°',
  45:  '45°',
  60:  '60°',
  75:  '75°',
  90:  '90°',
  105: '105°',
  120: '120°',
  135: '135°',
  150: '150°',
  165: '165°',
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5.  NEAR VISION — Jaeger notation + N-notation + Snellen-at-40cm equivalent
// ═══════════════════════════════════════════════════════════════════════════════

export interface NearVisionNotation {
  /** Jaeger number (J1 = finest, J20 = coarsest) */
  jaeger: string;
  /** N-notation point size (N4 = finest, N36 = coarsest) */
  nNotation: string;
  /** Approximate Snellen equivalent at 40 cm reading distance */
  snellenEquivalent: string;
  /** LogMAR equivalent at 40 cm */
  logMAR: number;
  /** Approximate reading speed descriptor */
  readingSpeed: 'fluent' | 'laboured' | 'poor' | 'unable';
  /** Clinical grading */
  grade: 'normal' | 'mild_presbyopia' | 'moderate_presbyopia' | 'severe_near_loss';
}

/**
 * Full Jaeger / N-notation equivalence table.
 * Cross-referenced: Duke-Elder (1973) and BSA optometric notes.
 * All Snellen equivalents are at standard 40 cm reading distance.
 */
export const NEAR_VISION_TABLE: NearVisionNotation[] = [
  { jaeger: 'J1',  nNotation: 'N4',  snellenEquivalent: '20/20 @ 40cm', logMAR: 0.00, readingSpeed: 'fluent',   grade: 'normal' },
  { jaeger: 'J2',  nNotation: 'N5',  snellenEquivalent: '20/25 @ 40cm', logMAR: 0.10, readingSpeed: 'fluent',   grade: 'normal' },
  { jaeger: 'J3',  nNotation: 'N6',  snellenEquivalent: '20/30 @ 40cm', logMAR: 0.18, readingSpeed: 'fluent',   grade: 'normal' },
  { jaeger: 'J5',  nNotation: 'N8',  snellenEquivalent: '20/40 @ 40cm', logMAR: 0.30, readingSpeed: 'fluent',   grade: 'mild_presbyopia' },
  { jaeger: 'J7',  nNotation: 'N10', snellenEquivalent: '20/50 @ 40cm', logMAR: 0.40, readingSpeed: 'laboured', grade: 'mild_presbyopia' },
  { jaeger: 'J10', nNotation: 'N12', snellenEquivalent: '20/63 @ 40cm', logMAR: 0.50, readingSpeed: 'laboured', grade: 'moderate_presbyopia' },
  { jaeger: 'J14', nNotation: 'N14', snellenEquivalent: '20/80 @ 40cm', logMAR: 0.60, readingSpeed: 'poor',     grade: 'moderate_presbyopia' },
  { jaeger: 'J16', nNotation: 'N18', snellenEquivalent: '20/100 @ 40cm',logMAR: 0.70, readingSpeed: 'poor',     grade: 'severe_near_loss' },
  { jaeger: 'J20', nNotation: 'N24', snellenEquivalent: '20/160 @ 40cm',logMAR: 0.90, readingSpeed: 'unable',   grade: 'severe_near_loss' },
];

export function lookupNearVision(pointSize: number): NearVisionNotation {
  // Map N-notation point size to table row
  const nToRow: Record<number, NearVisionNotation> = {
    4:  NEAR_VISION_TABLE[0],
    5:  NEAR_VISION_TABLE[1],
    6:  NEAR_VISION_TABLE[2],
    8:  NEAR_VISION_TABLE[3],
    10: NEAR_VISION_TABLE[4],
    12: NEAR_VISION_TABLE[5],
    14: NEAR_VISION_TABLE[6],
    18: NEAR_VISION_TABLE[7],
    24: NEAR_VISION_TABLE[8],
  };
  return nToRow[pointSize] ?? NEAR_VISION_TABLE[NEAR_VISION_TABLE.length - 1];
}

export const NEAR_GRADE_COLOR: Record<NearVisionNotation['grade'], string> = {
  normal:               '#16a34a',
  mild_presbyopia:      '#d97706',
  moderate_presbyopia:  '#ea580c',
  severe_near_loss:     '#dc2626',
};

export const NEAR_GRADE_LABEL: Record<NearVisionNotation['grade'], string> = {
  normal:               'Normal Near Vision',
  mild_presbyopia:      'Mild Near Loss',
  moderate_presbyopia:  'Moderate Near Loss',
  severe_near_loss:     'Severe Near Loss',
};

export const NEAR_GRADE_DESCRIPTION: Record<NearVisionNotation['grade'], string> = {
  normal:               'Near vision is within the normal range for reading and close work.',
  mild_presbyopia:      'Slight reduction in near acuity. Reading glasses may be helpful.',
  moderate_presbyopia:  'Moderate reduction. Reading glasses or progressive lenses recommended.',
  severe_near_loss:     'Significant near vision loss. Ophthalmology referral recommended.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6.  OVERALL BATTERY SUMMARY — clinical priority ranking
// ═══════════════════════════════════════════════════════════════════════════════

export type ClinicalUrgency = 'routine' | 'soon' | 'urgent';

export interface ClinicalSummary {
  urgency: ClinicalUrgency;
  headline: string;
  details: string[];
  referralRecommended: boolean;
}

export function buildClinicalSummary(params: {
  acuityLogMAR?: number;
  colorVisionPassed?: boolean;
  contrastPRScore?: number;
  astigmatismSeverity?: 'none' | 'mild' | 'moderate' | 'marked';
  nearVisionPoints?: number;
}): ClinicalSummary {
  const details: string[] = [];
  let urgency: ClinicalUrgency = 'routine';
  let referral = false;

  // Visual acuity
  if (params.acuityLogMAR !== undefined) {
    const row = lookupAcuity(params.acuityLogMAR);
    if (row.whoCategory === 'blindness' || row.whoCategory === 'severe_low_vision') {
      details.push(`Visual acuity: ${row.snellen20} — ${WHO_VISUAL_CATEGORY_INFO[row.whoCategory].label}`);
      urgency = 'urgent'; referral = true;
    } else if (row.whoCategory === 'moderate_low_vision') {
      details.push(`Visual acuity: ${row.snellen20} — Moderate low vision`);
      if (urgency === 'routine') urgency = 'soon';
      referral = true;
    } else if (row.whoCategory === 'near_normal') {
      details.push(`Visual acuity: ${row.snellen20} — Slightly below normal`);
      if (urgency === 'routine') urgency = 'soon';
    }
  }

  // Color vision
  if (params.colorVisionPassed === false) {
    details.push('Colour vision: deficiency detected (red-green)');
  }

  // Contrast
  if (params.contrastPRScore !== undefined) {
    if (params.contrastPRScore < 1.0) {
      details.push(`Contrast sensitivity: severely reduced (log CS ${params.contrastPRScore.toFixed(2)})`);
      if (urgency === 'routine') urgency = 'soon'; referral = true;
    } else if (params.contrastPRScore < 1.50) {
      details.push(`Contrast sensitivity: reduced (log CS ${params.contrastPRScore.toFixed(2)})`);
      if (urgency === 'routine') urgency = 'soon';
    }
  }

  // Astigmatism
  if (params.astigmatismSeverity === 'marked') {
    details.push('Astigmatism: marked — corrective lenses likely required');
    if (urgency === 'routine') urgency = 'soon'; referral = true;
  } else if (params.astigmatismSeverity === 'moderate') {
    details.push('Astigmatism: moderate — optometry review recommended');
    if (urgency === 'routine') urgency = 'soon';
  }

  // Near vision
  if (params.nearVisionPoints !== undefined) {
    const nv = lookupNearVision(params.nearVisionPoints);
    if (nv.grade === 'severe_near_loss') {
      details.push(`Near vision: ${nv.nNotation} — severe near loss`);
      if (urgency === 'routine') urgency = 'soon'; referral = true;
    } else if (nv.grade === 'moderate_presbyopia') {
      details.push(`Near vision: ${nv.nNotation} — reading glasses likely needed`);
    }
  }

  const headline =
    urgency === 'urgent' ? 'Findings warrant urgent eye review'
    : urgency === 'soon'  ? 'Optometry review recommended'
    : details.length === 0 ? 'All tests within normal limits'
    : 'Minor findings — routine review advised';

  return { urgency, headline, details, referralRecommended: referral };
}
