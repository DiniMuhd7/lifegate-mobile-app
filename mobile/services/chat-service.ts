/**
 * Chat Service
 * Handles communication with Backend AI API
 * Step C of the chat flow: AI Orchestration
 *
 * - Sends messages and conversation history to backend
 * - Backend handles prompt engineering and AI orchestration
 * - Parses and validates responses
 * - Returns structured AIResponse with diagnosis/prescription
 */

import api from './api';
import { Message, AIResponse, FinalizeResult } from 'types/chat-types';

/**
 * Service responsible for communicating with the Backend AI API.
 * Delegates prompt engineering and AI orchestration to the backend.
 */
export class ChatService {
  /**
   * Fetches an AI response based on the user's health-related query from the backend.
   * @param previousMessages - Conversation history for context
   * @param userMessage - The user's input message describing symptoms or asking health questions.
   * @returns A promise resolving to an AIResponse object.
   */
  static async sendMessage(
    previousMessages: Message[],
    userMessage: string,
    category?: string,
    mode?: string
  ): Promise<AIResponse> {
    const clientStart = Date.now();
    const LATENCY_TARGET_MS = 500;

    try {
      // Build request payload with message, category, and conversation history
      const requestPayload = {
        message: userMessage,
        category: category || '',
        previousMessages: previousMessages.map((msg) => ({
          role: msg.role,
          text: msg.text,
        })),
      };

      // Send ?category=clinical_diagnosis as query param so the credit gate
      // middleware can read it without consuming the request body.
      const queryParams = mode === 'clinical_diagnosis'
        ? { params: { category: 'clinical_diagnosis' } }
        : {};

      // Call backend endpoint
      const response = await api.post<{ data: AIResponse; escalated?: boolean; latency_ms?: number }>('/genai/chat', requestPayload, queryParams);

      const clientLatencyMs = Date.now() - clientStart;
      const serverLatencyMs = response.data.latency_ms ?? Number(response.headers?.['x-ai-latency-ms'] ?? 0);

      // Log latency warning when round-trip exceeds 500ms target
      if (clientLatencyMs > LATENCY_TARGET_MS) {
        console.warn(
          `[LATENCY] AI response exceeded ${LATENCY_TARGET_MS}ms target — ` +
          `client: ${clientLatencyMs}ms, server: ${serverLatencyMs}ms, category: ${category}`
        );
      }

      // Extract AIResponse from backend response
      const response2 = response.data as { data: AIResponse; escalated?: boolean; diagnosisId?: string; latency_ms?: number };
      const result = response2.data;

      if (!result || !result.text) {
        throw new Error('No content returned from AI');
      }

      // Attach the authoritative escalation flag from the backend
      if (response2.escalated) {
        result.escalated = true;
      }

      // Attach the diagnosis DB record ID so the frontend can navigate to the report
      if (response2.diagnosisId) {
        result.diagnosisId = response2.diagnosisId;
      }

      // Validate urgency if diagnosis exists
      if (result.diagnosis) {
        const validUrgencies = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        if (!validUrgencies.includes(result.diagnosis.urgency)) {
          result.diagnosis.urgency = 'MEDIUM'; // Default to MEDIUM if invalid
        }
      }

      return result;
    } catch (error: any) {
      console.error('Backend AI API Error:', error);
      // Detect credit-gate rejection so the UI can show a top-up prompt.
      if (
        error?.response?.status === 402 &&
        error?.response?.data?.code === 'INSUFFICIENT_CREDITS'
      ) {
        throw new Error('INSUFFICIENT_CREDITS');
      }
      throw new Error(
        'I encountered an error analyzing your symptoms. Please try again or consult a professional.'
      );
    }
  }

  /**
   * Finalizes a session-scoped chat, running a comprehensive EDIS analysis
   * on the full conversation history and queueing the case for physician review.
   * Called after a clinical_diagnosis session receives its first diagnosis.
   */
  static async finalize(sessionId: string): Promise<FinalizeResult> {
    const res = await api.post<{ success: boolean; data: FinalizeResult }>(
      `/chat/sessions/${sessionId}/finalize`
    );
    return res.data.data;
  }
}
