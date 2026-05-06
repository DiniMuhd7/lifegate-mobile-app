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
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function InfoRow({
  icon, label, value, editable, locked, onPress, last,
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
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, !value && styles.rowEmpty]}>
          {value || 'Not provided'}
        </Text>
      </View>
      {locked && <Ionicons name="lock-closed-outline" size={13} color="#C8D4D4" />}
      {editable && !locked && <Ionicons name="chevron-forward" size={16} color="#C8D4D4" />}
    </View>
  );
  if (editable && onPress) {
    return <Pressable onPress={onPress} android_ripple={{ color: '#f0fafb' }}>{inner}</Pressable>;
  }
  return inner;
}

function ActionRow({
  icon, label, sublabel, onPress, last,
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
      style={[styles.infoRow, !last && styles.rowBorder]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={T} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowValue}>{label}</Text>
        {sublabel ? <Text style={styles.rowLabel}>{sublabel}</Text> : null}
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

function formatDateDisplay(dateString: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateString;
  }
}

function parseDateFromYMD(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ManageProfileScreen() {
  const { user } = useAuthStore();
  const { changePassword, updateHealthProfile, updateBasicProfile, loading, getProfile, error, requestAccountDeletion, cancelAccountDeletion } = useProfileStore();
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

  useEffect(() => { getProfile(); }, [getProfile]);

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

  // Derived
  const profileFields = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const profileCompletion = Math.round(
    (profileFields.filter((v) => !!String(v ?? '').trim()).length / profileFields.length) * 100
  );
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const initials =
    user.name?.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P';
  const formattedDob = (() => {
    if (!user.dob) return '';
    const d = new Date(user.dob);
    return Number.isNaN(d.getTime())
      ? user.dob
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
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
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : null;

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
      Alert.alert('Deletion Cancelled', 'Your account deletion has been cancelled. Your account is safe.', [{ text: 'OK' }]);
    } else {
      Alert.alert('Error', 'Failed to cancel deletion. Please try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F9F9' }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Hero */}
        <LinearGradient colors={['#0EA5A4', '#0B7A79']} style={styles.hero}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>

          <Text style={styles.heroName}>{user.name || firstName}</Text>
          <Text style={styles.heroSub}>{user.patient_id ? `Patient · ${user.patient_id}` : 'Patient account'}</Text>

          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: completionColor }]} />
            <Text style={styles.chipText}>{profileCompletion}% · {completionLabel}</Text>
          </View>
        </LinearGradient>

        {/* Progress bar */}
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${profileCompletion}%` as any, backgroundColor: completionColor }]} />
          </View>
        </View>

        {/* Body */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={T} />}
        >
          {/* Deletion pending banner */}
          {isDeletionScheduled && (
            <View style={styles.deletionBanner}>
              <Ionicons name="warning" size={18} color="#B91C1C" />
              <View style={{ flex: 1 }}>
                <Text style={styles.deletionBannerTitle}>Account scheduled for deletion</Text>
                <Text style={styles.deletionBannerSub}>
                  Your account and all data will be permanently deleted on {deletionDate}.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCancelDeletionModal(true)}
                style={styles.deletionBannerBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.deletionBannerBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          <SectionLabel title="PERSONAL INFORMATION" />
          <View style={styles.card}>
            <InfoRow icon="person-outline" label="Full Name" value={user.name} editable onPress={() => setShowEditModal(true)} />
            <InfoRow icon="mail-outline" label="Email Address" value={user.email} locked />
            <InfoRow icon="call-outline" label="Phone Number" value={user.phone} editable onPress={() => setShowEditModal(true)} />
            <InfoRow icon="male-female-outline" label="Gender" value={user.gender} editable onPress={() => setShowEditModal(true)} />
            <InfoRow icon="calendar-outline" label="Date of Birth" value={formattedDob || user.dob} editable onPress={() => setShowEditModal(true)} />
            <InfoRow icon="id-card-outline" label="Patient ID" value={user.patient_id} locked last />
          </View>

          <SectionLabel title="ACCOUNT & SECURITY" />
          <View style={styles.card}>
            <ActionRow
              icon="lock-closed-outline"
              label="Change Password"
              sublabel="Update your account password"
              onPress={() => setShowPasswordModal(true)}
              last
            />
          </View>

          <SectionLabel title="PREFERENCES" />
          <View style={[styles.card, { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 }}>
              <View style={styles.rowIcon}>
                <Ionicons name="globe-outline" size={16} color={T} />
              </View>
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

          {/* Danger Zone */}
          <SectionLabel title="DANGER ZONE" />
          <View style={styles.dangerCard}>
            <View style={styles.dangerRow}>
              <View style={[styles.rowIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dangerLabel}>Delete Account</Text>
                <Text style={styles.dangerSub}>
                  {isDeletionScheduled
                    ? `Scheduled for ${deletionDate}`
                    : 'Permanently delete your account and all data'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.dangerBtn, isDeletionScheduled && styles.dangerBtnDisabled]}
              onPress={() => !isDeletionScheduled && setShowDeleteModal(true)}
              activeOpacity={isDeletionScheduled ? 1 : 0.8}
            >
              <Ionicons name="trash-outline" size={15} color={isDeletionScheduled ? '#9CA3AF' : '#fff'} />
              <Text style={[styles.dangerBtnText, isDeletionScheduled && { color: '#9CA3AF' }]}>
                {isDeletionScheduled ? 'Deletion Pending' : 'Delete Account'}
              </Text>
            </TouchableOpacity>
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
                  <Text style={{ fontWeight: '800' }}>90 days</Text>. During this period you can
                  cancel the deletion at any time from your profile.{'\n\n'}After 90 days, your account, health records, diagnoses and all personal data will be{' '}
                  <Text style={{ fontWeight: '800' }}>permanently and irrecoverably deleted</Text>.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={handleConfirmDeleteAccount}
                activeOpacity={0.85}
                disabled={deletionLoading}
              >
                {deletionLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.deleteConfirmBtnText}>Yes, Delete My Account</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.8}
                disabled={deletionLoading}
              >
                <Text style={styles.deleteCancelBtnText}>Keep My Account</Text>
              </TouchableOpacity>
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
                  This will cancel the scheduled deletion of your account. Your account and all your data will remain active.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, { backgroundColor: '#059669' }]}
                onPress={handleConfirmCancelDeletion}
                activeOpacity={0.85}
                disabled={deletionLoading}
              >
                {deletionLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.deleteConfirmBtnText}>Yes, Keep My Account</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setShowCancelDeletionModal(false)}
                activeOpacity={0.8}
                disabled={deletionLoading}
              >
                <Text style={styles.deleteCancelBtnText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Edit Profile Sheet */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.sheetHead}>
                <View style={styles.sheetBadge}>
                  <Ionicons name="create-outline" size={17} color={T} />
                </View>
                <Text style={styles.sheetTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <LabeledInput label="First Name" required placeholder="First Name"
                  value={editForm.firstName} onChangeText={(t) => setEditForm({ ...editForm, firstName: t })} />
                <LabeledInput label="Last Name" required placeholder="Last Name"
                  value={editForm.lastName} onChangeText={(t) => setEditForm({ ...editForm, lastName: t })} />
                <LabeledInput label="Phone Number" placeholder="Phone Number" keyboardType="phone-pad"
                  value={editForm.phone} onChangeText={(t) => setEditForm({ ...editForm, phone: t })} />
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
                <View style={{ flex: 1 }}><PrimaryButton title="Save Changes" onPress={handleSaveEdit} /></View>
                <View style={{ flex: 1 }}><PrimaryButton title="Cancel" type="cancel" onPress={() => setShowEditModal(false)} /></View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Change Password Sheet */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.sheetHead}>
                <View style={styles.sheetBadge}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={T} />
                </View>
                <Text style={styles.sheetTitle}>Change Password</Text>
                <TouchableOpacity onPress={() => setShowPasswordModal(false)} activeOpacity={0.7}>
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <LabeledInput label="Current Password" placeholder="Enter current password"
                  value={passwordForm.current} onChangeText={(t) => setPasswordForm({ ...passwordForm, current: t })} secureToggle />
                <LabeledInput label="New Password" placeholder="Enter new password"
                  value={passwordForm.new} onChangeText={(t) => setPasswordForm({ ...passwordForm, new: t })} secureToggle />
                <LabeledInput label="Confirm New Password" placeholder="Confirm new password"
                  value={passwordForm.confirm} onChangeText={(t) => setPasswordForm({ ...passwordForm, confirm: t })} secureToggle />
                <View style={styles.hintBox}>
                  <PasswordHintRow label="At least 6 characters" ok={passwordChecks.minLength} />
                  <PasswordHintRow label="Contains uppercase letter" ok={passwordChecks.hasUpper} />
                  <PasswordHintRow label="Contains a number" ok={passwordChecks.hasNumber} />
                  <PasswordHintRow label="Passwords match" ok={passwordChecks.matches} />
                </View>
              </ScrollView>
              <View style={styles.sheetActions}>
                <View style={{ flex: 1 }}><PrimaryButton title="Update" onPress={handleChangePassword} loading={loading} /></View>
                <View style={{ flex: 1 }}><PrimaryButton title="Cancel" type="cancel" onPress={() => setShowPasswordModal(false)} /></View>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hero: {
    paddingTop: 14,
    paddingBottom: 30,
    alignItems: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    marginTop: 6,
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: T_DARK,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 3,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.68)',
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 5,
    gap: 6,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  progressWrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF4F4',
  },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#DFF0F0', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 6,
    marginLeft: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAF2F2',
    shadowColor: '#0EA5A4',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F8F8' },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  rowEmpty: { color: '#C8D4D4', fontStyle: 'italic' },
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
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  sheetBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#1E293B' },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  hintBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EEF0',
    padding: 12,
    marginBottom: 20,
  },
  // ── Danger zone ──
  dangerCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 16,
    gap: 14,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dangerLabel: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  dangerSub: { fontSize: 11, color: '#EF4444', marginTop: 2 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 13,
  },
  dangerBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // ── Deletion banner ──
  deletionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    marginBottom: 12,
    marginTop: 4,
  },
  deletionBannerTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  deletionBannerSub: { fontSize: 11, color: '#DC2626', marginTop: 2, lineHeight: 16 },
  deletionBannerBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deletionBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  // ── Delete modal ──
  deleteIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  deleteModalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 10, textAlign: 'center' },
  deleteModalBody: { fontSize: 14, color: '#64748B', lineHeight: 22, textAlign: 'center', paddingHorizontal: 4 },
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
