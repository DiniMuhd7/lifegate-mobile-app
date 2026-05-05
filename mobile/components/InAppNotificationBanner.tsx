import React, { useEffect, useRef } from 'react';
import { Animated, GestureResponderEvent, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhysicianNotification } from '../stores/notification-store';

interface Props {
  notification: PhysicianNotification | null;
  onDismiss: () => void;
  /** Optional: overrides the default tap navigation. Called after the banner dismisses. */
  onPress?: () => void;
}

/**
 * Slides in from the top for 4 seconds then auto-dismisses.
 * Tapping navigates to the relevant case (or calls onPress if provided).
 */
export function InAppNotificationBanner({ notification, onDismiss, onPress }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;

    // Slide in
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web',
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
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => onDismiss());
  }

  function handlePress() {
    if (timerRef.current) clearTimeout(timerRef.current);
    dismiss();
    if (onPress) {
      onPress();
    } else if (notification?.caseId) {
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
        style={{
          marginTop: insets.top + 8,
          marginHorizontal: 16,
          backgroundColor: '#2563EB',
          borderRadius: 16,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'flex-start',
          elevation: 6,
          shadowColor: '#1d4ed8',
          shadowOpacity: 0.3,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 }}>
            {notification.type === 'new_case'
              ? '🔔 New Case Assigned'
              : notification.type === 'im_message'
              ? '💬 New Message'
              : '📋 Case Updated'}
          </Text>
          <Text style={{ color: '#bfdbfe', fontSize: 12 }} numberOfLines={2}>
            {notification.message}
          </Text>
        </View>
        <TouchableOpacity
          onPress={(event: GestureResponderEvent) => {
            event.stopPropagation();
            dismiss();
          }}
          style={{ marginLeft: 12, marginTop: 2 }}
        >
          <Text style={{ color: '#93c5fd', fontSize: 20, lineHeight: 20 }}>×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}
