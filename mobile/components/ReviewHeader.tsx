import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// import { useState } from 'react';

interface ReviewHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export const ReviewHeader = ({ selectedDate, onDateChange }: ReviewHeaderProps) => {
  // const [showDatePicker, setShowDatePicker] = useState(false);

  // const formatDate = (date: Date) => {
  //   const options: Intl.DateTimeFormatOptions = {
  //     weekday: 'short',
  //     month: 'short',
  //     day: 'numeric',
  //     year: 'numeric',
  //   };
  //   return date.toLocaleDateString('en-US', options);
  // };

  // const handlePreviousDay = () => {
  //   const prevDay = new Date(selectedDate);
  //   prevDay.setDate(prevDay.getDate() - 1);
  //   onDateChange(prevDay);
  // };

  // const handleNextDay = () => {
  //   const nextDay = new Date(selectedDate);
  //   nextDay.setDate(nextDay.getDate() + 1);
  //   onDateChange(nextDay);
  // };

  return (
    <View className="px-6 py-4 border-b border-gray-200 bg-white">
      <View className="flex-row items-center">
        <Pressable className="p-2 -ml-2">
          <Ionicons name="chevron-back" size={24} color="#0AADA2" />
        </Pressable>
        <Text className="text-2xl font-bold text-gray-900 flex-1">Review Analysis</Text>
      </View>
{/* 
      <View className="flex-row items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
        <Pressable onPress={handlePreviousDay} className="p-2">
          <Ionicons name="chevron-back" size={24} color="#0AADA2" />
        </Pressable>

        <Pressable
          onPress={() => setShowDatePicker(!showDatePicker)}
          className="flex-1 items-center"
        >
          <View className="flex-row items-center gap-1">
            <Text className="text-sm text-gray-600">Today, </Text>
            <Text className="text-sm font-medium text-gray-800">{formatDate(selectedDate)}</Text>
            <Ionicons name="chevron-down" size={16} color="#666" />
          </View>
        </Pressable>

        <Pressable onPress={handleNextDay} className="p-2">
          <Ionicons name="chevron-forward" size={24} color="#0AADA2" />
        </Pressable>
      </View> */}
    </View>
  );
};
