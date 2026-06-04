import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthStore } from 'stores/health-store';
import type { PreventiveAlert, AlertCategory, AlertSeverity } from 'types/health-types';

// ─── Config ───────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<AlertSeverity, { color: string; bg: string; border: string }> = {
  LOW:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  HIGH:     { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  CRITICAL: { color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe' },
};

const CATEGORY_CFG: Record<AlertCategory, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  follow_up:  { icon: 'calendar-outline',      label: 'Follow-up'        },
  recurring:  { icon: 'refresh-circle-outline', label: 'Recurring'        },
  medication: { icon: 'medkit-outline',         label: 'Medication'       },
  urgent:     { icon: 'alert-circle-outline',   label: 'Urgent'           },
  preventive: { icon: 'shield-checkmark-outline', label: 'Preventive'     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── AlertCard ────────────────────────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onRead,
}: {
  alert: PreventiveAlert;
  onRead: (id: string) => void;
}) {
  const sev = SEVERITY_CFG[alert.severity] ?? SEVERITY_CFG.MEDIUM;
  const cat = CATEGORY_CFG[alert.category as AlertCategory] ?? CATEGORY_CFG.preventive;

  const handlePress = () => {
    onRead(alert.id);
    if (alert.diagnosisId) {
      router.push(`/(tab)/diagnosis/${alert.diagnosisId}` as never);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.87 : 1, marginHorizontal: 16, marginBottom: 10 })}
    >
      <View
        style={{
          backgroundColor: alert.isRead ? '#fff' : sev.bg,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: alert.isRead ? '#f3f4f6' : sev.border,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        }}
        className='m-2'
      >
        {/* Icon */}
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
          <Ionicons name={cat.icon} size={20} color={sev.color} />
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: '#111827',
                flex: 1,
                marginRight: 8,
              }}
              numberOfLines={2}
            >
              {alert.title}
            </Text>
            {/* Unread dot */}
            {!alert.isRead && (
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sev.color }}
              />
            )}
          </View>

          <Text style={{ fontSize: 12, color: '#6b7280', lineHeight: 17, marginBottom: 8 }}>
            {alert.message}
          </Text>

          {/* Footer chips */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {/* Category chip */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: sev.color + '18',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                gap: 4,
              }}
            >
              <Ionicons name={cat.icon} size={10} color={sev.color} />
              <Text style={{ fontSize: 10, color: sev.color, fontWeight: '600' }}>{cat.label}</Text>
            </View>

            {/* Severity chip */}
            <View
              style={{
                backgroundColor: '#f3f4f6',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '600' }}>
                {alert.severity}
              </Text>
            </View>

            {/* Scheduled date */}
            {!!alert.scheduledFor && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="calendar-outline" size={10} color="#9ca3af" />
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                  Due {formatDate(alert.scheduledFor)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────────────────────

export default function PatientAlertsScreen() {
  const {
    patientAlerts,
    alertsLoading,
    alertsError,
    fetchPatientAlerts,
    markAlertRead,
    markAllAlertsRead,
    unreadAlertCount,
  } = useHealthStore();

  useEffect(() => {
    fetchPatientAlerts();
  }, []);

  const onRefresh = useCallback(async () => {
    await fetchPatientAlerts();
  }, [fetchPatientAlerts]);

  // Sort: unread first, then by severity weight
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...patientAlerts].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f3f4f6',
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{ padding: 6, marginRight: 8, borderRadius: 20, backgroundColor: '#f3f4f6' }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827' }}>
            Health Alerts
          </Text>
          {unreadAlertCount > 0 && (
            <Text style={{ fontSize: 12, color: '#dc2626', marginTop: 1, fontWeight: '600' }}>
              {unreadAlertCount} unread
            </Text>
          )}
        </View>
        {unreadAlertCount > 0 && (
          <Pressable
            onPress={markAllAlertsRead}
            style={{ padding: 6, borderRadius: 20, backgroundColor: '#f3f4f6' }}
            hitSlop={8}
          >
            <Ionicons name="checkmark-done-outline" size={20} color="#0AADA2" />
          </Pressable>
        )}
      </View>

      {/* Loading */}
      {alertsLoading && patientAlerts.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text style={{ marginTop: 12, color: '#6b7280', fontSize: 14 }}>Loading alerts…</Text>
        </View>
      )}

      {/* Error */}
      {!alertsLoading && !!alertsError && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="cloud-offline-outline" size={48} color="#9ca3af" />
          <Text style={{ marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151' }}>
            Could not load alerts
          </Text>
          <Pressable
            onPress={fetchPatientAlerts}
            style={{ marginTop: 16, backgroundColor: '#0AADA2', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Empty state */}
      {!alertsLoading && !alertsError && patientAlerts.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#f0fdfa',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Ionicons name="shield-checkmark" size={34} color="#0AADA2" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>All clear!</Text>
          <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
            No health alerts at the moment. We'll notify you when action is needed.
          </Text>
        </View>
      )}

      {/* Alert list */}
      {sorted.length > 0 && (
        <ScrollView
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={alertsLoading} onRefresh={onRefresh} tintColor="#0AADA2" />
          }
        >
          {/* Legend */}
          <Text
            style={{
              fontSize: 11,
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginHorizontal: 16,
              marginBottom: 10,
              fontWeight: '600',
            }}
          >
            {sorted.length} alert{sorted.length !== 1 ? 's' : ''} · tap to view report
          </Text>
          {sorted.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onRead={markAlertRead} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}