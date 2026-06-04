/**
 * Sensor Interpretation Service
 *
 * Thin client that calls the backend EDIS-backed endpoints:
 *   POST /api/sensor-tests/vision/interpret
 *   POST /api/sensor-tests/hearing/interpret
 *
 * Both endpoints require a valid JWT (handled automatically by the api
 * interceptor).  The backend resolves the patient clinical context from the
 * auth token so callers do not need to pass any extra patient data.
 */
import api from './api';
import type {
  SingleTestResult,
  AcuityResult,
  ColorResult,
  AstigmatismResult,
  ContrastResult,
  NearVisionResult,
  BehavioralReport,
} from 'types/vision-types';
import type {
  EarResult,
  SINResult,
  HFResult,
} from 'types/hearing-types';

// ─── Response types (mirror of backend SensorInterpretResponse) ──────────────

export interface ConditionEntry {
  condition: string;
  confidence: number; // 0–100
  description: string;
}

export interface RiskFlagEntry {
  flag: string;
  severity: string; // "low" | "medium" | "high"
  description: string;
}

export interface InvestigationEntry {
  test: string;
  reason: string;
  urgency: string; // "ROUTINE" | "URGENT" | "STAT"
}

export interface SensorInterpretResponse {
  success: boolean;
  assessment: string;
  conditions: ConditionEntry[];
  riskFlags: RiskFlagEntry[];
  investigations: InvestigationEntry[];
  urgency: string; // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  needsPhysicianReview: boolean;
  providerName: string;
}

function normalizeInterpretResponse(data: Partial<SensorInterpretResponse> | null | undefined): SensorInterpretResponse {
  return {
    success: Boolean(data?.success),
    assessment: data?.assessment ?? '',
    conditions: Array.isArray(data?.conditions) ? data.conditions : [],
    riskFlags: Array.isArray(data?.riskFlags) ? data.riskFlags : [],
    investigations: Array.isArray(data?.investigations) ? data.investigations : [],
    urgency: data?.urgency ?? 'LOW',
    needsPhysicianReview: Boolean(data?.needsPhysicianReview),
    providerName: data?.providerName ?? '',
  };
}

// ─── Vision mapper ────────────────────────────────────────────────────────────

function buildVisionBody(
  results: SingleTestResult[],
  behavioralReport?: BehavioralReport | null,
): object {
  const acuity   = results.find((r) => r.testId === 'acuity')       as AcuityResult | undefined;
  const color    = results.find((r) => r.testId === 'color')        as ColorResult | undefined;
  const astig    = results.find((r) => r.testId === 'astigmatism')  as AstigmatismResult | undefined;
  const contrast = results.find((r) => r.testId === 'contrast')     as ContrastResult | undefined;
  const near     = results.find((r) => r.testId === 'near')         as NearVisionResult | undefined;

  return {
    ...(acuity && {
      acuity: {
        logMAR:   acuity.logMAR,
        snellen:  acuity.snellen,
        category: acuity.acuityCategory ?? '',
        decimal:  acuity.snellenDecimal ?? 0,
      },
    }),
    ...(color && {
      color: {
        score:    color.score,
        category: color.category,
        cvdType:  color.cvdType ?? '',
      },
    }),
    ...(astig && {
      astigmatism: {
        severity:         astig.severity,
        detectedAxis:     astig.detectedAxis ?? null,
        axisRule:         astig.axisRule ?? '',
        cylinderNotation: astig.cylinderNotation ?? '',
      },
    }),
    ...(contrast && {
      contrast: {
        pelliRobsonLogCS: contrast.pelliRobsonLogCS ?? null,
        contrastGrade:    contrast.contrastGrade ?? '',
      },
    }),
    ...(near && {
      near: {
        smallestReadablePoints: near.smallestReadablePoints,
        nNotation:              near.nNotation,
        jaegerNotation:         near.jaegerNotation ?? '',
      },
    }),
    behavioralReliability: behavioralReport?.overallReliability ?? '',
  };
}

// ─── Hearing mapper ───────────────────────────────────────────────────────────

function earToData(ear: EarResult) {
  // Find 4 kHz and 8 kHz thresholds from the per-frequency list
  const t4 = ear.thresholds.find((t) => t.frequency === 4000)?.dbHL ?? null;
  const t8 = ear.thresholds.find((t) => t.frequency === 8000)?.dbHL ?? null;
  return {
    pta3:          ear.who.pureTonaAverage,
    whoGrade:      String(ear.who.grade),
    category:      ear.who.category,
    shape:         ear.audiogramShape,
    threshold4kHz: t4,
    threshold8kHz: t8,
  };
}

function buildHearingBody(
  rightEar: EarResult | null,
  leftEar:  EarResult | null,
  sinResult: SINResult | null,
  hfResult:  HFResult  | null,
): object {
  return {
    ...(rightEar && { rightEar: earToData(rightEar) }),
    ...(leftEar  && { leftEar:  earToData(leftEar) }),
    ...(sinResult && {
      sin: {
        // Express as percentage of trials correctly heard
        score: sinResult.trials.length > 0
          ? (sinResult.trials.filter((t) => t.heard).length / sinResult.trials.length) * 100
          : 0,
        grade: sinResult.grade,
      },
    }),
    ...(hfResult && { hf: { pattern: hfResult.pattern } }),
    rightReliabilityGrade: rightEar?.behavioralReport?.reliabilityGrade ?? '',
    leftReliabilityGrade:  leftEar?.behavioralReport?.reliabilityGrade ?? '',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Interpret vision battery results via the EDIS backend.
 * Throws on network error; always returns a response on success.
 */
export async function interpretVision(
  results: SingleTestResult[],
  behavioralReport?: BehavioralReport | null,
): Promise<SensorInterpretResponse> {
  const body = buildVisionBody(results, behavioralReport);
  const { data } = await api.post<Partial<SensorInterpretResponse>>(
    '/sensor-tests/vision/interpret',
    body,
  );
  return normalizeInterpretResponse(data);
}

/**
 * Interpret audiometry results via the EDIS backend.
 * Throws on network error; always returns a response on success.
 */
export async function interpretHearing(
  rightEar:  EarResult  | null,
  leftEar:   EarResult  | null,
  sinResult: SINResult  | null,
  hfResult:  HFResult   | null,
): Promise<SensorInterpretResponse> {
  const body = buildHearingBody(rightEar, leftEar, sinResult, hfResult);
  const { data } = await api.post<Partial<SensorInterpretResponse>>(
    '/sensor-tests/hearing/interpret',
    body,
  );
  return normalizeInterpretResponse(data);
}
