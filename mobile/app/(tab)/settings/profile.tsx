import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { ProfileSkeleton } from 'components/ProfileSkeleton';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';
import { LabeledInput } from 'components/LabeledInput';
import { PrimaryButton } from 'components/Button';
import { Dropdown } from 'components/DropDown';
import { DOBInput } from 'components/DobPicker';
import { SafeAreaView } from 'react-native-safe-area-context';

const T = '#0EA5A4';
const T_DARK = '#0B8E8D';
const T_LIGHT = '#E0F3F3';

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

const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelAccent} />
      <Text style={styles.sectionLabel}>{title}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  editable,
  locked,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  editable?: boolean;
  locked?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const inner = (
    <View style={[styles.infoRow, !last && styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={T} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowFieldLabel}>{label}</Text>
        <Text style={[styles.rowValue, !value && styles.rowEmpty]}>
          {value || 'Not set'}
        </Text>
      </View>
      {locked && <Ionicons name="lock-closed-outline" size={14} color="#CBD5E1" />}
      {editable && !locked && (
        <View style={styles.editChip}>
          <Ionicons name="pencil" size={11} color={T_DARK} />
        </View>
      )}
    </View>
  );
  if (editable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: '#f0fafb' }}
        style={({ pressed }) => (pressed && Platform.OS === 'ios' ? { opacity: 0.7 } : {})}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

function ActionRow({
  icon,
  label,
  sublabel,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#f0fafb' }}
      style={({ pressed }) => [
        styles.infoRow,
        !last && styles.rowBorder,
        pressed && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={T} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowValue}>{label}</Text>
        {sublabel ? <Text style={styles.rowFieldLabel}>{sublabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#C8D4D4" />
    </Pressable>
  );
}

function PasswordHintRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? T : '#9CA3AF'} />
      <Text style={{ marginLeft: 8, fontSize: 12, color: ok ? T_DARK : '#94A3B8' }}>{label}</Text>
    </View>
  );
}

function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateFromYMD(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function ManageProfileScreen() {
  const { user } = useAuthStore();
  const {
    changePassword,
    updateHealthProfile,
    updateBasicProfile,
    loading,
    getProfile,
    error,
    requestAccountDeletion,
    cancelAccountDeletion,
  } = useProfileStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelDeletionModal, setShowCancelDeletionModal] = useState(false);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    phone: user?.phone || '',
    dob: user?.dob || '',
    gender: user?.gender || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  useEffect(() => {
    if (user) {
      setEditForm({
        firstName: user?.name?.split(' ')[0] || '',
        lastName: user?.name?.split(' ').slice(1).join(' ') || '',
        phone: user?.phone || '',
        dob: user?.dob || '',
        gender: user?.gender || '',
      });
    }
  }, [user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const [success] = await Promise.all([getProfile()]);
    setIsRefreshing(false);
    if (!success) Alert.alert('Refresh Failed', error || 'Could not fetch your profile.', [{ text: 'OK' }]);
  };

  if (loading && !user) return <ProfileSkeleton />;

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F7FAFA', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person-circle-outline" size={64} color="#CBD5E1" />
        <Text style={{ color: '#64748B', marginTop: 12, marginBottom: 20 }}>Profile unavailable</Text>
        <PrimaryButton title="Retry" onPress={() => getProfile()} />
      </SafeAreaView>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────
  const profileFields = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const profileCompletion = Math.round(
    (profileFields.filter((v) => !!String(v ?? '').trim()).length / profileFields.length) * 100
  );
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const initials =
    user.name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'P';
  const formattedDob = (() => {
    if (!user.dob) return '';
    const d = new Date(user.dob);
    return Number.isNaN(d.getTime())
      ? user.dob
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
  const genderDisplay = user.gender
    ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
    : '';
  const passwordChecks = {
    minLength: passwordForm.new.length >= 6,
    hasUpper: /[A-Z]/.test(passwordForm.new),
    hasNumber: /\d/.test(passwordForm.new),
    matches: passwordForm.new.length > 0 && passwordForm.new === passwordForm.confirm,
  };
  const completionColor =
    profileCompletion >= 80 ? '#10B981' : profileCompletion >= 50 ? '#F59E0B' : '#EF4444';
  const completionLabel =
    profileCompletion >= 80 ? 'Complete' : profileCompletion >= 50 ? 'Almost there' : 'Incomplete';
  const isDeletionScheduled = !!user.deletion_scheduled_at;
  const deletionDate = isDeletionScheduled
    ? new Date(user.deletion_scheduled_at!).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'Please fill in all required fields');
      return;
    }
    const dobValue = editForm.dob.trim();
    if (dobValue) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dobValue)) {
        Alert.alert('Validation', 'Date of birth must be in YYYY-MM-DD format');
        return;
      }
      const parsed = new Date(dobValue);
      if (Number.isNaN(parsed.getTime())) {
        Alert.alert('Validation', 'Please enter a valid date of birth');
        return;
      }
    }
    const fullName = [editForm.firstName.trim(), editForm.lastName.trim()].filter(Boolean).join(' ');
    const success = await updateBasicProfile({
      name: fullName,
      phone: editForm.phone.trim() || undefined,
      dob: dobValue || undefined,
      gender: editForm.gender.trim() || undefined,
    });
    if (success) {
      Alert.alert('Success', 'Profile updated successfully');
      setShowEditModal(false);
    } else {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current.trim() || !passwordForm.new.trim() || !passwordForm.confirm.trim()) {
      Alert.alert('Validation', 'Please fill in all password fields');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      Alert.alert('Validation', 'New passwords do not match');
      return;
    }
    if (passwordForm.new.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters');
      return;
    }
    try {
      const success = await changePassword(passwordForm.current, passwordForm.new, passwordForm.confirm);
      if (success) {
        Alert.alert('Success', 'Password changed successfully');
        setPasswordForm({ current: '', new: '', confirm: '' });
        setShowPasswordModal(false);
      } else {
        Alert.alert('Error', 'Failed to change password. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleConfirmDeleteAccount = async () => {
    setDeletionLoading(true);
    const ok = await requestAccountDeletion();
    setDeletionLoading(false);
    setShowDeleteModal(false);
    if (ok) {
      Alert.alert(
        'Deletion Scheduled',
        'Your account and all associated data will be permanently deleted in 90 days. You can cancel this at any time from your profile.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Error', 'Failed to schedule account deletion. Please try again.');
    }
  };

  const handleConfirmCancelDeletion = async () => {
    setDeletionLoading(true);
    const ok = await cancelAccountDeletion();
    setDeletionLoading(false);
    setShowCancelDeletionModal(false);
    if (ok) {
      Alert.alert('Deletion Cancelled', 'Your account deletion has been cancelled. Your account is safe.', [
        { text: 'OK' },
      ]);
    } else {
      Alert.alert('Error', 'Failed to cancel deletion. Please try again.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F0F8F8' }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#1A1A2E" />
          </Pressable>
          <Text style={styles.headerTitle}>Account Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Body ── */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 56, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={T} />}
        >

          {/* ── Bio card ── */}
          <View style={styles.bioCard}>
            <View style={styles.bioRow}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>{initials}</Text>
                <View style={styles.avatarOnline} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bioName}>{user.name || firstName}</Text>
                <Text style={styles.bioPID}>
                  {user.patient_id ? `Patient · ${user.patient_id}` : 'Patient account'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowEditModal(true)}
                style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Edit profile"
              >
                <Ionicons name="pencil" size={16} color={T} />
              </Pressable>
            </View>

            {/* Completion bar */}
            <View style={styles.completionRow}>
              <Text style={styles.completionLabel}>Profile completion</Text>
              <View style={[styles.completionBadge, { backgroundColor: completionColor + '22' }]}>
                <Text style={[styles.completionBadgeText, { color: completionColor }]}>
                  {profileCompletion}% · {completionLabel}
                </Text>
              </View>
            </View>
            <View style={styles.completionTrack}>
              <View
                style={[
                  styles.completionFill,
                  { width: `${profileCompletion}%` as any, backgroundColor: completionColor },
                ]}
              />
            </View>
            {profileCompletion < 100 && (
              <Text style={styles.completionHint}>Tap any field below to complete your profile.</Text>
            )}
          </View>

          {/* ── Deletion pending banner ── */}
          {isDeletionScheduled && (
            <View style={styles.deletionBanner}>
              <Ionicons name="warning" size={18} color="#B91C1C" style={styles.deletionBannerIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deletionBannerTitle}>Account deletion scheduled</Text>
                <Text style={styles.deletionBannerSub}>
                  All data will be permanently deleted on {deletionDate}.
                </Text>
              </View>
              <Pressable
                onPress={() => setShowCancelDeletionModal(true)}
                style={({ pressed }) => [styles.deletionBannerBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.deletionBannerBtnText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {/* ── Personal Information ── */}
          <SectionLabel title="Personal Information" />
          <View style={styles.card}>
            <InfoRow
              icon="person-outline"
              label="Full Name"
              value={user.name}
              editable
              onPress={() => setShowEditModal(true)}
            />
            <InfoRow icon="mail-outline" label="Email Address" value={user.email} locked />
            <InfoRow
              icon="call-outline"
              label="Phone Number"
              value={user.phone}
              editable
              onPress={() => setShowEditModal(true)}
            />
            <InfoRow
              icon="male-female-outline"
              label="Gender"
              value={genderDisplay}
              editable
              onPress={() => setShowEditModal(true)}
            />
            <InfoRow
              icon="calendar-outline"
              label="Date of Birth"
              value={formattedDob || user.dob}
              editable
              onPress={() => setShowEditModal(true)}
            />
            <InfoRow icon="id-card-outline" label="Patient ID" value={user.patient_id} locked last />
          </View>

          {/* ── Account & Security ── */}
          <SectionLabel title="Account & Security" />
          <View style={styles.card}>
            <ActionRow
              icon="heart-outline"
              label="Health Profile"
              sublabel="Blood type, allergies, medications & emergency contact"
              onPress={() => router.push('/(tab)/settings/manage-profile' as any)}
            />
            <ActionRow
              icon="lock-closed-outline"
              label="Change Password"
              sublabel="Update your account password"
              onPress={() => setShowPasswordModal(true)}
              last
            />
          </View>

          {/* ── Preferences ── */}
          <SectionLabel title="Preferences" />
          <View style={styles.card}>
            <View style={[styles.infoRow, { alignItems: 'flex-start', paddingVertical: 16 }]}>
              <View style={[styles.rowIcon, { marginTop: 2 }]}>
                <Ionicons name="globe-outline" size={16} color={T} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.rowValue, { flex: 1 }]}>Preferred Language</Text>
                  {languageSaving && <ActivityIndicator size="small" color={T} />}
                </View>
                <Dropdown
                  label=""
                  options={LANGUAGE_OPTIONS}
                  placeholder="Select language"
                  selectedValue={user.language || ''}
                  onChange={async (value) => {
                    useAuthStore.setState((s) => ({
                      user: s.user ? { ...s.user, language: value } : s.user,
                    }));
                    setLanguageSaving(true);
                    const ok = await updateHealthProfile({ language: value });
                    setLanguageSaving(false);
                    if (!ok) {
                      useAuthStore.setState((s) => ({
                        user: s.user ? { ...s.user, language: user.language ?? '' } : s.user,
                      }));
                      Alert.alert('Error', 'Could not save language preference.');
                    }
                  }}
                />
              </View>
            </View>
          </View>

          {/* ── Danger Zone ── */}
          <SectionLabel title="Danger Zone" />
          <View style={styles.dangerCard}>
            {isDeletionScheduled ? (
              <View style={[styles.infoRow, { paddingHorizontal: 0 }]}>
                <View style={[styles.rowIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="time-outline" size={16} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dangerLabel}>Deletion Pending</Text>
                  <Text style={styles.dangerSub}>Scheduled for {deletionDate}</Text>
                </View>
                <Pressable
                  onPress={() => setShowCancelDeletionModal(true)}
                  style={({ pressed }) => [styles.undoBtn, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.undoBtnText}>Undo</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.dangerRow}>
                  <View style={[styles.rowIcon, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerLabel}>Delete Account</Text>
                    <Text style={styles.dangerSub}>
                      Permanently remove your account and all associated data
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => setShowDeleteModal(true)}
                >
                  <Ionicons name="trash-outline" size={15} color="#fff" style={styles.dangerBtnIcon} />
                  <Text style={styles.dangerBtnText}>Delete Account</Text>
                </Pressable>
              </>
            )}
          </View>

        </ScrollView>

        {/* ── Delete Account Confirmation Modal ── */}
        <Modal visible={showDeleteModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={[styles.sheet, { paddingBottom: 28 }]}>
              <View style={styles.handle} />
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={styles.deleteIconWrap}>
                  <Ionicons name="warning" size={30} color="#DC2626" />
                </View>
                <Text style={styles.deleteModalTitle}>Delete Account?</Text>
                <Text style={styles.deleteModalBody}>
                  Your account will be scheduled for permanent deletion in{' '}
                  <Text style={{ fontWeight: '800' }}>90 days</Text>. You can cancel at any time
                  during this window.{'\n\n'}After 90 days, your account, health records, diagnoses
                  and all personal data will be{' '}
                  <Text style={{ fontWeight: '800' }}>permanently and irrecoverably deleted</Text>.
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.deleteConfirmBtn, pressed && { opacity: 0.85 }]}
                onPress={handleConfirmDeleteAccount}
                disabled={deletionLoading}
              >
                {deletionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteConfirmBtnText}>Yes, Delete My Account</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.deleteCancelBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deletionLoading}
              >
                <Text style={styles.deleteCancelBtnText}>Keep My Account</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* ── Cancel Deletion Confirmation Modal ── */}
        <Modal visible={showCancelDeletionModal} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={[styles.sheet, { paddingBottom: 28 }]}>
              <View style={styles.handle} />
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={[styles.deleteIconWrap, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="shield-checkmark" size={30} color="#059669" />
                </View>
                <Text style={styles.deleteModalTitle}>Cancel Deletion?</Text>
                <Text style={styles.deleteModalBody}>
                  This will cancel the scheduled deletion of your account. Your account and all
                  your data will remain fully active.
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.deleteConfirmBtn,
                  { backgroundColor: '#059669' },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleConfirmCancelDeletion}
                disabled={deletionLoading}
              >
                {deletionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteConfirmBtnText}>Yes, Keep My Account</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.deleteCancelBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setShowCancelDeletionModal(false)}
                disabled={deletionLoading}
              >
                <Text style={styles.deleteCancelBtnText}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* ── Edit Profile Sheet ── */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.overlay}>
              <View style={styles.sheet}>
                <View style={styles.handle} />
                <View style={styles.sheetHead}>
                  <View style={styles.sheetBadge}>
                    <Ionicons name="pencil" size={17} color={T} />
                  </View>
                  <Text style={styles.sheetTitle}>Edit Profile</Text>
                  <Pressable
                    onPress={() => setShowEditModal(false)}
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}
                  >
                    <Ionicons name="close-circle" size={26} color="#CBD5E1" />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput
                    label="First Name"
                    required
                    placeholder="First Name"
                    value={editForm.firstName}
                    onChangeText={(t) => setEditForm({ ...editForm, firstName: t })}
                  />
                  <LabeledInput
                    label="Last Name"
                    required
                    placeholder="Last Name"
                    value={editForm.lastName}
                    onChangeText={(t) => setEditForm({ ...editForm, lastName: t })}
                  />
                  <LabeledInput
                    label="Phone Number"
                    placeholder="Phone Number"
                    keyboardType="phone-pad"
                    value={editForm.phone}
                    onChangeText={(t) => setEditForm({ ...editForm, phone: t })}
                  />
                  <DOBInput
                    label="Date of Birth"
                    value={parseDateFromYMD(editForm.dob)}
                    onChange={(date: Date) => setEditForm({ ...editForm, dob: formatDateToString(date) })}
                  />
                  <Dropdown
                    label="Gender"
                    options={GENDER_OPTIONS}
                    placeholder="Select gender"
                    selectedValue={editForm.gender}
                    onChange={(value) => setEditForm({ ...editForm, gender: value })}
                  />
                </ScrollView>
                <View style={styles.sheetActions}>
                  <View style={styles.sheetActionLeft}>
                    <PrimaryButton title="Save Changes" onPress={handleSaveEdit} loading={loading} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Cancel" type="cancel" onPress={() => setShowEditModal(false)} />
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Change Password Sheet ── */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.overlay}>
              <View style={styles.sheet}>
                <View style={styles.handle} />
                <View style={styles.sheetHead}>
                  <View style={styles.sheetBadge}>
                    <Ionicons name="shield-checkmark-outline" size={17} color={T} />
                  </View>
                  <Text style={styles.sheetTitle}>Change Password</Text>
                  <Pressable
                    onPress={() => setShowPasswordModal(false)}
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}
                  >
                    <Ionicons name="close-circle" size={26} color="#CBD5E1" />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput
                    label="Current Password"
                    placeholder="Enter current password"
                    value={passwordForm.current}
                    onChangeText={(t) => setPasswordForm({ ...passwordForm, current: t })}
                    secureToggle
                  />
                  <LabeledInput
                    label="New Password"
                    placeholder="Enter new password"
                    value={passwordForm.new}
                    onChangeText={(t) => setPasswordForm({ ...passwordForm, new: t })}
                    secureToggle
                  />
                  <LabeledInput
                    label="Confirm New Password"
                    placeholder="Confirm new password"
                    value={passwordForm.confirm}
                    onChangeText={(t) => setPasswordForm({ ...passwordForm, confirm: t })}
                    secureToggle
                  />
                  <View style={styles.hintBox}>
                    <PasswordHintRow label="At least 6 characters" ok={passwordChecks.minLength} />
                    <PasswordHintRow label="Contains uppercase letter" ok={passwordChecks.hasUpper} />
                    <PasswordHintRow label="Contains a number" ok={passwordChecks.hasNumber} />
                    <PasswordHintRow label="Passwords match" ok={passwordChecks.matches} />
                  </View>
                </ScrollView>
                <View style={styles.sheetActions}>
                  <View style={styles.sheetActionLeft}>
                    <PrimaryButton title="Update Password" onPress={handleChangePassword} loading={loading} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      title="Cancel"
                      type="cancel"
                      onPress={() => setShowPasswordModal(false)}
                    />
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </SafeAreaView>
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#F0F8F8',
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2ECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },

  // ── Section labels
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionLabelAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: T,
    marginRight: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.2,
  },

  // ── Bio card
  bioCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#DCEFEF',
  },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DFF4F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#A9E4E2',
    marginRight: 14,
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: T_DARK },
  avatarOnline: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#fff',
  },
  bioName: { fontSize: 18, fontWeight: '800', color: '#111827' },
  bioPID: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#F0FFFE',
    borderWidth: 1,
    borderColor: '#D1F2EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  completionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  completionBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  completionBadgeText: { fontSize: 11, fontWeight: '700' },
  completionTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  completionFill: { height: '100%', borderRadius: 3 },
  completionHint: { fontSize: 11, color: '#94A3B8', marginTop: 6 },

  // ── Content cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAF2F2',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F8F8' },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowFieldLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginBottom: 3 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  rowEmpty: { color: '#C8D4D4', fontStyle: 'italic' },
  editChip: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#F0FFFE',
    borderWidth: 1,
    borderColor: '#D1F2EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  // ── Danger zone
  dangerCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 16,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dangerLabel: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  dangerSub: { fontSize: 11, color: '#EF4444', marginTop: 2, lineHeight: 16 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 13,
  },
  dangerBtnIcon: { marginRight: 8 },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  undoBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  undoBtnText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  // ── Deletion banner
  deletionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    marginBottom: 4,
    marginTop: 8,
  },
  deletionBannerIcon: { marginRight: 10 },
  deletionBannerTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  deletionBannerSub: { fontSize: 11, color: '#DC2626', marginTop: 2, lineHeight: 16 },
  deletionBannerBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deletionBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // ── Modals
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 16,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#1E293B' },
  sheetActions: { flexDirection: 'row', marginTop: 16 },
  sheetActionLeft: { flex: 1, marginRight: 12 },
  hintBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EEF0',
    padding: 12,
    marginBottom: 20,
  },

  // ── Delete modals
  deleteIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 10,
    textAlign: 'center',
  },
  deleteModalBody: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  deleteConfirmBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteConfirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  deleteCancelBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  deleteCancelBtnText: { fontSize: 15, fontWeight: '700', color: '#64748B' },
});
