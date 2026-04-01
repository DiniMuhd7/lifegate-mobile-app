import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PhysicianNotification } from '../stores/notification-store';

interface Props {
  notification: PhysicianNotification | null;
  onDismiss: () => void;
}

/**
 * Slides in from the top for 4 seconds then auto-dismisses.
 * Tapping navigates to the relevant case.
 */
export function InAppNotificationBanner({ notification, onDismiss }: Props) {
  const router = useRouter();
  const translateY = useRef(new Animated.Value(-120)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;

    // Slide in
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    // Auto-dismiss after 4s
    timerRef.current = setTimeout(() => dismiss(), 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification?.id]);

  function dismiss() {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }

  function handlePress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    dismiss();
    if (notification?.caseId) {
      router.push({ pathname: '/(prof-tab)/caseQueue', params: { caseId: notification.caseId } });
    }
  }

  if (!notification) return null;

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
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={handlePress}
        className="mx-4 mt-12 bg-blue-600 rounded-2xl p-4 flex-row items-start"
        style={{ elevation: 6, shadowColor: '#1d4ed8', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
      >
        <View className="flex-1">
          <Text className="text-white font-bold text-sm mb-0.5">
            {notification.type === 'new_case' ? '🔔 New Case Assigned' : '📋 Case Updated'}
          </Text>
          <Text className="text-blue-100 text-xs" numberOfLines={2}>
            {notification.message}
          </Text>
        </View>
        <TouchableOpacity onPress={dismiss} className="ml-3 mt-0.5">
          <Text className="text-blue-200 text-lg leading-none">×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}
