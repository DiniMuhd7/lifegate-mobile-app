import { View, Text, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Dropdown } from '@/components/DropDown';
import { issues } from '@/constants/constants';

export default function SendFeedbackScreen() {
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [lifegateId, setLifegateId] = useState('');

  return (
    <View className="flex-1 bg-[#F5F7F7]">
      
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="#1f2937" />
        </Pressable>

        <Text className="text-xl font-semibold text-gray-900">
          Send Feedback
        </Text>

        <View className="w-10" />
      </View>

      {/* Form Card */}
      <View className="mx-4 mt-4 p-4">
      
        <Dropdown
          label="Type of Issue"
          placeholder="Select Type of Issue"
          options={issues}
          selectedValue={issueType}
          onChange={(value: string) => setIssueType(value)}
          triggerClassName="bg-[#efefef]"
        />

        {/* Issue Description */}
        <Text className="text-[14px] text-gray-700 mb-2">
          Issue Description
        </Text>

        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Briefly describe your issue"
          placeholderTextColor="#9ca3af"
          multiline
          className="bg-[#efefef] rounded-xl px-4 py-3 text-[13px] text-gray-800 h-28 mb-4"
          textAlignVertical="top"
        />

        {/* LifeGate ID */}
        <Text className="text-[14px] text-gray-700 mb-2">
          LifeGate ID
        </Text>

        <TextInput
          value={lifegateId}
          onChangeText={setLifegateId}
          placeholder="Enter your LifeGate ID"
          placeholderTextColor="#9ca3af"
          className="bg-[#efefef] rounded-xl px-4 py-3  h-16 text-[13px] text-gray-800"
        />
      </View>

      {/* Submit Button */}
      <View className="mt-auto px-6 pb-10">
        <Pressable className="bg-[#38887D] rounded-full py-4 items-center">
          <Text className="text-white text-[16px] font-medium">
            Submit
          </Text>
        </Pressable>
      </View>
    </View>
  );
}