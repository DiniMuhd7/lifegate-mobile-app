/**
 * Behavioral Signal Capture & Reliability Scoring
 *
 * Analyses PTA staircase trial data to extract three classes of behavioural
 * quality signals:
 *
 * 1. Reaction-time consistency
 *    • Mean and CV (σ / μ) of "heard" response times across all frequencies.
 *    • A well-engaged subject produces a tight RT distribution (CV < 0.3).
 *    • CV > 0.5 → inconsistent; CV > 0.8 → erratic.
 *
 * 2. Spuriously fast responses (false-positive proxy)
 *    • Any "heard" response with RT < SPURIOUSLY_FAST_MS (150 ms) is below
 *      the minimum physiological auditory detection threshold (~150–200 ms
 *      from tone onset to motor response).  Such responses almost certainly
 *      preceded full stimulus evaluation and are a proxy for inattentive
 *      button-pressing.
 *    • NOTE: True false-positive detection requires silent catch trials.
 *      This metric is explicitly labelled "spuriously fast" to avoid
 *      overclaiming clinical sensitivity.
 *
 * 3. Suprathreshold misses
 *    • Any "not heard" trial presented at ≥ SUPRATHRESHOLD_MARGIN_DB dBHL
 *      above the estimated threshold.  At these levels the tone was almost
 *      certainly audible; a "miss" signals fatigue, inattention, or task
 *      misunderstanding.
 *
 * 4. Staircase convergence quality
 *    • Number of ascending reversals (≥3 = fully converged) and the spread
 *      (max − min) of those reversal levels.
 *    • Tight reversals (spread ≤ 10 dB) → high confidence threshold estimate.
 *
 * Reliability score (0–100) aggregates all of the above:
 *   Score = 100
 *     − convergence penalty    (up to 30 pts)
 *     − spread penalty         (up to 20 pts)
 *     − spurious-speed penalty (up to 20 pts)
 *     − miss-rate penalty      (up to 20 pts)
 *     − RT-CV penalty          (up to 15 pts)
 *   Clamped to [0, 100].
 *
 * Reliability grade:
 *   85–100 → Excellent
 *   70–84  → Good
 *   50–69  → Fair
 *     0–49  → Poor
 */

import type {
  PTAFrequency,
  PTAStaircase,
  FrequencyReliability,
  BehavioralFlag,
  BehavioralFlagType,
  BehavioralReport,
  ReliabilityGrade,
} from 'types/hearing-types';
import { PTA_FREQUENCIES } from 'types/hearing-types';
import { estimateThreshold } from 'services/pta-engine';

// ─── Thresholds & constants ───────────────────────────────────────────────────

/**
 * Minimum physiologically plausible voluntary RT for an auditory detection task.
 * Responses faster than this cannot have been triggered by conscious perception
 * of the tone.  (Auditory simple RT floor ≈ 150 ms; Galambos & Makeig, 1992.)
 */
export const SPURIOUSLY_FAST_MS = 150;

/**
 * A "suprathreshold miss" is defined as a "not heard" response at a level
 * at least this many dBHL above the estimated threshold.  At these levels
 * the tone is almost certainly within the subject's audible range.
 */
export const SUPRATHRESHOLD_MARGIN_DB = 20;

// ─── Per-frequency analysis ───────────────────────────────────────────────────

/**
 * Extracts behavioural metrics from a single completed (or partial) staircase.
 *
 * @param staircase  PTAStaircase for one frequency
 * @returns          FrequencyReliability metrics
 */
export function analyseFrequency(staircase: PTAStaircase): FrequencyReliability {
  const threshold = estimateThreshold(staircase);
  const trials    = staircase.trials;

  // ── Ascending reversal stats ──────────────────────────────────────────────
  const ascLevels          = staircase.reversals.filter((_, i) => i % 2 === 1);
  const ascendingReversalCount = ascLevels.length;

  let spreadDB = 0;
  if (ascLevels.length >= 2) {
    spreadDB = Math.max(...ascLevels) - Math.min(...ascLevels);
  }

  const confidence = ascendingReversalCount >= 3 && spreadDB <= 10
    ? 'high'
    : ascendingReversalCount >= 2 && spreadDB <= 20
    ? 'medium'
    : 'low';

  // ── Reaction time stats ───────────────────────────────────────────────────
  // Only include "heard" trials with a plausible RT range [SPURIOUSLY_FAST_MS, 5000 ms]
  const heardTrials = trials.filter((t) => t.heard);

  let spuriouslyFastCount = 0;
  const validRTs: number[] = [];

  for (const t of heardTrials) {
    if (t.reactionMs < SPURIOUSLY_FAST_MS) {
      spuriouslyFastCount++;
    } else if (t.reactionMs <= 5_000) {
      validRTs.push(t.reactionMs);
    }
  }

  const meanReactionMs = validRTs.length > 0
    ? Math.round(validRTs.reduce((s, v) => s + v, 0) / validRTs.length)
    : 0;

  // ── Suprathreshold misses ─────────────────────────────────────────────────
  const suprathresholdMissCount = trials.filter(
    (t) => !t.heard && t.dbHL >= threshold + SUPRATHRESHOLD_MARGIN_DB,
  ).length;

  return {
    frequency: staircase.frequency,
    threshold,
    ascendingReversalCount,
    spreadDB,
    confidence,
    spuriouslyFastCount,
    suprathresholdMissCount,
    meanReactionMs,
    trialCount: trials.length,
  };
}

// ─── Aggregate report ─────────────────────────────────────────────────────────

/**
 * Builds a full BehavioralReport from a complete set of PTA staircases
 * (one ear's worth: 6 frequencies).
 *
 * @param staircases  Record<PTAFrequency, PTAStaircase>
 * @returns           BehavioralReport with score, grade, and flags
 */
export function buildBehavioralReport(
  staircases: Record<PTAFrequency, PTAStaircase>,
): BehavioralReport {
  // ── Per-frequency metrics ────────────────────────────────────────────────
  const frequencyMetrics: FrequencyReliability[] = PTA_FREQUENCIES.map((f) =>
    analyseFrequency(staircases[f]),
  );

  // ── Global RT stats ───────────────────────────────────────────────────────
  const allValidRTs: number[] = [];
  let totalHeard       = 0;
  let totalSpurious    = 0;
  let totalSupraTrials = 0;  // "not heard" trials presented suprathreshold
  let totalSupraMisses = 0;

  for (const fm of frequencyMetrics) {
    const s = staircases[fm.frequency];
    for (const t of s.trials) {
      if (t.heard) {
        totalHeard++;
        if (t.reactionMs < SPURIOUSLY_FAST_MS) {
          totalSpurious++;
        } else if (t.reactionMs <= 5_000) {
          allValidRTs.push(t.reactionMs);
        }
      } else if (t.dbHL >= fm.threshold + SUPRATHRESHOLD_MARGIN_DB) {
        totalSupraTrials++;
        totalSupraMisses++;
      }
    }
  }

  // Hint: totalSupraTrials === totalSupraMisses by definition above
  const spuriousFastRate       = totalHeard > 0   ? totalSpurious    / totalHeard      : 0;
  const suprathresholdMissRate = totalSupraTrials > 0
    ? totalSupraMisses / (totalSupraTrials + frequencyMetrics.reduce((s, fm) =>
        s + staircases[fm.frequency].trials.filter(
          (t) => !t.heard && fm.threshold && t.dbHL >= fm.threshold + SUPRATHRESHOLD_MARGIN_DB,
        ).length, 0))
    : 0;

  // More accurate miss-rate denominator: ALL "not heard" trials above suprathreshold
  const allNotHeardSuprathreshold = frequencyMetrics.reduce((sum, fm) => {
    const s = staircases[fm.frequency];
    return sum + s.trials.filter(
      (t) => !t.heard && t.dbHL >= fm.threshold + SUPRATHRESHOLD_MARGIN_DB,
    ).length;
  }, 0);

  const allNotHeardTotal = frequencyMetrics.reduce((sum, fm) =>
    sum + staircases[fm.frequency].trials.filter((t) => !t.heard).length, 0);

  const suprathresholdMissRateFinal =
    allNotHeardTotal > 0
      ? allNotHeardSuprathreshold / allNotHeardTotal
      : 0;

  // RT mean and CV
  const globalMeanReactionMs = allValidRTs.length > 0
    ? Math.round(allValidRTs.reduce((s, v) => s + v, 0) / allValidRTs.length)
    : 0;

  let globalReactionCV = 0;
  if (allValidRTs.length >= 3) {
    const mean = globalMeanReactionMs;
    const variance = allValidRTs.reduce((s, v) => s + (v - mean) ** 2, 0) / allValidRTs.length;
    const stdev    = Math.sqrt(variance);
    globalReactionCV = mean > 0 ? Math.round((stdev / mean) * 100) / 100 : 0;
  }

  // ── Reliability score ─────────────────────────────────────────────────────
  let score = 100;
  const flags: BehavioralFlag[] = [];

  // 1. Staircase convergence penalty (up to −30)
  const incompleteFreqs = frequencyMetrics.filter((fm) => fm.ascendingReversalCount < 3);
  if (incompleteFreqs.length > 0) {
    const penalty = Math.min(30, incompleteFreqs.length * 5);
    score -= penalty;
    flags.push({
      type: 'poor_staircase_convergence',
      description: `${incompleteFreqs.length} frequenc${incompleteFreqs.length === 1 ? 'y' : 'ies'} did not fully converge (< 3 ascending reversals). Threshold estimates may be less precise.`,
      severity: 'warning',
    });
  }

  // 2. Reversal spread penalty (up to −20)
  const looseFreqs = frequencyMetrics.filter((fm) => fm.spreadDB > 20);
  if (looseFreqs.length > 0) {
    const penalty = Math.min(20, looseFreqs.length * 5);
    score -= penalty;
    if (looseFreqs.length >= 2) {
      flags.push({
        type: 'poor_staircase_convergence',
        description: `High reversal spread (>${20} dB) at ${looseFreqs.length} frequenc${looseFreqs.length === 1 ? 'y' : 'ies'}, suggesting variable responding near threshold.`,
        severity: 'info',
      });
    }
  }

  // 3. Spuriously fast responses (up to −20)
  if (spuriousFastRate > 0.15) {
    score -= 20;
    flags.push({
      type: 'spuriously_fast_responses',
      description: `${Math.round(spuriousFastRate * 100)}% of "heard" responses occurred in < ${SPURIOUSLY_FAST_MS} ms — below the physiological auditory RT minimum. Some responses may not reflect genuine tone detection.`,
      severity: 'warning',
    });
  } else if (spuriousFastRate > 0.05) {
    score -= 10;
    flags.push({
      type: 'spuriously_fast_responses',
      description: `${Math.round(spuriousFastRate * 100)}% of "heard" responses were unusually fast (< ${SPURIOUSLY_FAST_MS} ms). Consider retesting in a distraction-free environment.`,
      severity: 'info',
    });
  }

  // 4. Suprathreshold misses (up to −20)
  if (suprathresholdMissRateFinal > 0.15) {
    score -= 20;
    flags.push({
      type: 'suprathreshold_misses',
      description: `${Math.round(suprathresholdMissRateFinal * 100)}% of tones well above the estimated threshold were not detected. This may indicate inattention or fatigue during the test.`,
      severity: 'warning',
    });
  } else if (suprathresholdMissRateFinal > 0.07) {
    score -= 10;
    flags.push({
      type: 'suprathreshold_misses',
      description: `Some tones clearly above threshold were missed. Ensure a quiet environment and full attention during the test.`,
      severity: 'info',
    });
  }

  // 5. RT consistency penalty (up to −15)
  if (globalReactionCV > 0.8) {
    score -= 15;
    flags.push({
      type: 'inconsistent_reaction_times',
      description: `Reaction times were highly variable (CV = ${globalReactionCV.toFixed(2)}). Consistent responding is important for reliable threshold estimation.`,
      severity: 'warning',
    });
  } else if (globalReactionCV > 0.5) {
    score -= 7;
    flags.push({
      type: 'inconsistent_reaction_times',
      description: `Reaction times were moderately variable (CV = ${globalReactionCV.toFixed(2)}). Try to press the button promptly and consistently when you hear the tone.`,
      severity: 'info',
    });
  }

  // 6. Slow responses (informational only)
  if (globalMeanReactionMs > 2_500 && allValidRTs.length >= 5) {
    flags.push({
      type: 'slow_responses',
      description: `Average response time was ${(globalMeanReactionMs / 1000).toFixed(1)} s. Slow responding can occur with hearing loss or inattention — not necessarily a reliability concern.`,
      severity: 'info',
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const reliabilityGrade: ReliabilityGrade =
    score >= 85 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'fair' :
    'poor';

  return {
    frequencyMetrics,
    spuriousFastRate: Math.round(spuriousFastRate   * 1000) / 1000,
    suprathresholdMissRate: Math.round(suprathresholdMissRateFinal * 1000) / 1000,
    globalMeanReactionMs,
    globalReactionCV,
    reliabilityScore: score,
    reliabilityGrade,
    flags,
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export const RELIABILITY_GRADE_COLOR: Record<ReliabilityGrade, string> = {
  excellent: '#16a34a',
  good:      '#65a30d',
  fair:      '#d97706',
  poor:      '#dc2626',
};

export const RELIABILITY_GRADE_LABEL: Record<ReliabilityGrade, string> = {
  excellent: 'Excellent',
  good:      'Good',
  fair:      'Fair',
  poor:      'Poor',
};

export const RELIABILITY_GRADE_DESCRIPTION: Record<ReliabilityGrade, string> = {
  excellent: 'Highly reliable — results can be interpreted with confidence.',
  good:      'Reliable — minor inconsistencies will not significantly affect results.',
  fair:      'Moderate reliability — interpret thresholds with some caution.',
  poor:      'Low reliability — consider retaking the test in a quieter setting with full attention.',
};

export const FLAG_TYPE_ICON: Record<BehavioralFlagType, string> = {
  spuriously_fast_responses:   '⚡',
  inconsistent_reaction_times: '📊',
  suprathreshold_misses:       '🔇',
  poor_staircase_convergence:  '📉',
  slow_responses:              '🐢',
};
