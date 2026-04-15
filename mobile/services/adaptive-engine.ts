/**
 * adaptive-engine.ts
 *
 * Pure-function algorithms powering the multi-test battery.
 * No React, no side-effects.
 *
 * Contents:
 *  1. LogMAR / Bayesian-adaptive staircase  (Visual Acuity)
 *  2. Ishihara plate definitions            (Color Vision)
 *  3. Maddox clock-dial                    (Astigmatism)
 *  4. Contrast-sensitivity staircase       (Contrast)
 *  5. Near-vision paragraph specs          (Near Vision)
 *  6. Battery metadata
 */

import type {
  BatteryTestMeta,
  AcuityTrial,
  ColorPlate,
  ContrastTrial,
  AcuityResult,
  ColorResult,
  AstigmatismResult,
  ContrastResult,
  NearVisionResult,
  ColorVisionCategory,
  DeviceCalibration,
} from 'types/vision-types';
import { mmToLogPx } from './calibration-engine';

// ═══════════════════════════════════════════════════════════════════════════════
// 1.  VISUAL ACUITY — LogMAR Bayesian Adaptive (QUEST-lite)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * LogMAR values for the staircase (0.9 → −0.2 in 0.1 steps).
 * LogMAR 0.0 = 20/20, positive = worse, negative = better.
 */
export const LOGMAR_LEVELS: number[] = [
  1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
  0.0, -0.1, -0.2,
];

const RAD_PER_ARCMIN = Math.PI / (180 * 60);

/**
 * Compute letter height (logical px) for a given LogMAR level at a viewing
 * distance, using the device calibration.
 *
 * LogMAR → arcMinutes: letterHeight = 5 × 10^logMAR arcmin
 * Then: heightMm = distanceMm × tan(arcMin × RAD_PER_ARCMIN)
 */
export function logmarToLetterHeightPx(
  logMAR: number,
  distanceCm: number,
  cal: DeviceCalibration,
): number {
  const arcMin = 5 * Math.pow(10, logMAR);
  const heightMm = distanceCm * 10 * Math.tan(arcMin * RAD_PER_ARCMIN);
  return mmToLogPx(heightMm, cal);
}

/** Single character optotype pool (no I, O to avoid confusion) */
const OPTOTYPE_POOL = 'CDEFHLNPRTUVZ';

export function randomOptotype(exclude: string = ''): string {
  const pool = OPTOTYPE_POOL.split('').filter((c) => c !== exclude.toUpperCase());
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomOptotypes(n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    result.push(randomOptotype(result[result.length - 1] ?? ''));
  }
  return result;
}

// Simple 2-down-1-up staircase with Bayesian weighting ──────────────────────

export interface AcuityStaircase {
  levelIdx: number;
  consecutiveCorrect: number;
  reversals: number[];
  done: boolean;
}

export function initAcuityStaircase(): AcuityStaircase {
  // Start at LogMAR 0.5 (≈ 20/63) — mid range
  return {
    levelIdx: LOGMAR_LEVELS.indexOf(0.5),
    consecutiveCorrect: 0,
    reversals: [],
    done: false,
  };
}

/**
 * Step the staircase based on a response.
 * 2-down-1-up rule targeting ~70.7% correct threshold.
 * Terminates after 6 reversals.
 */
export function stepAcuityStaircase(
  state: AcuityStaircase,
  correct: boolean,
): AcuityStaircase {
  const prev = state.levelIdx;
  let { consecutiveCorrect, reversals } = state;
  let levelIdx = prev;

  if (correct) {
    consecutiveCorrect += 1;
    if (consecutiveCorrect >= 2) {
      levelIdx = Math.min(prev + 1, LOGMAR_LEVELS.length - 1); // harder
      consecutiveCorrect = 0;
    }
  } else {
    levelIdx = Math.max(prev - 1, 0); // easier
    consecutiveCorrect = 0;
  }

  if (levelIdx !== prev) {
    const wasUp = levelIdx > prev;
    const lastWasUp = reversals.length > 0
      ? reversals[reversals.length - 1] > prev
      : null;
    if (lastWasUp !== null && wasUp !== lastWasUp) {
      reversals = [...reversals, LOGMAR_LEVELS[prev]];
    } else if (reversals.length === 0) {
      reversals = [...reversals, LOGMAR_LEVELS[prev]];
    }
  }

  const done = reversals.length >= 6;
  return { levelIdx, consecutiveCorrect, reversals, done };
}

/**
 * Estimate threshold from reversals using the mean of the last 4.
 */
export function estimateAcuityThreshold(state: AcuityStaircase): number {
  const r = state.reversals;
  if (r.length === 0) return LOGMAR_LEVELS[state.levelIdx];
  const last = r.slice(-4);
  return last.reduce((a, b) => a + b, 0) / last.length;
}

export function logmarToSnellen(logMAR: number): string {
  // 20/X → X = 20 × 10^logMAR
  const denom = Math.round(20 * Math.pow(10, logMAR));
  if (denom <= 10)  return '20/10';
  if (denom <= 15)  return '20/15';
  if (denom <= 20)  return '20/20';
  if (denom <= 25)  return '20/25';
  if (denom <= 30)  return '20/30';
  if (denom <= 40)  return '20/40';
  if (denom <= 50)  return '20/50';
  if (denom <= 70)  return '20/70';
  if (denom <= 100) return '20/100';
  return '20/200';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2.  COLOR VISION — Ishihara-style plates (synthetic SVG-free approach)
//     We render plates as React Native Canvas arcs — pure numeric spec here.
// ═══════════════════════════════════════════════════════════════════════════════

export const COLOR_PLATES: ColorPlate[] = [
  // Plate 1: Demo — everyone sees "12"
  { id: 1,  correctAnswer: '12', deficientAnswer: '12', type: 'normal_only' },
  // Plate 2: Vanishing — only normals see "8"
  { id: 2,  correctAnswer: '8',  deficientAnswer: '',   type: 'vanishing' },
  // Plate 3: Vanishing — only normals see "5"
  { id: 3,  correctAnswer: '5',  deficientAnswer: '',   type: 'vanishing' },
  // Plate 4: Vanishing — only normals see "29"
  { id: 4,  correctAnswer: '29', deficientAnswer: '',   type: 'vanishing' },
  // Plate 5: Vanishing — only normals see "74"
  { id: 5,  correctAnswer: '74', deficientAnswer: '',   type: 'vanishing' },
  // Plate 6: Deficient-read — only deficients see "6"
  { id: 6,  correctAnswer: '',   deficientAnswer: '6',  type: 'deficient_only' },
  // Plate 7: Vanishing — only normals see "45"
  { id: 7,  correctAnswer: '45', deficientAnswer: '',   type: 'vanishing' },
  // Plate 8: Vanishing — only normals see "7"
  { id: 8,  correctAnswer: '7',  deficientAnswer: '',   type: 'vanishing' },
  // Plate 9: Vanishing — only normals see "16"
  { id: 9,  correctAnswer: '16', deficientAnswer: '',   type: 'vanishing' },
  // Plate 10: Deficient-read — only deficients see "2"
  { id: 10, correctAnswer: '',   deficientAnswer: '2',  type: 'deficient_only' },
];

// CVD color palettes (Protan / Deutan confusion colours)
export interface PlateColorScheme {
  background: string[];  // dot hex colors that form background noise
  figure: string[];      // dot hex colors that form the digit
}

const PROTAN_CONFUSION_BG  = ['#8B7355','#A08060','#907050','#C0A080','#B09070'];
const PROTAN_CONFUSION_FIG = ['#CC4422','#BB3311','#DD5533','#AA2200','#FF6644'];
const NORMAL_BG            = ['#A8A8A8','#909090','#B8B8B8','#808080','#C8C8C8'];

const PLATE_SCHEMES: Record<number, PlateColorScheme> = {
  1:  { background: NORMAL_BG,            figure: ['#FF4444','#EE3333','#DD2222'] },
  2:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  3:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  4:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  5:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  6:  { background: ['#888','#999','#777','#AAA','#BBB'], figure: ['#CC8844','#BB7733','#DD9955'] },
  7:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  8:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  9:  { background: PROTAN_CONFUSION_BG,  figure: PROTAN_CONFUSION_FIG },
  10: { background: ['#888','#999','#777','#AAA','#BBB'], figure: ['#CC8844','#BB7733','#DD9955'] },
};

export function getPlateScheme(plateId: number): PlateColorScheme {
  return PLATE_SCHEMES[plateId] ?? { background: NORMAL_BG, figure: ['#FF4444','#EE3333'] };
}

export function classifyColorVision(
  trials: Array<{ plateId: number; isCorrect: boolean }>,
): { category: ColorVisionCategory; score: number } {
  const vanishing = COLOR_PLATES.filter((p) => p.type === 'vanishing');
  const vanishingIds = new Set(vanishing.map((p) => p.id));
  const vanishingTrials = trials.filter((t) => vanishingIds.has(t.plateId));
  const correct = vanishingTrials.filter((t) => t.isCorrect).length;
  const score = vanishingTrials.length > 0
    ? Math.round((correct / vanishingTrials.length) * 100)
    : 100;

  let category: ColorVisionCategory;
  if (score >= 90)      category = 'normal';
  else if (score >= 70) category = 'mild_deficiency';
  else if (score >= 40) category = 'moderate_deficiency';
  else                  category = 'severe_deficiency';

  return { category, score };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3.  ASTIGMATISM — clock-dial (Maddox) lines
//     12 lines at 15° increments (0–165°). User selects darkest/thickest.
// ═══════════════════════════════════════════════════════════════════════════════

export const ASTIGMATISM_AXES = Array.from({ length: 12 }, (_, i) => i * 15); // 0..165

export function classifyAstigmatism(
  selectedAxes: number[],
): { detectedAxis: number | null; severity: AstigmatismResult['severity'] } {
  if (selectedAxes.length === 0) return { detectedAxis: null, severity: 'none' };

  // Mode of selected axes
  const freq: Record<number, number> = {};
  for (const a of selectedAxes) {
    freq[a] = (freq[a] ?? 0) + 1;
  }
  const mostFreq = Number(
    Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0],
  );

  // 0°, 90°, 180° → no astigmatism (all lines equal)
  const isNeutral = [0, 90, 180].some((n) => Math.abs(mostFreq - n) <= 15);
  if (isNeutral) return { detectedAxis: null, severity: 'none' };

  // Severity by count of non-neutral responses
  const nonNeutral = selectedAxes.filter(
    (a) => ![0, 90, 180].some((n) => Math.abs(a - n) <= 15),
  );
  const ratio = nonNeutral.length / selectedAxes.length;
  let severity: AstigmatismResult['severity'];
  if (ratio < 0.3)      severity = 'mild';
  else if (ratio < 0.6) severity = 'moderate';
  else                  severity = 'marked';

  return { detectedAxis: mostFreq, severity };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4.  CONTRAST SENSITIVITY — spatial frequency staircase
// ═══════════════════════════════════════════════════════════════════════════════

/** Spatial frequencies tested (cycles per degree) */
export const CS_SPATIAL_FREQS = [0.5, 1, 2, 4, 8, 16] as const;
export type SpatialFreq = (typeof CS_SPATIAL_FREQS)[number];

export interface ContrastStaircase {
  sf: SpatialFreq;
  contrastPercent: number; // current level 0–100
  direction: 'down' | 'up';
  reversals: number[];
  done: boolean;
}

export function initContrastStaircase(sf: SpatialFreq): ContrastStaircase {
  return { sf, contrastPercent: 50, direction: 'down', reversals: [], done: false };
}

export function stepContrastStaircase(
  s: ContrastStaircase,
  seen: boolean,
): ContrastStaircase {
  const prev = s.contrastPercent;
  const step = s.reversals.length < 2 ? 10 : 5;
  let next = seen ? Math.max(1, prev - step) : Math.min(100, prev + step);
  next = Math.round(next);

  const newDir: 'down' | 'up' = seen ? 'down' : 'up';
  let reversals = s.reversals;
  if (newDir !== s.direction && s.reversals.length > 0) {
    reversals = [...reversals, prev];
  }

  return {
    ...s,
    contrastPercent: next,
    direction: newDir,
    reversals,
    done: reversals.length >= 4,
  };
}

export function estimateContrastThreshold(s: ContrastStaircase): number {
  const r = s.reversals;
  if (r.length === 0) return s.contrastPercent;
  const last = r.slice(-4);
  return Math.round(last.reduce((a, b) => a + b, 0) / last.length);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5.  NEAR VISION — paragraph sizes
// ═══════════════════════════════════════════════════════════════════════════════

export interface NearVisionLevel {
  points: number;
  nNotation: string;
  fontSize: number; // logical px at 40 cm standard distance — scaled by calibration in UI
  sampleText: string;
}

export const NEAR_VISION_LEVELS: NearVisionLevel[] = [
  { points: 4,  nNotation: 'N4',  fontSize: 9,  sampleText: 'The quick brown fox jumps over the lazy dog.' },
  { points: 5,  nNotation: 'N5',  fontSize: 11, sampleText: 'The quick brown fox jumps over the lazy dog.' },
  { points: 6,  nNotation: 'N6',  fontSize: 13, sampleText: 'The quick brown fox jumps over the lazy dog.' },
  { points: 8,  nNotation: 'N8',  fontSize: 17, sampleText: 'The quick brown fox jumps.' },
  { points: 10, nNotation: 'N10', fontSize: 21, sampleText: 'The quick brown fox.' },
  { points: 12, nNotation: 'N12', fontSize: 25, sampleText: 'The quick fox.' },
  { points: 14, nNotation: 'N14', fontSize: 30, sampleText: 'Brown fox.' },
  { points: 18, nNotation: 'N18', fontSize: 38, sampleText: 'Quick fox.' },
  { points: 24, nNotation: 'N24', fontSize: 50, sampleText: 'Fox.' },
  { points: 36, nNotation: 'N36', fontSize: 76, sampleText: 'Hi.' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 6.  BATTERY METADATA
// ═══════════════════════════════════════════════════════════════════════════════

export const BATTERY_META: BatteryTestMeta[] = [
  {
    id: 'acuity',
    label: 'Visual Acuity',
    icon: 'eye-outline',
    description: 'LogMAR adaptive letter chart (20/200 → 20/10)',
    estimatedSec: 120,
  },
  {
    id: 'color',
    label: 'Color Vision',
    icon: 'color-palette-outline',
    description: 'Ishihara-style plates for red-green deficiency',
    estimatedSec: 60,
  },
  {
    id: 'astigmatism',
    label: 'Astigmatism',
    icon: 'compass-outline',
    description: 'Clock-dial axis estimation',
    estimatedSec: 45,
  },
  {
    id: 'contrast',
    label: 'Contrast Sensitivity',
    icon: 'contrast-outline',
    description: 'Spatial frequency threshold curve',
    estimatedSec: 90,
  },
  {
    id: 'near',
    label: 'Near Vision',
    icon: 'reader-outline',
    description: 'N-notation paragraph reading test',
    estimatedSec: 60,
  },
];
