/**
 * calibration-engine.ts
 *
 * Pure-function engine for the Eye Test Device Calibration layer.
 * No React, no side-effects — safe to import anywhere.
 *
 * Responsibilities:
 *  1. Derive screen PPI / mmPerLogicalPixel from platform metrics
 *  2. Override calibration from a user-held credit card
 *  3. Convert between mm and logical pixels
 *  4. Classify ambient lux readings into actionable recommendations
 *  5. Compute Snellen row letter sizes for any viewing distance + calibration
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';
import type {
  DeviceCalibration,
  AmbientLightCategory,
  SnellenRowSpec,
} from 'types/vision-types';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * ISO 7810 ID-1 credit card dimensions (mm).
 * We use the HEIGHT (54 mm) as the calibration reference because it fits
 * within portrait-mode screen width on virtually all phones (≈340 logical px),
 * while the full card width (85.6 mm) typically exceeds the screen width.
 */
export const CREDIT_CARD_MM = { width: 85.6, height: 54.0 } as const;

/** Baseline logical-pixel density assumed by each platform (logical PPI) */
const BASE_PPI: Record<string, number> = {
  ios: 163,    // original iPhone reference density
  android: 160, // Android MDPI baseline
  web: 96,     // CSS reference pixel
};

// ─── Device calibration ───────────────────────────────────────────────────────

/**
 * Build a DeviceCalibration from the current device metrics.
 *
 * Key insight:
 *   mmPerLogicalPixel = 25.4 / basePPI
 *
 * Proof:
 *   physical mm per physical px = 25.4 / estimatedPPI
 *                                = 25.4 / (basePPI × pixelRatio)
 *   logical px = physical px / pixelRatio
 *   → mm per logical px = (25.4 / (basePPI × pixelRatio)) × pixelRatio
 *                       = 25.4 / basePPI   (pixelRatio cancels)
 *
 * Result: the physical-pixel density (pixelRatio) does NOT change how many
 * mm one logical pixel represents — only the base platform density matters.
 * This means the same React Native layout sizes the same real-world mm on
 * all retina / non-retina variants of the same platform.
 */
export function buildDeviceCalibration(): DeviceCalibration {
  const screen = Dimensions.get('screen');
  const pr = PixelRatio.get();
  const basePPI = BASE_PPI[Platform.OS] ?? 160;
  const estimatedPPI = Math.round(basePPI * pr);
  const mmPerLogicalPixel = 25.4 / basePPI;

  return {
    logicalWidth: screen.width,
    logicalHeight: screen.height,
    physicalWidthPx: Math.round(screen.width * pr),
    physicalHeightPx: Math.round(screen.height * pr),
    pixelRatio: pr,
    estimatedPPI,
    mmPerLogicalPixel,
    isUserCalibrated: false,
  };
}

/**
 * Produce a new calibration where mmPerLogicalPixel is derived from the
 * user physically matching the on-screen bar to the credit card's height
 * (54 mm side).
 *
 * @param base            Result of buildDeviceCalibration()
 * @param cardBarWidthPx  Logical pixels the user set for the 54 mm reference bar
 */
export function applyCardCalibration(
  base: DeviceCalibration,
  cardBarWidthPx: number,
): DeviceCalibration {
  if (cardBarWidthPx <= 0) return base;
  const mmPerLogicalPixel = CREDIT_CARD_MM.height / cardBarWidthPx;
  return {
    ...base,
    mmPerLogicalPixel,
    estimatedPPI: Math.round(25.4 / mmPerLogicalPixel),
    isUserCalibrated: true,
  };
}

// ─── Unit conversion ──────────────────────────────────────────────────────────

/** Convert millimetres → logical pixels using the active calibration. */
export function mmToLogPx(mm: number, cal: DeviceCalibration): number {
  return mm / cal.mmPerLogicalPixel;
}

/** Convert logical pixels → millimetres using the active calibration. */
export function logPxToMm(px: number, cal: DeviceCalibration): number {
  return px * cal.mmPerLogicalPixel;
}

// ─── Ambient light classification ─────────────────────────────────────────────

export interface AmbientLightClass {
  category: AmbientLightCategory;
  label: string;
  /** Hex accent colour for UI */
  color: string;
  /** Hex background colour for UI badges */
  bgColor: string;
  recommendation: string;
  /** Whether lighting is acceptable to begin the test */
  suitable: boolean;
}

const LUX_THRESHOLDS: Array<{
  maxLux: number;
  result: Omit<AmbientLightClass, 'category'> & { category: AmbientLightCategory };
}> = [
  {
    maxLux: 20,
    result: {
      category: 'dark',
      label: 'Too Dark',
      color: '#dc2626',
      bgColor: '#fef2f2',
      recommendation:
        'Very dark — move to a well-lit room (standard room lighting is ≥ 100 lux).',
      suitable: false,
    },
  },
  {
    maxLux: 100,
    result: {
      category: 'dim',
      label: 'Dim',
      color: '#d97706',
      bgColor: '#fffbeb',
      recommendation:
        'Lighting is dim. Turn on overhead lights for more reliable results.',
      suitable: false,
    },
  },
  {
    maxLux: 500,
    result: {
      category: 'adequate',
      label: 'Good',
      color: '#16a34a',
      bgColor: '#f0fdf4',
      recommendation: 'Lighting is suitable. Proceed with the test.',
      suitable: true,
    },
  },
  {
    maxLux: 2000,
    result: {
      category: 'bright',
      label: 'Bright',
      color: '#2563eb',
      bgColor: '#eff6ff',
      recommendation:
        'Bright environment detected. Reduce glare on screen if possible.',
      suitable: true,
    },
  },
  {
    maxLux: Infinity,
    result: {
      category: 'very_bright',
      label: 'Very Bright',
      color: '#7c3aed',
      bgColor: '#faf5ff',
      recommendation:
        'Extremely bright — avoid direct sunlight on the screen and step indoors if possible.',
      suitable: false,
    },
  },
];

export function classifyLux(lux: number): AmbientLightClass {
  for (const { maxLux, result } of LUX_THRESHOLDS) {
    if (lux < maxLux) return result;
  }
  return LUX_THRESHOLDS[LUX_THRESHOLDS.length - 1].result;
}

// ─── Snellen chart sizing ─────────────────────────────────────────────────────

/**
 * Standard Snellen rows.
 * Each letter is exactly 5 arcminutes tall (equal to the acuity denominator
 * in 20/X at 6 m, scaled proportionally for other distances).
 *
 * arcMinutes below = total letter height in arcminutes at 6 m (600 cm).
 * Equivalent: arcMinutes = 5 × (denominator / 20).
 */
const SNELLEN_ROWS: Array<{ acuity: string; arcMinutes: number }> = [
  { acuity: '20/200', arcMinutes: 50 },
  { acuity: '20/100', arcMinutes: 25 },
  { acuity: '20/70',  arcMinutes: 17.5 },
  { acuity: '20/50',  arcMinutes: 12.5 },
  { acuity: '20/40',  arcMinutes: 10 },
  { acuity: '20/30',  arcMinutes: 7.5 },
  { acuity: '20/25',  arcMinutes: 6.25 },
  { acuity: '20/20',  arcMinutes: 5 },
  { acuity: '20/15',  arcMinutes: 3.75 },
  { acuity: '20/10',  arcMinutes: 2.5 },
];

/** Radians per arcminute */
const RAD_PER_ARCMIN = Math.PI / (180 * 60); // ≈ 0.000291 rad

/**
 * Compute physical on-screen sizes for each Snellen row given a viewing
 * distance and the device calibration.
 *
 * Formula:
 *   letterHeight (mm) = distanceMm × tan(arcMinutes × RAD_PER_ARCMIN)
 *   letterHeight (px) = letterHeight(mm) / cal.mmPerLogicalPixel
 *   strokeWidth  (px) = letterHeight(px) / 5
 *
 * @param distanceCm  Viewing distance in centimetres (e.g. 40)
 * @param cal         Active device calibration
 */
export function computeSnellenRows(
  distanceCm: number,
  cal: DeviceCalibration,
): SnellenRowSpec[] {
  const distanceMm = distanceCm * 10;
  return SNELLEN_ROWS.map(({ acuity, arcMinutes }) => {
    const letterHeightMm = distanceMm * Math.tan(arcMinutes * RAD_PER_ARCMIN);
    const letterHeightPx = mmToLogPx(letterHeightMm, cal);
    const strokeWidthPx = letterHeightPx / 5;
    return {
      acuity,
      arcMinutes,
      letterHeightMm,
      letterHeightPx,
      strokeWidthPx,
      isDisplayable: strokeWidthPx >= 1.5,
    };
  });
}

/**
 * Returns the estimated screen width in mm.
 * Useful for displaying the physical screen size to the user.
 */
export function estimateScreenWidthMm(cal: DeviceCalibration): number {
  return logPxToMm(cal.logicalWidth, cal);
}

export function estimateScreenHeightMm(cal: DeviceCalibration): number {
  return logPxToMm(cal.logicalHeight, cal);
}

/**
 * Returns the initial slider position (logical px) for the 54 mm card bar,
 * clamped to [200, cal.logicalWidth × 0.92] so it always fits on screen.
 */
export function defaultCardBarPx(cal: DeviceCalibration): number {
  const natural = mmToLogPx(CREDIT_CARD_MM.height, cal);
  const maxPx = cal.logicalWidth * 0.92;
  return Math.min(Math.max(natural, 200), maxPx);
}
