import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { ProfessionalService } from 'services/professional-service';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileHeader } from 'components/ProfileHeader';
import { EditProfileModal } from 'components/EditProfileModal';
import { ChangePasswordModal } from 'components/ChangePasswordModal';

export default function PhysicianProfileScreen() {
  const { user, logout } = useAuthStore();
  const { getProfile, changePassword, loading } = useProfileStore();

  // Modal visibility states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editFormLoading, setEditFormLoading] = useState(false);
  const [passwordFormLoading, setPasswordFormLoading] = useState(false);

  // AI mode state
  const [aiModeEnabled, setAiModeEnabled] = useState(false);
  const [aiModeLoading, setAiModeLoading] = useState(false);

  // Edit profile form state
  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    phone: user?.phone || '',
  });

  useEffect(() => {
    // Fetch profile on mount
    getProfile();
    // Update edit form with user data
    if (user?.name) {
      const [firstName, ...lastNameArr] = user.name.split(' ');
      setEditForm({
        firstName,
        lastName: lastNameArr.join(' '),
        phone: user.phone || '',
      });
    }
    // Fetch AI mode status
    ProfessionalService.getAIMode().then(setAiModeEnabled).catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  const handleSaveEdit = async (values: { firstName: string; lastName: string; phone: string }) => {
    setEditFormLoading(true);
    const fullName = [values.firstName.trim(), values.lastName.trim()].filter(Boolean).join(' ');
    try {
      await ProfessionalService.updateProfile(fullName, values.phone.trim());
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, name: fullName, phone: values.phone.trim() } : s.user,
      }));
      Alert.alert('Success', 'Profile updated successfully');
      setShowEditModal(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to update profile');
    } finally {
      setEditFormLoading(false);
    }
  };

  const handleToggleAIMode = async (value: boolean) => {
    setAiModeLoading(true);
    try {
      const newValue = await ProfessionalService.toggleAIMode(value);
      setAiModeEnabled(newValue);
      Alert.alert(
        'AI Mode',
        newValue
          ? 'AI mode is now enabled. Cases assigned to you will be handled automatically by the AI.'
          : 'AI mode disabled. You will handle cases manually.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to toggle AI mode');
    } finally {
      setAiModeLoading(false);
    }
  };

  const handleChangePassword = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setPasswordFormLoading(true);
    try {
      const success = await changePassword(
        values.currentPassword,
        values.newPassword,
        values.confirmPassword,
      );
      if (success) {
        Alert.alert('Success', 'Password changed successfully');
        setShowPasswordModal(false);
      } else {
        Alert.alert('Error', 'Failed to change password. Please check your current password and try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to change password. Please try again.');
    } finally {
      setPasswordFormLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#0AADA2" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center px-6 pb-4 pt-12">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#0AADA2" />
          </TouchableOpacity>
          <Text className="mr-8 flex-1 text-center text-xl font-bold text-gray-800">
            Physician Profile
          </Text>
        </View>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>

        {/* Content Section */}
        <View className="px-6 py-6">
          {/* Profile Header Component */}
          <ProfileHeader
            name={user?.name || 'User'}
            specialization={user?.specialization || 'Not available'}
            isVerified={user?.mdcn_verified ?? false}
          />

          {/* Personal Information Section */}
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-800">
                <Ionicons name="person-circle" size={18} color="#0AADA2" /> Personal Information
              </Text>
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                className="flex-row items-center gap-1">
                <Ionicons name="pencil" size={18} color="#0AADA2" />
                <Text className="font-semibold text-teal-600">Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Info Card */}
            <View className="space-y-4 rounded-lg bg-gray-50 p-4">
              {/* Full Name */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Full Name</Text>
                <Text className="text-base text-gray-800">{user?.name || 'Not available'}</Text>
              </View>

              {/* Email */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Email</Text>
                <Text className="text-base text-gray-800">{user?.email || 'Not available'}</Text>
              </View>

              {/* Phone */}
              <View className="pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Phone</Text>
                <Text className="text-base text-gray-800">{user?.phone || 'Not available'}</Text>
              </View>
            </View>
          </View>

          {/* Professional Information Section */}
          <View className="mb-8">
            <Text className="mb-4 text-lg font-bold text-gray-800">
              <Ionicons name="school" size={18} color="#0AADA2" /> Professional Information
            </Text>

            <View className="space-y-4 rounded-lg bg-gray-50 p-4">
              {/* Specialization */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Specialization</Text>
                <Text className="text-base text-gray-800">
                  {user?.specialization || 'Not available'}
                </Text>
              </View>
              {/* Years of Experience */}
              <View className="pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">
                  Years of Experience
                </Text>
                <Text className="text-base text-gray-800">
                  {user?.yearsOfExperience ? `${user.yearsOfExperience} years` : 'Not available'}
                </Text>
              </View>
            </View>
          </View>

          {/* Password & Security Section */}
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-800">
                <Ionicons name="lock-closed" size={18} color="#0AADA2" /> Password & Security
              </Text>
              <TouchableOpacity
                onPress={() => setShowPasswordModal(true)}
                className="flex-row items-center gap-1">
                <Ionicons name="pencil" size={18} color="#0AADA2" />
                <Text className="font-semibold text-teal-600">Change Password</Text>
              </TouchableOpacity>
            </View>

            <View className="rounded-lg bg-gray-50 p-4">
              <Text className="text-sm text-gray-600">
                Use the "Change Password" button above to update your password.
                A confirmation email will be sent after any change.
              </Text>
            </View>
          </View>

          {/* Earnings Section */}
          <View className="mb-8">
            <Text className="mb-4 text-lg font-bold text-gray-800">
              <Ionicons name="cash-outline" size={18} color="#0AADA2" /> Earnings
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(prof-tab)/earnings')}
              className="flex-row items-center justify-between rounded-lg bg-gray-50 p-4">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full bg-teal-50 items-center justify-center">
                  <Ionicons name="wallet-outline" size={20} color="#0AADA2" />
                </View>
                <View>
                  <Text className="text-sm font-semibold text-gray-800">Earnings Dashboard</Text>
                  <Text className="text-xs text-gray-500 mt-0.5">View earnings, payouts and case history</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* AI Mode Section */}
          <View className="mb-8">
            <Text className="mb-4 text-lg font-bold text-gray-800">
              <Ionicons name="hardware-chip-outline" size={18} color="#0AADA2" /> AI Mode
            </Text>
            <View className="rounded-lg bg-gray-50 p-4">
              <View className="flex-row items-center justify-between">
                <View className="mr-4 flex-1">
                  <Text className="text-sm font-semibold text-gray-800">Enable AI Mode</Text>
                  <Text className="mt-1 text-xs text-gray-500">
                    When enabled, your account operates like an OpenClaw AI physician.
                    Patient cases assigned to you will be handled automatically by the AI
                    until you disable this mode.
                  </Text>
                </View>
                <Switch
                  value={aiModeEnabled}
                  onValueChange={handleToggleAIMode}
                  disabled={aiModeLoading}
                  trackColor={{ false: '#d1d5db', true: '#0AADA2' }}
                  thumbColor={aiModeEnabled ? '#ffffff' : '#f3f4f6'}
                />
              </View>
              {aiModeEnabled && (
                <View className="mt-3 flex-row items-center gap-2 rounded-md bg-teal-50 p-2">
                  <Ionicons name="information-circle-outline" size={16} color="#0AADA2" />
                  <Text className="flex-1 text-xs text-teal-700">
                    AI mode is active. Cases will be handled automatically.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View className="flex-row items-center justify-center">
          <TouchableOpacity
            onPress={handleLogout}
            className="w-3/4 items-center rounded-lg bg-red-600 py-4">
            <Text className="text-base font-semibold text-white">Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditModal}
        initialValues={editForm}
        loading={editFormLoading}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEdit}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        visible={showPasswordModal}
        loading={passwordFormLoading}
        onClose={() => setShowPasswordModal(false)}
        onSave={handleChangePassword}
      />
    </SafeAreaView>
  );
}
