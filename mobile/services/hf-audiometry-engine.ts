/**
 * High-Frequency Audiometry Engine (9–12 kHz)
 *
 * Extended-range testing beyond the standard PTA sweep (8 kHz).
 * Most consumer in-ear and over-ear headphones reproduce up to 12–16 kHz,
 * making 9, 10, and 12 kHz clinically accessible without specialised equipment.
 *
 * Clinical rationale
 * ──────────────────
 * Noise-induced hearing loss (NIHL) and ototoxicity typically begin at
 * the 3–6 kHz octave notch and then propagate into the extended high-
 * frequency range before the conventional PTA thresh­olds (≤8 kHz) are
 * affected.  Testing at 9–12 kHz provides an early-warning indicator.
 *
 * Staircase method
 * ────────────────
 * Same Hughson-Westlake down-10/up-5 protocol as the standard PTA but
 * starting at 60 dBHL (HF thresholds are typically higher for normal ears)
 * with 3 ascending reversals needed.
 */

import type { HFFrequency, HFStaircase, HFResult, HFPattern, FrequencyThreshold } from 'types/hearing-types';
import { HF_FREQUENCIES } from 'types/hearing-types';
import { DBHL_MIN, DBHL_MAX, DBHL_STEP_UP, DBHL_STEP_DN } from 'services/audio-calibration-engine';

// ─── ISO 7779 / ISO 226 reference for extended HF (approximate values) ────────
// These are approximate RETSPL values for supra-aural earphones in the
// 9–12 kHz range (ISO 389-5 Table 1 and published reference data).
// Consumer device accuracy degrades at these frequencies; values used
// conservatively to avoid under-estimating presentation levels.

export const HF_RETSPL: Record<HFFrequency, number> = {
  9000:  22.0,
  10000: 17.5,
  12000: 22.5,
};

// ─── Starting level ───────────────────────────────────────────────────────────
// Normal HF sensitivity is 20–40 dBHL for 9–12 kHz.
// Start at 60 dBHL so the first descending run quickly finds the threshold.
export const HF_START_DBHL = 60;
const HF_ASCENDING_REVERSALS_NEEDED = 3;

// ─── Staircase management ────────────────────────────────────────────────────

export function initHFStaircase(
  frequency: HFFrequency,
  priorThreshold?: number,
): HFStaircase {
  const startDbHL = priorThreshold !== undefined
    ? Math.max(DBHL_MIN, Math.min(DBHL_MAX, Math.round(priorThreshold) + 10))
    : HF_START_DBHL;

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

export function stepHFStaircase(
  s: HFStaircase,
  heard: boolean,
  reactionMs: number = 0,
): HFStaircase {
  if (s.done) return s;

  const newTrial = { dbHL: s.currentDbHL, heard, reactionMs };
  const newTrials = [...s.trials, newTrial];

  const newDirection = heard ? 'down' : 'up' as const;
  const hasPrior = s.trials.length > 0;
  const isReversal = hasPrior && newDirection !== s.direction;

  const newReversals = isReversal
    ? [...s.reversals, s.currentDbHL]
    : [...s.reversals];

  // Ascending reversals: odd indices in the reversals array
  const ascCount = newReversals.filter((_, i) => i % 2 === 1).length;

  let nextDbHL = heard
    ? s.currentDbHL - DBHL_STEP_DN
    : s.currentDbHL + DBHL_STEP_UP;
  nextDbHL = Math.max(DBHL_MIN, Math.min(DBHL_MAX, nextDbHL));

  const isDone = ascCount >= HF_ASCENDING_REVERSALS_NEEDED && !isReversal;

  let threshold: number | null = null;
  if (isDone) {
    const ascLevels = newReversals.filter((_, i) => i % 2 === 1);
    threshold = Math.round(
      ascLevels.reduce((acc, v) => acc + v, 0) / ascLevels.length,
    );
  }

  return {
    ...s,
    currentDbHL: nextDbHL,
    direction: newDirection,
    trials: newTrials,
    reversals: newReversals,
    done: isDone,
    threshold,
  };
}

export function estimateHFThreshold(s: HFStaircase): number {
  if (s.done && s.threshold !== null) return s.threshold;
  const ascLevels = s.reversals.filter((_, i) => i % 2 === 1);
  if (ascLevels.length > 0) {
    return Math.round(ascLevels.reduce((a, v) => a + v, 0) / ascLevels.length);
  }
  return s.reversals.length > 0 ? Math.round(s.reversals[0]) : s.currentDbHL;
}

// ─── Amplitude for uncalibrated HF frequencies ───────────────────────────────
// Because ISO 389 RETSPL values for HF are approximate and device reproduction
// varies significantly, we use a simple dBSPL model for amplitude:
//   target_dBSPL = dbHL + HF_RETSPL[freq]
//   amplitude    = 10^((target_dBSPL - deviceMaxDbSPL) / 20)

import { DEFAULT_DEVICE_MAX_DBSPL } from 'services/audio-calibration-engine';

export function hfDbHLToAmplitude(
  dbHL: number,
  freq: HFFrequency,
  deviceMaxDbSPL: number = DEFAULT_DEVICE_MAX_DBSPL,
): number {
  const retspl = HF_RETSPL[freq];
  const targetDbSPL = dbHL + retspl;
  const dBFS = targetDbSPL - deviceMaxDbSPL;
  const amplitude = Math.pow(10, dBFS / 20);
  return Math.max(0, Math.min(1, amplitude));
}

// ─── Pattern detection ────────────────────────────────────────────────────────

/**
 * Classifies the HF threshold pattern.
 *
 * @param hfThresholds   Thresholds at 9, 10, 12 kHz
 * @param ptaThreshold4k Optional 4 kHz threshold from standard PTA (for NIHL detection)
 */
export function classifyHFPattern(
  hfThresholds: HFResult['thresholds'],
  ptaThreshold4k?: number,
): { pattern: HFPattern; nihlRiskFlag: boolean } {
  if (hfThresholds.length === 0) return { pattern: 'normal', nihlRiskFlag: false };

  const levels = hfThresholds.map((t) => t.dbHL);
  const avg = levels.reduce((s, v) => s + v, 0) / levels.length;

  // Check for progressive worsening (NIHL signature: 9 < 10 < 12 kHz thresholds)
  const sorted = [...hfThresholds].sort((a, b) => a.frequency - b.frequency);
  const isProgressive = sorted.length >= 2 &&
    sorted.every((t, i) => i === 0 || t.dbHL >= sorted[i - 1].dbHL - 5);

  // NIHL risk: 4 kHz notch + progressive HF elevation
  const nihlRiskFlag = (ptaThreshold4k !== undefined && ptaThreshold4k >= 30) &&
    avg > 30 && isProgressive;

  let pattern: HFPattern;
  if (avg <= 25) {
    pattern = 'normal';
  } else if (avg <= 40) {
    pattern = nihlRiskFlag ? 'early_nihl' : 'mild_hf_loss';
  } else {
    pattern = isProgressive ? 'early_nihl' : 'significant_hf_loss';
  }

  return { pattern, nihlRiskFlag };
}

export function buildHFResult(
  staircases: Record<HFFrequency, HFStaircase>,
  ptaThreshold4k?: number,
): HFResult {
  const thresholds = HF_FREQUENCIES.map((f) => ({
    frequency: f,
    dbHL: estimateHFThreshold(staircases[f]),
    trialCount: staircases[f].trials.length,
  }));

  const levels = thresholds.map((t) => t.dbHL);
  const hfAverage = Math.round(levels.reduce((s, v) => s + v, 0) / levels.length);

  const { pattern, nihlRiskFlag } = classifyHFPattern(thresholds, ptaThreshold4k);

  return { thresholds, hfAverage, pattern, nihlRiskFlag, completedAt: Date.now() };
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

export const HF_PATTERN_LABEL: Record<HFPattern, string> = {
  normal:               'Normal HF Hearing',
  mild_hf_loss:         'Mild HF Elevation',
  significant_hf_loss:  'Significant HF Loss',
  early_nihl:           'Early NIHL Pattern',
};

export const HF_PATTERN_COLOR: Record<HFPattern, string> = {
  normal:               '#16a34a',
  mild_hf_loss:         '#d97706',
  significant_hf_loss:  '#ea580c',
  early_nihl:           '#dc2626',
};

export const HF_PATTERN_ICON: Record<HFPattern, string> = {
  normal:               '✅',
  mild_hf_loss:         '📉',
  significant_hf_loss:  '🔶',
  early_nihl:           '⚠️',
};
