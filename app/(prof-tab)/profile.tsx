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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// Mock physician data
const mockPhysicianData = {
  id: 'LG-202685',
  name: 'Kayode Hammed',
  email: 'Dockay@gmail.com',
  phone: '+234 810 123 4567',
  specialization: 'Optician',
  licenseNumber: 'OPT-2019-001',
  yearsOfExperience: '8',
  isVerified: true,
};

export default function PhysicianProfileScreen() {
  // Modal visibility states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Edit profile form state
  const [editForm, setEditForm] = useState({
    firstName: mockPhysicianData.name.split(' ')[0],
    lastName: mockPhysicianData.name.split(' ').slice(1).join(' '),
    phone: mockPhysicianData.phone,
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

  const handleSaveEdit = () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'Please fill in all fields');
      return;
    }
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

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
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
    } catch {
      Alert.alert('Error', 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const names = name.split(' ');
    return names.map(n => n.charAt(0).toUpperCase()).join('');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center px-6 pt-12 pb-4 border-b border-gray-200">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#0AADA2" />
          </TouchableOpacity>
          <Text className="flex-1 text-center text-xl font-bold text-gray-800 mr-8">
            Physician Profile
          </Text>
        </View>

        {/* Content Section */}
        <View className="px-6 py-6">
          {/* Profile Header with Avatar */}
          <View className="mb-8 flex-row items-center gap-4">
            {/* Avatar */}
            <View className="h-16 w-16 items-center justify-center rounded-full bg-teal-600">
              <Text className="text-xl font-bold text-white">
                {getInitials(mockPhysicianData.name)}
              </Text>
            </View>

            {/* Name and Specialization */}
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-bold text-gray-800">
                  Dr. {mockPhysicianData.name.split(' ')[0]}
                </Text>
                {mockPhysicianData.isVerified && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
              </View>
              <Text className="mt-1 text-sm text-gray-600">
                {mockPhysicianData.specialization}
              </Text>
            </View>
          </View>

          {/* Personal Information Section */}
          <View className="mb-8">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-800">
                <Ionicons name="person-circle" size={18} color="#0AADA2" /> Personal Information
              </Text>
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                className="flex-row items-center gap-1"
              >
                <Ionicons name="pencil" size={18} color="#0AADA2" />
                <Text className="font-semibold text-teal-600">Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Info Card */}
            <View className="space-y-4 rounded-lg bg-gray-50 p-4">
              {/* Full Name */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Full Name</Text>
                <Text className="text-base text-gray-800">{mockPhysicianData.name}</Text>
              </View>

              {/* Email */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Email</Text>
                <Text className="text-base text-gray-800">{mockPhysicianData.email}</Text>
              </View>

              {/* Phone */}
              <View className="pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Phone</Text>
                <Text className="text-base text-gray-800">{mockPhysicianData.phone}</Text>
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
                <Text className="text-base text-gray-800">{mockPhysicianData.specialization}</Text>
              </View>

              {/* License Number */}
              <View className="border-b border-gray-200 pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">License Number</Text>
                <Text className="text-base text-gray-800">{mockPhysicianData.licenseNumber}</Text>
              </View>

              {/* Years of Experience */}
              <View className="pb-3">
                <Text className="mb-1 text-xs font-semibold text-gray-500">Years of Experience</Text>
                <Text className="text-base text-gray-800">{mockPhysicianData.yearsOfExperience} years</Text>
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
                className="flex-row items-center gap-1"
              >
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
                  onChangeText={text => setEditForm({ ...editForm, firstName: text })}
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
                  onChangeText={text => setEditForm({ ...editForm, lastName: text })}
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
                  onChangeText={text => setEditForm({ ...editForm, phone: text })}
                  keyboardType="phone-pad"
                  placeholderTextColor="#999"
                />
              </View>

              {/* Info Text */}
              <View className="rounded-lg bg-gray-100 p-3">
                <Text className="text-xs text-gray-600">
                  <Text className="font-semibold">Note:</Text> Email and Professional Information cannot be changed.
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
                    onChangeText={text => setPasswordForm({ ...passwordForm, current: text })}
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
                    onChangeText={text => setPasswordForm({ ...passwordForm, new: text })}
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
                    onChangeText={text => setPasswordForm({ ...passwordForm, confirm: text })}
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