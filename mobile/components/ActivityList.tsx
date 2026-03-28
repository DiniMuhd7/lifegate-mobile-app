import { View, Text, FlatList, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Activity, ActivityType } from '../types/professional-types';

interface ActivityListProps {
  activities: Activity[];
  onActivityPress?: (activity: Activity) => void;
}

type FilterType = 'All' | ActivityType;

const FILTERS: FilterType[] = ['All', 'Pending', 'Verified', 'Escalated', 'Rejected'];

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  Verified:  { color: '#10B981', bg: '#ECFDF5', icon: 'checkmark-circle',  label: 'Verified'  },
  Escalated: { color: '#F59E0B', bg: '#FFF7ED', icon: 'alert-circle',      label: 'Escalated' },
  Rejected:  { color: '#EF4444', bg: '#FEF2F2', icon: 'close-circle',      label: 'Rejected'  },
  Pending:   { color: '#6B7280', bg: '#F3F4F6', icon: 'time-outline',      label: 'Pending'   },
};

const getConfig = (caseType: string) =>
  STATUS_CONFIG[caseType] ?? STATUS_CONFIG['Pending'];

// ─── Detail Modal ────────────────────────────────────────────────────────────
const ActivityDetailModal = ({
  activity,
  onClose,
}: {
  activity: Activity | null;
  onClose: () => void;
}) => {
  if (!activity) return null;
  const cfg = getConfig(activity.caseType);

  return (
    <Modal visible={!!activity} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable onPress={() => {}} className="bg-white rounded-t-3xl p-6">
          {/* Handle */}
          <View className="w-12 h-1.5 rounded-full bg-gray-200 self-center mb-5" />

          {/* Status badge */}
          <View className="flex-row items-center mb-5">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
              style={{ backgroundColor: cfg.bg }}
            >
              <Ionicons name={cfg.icon} size={24} color={cfg.color} />
            </View>
            <View>
              <Text className="text-xs text-gray-400 font-medium">Case Status</Text>
              <Text className="text-lg font-bold" style={{ color: cfg.color }}>
                {cfg.label}
              </Text>
            </View>
          </View>

          {/* Detail rows */}
          <View
            className="bg-gray-50 rounded-2xl p-4 gap-3"
          >
            {activity.patientName ? (
              <View className="flex-row items-center">
                <Ionicons name="person-outline" size={16} color="#6B7280" />
                <Text className="ml-3 text-xs text-gray-500 w-24">Patient Name</Text>
                <Text className="flex-1 text-sm font-semibold text-gray-800">{activity.patientName}</Text>
              </View>
            ) : null}

            <View className="flex-row items-center">
              <Ionicons name="id-card-outline" size={16} color="#6B7280" />
              <Text className="ml-3 text-xs text-gray-500 w-24">Patient ID</Text>
              <Text className="flex-1 text-sm font-semibold text-gray-800">{activity.patientId}</Text>
            </View>

            {activity.condition ? (
              <View className="flex-row items-start">
                <Ionicons name="medical-outline" size={16} color="#6B7280" />
                <Text className="ml-3 text-xs text-gray-500 w-24">Condition</Text>
                <Text className="flex-1 text-sm font-semibold text-gray-800">{activity.condition}</Text>
              </View>
            ) : null}

            <View className="flex-row items-center">
              <Ionicons name="time-outline" size={16} color="#6B7280" />
              <Text className="ml-3 text-xs text-gray-500 w-24">Updated</Text>
              <Text className="flex-1 text-sm font-semibold text-gray-800">{activity.timeAgo}</Text>
            </View>
          </View>

          <Pressable
            onPress={onClose}
            className="mt-5 py-3.5 rounded-2xl items-center"
            style={{ backgroundColor: cfg.color }}
          >
            <Text className="text-white font-bold text-sm">Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ─── Activity Row ─────────────────────────────────────────────────────────────
const ActivityRow = ({ item, onPress }: { item: Activity; onPress: () => void }) => {
  const cfg = getConfig(item.caseType);

  return (
    <Pressable
      onPress={onPress}
      className="mx-5 mb-2.5 bg-white rounded-2xl overflow-hidden"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      <View className="flex-row items-center p-4">
        {/* Icon */}
        <View
          className="w-11 h-11 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: cfg.bg }}
        >
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>

        {/* Info */}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 mb-0.5">
            <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
              {item.patientName || `Patient ${item.patientId.slice(0, 8)}`}
            </Text>
            <View
              className="px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: cfg.bg }}
            >
              <Text className="text-xs font-semibold" style={{ color: cfg.color }}>
                {cfg.label}
              </Text>
            </View>
          </View>
          {item.condition ? (
            <Text className="text-xs text-gray-500" numberOfLines={1}>{item.condition}</Text>
          ) : null}
        </View>

        {/* Time + chevron */}
        <View className="items-end ml-2 gap-1">
          <Text className="text-xs text-gray-400">{item.timeAgo}</Text>
          <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
        </View>
      </View>
    </Pressable>
  );
};

// ─── Main export ─────────────────────────────────────────────────────────────
export const ActivityList = ({ activities, onActivityPress }: ActivityListProps) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const filtered =
    activeFilter === 'All'
      ? activities
      : activities.filter((a) => a.caseType === activeFilter);

  const handlePress = (activity: Activity) => {
    setSelectedActivity(activity);
    onActivityPress?.(activity);
  };

  return (
    <View>
      {/* Section header + filter */}
      <View className="px-5 mb-3 mt-2">
        <Text className="text-base font-bold text-gray-900 mb-3">Recent Activities</Text>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => {
            const active = activeFilter === f;
            const cfg = f !== 'All' ? getConfig(f) : null;
            return (
              <Pressable
                key={f}
                onPress={() => setActiveFilter(f)}
                className="px-4 py-1.5 rounded-full border"
                style={{
                  backgroundColor: active ? (cfg?.color ?? '#0EA5A4') : '#fff',
                  borderColor: active ? (cfg?.color ?? '#0EA5A4') : '#E5E7EB',
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: active ? '#fff' : '#6B7280' }}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      {filtered.length > 0 ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ActivityRow item={item} onPress={() => handlePress(item)} />
          )}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        />
      ) : (
        <View className="items-center py-10 px-6">
          <View className="w-14 h-14 rounded-2xl bg-gray-100 items-center justify-center mb-3">
            <Ionicons name="document-text-outline" size={28} color="#9CA3AF" />
          </View>
          <Text className="text-sm font-semibold text-gray-500">No activities found</Text>
          <Text className="text-xs text-gray-400 text-center mt-1">
            {activeFilter !== 'All' ? `No ${activeFilter} cases in this period` : 'No recent activities to show'}
          </Text>
        </View>
      )}

      {/* Detail modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </View>
  );
};

