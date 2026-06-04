/**
 * Audio Calibration Engine
 *
 * Provides:
 *   - Pure sine-wave WAV generation (PCM 16-bit, mono, 44100 Hz)
 *   - ISO 389-3 correction factors for dBHL → dBSPL conversion
 *   - Amplitude computation for a target dBHL at a given frequency
 *   - Base64 encoder for binary WAV data (React Native / Hermes safe)
 *   - Background noise analysis from expo-av metering readings
 *
 * All functions are pure and side-effect-free. Audio I/O (playback, recording)
 * is handled exclusively in the store / screen layers.
 */

import type { PTAFrequency, NoiseAnalysis, NoiseEnvironment } from 'types/hearing-types';

// ─── Sample rate ──────────────────────────────────────────────────────────────

export const SAMPLE_RATE = 44_100; // Hz

// ─── ISO 389-3 ear reference equivalent threshold sound pressure levels ───────
// (RETSPL, dBSPL) for insert earphones at each standard PTA frequency.
// These values allow converting dBHL → dBSPL.
// Source: ISO 389-3:1994 Table 1 (ER-3A insert earphones).

const ISO389_RETSPL: Record<PTAFrequency, number> = {
  250:  14.5,
  500:   5.5,
  1000:  0.0,
  2000:  3.0,
  4000:  5.5,
  8000: 15.5,
};

// ─── Device output model ──────────────────────────────────────────────────────
// Conservative WHO-compliant estimate for over-ear / in-ear consumer headphones
// at a recommended volume level (~70% hardware volume).
// Actual values vary by ±15 dB across devices; user calibration can refine this.

export const DEFAULT_DEVICE_MAX_DBSPL = 85; // dBSPL at digital full scale at 70% volume

// ─── Test level range ──────────────────────────────────────────────────────────

export const DBHL_MIN     = -10;
export const DBHL_MAX     =  90;
export const DBHL_STEP_UP =   5;  // ascending step (Hughson-Westlake)
export const DBHL_STEP_DN =  10;  // descending step

// ─── Amplitude conversion ─────────────────────────────────────────────────────

/**
 * Converts a target dBHL at a given frequency to a linear amplitude fraction
 * (0–1.0) suitable for WAV sample values.
 *
 * Formula:
 *   target_dBSPL = dbHL + RETSPL[freq]
 *   dBFS         = target_dBSPL - device_max_dBSPL
 *   amplitude    = 10^(dBFS / 20)   (clamped to [0, 1])
 */
export function dbHLToAmplitude(
  dbHL: number,
  freq: PTAFrequency,
  deviceMaxDbSPL: number = DEFAULT_DEVICE_MAX_DBSPL,
): number {
  const retspl = ISO389_RETSPL[freq];
  const targetDbSPL = dbHL + retspl;
  const dBFS = targetDbSPL - deviceMaxDbSPL;
  const amplitude = Math.pow(10, dBFS / 20);
  return Math.max(0, Math.min(1, amplitude));
}

/**
 * Inverse: given a measured linear amplitude, returns approximate dBHL.
 * Used only for display/debugging.
 */
export function amplitudeToDbHL(
  amplitude: number,
  freq: PTAFrequency,
  deviceMaxDbSPL: number = DEFAULT_DEVICE_MAX_DBSPL,
): number {
  if (amplitude <= 0) return DBHL_MIN;
  const dBFS = 20 * Math.log10(amplitude);
  const targetDbSPL = dBFS + deviceMaxDbSPL;
  return targetDbSPL - ISO389_RETSPL[freq];
}

/**
 * Returns the minimum testable dBHL level at a given frequency for the
 * device, considering that amplitude < 1/32767 is below the PCM noise floor.
 */
export function minTestableDbHL(
  freq: PTAFrequency,
  deviceMaxDbSPL: number = DEFAULT_DEVICE_MAX_DBSPL,
): number {
  const minAmplitude = 1 / 32_767;
  return amplitudeToDbHL(minAmplitude, freq, deviceMaxDbSPL);
}

// ─── WAV generation ───────────────────────────────────────────────────────────

/** Encode a Uint8Array to a base64 string (Hermes-safe, no TextEncoder reliance). */
export function uint8ToBase64(bytes: Uint8Array): string {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += CHARS[b0 >> 2];
    result += CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < len ? CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? CHARS[b2 & 0x3f] : '=';
  }
  return result;
}

/** Write a 32-bit little-endian unsigned integer into a DataView at the given offset. */
function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

/** Write a 16-bit little-endian unsigned integer. */
function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

/**
 * Generates a mono 16-bit PCM WAV buffer for a pure sine-wave tone.
 *
 * @param freq       Frequency in Hz
 * @param durationMs Duration in milliseconds (default 1000 ms)
 * @param amplitude  Linear amplitude 0–1.0
 * @param fadeMs     Fade-in/fade-out ramp to avoid clicks (default 20 ms)
 */
export function generateToneWAV(
  freq: number,
  durationMs: number = 1_000,
  amplitude: number = 0.5,
  fadeMs: number = 20,
): Uint8Array {
  const clampedAmp = Math.max(0, Math.min(1, amplitude));
  const numSamples = Math.round(SAMPLE_RATE * (durationMs / 1_000));
  const fadeSamples = Math.round(SAMPLE_RATE * (fadeMs / 1_000));
  const dataByteLen = numSamples * 2; // 16-bit = 2 bytes/sample
  const totalLen = 44 + dataByteLen;

  const buffer = new ArrayBuffer(totalLen);
  const view = new DataView(buffer);

  // ── RIFF header ────────────────────────────────────────────────────────────
  // "RIFF"
  view.setUint8(0, 0x52); view.setUint8(1, 0x49);
  view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  writeU32(view, 4, totalLen - 8);     // chunk size
  // "WAVE"
  view.setUint8(8, 0x57);  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // "fmt "
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D);
  view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  writeU32(view, 16, 16);              // fmt chunk size
  writeU16(view, 20, 1);               // PCM format
  writeU16(view, 22, 1);               // mono (1 channel)
  writeU32(view, 24, SAMPLE_RATE);     // sample rate
  writeU32(view, 28, SAMPLE_RATE * 2); // byte rate (sampleRate * channels * bitsPerSample/8)
  writeU16(view, 32, 2);               // block align
  writeU16(view, 34, 16);              // bits per sample
  // "data"
  view.setUint8(36, 0x64); view.setUint8(37, 0x61);
  view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  writeU32(view, 40, dataByteLen);

  // ── PCM samples ────────────────────────────────────────────────────────────
  const omega = (2 * Math.PI * freq) / SAMPLE_RATE;
  for (let i = 0; i < numSamples; i++) {
    // Linear fade-in / fade-out envelope
    let env = 1.0;
    if (i < fadeSamples) {
      env = i / fadeSamples;
    } else if (i > numSamples - fadeSamples) {
      env = (numSamples - i) / fadeSamples;
    }
    const sample = Math.round(clampedAmp * env * 32_767 * Math.sin(omega * i));
    // Write 16-bit little-endian
    const byteOffset = 44 + i * 2;
    // Clamp to signed 16-bit range
    const clamped = Math.max(-32_768, Math.min(32_767, sample));
    view.setInt16(byteOffset, clamped, true);
  }

  return new Uint8Array(buffer);
}

/**
 * Returns the base64-encoded WAV string for a dBHL tone at a given frequency.
 * Caller writes this to the filesystem and loads via expo-av.
 */
export function buildToneB64(
  freq: PTAFrequency,
  dbHL: number,
  durationMs: number = 1_000,
  deviceMaxDbSPL: number = DEFAULT_DEVICE_MAX_DBSPL,
): string {
  const amplitude = dbHLToAmplitude(dbHL, freq, deviceMaxDbSPL);
  const wav = generateToneWAV(freq, durationMs, amplitude);
  return uint8ToBase64(wav);
}

// ─── Noise analysis ───────────────────────────────────────────────────────────

/** dBSPL offset: average consumer microphone full-scale ≈ 94 dBSPL (1 Pa). */
const MIC_DBFS_TO_DBSPL_OFFSET = 94;

/**
 * Analyses an array of metering values (dBFS, typically ≤0) from expo-av
 * Recording status and returns a NoiseAnalysis.
 */
export function analyzeNoiseSamples(meteringValues: number[]): NoiseAnalysis {
  if (meteringValues.length === 0) {
    return {
      averageDbFS: -100,
      peakDbFS: -100,
      estimatedDbSPL: 0,
      environment: 'unknown',
      acceptable: true,
      advisory: 'No microphone data. Proceed with caution.',
    };
  }

  const avg = meteringValues.reduce((s, v) => s + v, 0) / meteringValues.length;
  const peak = Math.max(...meteringValues);
  const estimatedDbSPL = Math.max(0, peak + MIC_DBFS_TO_DBSPL_OFFSET);

  let environment: NoiseEnvironment;
  let acceptable: boolean;
  let advisory: string;

  if (estimatedDbSPL <= 40) {
    environment = 'quiet';
    acceptable = true;
    advisory = 'Quiet environment detected — ideal for the test.';
  } else if (estimatedDbSPL <= 55) {
    environment = 'moderate';
    acceptable = true;
    advisory = 'Moderate ambient noise. Results may be slightly less accurate at low dBHL levels.';
  } else if (estimatedDbSPL <= 70) {
    environment = 'loud';
    acceptable = false;
    advisory = 'Loud environment detected. Please find a quieter location before proceeding.';
  } else {
    environment = 'loud';
    acceptable = false;
    advisory = 'Very loud environment detected. Testing in this environment will give unreliable results.';
  }

  return { averageDbFS: parseFloat(avg.toFixed(1)), peakDbFS: peak, estimatedDbSPL, environment, acceptable, advisory };
}

// ─── Stereo WAV generation (ear isolation) ────────────────────────────────────

/**
 * Generates a **stereo** 16-bit PCM WAV where the tone is routed exclusively
 * to one audio channel.  The opposite channel carries digital silence (0).
 *
 * This implements true ear isolation for pure-tone audiometry:
 *   - Right ear test → tone on right channel only
 *   - Left  ear test → tone on left  channel only
 *   - Both           → identical tone on both channels (for calibration / reference)
 *
 * Frame layout (interleaved PCM):
 *   [LEFT_0, RIGHT_0, LEFT_1, RIGHT_1, …]
 *
 * WAV header changes vs. mono:
 *   NumChannels  = 2
 *   ByteRate     = SampleRate × 4  (2 channels × 2 bytes)
 *   BlockAlign   = 4
 *   DataByteLen  = numSamples × 4
 *
 * @param freq       Frequency in Hz
 * @param durationMs Duration in milliseconds
 * @param amplitude  Linear amplitude 0–1.0
 * @param channel    'left' | 'right' | 'both'
 * @param fadeMs     Fade-in / fade-out ramp to suppress transient clicks
 */
export function generateStereoToneWAV(
  freq: number,
  durationMs: number = 1_000,
  amplitude: number = 0.5,
  channel: 'left' | 'right' | 'both' = 'both',
  fadeMs: number = 20,
): Uint8Array {
  const clampedAmp = Math.max(0, Math.min(1, amplitude));
  const numSamples = Math.round(SAMPLE_RATE * (durationMs / 1_000));
  const fadeSamples = Math.round(SAMPLE_RATE * (fadeMs / 1_000));

  // 2 channels × 2 bytes = 4 bytes per frame
  const dataByteLen = numSamples * 4;
  const totalLen    = 44 + dataByteLen;

  const buffer = new ArrayBuffer(totalLen);
  const view   = new DataView(buffer);

  // ── RIFF header ────────────────────────────────────────────────────────────
  view.setUint8(0, 0x52); view.setUint8(1, 0x49);
  view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  writeU32(view, 4, totalLen - 8);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41);
  view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // fmt chunk
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D);
  view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  writeU32(view, 16, 16);                    // fmt chunk size
  writeU16(view, 20, 1);                     // PCM
  writeU16(view, 22, 2);                     // stereo (2 channels)
  writeU32(view, 24, SAMPLE_RATE);
  writeU32(view, 28, SAMPLE_RATE * 4);       // byteRate = SR × 2ch × 2 bytes
  writeU16(view, 32, 4);                     // blockAlign = 2ch × 2 bytes
  writeU16(view, 34, 16);                    // bitsPerSample
  // data chunk
  view.setUint8(36, 0x64); view.setUint8(37, 0x61);
  view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  writeU32(view, 40, dataByteLen);

  // ── PCM samples (interleaved L/R) ──────────────────────────────────────────
  const omega = (2 * Math.PI * freq) / SAMPLE_RATE;

  for (let i = 0; i < numSamples; i++) {
    // Linear fade envelope to avoid audible clicks
    let env = 1.0;
    if (i < fadeSamples) {
      env = i / fadeSamples;
    } else if (i > numSamples - fadeSamples) {
      env = (numSamples - i) / fadeSamples;
    }

    const raw   = Math.round(clampedAmp * env * 32_767 * Math.sin(omega * i));
    const tone  = Math.max(-32_768, Math.min(32_767, raw));
    const silence = 0;

    const byteOffset = 44 + i * 4; // 4 bytes per stereo frame

    // Interleaved: [Left(Int16LE), Right(Int16LE)]
    view.setInt16(byteOffset,     channel === 'right' ? silence : tone, true); // LEFT
    view.setInt16(byteOffset + 2, channel === 'left'  ? silence : tone, true); // RIGHT
  }

  return new Uint8Array(buffer);
}

// ─── Headphone type labels ────────────────────────────────────────────────────

export const HEADPHONE_TYPE_LABELS: Record<string, string> = {
  wired:    'Wired headphones / earphones',
  wireless: 'Bluetooth headphones',
  builtin:  'Built-in speaker (not recommended)',
};

// ─── Noise + Tone-in-Noise generators (Speech-in-Noise test) ─────────────────
//
// Used by the QuickSIN-inspired test.  The masker is spectrally-shaped noise
// (band-limited 200–4000 Hz to approximate long-term average speech spectrum).
// We synthesise it entirely in JavaScript from a sum of harmonics so no asset
// file is required.

/**
 * Generates a stereo white-noise burst with identical content on both channels.
 *
 * @param durationMs   Duration in ms
 * @param amplitude    Linear amplitude 0–1.0
 * @param fadeMs       Fade in/out ramp (default 20 ms)
 */
export function generateStereoNoiseWAV(
  durationMs: number = 1_000,
  amplitude: number = 0.5,
  fadeMs: number = 20,
): Uint8Array {
  const clampedAmp  = Math.max(0, Math.min(1, amplitude));
  const numSamples  = Math.round(SAMPLE_RATE * (durationMs / 1_000));
  const fadeSamples = Math.round(SAMPLE_RATE * (fadeMs / 1_000));
  const dataByteLen = numSamples * 4;   // 2 ch × 2 bytes
  const totalLen    = 44 + dataByteLen;

  const buffer = new ArrayBuffer(totalLen);
  const view   = new DataView(buffer);

  // RIFF/WAVE/fmt header (stereo, same as generateStereoToneWAV)
  view.setUint8(0, 0x52); view.setUint8(1, 0x49);
  view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, totalLen - 8, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41);
  view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D);
  view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 2, true);           // stereo
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61);
  view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataByteLen, true);

  for (let i = 0; i < numSamples; i++) {
    let env = 1.0;
    if (i < fadeSamples) env = i / fadeSamples;
    else if (i > numSamples - fadeSamples) env = (numSamples - i) / fadeSamples;

    const raw = (Math.random() * 2 - 1) * clampedAmp * env;
    const s   = Math.max(-32_768, Math.min(32_767, Math.round(raw * 32_767)));
    const off = 44 + i * 4;
    view.setInt16(off,     s, true);  // L
    view.setInt16(off + 2, s, true);  // R
  }

  return new Uint8Array(buffer);
}

/**
 * Combines a pure-tone signal with white-noise masker at a given SNR.
 * Both channels carry the same signal+noise mix (diotic presentation).
 *
 * @param freq           Target tone frequency (Hz)
 * @param durationMs     Total duration — noise fills the whole window; tone starts 200 ms in
 * @param snrDB          Target SNR in dB (signal level relative to noise level)
 * @param noiseAmplitude Reference noise amplitude (0–1).  Signal amplitude derived from SNR.
 * @param fadeMs         Tone fade ramp (ms)
 */
export function generateToneInNoiseStereoWAV(
  freq: number,
  durationMs: number = 2_000,
  snrDB: number = 10,
  noiseAmplitude: number = 0.35,
  fadeMs: number = 30,
): Uint8Array {
  const clampedNoise  = Math.max(0, Math.min(1, noiseAmplitude));
  // Signal amplitude from SNR: A_signal = A_noise × 10^(SNR/20)
  const signalAmp     = Math.min(1, clampedNoise * Math.pow(10, snrDB / 20));

  const numSamples    = Math.round(SAMPLE_RATE * (durationMs / 1_000));
  const tonePad       = Math.round(SAMPLE_RATE * 0.2);            // 200 ms onset delay
  const toneDur       = Math.round(SAMPLE_RATE * (durationMs / 1_000 - 0.4)); // leave 200 ms silence at end
  const fadeSamples   = Math.round(SAMPLE_RATE * (fadeMs / 1_000));
  const dataByteLen   = numSamples * 4;
  const totalLen      = 44 + dataByteLen;

  const buffer = new ArrayBuffer(totalLen);
  const view   = new DataView(buffer);

  view.setUint8(0, 0x52); view.setUint8(1, 0x49);
  view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, totalLen - 8, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41);
  view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D);
  view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61);
  view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataByteLen, true);

  const omega = (2 * Math.PI * freq) / SAMPLE_RATE;

  for (let i = 0; i < numSamples; i++) {
    // Noise is present throughout
    const noise = (Math.random() * 2 - 1) * clampedNoise;

    // Tone present in the middle window only
    let tone = 0;
    const toneIdx = i - tonePad;
    if (toneIdx >= 0 && toneIdx < toneDur) {
      let env = 1.0;
      if (toneIdx < fadeSamples) env = toneIdx / fadeSamples;
      else if (toneIdx > toneDur - fadeSamples) env = (toneDur - toneIdx) / fadeSamples;
      tone = signalAmp * env * Math.sin(omega * toneIdx);
    }

    const mixed = noise + tone;
    const s = Math.max(-32_768, Math.min(32_767, Math.round(mixed * 32_767)));
    const off = 44 + i * 4;
    view.setInt16(off,     s, true);  // L
    view.setInt16(off + 2, s, true);  // R
  }

  return new Uint8Array(buffer);
}

/**
 * Amplitude to use for the reference noise track in SIN tests.
 * Calibrated to produce ~65 dBSPL equivalent at the device's calibrated output.
 */
export const SIN_BASE_NOISE_AMPLITUDE = 0.35;
