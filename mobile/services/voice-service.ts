/**
 * VoiceService
 *
 * Handles audio upload to the /genai/transcribe endpoint (Whisper) and
 * cleanup of the temporary recording file after transcription completes.
 * Audio is never persisted server-side — it is processed in-memory and
 * immediately discarded by the backend.
 */

import * as FileSystem from 'expo-file-system';
import api from './api';

/** Mime type lookup by common audio file extension. */
const MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/m4a',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
};

function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'audio/m4a';
}

export const VoiceService = {
  /**
   * Transcribe a native audio file (iOS / Android) by URI.
   * Uploads to POST /genai/transcribe and returns the extracted text.
   * Always deletes the local file afterwards regardless of success/failure.
   */
  async transcribeUri(uri: string): Promise<string> {
    const filename = uri.split('/').pop() || 'audio.m4a';
    const mimeType = mimeFromFilename(filename);

    const formData = new FormData();
    formData.append('audio', {
      uri,
      name: filename,
      type: mimeType,
    } as unknown as Blob);

    try {
      const res = await api.post<{ success: boolean; text: string }>(
        '/genai/transcribe',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30_000,
        }
      );
      if (!res.data.success) throw new Error('Transcription rejected by server');
      return (res.data.text ?? '').trim();
    } finally {
      // Always delete the temp audio file — even on error.
      await VoiceService.deleteAudio(uri);
    }
  },

  /**
   * Transcribe a web Blob (from MediaRecorder).
   * No local file deletion is needed — the Blob lives only in memory.
   */
  async transcribeBlob(blob: Blob, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append('audio', blob, filename);

    const res = await api.post<{ success: boolean; text: string }>(
      '/genai/transcribe',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30_000,
      }
    );
    if (!res.data.success) throw new Error('Transcription rejected by server');
    return (res.data.text ?? '').trim();
  },

  /**
   * Delete a temporary audio file from device storage.
   * Best-effort — silently ignores errors.
   */
  async deleteAudio(uri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Non-critical — temp directory is cleared by the OS anyway.
    }
  },
};

// ─── VoiceChatService ─────────────────────────────────────────────────────────

export type VoiceChatTurn = {
  transcript: string;
  replyText: string;
  audioBase64: string; // mp3 as base64; empty string = TTS unavailable
  aiResponse?: Record<string, unknown>;
};

/**
 * Send one voice-chat turn to POST /genai/voice-chat.
 *
 * @param audioUri    - Local URI of the recorded audio file (native).
 * @param audioBlob   - Recorded audio Blob (web). Pass null on native.
 * @param history     - Current conversation history (for EDIS context).
 * @param category    - Conversation category (default: "general_health").
 */
export const VoiceChatService = {
  async sendTurn(params: {
    audioUri?: string | null;
    audioBlob?: Blob | null;
    history: Array<{ role: string; text: string }>;
    category?: string;
  }): Promise<VoiceChatTurn> {
    const { audioUri, audioBlob, history, category = 'general_health' } = params;

    const form = new FormData();

    if (audioBlob) {
      form.append('audio', audioBlob, 'audio.webm');
    } else if (audioUri) {
      const filename = audioUri.split('/').pop() || 'audio.m4a';
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'm4a';
      const mime = ({
        m4a: 'audio/m4a', mp4: 'audio/mp4', aac: 'audio/aac',
        wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg',
        mp3: 'audio/mpeg',
      } as Record<string, string>)[ext] ?? 'audio/m4a';

      form.append('audio', { uri: audioUri, name: filename, type: mime } as unknown as Blob);
    } else {
      throw new Error('Either audioUri or audioBlob is required');
    }

    form.append('history', JSON.stringify(history));
    form.append('category', category);

    const res = await api.post<{ success: boolean; data: VoiceChatTurn }>(
      '/genai/voice-chat',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45_000 }
    );

    if (!res.data.success) throw new Error('Voice chat request failed');
    return res.data.data;
  },
};
