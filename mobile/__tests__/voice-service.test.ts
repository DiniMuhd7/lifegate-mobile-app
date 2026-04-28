/**
 * Unit tests for VoiceService (web path)
 *
 * Covers:
 *  - transcribeBlob: happy path returns trimmed text
 *  - transcribeBlob: throws when server returns success:false
 *  - transcribeBlob: propagates network errors
 *  - transcribeUri: happy path returns trimmed text and deletes file
 *  - transcribeUri: deletes file even when transcription throws
 *  - deleteAudio: calls FileSystem.deleteAsync with idempotent flag
 *  - deleteAudio: silently ignores errors
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import api from '../services/api';
import * as FileSystem from 'expo-file-system';
import { VoiceService } from '../services/voice-service';

const mockPost = api.post as jest.Mock;
const mockDeleteAsync = FileSystem.deleteAsync as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlob(content = 'audio', type = 'audio/webm'): Blob {
  return new Blob([content], { type });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── transcribeBlob ─────────────────────────────────────────────────────────────

describe('VoiceService.transcribeBlob', () => {
  it('posts to /genai/transcribe and returns trimmed text', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, text: '  Hello world  ' } });

    const result = await VoiceService.transcribeBlob(makeBlob(), 'audio.webm');

    expect(result).toBe('Hello world');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, formData, config] = mockPost.mock.calls[0];
    expect(url).toBe('/genai/transcribe');
    expect(formData).toBeInstanceOf(FormData);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    expect(config.timeout).toBe(30_000);
  });

  it('throws when server returns success:false', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: false, text: '' } });

    await expect(VoiceService.transcribeBlob(makeBlob(), 'audio.webm')).rejects.toThrow(
      'Transcription rejected by server'
    );
  });

  it('propagates network errors', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));

    await expect(VoiceService.transcribeBlob(makeBlob(), 'audio.webm')).rejects.toThrow(
      'Network Error'
    );
  });

  it('returns empty string when text field is missing', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    const result = await VoiceService.transcribeBlob(makeBlob(), 'audio.webm');
    expect(result).toBe('');
  });
});

// ── transcribeUri ─────────────────────────────────────────────────────────────

describe('VoiceService.transcribeUri', () => {
  it('posts to /genai/transcribe and returns text', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, text: 'Patient has chest pain' } });
    mockDeleteAsync.mockResolvedValueOnce(undefined);

    const result = await VoiceService.transcribeUri('file:///tmp/recording.m4a');

    expect(result).toBe('Patient has chest pain');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toBe('/genai/transcribe');
  });

  it('deletes the file after a successful transcription', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, text: 'ok' } });
    mockDeleteAsync.mockResolvedValueOnce(undefined);

    await VoiceService.transcribeUri('file:///tmp/recording.m4a');

    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///tmp/recording.m4a', { idempotent: true });
  });

  it('deletes the file even when the API call throws', async () => {
    mockPost.mockRejectedValueOnce(new Error('Whisper timeout'));
    mockDeleteAsync.mockResolvedValueOnce(undefined);

    await expect(VoiceService.transcribeUri('file:///tmp/recording.m4a')).rejects.toThrow(
      'Whisper timeout'
    );

    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///tmp/recording.m4a', { idempotent: true });
  });

  it('infers mime type from file extension', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, text: 'ok' } });
    mockDeleteAsync.mockResolvedValueOnce(undefined);

    // React Native FormData.append receives { uri, name, type } plain objects —
    // not standard File instances. Spy on append to capture the exact call.
    const appendSpy = jest.spyOn(FormData.prototype, 'append');

    await VoiceService.transcribeUri('file:///tmp/recording.wav');

    const audioArg = appendSpy.mock.calls.find(([field]) => field === 'audio')?.[1] as any;
    expect(audioArg?.type).toBe('audio/wav');
    expect(audioArg?.name).toBe('recording.wav');

    appendSpy.mockRestore();
  });
});

// ── deleteAudio ───────────────────────────────────────────────────────────────

describe('VoiceService.deleteAudio', () => {
  it('calls FileSystem.deleteAsync with idempotent:true', async () => {
    mockDeleteAsync.mockResolvedValueOnce(undefined);

    await VoiceService.deleteAudio('file:///tmp/recording.m4a');

    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///tmp/recording.m4a', { idempotent: true });
  });

  it('does not throw when FileSystem.deleteAsync rejects', async () => {
    mockDeleteAsync.mockRejectedValueOnce(new Error('File not found'));

    await expect(VoiceService.deleteAudio('file:///tmp/missing.m4a')).resolves.toBeUndefined();
  });
});
