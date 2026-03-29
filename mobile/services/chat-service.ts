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
import { Message, AIResponse } from 'types/chat-types';

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
    category?: string
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

      // Call backend endpoint
      const response = await api.post<{ data: AIResponse; escalated?: boolean; latency_ms?: number }>('/genai/chat', requestPayload);

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
      const result = response.data.data;

      if (!result || !result.text) {
        throw new Error('No content returned from AI');
      }

      // Attach the authoritative escalation flag from the backend
      if (response.data.escalated) {
        result.escalated = true;
      }

      // Validate urgency if diagnosis exists
      if (result.diagnosis) {
        const validUrgencies = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        if (!validUrgencies.includes(result.diagnosis.urgency)) {
          result.diagnosis.urgency = 'MEDIUM'; // Default to MEDIUM if invalid
        }
      }

      return result;
    } catch (error) {
      console.error('Backend AI API Error:', error);
      throw new Error(
        'I encountered an error analyzing your symptoms. Please try again or consult a professional.'
      );
    }
  }
}
