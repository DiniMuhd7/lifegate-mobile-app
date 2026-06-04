/**
 * Behavioral Signal Engine
 *
 * Pure functions that analyse trial-level data to produce:
 *   - Response latency statistics per test
 *   - Error cluster detection (acuity letter confusions)
 *   - Eye-switch compliance scoring
 *   - Per-test reliability scores
 *   - A complete BehavioralReport for a finished BatterySession
 *
 * No side-effects; no React imports; safe to call from the Zustand store.
 */

import type {
  BatteryTestId,
  AcuityTrial,
  ColorTrial,
  AstigmatismTrial,
  ContrastTrial,
  SingleTestResult,
  BatterySession,
  LatencyStats,
  ErrorCluster,
  ErrorClusterType,
  EyeSwitchEvent,
  ReliabilityScore,
  BehavioralReport,
} from 'types/vision-types';

// ─── Letter confusion groups ──────────────────────────────────────────────────

/** Letters that share rounded forms (O, C, G, D, Q). */
const ROUNDED_GROUP = new Set(['O', 'C', 'G', 'D', 'Q']);

/** Letters that share vertical-bar + horizontal-bar structure (E, F, P, T, I). */
const STROKED_GROUP = new Set(['E', 'F', 'P', 'T', 'I', 'L']);

function shareConfusionGroup(a: string, b: string): boolean {
  return (ROUNDED_GROUP.has(a) && ROUNDED_GROUP.has(b)) ||
         (STROKED_GROUP.has(a) && STROKED_GROUP.has(b));
}

// ─── Latency statistics ───────────────────────────────────────────────────────

const FAST_THRESHOLD_MS = 300;   // sub-300 ms = likely guess
const SLOW_THRESHOLD_MS = 5_000; // > 5 s = likely distracted

/** Compute descriptive statistics for an array of reaction times (ms). */
export function computeLatencyStats(times: number[]): LatencyStats {
  const n = times.length;
  if (n === 0) {
    return { mean: 0, median: 0, p10: 0, p90: 0, cv: 0, fastResponses: 0, slowResponses: 0 };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((s, v) => s + v, 0) / n;

  const percentile = (p: number) => {
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  const variance = times.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  return {
    mean: Math.round(mean),
    median: Math.round(percentile(50)),
    p10: Math.round(percentile(10)),
    p90: Math.round(percentile(90)),
    cv: parseFloat(cv.toFixed(3)),
    fastResponses: times.filter((t) => t < FAST_THRESHOLD_MS).length,
    slowResponses:  times.filter((t) => t > SLOW_THRESHOLD_MS).length,
  };
}

// ─── Error clustering ─────────────────────────────────────────────────────────

/** Detect patterns in acuity letter-confusion errors. */
export function detectErrorClusters(trials: AcuityTrial[]): ErrorCluster[] {
  const errors = trials.filter((t) => t.response === 'incorrect');
  if (errors.length === 0) return [];

  // Build a confusion table: Map<"presented→chosen", count>
  const confusionMap = new Map<string, { presented: string; chosen: string; count: number }>();
  for (const t of errors) {
    // We only have the presented letter; for the "chosen" field we rely on
    // the fact that incorrect means a different letter was shown — but the
    // specific wrong choice is not stored in AcuityTrial.  Represent the
    // confusion as "presented → UNKNOWN" until the store adds chosen.
    // Store the trial for pattern analysis using letter + response only.
    const key = t.letter;
    const entry = confusionMap.get(key) ?? { presented: t.letter, chosen: '?', count: 0 };
    entry.count += 1;
    confusionMap.set(key, entry);
  }

  // Classify the overall error pattern
  const totalErrors = errors.length;
  const examples: Array<{ presented: string; chosen: string }> = [...confusionMap.values()].map((e) => ({
    presented: e.presented, chosen: e.chosen,
  }));

  // Systematic: any single letter missed ≥ 2 times
  const systematicEntry = [...confusionMap.values()].find((e) => e.count >= 2);

  // Shape-based: presented letters belong to a known confusion group
  const shapeErrors = errors.filter((t) =>
    [...ROUNDED_GROUP].some((l) => l === t.letter) ||
    [...STROKED_GROUP].some((l) => l === t.letter)
  );
  const shapeRate = shapeErrors.length / totalErrors;

  let clusterType: ErrorClusterType = 'random';
  if (systematicEntry) {
    clusterType = 'systematic';
  } else if (shapeRate >= 0.5) {
    clusterType = 'similar_shape';
  } else if (errors.every((t) => shareConfusionGroup(t.letter, errors[0].letter))) {
    clusterType = 'positional';
  }

  const errorRate = totalErrors / trials.length;
  const severity: ErrorCluster['severity'] = errorRate >= 0.5 ? 'high' : errorRate >= 0.25 ? 'medium' : 'low';

  if (totalErrors === 0) return [];

  return [{
    type: clusterType,
    frequency: totalErrors,
    examples: examples.slice(0, 5),
    severity,
  }];
}

// ─── Eye-switch compliance ────────────────────────────────────────────────────

/**
 * Returns 0–1 compliance rate.
 * If no prompts were issued, returns 1.0 (not applicable → full score).
 */
export function scoreEyeSwitchCompliance(events: EyeSwitchEvent[]): number {
  if (events.length === 0) return 1.0;
  const complied = events.filter((e) => e.complied).length;
  return parseFloat((complied / events.length).toFixed(2));
}

// ─── Per-test reliability score ───────────────────────────────────────────────

/**
 * Produces a 0–100 reliability score and grade for a single test.
 * Algorithm:
 *   base = 100
 *   – deduct for high CV (engagement inconsistency)
 *   – deduct for fast-guess rate
 *   – deduct for slow-response rate
 *   – deduct for very few trials (low statistical power)
 */
export function computeReliabilityScore(
  testId: BatteryTestId,
  trialCount: number,
  latencyStats: LatencyStats | null,
): ReliabilityScore {
  const flags: string[] = [];
  let score = 100;

  if (latencyStats) {
    // High coefficient of variation → inconsistent attention
    if (latencyStats.cv > 1.2) {
      score -= 25;
      flags.push('high_latency_variance');
    } else if (latencyStats.cv > 0.8) {
      score -= 12;
    }

    // Fast guessing
    const fastRate = trialCount > 0 ? latencyStats.fastResponses / trialCount : 0;
    if (fastRate > 0.3) {
      score -= 25;
      flags.push('fast_guessing_suspected');
    } else if (fastRate > 0.15) {
      score -= 12;
    }

    // Disengaged long pauses
    const slowRate = trialCount > 0 ? latencyStats.slowResponses / trialCount : 0;
    if (slowRate > 0.2) {
      score -= 15;
      flags.push('intermittent_disengagement');
    }
  }

  // Low trial count reduces confidence
  const minTrials: Partial<Record<BatteryTestId, number>> = {
    acuity: 12, color: 10, astigmatism: 3, contrast: 8,
  };
  const threshold = minTrials[testId] ?? 3;
  if (trialCount < threshold) {
    score -= 15;
    flags.push('insufficient_trials');
  }

  score = Math.max(0, Math.min(100, score));

  const grade: ReliabilityScore['grade'] =
    score >= 85 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'fair' : 'poor';

  const confidence = Math.min(1, trialCount / (threshold * 1.5));

  return { testId, score, grade, flags, confidence: parseFloat(confidence.toFixed(2)) };
}

// ─── Full behavioral report ───────────────────────────────────────────────────

interface TrialsByTest {
  acuity: AcuityTrial[];
  color: ColorTrial[];
  astigmatism: AstigmatismTrial[];
  contrast: ContrastTrial[];
}

export function generateBehavioralReport(
  session: BatterySession,
  eyeSwitchEvents: EyeSwitchEvent[],
  trialsByTest: TrialsByTest,
): BehavioralReport {
  const latencyByTest: Partial<Record<BatteryTestId, LatencyStats>> = {};
  const reliabilityScores: ReliabilityScore[] = [];

  // ── Acuity ────
  if (trialsByTest.acuity.length > 0) {
    const times = trialsByTest.acuity.map((t) => t.reactionMs);
    const ls = computeLatencyStats(times);
    latencyByTest.acuity = ls;
    reliabilityScores.push(computeReliabilityScore('acuity', trialsByTest.acuity.length, ls));
  }

  // ── Color ─────
  if (trialsByTest.color.length > 0) {
    const times = trialsByTest.color.map((t) => t.reactionMs);
    const ls = computeLatencyStats(times);
    latencyByTest.color = ls;
    reliabilityScores.push(computeReliabilityScore('color', trialsByTest.color.length, ls));
  }

  // ── Astigmatism ───
  if (trialsByTest.astigmatism.length > 0) {
    const times = trialsByTest.astigmatism.map((t) => t.reactionMs);
    const ls = computeLatencyStats(times);
    latencyByTest.astigmatism = ls;
    reliabilityScores.push(computeReliabilityScore('astigmatism', trialsByTest.astigmatism.length, ls));
  }

  // ── Contrast ──
  if (trialsByTest.contrast.length > 0) {
    const times = trialsByTest.contrast.map((t) => t.reactionMs);
    const ls = computeLatencyStats(times);
    latencyByTest.contrast = ls;
    reliabilityScores.push(computeReliabilityScore('contrast', trialsByTest.contrast.length, ls));
  }

  // ── Near (no timed trials) ────
  const nearResult = session.results.find((r) => r.testId === 'near');
  if (nearResult) {
    reliabilityScores.push(computeReliabilityScore('near', 1, null));
  }

  // ── Error clusters ────
  const errorClusters = detectErrorClusters(trialsByTest.acuity);

  // ── Eye-switch compliance ────
  const eyeSwitchComplianceRate = scoreEyeSwitchCompliance(eyeSwitchEvents);

  // ── Overall reliability ────
  const avgScore =
    reliabilityScores.length > 0
      ? reliabilityScores.reduce((s, r) => s + r.score, 0) / reliabilityScores.length
      : 100;

  const overallReliability: BehavioralReport['overallReliability'] =
    avgScore >= 85 ? 'excellent' :
    avgScore >= 70 ? 'good' :
    avgScore >= 50 ? 'fair' : 'poor';

  return {
    sessionId: session.id,
    generatedAt: Date.now(),
    latencyByTest,
    errorClusters,
    eyeSwitchEvents,
    eyeSwitchComplianceRate,
    reliabilityScores,
    overallReliability,
  };
}
