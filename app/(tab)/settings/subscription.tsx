import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';

export default function SubscriptionScreen() {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const packages = [
    {
      id: '2000',
      price: '₦2,000',
      diagnoses: '5 Diagnoses',
      description: 'Access to Diagnoses from a licensed Clinician',
    },
    {
      id: '5000',
      price: '₦5,000',
      diagnoses: '15 Diagnoses',
      description: 'Access to Diagnoses from a licensed Clinician',
    },
    {
      id: '10000',
      price: '₦10,000',
      diagnoses: '40 Diagnoses',
      description: 'Access to Diagnoses from a licensed Clinician',
    },
  ];

  const PackageCard = ({ pkg }: { pkg: (typeof packages)[0] }) => (
    <Pressable
      onPress={() => setSelectedPackage(selectedPackage === pkg.id ? null : pkg.id)}
      className={`mb-4 rounded-2xl border-2 p-4 flex-row items-center justify-between ${
        selectedPackage === pkg.id
          ? 'border-[#0EA5A4] bg-[#E0F7F6]'
          : 'border-[#0EA5A4] bg-[#F0FFFE]'
      }`}>
      <View className="flex-1">
        <Text className="text-xl font-bold text-gray-900">{pkg.price}</Text>
        <Text className="mt-2 text-base font-semibold text-gray-900">
          {pkg.diagnoses}
        </Text>
        <Text className="mt-1 text-sm text-gray-600">{pkg.description}</Text>
      </View>
      <View
        className={`h-6 w-6 rounded border-2 ${
          selectedPackage === pkg.id
            ? 'border-[#0EA5A4] bg-[#0EA5A4]'
            : 'border-[#0EA5A4] bg-transparent'
        }`}>
        {selectedPackage === pkg.id && (
          <Ionicons name="checkmark" size={20} color="white" />
        )}
      </View>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-6 ">
        <Pressable onPress={() => router.back()} className="p-2">
          <Ionicons name="chevron-back" size={24} color="black" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Subscription</Text>
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 pt-6">
        {/* Credit Balance Section */}
        <View className="mb-8 items-center">
          <Text className="text-base text-gray-600 mb-2">LifeGate Credit Balance</Text>
          <Text className="text-4xl font-bold text-gray-900">₦0.00</Text>
          <Pressable className="mt-4 rounded-lg bg-[#0EA5A4] px-8 py-3 flex-row items-center justify-center">
            <Text className="text-base font-semibold text-white">Add Credit</Text>
            <Ionicons name="arrow-forward" size={18} color="white" className="ml-2" />
          </Pressable>
        </View>

        {/* Transaction Section */}
        <View className="mb-8 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="history" size={20} color="#0EA5A4" />
            <Text className="ml-2 text-base font-semibold text-gray-900">Transaction</Text>
          </View>
          <Pressable className="flex-row items-center">
            <Text className="text-sm font-semibold text-[#0EA5A4]">View all</Text>
            <Ionicons name="chevron-forward" size={16} color="#0EA5A4" />
          </Pressable>
        </View>

        {/* Available Packages Section */}
        <View className="mb-8">
          <Text className="mb-4 text-base font-semibold text-gray-900">
            Available Packages
          </Text>
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </View>

        {/* Subscribe Button */}
        <Pressable
          disabled={!selectedPackage}
          className={`rounded-lg py-4 items-center mb-8 ${
            selectedPackage ? 'bg-[#0EA5A4]' : 'bg-gray-300'
          }`}>
          <Text className="text-base font-semibold text-white">Subscribe</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}