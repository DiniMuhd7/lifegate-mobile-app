// ─── Device calibration ───────────────────────────────────────────────────────

export interface DeviceCalibration {
  /** Screen width in logical pixels (React Native layout units) */
  logicalWidth: number;
  /** Screen height in logical pixels */
  logicalHeight: number;
  /** Screen width in physical (hardware) pixels */
  physicalWidthPx: number;
  /** Screen height in physical (hardware) pixels */
  physicalHeightPx: number;
  /** Device pixel ratio (e.g., 2 = @2x, 3 = @3x) */
  pixelRatio: number;
  /** Estimated pixels-per-inch (physical) */
  estimatedPPI: number;
  /** Millimetres per logical pixel — the key scaling factor */
  mmPerLogicalPixel: number;
  /** True when the user has corrected the estimate via card calibration */
  isUserCalibrated: boolean;
}

// ─── Ambient light ────────────────────────────────────────────────────────────

export type AmbientLightCategory =
  | 'unknown'
  | 'dark'
  | 'dim'
  | 'adequate'
  | 'bright'
  | 'very_bright';

// ─── Viewing distance ─────────────────────────────────────────────────────────

export type ViewingDistanceSource =
  | 'default'
  | 'manual'
  | 'camera_assisted';

// ─── Calibration wizard steps ─────────────────────────────────────────────────

export type CalibrationStep = 'device' | 'lighting' | 'distance' | 'review';

// ─── Snellen row specification (computed by engine) ──────────────────────────

export interface SnellenRowSpec {
  acuity: string;
  arcMinutes: number;
  /** Letter height in millimetres at the chosen viewing distance */
  letterHeightMm: number;
  /** Letter height in logical pixels — use this for layout */
  letterHeightPx: number;
  /** Stroke width in logical pixels (1/5 of letterHeightPx) */
  strokeWidthPx: number;
  /** False when stroke < 1.5 px — too fine to render reliably */
  isDisplayable: boolean;
}

// ─── Multi-test battery ───────────────────────────────────────────────────────

export type BatteryTestId =
  | 'acuity'
  | 'color'
  | 'astigmatism'
  | 'contrast'
  | 'near';

export type BatteryTestStatus = 'pending' | 'active' | 'done' | 'skipped';

export interface BatteryTestMeta {
  id: BatteryTestId;
  label: string;
  icon: string;
  description: string;
  estimatedSec: number;
}

// ─── Visual Acuity (LogMAR / Bayesian adaptive) ───────────────────────────────

export interface AcuityTrial {
  logMAR: number;
  letterHeightPx: number;
  letter: string;
  response: 'correct' | 'incorrect';
  reactionMs: number;
}

export interface AcuityResult {
  testId: 'acuity';
  logMAR: number;          // final estimate (threshold)
  snellen: string;         // e.g. "20/20"
  trials: AcuityTrial[];
  completedAt: number;     // Date.now()
  // Clinical notation (populated by clinical-standards-engine)
  acuityCategory?: 'normal' | 'near_normal' | 'moderate_low_vision' | 'severe_low_vision' | 'blindness';
  snellenDecimal?: number; // decimal acuity e.g. 1.0
  etdrsLetters?: number;   // approx ETDRS letter score
}

// ─── Color Vision (Ishihara-style plates) ────────────────────────────────────

export type ColorPlateType =
  | 'normal_only'          // only normals read it correctly
  | 'deficient_only'       // only deficients read it correctly
  | 'vanishing'            // vanishes for deficients
  | 'hidden_digit'         // only deficients see it
  | 'classification';      // protan/deutan classification plate (Ishihara 11–14 equivalent)

export interface ColorPlate {
  id: number;
  correctAnswer: string;   // digit(s) a normal trichromat sees, e.g. "12"
  deficientAnswer: string; // what a deficient person sees (could be "" or diff digit)
  type: ColorPlateType;
}

export interface ColorTrial {
  plateId: number;
  givenAnswer: string;
  isCorrect: boolean;
  reactionMs: number;
}

export type ColorVisionCategory =
  | 'normal'
  | 'mild_deficiency'
  | 'moderate_deficiency'
  | 'severe_deficiency';

export interface ColorResult {
  testId: 'color';
  category: ColorVisionCategory;
  score: number;           // 0–100 percentage correct
  trials: ColorTrial[];
  completedAt: number;
  cvdType?: 'normal_trichromacy' | 'protan' | 'deutan' | 'protan_or_deutan' | 'insufficient_data';
}

// ─── Astigmatism (Maddox / clock-dial) ───────────────────────────────────────

export interface AstigmatismTrial {
  selectedAxis: number;    // degrees 0–180 the user selected as "darkest/thickest"
  reactionMs: number;
}

export interface AstigmatismResult {
  testId: 'astigmatism';
  /** Primary axis in degrees (0–180), or null if no astigmatism detected */
  detectedAxis: number | null;
  /** Estimated severity: none | mild | moderate | marked */
  severity: 'none' | 'mild' | 'moderate' | 'marked';
  trials: AstigmatismTrial[];
  completedAt: number;
  axisRule?: 'none' | 'with_the_rule' | 'against_the_rule' | 'oblique';
  cylinderNotation?: string | null; // e.g. "× 90°"
}

// ─── Contrast Sensitivity ─────────────────────────────────────────────────────

export interface ContrastTrial {
  spatialFrequency: number; // cycles per degree
  contrastPercent: number;  // 0–100 % (Michelson)
  response: 'seen' | 'not_seen';
  reactionMs: number;
}

export interface ContrastResult {
  testId: 'contrast';
  /** Array of [spatialFreq, threshold%] pairs forming the CS curve */
  curve: Array<{ sf: number; threshold: number }>;
  trials: ContrastTrial[];
  completedAt: number;
  pelliRobsonLogCS?: number;  // peak log contrast sensitivity (Pelli-Robson equivalent)
  contrastGrade?: 'normal' | 'borderline' | 'reduced' | 'severely_reduced';
}

// ─── Near Vision ─────────────────────────────────────────────────────────────

export interface NearVisionResult {
  testId: 'near';
  /** Smallest paragraph size the user could read (point size equivalent) */
  smallestReadablePoints: number;
  /** N-notation equivalent (N5, N8, etc.) */
  nNotation: string;
  completedAt: number;
  jaegerNotation?: string;       // e.g. "J2"
  snellenNearEquivalent?: string; // e.g. "20/25 @ 40cm"
}

// ─── Aggregate battery result ─────────────────────────────────────────────────

export type SingleTestResult =
  | AcuityResult
  | ColorResult
  | AstigmatismResult
  | ContrastResult
  | NearVisionResult;

export interface BatterySession {
  id: string;
  startedAt: number;
  completedAt: number | null;
  viewingDistanceCm: number;
  results: SingleTestResult[];
}

// ─── Behavioral signal capture ────────────────────────────────────────────────

export interface LatencyStats {
  /** Arithmetic mean reaction time (ms) */
  mean: number;
  /** 50th percentile */
  median: number;
  /** 10th percentile (fast end) */
  p10: number;
  /** 90th percentile (slow end) */
  p90: number;
  /** Coefficient of variation (σ/μ) — high value signals unreliable engagement */
  cv: number;
  /** Responses < 300 ms (likely random guesses) */
  fastResponses: number;
  /** Responses > 5 000 ms (likely disengaged / interrupted) */
  slowResponses: number;
}

export type ErrorClusterType =
  | 'positional'     // confused letters share visual structure (e.g. E/F, P/F)
  | 'similar_shape'  // rounded look-alikes (O/Q, C/G, D/O)
  | 'systematic'     // the same wrong letter chosen 2+ times
  | 'random';        // no detectable pattern

export interface ErrorCluster {
  type: ErrorClusterType;
  frequency: number; // how often this cluster error occurred
  examples: Array<{ presented: string; chosen: string }>;
  severity: 'low' | 'medium' | 'high';
}

export interface EyeSwitchEvent {
  testId: BatteryTestId;
  /** Timestamp when the switch-eye prompt was shown (ms since epoch) */
  promptedAt: number;
  /** Timestamp when the user confirmed the switch, or null if dismissed */
  confirmedAt: number | null;
  /** acuityTrials.length at the moment the prompt appeared */
  trialIndexAtSwitch: number;
  /** The eye the user was asked to switch TO */
  side: 'left' | 'right';
  /** True when user tapped the confirm button (confirmed switch, not skipped) */
  complied: boolean;
}

export interface ReliabilityScore {
  testId: BatteryTestId;
  /** 0–100 composite reliability score */
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  /** Human-readable warning flags, e.g. ["high_latency_variance", "fast_guessing_suspected"] */
  flags: string[];
  /** 0–1 statistical confidence in the underlying threshold estimate */
  confidence: number;
}

export interface BehavioralReport {
  sessionId: string;
  generatedAt: number;
  /** Per-test latency statistics (only present when the test produced ≥2 timed trials) */
  latencyByTest: Partial<Record<BatteryTestId, LatencyStats>>;
  errorClusters: ErrorCluster[];
  eyeSwitchEvents: EyeSwitchEvent[];
  /** 0–1; proportion of eye-switch prompts where the user confirmed they switched */
  eyeSwitchComplianceRate: number;
  reliabilityScores: ReliabilityScore[];
  overallReliability: 'excellent' | 'good' | 'fair' | 'poor';
}
