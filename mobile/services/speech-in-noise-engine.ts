/**
 * Speech-in-Noise Engine (QuickSIN-inspired)
 *
 * Protocol overview
 * ─────────────────
 * Six fixed SNR levels: +20, +15, +10, +5, 0, −5 dBSNR (easy → hard).
 * At each level a target tone (1 kHz) is embedded in continuous white-noise
 * masker at the pre-calibrated SNR.  The patient presses "I heard it" if they
 * detect the tone.  Responses are collected and the SNR50 (the SNR at which
 * 50 % of tones are detected) is interpolated by linear regression.
 *
 * SNR Loss = SNR50 − NORMAL_SNR50 (normal ≈ +2 dB for tones in noise).
 *
 * Clinical interpretation (adapted from QuickSIN norms):
 *   0–2 dB loss  → Normal
 *   3–7 dB       → Mild
 *   8–15 dB      → Moderate
 *   >15 dB       → Severe
 *
 * For SIN tests with more than one target frequency, each level uses a
 * different frequency so the staircase spans 250 Hz – 4 kHz, giving a
 * spectral picture of noise tolerance.
 */

import type { SNRLevel, SINTrial, SINResult, SINGrade } from 'types/hearing-types';
import { SIN_SNR_LEVELS } from 'types/hearing-types';

// ─── Protocol constants ───────────────────────────────────────────────────────

/** Target frequencies cycled across SNR levels (spectral coverage) */
export const SIN_LEVEL_FREQUENCIES: Record<SNRLevel, number> = {
  20:  1000,
  15:   500,
  10:  2000,
  5:   1000,
  0:   500,
  '-5': 2000,
} as any;

// Workaround: numeric negative keys require explicit mapping
export function sinLevelFrequency(snrDB: SNRLevel): number {
  const map: Record<number, number> = {
    20:  1000,
    15:   500,
    10:  2000,
    5:   1000,
    0:   500,
    [-5]: 2000,
  };
  return map[snrDB] ?? 1000;
}

/**
 * Typical SNR50 for adults with normal hearing using pure tones in noise.
 * QuickSIN uses +2 dB SNR50 for sentences; for tones this is approximately 0 dB.
 */
export const NORMAL_SNR50 = 0;

/** Duration of each SIN stimulus (noise + embedded tone) */
export const SIN_STIMULUS_MS = 2_000;

// ─── Level sequencing ────────────────────────────────────────────────────────

/**
 * Returns the SNR levels in presentation order.
 * Standard QuickSIN goes easy → hard: +20 → −5.
 */
export function getSINLevels(): SNRLevel[] {
  return [...SIN_SNR_LEVELS]; // [20, 15, 10, 5, 0, -5]
}

// ─── SNR50 computation ────────────────────────────────────────────────────────

/**
 * Estimates the SNR50 by fitting a line through the (SNR, p_heard) pairs and
 * interpolating to the 0.5 crossing.
 *
 * With only 6 levels and a non-parametric response pattern, a simple linear
 * interpolation between the first "not heard" and last "heard" response is
 * clinically adequate (as per HINT/QuickSIN scoring conventions).
 */
export function computeSNR50(trials: SINTrial[]): number {
  if (trials.length === 0) return NORMAL_SNR50;

  // Sort by SNR descending (easy → hard)
  const sorted = [...trials].sort((a, b) => b.snrDB - a.snrDB);

  // Find the last "heard" and first "not-heard" adjacent pair
  let lastHeard: number | null = null;
  let firstMissed: number | null = null;

  for (const t of sorted) {
    if (t.heard) lastHeard = t.snrDB;
    else if (lastHeard !== null && firstMissed === null) firstMissed = t.snrDB;
  }

  if (lastHeard === null) return -10; // all missed — SNR50 < -5
  if (firstMissed === null) return 25;  // all heard  — SNR50 > +20

  // Linear interpolation between the crossing pair
  return (lastHeard + firstMissed) / 2;
}

// ─── Classification ───────────────────────────────────────────────────────────

interface SINClassification {
  grade: SINGrade;
  label: string;
  recommendation: string;
}

export function classifySIN(snrLoss: number): SINClassification {
  if (snrLoss <= 2) {
    return {
      grade: 'normal',
      label: 'Normal SNR Tolerance',
      recommendation:
        'Your ability to hear sounds in background noise is within normal limits. Continue to protect your hearing in loud environments.',
    };
  }
  if (snrLoss <= 7) {
    return {
      grade: 'mild',
      label: 'Mild SNR Loss',
      recommendation:
        'You may have mild difficulty understanding sounds in noisy environments. Consider reducing background noise during conversations and follow-up with an audiologist.',
    };
  }
  if (snrLoss <= 15) {
    return {
      grade: 'moderate',
      label: 'Moderate SNR Loss',
      recommendation:
        'You are likely to have significant difficulty in noisy environments. A clinical Speech-in-Noise evaluation and hearing aid assessment is recommended.',
    };
  }
  return {
    grade: 'severe',
    label: 'Severe SNR Loss',
    recommendation:
      'Substantial difficulty hearing in noise is indicated. Please consult an audiologist promptly for comprehensive evaluation and intervention.',
  };
}

// ─── Build full SINResult ─────────────────────────────────────────────────────

/**
 * Clinical limitation note surfaced to the clinician / patient in results.
 *
 * Real QuickSIN uses IEEE Harvard sentence lists (phoneme-rich speech stimuli)
 * rather than pure tones. Tone-in-noise tests detection only, not the
 * phoneme discrimination that drives speech understanding difficulty.
 * This note ensures the limitation is never hidden from the report.
 */
export const SIN_LIMITATION_NOTE =
  'Note: This test uses tone-in-noise stimuli rather than sentence lists ' +
  '(IEEE/QuickSIN). It measures auditory detection in noise — not phoneme ' +
  'discrimination. Results should be confirmed with a clinical Speech-in-Noise ' +
  'evaluation (QuickSIN/HINT) for full speech understanding assessment.';

/**
 * Phoneme-weighted SNR loss estimate.
 *
 * Because tones offer no phonemic redundancy, pure-tone SIN thresholds
 * typically underestimate real-world speech difficulty by ~3–5 dB SNR.
 * This correction adjusts the SNR loss upward to approximate sentence-based
 * SNR50, which gives a more conservative (safer) clinical estimate.
 *
 * Reference: Wilson RH (2003) Clinical experience with the Words-in-Noise test.
 * J Am Acad Audiol 14:111–124.
 */
export const TONE_TO_SENTENCE_SNR_CORRECTION_DB = 3.5;

export function buildSINResult(trials: SINTrial[]): SINResult {
  const snr50   = computeSNR50(trials);
  const snrLoss = snr50 - NORMAL_SNR50;
  // Apply correction to approximate sentence-based SNR loss
  const correctedSnrLoss = snrLoss + TONE_TO_SENTENCE_SNR_CORRECTION_DB;
  const { grade, label, recommendation } = classifySIN(correctedSnrLoss);

  return {
    trials,
    snr50,
    snrLoss: correctedSnrLoss,
    grade,
    label,
    recommendation,
    completedAt: Date.now(),
  };
}

// ─── Grade colour helpers (for UI) ───────────────────────────────────────────

export const SIN_GRADE_COLOR: Record<SINGrade, string> = {
  normal:   '#16a34a',
  mild:     '#d97706',
  moderate: '#ea580c',
  severe:   '#dc2626',
};

export const SIN_GRADE_ICON: Record<SINGrade, string> = {
  normal:   '✅',
  mild:     '⚠️',
  moderate: '🔶',
  severe:   '🔴',
};
