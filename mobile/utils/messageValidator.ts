/**
 * Message Validator Utility
 * Validates user messages before sending to AI
 * - Checks for empty strings
 * - Checks for excessive length
 * - Returns validation result with error message if invalid
 */

import { ValidationResult } from 'types/chat-types';

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 5000;

export const validateMessage = (text: string): ValidationResult => {
  // Check for empty or whitespace-only message
  if (!text || text.trim().length === 0) {
    return {
      isValid: false,
      error: 'Message cannot be empty',
    };
  }

  // Check minimum length
  if (text.trim().length < MIN_MESSAGE_LENGTH) {
    return {
      isValid: false,
      error: `Message must be at least ${MIN_MESSAGE_LENGTH} character`,
    };
  }

  // Check maximum length
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      isValid: false,
      error: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters (${text.length} provided)`,
    };
  }

  // Message is valid
  return {
    isValid: true,
  };
};

/**
 * Sanitize message before sending (remove extra whitespace)
 */
export const sanitizeMessage = (text: string): string => {
  return text.trim().replace(/\s+/g, ' ');
};
