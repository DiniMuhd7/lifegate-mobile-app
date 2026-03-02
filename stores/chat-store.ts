/**
 * Chat Store (Zustand)
 * Manages chat state following the HealthPilot specification:
 * - Optimistic UI (SENDING → SENT/FAILED)
 * - Handles AI orchestration via ChatService
 * - Persists conversations to AsyncStorage
 * - Supports multiple conversations with history
 */

import { create } from 'zustand';
import { Message, Conversation, MessageStatus } from 'types/chat-types';
import { ChatService } from 'services/chat-service';
import { PersistenceManager } from 'utils/persistenceManager';
import { validateMessage } from 'utils/messageValidator';

type ChatState = {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  isThinking: boolean; // AI is processing
  error: string | null; 

  // Derived
  activeConversation: Conversation | null;
  messages: Message[]; // Messages of active conversation

  // Actions
  initializeChat: (userId: string) => Promise<void>;
  createConversation: () => string; // Returns new conversation ID
  setActiveConversation: (conversationId: string) => void;
  sendMessage: (text: string) => Promise<void>; // User sends message
  loadConversationHistory: () => Promise<void>; // Load from storage
  deleteConversation: (conversationId: string) => void;
  processAIResponse: (userMessage: Message, conversationId: string) => Promise<void>;
  clearError: () => void;
};

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Format timestamp
const now = () => Date.now();

export const useChatStore = create<ChatState>((set, get) => ({
  // -------- State --------
  conversations: [],
  activeConversationId: null,
  isThinking: false,
  error: null,

  // -------- Derived --------
  get activeConversation() {
    const state = get();
    return (
      state.conversations.find((c) => c.id === state.activeConversationId) ||
      null
    );
  },

  get messages() {
    return get().activeConversation?.messages || [];
  },

  // -------- Actions --------

  // Initialize chat on app boot (load history)
  initializeChat: async (userId: string) => {
    try {
      const conversations = await PersistenceManager.loadConversations(userId);
      const defaultConvId =
        conversations.length > 0 ? conversations[0].id : generateId();

      set({
        conversations,
        activeConversationId: defaultConvId,
      });

      // If no conversations exist, create first one
      if (conversations.length === 0) {
        get().createConversation();
      }
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      set({ error: 'Failed to load chat history' });
    }
  },

  // Create new conversation
  createConversation: () => {
    const conversationId = generateId();
    const newConversation: Conversation = {
      id: conversationId,
      userId: '', // Will be set from auth context in component
      messages: [],
      createdAt: now(),
      updatedAt: now(),
    };

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      activeConversationId: conversationId,
    }));

    return conversationId;
  },

  // Switch active conversation
  setActiveConversation: (conversationId: string) => {
    set({ activeConversationId: conversationId, error: null });
  },

  // Main action: User sends message (Step A & B from spec)
  sendMessage: async (text: string) => {
    try {
      // Step B: Validation
      const validation = validateMessage(text);
      if (!validation.isValid) {
        set({ error: validation.error });
        return;
      }

      const state = get();
      const convId = state.activeConversationId;
      if (!convId) {
        set({ error: 'No active conversation' });
        return;
      }

      // Step B: Create user message with SENDING status
      const userMessage: Message = {
        id: generateId(),
        role: 'USER',
        status: 'SENDING',
        text,
        timestamp: now(),
      };

      // Step B: Optimistic update
      set((state) => {
        const conversations = state.conversations.map((conv) =>
          conv.id === convId
            ? {
                ...conv,
                messages: [...conv.messages, userMessage],
                updatedAt: now(),
              }
            : conv
        );
        return { conversations, isThinking: true, error: null };
      });

      // Step C: Orchestrate AI response
      await get().processAIResponse(userMessage, convId);
    } catch (error) {
      console.error('Error sending message:', error);
      set({ error: 'Failed to send message', isThinking: false });
    }
  },

  // Step C: Process AI response (internal)
  processAIResponse: async (userMessage: Message, conversationId: string) => {
    try {
      // Get conversation for context
      const state = get();
      const conversation = state.conversations.find(
        (c) => c.id === conversationId
      );
      if (!conversation) return;

      // Call Gemini API via ChatService
      const aiResponse = await ChatService.sendMessage(
        conversation.messages.slice(0, -1), // All previous messages
        userMessage.text
      );

      // Step D: Handle success
      set((state) => {
        const conversations = state.conversations.map((conv) => {
          if (conv.id !== conversationId) return conv;

          // Update user message status to SENT
          const updatedMessages = conv.messages.map((msg) =>
            msg.id === userMessage.id ? { ...msg, status: 'SENT' as MessageStatus } : msg
          );

          // Append AI message
          const aiMessage: Message = {
            id: generateId(),
            role: 'AI',
            status: 'SENT',
            text: aiResponse.text,
            timestamp: now(),
            diagnosis: aiResponse.diagnosis,
            prescription: aiResponse.prescription,
          };

          updatedMessages.push(aiMessage);

          // Update conversation title if first message
          const title =
            conv.title ||
            `Chat - ${userMessage.text.substring(0, 30)}...`;

          return {
            ...conv,
            messages: updatedMessages,
            title,
            updatedAt: now(),
          };
        });

        return {
          conversations,
          isThinking: false,
        };
      });


      
      // Step D: Persist to storage
      await PersistenceManager.saveConversations(
        get().conversations,
        ''
      );
    } catch (error) {
      console.error('AI response error:', error);

      // Step D: Error path
      set((state) => {
        const conversations = state.conversations.map((conv) => {
          if (conv.id !== conversationId) return conv;
          return {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === userMessage.id
                ? { ...msg, status: 'FAILED' as MessageStatus }
                : msg
            ),
          };
        });

        return {
          conversations,
          isThinking: false,
          error: 'Failed to get AI response. Please try again.',
        };
      });
    }
  },

  // Load conversation history from storage
  loadConversationHistory: async () => {
    try {
      const conversations = await PersistenceManager.loadConversations('');
      set({ conversations });
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      set({ error: 'Failed to load history' });
    }
  },

  // Delete a conversation
  deleteConversation: (conversationId: string) => {
    set((state) => {
      const conversations = state.conversations.filter(
        (c) => c.id !== conversationId
      );
      let activeId = state.activeConversationId;

      // Switch to first conversation if active was deleted
      if (activeId === conversationId) {
        activeId = conversations.length > 0 ? conversations[0].id : null;
      }
      return {
        conversations,
        activeConversationId: activeId,
      };
    });
  },
  // Clear error
  clearError: () => set({ error: null }),
}));
