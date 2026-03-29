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
      const response = await api.post<{ data: AIResponse }>('/genai/chat', requestPayload);

      // Extract AIResponse from backend response
      const result = response.data.data;

      if (!result || !result.text) {
        throw new Error('No content returned from AI');
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
