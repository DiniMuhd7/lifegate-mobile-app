/**
 * Persistence Manager
 * Handles persistence layer for chat conversations
 * Step D of the chat flow: Persist to Storage
 *
 * Storage layout (per-conversation keys to avoid large monolithic writes):
 *   healthpilot_conv_<userId>_<convId>  — one key per conversation
 *   healthpilot_conv_index_<userId>     — JSON array of conversation IDs (ordered)
 *
 * Legacy key (healthpilot_conversations_<userId>) is migrated on first load.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Conversation } from 'types/chat-types';

const CONV_PREFIX = 'healthpilot_conv_';
const INDEX_PREFIX = 'healthpilot_conv_index_';
const LEGACY_PREFIX = 'healthpilot_conversations_';

function convKey(userId: string, convId: string): string {
  return `${CONV_PREFIX}${userId}_${convId}`;
}

function indexKey(userId: string): string {
  return `${INDEX_PREFIX}${userId}`;
}

export class PersistenceManager {
  /**
   * Save a single conversation to its own AsyncStorage key and refresh the index.
   * This is the hot-path method — only the changed conversation is written.
   */
  static async saveConversation(conversation: Conversation, userId: string): Promise<void> {
    const key = convKey(userId, conversation.id);
    const rawIndex = await AsyncStorage.getItem(indexKey(userId));
    const ids: string[] = rawIndex ? (JSON.parse(rawIndex) as string[]) : [];

    if (!ids.includes(conversation.id)) {
      ids.unshift(conversation.id);
    }

    await AsyncStorage.multiSet([
      [key, JSON.stringify(conversation)],
      [indexKey(userId), JSON.stringify(ids)],
    ]);
  }

  /**
   * Save all conversations via multiSet.
   * Use for bulk writes (e.g. after migration or initial hydration).
   * Prefer saveConversation() on the hot path.
   */
  static async saveConversations(conversations: Conversation[], userId: string): Promise<void> {
    if (conversations.length === 0) {
      await AsyncStorage.setItem(indexKey(userId), '[]');
      return;
    }

    const ids = conversations.map((c) => c.id);
    const pairs: [string, string][] = conversations.map((c) => [
      convKey(userId, c.id),
      JSON.stringify(c),
    ]);
    pairs.push([indexKey(userId), JSON.stringify(ids)]);

    await AsyncStorage.multiSet(pairs);
  }

  /**
   * Load all conversations for a user.
   * Automatically migrates data from the legacy monolithic key on first load.
   */
  static async loadConversations(userId: string): Promise<Conversation[]> {
    try {
      const rawIndex = await AsyncStorage.getItem(indexKey(userId));

      if (rawIndex !== null) {
        const ids: string[] = JSON.parse(rawIndex);
        if (ids.length === 0) return [];

        const keys = ids.map((id) => convKey(userId, id));
        const pairs = await AsyncStorage.multiGet(keys);

        return pairs
          .filter(([, value]) => value !== null)
          .map(([, value]) => JSON.parse(value!) as Conversation);
      }

      // --- Legacy migration: monolithic key → per-conversation keys ---
      const legacyKey = `${LEGACY_PREFIX}${userId}`;
      const legacyData = await AsyncStorage.getItem(legacyKey);
      if (!legacyData) return [];

      const conversations = JSON.parse(legacyData) as Conversation[];
      await this.saveConversations(conversations, userId);
      await AsyncStorage.removeItem(legacyKey);
      return conversations;
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  }

  /**
   * Delete a specific conversation by removing its key and updating the index.
   */
  static async deleteConversation(conversationId: string, userId: string): Promise<void> {
    try {
      const rawIndex = await AsyncStorage.getItem(indexKey(userId));
      const ids: string[] = rawIndex ? (JSON.parse(rawIndex) as string[]) : [];
      const newIds = ids.filter((id) => id !== conversationId);

      await AsyncStorage.multiSet([[indexKey(userId), JSON.stringify(newIds)]]);
      await AsyncStorage.removeItem(convKey(userId, conversationId));
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw new Error('Failed to delete conversation');
    }
  }

  /**
   * Clear all conversations for a user.
   */
  static async clearAllConversations(userId: string): Promise<void> {
    try {
      const rawIndex = await AsyncStorage.getItem(indexKey(userId));
      const ids: string[] = rawIndex ? (JSON.parse(rawIndex) as string[]) : [];

      const keysToRemove = [
        indexKey(userId),
        ...ids.map((id) => convKey(userId, id)),
        `${LEGACY_PREFIX}${userId}`, // clear legacy key too, if present
      ];
      await AsyncStorage.multiRemove(keysToRemove);
    } catch (error) {
      console.error('Error clearing conversations:', error);
      throw new Error('Failed to clear conversations');
    }
  }

  /**
   * Get storage size (for debugging).
   */
  static async getStorageInfo(): Promise<{ conversations: number; size: string }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const convKeys = keys.filter((k) => k.startsWith(CONV_PREFIX));
      const allChatKeys = keys.filter(
        (k) => k.startsWith(CONV_PREFIX) || k.startsWith(INDEX_PREFIX)
      );
      const values = await AsyncStorage.multiGet(allChatKeys);
      const size = values.reduce((sum, [, v]) => sum + (v?.length ?? 0), 0);

      return {
        conversations: convKeys.length,
        size: `${(size / 1024).toFixed(2)} KB`,
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { conversations: 0, size: '0 KB' };
    }
  }
}
