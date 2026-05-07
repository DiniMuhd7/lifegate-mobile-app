import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { DOBInput } from 'components/DobPicker';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Hausa', value: 'Hausa' },
  { label: 'Yoruba', value: 'Yoruba' },
  { label: 'Igbo', value: 'Igbo' },
  { label: 'Pidgin', value: 'Pidgin' },
  { label: 'French', value: 'French' },
  { label: 'Swahili', value: 'Swahili' },
  { label: 'Arabic', value: 'Arabic' },
];

function ActionModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#DCEFEF',
            padding: 18,
          }}
          onPress={() => {}}
        >
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 12 }}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ItemScreen() {
  const user = useAuthStore((s) => s.user);
  const getProfile = useProfileStore((s) => s.getProfile);
  const updateBasicProfile = useProfileStore((s) => s.updateBasicProfile);
  const updateHealthProfile = useProfileStore((s) => s.updateHealthProfile);
  const changePassword = useProfileStore((s) => s.changePassword);
  const requestAccountDeletion = useProfileStore((s) => s.requestAccountDeletion);
  const cancelAccountDeletion = useProfileStore((s) => s.cancelAccountDeletion);
  const loading = useProfileStore((s) => s.loading);
  const error = useProfileStore((s) => s.error);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [langSaving, setLangSaving] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [delLoading, setDelLoading] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState('');
  const [language, setLanguage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  useEffect(() => {
    if (!user) return;
    const [first = '', ...rest] = (user.name ?? '').split(' ');
    setFirstName(first);
    setLastName(rest.join(' '));
    setPhone(user.phone ?? '');
    setDob(user.dob ? (() => { const [y,m,d] = user.dob!.split('-').map(Number); const p = new Date(y, m-1, d); return isNaN(p.getTime()) ? null : p; })() : null);
    setGender(user.gender ?? '');
    setLanguage(user.language ?? '');
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
    const dobStr = dob ? `${dob.getFullYear()}-${String(dob.getMonth()+1).padStart(2,'0')}-${String(dob.getDate()).padStart(2,'0')}` : undefined;

    setIsSaving(true);
    const ok = await updateBasicProfile({
      name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || undefined,
      dob: dobStr || undefined,
      gender: gender.trim() || undefined,
    });
    setIsSaving(false);

    if (ok) {
      Alert.alert('Saved', 'Your details were updated successfully.');
      return;
    }

    Alert.alert('Update Failed', 'Could not update your details. Please try again.');
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation', 'Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'New password and confirm password do not match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }

    setPwdSaving(true);
    const ok = await changePassword(currentPassword, newPassword, confirmPassword);
    setPwdSaving(false);

    if (!ok) {
      Alert.alert('Update Failed', 'Could not change password. Please try again.');
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPwdModal(false);
    Alert.alert('Saved', 'Password changed successfully.');
  };

  const handleSaveLanguage = async () => {
    setLangSaving(true);
    const ok = await updateHealthProfile({ language: language || null });
    setLangSaving(false);
    if (ok) {
      Alert.alert('Saved', 'Language preference updated successfully.');
      return;
    }
    Alert.alert('Update Failed', 'Could not save language preference.');
  };

  const handleRequestDelete = async () => {
    setDelLoading(true);
    const ok = await requestAccountDeletion();
    setDelLoading(false);
    setShowDeleteModal(false);
    if (ok) {
      Alert.alert('Deletion Scheduled', 'Your account is scheduled for deletion in 90 days.');
      await getProfile();
      return;
    }
    Alert.alert('Error', 'Failed to schedule account deletion.');
  };

  const handleCancelDelete = async () => {
    setDelLoading(true);
    const ok = await cancelAccountDeletion();
    setDelLoading(false);
    setShowCancelModal(false);
    if (ok) {
      Alert.alert('Cancelled', 'Account deletion has been cancelled.');
      await getProfile();
      return;
    }
    Alert.alert('Error', 'Failed to cancel account deletion.');
  };

  const isDeletionScheduled = !!user?.deletion_scheduled_at;
  const deletionDate = isDeletionScheduled
    ? new Date(user.deletion_scheduled_at as string).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

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
      <ActionModal visible={showPwdModal} onClose={() => setShowPwdModal(false)} title="Change Password">
        <LabeledInput
          label="Current Password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password"
          secureToggle
        />
        <LabeledInput
          label="New Password"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password"
          secureToggle
        />
        <LabeledInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          secureToggle
        />

        <TouchableOpacity
          onPress={handleChangePassword}
          activeOpacity={0.85}
          disabled={pwdSaving}
          className="mt-2 bg-[#0B8E8D] rounded-xl py-3 items-center"
        >
          {pwdSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Update Password</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowPwdModal(false)}
          activeOpacity={0.85}
          className="mt-2 bg-[#E5E7EB] rounded-xl py-3 items-center"
        >
          <Text className="text-gray-900 font-bold text-base">Cancel</Text>
        </TouchableOpacity>
      </ActionModal>

      <ActionModal visible={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Account?">
        <Text className="text-sm text-gray-600 mb-4">
          Your account will be permanently deleted after a 90-day grace period. You can cancel anytime before then.
        </Text>
        <TouchableOpacity
          onPress={handleRequestDelete}
          activeOpacity={0.85}
          disabled={delLoading}
          className="bg-red-500 rounded-xl py-3 items-center"
        >
          {delLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Schedule Deletion</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowDeleteModal(false)}
          activeOpacity={0.85}
          className="mt-2 bg-[#E5E7EB] rounded-xl py-3 items-center"
        >
          <Text className="text-gray-900 font-bold text-base">Keep Account</Text>
        </TouchableOpacity>
      </ActionModal>

      <ActionModal visible={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancel Deletion?">
        <Text className="text-sm text-gray-600 mb-4">
          This will restore your account to active status and stop the scheduled deletion.
        </Text>
        <TouchableOpacity
          onPress={handleCancelDelete}
          activeOpacity={0.85}
          disabled={delLoading}
          className="bg-[#0B8E8D] rounded-xl py-3 items-center"
        >
          {delLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Keep My Account</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowCancelModal(false)}
          activeOpacity={0.85}
          className="mt-2 bg-[#E5E7EB] rounded-xl py-3 items-center"
        >
          <Text className="text-gray-900 font-bold text-base">Go Back</Text>
        </TouchableOpacity>
      </ActionModal>

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
              <Text className="flex-1 text-center text-2xl font-black text-gray-900 mr-10">Manage</Text>
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
              <DOBInput
                label="Date of Birth"
                value={dob}
                onChange={(date) => setDob(date)}
              />
              <Dropdown
                label="Gender"
                options={[
                  { label: 'Male', value: 'male' },
                  { label: 'Female', value: 'female' },
                  { label: 'Other', value: 'other' },
                ]}
                placeholder="Select gender"
                selectedValue={gender}
                onChange={(value: string) => setGender(value)}
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

            <View className="bg-white rounded-3xl p-5 border border-[#DCEFEF] mt-4">
              <Text className="text-lg font-black text-gray-900 mb-3">Security</Text>

              <TouchableOpacity
                onPress={() => setShowPwdModal(true)}
                activeOpacity={0.8}
                className="flex-row items-center justify-between py-3 border-b border-[#F1F5F9]"
              >
                <Text className="text-gray-900 font-semibold">Change Password</Text>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </TouchableOpacity>

              {isDeletionScheduled ? (
                <>
                  <View className="py-3 border-b border-[#F1F5F9]">
                    <Text className="text-gray-900 font-semibold">Deletion Scheduled</Text>
                    <Text className="text-sm text-gray-500 mt-1">Account will be deleted on {deletionDate}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowCancelModal(true)}
                    activeOpacity={0.85}
                    className="mt-3 bg-[#0B8E8D] rounded-xl py-3 items-center"
                  >
                    <Text className="text-white font-bold text-base">Cancel Scheduled Deletion</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowDeleteModal(true)}
                  activeOpacity={0.85}
                  className="mt-3 bg-red-500 rounded-xl py-3 items-center"
                >
                  <Text className="text-white font-bold text-base">Delete Account</Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="bg-white rounded-3xl p-5 border border-[#DCEFEF] mt-4">
              <Text className="text-lg font-black text-gray-900 mb-3">Preferences</Text>

              <Dropdown
                label="Language"
                options={LANGUAGE_OPTIONS}
                placeholder="Select language"
                selectedValue={language}
                onChange={(value: string) => setLanguage(value)}
              />

              <TouchableOpacity
                onPress={handleSaveLanguage}
                activeOpacity={0.85}
                disabled={langSaving}
                className="mt-2 bg-[#0B8E8D] rounded-xl py-4 items-center"
              >
                {langSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base">Save Language</Text>
                )}
              </TouchableOpacity>
            </View>

            <View className="bg-white rounded-3xl p-5 border border-[#DCEFEF] mt-4">
              <Text className="text-lg font-black text-gray-900 mb-2">Account Details</Text>
              <TouchableOpacity
                onPress={() => router.push('/(tab)/settings/manage-profile')}
                activeOpacity={0.8}
                className="flex-row items-center justify-between py-3"
              >
                <Text className="text-gray-900 font-semibold">Health Profile</Text>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <PatientBottomTabBar />
    </View>
  );
}
