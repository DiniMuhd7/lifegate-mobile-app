import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ChatInputBarProps {
  onSend?: (message: string) => void;
  onMicPress?: () => void;
  placeholder?: string;
  disabled?: boolean; // Disable input when AI is thinking
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSend,
  onMicPress,
  placeholder = 'How are you feeling....',
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);
  const sendScaleAnim = useRef(new Animated.Value(1)).current;

  const handleSend = () => {
    if (!text.trim() || disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.timing(sendScaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(sendScaleAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 6 }),
    ]).start();

    onSend?.(text.trim());
    setText('');
  };

  const handleMicPress = () => {
    if (disabled) return;
    setIsMicActive((prev) => !prev);
    onMicPress?.();
  };

  const hasText = text.trim().length > 0;
  const charCount = text.length;
  const MAX_CHARS = 5000;
  const showCounter = charCount > 4000;
  const isNearLimit = charCount > 4500;

  return (
    <View className={`px-4 ${Platform.OS === 'ios' ? 'pb-8' : 'pb-4'} pt-3`}>
      {/* Character counter */}
      {showCounter && (
        <Text
          style={{
            fontSize: 11,
            textAlign: 'right',
            marginBottom: 4,
            marginRight: 4,
            color: isNearLimit ? '#dc2626' : '#64748b',
            fontWeight: isNearLimit ? '600' : '400',
          }}
        >
          {charCount}/{MAX_CHARS}
        </Text>
      )}
      <View
        className="flex-row items-center bg-white/85 rounded-full pl-5 pr-1.5 py-1.5 border border-teal-600/15"
        style={{
          shadowColor: '#1a6b5e',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 6,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {/* Text input */}
        <TextInput
          className="flex-1 text-sm text-teal-900 py-2.5"
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#8bbdb7"
          multiline={true}
          style={{ maxHeight: 100 }}
          returnKeyType="default"
          selectionColor="#1a6b5e"
          editable={!disabled}
        />

        {/* Mic button */}
        <TouchableOpacity className="p-2 mr-0.5" onPress={handleMicPress} activeOpacity={0.7}>
          <Ionicons
            name={isMicActive ? 'mic' : 'mic-outline'}
            size={22}
            color={isMicActive ? '#0d4a40' : '#5a9e94'}
          />
        </TouchableOpacity>

        {/* Send button */}
        <Animated.View style={{ transform: [{ scale: sendScaleAnim }] }}>
          <TouchableOpacity
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={disabled || !hasText}
            className={`w-11 h-11 rounded-full justify-center items-center ${hasText && !disabled ? 'bg-teal-700' : 'bg-[#0C5352]'}`}
            style={{
              shadowColor: '#0d4a40',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: hasText ? 0.3 : 0.1,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <Ionicons name="arrow-up" size={22} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};
