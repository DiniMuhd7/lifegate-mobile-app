import { View, Text, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Activity } from '../types/professional-types';

interface ActivityListProps {
  activities: Activity[];
  onActivityPress?: (activity: Activity) => void;
}

const getActivityColor = (caseType: string) => {
  switch (caseType) {
    case 'Verified':
      return '#10B981';
    case 'Escalated':
      return '#F59E0B';
    case 'Rejected':
      return '#EF4444';
    default:
      return '#6B7280';
  }
};

const getActivityIcon = (caseType: string) => {
  switch (caseType) {
    case 'Verified':
      return 'checkmark-circle';
    case 'Escalated':
      return 'alert-circle';
    case 'Rejected':
      return 'close-circle';
    default:
      return 'information-circle';
  }
};

const ActivityItemComponent = ({ item, onPress }: { item: Activity; onPress?: () => void }) => (
  <Pressable
    onPress={onPress}
    className="mx-6 mb-3 bg-white border border-gray-100 rounded-lg p-4 flex-row items-center"
  >
    <View
      className="w-12 h-12 rounded-lg items-center justify-center mr-3"
      style={{ backgroundColor: getActivityColor(item.caseType) + '20' }}
    >
      <Ionicons
        name={getActivityIcon(item.caseType) as any}
        size={20}
        color={getActivityColor(item.caseType)}
      />
    </View>

    <View className="flex-1">
      <Text className="text-xs font-semibold text-teal-600 mb-1">Patient ID {item.patientId}</Text>
      <Text className="text-sm font-semibold text-gray-900 mb-1">
        {item.caseType} Case
      </Text>
      <Text className="text-xs text-gray-500">{item.condition}</Text>
    </View>

    <View className="items-end">
      <Text className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
        {item.timeAgo}
      </Text>
    </View>
  </Pressable>
);

export const ActivityList = ({ activities, onActivityPress }: ActivityListProps) => {
  return (
    <View className="flex-1">
      <View className="px-6 mb-3 mt-2">
        <Text className="text-lg font-semibold text-gray-900">Recent Activities</Text>
      </View>

      {activities.length > 0 ? (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ActivityItemComponent
              item={item}
              onPress={() => onActivityPress?.(item)}
            />
          )}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-gray-500 text-center">No recent activities</Text>
        </View>
      )}
    </View>
  );
};
