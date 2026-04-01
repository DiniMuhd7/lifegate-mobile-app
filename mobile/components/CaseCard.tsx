import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CaseQueueItem, CaseUrgency } from '../types/professional-types';

interface CaseCardProps {
  item: CaseQueueItem;
  onTakeCase?: (id: string) => void;
  onPress?: (id: string) => void;
  isTaking?: boolean;
}

const URGENCY_COLORS: Record<CaseUrgency, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

const URGENCY_BG: Record<CaseUrgency, string> = {
  LOW: 'bg-green-100',
  MEDIUM: 'bg-amber-100',
  HIGH: 'bg-orange-100',
  CRITICAL: 'bg-red-100',
};

const URGENCY_TEXT: Record<CaseUrgency, string> = {
  LOW: 'text-green-700',
  MEDIUM: 'text-amber-700',
  HIGH: 'text-orange-700',
  CRITICAL: 'text-red-700',
};

const STATUS_BAR: Record<string, string> = {
  Pending: '#a78bfa',
  Active: '#3b82f6',
  Completed: '#22c55e',
};

export function CaseCard({ item, onTakeCase, onPress, isTaking }: CaseCardProps) {
  const urgency = (item.urgency ?? 'LOW') as CaseUrgency;
  const barColor = STATUS_BAR[item.status] ?? '#e5e7eb';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress?.(item.id)}
      className="bg-white rounded-2xl mb-3 mx-4 overflow-hidden"
      style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
    >
      {/* Left status bar */}
      <View className="flex-row">
        <View style={{ width: 4, backgroundColor: barColor }} />

        <View className="flex-1 px-4 py-4">
          {/* Header row */}
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-sm font-semibold text-gray-900 flex-1 mr-2" numberOfLines={1}>
              {item.patientName}
            </Text>
            <View className={`px-2 py-0.5 rounded-full ${URGENCY_BG[urgency]}`}>
              <Text className={`text-xs font-bold ${URGENCY_TEXT[urgency]}`}>
                {urgency}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text className="text-xs font-medium text-gray-700 mb-1" numberOfLines={1}>
            {item.title}
          </Text>

          {/* Symptom snippet */}
          <Text className="text-xs text-gray-500 mb-3" numberOfLines={2}>
            {item.symptomSnippet || 'No symptom details available.'}
          </Text>

          {/* Footer row */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              {/* Time in queue */}
              <View className="flex-row items-center bg-gray-100 rounded-full px-2 py-0.5">
                <Text className="text-xs text-gray-500">⏱ {item.timeInQueue}</Text>
              </View>

              {/* Queue position for pending */}
              {item.status === 'Pending' && item.queuePosition != null && (
                <View className="flex-row items-center bg-purple-50 rounded-full px-2 py-0.5">
                  <Text className="text-xs text-purple-600">#{item.queuePosition}</Text>
                </View>
              )}
            </View>

            {/* Action button */}
            {item.status === 'Pending' && onTakeCase && (
              <TouchableOpacity
                onPress={() => onTakeCase(item.id)}
                disabled={isTaking}
                className="bg-blue-600 rounded-full px-4 py-1.5"
              >
                {isTaking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white text-xs font-semibold">Take Case</Text>
                )}
              </TouchableOpacity>
            )}

            {item.status === 'Active' && (
              <View className="bg-blue-50 rounded-full px-3 py-1">
                <Text className="text-blue-700 text-xs font-semibold">In Review</Text>
              </View>
            )}

            {item.status === 'Completed' && (
              <View className="bg-green-50 rounded-full px-3 py-1">
                <Text className="text-green-700 text-xs font-semibold">Completed</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
