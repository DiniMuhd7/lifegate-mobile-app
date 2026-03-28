/**
 * Persistence Manager
 * Handles persistence layer for chat conversations
 * Step D of the chat flow: Persist to Storage
 *
 * - Serializes conversations to AsyncStorage
 * - Deserializes and loads on app startup
 * - Supports delete operations
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Conversation } from 'types/chat-types';

const STORAGE_KEY_PREFIX = 'healthpilot_conversations_';

export class PersistenceManager {
  /**
   * Save conversations to AsyncStorage
   * @param conversations - Array of conversations to persist
   * @param userId - User ID to scope storage
   */
  static async saveConversations(
    conversations: Conversation[],
    userId: string
  ): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${userId}`;
      const serialized = JSON.stringify(conversations);
      await AsyncStorage.setItem(key, serialized);
    } catch (error) {
      console.error('Error saving conversations:', error);
      throw new Error('Failed to save conversations to storage');
    }
  }

  /**
   * Load conversations from AsyncStorage
   * @param userId - User ID to scope storage
   * @returns Array of loaded conversations (empty if none exist)
   */
  static async loadConversations(userId: string): Promise<Conversation[]> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${userId}`;
      const serialized = await AsyncStorage.getItem(key);

      if (!serialized) {
        return [];
      }

      const conversations = JSON.parse(serialized) as Conversation[];
      return conversations;
    } catch (error) {
      console.error('Error loading conversations:', error);
      // Return empty array on error instead of throwing
      return [];
    }
  }

  /**
   * Delete a specific conversation
   * @param conversationId - ID of conversation to delete
   * @param userId - User ID to scope storage
   */
  static async deleteConversation(
    conversationId: string,
    userId: string
  ): Promise<void> {
    try {
      const conversations = await this.loadConversations(userId);
      const filtered = conversations.filter((c) => c.id !== conversationId);
      await this.saveConversations(filtered, userId);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw new Error('Failed to delete conversation');
    }
  }

  /**
   * Clear all conversations for a user
   * @param userId - User ID to clear
   */
  static async clearAllConversations(userId: string): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${userId}`;
      await AsyncStorage.removeItem(key);
      console.log('✓ Cleared all conversations');
    } catch (error) {
      console.error('Error clearing conversations:', error);
      throw new Error('Failed to clear conversations');
    }
  }

  /**
   * Get storage size (for debugging)
   */
  static async getStorageInfo(): Promise<{ conversations: number; size: string }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const chatKeys = keys.filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
      const values = await AsyncStorage.multiGet(chatKeys);
      const size = values.reduce((sum, [, v]) => sum + (v?.length || 0), 0);

      return {
        conversations: chatKeys.length,
        size: `${(size / 1024).toFixed(2)} KB`,
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { conversations: 0, size: '0 KB' };
    }
  }
}
