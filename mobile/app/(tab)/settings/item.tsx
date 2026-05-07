import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { LabeledInput } from 'components/LabeledInput';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

export default function ItemScreen() {
  const user = useAuthStore((s) => s.user);
  const getProfile = useProfileStore((s) => s.getProfile);
  const updateBasicProfile = useProfileStore((s) => s.updateBasicProfile);
  const loading = useProfileStore((s) => s.loading);
  const error = useProfileStore((s) => s.error);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  useEffect(() => {
    if (!user) return;
    const [first = '', ...rest] = (user.name ?? '').split(' ');
    setFirstName(first);
    setLastName(rest.join(' '));
    setPhone(user.phone ?? '');
    setDob(user.dob ?? '');
    setGender(user.gender ?? '');
  }, [user]);

  const initials = useMemo(
    () =>
      user?.name
        ?.split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'P',
    [user?.name],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const ok = await getProfile();
    setIsRefreshing(false);
    if (!ok) {
      Alert.alert('Refresh Failed', error || 'Could not fetch your details.');
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Validation', 'First and last name are required.');
      return;
    }
    if (dob.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
      Alert.alert('Validation', 'Date of birth must use YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);
    const ok = await updateBasicProfile({
      name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || undefined,
      dob: dob.trim() || undefined,
      gender: gender.trim() || undefined,
    });
    setIsSaving(false);

    if (ok) {
      Alert.alert('Saved', 'Your details were updated successfully.');
      return;
    }

    Alert.alert('Update Failed', 'Could not update your details. Please try again.');
  };

  if (loading && !user) return <ProfileSkeleton />;

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-[#F0F8F8] items-center justify-center">
        <Text className="text-gray-600">Profile unavailable</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F8F8' }}>
      <SafeAreaView className="flex-1 bg-[#F0F8F8]" edges={['top']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >
          <View className="px-4 pt-4 pb-3">
            <View className="flex-row items-center mb-4">
              <TouchableOpacity
                onPress={() => router.back()}
                className="h-10 w-10 rounded-full bg-white items-center justify-center border border-[#DCEFEF]"
              >
                <Ionicons name="arrow-back" size={18} color="#111827" />
              </TouchableOpacity>
              <Text className="flex-1 text-center text-2xl font-black text-gray-900 mr-10">Item</Text>
            </View>

            <View className="bg-white rounded-3xl p-5 shadow-sm border border-[#DCEFEF] overflow-hidden mb-4">
              <View className="absolute -top-6 -right-4 h-28 w-28 rounded-full bg-[#E4F6F6]" />
              <View className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-[#F2FBFB]" />

              <View className="flex-row items-center">
                <View className="h-16 w-16 rounded-full bg-[#DFF4F3] items-center justify-center mr-4 border-2 border-[#A9E4E2]">
                  <Text className="text-xl font-black text-[#0B8E8D]">{initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-2xl font-black text-gray-900">{firstName || 'Patient'}</Text>
                  <Text className="text-sm text-gray-500">Update your personal details</Text>
                </View>
              </View>
            </View>

            <View className="bg-white rounded-3xl p-5 border border-[#DCEFEF]">
              <Text className="text-lg font-black text-gray-900 mb-3">User Details</Text>

              <LabeledInput
                label="First Name"
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter first name"
              />
              <LabeledInput
                label="Last Name"
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter last name"
              />
              <LabeledInput
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
              <LabeledInput
                label="Date of Birth"
                value={dob}
                onChangeText={setDob}
                placeholder="YYYY-MM-DD"
              />
              <LabeledInput
                label="Gender"
                value={gender}
                onChangeText={setGender}
                placeholder="male / female / other"
              />

              <TouchableOpacity
                onPress={handleSave}
                activeOpacity={0.85}
                disabled={isSaving}
                className="mt-2 bg-[#0B8E8D] rounded-xl py-4 items-center"
              >
                <Text className="text-white font-bold text-base">
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <PatientBottomTabBar />
    </View>
  );
}
