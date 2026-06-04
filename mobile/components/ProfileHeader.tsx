import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ProfileHeaderProps {
  name: string;
  specialization: string;
  isVerified?: boolean;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  name,
  specialization,
  isVerified = false,
}) => {
  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map((n) => n.charAt(0).toUpperCase())
      .join('');
  };

  const firstName = name.split(' ')[0] || 'User';

  return (
    <View className="mb-8 flex-row items-center gap-4">
      {/* Avatar */}
      <View className="h-16 w-16 items-center justify-center rounded-full bg-teal-600">
        <Text className="text-xl font-bold text-white">{getInitials(name)}</Text>
      </View>

      {/* Name and Specialization */}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-bold text-gray-800">Dr. {firstName}</Text>
          {isVerified && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
        </View>
        <Text className="mt-1 text-sm text-gray-600">{specialization}</Text>
      </View>
    </View>
  );
};
