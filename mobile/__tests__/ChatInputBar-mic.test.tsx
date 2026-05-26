/**
 * ChatInputBar — microphone interaction tests
 *
 * Verifies:
 *   Web  — tap-to-toggle: pressIn starts, second pressIn stops
 *   Web  — getUserMedia failure → alert (no silent fail)
 *   Web  — pressOut ignored
 *   Native — hold: pressIn starts, pressOut stops + transcribes
 *   Native — permission denied → alert
 *   Both   — correct hint text per platform
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Platform, Alert } from 'react-native';
import { ChatInputBar } from '../components/ChatInputBar';

// ─── expo-av mock (inline jest.fn to avoid hoisting TDZ issues) ───────────────

jest.mock('expo-av', () => ({
  Audio: {
    Recording: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: jest.fn().mockResolvedValue({}),
      startAsync: jest.fn().mockResolvedValue({}),
      stopAndUnloadAsync: jest.fn().mockResolvedValue({}),
      getURI: jest.fn().mockReturnValue('file:///tmp/rec.m4a'),
      setOnRecordingStatusUpdate: jest.fn(),
    })),
    RecordingOptionsPresets: { HIGH_QUALITY: { android: {}, ios: {}, web: {} } },
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setAudioModeAsync: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(() => [{ granted: false }, jest.fn()]),
}));

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('base64'),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('../services/voice-service', () => ({
  VoiceService: {
    transcribeBlob: jest.fn().mockResolvedValue('Hello world'),
    transcribeUri: jest.fn().mockResolvedValue('Hello world'),
    deleteAudio: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/ocr-service', () => ({
  OcrService: { scanImage: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

// ─── Pull mock refs AFTER jest.mock (safe from hoisting) ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Audio } = jest.requireMock('expo-av') as typeof import('expo-av');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VoiceService } = jest.requireMock('../services/voice-service') as {
  VoiceService: { transcribeBlob: jest.Mock; transcribeUri: jest.Mock };
};

// ─── Web API mocks ─────────────────────────────────────────────────────────────

type FakeMR = {
  start: jest.Mock;
  stop: jest.Mock;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  addEventListener: jest.Mock;
  stream: { getTracks: () => { stop: jest.Mock }[] };
};
const stopEventHandlers = new Map<FakeMR, () => void>();
let mediaRecorderInstance: FakeMR | null = null;

const MockMediaRecorder = jest.fn().mockImplementation(() => {
  const mr: FakeMR = {
    start: jest.fn(),
    stop: jest.fn().mockImplementation(() => {
      const h = stopEventHandlers.get(mr);
      if (h) setTimeout(h, 0);
    }),
    ondataavailable: null,
    addEventListener: jest.fn((evt: string, fn: () => void) => {
      if (evt === 'stop') stopEventHandlers.set(mr, fn);
    }),
    stream: { getTracks: () => [{ stop: jest.fn() }] },
  };
  mediaRecorderInstance = mr;
  return mr;
});
(MockMediaRecorder as unknown as { isTypeSupported: jest.Mock }).isTypeSupported = jest
  .fn()
  .mockReturnValue(true);

(global as Record<string, unknown>).MediaRecorder = MockMediaRecorder;
(global as Record<string, unknown>).AudioContext = jest.fn().mockImplementation(() => ({
  createMediaStreamSource: jest.fn().mockReturnValue({ connect: jest.fn() }),
  createAnalyser: jest.fn().mockReturnValue({
    fftSize: 0, frequencyBinCount: 1, getByteFrequencyData: jest.fn(),
  }),
  close: jest.fn().mockResolvedValue(undefined),
}));

const mockGetUserMedia = jest.fn().mockResolvedValue({
  getTracks: () => [{ stop: jest.fn() }],
});
Object.defineProperty(global, 'navigator', {
  value: {
    mediaDevices: { getUserMedia: mockGetUserMedia },
    permissions: { query: jest.fn().mockResolvedValue({ state: 'granted' }) },
  },
  writable: true,
});

jest.spyOn(Alert, 'alert');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pressIn(getByTestId: ReturnType<typeof render>['getByTestId']) {
  await act(async () => {
    fireEvent(getByTestId('mic-button'), 'pressIn');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  stopEventHandlers.clear();
  mediaRecorderInstance = null;
  mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
  // Re-stub Audio mocks cleared by clearAllMocks
  (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Audio.setAudioModeAsync as jest.Mock).mockResolvedValue({});
  (Audio.Recording as jest.Mock).mockImplementation(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue({}),
    startAsync: jest.fn().mockResolvedValue({}),
    stopAndUnloadAsync: jest.fn().mockResolvedValue({}),
    getURI: jest.fn().mockReturnValue('file:///tmp/rec.m4a'),
    setOnRecordingStatusUpdate: jest.fn(),
  }));
  VoiceService.transcribeBlob.mockResolvedValue('Hello world');
  VoiceService.transcribeUri.mockResolvedValue('Hello world');
});

afterEach(() => { jest.useRealTimers(); });

// ── Web ───────────────────────────────────────────────────────────────────────

describe('Web: tap-to-toggle recording', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true });
  });

  it('START: pressIn calls getUserMedia and starts MediaRecorder', async () => {
    const { getByTestId } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(MockMediaRecorder).toHaveBeenCalled();
    expect(mediaRecorderInstance?.start).toHaveBeenCalled();
  });

  it('STATUS: shows "tap mic to stop" while recording', async () => {
    const { getByTestId, queryByText } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    await waitFor(() => {
      expect(queryByText(/tap mic to stop/i)).toBeTruthy();
    });
  });

  it('STOP: second pressIn calls transcribeBlob', async () => {
    // Must be > 1000 bytes to pass the size guard in stopAndTranscribe
    const largeAudioBlob = new Blob([new Uint8Array(1500)], { type: 'audio/webm' });
    MockMediaRecorder.mockImplementationOnce(() => {
      const mr: FakeMR = {
        start: jest.fn().mockImplementation(() => {
          // fire ondataavailable synchronously so no timer needed
          setTimeout(() => {
            mr.ondataavailable?.({ data: largeAudioBlob });
          }, 10);
        }),
        stop: jest.fn().mockImplementation(() => {
          const h = stopEventHandlers.get(mr);
          if (h) setTimeout(h, 0);
        }),
        ondataavailable: null,
        addEventListener: jest.fn((evt: string, fn: () => void) => {
          if (evt === 'stop') stopEventHandlers.set(mr, fn);
        }),
        stream: { getTracks: () => [{ stop: jest.fn() }] },
      };
      mediaRecorderInstance = mr;
      return mr;
    });

    const { getByTestId } = render(<ChatInputBar />);

    // First tap — start
    await pressIn(getByTestId);

    // Pass MIN_RECORD_MS (advance only non-repeating timers to avoid wave animation loop)
    await act(async () => {
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });

    // Second tap — stop
    await act(async () => {
      fireEvent(getByTestId('mic-button'), 'pressIn');
      await Promise.resolve(); await Promise.resolve();
      // Fire the setTimeout(h, 0) that delivers the 'stop' event
      jest.runOnlyPendingTimers();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      // Drain any remaining promise microtasks (transcribeBlob chain)
      jest.runOnlyPendingTimers();
      await Promise.resolve(); await Promise.resolve();
    });

    expect(VoiceService.transcribeBlob).toHaveBeenCalled();
  });

  it('IGNORE RELEASE: pressOut does NOT stop recording', async () => {
    const { getByTestId, queryByText } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    await act(async () => {
      fireEvent(getByTestId('mic-button'), 'pressOut');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(queryByText(/tap mic to stop/i)).toBeTruthy();
    });
  });

  it('ERROR: alert when getUserMedia fails', async () => {
    // mockRejectedValue (not Once) so the mount pre-warm AND pressIn both fail
    mockGetUserMedia.mockRejectedValue(new Error('NotAllowedError'));
    const { getByTestId } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone Unavailable',
      expect.stringContaining('microphone'),
      expect.anything(),
    );
  });

  it('HINT: shows "Tap mic to record" on web', async () => {
    const { queryByText } = render(<ChatInputBar />);
    expect(queryByText(/Tap mic to record/i)).toBeTruthy();
  });

  it('CAMERA: first press opens scanner after permission grant', async () => {
    const permissionsQuery = jest.fn().mockResolvedValue({ state: 'prompt' });
    Object.defineProperty(global, 'navigator', {
      value: {
        mediaDevices: { getUserMedia: mockGetUserMedia },
        permissions: { query: permissionsQuery },
      },
      writable: true,
    });

    const { getByTestId, queryByText } = render(<ChatInputBar />);

    await act(async () => {
      fireEvent.press(getByTestId('camera-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(permissionsQuery).toHaveBeenCalledWith({ name: 'camera' });
    expect(mockGetUserMedia).toHaveBeenCalledWith({ video: true });
    await waitFor(() => {
      expect(queryByText(/Scan Medical Document/i)).toBeTruthy();
    });
  });

  it('CAMERA: alert when camera permission is denied', async () => {
    const permissionsQuery = jest.fn().mockResolvedValue({ state: 'prompt' });
    mockGetUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    Object.defineProperty(global, 'navigator', {
      value: {
        mediaDevices: { getUserMedia: mockGetUserMedia },
        permissions: { query: permissionsQuery },
      },
      writable: true,
    });

    const { getByTestId } = render(<ChatInputBar />);

    await act(async () => {
      fireEvent.press(getByTestId('camera-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Camera Access Required',
      expect.stringContaining('camera access'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'How to Enable' }),
      ]),
    );
  });
});

// ── Native ────────────────────────────────────────────────────────────────────

describe('Native: hold-to-record', () => {
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  it('pressIn requests permission and starts recording', async () => {
    const { getByTestId } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    expect(Audio.requestPermissionsAsync).toHaveBeenCalled();
    // Audio.Recording().startAsync is called inside startRecordingNative
    const recInstance = (Audio.Recording as jest.Mock).mock.results[0]?.value;
    expect(recInstance?.startAsync).toHaveBeenCalled();
  });

  it('STATUS: shows "release to send" while recording', async () => {
    const { getByTestId, queryByText } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    await waitFor(() => {
      expect(queryByText(/release to send/i)).toBeTruthy();
    });
  });

  it('pressOut stops and calls transcribeUri', async () => {
    const { getByTestId } = render(<ChatInputBar />);

    await pressIn(getByTestId);
    await act(async () => { jest.advanceTimersByTime(500); });

    await act(async () => {
      fireEvent(getByTestId('mic-button'), 'pressOut');
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const recInstance = (Audio.Recording as jest.Mock).mock.results[0]?.value;
    expect(recInstance?.stopAndUnloadAsync).toHaveBeenCalled();
    await waitFor(() => {
      expect(VoiceService.transcribeUri).toHaveBeenCalled();
    });
  });

  it('ERROR: alert when mic permission denied', async () => {
    (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    const { getByTestId } = render(<ChatInputBar />);
    await pressIn(getByTestId);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone Unavailable',
      expect.stringContaining('microphone'),
      expect.anything(),
    );
  });

  it('HINT: shows "Hold mic to record" on native', async () => {
    const { queryByText } = render(<ChatInputBar />);
    expect(queryByText(/Hold mic to record/i)).toBeTruthy();
  });
});
