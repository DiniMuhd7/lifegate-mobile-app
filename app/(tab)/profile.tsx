import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from 'stores/auth-store';

export default function PatientProfileScreen() {
  const { user, changePassword, loading } = useAuthStore();

  // Modal visibility states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Edit profile form state
  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    phone: user?.phone || '',
  });

  // Change password form state
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
    showCurrent: false,
    showNew: false,
    showConfirm: false,
  });

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-600">No user data available</Text>
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
    // Validation
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
        setPasswordForm({
          current: '',
          new: '',
          confirm: '',
          showCurrent: false,
          showNew: false,
          showConfirm: false,
        });
        setShowPasswordModal(false);
      } else {
        Alert.alert('Error', 'Failed to change password. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An error occurred while changing password');
    }
  };

  const getInitials = (name: string) => {
    const names = name.split(' ');
    return names.map((n) => n.charAt(0).toUpperCase()).join('');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header Section with Gradient */}
        <LinearGradient
          colors={['#0AADA2', '#043B3C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="pb-8 pt-4"
        >
          <View className="items-center">
            {/* Avatar Circle with Initials */}
            <View className="h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20">
              <Text className="text-2xl font-bold text-white">{getInitials(user.name)}</Text>
            </View>

            {/* Name */}
            <Text className="mt-4 text-center text-2xl font-bold text-white">Patient Profile</Text>

            {/* Patient ID */}
            <Text className="mt-1 text-center text-sm text-white/80">ID: {user.id}</Text>
          </View>
        </LinearGradient>

        {/* Content Section */}
        <View className="px-6 py-6">
          {/* Personal Information Section */}
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="flex-1 text-lg font-bold text-gray-800">
                <Ionicons name="person-circle" size={18} color="#0AADA2" /> Personal Information
              </Text>
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                className="rounded-lg bg-gray-100 p-2"
              >
                <Ionicons name="pencil" size={18} color="#0AADA2" />
              </TouchableOpacity>
            </View>

            {/* Info Rows */}
            <View className="space-y-4 rounded-lg bg-gray-50 p-4">
              {/* Full Name */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Full Name</Text>
                <Text className="text-base text-gray-800">{user.name}</Text>
              </View>

              {/* Email */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Email</Text>
                <Text className="text-base text-gray-800">{user.email}</Text>
              </View>

              {/* Phone Number */}
              {user.phone && (
                <View className="border-b border-gray-200 pb-3">
                  <Text className="mb-1 text-xs font-semibold text-gray-500">Phone Number</Text>
                  <Text className="text-base text-gray-800">{user.phone}</Text>
                </View>
              )}

              {/* Gender */}
              {user.gender && (
                <View className="border-b border-gray-200 pb-3">
                  <Text className="mb-1 text-xs font-semibold text-gray-500">Gender</Text>
                  <Text className="text-base text-gray-800">{user.gender}</Text>
                </View>
              )}

              {/* Date of Birth */}
              {user.dob && (
                <View className="pb-3">
                  <Text className="mb-1 text-xs font-semibold text-gray-500">Date of Birth</Text>
                  <Text className="text-base text-gray-800">{user.dob}</Text>
                </View>
              )}
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
                className="rounded-lg bg-teal-50 px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-teal-600">Change Password</Text>
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

          {/* Language Section */}
          {user.language && (
            <View>
              <Text className="mb-3 text-lg font-bold text-gray-800">
                <Ionicons name="globe" size={18} color="#0AADA2" /> Language
              </Text>
              <View className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <Text className="text-base text-gray-800">{user.language}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8">
            {/* Header */}
            <View className="mb-6 flex-row items-center justify-between">
              <Text className="text-xl font-bold text-gray-800">Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
              {/* First Name */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-gray-700">First Name</Text>
                <TextInput
                  className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-800"
                  placeholder="First Name"
                  value={editForm.firstName}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, firstName: text })
                  }
                  placeholderTextColor="#999"
                />
              </View>

              {/* Last Name */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-gray-700">Last Name</Text>
                <TextInput
                  className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-800"
                  placeholder="Last Name"
                  value={editForm.lastName}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, lastName: text })
                  }
                  placeholderTextColor="#999"
                />
              </View>

              {/* Phone Number */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-gray-700">Phone Number</Text>
                <TextInput
                  className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-800"
                  placeholder="Phone Number"
                  value={editForm.phone}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, phone: text })
                  }
                  keyboardType="phone-pad"
                  placeholderTextColor="#999"
                />
              </View>

              {/* Info Text */}
              <View className="rounded-lg bg-gray-100 p-3">
                <Text className="text-xs text-gray-600">
                  <Text className="font-semibold">Note:</Text> Email, Date of Birth and Patient ID cannot be changed.
                </Text>
              </View>
            </ScrollView>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-3"
              >
                <Text className="text-center font-semibold text-gray-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdit}
                className="flex-1 rounded-lg bg-teal-600 py-3"
              >
                <Text className="text-center font-semibold text-white">Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8">
            {/* Header */}
            <View className="mb-6 flex-row items-center justify-between">
              <Text className="text-xl font-bold text-gray-800">Change Password</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <ScrollView showsVerticalScrollIndicator={false} className="mb-6">
              {/* Current Password */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-gray-700">Current Password</Text>
                <View className="relative">
                  <TextInput
                    className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-800 pr-12"
                    placeholder="Enter current password"
                    value={passwordForm.current}
                    onChangeText={(text) =>
                      setPasswordForm({ ...passwordForm, current: text })
                    }
                    secureTextEntry={!passwordForm.showCurrent}
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setPasswordForm({
                        ...passwordForm,
                        showCurrent: !passwordForm.showCurrent,
                      })
                    }
                    className="absolute right-3 top-3.5"
                  >
                    <Ionicons
                      name={passwordForm.showCurrent ? 'eye-off' : 'eye'}
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* New Password */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-gray-700">New Password</Text>
                <View className="relative">
                  <TextInput
                    className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-800 pr-12"
                    placeholder="Enter new password"
                    value={passwordForm.new}
                    onChangeText={(text) =>
                      setPasswordForm({ ...passwordForm, new: text })
                    }
                    secureTextEntry={!passwordForm.showNew}
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setPasswordForm({
                        ...passwordForm,
                        showNew: !passwordForm.showNew,
                      })
                    }
                    className="absolute right-3 top-3.5"
                  >
                    <Ionicons
                      name={passwordForm.showNew ? 'eye-off' : 'eye'}
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-gray-700">Confirm New Password</Text>
                <View className="relative">
                  <TextInput
                    className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-gray-800 pr-12"
                    placeholder="Confirm new password"
                    value={passwordForm.confirm}
                    onChangeText={(text) =>
                      setPasswordForm({ ...passwordForm, confirm: text })
                    }
                    secureTextEntry={!passwordForm.showConfirm}
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setPasswordForm({
                        ...passwordForm,
                        showConfirm: !passwordForm.showConfirm,
                      })
                    }
                    className="absolute right-3 top-3.5"
                  >
                    <Ionicons
                      name={passwordForm.showConfirm ? 'eye-off' : 'eye'}
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowPasswordModal(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-3"
              >
                <Text className="text-center font-semibold text-gray-700">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={loading}
                className="flex-1 rounded-lg bg-teal-600 py-3"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-center font-semibold text-white">Change Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
