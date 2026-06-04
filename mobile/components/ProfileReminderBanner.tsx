import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Banner that reminds patients to complete their health profile.
 * Slides in from the top and stays until manually dismissed.
 */
export function ProfileReminderBanner({ visible, onDismiss }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
        tension: 80,
        friction: 10,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [visible]);

  function handlePress() {
    dismiss();
    router.push('/(tab)/settings/manage-profile');
  }

  function dismiss() {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={{
          marginTop: insets.top + 8,
          marginHorizontal: 16,
          borderRadius: 16,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#0AADA2',
          elevation: 6,
          shadowColor: '#0AADA2',
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Ionicons name="person-circle-outline" size={28} color="#fff" style={{ marginRight: 12 }} />
        <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={{ flex: 1 }}>
          <Text className="text-white font-bold text-sm mb-0.5">
            Complete Your Health Profile
          </Text>
          <Text className="text-white text-xs opacity-90">
            A complete profile helps our AI give you safer, more personalised care. Tap to finish.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
