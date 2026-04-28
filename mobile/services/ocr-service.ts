/**
 * OcrService
 *
 * Sends a captured image (base64) to the backend /genai/scan endpoint, which
 * uses OpenAI Vision (gpt-4o) for real-time medical document OCR.
 *
 * Privacy guarantee: the image is transmitted as a base64 string and is
 * processed entirely in memory on the server. It is never written to any
 * database or file storage.
 */

import api from './api';

export interface OcrResult {
  /** Extracted medical text. Empty string when isMedical is false. */
  text: string;
  /** True when the image was positively identified as a medical document. */
  isMedical: boolean;
}

export const OcrService = {
  /**
   * Scan a medical document image via OpenAI Vision (gpt-4o).
   * @param base64    Raw base64 image data — no data-URI prefix.
   * @param mimeType  MIME type, e.g. 'image/jpeg'.
   */
  async scanImage(base64: string, mimeType: string = 'image/jpeg'): Promise<OcrResult> {
    const res = await api.post<{ success: boolean; text: string; isMedical: boolean }>(
      '/genai/scan',
      { image: base64, mimeType },
      { timeout: 40_000 },
    );
    if (!res.data.success) throw new Error('Image scan rejected by server');
    return {
      text: (res.data.text ?? '').trim(),
      isMedical: res.data.isMedical ?? false,
    };
  },
};
