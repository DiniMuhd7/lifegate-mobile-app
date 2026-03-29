/**
 * Conversation Drawer Component
 * Side drawer showing conversation history
 * Allows switching between conversations and creating new ones
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useChatStore } from 'stores/chat-store';
import { Conversation, ConversationCategory } from 'types/chat-types';

interface ConversationDrawerProps {
  onClose?: () => void;
}

const CATEGORY_META: Record<ConversationCategory, { label: string; color: string; bg: string }> = {
  doctor_consultation: { label: 'Doctor', color: '#0f766e', bg: '#f0fdfa' },
  general_health:      { label: 'General', color: '#0891b2', bg: '#f0f9ff' },
  eye_checkup:         { label: 'Eye', color: '#7c3aed', bg: '#faf5ff' },
  hearing_test:        { label: 'Hearing', color: '#b45309', bg: '#fffbeb' },
  mental_health:       { label: 'Mental', color: '#be185d', bg: '#fdf2f8' },
};

export const ConversationDrawer: React.FC<ConversationDrawerProps> = ({
  onClose,
}) => {
  const {
    conversations,
    activeConversationId,
    createConversation,
    setActiveConversation,
    deleteConversation,
  } = useChatStore();

  const handleNewChat = () => {
    const newId = createConversation();
    setActiveConversation(newId);
    onClose?.();
  };

  const handleSelectConversation = (convId: string) => {
    setActiveConversation(convId);
    onClose?.();
  };

  const handleDeleteConversation = (convId: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: () => {
            deleteConversation(convId);
          },
          style: 'destructive',
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatTitle = (conv: Conversation) => {
    if (conv.title) return conv.title;
    if (conv.messages.length === 0) return 'New Conversation';
    const firstMessage = conv.messages.find((m) => m.role === 'USER');
    return firstMessage?.text.substring(0, 40) || 'Conversation';
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 bg-gradient-to-b from-teal-50 to-white">
        {/* Header */}
        <View className="px-4 py-4 border-b border-teal-100">
          <Text className="text-xl font-bold text-teal-900">Conversations</Text>
        </View>

        {/* New Chat Button */}
        <TouchableOpacity
          onPress={handleNewChat}
          className="mx-4 mt-4 mb-2 flex-row items-center bg-teal-600 rounded-lg px-4 py-3"
        >
          <Ionicons name="add-circle" size={20} color="#ffffff" />
          <Text className="ml-2 text-white font-semibold">New Chat</Text>
        </TouchableOpacity>

        {/* Conversations List */}
        {conversations.length === 0 ? (
          <View className="flex-1 justify-center items-center px-6">
            <Ionicons name="chatbubble-outline" size={48} color="#0AADA2" />
            <Text className="mt-4 text-gray-500 text-center text-base">
              No conversations yet. Start a new chat!
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
            renderItem={({ item }) => {
              const isActive = item.id === activeConversationId;
              return (
                <TouchableOpacity
                  onPress={() => handleSelectConversation(item.id)}
                  className={`flex-row items-center px-4 py-3 rounded-lg mb-2 ${
                    isActive ? 'bg-teal-100' : 'bg-gray-50'
                  }`}
                >
                  {/* Chat Icon */}
                  <Ionicons
                    name="chatbubble"
                    size={18}
                    color={isActive ? '#0AADA2' : '#999'}
                  />

                  {/* Conversation Info */}
                  <View className="flex-1 ml-3">
                    <Text
                      numberOfLines={1}
                      className={`font-semibold ${
                        isActive ? 'text-teal-900' : 'text-gray-700'
                      }`}
                    >
                      {formatTitle(item)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Text className="text-xs text-gray-500">
                        {formatDate(item.updatedAt)} • {item.messages.length} messages
                      </Text>
                      {item.category && CATEGORY_META[item.category] && (
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 8,
                            backgroundColor: CATEGORY_META[item.category].bg,
                            borderWidth: 1,
                            borderColor: CATEGORY_META[item.category].color + '44',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: CATEGORY_META[item.category].color,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {CATEGORY_META[item.category].label}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Delete Button */}
                  <TouchableOpacity
                    onPress={() => handleDeleteConversation(item.id)}
                    className="p-2"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Footer with navigation */}
        <View className="border-t border-teal-100 px-4 py-4">
          <TouchableOpacity
            className="flex-row items-center py-2"
            onPress={() => {
              onClose?.();
              router.replace('/(tab)/settings');
            }}
          >
            <Ionicons name="settings-outline" size={20} color="#666" />
            <Text className="ml-3 text-gray-600">Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-row items-center py-2 mt-2"
            onPress={() => {
              Alert.alert(
                'Help & Support',
                'For medical emergencies, please call your local emergency services immediately.\n\nFor app support, visit lifegatehealth.com or contact us at support@lifegate.ng',
                [{ text: 'OK' }]
              );
            }}
          >
            <Ionicons name="help-circle-outline" size={20} color="#666" />
            <Text className="ml-3 text-gray-600">Help & Support</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};
