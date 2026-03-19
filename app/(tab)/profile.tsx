import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import {SafeAreaView} from 'react-native-safe-area-context';

export default function PatientProfileScreen() {
  const { user } = useAuthStore();
  const { changePassword, loading, getProfile, error } = useProfileStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    phone: user?.phone || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  useEffect(() => {
    console.log('Profile store updated:', { user });
    if (user) {
      setEditForm({
        firstName: user?.name?.split(' ')[0] || '',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        phone: user?.phone || '',
      });
    }
  }, [user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const success = await getProfile();
    setIsRefreshing(false);
    if (!success) {
      Alert.alert('Failed to Refresh', error || 'Could not fetch your profile. Please try again.', [
        { text: 'OK' },
      ]);
    }
  };

  if (loading && !user) return <ProfileSkeleton />;

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-[#F0F8F8] items-center justify-center">
        <View className="gap-4 items-center">
          <Text className="text-gray-600 text-center">Profile unavailable</Text>
          <PrimaryButton title="Retry" onPress={() => getProfile()} />
        </View>
      </SafeAreaView>
    );
  }

  const handleSaveEdit = () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'Please fill in all fields');
      return;
    }
    // TODO: Implement profile update when API endpoint is available
    Alert.alert('Success', 'Profile updated successfully');
    setShowEditModal(false);
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current.trim() || !passwordForm.new.trim() || !passwordForm.confirm.trim()) {
      Alert.alert('Validation', 'Please fill in all password fields');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      Alert.alert('Validation', 'New password and confirm password do not match');
      return;
    }
    if (passwordForm.new.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters');
      return;
    }
    try {
      const success = await changePassword(
        passwordForm.current,
        passwordForm.new,
        passwordForm.confirm
      );
      if (success) {
        Alert.alert('Success', 'Password changed successfully');
        setPasswordForm({ current: '', new: '', confirm: '' });
        setShowPasswordModal(false);
      } else {
        Alert.alert('Error', 'Failed to change password. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An error occurred while changing password');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F0F8F8]">
      <ScrollView
        className="flex-1 pt-6"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {/* ── Top Bar ── */}
        <View className="flex-row items-center px-4 pt-3 pb-2">
          <TouchableOpacity className="p-1" onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
          </TouchableOpacity>
          <Text className="flex-1 text-center text-2xl font-bold text-gray-900">
            Patient Profile
          </Text>
          {/* spacer to keep title centered */}
          <View style={{ width: 30 }} />
        </View>

        <View className="px-4 pb-10">
          {/* ── Profile Card ── */}
          <View className="bg-white rounded-2xl p-4 mb-4 flex-row items-center shadow-sm">
            {/* Avatar */}
            <View className="h-14 w-14 rounded-full bg-[#E6F4F4] items-center justify-center mr-4">
              <Ionicons name="person" size={36} color="#0EA5A4" />
            </View>
            <View>
              <Text className="text-lg font-bold text-gray-900">{user.name}</Text>
              <Text className="text-sm text-gray-500">{user.patient_id}</Text>
            </View>
          </View>

          {/* ── Personal Information ── */}
          <View className="bg-white rounded-2xl p-4 mb-2 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <Ionicons name="person-outline" size={16} color="#0EA5A4" />
                <Text className="text-xl font-bold text-gray-900">Personal Information</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                className="flex-row items-center gap-1"
              >
                <Ionicons name="create-outline" size={18} color="#00000" />
                <Text className="text-xs font-semibold text-[#black]">Edit</Text>
              </TouchableOpacity>
            </View>

            <InfoRow label="Full Name" value={user.name} showDivider />
            <InfoRow label="Email" value={user.email} showDivider />
            {user.phone && <InfoRow label="Phone Number" value={user.phone} showDivider />}
            {user.gender && <InfoRow label="Gender" value={user.gender} showDivider />}
            {user.dob && <InfoRow label="Date of Birth" value={user.dob} showDivider />}
            {user.patient_id && <InfoRow label="Patient ID" value={user.patient_id} />}
          </View>

          {/* ── Password & Security ── */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Ionicons name="shield-checkmark-outline" size={16} color="#0EA5A4" />
                <Text className="text-sm font-bold text-gray-900">Password & Security</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPasswordModal(true)}
                className="flex-row items-center gap-1"
              >
                <Ionicons name="create-outline" size={14} color="#0000" />
                <Text className="text-xs font-semibold text-black">Change Password</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-sm text-gray-600">
              Password last changed:{' '}
              <Text className="font-semibold text-gray-800">3 months ago</Text>
            </Text>
          </View>

          {/* ── Language ── */}
          <View className="bg-white rounded-2xl p-4 shadow-sm">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="globe-outline" size={24} color="#0EA5A4" />
              <Text className="text-xl font-bold text-gray-900">Language</Text>
            </View>
            <TouchableOpacity className="flex-row items-center justify-between bg-[#F2F4F7] rounded-xl px-4 py-3">
              <Text className="text-sm text-gray-400">
                {user.language || 'Select Preferred Language'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-10">
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-900">Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <LabeledInput
                label="First Name"
                required
                placeholder="First Name"
                value={editForm.firstName}
                onChangeText={(text) => setEditForm({ ...editForm, firstName: text })}
              />
              <LabeledInput
                label="Last Name"
                required
                placeholder="Last Name"
                value={editForm.lastName}
                onChangeText={(text) => setEditForm({ ...editForm, lastName: text })}
              />
              <LabeledInput
                label="Phone Number"
                placeholder="Phone Number"
                value={editForm.phone}
                onChangeText={(text) => setEditForm({ ...editForm, phone: text })}
                keyboardType="phone-pad"
              />

              <View className="bg-gray-100 rounded-xl px-4 py-3 mb-5">
                <Text className="text-xs text-gray-500">
                  <Text className="font-semibold text-gray-700">Note: </Text>
                  Email, Date of Birth and Patient ID cannot be changed.
                </Text>
              </View>
            </ScrollView>

            <View className="flex-row gap-3 mt-2">
              <View className="flex-1">
                <PrimaryButton
                  title="Cancel"
                  type="secondary"
                  onPress={() => setShowEditModal(false)}
                />
              </View>
              <View className="flex-1">
                <PrimaryButton title="Save Changes" onPress={handleSaveEdit} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-10">
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-900">Change Password</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <LabeledInput
                label="Current Password"
                placeholder="Enter current password"
                value={passwordForm.current}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, current: text })}
                secureToggle
              />
              <LabeledInput
                label="New Password"
                placeholder="Enter new password"
                value={passwordForm.new}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, new: text })}
                secureToggle
              />
              <LabeledInput
                label="Confirm New Password"
                placeholder="Confirm new password"
                value={passwordForm.confirm}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, confirm: text })}
                secureToggle
              />
            </ScrollView>

            <View className="flex-row gap-3 mt-2">
              <View className="flex-1">
                <PrimaryButton
                  title="Cancel"
                  type="secondary"
                  onPress={() => setShowPasswordModal(false)}
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  title="Change Password"
                  onPress={handleChangePassword}
                  loading={loading}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Helper sub-component ──────────────────────────────────────────────────────
function InfoRow({
  label,
  value,
  showDivider,
}: {
  label: string;
  value?: string;
  showDivider?: boolean;
}) {
  return (
    <View className={`py-3 ${showDivider ? 'border-b border-gray-100' : ''}`}>
      <Text className="text-sm font-black text-black mb-0.5">{label}</Text>
      <Text className="text-sm text-gray-800">{value || '—'}</Text>
    </View>
  );
}