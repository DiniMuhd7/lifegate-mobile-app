/**
 * Alert & Threshold Settings Screen
 *
 * Allows admins to view and update configurable system thresholds:
 *  - SLA windows and breach flags
 *  - Payment limits
 *  - Security timeouts
 *  - NDPA response windows
 *  - Escalation thresholds
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdminStore } from '../../stores/admin-store';
import type { AlertThreshold } from '../../types/admin-types';

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: string; accent: string }> = {
  sla:        { label: 'SLA Thresholds',      icon: 'timer',           accent: '#f97316' },
  payment:    { label: 'Payment Limits',       icon: 'card',            accent: '#22c55e' },
  security:   { label: 'Security',             icon: 'lock-closed',     accent: '#ef4444' },
  ndpa:       { label: 'NDPA / Data Privacy',  icon: 'shield-checkmark',accent: '#0AADA2' },
  escalation: { label: 'Escalation Rules',     icon: 'arrow-up-circle', accent: '#8b5cf6' },
  general:    { label: 'General',              icon: 'settings',        accent: '#64748b' },
};

// ─── Threshold Row ────────────────────────────────────────────────────────────

function ThresholdRow({
  threshold,
  onSave,
}: {
  threshold: AlertThreshold;
  onSave: (key: string, value: number, enabled: boolean) => Promise<void>;
}) {
  const [value, setValue] = useState(String(threshold.value));
  const [enabled, setEnabled] = useState(threshold.enabled);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleValueChange = (text: string) => {
    setValue(text);
    setDirty(true);
  };

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    setDirty(true);
  };

  const handleSave = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      Alert.alert('Invalid Value', 'Please enter a valid number');
      return;
    }
    setSaving(true);
    try {
      await onSave(threshold.key, parsed, enabled);
      setDirty(false);
    } catch {
      Alert.alert('Error', 'Failed to update threshold');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="py-4 border-b border-gray-50">
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-gray-800">{threshold.label}</Text>
          {threshold.description ? (
            <Text className="text-xs text-gray-400 mt-0.5 leading-4">{threshold.description}</Text>
          ) : null}
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: '#d1d5db', true: '#0AADA2' }}
          thumbColor="#fff"
          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
        />
      </View>

      <View className="flex-row items-center gap-3">
        <View className="flex-1 flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <TextInput
            className="flex-1 text-sm text-gray-800"
            value={value}
            onChangeText={handleValueChange}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
          />
          {threshold.unit ? (
            <Text className="text-xs text-gray-400 ml-1">{threshold.unit}</Text>
          ) : null}
        </View>

        {dirty && (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="flex-row items-center bg-teal-600 rounded-xl px-4 py-2">
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="checkmark" size={16} color="#fff" />}
            <Text className="text-sm font-semibold text-white ml-1.5">
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {threshold.updatedBy && (
        <Text className="text-[10px] text-gray-400 mt-1.5">
          Last updated by {threshold.updatedBy}
        </Text>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AlertSettingsScreen() {
  const router = useRouter();
  const { alertThresholds, thresholdsLoading, error, fetchAlertThresholds, updateAlertThreshold, clearError } = useAdminStore();

  useEffect(() => { fetchAlertThresholds(); }, [fetchAlertThresholds]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  const handleSave = useCallback(
    async (key: string, value: number, enabled: boolean) => {
      await updateAlertThreshold(key, value, enabled);
    },
    [updateAlertThreshold]
  );

  // Group thresholds by category
  const grouped = alertThresholds.reduce<Record<string, AlertThreshold[]>>((acc, t) => {
    const cat = t.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Header */}
      <LinearGradient
        colors={['#0AADA2', '#07827A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        className="px-5 pt-4 pb-5">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-8 h-8 rounded-full bg-white/15 items-center justify-center mr-3">
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">Alert & Threshold Settings</Text>
            <Text className="text-white/70 text-xs mt-0.5">Configure system-wide alert thresholds</Text>
          </View>
          <TouchableOpacity onPress={() => fetchAlertThresholds()}>
            <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {thresholdsLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0AADA2" />
          <Text className="text-sm text-gray-500 mt-3">Loading thresholds…</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
          {alertThresholds.length === 0 ? (
            <View className="items-center py-16">
              <Ionicons name="settings-outline" size={48} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">No thresholds configured</Text>
            </View>
          ) : (
            categories.map((cat) => {
              const meta = CATEGORY_META[cat] ?? { label: cat, icon: 'settings', accent: '#64748b' };
              return (
                <View key={cat} className="mb-6">
                  {/* Category header */}
                  <View className="flex-row items-center mb-3">
                    <View
                      className="w-7 h-7 rounded-lg items-center justify-center mr-2"
                      style={{ backgroundColor: meta.accent + '18' }}>
                      <Ionicons name={meta.icon as any} size={15} color={meta.accent} />
                    </View>
                    <Text className="text-base font-bold text-gray-800">{meta.label}</Text>
                  </View>

                  {/* Threshold rows */}
                  <View
                    className="bg-white rounded-2xl px-4"
                    style={{ elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
                    {grouped[cat].map((t) => (
                      <ThresholdRow key={t.key} threshold={t} onSave={handleSave} />
                    ))}
                  </View>
                </View>
              );
            })
          )}

          {/* Info banner */}
          <View className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6 flex-row">
            <Ionicons name="information-circle" size={18} color="#3b82f6" style={{ marginTop: 1 }} />
            <Text className="text-xs text-blue-700 ml-2 flex-1 leading-4">
              Changes take effect immediately. SLA thresholds affect breach detection which runs every minute via background job.
            </Text>
          </View>

          <View className="h-10" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
