/**
 * PTA Engine — Pure Tone Audiometry Algorithms
 *
 * Pure functions implementing:
 *   - Modified Hughson-Westlake staircase (clinical standard)
 *   - Threshold estimation from reversal points
 *   - Pure Tone Average (PTA) computation (500, 1000, 2000 Hz)
 *   - WHO hearing loss grade classification (2021 guidelines)
 *   - Audiogram shape detection
 *
 * No React, no side effects.
 */

import type {
  PTAFrequency,
  PTATrial,
  PTAStaircase,
  StaircaseDirection,
  FrequencyThreshold,
  WHOGrade,
  HearingLossCategory,
  WHOClassification,
  AudiogramShape,
} from 'types/hearing-types';
import { DBHL_MIN, DBHL_MAX, DBHL_STEP_UP, DBHL_STEP_DN } from 'services/audio-calibration-engine';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Initial test level (dBHL) used when no prior estimate is available. */
export const START_DBHL = 40;

/**
 * Number of ASCENDING reversals required to estimate the threshold.
 *
 * An ascending reversal is the level at which the subject transitions from
 * "not heard" to "heard" (direction flips from up → down).  These are the
 * clinically meaningful events in the modified Hughson-Westlake method.
 *
 * BSA / ASHA guidelines recommend 3 ascending reversals for automated PTA.
 */
const ASCENDING_REVERSALS_NEEDED = 3;

// ─── Staircase initialisation ─────────────────────────────────────────────────

/**
 * Initialise a baseline staircase starting at START_DBHL (40 dBHL).
 * Every frequency begins here on the first ear.
 */
export function initPTAStaircase(frequency: PTAFrequency): PTAStaircase {
  return {
    frequency,
    currentDbHL: START_DBHL,
    direction: 'down',
    trials: [],
    reversals: [],
    done: false,
    threshold: null,
  };
}

/**
 * Initialise an ADAPTIVE staircase.  If a prior threshold estimate is
 * provided (e.g. from the previous frequency or opposite ear), the staircase
 * starts 10 dB above that value rather than always at 40 dBHL.  This
 * shortens test duration by 20-40% in practice.
 *
 * @param frequency        PTA frequency to test
 * @param priorThreshold   Best guess for this ear (e.g. adjacent-freq threshold)
 */
export function initAdaptivePTAStaircase(
  frequency: PTAFrequency,
  priorThreshold?: number,
): PTAStaircase {
  // Add +10 dB headroom so the first descending run finds the threshold
  const startDbHL = priorThreshold !== undefined
    ? Math.max(DBHL_MIN, Math.min(DBHL_MAX, Math.round(priorThreshold) + 10))
    : START_DBHL;

  return {
    frequency,
    currentDbHL: startDbHL,
    direction: 'down',
    trials: [],
    reversals: [],
    done: false,
    threshold: null,
  };
}

// ─── Step the staircase ───────────────────────────────────────────────────────

/**
 * Applies the modified Hughson-Westlake rule with ascending-reversal criterion:
 *
 *   • Heard       → step DOWN 10 dB
 *   • Not heard   → step UP   5 dB
 *
 * Reversal classification:
 *   • Ascending reversal: direction flips up → down (patient just said "heard")
 *     — the clinically relevant event; counted toward the done criterion
 *   • Descending reversal: direction flips down → up (patient just said "not heard")
 *     — recorded but not counted toward completion
 *
 * Done criterion: ASCENDING_REVERSALS_NEEDED (3) ascending reversals accumulated.
 * Threshold       = arithmetic mean of all ascending reversal levels.
 */
export function stepPTAStaircase(
  s: PTAStaircase,
  heard: boolean,
  reactionMs: number = 0,
): PTAStaircase {
  if (s.done) return s;

  const newTrial: PTATrial = {
    frequency: s.frequency,
    dbHL: s.currentDbHL,
    heard,
    reactionMs,
  };

  const newTrials = [...s.trials, newTrial];

  const newDirection: StaircaseDirection = heard ? 'down' : 'up';
  const hasPriorTrial = s.trials.length > 0;

  // A reversal happens when the direction changes between the previous trial
  // and this one.  An ASCENDING reversal is when the direction changes from
  // 'up' (was not heard) to 'down' (now heard) — the subject just heard the tone
  // after a run of misses.
  const isReversal         = hasPriorTrial && newDirection !== s.direction;
  const isAscendingReversal = isReversal && heard; // up→down flip on a "heard"

  const newReversals = isReversal
    ? [...s.reversals, s.currentDbHL]
    : [...s.reversals];

  // Recompute ascending reversal count from the full array.
  // Starting direction is always 'down', so:
  //   reversal[0] = descending (first miss),  reversal[1] = ascending (first hit),
  //   reversal[2] = descending, reversal[3] = ascending, …
  // Ascending reversals are at odd indices.
  const ascendingCount = newReversals.filter((_, i) => i % 2 === 1).length;

  // Compute next dBHL
  let nextDbHL = heard
    ? s.currentDbHL - DBHL_STEP_DN
    : s.currentDbHL + DBHL_STEP_UP;
  nextDbHL = Math.max(DBHL_MIN, Math.min(DBHL_MAX, nextDbHL));

  // Mark done only after the required ascending reversals AND the current
  // trial is NOT itself the reversal (give one more step to confirm).
  const isDone = ascendingCount >= ASCENDING_REVERSALS_NEEDED && !isReversal;

  let threshold: number | null = null;
  if (isDone) {
    // Extract ascending reversal levels (odd indices)
    const ascLevels = newReversals.filter((_, i) => i % 2 === 1);
    threshold = Math.round(
      ascLevels.reduce((acc, v) => acc + v, 0) / ascLevels.length,
    );
  }

  return {
    ...s,
    currentDbHL: nextDbHL,
    direction: newDirection,
    trials:    newTrials,
    reversals: newReversals,
    done:      isDone,
    threshold,
  };
}

// ─── Threshold estimation ─────────────────────────────────────────────────────

/**
 * Estimates the hearing threshold from a staircase that may or may not be
 * fully converged.  Consistent with stepPTAStaircase: uses ascending reversal
 * levels (odd-indexed) when available.
 */
export function estimateThreshold(s: PTAStaircase): number {
  if (s.done && s.threshold !== null) return s.threshold;

  // Use ascending reversal levels if we have at least one
  const ascLevels = s.reversals.filter((_, i) => i % 2 === 1);
  if (ascLevels.length > 0) {
    return Math.round(
      ascLevels.reduce((acc, v) => acc + v, 0) / ascLevels.length,
    );
  }

  // Fall back to descending reversal level if we have one (first miss)
  if (s.reversals.length > 0) return Math.round(s.reversals[0]);

  // No reversals yet — current level is best estimate
  return s.currentDbHL;
}

// ─── Pure Tone Average ────────────────────────────────────────────────────────

/**
 * Computes the WHO-recommended Pure Tone Average (PTA).
 * Uses 500 Hz, 1000 Hz, and 2000 Hz thresholds (Fletcher average).
 * If 4000 Hz is available, also returns the 4-frequency average.
 */
export interface PTAResult {
  /** 3-frequency average (500, 1000, 2000 Hz) — primary WHO metric */
  pta3: number;
  /** 4-frequency average (500, 1000, 2000, 4000 Hz) */
  pta4: number | null;
}

export function computePTA(thresholds: FrequencyThreshold[]): PTAResult {
  const get = (f: PTAFrequency): number | undefined =>
    thresholds.find((t) => t.frequency === f)?.dbHL;

  const t500  = get(500);
  const t1000 = get(1000);
  const t2000 = get(2000);
  const t4000 = get(4000);

  const pta3Freqs = [t500, t1000, t2000].filter((v): v is number => v !== undefined);
  const pta3 = pta3Freqs.length === 3
    ? Math.round(pta3Freqs.reduce((s, v) => s + v, 0) / 3)
    : Math.round(pta3Freqs.reduce((s, v) => s + v, 0) / Math.max(1, pta3Freqs.length));

  let pta4: number | null = null;
  if (t500 !== undefined && t1000 !== undefined && t2000 !== undefined && t4000 !== undefined) {
    pta4 = Math.round((t500 + t1000 + t2000 + t4000) / 4);
  }

  return { pta3, pta4 };
}

// ─── WHO hearing loss classification ─────────────────────────────────────────

const WHO_GRADES: Array<{
  grade: WHOGrade;
  category: HearingLossCategory;
  minDbHL: number;
  maxDbHL: number;
  label: string;
  description: string;
  recommendation: string;
}> = [
  {
    grade: 0,
    category: 'normal',
    minDbHL: DBHL_MIN,
    maxDbHL: 25,
    label: 'Normal Hearing',
    description: 'No or very slight hearing difficulty in quiet conditions.',
    recommendation: 'No action required. Consider annual screening if exposed to loud environments.',
  },
  {
    grade: 1,
    category: 'slight',
    minDbHL: 26,
    maxDbHL: 40,
    label: 'Slight Hearing Loss',
    description: 'Difficulty hearing faint speech or in noisy environments.',
    recommendation: 'Consult an audiologist. Communication strategies may be helpful.',
  },
  {
    grade: 2,
    category: 'moderate',
    minDbHL: 41,
    maxDbHL: 60,
    label: 'Moderate Hearing Loss',
    description: 'Difficulty understanding normal speech, especially in background noise.',
    recommendation: 'Hearing aids are often beneficial. Audiological evaluation recommended.',
  },
  {
    grade: 3,
    category: 'moderately_severe',
    minDbHL: 61,
    maxDbHL: 80,
    label: 'Moderately Severe Hearing Loss',
    description: 'Cannot understand speech at normal conversational levels without amplification.',
    recommendation: 'Hearing aids or other assistive listening devices are strongly recommended.',
  },
  {
    grade: 4,
    category: 'severe',
    minDbHL: 81,
    maxDbHL: 200,
    label: 'Severe / Profound Hearing Loss',
    description: 'Cannot understand amplified speech, relying mainly on vision for communication.',
    recommendation: 'Immediate audiological and medical evaluation required. Cochlear implant candidacy should be assessed.',
  },
];

export function classifyWHO(pta3: number): WHOClassification {
  const entry = WHO_GRADES.find((g) => pta3 >= g.minDbHL && pta3 <= g.maxDbHL)
    ?? WHO_GRADES[WHO_GRADES.length - 1];

  return {
    grade: entry.grade,
    category: entry.category,
    pureTonaAverage: pta3,
    label: entry.label,
    description: entry.description,
    recommendation: entry.recommendation,
  };
}

// ─── Audiogram shape detection ────────────────────────────────────────────────

export function detectAudiogramShape(thresholds: FrequencyThreshold[]): AudiogramShape {
  if (thresholds.length < 3) return 'irregular';

  const get = (f: PTAFrequency): number | null =>
    thresholds.find((t) => t.frequency === f)?.dbHL ?? null;

  const t250  = get(250);
  const t500  = get(500);
  const t1000 = get(1000);
  const t2000 = get(2000);
  const t4000 = get(4000);
  const t8000 = get(8000);

  const all = [t250, t500, t1000, t2000, t4000, t8000].filter((v): v is number => v !== null);
  if (all.length === 0) return 'irregular';

  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min;

  // Normal: all thresholds ≤ 25 dBHL
  if (max <= 25) return 'normal';

  // Flat: variation ≤ 15 dB across all frequencies
  if (range <= 15) return 'flat';

  // Notch: isolated dip at 4 kHz (noise-induced pattern)
  if (t4000 !== null && t2000 !== null && t8000 !== null) {
    if (t4000 > t2000 + 15 && t4000 > t8000 + 10) return 'notch';
  }

  // Cookie-bite: mid frequencies worst
  if (t1000 !== null && t2000 !== null && t500 !== null && t4000 !== null) {
    const midAvg = (t1000 + t2000) / 2;
    const outerAvg = (t500 + t4000) / 2;
    if (midAvg > outerAvg + 15) return 'cookie_bite';
  }

  // Sloping: high frequencies progressively worse (high-frequency SNHL)
  const lowFreqs = [t250, t500].filter((v): v is number => v !== null);
  const highFreqs = [t4000, t8000].filter((v): v is number => v !== null);
  if (lowFreqs.length > 0 && highFreqs.length > 0) {
    const lowAvg = lowFreqs.reduce((s, v) => s + v, 0) / lowFreqs.length;
    const highAvg = highFreqs.reduce((s, v) => s + v, 0) / highFreqs.length;
    if (highAvg > lowAvg + 20) return 'sloping';
    if (lowAvg > highAvg + 20) return 'rising';
  }

  return 'irregular';
}

// ─── Shape labels / descriptions ──────────────────────────────────────────────

export const AUDIOGRAM_SHAPE_LABELS: Record<AudiogramShape, string> = {
  normal:      'Normal',
  flat:        'Flat',
  sloping:     'Sloping (high-frequency loss)',
  rising:      'Rising (low-frequency loss)',
  notch:       '4 kHz Notch (noise-induced pattern)',
  cookie_bite: 'Cookie-bite (mid-frequency)',
  irregular:   'Irregular',
};

export const AUDIOGRAM_SHAPE_ICON: Record<AudiogramShape, string> = {
  normal:      'checkmark-circle-outline',
  flat:        'remove-outline',
  sloping:     'trending-down-outline',
  rising:      'trending-up-outline',
  notch:       'caret-down-outline',
  cookie_bite: 'ellipse-outline',
  irregular:   'help-circle-outline',
};
