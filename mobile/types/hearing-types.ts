// ─── PTA Frequencies (Hz) ─────────────────────────────────────────────────────

export type PTAFrequency = 250 | 500 | 1000 | 2000 | 4000 | 8000;

export const PTA_FREQUENCIES: PTAFrequency[] = [250, 500, 1000, 2000, 4000, 8000];

// ─── Device calibration ───────────────────────────────────────────────────────

export type HeadphoneStatus = 'unknown' | 'wired' | 'wireless' | 'builtin' | 'validated';

export interface AudioDeviceProfile {
  /** Estimated maximum output level at headphone jack (dBSPL @ 1 kHz, 1 Vrms) */
  estimatedMaxDbSPL: number;
  /** User-reported headphone type */
  headphoneStatus: HeadphoneStatus;
  /** Whether the user has completed the headphone validation step */
  headphoneValidated: boolean;
  /** Recommended system volume level (0–1) for standardisation */
  recommendedVolumeLevel: number;
}

// ─── Background noise analysis ────────────────────────────────────────────────

export type NoiseEnvironment = 'quiet' | 'moderate' | 'loud' | 'unknown';

export interface NoiseAnalysis {
  /** Average SPL estimated from microphone metering (dBFS, negative values) */
  averageDbFS: number;
  /** Peak metering reading */
  peakDbFS: number;
  /** Estimated dBSPL (approximate conversion) */
  estimatedDbSPL: number;
  /** Classification */
  environment: NoiseEnvironment;
  /** Whether it's acceptable to run the test */
  acceptable: boolean;
  /** Human-readable advisory */
  advisory: string;
}

// ─── Calibration wizard steps ─────────────────────────────────────────────────

export type HearingCalibrationStep =
  | 'headphone'    // 1. Headphone check + validation
  | 'volume'       // 2. System volume setup guidance
  | 'reference'    // 3. Reference tone (1 kHz 60 dBHL) – user confirms audible
  | 'noise'        // 4. Background noise check via microphone
  | 'ready';       // 5. Review + launch

// ─── PTA staircase (Hughson-Westlake inspired) ────────────────────────────────

export interface PTATrial {
  /** Frequency being tested */
  frequency: PTAFrequency;
  /** Test level in dBHL approximation */
  dbHL: number;
  /** Whether the user indicated they heard the tone */
  heard: boolean;
  /** Reaction time from tone presentation to response (ms) */
  reactionMs: number;
}

export type StaircaseDirection = 'up' | 'down';

export interface PTAStaircase {
  frequency: PTAFrequency;
  /** Current dBHL test level */
  currentDbHL: number;
  /** Current direction of travel */
  direction: StaircaseDirection;
  /** All trials recorded so far for this frequency */
  trials: PTATrial[];
  /** dBHL levels where direction reversed (ascending reversals used for threshold) */
  reversals: number[];
  /** True when sufficient reversals accumulated to estimate threshold */
  done: boolean;
  /** Estimated threshold (dBHL) — set when done = true */
  threshold: number | null;
}

// ─── Per-frequency threshold ──────────────────────────────────────────────────

export interface FrequencyThreshold {
  frequency: PTAFrequency;
  /** Estimated threshold in dBHL */
  dbHL: number;
  /** Number of trials used to estimate */
  trialCount: number;
}

// ─── WHO hearing loss classification ─────────────────────────────────────────

export type WHOGrade =
  | 0  // Normal: ≤25 dBHL
  | 1  // Slight: 26–40 dBHL
  | 2  // Moderate: 41–60 dBHL
  | 3  // Moderately Severe: 61–80 dBHL
  | 4; // Profound/Total: >80 dBHL

export type HearingLossCategory =
  | 'normal'
  | 'slight'
  | 'moderate'
  | 'moderately_severe'
  | 'severe'
  | 'profound';

export interface WHOClassification {
  grade: WHOGrade;
  category: HearingLossCategory;
  /** Pure tone average (500, 1000, 2000 Hz) */
  pureTonaAverage: number;
  label: string;
  description: string;
  recommendation: string;
}

// ─── Audiogram shape descriptors ──────────────────────────────────────────────

export type AudiogramShape =
  | 'normal'
  | 'flat'          // all frequencies similar loss
  | 'sloping'       // worse at high frequencies (most common SNHL)
  | 'rising'        // better at high frequencies
  | 'notch'         // dip at 4 kHz (noise-induced)
  | 'cookie_bite'   // worse in mid frequencies
  | 'irregular';

// ─── Per-ear result ───────────────────────────────────────────────────────────

export type TestEar = 'right' | 'left';

export interface EarResult {
  ear: TestEar;
  thresholds: FrequencyThreshold[];
  who: WHOClassification;
  audiogramShape: AudiogramShape;
  /** Behavioural signal analysis for this ear — reaction times, convergence, etc. */
  behavioralReport: BehavioralReport;
  completedAt: number;
}

// ─── Full hearing session ─────────────────────────────────────────────────────

export interface HearingSession {
  id: string;
  startedAt: number;
  completedAt: number | null;
  deviceProfile: AudioDeviceProfile;
  noiseAnalysis: NoiseAnalysis | null;
  rightEar: EarResult | null;
  leftEar: EarResult | null;
}

// ─── Speech-in-Noise (QuickSIN-inspired) ─────────────────────────────────────
//
// Protocol: six SNR levels (+20 → −5 dBSNR in 5 dB steps).
// At each level a target tone embedded in spectrally-shaped noise is presented.
// SNR50 (the SNR where 50% responses flip) is interpolated from the staircase.
// SNR Loss = SNR50 − NormalSNR50 (normal ≈ +2 dB for pure tones in noise).

export type SNRLevel = 20 | 15 | 10 | 5 | 0 | -5;
export const SIN_SNR_LEVELS: SNRLevel[] = [20, 15, 10, 5, 0, -5];

/** Single presentation at one SNR level */
export interface SINTrial {
  snrDB: SNRLevel;
  /** Target tone frequency (Hz) — varies per level for spectral coverage */
  frequency: number;
  /** User response */
  heard: boolean;
  reactionMs: number;
}

export type SINGrade =
  | 'normal'          // SNR loss 0–2 dB
  | 'mild'            // 3–7 dB
  | 'moderate'        // 8–15 dB
  | 'severe';         // >15 dB

export interface SINResult {
  trials: SINTrial[];
  /** Interpolated SNR at which responses transition from heard to not-heard */
  snr50: number;
  /** dB relative to normal SNR50 (≈ +2 dB) */
  snrLoss: number;
  grade: SINGrade;
  label: string;
  recommendation: string;
  completedAt: number;
}

// ─── High-Frequency (Extended-Range) Audiometry ───────────────────────────────
//
// Tests the 9–12 kHz range that most consumer earphones can still reproduce.
// This range is often the first to show subclinical noise-induced damage
// before the standard 8 kHz threshold is affected.

export type HFFrequency = 9000 | 10000 | 12000;
export const HF_FREQUENCIES: HFFrequency[] = [9000, 10000, 12000];

/** Staircase entry for an HF frequency — same shape as PTAStaircase */
export interface HFStaircase {
  frequency: HFFrequency;
  currentDbHL: number;
  direction: StaircaseDirection;
  trials: Array<{ dbHL: number; heard: boolean; reactionMs: number }>;
  reversals: number[];
  done: boolean;
  threshold: number | null;
}

export type HFPattern =
  | 'normal'          // ≤25 dBHL across all HF bands
  | 'mild_hf_loss'    // 26–40 dBHL average
  | 'significant_hf_loss'  // >40 dBHL average
  | 'early_nihl';     // progressive worsening 9→10→12 kHz (NIHL signature)

export interface HFResult {
  thresholds: Array<{ frequency: HFFrequency; dbHL: number; trialCount: number }>;
  hfAverage: number;
  pattern: HFPattern;
  /** True when 4 kHz (from PTA) + HF together show NIHL notch progression */
  nihlRiskFlag: boolean;
  completedAt: number;
}

// ─── Threshold confidence (per frequency PTA quality indicator) ───────────────

export interface ThresholdConfidence {
  frequency: PTAFrequency;
  /** High = ≥3 ascending reversals within 10 dB range; Medium = 2; Low = <2 */
  confidence: 'high' | 'medium' | 'low';
  /** Total ascending reversals accumulated */
  ascendingReversalCount: number;
  /** Spread (max − min) of ascending reversal levels — lower is better */
  spreadDB: number;
}

// ─── Behavioral Signal Capture ────────────────────────────────────────────────
//
// Captures response quality signals recorded during PTA:
//   • Spuriously fast responses  — RT < 150 ms ("heard" before neural
//     conduction completes; proxy for button-mashing / inattention)
//   • Suprathreshold misses      — "not heard" at ≥20 dBHL above the
//     estimated threshold (tone was almost certainly audible → inattention)
//   • Reaction-time consistency  — coefficient of variation (CV = σ/μ) of all
//     "heard" RTs; low CV indicates attentive, reliable responding
//   • Staircase convergence      — number and spread of ascending reversals
//     (the more tightly clustered, the more confident the threshold estimate)
//
// NOTE: True false-positive detection requires silent catch trials which
// automated PTA does not include.  "Spuriously fast responses" are a validated
// behavioural proxy but should not be labelled "false positives" in clinical
// reporting.

export type BehavioralFlagType =
  | 'spuriously_fast_responses'    // RT < 150 ms on "heard" trials
  | 'inconsistent_reaction_times'  // RT CV > 0.5
  | 'suprathreshold_misses'        // missed tones clearly above threshold
  | 'poor_staircase_convergence'   // < 3 ascending reversals for ≥1 frequency
  | 'slow_responses';              // mean RT > 2 500 ms (possible inattention)

export interface BehavioralFlag {
  type: BehavioralFlagType;
  /** Human-readable explanation shown in the UI */
  description: string;
  severity: 'warning' | 'info';
}

/** Per-frequency behavioural metrics extracted from a PTAStaircase */
export interface FrequencyReliability {
  frequency: PTAFrequency;
  /** Estimated threshold (dBHL) used as reference for suprathreshold evaluation */
  threshold: number;
  /** ≥3 ascending reversals = fully converged */
  ascendingReversalCount: number;
  /** max − min of ascending reversal levels; ≤10 dB = tight, ≥25 dB = loose */
  spreadDB: number;
  /** Derived from ascendingReversalCount + spread */
  confidence: 'high' | 'medium' | 'low';
  /** "Heard" responses with RT < 150 ms at this frequency */
  spuriouslyFastCount: number;
  /** "Not heard" at ≥20 dBHL above the threshold */
  suprathresholdMissCount: number;
  /** Mean RT for valid "heard" responses (RT ≥ 150 ms) at this frequency */
  meanReactionMs: number;
  /** Total trials recorded at this frequency */
  trialCount: number;
}

export type ReliabilityGrade = 'excellent' | 'good' | 'fair' | 'poor';

/** Full behavioural quality report for one ear */
export interface BehavioralReport {
  /** Per-frequency breakdown */
  frequencyMetrics: FrequencyReliability[];
  // ── Aggregated signals ────
  /** Proportion of all "heard" responses with RT < 150 ms (0–1) */
  spuriousFastRate: number;
  /** Proportion of suprathreshold presentations answered "not heard" (0–1) */
  suprathresholdMissRate: number;
  /** Mean RT across all valid "heard" responses (ms) */
  globalMeanReactionMs: number;
  /** Coefficient of variation (σ/μ) of valid "heard" RTs */
  globalReactionCV: number;
  // ── Scoring ──────────────
  /** 0–100; higher = more reliable test data */
  reliabilityScore: number;
  reliabilityGrade: ReliabilityGrade;
  /** Issues detected during the test */
  flags: BehavioralFlag[];
}
