/**
 * Hearing Store — Zustand state for PTA hearing assessment
 *
 * Manages:
 *   - Calibration wizard progress
 *   - Audio device profile (headphone type, max dBSPL)
 *   - Background noise analysis results
 *   - PTA staircase per frequency (right ear, then left ear)
 *   - Finalised hearing session
 *
 * Tone playback and recording are handled in screen components
 * using expo-av; this store holds the test data only.
 */

import { create } from 'zustand';
import {
  initPTAStaircase,
  initAdaptivePTAStaircase,
  stepPTAStaircase,
  estimateThreshold,
  computePTA,
  classifyWHO,
  detectAudiogramShape,
  START_DBHL,
} from 'services/pta-engine';
import {
  DEFAULT_DEVICE_MAX_DBSPL,
} from 'services/audio-calibration-engine';
import {
  getSINLevels,
  buildSINResult,
} from 'services/speech-in-noise-engine';
import {
  initHFStaircase,
  stepHFStaircase,
  estimateHFThreshold,
  buildHFResult,
} from 'services/hf-audiometry-engine';
import { buildBehavioralReport } from 'services/behavioral-analysis-engine';
import type {
  PTAFrequency,
  PTATrial,
  PTAStaircase,
  HearingCalibrationStep,
  HeadphoneStatus,
  AudioDeviceProfile,
  NoiseAnalysis,
  TestEar,
  EarResult,
  FrequencyThreshold,
  HearingSession,
  SNRLevel,
  SINTrial,
  SINResult,
  HFFrequency,
  HFStaircase,
  HFResult,
  BehavioralReport,
} from 'types/hearing-types';
import { PTA_FREQUENCIES, SIN_SNR_LEVELS, HF_FREQUENCIES } from 'types/hearing-types';

// ─── State shape ──────────────────────────────────────────────────────────────

interface HearingState {
  // ── Calibration ─────────────────────────────────────────────────────────────
  calibrationStep: HearingCalibrationStep;
  isCalibrationComplete: boolean;

  deviceProfile: AudioDeviceProfile;
  noiseAnalysis: NoiseAnalysis | null;

  /** Whether the test should pause because noise level went too high */
  noisePauseActive: boolean;

  // ── PTA test runtime ─────────────────────────────────────────────────────────
  /** Which ear is currently being tested */
  activeEar: TestEar;
  /** Index into PTA_FREQUENCIES array */
  freqIndex: number;
  /** Staircase per frequency for the active ear */
  staircases: Record<PTAFrequency, PTAStaircase>;

  // ── Noise monitor (live) ─────────────────────────────────────────────────────
  /** Rolling metering values during the test (last N from Recording) */
  liveMeteringSamples: number[];

  // ── Session ──────────────────────────────────────────────────────────────────
  session: HearingSession | null;

  // ── Speech-in-Noise test ──────────────────────────────────────────────────────
  /** Current SNR level index (0 = +20 dB, 5 = -5 dB) */
  sinLevelIndex: number;
  /** Trials recorded so far */
  sinTrials: SINTrial[];
  /** Finalised SIN result (null until test complete) */
  sinResult: SINResult | null;

  // ── High-Frequency test ───────────────────────────────────────────────────────
  /** Index into HF_FREQUENCIES array */
  hfFreqIndex: number;
  /** Staircase per HF frequency */
  hfStaircases: Record<HFFrequency, HFStaircase>;
  /** Finalised HF result (null until test complete) */
  hfResult: HFResult | null;

  // ── Actions ──────────────────────────────────────────────────────────────────

  // Calibration wizard
  setCalibrationStep: (step: HearingCalibrationStep) => void;
  setHeadphoneStatus: (status: HeadphoneStatus) => void;
  setDeviceMaxDbSPL: (dbSPL: number) => void;
  validateHeadphones: () => void;
  setNoiseAnalysis: (analysis: NoiseAnalysis) => void;
  completeCalibration: () => void;
  resetCalibration: () => void;

  // Noise monitor
  appendMeteringSample: (dbFS: number) => void;
  evaluateNoisePause: () => void;

  // PTA test
  startSession: () => void;
  startEarTest: (ear: TestEar) => void;
  recordTrial: (heard: boolean, reactionMs: number) => void;
  finaliseCurrentFreq: () => void;
  finaliseEar: () => void;

  // SIN test
  startSINTest: () => void;
  recordSINTrial: (heard: boolean, reactionMs: number) => void;
  advanceSINLevel: () => void;
  finaliseSIN: () => void;

  // HF test
  startHFTest: () => void;
  recordHFTrial: (heard: boolean, reactionMs: number) => void;
  finaliseHFFreq: () => void;
  finaliseHF: () => void;

  // Full reset
  resetAll: () => void;
}

// ─── Default staircases ───────────────────────────────────────────────────────

function defaultHFStaircases(): Record<HFFrequency, HFStaircase> {
  return {
    9000:  initHFStaircase(9000),
    10000: initHFStaircase(10000),
    12000: initHFStaircase(12000),
  } as Record<HFFrequency, HFStaircase>;
}

function defaultStaircases(): Record<PTAFrequency, PTAStaircase> {
  return {
    250:  initPTAStaircase(250),
    500:  initPTAStaircase(500),
    1000: initPTAStaircase(1000),
    2000: initPTAStaircase(2000),
    4000: initPTAStaircase(4000),
    8000: initPTAStaircase(8000),
  };
}

// ─── Metering window ──────────────────────────────────────────────────────────

const METERING_WINDOW = 20; // samples (~400 ms at 50 ms polling)
const NOISE_PAUSE_THRESHOLD_DBFS = -30; // above this average → pause

// ─── Store ────────────────────────────────────────────────────────────────────

export const useHearingStore = create<HearingState>((set, get) => ({
  // ── Calibration initial state ─────────────────────────────────────────────
  calibrationStep: 'headphone',
  isCalibrationComplete: false,
  deviceProfile: {
    estimatedMaxDbSPL: DEFAULT_DEVICE_MAX_DBSPL,
    headphoneStatus: 'unknown',
    headphoneValidated: false,
    recommendedVolumeLevel: 0.7,
  },
  noiseAnalysis: null,
  noisePauseActive: false,

  // ── PTA runtime initial state ─────────────────────────────────────────────
  activeEar: 'right',
  freqIndex: 0,
  staircases: defaultStaircases(),
  liveMeteringSamples: [],
  session: null,

  // ── SIN initial state ─────────────────────────────────────────────────────
  sinLevelIndex: 0,
  sinTrials: [],
  sinResult: null,

  // ── HF initial state ──────────────────────────────────────────────────────
  hfFreqIndex: 0,
  hfStaircases: defaultHFStaircases(),
  hfResult: null,

  // ── Calibration actions ───────────────────────────────────────────────────

  setCalibrationStep: (step) => set({ calibrationStep: step }),

  setHeadphoneStatus: (status) =>
    set((s) => ({
      deviceProfile: { ...s.deviceProfile, headphoneStatus: status },
    })),

  setDeviceMaxDbSPL: (dbSPL) =>
    set((s) => ({
      deviceProfile: { ...s.deviceProfile, estimatedMaxDbSPL: dbSPL },
    })),

  validateHeadphones: () =>
    set((s) => ({
      deviceProfile: { ...s.deviceProfile, headphoneValidated: true },
    })),

  setNoiseAnalysis: (analysis) => set({ noiseAnalysis: analysis }),

  completeCalibration: () => set({ calibrationStep: 'ready', isCalibrationComplete: true }),

  resetCalibration: () =>
    set({
      calibrationStep: 'headphone',
      isCalibrationComplete: false,
      deviceProfile: {
        estimatedMaxDbSPL: DEFAULT_DEVICE_MAX_DBSPL,
        headphoneStatus: 'unknown',
        headphoneValidated: false,
        recommendedVolumeLevel: 0.7,
      },
      noiseAnalysis: null,
      noisePauseActive: false,
    }),

  // ── Noise monitor ─────────────────────────────────────────────────────────

  appendMeteringSample: (dbFS) => {
    const { liveMeteringSamples } = get();
    const updated = [...liveMeteringSamples.slice(-(METERING_WINDOW - 1)), dbFS];
    set({ liveMeteringSamples: updated });
  },

  evaluateNoisePause: () => {
    const { liveMeteringSamples } = get();
    if (liveMeteringSamples.length < 5) return;
    const avg = liveMeteringSamples.reduce((s, v) => s + v, 0) / liveMeteringSamples.length;
    set({ noisePauseActive: avg > NOISE_PAUSE_THRESHOLD_DBFS });
  },

  // ── PTA test actions ──────────────────────────────────────────────────────

  startSession: () => {
    const { deviceProfile, noiseAnalysis } = get();
    set({
      session: {
        id: Date.now().toString(),
        startedAt: Date.now(),
        completedAt: null,
        deviceProfile,
        noiseAnalysis,
        rightEar: null,
        leftEar: null,
      },
      activeEar: 'right',
      freqIndex: 0,
      staircases: defaultStaircases(),
      liveMeteringSamples: [],
    });
  },

  startEarTest: (ear) => {
    set({
      activeEar: ear,
      freqIndex: 0,
      staircases: defaultStaircases(),
    });
  },

  /**
   * Called by the PTA screen when the user presses "Heard" or "Not heard".
   * Advances the staircase for the current frequency.
   */
  recordTrial: (heard, reactionMs) => {
    const { staircases, freqIndex } = get();
    const freq = PTA_FREQUENCIES[freqIndex];
    const current = staircases[freq];
    const updated = stepPTAStaircase(current, heard, reactionMs);
    set({
      staircases: { ...staircases, [freq]: updated },
    });
  },

  /**
   * Called when frequency staircase is done (or force-advanced).
   * Seeds the next frequency's staircase with an adaptive starting level
   * derived from the current frequency's threshold estimate, shortening
   * the sweep by starting near the expected threshold.
   */
  finaliseCurrentFreq: () => {
    const { freqIndex, staircases } = get();
    const nextIdx = freqIndex + 1;
    if (nextIdx < PTA_FREQUENCIES.length) {
      // Estimate threshold for the just-completed frequency
      const currentFreq   = PTA_FREQUENCIES[freqIndex];
      const priorThreshold = estimateThreshold(staircases[currentFreq]);

      // Seed the next frequency adaptively
      const nextFreq = PTA_FREQUENCIES[nextIdx];
      const adaptiveStaircase = initAdaptivePTAStaircase(nextFreq, priorThreshold);

      set({
        freqIndex: nextIdx,
        staircases: { ...staircases, [nextFreq]: adaptiveStaircase },
      });
    } else {
      // All frequencies done — finalise ear
      get().finaliseEar();
    }
  },

  /**
   * Computes the EarResult from the finished staircases and stores it on the session.
   */
  finaliseEar: () => {
    const { staircases, activeEar, session } = get();
    if (!session) return;

    const thresholds: FrequencyThreshold[] = PTA_FREQUENCIES.map((freq) => ({
      frequency: freq,
      dbHL: estimateThreshold(staircases[freq]),
      trialCount: staircases[freq].trials.length,
    }));

    const { pta3 } = computePTA(thresholds);
    const who = classifyWHO(pta3);
    const shape = detectAudiogramShape(thresholds);

    const behavioralReport: BehavioralReport = buildBehavioralReport(staircases);

    const earResult: EarResult = {
      ear: activeEar,
      thresholds,
      who,
      audiogramShape: shape,
      behavioralReport,
      completedAt: Date.now(),
    };

    const updatedSession: HearingSession = {
      ...session,
      [activeEar === 'right' ? 'rightEar' : 'leftEar']: earResult,
    };

    // If both ears done → mark session complete
    const bothDone =
      (activeEar === 'right' && updatedSession.leftEar !== null) ||
      (activeEar === 'left'  && updatedSession.rightEar !== null);

    set({
      session: {
        ...updatedSession,
        completedAt: bothDone ? Date.now() : null,
      },
    });
  },

  // ── SIN test actions ─────────────────────────────────────────────────────

  startSINTest: () =>
    set({
      sinLevelIndex: 0,
      sinTrials: [],
      sinResult: null,
    }),

  recordSINTrial: (heard, reactionMs) => {
    const { sinTrials, sinLevelIndex } = get();
    const levels = getSINLevels();
    const snrDB  = levels[sinLevelIndex];
    const newTrial: SINTrial = {
      snrDB,
      frequency: 1000,
      heard,
      reactionMs,
    };
    set({ sinTrials: [...sinTrials, newTrial] });
  },

  advanceSINLevel: () => {
    const { sinLevelIndex } = get();
    const levels = getSINLevels();
    const nextIdx = sinLevelIndex + 1;
    if (nextIdx < levels.length) {
      set({ sinLevelIndex: nextIdx });
    } else {
      get().finaliseSIN();
    }
  },

  finaliseSIN: () => {
    const { sinTrials } = get();
    const result = buildSINResult(sinTrials);
    set({ sinResult: result });
  },

  // ── HF test actions ───────────────────────────────────────────────────────

  startHFTest: () =>
    set({
      hfFreqIndex: 0,
      hfStaircases: defaultHFStaircases(),
      hfResult: null,
    }),

  recordHFTrial: (heard, reactionMs) => {
    const { hfStaircases, hfFreqIndex } = get();
    const freq    = HF_FREQUENCIES[hfFreqIndex];
    const current = hfStaircases[freq];
    const updated = stepHFStaircase(current, heard, reactionMs);
    set({ hfStaircases: { ...hfStaircases, [freq]: updated } });
  },

  finaliseHFFreq: () => {
    const { hfFreqIndex, hfStaircases } = get();
    const nextIdx = hfFreqIndex + 1;
    if (nextIdx < HF_FREQUENCIES.length) {
      const currentFreq    = HF_FREQUENCIES[hfFreqIndex];
      const priorThreshold = estimateHFThreshold(hfStaircases[currentFreq]);
      const nextFreq       = HF_FREQUENCIES[nextIdx];
      const adaptiveStart  = initHFStaircase(nextFreq, priorThreshold);
      set({
        hfFreqIndex: nextIdx,
        hfStaircases: { ...hfStaircases, [nextFreq]: adaptiveStart },
      });
    } else {
      get().finaliseHF();
    }
  },

  finaliseHF: () => {
    const { hfStaircases, session } = get();
    // Pass 4 kHz PTA threshold if session data is available
    const threshold4k = session?.rightEar?.thresholds.find(t => t.frequency === 4000)?.dbHL
      ?? session?.leftEar?.thresholds.find(t => t.frequency === 4000)?.dbHL;
    const result = buildHFResult(
      hfStaircases,
      threshold4k,
    );
    set({ hfResult: result });
  },

  // ── Full reset ────────────────────────────────────────────────────────────

  resetAll: () =>
    set({
      calibrationStep: 'headphone',
      isCalibrationComplete: false,
      deviceProfile: {
        estimatedMaxDbSPL: DEFAULT_DEVICE_MAX_DBSPL,
        headphoneStatus: 'unknown',
        headphoneValidated: false,
        recommendedVolumeLevel: 0.7,
      },
      noiseAnalysis: null,
      noisePauseActive: false,
      activeEar: 'right',
      freqIndex: 0,
      staircases: defaultStaircases(),
      liveMeteringSamples: [],
      session: null,
      sinLevelIndex: 0,
      sinTrials: [],
      sinResult: null,
      hfFreqIndex: 0,
      hfStaircases: defaultHFStaircases(),
      hfResult: null,
    }),
}));
