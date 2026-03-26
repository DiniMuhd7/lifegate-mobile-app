import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileHeader } from 'components/ProfileHeader';
import { EditProfileModal } from 'components/EditProfileModal';
import { ChangePasswordModal } from 'components/ChangePasswordModal';

export default function PhysicianProfileScreen() {
  const { user, logout } = useAuthStore();
  const { getProfile, loading } = useProfileStore();

  // Modal visibility states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editFormLoading, setEditFormLoading] = useState(false);
  const [passwordFormLoading, setPasswordFormLoading] = useState(false);

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
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  const handleSaveEdit = (values: { firstName: string; lastName: string; phone: string }) => {
    // For now, just show success (no backend logic as per requirements)
    setEditFormLoading(true);
    setTimeout(() => {
      Alert.alert('Success', 'Profile updated successfully');
      setEditFormLoading(false);
      setShowEditModal(false);
    }, 500);
  };

  const handleChangePassword = async (values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    setPasswordFormLoading(true);
    try {
      // For now, just simulate (no backend logic as per requirements)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      Alert.alert('Success', 'Password changed successfully');
      setShowPasswordModal(false);
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
            isVerified={true}
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

            {/* Last Password Change Info */}
            <View className="rounded-lg bg-gray-50 p-4">
              <Text className="text-sm text-gray-600">
                Password last changed: &nbsp;
                <Text className="font-semibold text-gray-800">Recently</Text>
              </Text>
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
