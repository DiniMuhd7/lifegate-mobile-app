import { create } from 'zustand';
import {
  buildDeviceCalibration,
  applyCardCalibration,
  defaultCardBarPx,
} from 'services/calibration-engine';
import {
  initAcuityStaircase,
  stepAcuityStaircase,
  estimateAcuityThreshold,
  initContrastStaircase,
  stepContrastStaircase,
  estimateContrastThreshold,
  classifyColorVision,
  classifyAstigmatism,
  CS_SPATIAL_FREQS,
  BATTERY_META,
} from 'services/adaptive-engine';
import {
  lookupAcuity,
  scoreIshihara,
  buildPelliRobsonResult,
  classifyAstigmatismClinical,
} from 'services/clinical-standards-engine';
import type {
  DeviceCalibration,
  CalibrationStep,
  ViewingDistanceSource,
  AmbientLightCategory,
  BatteryTestId,
  BatteryTestStatus,
  SingleTestResult,
  BatterySession,
  AcuityTrial,
  ColorTrial,
  AstigmatismTrial,
  ContrastTrial,
  EyeSwitchEvent,
  BehavioralReport,
} from 'types/vision-types';
import { generateBehavioralReport } from 'services/behavioral-engine';
import type { AcuityStaircase, SpatialFreq, ContrastStaircase } from 'services/adaptive-engine';

// ─── State shape ──────────────────────────────────────────────────────────────

interface VisionState {
  // ── Device calibration ─────────────────────────────────────────────────────
  deviceCalibration: DeviceCalibration | null;
  cardBarPx: number;

  // ── Ambient light ──────────────────────────────────────────────────────────
  lightSensorAvailable: boolean | null;
  currentLux: number | null;
  luxCategory: AmbientLightCategory;

  // ── Viewing distance ───────────────────────────────────────────────────────
  viewingDistanceCm: number;
  distanceSource: ViewingDistanceSource;

  // ── Wizard progress ────────────────────────────────────────────────────────
  calibrationStep: CalibrationStep;
  isCalibrationComplete: boolean;

  // ── Battery ────────────────────────────────────────────────────────────────
  /** Which tests are included in this session (user-selected) */
  selectedTests: BatteryTestId[];
  /** Status of each test in the battery */
  testStatus: Record<BatteryTestId, BatteryTestStatus>;
  /** Active battery session */
  session: BatterySession | null;

  // ── Acuity staircase runtime ───────────────────────────────────────────────
  acuityStaircase: AcuityStaircase | null;
  acuityTrials: AcuityTrial[];
  /** Thresholds from each completed staircase run (accumulated over 5-min session) */
  acuityCompletedThresholds: number[];

  // ── Color vision runtime ───────────────────────────────────────────────────
  colorPlateIndex: number;
  colorTrials: ColorTrial[];

  // ── Astigmatism runtime ────────────────────────────────────────────────────
  astigmatismTrials: AstigmatismTrial[];
  astigmatismRound: number;

  // ── Contrast runtime ───────────────────────────────────────────────────────
  contrastSfIndex: number;
  contrastStaircases: ContrastStaircase[];
  contrastTrials: ContrastTrial[];

  // ── Behavioral signals ────────────────────────────────────────────────────
  eyeSwitchEvents: EyeSwitchEvent[];
  behavioralReport: BehavioralReport | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  initCalibration: () => void;
  setCardBarPx: (px: number) => void;
  confirmCardCalibration: () => void;
  setLightSensorAvailable: (available: boolean) => void;
  updateLux: (lux: number) => void;
  setViewingDistance: (cm: number, source: ViewingDistanceSource) => void;
  goToStep: (step: CalibrationStep) => void;
  completeCalibration: () => void;
  resetCalibration: () => void;

  // Battery actions
  setSelectedTests: (tests: BatteryTestId[]) => void;
  startBattery: () => void;
  /** Called when a single sub-test completes; stores result + advances */
  recordTestResult: (result: SingleTestResult) => void;
  markTestSkipped: (id: BatteryTestId) => void;

  // Acuity
  startAcuityTest: () => void;
  restartAcuityStaircase: () => void;
  recordAcuityTrial: (trial: AcuityTrial) => void;
  finaliseAcuity: () => void;

  // Color
  startColorTest: () => void;
  recordColorTrial: (trial: ColorTrial) => void;
  finaliseColor: () => void;

  // Astigmatism
  startAstigmatismTest: () => void;
  recordAstigmatismTrial: (trial: AstigmatismTrial) => void;
  finaliseAstigmatism: () => void;

  // Contrast
  startContrastTest: () => void;
  recordContrastTrial: (trial: ContrastTrial) => void;
  advanceContrastSf: () => void;

  // Behavioral signals
  recordEyeSwitch: (event: EyeSwitchEvent) => void;
  computeBehavioralReport: () => void;

  resetBattery: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

const ALL_TEST_IDS: BatteryTestId[] = ['acuity', 'color', 'astigmatism', 'contrast', 'near'];

function defaultTestStatus(): Record<BatteryTestId, BatteryTestStatus> {
  return { acuity: 'pending', color: 'pending', astigmatism: 'pending', contrast: 'pending', near: 'pending' };
}

export const useVisionStore = create<VisionState>((set, get) => ({
  // ── Calibration initial state ──────────────────────────────────────────────
  deviceCalibration: null,
  cardBarPx: 340,
  lightSensorAvailable: null,
  currentLux: null,
  luxCategory: 'unknown',
  viewingDistanceCm: 40,
  distanceSource: 'default',
  calibrationStep: 'device',
  isCalibrationComplete: false,

  // ── Battery initial state ──────────────────────────────────────────────────
  selectedTests: [...ALL_TEST_IDS],
  testStatus: defaultTestStatus(),
  session: null,
  acuityStaircase: null,
  acuityTrials: [],
  acuityCompletedThresholds: [],
  colorPlateIndex: 0,
  colorTrials: [],
  astigmatismTrials: [],
  astigmatismRound: 0,
  contrastSfIndex: 0,
  contrastStaircases: CS_SPATIAL_FREQS.map((sf) => initContrastStaircase(sf)),
  contrastTrials: [],

  eyeSwitchEvents: [],
  behavioralReport: null,

  // ── Calibration actions ────────────────────────────────────────────────────

  initCalibration: () => {
    const cal = buildDeviceCalibration();
    set({ deviceCalibration: cal, cardBarPx: defaultCardBarPx(cal), calibrationStep: 'device', isCalibrationComplete: false });
  },

  setCardBarPx: (px) => set({ cardBarPx: Math.max(100, Math.round(px)) }),

  confirmCardCalibration: () => {
    const { deviceCalibration, cardBarPx } = get();
    if (!deviceCalibration) return;
    set({ deviceCalibration: applyCardCalibration(deviceCalibration, cardBarPx) });
  },

  setLightSensorAvailable: (available) => set({ lightSensorAvailable: available }),

  updateLux: (lux) => {
    const { classifyLux } = require('services/calibration-engine') as typeof import('services/calibration-engine');
    const { category } = classifyLux(lux);
    set({ currentLux: lux, luxCategory: category });
  },

  setViewingDistance: (cm, source) => set({ viewingDistanceCm: cm, distanceSource: source }),

  goToStep: (step) => set({ calibrationStep: step }),

  completeCalibration: () => set({ calibrationStep: 'review', isCalibrationComplete: true }),

  resetCalibration: () => {
    const cal = buildDeviceCalibration();
    set({
      deviceCalibration: cal, cardBarPx: defaultCardBarPx(cal),
      lightSensorAvailable: null, currentLux: null, luxCategory: 'unknown',
      viewingDistanceCm: 40, distanceSource: 'default',
      calibrationStep: 'device', isCalibrationComplete: false,
    });
  },

  // ── Battery actions ────────────────────────────────────────────────────────

  setSelectedTests: (tests) => set({ selectedTests: tests }),

  startBattery: () => {
    const { selectedTests } = get();
    const status = defaultTestStatus();
    for (const id of ALL_TEST_IDS) {
      status[id] = selectedTests.includes(id) ? 'pending' : 'skipped';
    }
    // Mark first selected as active
    const first = selectedTests[0];
    if (first) status[first] = 'active';

    set({
      testStatus: status,
      session: {
        id: Date.now().toString(),
        startedAt: Date.now(),
        completedAt: null,
        viewingDistanceCm: get().viewingDistanceCm,
        results: [],
      },
    });
  },

  recordTestResult: (result) => {
    const { session, testStatus, selectedTests } = get();
    if (!session) return;

    const updatedResults = [...session.results, result];
    const updatedStatus = { ...testStatus, [result.testId]: 'done' as BatteryTestStatus };

    // Find next pending test
    const currentIdx = selectedTests.indexOf(result.testId);
    const nextTest = selectedTests.slice(currentIdx + 1).find((id) => updatedStatus[id] === 'pending');
    if (nextTest) updatedStatus[nextTest] = 'active';

    const allDone = selectedTests.every((id) => updatedStatus[id] === 'done' || updatedStatus[id] === 'skipped');

    set({
      testStatus: updatedStatus,
      session: {
        ...session,
        results: updatedResults,
        completedAt: allDone ? Date.now() : null,
      },
    });

    if (allDone) {
      // Defer slightly so session is fully written before we read it back
      setTimeout(() => get().computeBehavioralReport(), 0);
    }
  },

  markTestSkipped: (id) => {
    const { testStatus, selectedTests } = get();
    const updatedStatus = { ...testStatus, [id]: 'skipped' as BatteryTestStatus };
    const currentIdx = selectedTests.indexOf(id);
    const next = selectedTests.slice(currentIdx + 1).find((t) => updatedStatus[t] === 'pending');
    if (next) updatedStatus[next] = 'active';
    set({ testStatus: updatedStatus });
  },

  // ── Acuity actions ─────────────────────────────────────────────────────────

  startAcuityTest: () => set({ acuityStaircase: initAcuityStaircase(), acuityTrials: [], acuityCompletedThresholds: [] }),

  // Save the current staircase's threshold, then restart for continuous testing
  restartAcuityStaircase: () => {
    const { acuityStaircase, acuityCompletedThresholds } = get();
    const savedThreshold = acuityStaircase ? estimateAcuityThreshold(acuityStaircase) : null;
    set({
      acuityStaircase: initAcuityStaircase(),
      acuityCompletedThresholds: savedThreshold !== null
        ? [...acuityCompletedThresholds, savedThreshold]
        : acuityCompletedThresholds,
    });
  },

  recordAcuityTrial: (trial) => {
    const { acuityStaircase, acuityTrials } = get();
    if (!acuityStaircase) return;
    const next = stepAcuityStaircase(acuityStaircase, trial.response === 'correct');
    set({ acuityStaircase: next, acuityTrials: [...acuityTrials, trial] });
  },

  finaliseAcuity: () => {
    const { acuityStaircase, acuityTrials, acuityCompletedThresholds } = get();
    if (!acuityStaircase) return;
    // Take the BEST (lowest logMAR = sharpest vision) across all staircase runs
    const currentThreshold = estimateAcuityThreshold(acuityStaircase);
    const allThresholds = [...acuityCompletedThresholds, currentThreshold];
    const logMAR = Math.min(...allThresholds);
    const notation = lookupAcuity(logMAR);
    get().recordTestResult({
      testId: 'acuity',
      logMAR,
      snellen: notation.snellen20,
      acuityCategory: notation.whoCategory,
      snellenDecimal: notation.decimal,
      etdrsLetters: Math.max(0, Math.round(85 - 50 * logMAR)),
      trials: acuityTrials,
      completedAt: Date.now(),
    });
  },

  // ── Color actions ──────────────────────────────────────────────────────────

  startColorTest: () => set({ colorPlateIndex: 0, colorTrials: [] }),

  recordColorTrial: (trial) => {
    const { colorTrials } = get();
    set({ colorPlateIndex: get().colorPlateIndex + 1, colorTrials: [...colorTrials, trial] });
  },

  finaliseColor: () => {
    const { colorTrials } = get();
    const { category, score } = classifyColorVision(colorTrials);
    const ishihara = scoreIshihara(colorTrials);
    get().recordTestResult({ testId: 'color', category, score, cvdType: ishihara.cvdType, trials: colorTrials, completedAt: Date.now() });
  },

  // ── Astigmatism actions ────────────────────────────────────────────────────

  startAstigmatismTest: () => set({ astigmatismTrials: [], astigmatismRound: 0 }),

  recordAstigmatismTrial: (trial) => {
    const { astigmatismTrials, astigmatismRound } = get();
    set({ astigmatismTrials: [...astigmatismTrials, trial], astigmatismRound: astigmatismRound + 1 });
  },

  finaliseAstigmatism: () => {
    const { astigmatismTrials } = get();
    const { detectedAxis, severity } = classifyAstigmatism(astigmatismTrials.map((t) => t.selectedAxis));
    const clinical = classifyAstigmatismClinical(detectedAxis, severity);
    get().recordTestResult({
      testId: 'astigmatism',
      detectedAxis,
      severity,
      axisRule: clinical.type,
      cylinderNotation: clinical.cylinderNotation,
      trials: astigmatismTrials,
      completedAt: Date.now(),
    });
  },

  // ── Contrast actions ───────────────────────────────────────────────────────

  startContrastTest: () => set({
    contrastSfIndex: 0,
    contrastStaircases: CS_SPATIAL_FREQS.map((sf) => initContrastStaircase(sf)),
    contrastTrials: [],
  }),

  recordContrastTrial: (trial) => {
    const { contrastStaircases, contrastSfIndex, contrastTrials } = get();
    const next = [...contrastStaircases];
    next[contrastSfIndex] = stepContrastStaircase(next[contrastSfIndex], trial.response === 'seen');
    set({ contrastStaircases: next, contrastTrials: [...contrastTrials, trial] });
  },

  advanceContrastSf: () => {
    const { contrastSfIndex, contrastStaircases, contrastTrials } = get();
    const nextIdx = contrastSfIndex + 1;
    if (nextIdx >= CS_SPATIAL_FREQS.length) {
      const curve = contrastStaircases.map((s, i) => ({
        sf: CS_SPATIAL_FREQS[i],
        threshold: estimateContrastThreshold(s),
      }));
      const pr = buildPelliRobsonResult(curve);
      get().recordTestResult({ testId: 'contrast', curve, pelliRobsonLogCS: pr.pelliRobsonEquivalent, contrastGrade: pr.grade, trials: contrastTrials, completedAt: Date.now() });
    } else {
      set({ contrastSfIndex: nextIdx });
    }
  },

  // ── Behavioral signal actions ────────────────────────────────────────────

  recordEyeSwitch: (event) => {
    const { eyeSwitchEvents } = get();
    set({ eyeSwitchEvents: [...eyeSwitchEvents, event] });
  },

  computeBehavioralReport: () => {
    const { session, eyeSwitchEvents, acuityTrials, colorTrials, astigmatismTrials, contrastTrials } = get();
    if (!session) return;
    const report = generateBehavioralReport(
      session,
      eyeSwitchEvents,
      { acuity: acuityTrials, color: colorTrials, astigmatism: astigmatismTrials, contrast: contrastTrials },
    );
    set({ behavioralReport: report });
  },

  // ── Full reset ──────────────────────────────────────────────────────────

  resetBattery: () => set({
    selectedTests: [...ALL_TEST_IDS],
    testStatus: defaultTestStatus(),
    session: null,
    acuityStaircase: null,
    acuityTrials: [],
    colorPlateIndex: 0,
    colorTrials: [],
    astigmatismTrials: [],
    astigmatismRound: 0,
    contrastSfIndex: 0,
    contrastStaircases: CS_SPATIAL_FREQS.map((sf) => initContrastStaircase(sf)),
    contrastTrials: [],
    eyeSwitchEvents: [],
    behavioralReport: null,
  }),
}));

