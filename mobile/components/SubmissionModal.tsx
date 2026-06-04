import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SubmissionModalProps {
  visible: boolean;
  isSuccess: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmButtonText?: string;
}

export function SubmissionModal({
  visible,
  isSuccess,
  title,
  message,
  onConfirm,
  confirmButtonText = 'OK',
}: SubmissionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 items-center justify-center bg-black/50">
        <View className="w-80 items-center rounded-lg bg-white p-6">
          {/* Icon */}
          <View
            className={`mb-4 h-16 w-16 items-center justify-center rounded-full ${
              isSuccess ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <Ionicons
              name={isSuccess ? 'checkmark-circle' : 'close-circle'}
              size={40}
              color={isSuccess ? '#22c55e' : '#ef4444'}
            />
          </View>

          {/* Title */}
          <Text className={`mb-2 text-center text-lg font-bold ${
            isSuccess ? 'text-[#0EA5A4]' : 'text-red-700'
          }`}>
            {title}
          </Text>

          {/* Message */}
          <Text className="mb-6 text-center text-gray-600">
            {message}
          </Text>

          {/* Confirm Button */}
          <Pressable
            onPress={onConfirm}
            className={`w-full rounded-lg px-6 py-3 ${
              isSuccess ? 'bg-[#0EA5A4]' : 'bg-red-600'
            }`}
          >
            <Text className="text-center font-semibold text-white">
              {confirmButtonText}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}