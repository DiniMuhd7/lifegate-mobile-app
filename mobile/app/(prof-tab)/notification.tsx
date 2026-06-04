import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePhysicianHealthStore } from 'stores/health-store';
import { useNotificationStore } from 'stores/notification-store';
import type { PreventiveAlert, AlertSeverity } from 'types/health-types';
import type { PhysicianNotification } from 'stores/notification-store';

// ─── Severity config for health alerts ───────────────────────────────────────

const SEVERITY_CFG: Record<AlertSeverity, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', icon: 'checkmark-circle-outline' },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', icon: 'warning-outline' },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', icon: 'alert-circle-outline' },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', icon: 'pulse-outline' },
};

// ─── Unified item type ────────────────────────────────────────────────────────

type UnifiedItem =
  | { kind: 'case'; data: PhysicianNotification; sortKey: number }
  | { kind: 'health'; data: PreventiveAlert; sortKey: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Case notification card ───────────────────────────────────────────────────

const CASE_TYPE_CFG: Record<PhysicianNotification['type'], { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  new_case:    { color: '#0AADA2', bg: '#f0fdfc', icon: 'briefcase-outline',       label: 'New Case'     },
  case_status: { color: '#f59e0b', bg: '#fffbeb', icon: 'refresh-circle-outline',  label: 'Case Update'  },
  im_message:  { color: '#6366f1', bg: '#eef2ff', icon: 'chatbubble-ellipses-outline', label: 'Message' },
};

function CaseNotificationCard({
  notification,
  onPress,
}: {
  notification: PhysicianNotification;
  onPress: (n: PhysicianNotification) => void;
}) {
  const cfg = CASE_TYPE_CFG[notification.type] ?? CASE_TYPE_CFG.case_status;
  return (
    <Pressable
      onPress={() => onPress(notification)}
      style={({ pressed }) => ({ opacity: pressed ? 0.87 : 1 })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
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
            backgroundColor: cfg.color + '18',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1, marginRight: 6 }} numberOfLines={1}>
              {cfg.label}
            </Text>
            {!notification.isRead && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color }} />
            )}
          </View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 }} numberOfLines={3}>
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

// ─── Health alert card ────────────────────────────────────────────────────────

function HealthAlertCard({
  alert,
  onPress,
}: {
  alert: PreventiveAlert;
  onPress: (a: PreventiveAlert) => void;
}) {
  const sev = SEVERITY_CFG[alert.severity] ?? SEVERITY_CFG.MEDIUM;
  return (
    <Pressable
      onPress={() => onPress(alert)}
      style={({ pressed }) => ({ opacity: pressed ? 0.87 : 1 })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: alert.isRead ? '#fff' : sev.bg,
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: sev.color + '18',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <Ionicons name={sev.icon} size={20} color={sev.color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1, marginRight: 6 }} numberOfLines={2}>
              {alert.title}
            </Text>
            {!alert.isRead && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sev.color }} />
            )}
          </View>
          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 17 }} numberOfLines={3}>
            {alert.message}
          </Text>
          <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>
            {(() => { const ms = alert.createdAt ? new Date(alert.createdAt).getTime() : NaN; return isNaN(ms) ? '' : `${timeAgo(ms)} · `; })()}{alert.severity}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationScreen() {
  const {
    physicianAlerts,
    physicianAlertsLoading,
    physicianAlertsError,
    fetchPhysicianAlerts,
    markPhysicianAlertRead,
    markAllPhysicianAlertsRead,
  } = usePhysicianHealthStore();

  const {
    notifications: caseNotifications,
    unreadCount: caseUnreadCount,
    markRead: markCaseRead,
    markAllRead: markAllCasesRead,
  } = useNotificationStore();

  useEffect(() => {
    fetchPhysicianAlerts();
  }, [fetchPhysicianAlerts]);

  const onRefresh = useCallback(async () => {
    await fetchPhysicianAlerts();
  }, [fetchPhysicianAlerts]);

  const handleHealthAlertPress = useCallback((alert: PreventiveAlert) => {
    markPhysicianAlertRead(alert.id);
    if (alert.diagnosisId) {
      router.push({ pathname: '/(prof-tab)/caseReview', params: { caseId: alert.diagnosisId } });
    }
  }, [markPhysicianAlertRead]);

  const handleCaseNotificationPress = useCallback((n: PhysicianNotification) => {
    markCaseRead(n.id);
    if (n.caseId) {
      router.push({ pathname: '/(prof-tab)/caseQueue', params: { caseId: n.caseId } });
    }
  }, [markCaseRead]);

  // Merge both sources into a unified list sorted newest-first, unread items first
  const unified: UnifiedItem[] = useMemo(() => {
    const items: UnifiedItem[] = [
      ...caseNotifications.map((n) => ({
        kind: 'case' as const,
        data: n,
        sortKey: n.timestamp,
      })),
      ...physicianAlerts.map((a) => ({
        kind: 'health' as const,
        data: a,
        sortKey: new Date(a.createdAt).getTime(),
      })),
    ];

    return items.sort((a, b) => {
      // Unread first
      const aRead = a.kind === 'case' ? a.data.isRead : a.data.isRead;
      const bRead = b.kind === 'case' ? b.data.isRead : b.data.isRead;
      if (aRead !== bRead) return aRead ? 1 : -1;
      // Then newest first
      return b.sortKey - a.sortKey;
    });
  }, [caseNotifications, physicianAlerts]);

  const totalUnread = caseUnreadCount + physicianAlerts.filter((a) => !a.isRead).length;
  const isLoading = physicianAlertsLoading && physicianAlerts.length === 0 && caseNotifications.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color="#0AADA2" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#111827' }}>
          Notifications
        </Text>
        {/* Total unread badge */}
        {totalUnread > 0 ? (
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
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{totalUnread}</Text>
          </View>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>

      {/* Mark all read */}
      {totalUnread > 0 && (
        <Pressable
          onPress={() => { markAllCasesRead(); markAllPhysicianAlertsRead(); }}
          style={{ alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 12, color: '#0AADA2', fontWeight: '600' }}>Mark all read</Text>
        </Pressable>
      )}

      {/* Loading */}
      {isLoading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Loading notifications…</Text>
        </View>
      )}

      {/* Error (only when there's nothing to show at all) */}
      {!isLoading && !!physicianAlertsError && unified.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="cloud-offline-outline" size={48} color="#9ca3af" />
          <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151' }}>
            Could not load health alerts
          </Text>
          <Pressable
            onPress={fetchPhysicianAlerts}
            style={{ marginTop: 16, backgroundColor: '#0AADA2', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && unified.length === 0 && !physicianAlertsError && (
        <ScrollView
          contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={physicianAlertsLoading} onRefresh={onRefresh} tintColor="#0AADA2" />}
        >
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <View style={{ marginBottom: 16, height: 64, width: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: '#f3f4f6' }}>
              <Ionicons name="notifications-off" size={32} color="#999" />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '600', color: '#111827' }}>No notifications</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6b7280', textAlign: 'center', paddingHorizontal: 32 }}>
              New cases, case updates, and health alerts will appear here.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Unified notification list */}
      {unified.length > 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={physicianAlertsLoading} onRefresh={onRefresh} tintColor="#0AADA2" />}
        >
          {unified.map((item) =>
            item.kind === 'case' ? (
              <CaseNotificationCard
                key={`case-${item.data.id}`}
                notification={item.data}
                onPress={handleCaseNotificationPress}
              />
            ) : (
              <HealthAlertCard
                key={`health-${item.data.id}`}
                alert={item.data}
                onPress={handleHealthAlertPress}
              />
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
