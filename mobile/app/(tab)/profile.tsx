import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { Dropdown } from 'components/DropDown';
import {SafeAreaView} from 'react-native-safe-area-context';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Hausa', value: 'Hausa' },
  { label: 'Yoruba', value: 'Yoruba' },
  { label: 'Igbo', value: 'Igbo' },
  { label: 'Pidgin', value: 'Pidgin' },
  { label: 'French', value: 'French' },
];

export default function PatientProfileScreen() {
  const { user } = useAuthStore();
  const { changePassword, updateHealthProfile, loading, getProfile, error } = useProfileStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
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
    const [success] = await Promise.all([getProfile()]);
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

  const profileFields = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const profileCompletion = Math.round(
    (profileFields.filter((value) => !!String(value ?? '').trim()).length / profileFields.length) * 100
  );
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const initials =
    user.name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'P';
  const formattedDob = (() => {
    if (!user.dob) return '';
    const parsed = new Date(user.dob);
    if (Number.isNaN(parsed.getTime())) return user.dob;
    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  })();
  const passwordChecks = {
    minLength: passwordForm.new.length >= 6,
    hasUpper: /[A-Z]/.test(passwordForm.new),
    hasNumber: /\d/.test(passwordForm.new),
    matches: passwordForm.new.length > 0 && passwordForm.new === passwordForm.confirm,
  };
  const completionTone =
    profileCompletion >= 80
      ? { label: 'Strong profile', color: '#0F766E', bg: '#CCFBF1' }
      : profileCompletion >= 50
        ? { label: 'Almost there', color: '#B45309', bg: '#FEF3C7' }
        : { label: 'Needs updates', color: '#B91C1C', bg: '#FEE2E2' };
  const criticalHealthFields = [
    { label: 'Blood type', value: user.blood_type },
    { label: 'Genotype', value: user.genotype },
    { label: 'Allergies', value: user.allergies },
    { label: 'Emergency contact', value: user.emergency_contact },
  ];
  const missingCritical = criticalHealthFields.filter((item) => !String(item.value ?? '').trim());

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
    <View style={{ flex: 1, backgroundColor: '#F0F8F8' }}>
      <SafeAreaView className="flex-1 bg-[#F0F8F8]" edges={['top']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >
          <View className="px-4 pt-4 pb-3">
            <View className="flex-row items-center mb-3">
              <TouchableOpacity
                className="h-10 w-10 rounded-full bg-white items-center justify-center active:opacity-70"
                onPress={() => router.back()}
              >
                <Ionicons name="arrow-back" size={20} color="#1A1A2E" />
              </TouchableOpacity>
              <Text className="flex-1 text-center text-2xl font-black text-gray-900 mr-10">
                Profile
              </Text>
            </View>

            <View className="bg-white rounded-3xl p-5 shadow-sm border border-[#DCEFEF] overflow-hidden">
              <View className="absolute -top-6 -right-4 h-28 w-28 rounded-full bg-[#E4F6F6]" />
              <View className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-[#F2FBFB]" />

              <View className="flex-row items-center mb-4">
                <View className="h-16 w-16 rounded-full bg-[#DFF4F3] items-center justify-center mr-4 border-2 border-[#A9E4E2]">
                  <Text className="text-xl font-black text-[#0B8E8D]">{initials}</Text>
                  <View className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-[#10B981] border-2 border-white" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4]">
                    Welcome back
                  </Text>
                  <Text className="text-2xl font-black text-gray-900">{firstName}</Text>
                  <Text className="text-sm text-gray-500 mt-0.5">
                    {user.patient_id ? `ID: ${user.patient_id}` : 'Patient account'}
                  </Text>
                </View>
              </View>

              <View className="mb-3">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Profile Completion
                  </Text>
                  <Text className="text-sm font-bold text-gray-800">{profileCompletion}%</Text>
                </View>
                <View className="h-2.5 rounded-full bg-[#E8F3F3] overflow-hidden">
                  <View className="h-2.5 rounded-full bg-[#0EA5A4]" style={{ width: `${profileCompletion}%` }} />
                </View>
                <Text className="text-xs text-gray-500 mt-2">
                  Complete your profile for smoother consultations and follow-ups.
                </Text>
              </View>

              <View className="flex-row items-center justify-between gap-2 mt-1">
                <View className="flex-row items-center gap-2 flex-1">
                  <View
                    className="px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: completionTone.bg }}
                  >
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: completionTone.color }}
                    >
                      {completionTone.label}
                    </Text>
                  </View>
                  <View className="px-3 py-1.5 rounded-full bg-[#EEF7FF]">
                    <Text className="text-xs font-semibold text-[#1D4ED8]">
                      {user.language || 'Language not set'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setShowEditModal(true)}
                  className="h-9 px-3 rounded-lg bg-[#0EA5A4] items-center justify-center active:opacity-80"
                >
                  <Text className="text-xs font-bold text-white">Edit Profile</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="px-4 pt-1 pb-1">
            <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="medkit-outline" size={18} color="#0EA5A4" />
                  <Text className="text-lg font-black text-gray-900">Care Readiness</Text>
                </View>
                <View className={`px-2.5 py-1 rounded-full ${missingCritical.length === 0 ? 'bg-[#DCFCE7]' : 'bg-[#FEF3C7]'}`}>
                  <Text className={`text-xs font-bold ${missingCritical.length === 0 ? 'text-[#166534]' : 'text-[#92400E]'}`}>
                    {missingCritical.length === 0 ? 'Complete' : `${missingCritical.length} missing`}
                  </Text>
                </View>
              </View>

              <Text className="text-sm text-gray-600 leading-5 mb-3">
                {missingCritical.length === 0
                  ? 'Your critical safety details are complete for faster and safer triage.'
                  : `Add ${missingCritical.slice(0, 2).map((item) => item.label.toLowerCase()).join(' and ')} to improve diagnosis safety.`}
              </Text>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/settings/manage-profile')}
                  className="flex-1 h-10 rounded-xl bg-[#0EA5A4] items-center justify-center active:opacity-80"
                >
                  <Text className="text-sm font-bold text-white">Update Health Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/(tab)/settings/notification')}
                  className="h-10 px-3 rounded-xl border border-[#CDE9E8] bg-[#F1FAFA] items-center justify-center active:opacity-80"
                >
                  <Ionicons name="notifications-outline" size={18} color="#0EA5A4" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="px-4 pt-2">
            <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="person-outline" size={18} color="#0EA5A4" />
                  <Text className="text-lg font-black text-gray-900">Personal Information</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowEditModal(true)}
                  className="flex-row items-center gap-2 bg-[#E6F4F4] px-4 py-2 rounded-full active:opacity-70"
                >
                  <Ionicons name="create-outline" size={15} color="#0EA5A4" />
                  <Text className="text-sm font-semibold text-[#0EA5A4]">Edit</Text>
                </TouchableOpacity>
              </View>

              <InfoRow label="Full Name" value={user.name} showDivider />
              <InfoRow label="Email Address" value={user.email} showDivider />
              <InfoRow label="Phone Number" value={user.phone} showDivider />
              <InfoRow label="Gender" value={user.gender} showDivider />
              <InfoRow label="Date of Birth" value={formattedDob || user.dob} showDivider />
              <InfoRow label="Patient ID" value={user.patient_id} />
            </View>

            <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="shield-checkmark-outline" size={18} color="#0EA5A4" />
                  <Text className="text-lg font-black text-gray-900">Password & Security</Text>
                </View>
              </View>

              <Text className="text-sm text-gray-600 leading-5 mb-4">
                Use a strong password and update it periodically to protect your health records.
              </Text>

              <TouchableOpacity
                onPress={() => setShowPasswordModal(true)}
                className="h-11 rounded-xl bg-[#0EA5A4] items-center justify-center active:opacity-80"
              >
                <Text className="text-sm font-bold text-white">Change Password</Text>
              </TouchableOpacity>
            </View>

            <View className="bg-white rounded-2xl p-4 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="globe-outline" size={18} color="#0EA5A4" />
                  <Text className="text-lg font-black text-gray-900">Preferred Language</Text>
                </View>
                {languageSaving && <ActivityIndicator size="small" color="#0EA5A4" />}
              </View>

              <Text className="text-sm text-gray-600 mb-3 leading-5">
                This setting helps us personalize communication and instructions.
              </Text>

              <Dropdown
                label=""
                options={LANGUAGE_OPTIONS}
                placeholder="Select preferred language"
                selectedValue={user.language || ''}
                onChange={async (value) => {
                  // Optimistically update the store so the rest of the app
                  // reflects the change without waiting for the server.
                  useAuthStore.setState((s) => ({
                    user: s.user ? { ...s.user, language: value } : s.user,
                  }));
                  setLanguageSaving(true);
                  const ok = await updateHealthProfile({ language: value });
                  setLanguageSaving(false);
                  if (!ok) {
                    // Roll back optimistic update on failure.
                    useAuthStore.setState((s) => ({
                      user: s.user ? { ...s.user, language: user.language ?? '' } : s.user,
                    }));
                    Alert.alert('Error', 'Could not save language preference. Please try again.');
                  }
                }}
              />
            </View>

            <View className="bg-white rounded-2xl p-4 mt-3 shadow-sm border border-[#E7F0F0]">
              <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="heart-outline" size={18} color="#0EA5A4" />
                <Text className="text-lg font-black text-gray-900">Health Snapshot</Text>
              </View>
              <InfoRow label="Blood Type" value={user.blood_type} showDivider />
              <InfoRow label="Genotype" value={user.genotype} showDivider />
              <InfoRow label="Known Allergies" value={user.allergies} showDivider />
              <InfoRow label="Current Medications" value={user.current_medications} showDivider />
              <InfoRow label="Emergency Contact" value={user.emergency_contact} />
            </View>
          </View>
        </ScrollView>

        <Modal visible={showEditModal} transparent animationType="slide">
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-3xl p-6 pb-10 max-h-[85%]">
              <View className="w-12 h-1.5 rounded-full bg-gray-200 self-center mb-5" />
              <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 rounded-full bg-[#E8F6F6] items-center justify-center">
                    <Ionicons name="create-outline" size={16} color="#0EA5A4" />
                  </View>
                  <Text className="text-xl font-black text-gray-900">Edit Profile</Text>
                </View>
                <TouchableOpacity onPress={() => setShowEditModal(false)} className="active:opacity-70">
                  <Ionicons name="close" size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <Text className="text-sm text-gray-600 mb-4 leading-5">
                Update how your personal details appear in your account.
              </Text>

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

                <View className="bg-[#F4FAFA] rounded-xl border border-[#DFEFEF] px-4 py-3 mb-5">
                  <Text className="text-xs text-gray-500 leading-5">
                    <Text className="font-semibold text-gray-700">Note: </Text>
                    Email, date of birth, and patient ID cannot be changed from this screen.
                  </Text>
                </View>
              </ScrollView>

              <View className="flex-row gap-3 mt-2">
                <View className="flex-1">
                  <PrimaryButton title="Save Changes" onPress={handleSaveEdit} />
                </View>
                <View className="flex-1">
                  <PrimaryButton title="Cancel" type="cancel" onPress={() => setShowEditModal(false)} />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showPasswordModal} transparent animationType="slide">
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-3xl p-6 pb-10 max-h-[85%]">
              <View className="w-12 h-1.5 rounded-full bg-gray-200 self-center mb-5" />
              <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 rounded-full bg-[#E8F6F6] items-center justify-center">
                    <Ionicons name="shield-checkmark-outline" size={16} color="#0EA5A4" />
                  </View>
                  <Text className="text-xl font-black text-gray-900">Change Password</Text>
                </View>
                <TouchableOpacity onPress={() => setShowPasswordModal(false)} className="active:opacity-70">
                  <Ionicons name="close" size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <Text className="text-sm text-gray-600 mb-4 leading-5">
                For security, choose a new password with at least 6 characters.
              </Text>

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

                <View className="rounded-xl border border-[#DFEFEF] bg-[#F4FAFA] px-3 py-3 mb-4">
                  <PasswordHintRow label="At least 6 characters" ok={passwordChecks.minLength} />
                  <PasswordHintRow label="Contains an uppercase letter" ok={passwordChecks.hasUpper} />
                  <PasswordHintRow label="Contains a number" ok={passwordChecks.hasNumber} />
                  <PasswordHintRow label="Passwords match" ok={passwordChecks.matches} />
                </View>
              </ScrollView>

              <View className="flex-row gap-3 mt-2">
                <View className="flex-1">
                  <PrimaryButton
                    title="Update Password"
                    onPress={handleChangePassword}
                    loading={loading}
                  />
                </View>
                <View className="flex-1">
                  <PrimaryButton
                    title="Cancel"
                    type="cancel"
                    onPress={() => setShowPasswordModal(false)}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
      <PatientBottomTabBar activeTab="profile" />
    </View>
  );
}

function PasswordHintRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View className="flex-row items-center py-1">
      <Ionicons
        name={ok ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={ok ? '#0EA5A4' : '#9CA3AF'}
      />
      <Text className={`ml-2 text-xs ${ok ? 'text-[#0B8E8D]' : 'text-gray-500'}`}>{label}</Text>
    </View>
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
      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</Text>
      <Text className="text-base font-semibold text-gray-900">{value || 'Not provided'}</Text>
    </View>
  );
}