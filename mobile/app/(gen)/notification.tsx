import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useNotificationStore, PhysicianNotification } from 'stores/notification-store';

// ─── Notification type config ────────────────────────────────────────────────

const TYPE_CFG: Record<
  PhysicianNotification['type'],
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  new_case: {
    label: 'Case Assigned',
    icon: 'briefcase-outline',
    color: '#0AADA2',
    bg: '#f0fdfc',
  },
  case_status: {
    label: 'Case Updated',
    icon: 'refresh-circle-outline',
    color: '#f59e0b',
    bg: '#fffbeb',
  },
  im_message: {
    label: 'New Message',
    icon: 'chatbubble-ellipses-outline',
    color: '#6366f1',
    bg: '#eef2ff',
  },
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationRow({
  notification,
  onPress,
}: {
  notification: PhysicianNotification;
  onPress: (n: PhysicianNotification) => void;
}) {
  const cfg = TYPE_CFG[notification.type] ?? TYPE_CFG.case_status;
  return (
    <Pressable
      onPress={() => onPress(notification)}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: notification.isRead ? '#fff' : cfg.bg,
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: cfg.color + '1A',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1, marginRight: 6 }}
              numberOfLines={1}
            >
              {cfg.label}
            </Text>
            {!notification.isRead && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color }} />
            )}
          </View>
          <Text
            style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 }}
            numberOfLines={3}
          >
            {notification.message}
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>
            {timeAgo(notification.timestamp)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationScreen() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } =
    useNotificationStore();

  const handlePress = useCallback(
    (n: PhysicianNotification) => {
      markRead(n.id);
      // Navigate to health history for case-status / new-case, or stay for IM
      if (n.type === 'im_message' && n.diagnosisId) {
        router.push({ pathname: '/(tab)/health', params: { diagnosisId: n.diagnosisId } });
      } else if (n.caseId) {
        router.push({ pathname: '/(tab)/health', params: { diagnosisId: n.caseId } });
      }
    },
    [markRead],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color="#0AADA2" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 18,
            fontWeight: '700',
            color: '#111827',
          }}
        >
          Notifications
        </Text>
        {unreadCount > 0 ? (
          <View
            style={{
              backgroundColor: '#dc2626',
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              minWidth: 28,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unreadCount}</Text>
          </View>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      {/* Action bar */}
      {notifications.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: '#f9fafb',
          }}
        >
          {unreadCount > 0 && (
            <Pressable onPress={markAllRead}>
              <Text style={{ fontSize: 12, color: '#0AADA2', fontWeight: '600' }}>
                Mark all read
              </Text>
            </Pressable>
          )}
          <Pressable onPress={clearAll}>
            <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '600' }}>Clear all</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor="#0AADA2" />}
      >
        {notifications.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: '#f3f4f6',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Ionicons name="notifications-off-outline" size={36} color="#9ca3af" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' }}>
              No notifications yet
            </Text>
            <Text
              style={{ marginTop: 8, fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 }}
            >
              You'll be notified here when your physician reviews your case or sends you a message.
            </Text>
          </View>
        ) : (
          notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} onPress={handlePress} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
