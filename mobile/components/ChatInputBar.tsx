import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ChatInputBarProps {
  onSend?: (message: string) => void;
  onMicPress?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSend,
  onMicPress,
  placeholder = 'How are you feeling...',
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);

  // Send button animation
  const sendScaleAnim = useRef(new Animated.Value(1)).current;

  // Mic wave ring animations – scale + opacity for 3 concentric rings
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;

  // Mic button pulse scale while active
  const micPulse = useRef(new Animated.Value(1)).current;

  // Idle attention animation – gentle shake when user hasn't typed anything
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isMicActive) {
      const makeRing = (
        scale: Animated.Value,
        opacity: Animated.Value,
        delay: number
      ): Animated.CompositeAnimation =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(scale, {
                toValue: 2.4,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0,
                duration: 1000,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
              Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
            ]),
          ])
        );

      // Stagger rings by 320 ms each
      ring1Opacity.setValue(0.55);
      ring2Opacity.setValue(0.55);
      ring3Opacity.setValue(0.55);

      const a1 = makeRing(ring1Scale, ring1Opacity, 0);
      const a2 = makeRing(ring2Scale, ring2Opacity, 320);
      const a3 = makeRing(ring3Scale, ring3Opacity, 640);
      a1.start();
      a2.start();
      a3.start();

      // Gentle pulse on the mic button itself
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.12, duration: 500, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();

      return () => {
        a1.stop();
        a2.stop();
        a3.stop();
        pulse.stop();
        ring1Scale.setValue(1);
        ring2Scale.setValue(1);
        ring3Scale.setValue(1);
        ring1Opacity.setValue(0);
        ring2Opacity.setValue(0);
        ring3Opacity.setValue(0);
        micPulse.setValue(1);
      };
    } else {
      ring1Opacity.setValue(0);
      ring2Opacity.setValue(0);
      ring3Opacity.setValue(0);
      micPulse.setValue(1);
    }
  }, [isMicActive]);

  const handleSend = () => {
    if (!text.trim() || disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.timing(sendScaleAnim, { toValue: 0.85, duration: 75, useNativeDriver: true }),
      Animated.spring(sendScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 120,
        friction: 5,
      }),
    ]).start();

    onSend?.(text.trim());
    setText('');
    setIsMicActive(false);
  };

  const handleMicPress = () => {
    if (disabled) return;

    if (Platform.OS === 'web') {
      const SpeechRecognitionAPI =
        (
          window as unknown as {
            SpeechRecognition?: new () => SpeechRecognition;
            webkitSpeechRecognition?: new () => SpeechRecognition;
          }
        ).SpeechRecognition ||
        (
          window as unknown as {
            SpeechRecognition?: new () => SpeechRecognition;
            webkitSpeechRecognition?: new () => SpeechRecognition;
          }
        ).webkitSpeechRecognition;

      if (!SpeechRecognitionAPI) return;

      if (isMicActive) {
        setIsMicActive(false);
        return;
      }

      setIsMicActive(true);
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsMicActive(false);
      };
      recognition.onerror = () => setIsMicActive(false);
      recognition.onend = () => setIsMicActive(false);
      recognition.start();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setIsMicActive(false);
      onMicPress?.();
    }
  };

  const hasText = text.trim().length > 0;

  // Trigger shake when idle (no text, not recording, not disabled)
  useEffect(() => {
    if (!hasText && !disabled && !isMicActive) {
      const shake = Animated.loop(
        Animated.sequence([
          Animated.delay(3500),
          Animated.timing(shakeAnim, { toValue: -5, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 5, duration: 70, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -4, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ])
      );
      shake.start();
      return () => {
        shake.stop();
        shakeAnim.setValue(0);
      };
    } else {
      shakeAnim.setValue(0);
    }
  }, [hasText, disabled, isMicActive]);

  const charCount = text.length;
  const MAX_CHARS = 5000;
  const showCounter = charCount > 4000;
  const isNearLimit = charCount > 4500;

  // Wave ring colour shifts from teal to red when recording
  const ringColor = isMicActive ? '#ef4444' : '#0d9488';

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: Platform.OS === 'ios' ? 28 : 14,
      }}
    >
      {/* Recording label */}
      {isMicActive && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
            gap: 6,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: '#ef4444',
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: '#ef4444',
              fontWeight: '600',
              letterSpacing: 0.4,
            }}
          >
            Listening…
          </Text>
        </View>
      )}

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

      {/* Input row */}
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderRadius: 30,
          paddingLeft: 20,
          paddingRight: 6,
          paddingVertical: 6,
          opacity: disabled ? 0.55 : 1,
          transform: [{ translateX: shakeAnim }],
        }}
      >
        {/* Text input with custom centred placeholder overlay */}
        <View style={{ flex: 1, justifyContent: 'center', minHeight: 44 }}>
          {/* Custom placeholder – absolutely centred, ignored by touches */}
          {!hasText && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: 14.5, color: '#7db9b4' }}
              >
                {placeholder}
              </Text>
            </View>
          )}
          <TextInput
            style={{
              fontSize: 14.5,
              color: '#134e4a',
              lineHeight: 20,
              paddingVertical: 6,
              maxHeight: 110,
            }}
            value={text}
            onChangeText={setText}
            placeholder=""
            placeholderTextColor="transparent"
            multiline
            returnKeyType="default"
            selectionColor="#0d9488"
            editable={!disabled}
            maxLength={MAX_CHARS}
          />
        </View>

        {/* Mic button with wave rings – only shown when no text is typed */}
        <TouchableOpacity
          onPress={handleMicPress}
          activeOpacity={0.75}
          style={{ marginRight: 4, padding: 4 }}
        >
          <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            {/* Ring 1 */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: ringColor,
                transform: [{ scale: ring1Scale }],
                opacity: ring1Opacity,
              }}
            />
            {/* Ring 2 */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: ringColor,
                transform: [{ scale: ring2Scale }],
                opacity: ring2Opacity,
              }}
            />
            {/* Ring 3 */}
            <Animated.View
              style={{
                position: 'absolute',
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: ringColor,
                transform: [{ scale: ring3Scale }],
                opacity: ring3Opacity,
              }}
            />

            {/* Mic icon circle */}
            <Animated.View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isMicActive
                  ? 'rgba(239,68,68,0.12)'
                  : 'rgba(13,148,136,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: micPulse }],
              }}
            >
              <Ionicons
                name={isMicActive ? 'mic' : 'mic-outline'}
                size={20}
                color={isMicActive ? '#dc2626' : '#0d9488'}
              />
            </Animated.View>
          </View>
        </TouchableOpacity>

        {/* Send button */}
        <Animated.View style={{ transform: [{ scale: sendScaleAnim }] }}>
          <TouchableOpacity
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={disabled || !hasText}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: hasText && !disabled ? '#0f766e' : '#b2d8d4',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#0d4a40',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: hasText && !disabled ? 0.28 : 0.06,
              shadowRadius: 6,
              elevation: hasText && !disabled ? 5 : 1,
            }}
          >
            <Ionicons name="arrow-up" size={22} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
};
