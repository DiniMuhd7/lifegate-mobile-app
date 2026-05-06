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

// ── Tokens ───────────────────────────────────────────────────────────────────
const TEAL      = '#0EA5A4';
const TEAL_D    = '#0B8E8D';
const TEAL_L    = '#E0F3F3';
const TEAL_DEEP = '#076F6E';
const BG        = '#F5F9F9';

// ── Data ─────────────────────────────────────────────────────────────────────
const LANGUAGE_OPTIONS = [
  { label: 'English',  value: 'English'  },
  { label: 'Hausa',    value: 'Hausa'    },
  { label: 'Yoruba',   value: 'Yoruba'   },
  { label: 'Igbo',     value: 'Igbo'     },
  { label: 'Pidgin',   value: 'Pidgin'   },
  { label: 'French',   value: 'French'   },
  { label: 'Swahili',  value: 'Swahili'  },
  { label: 'Arabic',   value: 'Arabic'   },
];
const GENDER_OPTIONS = [
  { label: 'Male',   value: 'male'   },
  { label: 'Female', value: 'female' },
  { label: 'Other',  value: 'other'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateToString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseDateFromYMD(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Pill badge for section group title */
function GroupPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.groupPillWrap, { borderLeftColor: color }]}>
      <Text style={s.groupPillText}>{label}</Text>
    </View>
  );
}

/** A single field row inside a group */
function FieldRow({
  icon,
  label,
  value,
  editable,
  locked,
  danger,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  editable?: boolean;
  locked?: boolean;
  danger?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const inner = (
    <View style={[s.fieldRow, !last && s.fieldRowDivider]}>
      <View style={[s.fieldIconWrap, danger && { backgroundColor: '#FEE2E2' }]}>
        <Ionicons name={icon} size={15} color={danger ? '#DC2626' : TEAL} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Text style={[s.fieldValue, !value && s.fieldEmpty, danger && { color: '#DC2626' }]}>
          {value || 'Not set'}
        </Text>
      </View>
      {locked  && <Ionicons name="lock-closed" size={13} color="#CBD5E1" />}
      {editable && !locked && (
        <View style={s.editPill}>
          <Ionicons name="create-outline" size={13} color={TEAL_D} />
          <Text style={s.editPillText}>Edit</Text>
        </View>
      )}
      {!editable && !locked && !danger && (
        <Ionicons name="chevron-forward" size={15} color="#CBD5E1" />
      )}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: '#EAF6F6' }}
        style={({ pressed }) => (pressed && Platform.OS === 'ios' ? { opacity: 0.7 } : {})}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

function PasswordHintRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'radio-button-off-outline'}
        size={14}
        color={ok ? TEAL : '#CBD5E1'}
      />
      <Text style={{ marginLeft: 8, fontSize: 12, color: ok ? TEAL_D : '#94A3B8' }}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
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

  const [isRefreshing, setIsRefreshing]         = useState(false);
  const [showEditModal, setShowEditModal]         = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal]     = useState(false);
  const [showCancelModal, setShowCancelModal]     = useState(false);
  const [deletionLoading, setDeletionLoading]     = useState(false);
  const [languageSaving, setLanguageSaving]       = useState(false);

  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName:  user?.name?.split(' ').slice(1).join(' ') || '',
    phone:     user?.phone   || '',
    dob:       user?.dob     || '',
    gender:    user?.gender  || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => { getProfile(); }, [getProfile]);
  useEffect(() => {
    if (user) {
      setEditForm({
        firstName: user?.name?.split(' ')[0] || '',
        lastName:  user?.name?.split(' ').slice(1).join(' ') || '',
        phone:     user?.phone  || '',
        dob:       user?.dob    || '',
        gender:    user?.gender || '',
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
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person-circle-outline" size={64} color="#CBD5E1" />
        <Text style={{ color: '#64748B', marginTop: 12, marginBottom: 20 }}>Profile unavailable</Text>
        <PrimaryButton title="Retry" onPress={() => getProfile()} />
      </SafeAreaView>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const profileFields    = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const profileCompletion = Math.round(
    (profileFields.filter((v) => !!String(v ?? '').trim()).length / profileFields.length) * 100,
  );
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const initials  =
    user.name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'P';
  const formattedDob = (() => {
    if (!user.dob) return '';
    const d = new Date(user.dob);
    return isNaN(d.getTime())
      ? user.dob
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
  const genderDisplay = user.gender
    ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
    : '';
  const passwordChecks = {
    minLength: passwordForm.new.length >= 6,
    hasUpper:  /[A-Z]/.test(passwordForm.new),
    hasNumber: /\d/.test(passwordForm.new),
    matches:   passwordForm.new.length > 0 && passwordForm.new === passwordForm.confirm,
  };
  const completionColor =
    profileCompletion >= 80 ? '#10B981' : profileCompletion >= 50 ? '#F59E0B' : '#EF4444';
  const isDeletionScheduled = !!user.deletion_scheduled_at;
  const deletionDate = isDeletionScheduled
    ? new Date(user.deletion_scheduled_at!).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : null;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'Please fill in first and last name');
      return;
    }
    const dobValue = editForm.dob.trim();
    if (dobValue && !/^\d{4}-\d{2}-\d{2}$/.test(dobValue)) {
      Alert.alert('Validation', 'Date of birth must be YYYY-MM-DD');
      return;
    }
    const fullName = [editForm.firstName.trim(), editForm.lastName.trim()].join(' ');
    const success  = await updateBasicProfile({
      name:   fullName,
      phone:  editForm.phone.trim()  || undefined,
      dob:    dobValue               || undefined,
      gender: editForm.gender.trim() || undefined,
    });
    if (success) {
      Alert.alert('Updated', 'Profile saved successfully');
      setShowEditModal(false);
    } else {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
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
        Alert.alert('Password Updated', 'Your password was changed successfully');
        setPasswordForm({ current: '', new: '', confirm: '' });
        setShowPasswordModal(false);
      } else {
        Alert.alert('Error', 'Failed to change password. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleConfirmDelete = async () => {
    setDeletionLoading(true);
    const ok = await requestAccountDeletion();
    setDeletionLoading(false);
    setShowDeleteModal(false);
    if (ok) {
      Alert.alert(
        'Deletion Scheduled',
        'Your account will be permanently deleted in 90 days. You can cancel at any time.',
        [{ text: 'OK' }],
      );
    } else {
      Alert.alert('Error', 'Failed to schedule deletion. Please try again.');
    }
  };

  const handleConfirmCancelDeletion = async () => {
    setDeletionLoading(true);
    const ok = await cancelAccountDeletion();
    setDeletionLoading(false);
    setShowCancelModal(false);
    if (ok) {
      Alert.alert('Cancelled', 'Account deletion has been cancelled. Your account is safe.');
    } else {
      Alert.alert('Error', 'Failed to cancel deletion. Please try again.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Dark teal hero header ── */}
        <View style={s.hero}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.heroBack, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          <Text style={s.heroTitle}>Account Settings</Text>
          <Pressable
            onPress={() => setShowEditModal(true)}
            style={({ pressed }) => [s.heroEditBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Edit profile"
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* ── Profile card ── */}
        <View style={s.profileCard}>
          {/* Avatar */}
          <View style={s.avatarRing}>
            <View style={s.avatarInner}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            {/* completion arc: simple coloured border trick */}
            <View
              style={[
                s.avatarArc,
                { borderColor: completionColor },
              ]}
            />
          </View>

          <View style={{ flex: 1, paddingLeft: 14 }}>
            <Text style={s.profileName}>{user.name || firstName}</Text>
            <Text style={s.profileRole}>
              {user.patient_id ? `Patient  ·  ${user.patient_id}` : 'Patient account'}
            </Text>

            {/* Completion bar */}
            <View style={s.progressRow}>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${profileCompletion}%` as any, backgroundColor: completionColor },
                  ]}
                />
              </View>
              <Text style={[s.progressLabel, { color: completionColor }]}>
                {profileCompletion}%
              </Text>
            </View>
            {profileCompletion < 100 && (
              <Text style={s.progressHint}>Complete your profile for better care</Text>
            )}
          </View>
        </View>

        {/* ── Deletion warning ── */}
        {isDeletionScheduled && (
          <View style={s.deletionBanner}>
            <Ionicons name="warning" size={16} color="#B91C1C" />
            <Text style={s.deletionBannerText} numberOfLines={1}>
              Account deletion scheduled for {deletionDate}
            </Text>
            <Pressable
              onPress={() => setShowCancelModal(true)}
              style={({ pressed }) => [s.deletionBannerBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={s.deletionBannerBtnText}>Undo</Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60, paddingTop: 12 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={TEAL} />}
        >

          {/* ── Personal Information ── */}
          <GroupPill label="Personal Information" color={TEAL} />
          <View style={s.group}>
            <FieldRow icon="person-outline"      label="Full Name"     value={user.name}       editable onPress={() => setShowEditModal(true)} />
            <FieldRow icon="mail-outline"         label="Email"         value={user.email}      locked />
            <FieldRow icon="call-outline"         label="Phone"         value={user.phone}      editable onPress={() => setShowEditModal(true)} />
            <FieldRow icon="male-female-outline"  label="Gender"        value={genderDisplay}   editable onPress={() => setShowEditModal(true)} />
            <FieldRow icon="calendar-outline"     label="Date of Birth" value={formattedDob || user.dob} editable onPress={() => setShowEditModal(true)} />
            <FieldRow icon="id-card-outline"      label="Patient ID"    value={user.patient_id} locked last />
          </View>

          {/* ── Security ── */}
          <GroupPill label="Account & Security" color="#7C3AED" />
          <View style={s.group}>
            <FieldRow
              icon="heart-outline"
              label="Health Profile"
              value="Blood type, allergies, medications & emergency contact"
              onPress={() => router.push('/(tab)/settings/manage-profile' as any)}
            />
            <FieldRow
              icon="lock-closed-outline"
              label="Change Password"
              value="Update your login password"
              onPress={() => setShowPasswordModal(true)}
              last
            />
          </View>

          {/* ── Preferences ── */}
          <GroupPill label="Preferences" color="#0891B2" />
          <View style={s.group}>
            <View style={s.prefRow}>
              <View style={s.fieldIconWrap}>
                <Ionicons name="globe-outline" size={15} color={TEAL} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Preferred Language</Text>
                {languageSaving && (
                  <ActivityIndicator size="small" color={TEAL} style={{ marginTop: 6 }} />
                )}
                <Dropdown
                  label=""
                  options={LANGUAGE_OPTIONS}
                  placeholder="Select language"
                  selectedValue={user.language || ''}
                  onChange={async (value) => {
                    useAuthStore.setState((st) => ({
                      user: st.user ? { ...st.user, language: value } : st.user,
                    }));
                    setLanguageSaving(true);
                    const ok = await updateHealthProfile({ language: value });
                    setLanguageSaving(false);
                    if (!ok) {
                      useAuthStore.setState((st) => ({
                        user: st.user ? { ...st.user, language: user.language ?? '' } : st.user,
                      }));
                      Alert.alert('Error', 'Could not save language preference.');
                    }
                  }}
                />
              </View>
            </View>
          </View>

          {/* ── Danger Zone ── */}
          <GroupPill label="Danger Zone" color="#DC2626" />
          <View style={[s.group, s.dangerGroup]}>
            {isDeletionScheduled ? (
              <FieldRow
                icon="time-outline"
                label="Deletion Pending"
                value={`Scheduled for ${deletionDate}`}
                danger
                onPress={() => setShowCancelModal(true)}
                last
              />
            ) : (
              <>
                <View style={s.dangerInfo}>
                  <Ionicons name="warning-outline" size={15} color="#DC2626" style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={s.dangerInfoText}>
                    Deleting your account is permanent and cannot be undone after the 90-day window.
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [s.dangerBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => setShowDeleteModal(true)}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={s.dangerBtnText}>Delete My Account</Text>
                </Pressable>
              </>
            )}
          </View>

        </ScrollView>

        {/* ── Modals ── */}

        {/* Delete confirm */}
        <Modal visible={showDeleteModal} transparent animationType="fade">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={s.sheetIconCircle}>
                <Ionicons name="warning" size={28} color="#DC2626" />
              </View>
              <Text style={s.sheetTitle}>Delete Account?</Text>
              <Text style={s.sheetBody}>
                Your account will be scheduled for permanent deletion in{' '}
                <Text style={{ fontWeight: '800' }}>90 days</Text>. You can cancel at any time during this
                window.{'\n\n'}After 90 days, all your health records, diagnoses, and personal data will be{' '}
                <Text style={{ fontWeight: '800' }}>permanently deleted</Text>.
              </Text>
              <Pressable
                style={({ pressed }) => [s.sheetPrimaryBtn, { backgroundColor: '#DC2626' }, pressed && { opacity: 0.85 }]}
                onPress={handleConfirmDelete}
                disabled={deletionLoading}
              >
                {deletionLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.sheetPrimaryBtnText}>Yes, Delete My Account</Text>}
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.sheetSecondaryBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deletionLoading}
              >
                <Text style={s.sheetSecondaryBtnText}>Keep My Account</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Cancel deletion confirm */}
        <Modal visible={showCancelModal} transparent animationType="fade">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIconCircle, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="shield-checkmark" size={28} color="#059669" />
              </View>
              <Text style={s.sheetTitle}>Cancel Deletion?</Text>
              <Text style={s.sheetBody}>
                This will restore your account to fully active. All your data will remain intact.
              </Text>
              <Pressable
                style={({ pressed }) => [s.sheetPrimaryBtn, { backgroundColor: '#059669' }, pressed && { opacity: 0.85 }]}
                onPress={handleConfirmCancelDeletion}
                disabled={deletionLoading}
              >
                {deletionLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.sheetPrimaryBtnText}>Yes, Keep My Account</Text>}
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.sheetSecondaryBtn, pressed && { opacity: 0.8 }]}
                onPress={() => setShowCancelModal(false)}
                disabled={deletionLoading}
              >
                <Text style={s.sheetSecondaryBtnText}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit Profile */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.overlay}>
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <View style={s.sheetHeader}>
                  <Text style={s.sheetHeaderTitle}>Edit Profile</Text>
                  <Pressable onPress={() => setShowEditModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}>
                    <Ionicons name="close-circle" size={26} color="#CBD5E1" />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="First Name" required placeholder="First Name" value={editForm.firstName} onChangeText={(t) => setEditForm({ ...editForm, firstName: t })} />
                  <LabeledInput label="Last Name"  required placeholder="Last Name"  value={editForm.lastName}  onChangeText={(t) => setEditForm({ ...editForm, lastName: t })} />
                  <LabeledInput label="Phone Number" placeholder="Phone Number" keyboardType="phone-pad" value={editForm.phone} onChangeText={(t) => setEditForm({ ...editForm, phone: t })} />
                  <DOBInput label="Date of Birth" value={parseDateFromYMD(editForm.dob)} onChange={(date: Date) => setEditForm({ ...editForm, dob: formatDateToString(date) })} />
                  <Dropdown label="Gender" options={GENDER_OPTIONS} placeholder="Select gender" selectedValue={editForm.gender} onChange={(value) => setEditForm({ ...editForm, gender: value })} />
                </ScrollView>
                <View style={s.sheetActions}>
                  <View style={{ flex: 1, marginRight: 12 }}>
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

        {/* Change Password */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.overlay}>
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <View style={s.sheetHeader}>
                  <Text style={s.sheetHeaderTitle}>Change Password</Text>
                  <Pressable onPress={() => setShowPasswordModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}>
                    <Ionicons name="close-circle" size={26} color="#CBD5E1" />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="Current Password" placeholder="Enter current password" value={passwordForm.current} onChangeText={(t) => setPasswordForm({ ...passwordForm, current: t })} secureToggle />
                  <LabeledInput label="New Password"     placeholder="Enter new password"     value={passwordForm.new}     onChangeText={(t) => setPasswordForm({ ...passwordForm, new: t })}     secureToggle />
                  <LabeledInput label="Confirm Password" placeholder="Confirm new password"   value={passwordForm.confirm} onChangeText={(t) => setPasswordForm({ ...passwordForm, confirm: t })} secureToggle />
                  <View style={s.hintBox}>
                    <PasswordHintRow label="At least 6 characters"    ok={passwordChecks.minLength} />
                    <PasswordHintRow label="Contains uppercase letter" ok={passwordChecks.hasUpper}  />
                    <PasswordHintRow label="Contains a number"         ok={passwordChecks.hasNumber} />
                    <PasswordHintRow label="Passwords match"          ok={passwordChecks.matches}   />
                  </View>
                </ScrollView>
                <View style={s.sheetActions}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <PrimaryButton title="Update Password" onPress={handleChangePassword} loading={loading} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Cancel" type="cancel" onPress={() => setShowPasswordModal(false)} />
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

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // ── Hero bar
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TEAL_DEEP,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  heroBack: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  heroEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Profile card (below hero, extends over hero visually)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -1,
    borderRadius: 18,
    padding: 16,
    // shadow
    shadowColor: TEAL,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarArc: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: TEAL,
  },
  avatarInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TEAL_L,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: TEAL_DEEP },
  profileName: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  profileRole: { fontSize: 11, color: '#94A3B8', marginBottom: 8 },
  progressRow:  { flexDirection: 'row', alignItems: 'center' },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: '#E2EEF0',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 8,
  },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '800' },
  progressHint:  { fontSize: 10, color: '#94A3B8', marginTop: 4 },

  // ── Deletion banner
  deletionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deletionBannerText: { flex: 1, fontSize: 12, color: '#991B1B', fontWeight: '600' },
  deletionBannerBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deletionBannerBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // ── Group pill
  groupPillWrap: {
    borderLeftWidth: 3,
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 8,
    paddingLeft: 10,
  },
  groupPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // ── Group container (flat, no card border — separated by background)
  group: {
    backgroundColor: '#fff',
    marginHorizontal: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EAF2F2',
  },

  // ── Field row
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  fieldRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EFF4F4' },
  fieldIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: TEAL_L,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  fieldValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  fieldEmpty: { color: '#CBD5E1', fontStyle: 'italic' },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: TEAL_L,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  editPillText: { fontSize: 11, fontWeight: '700', color: TEAL_D },

  // ── Preference row
  prefRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  // ── Danger group
  dangerGroup: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FFF8F8',
    padding: 16,
    borderRadius: 0,
  },
  dangerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  dangerInfoText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 18 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 13,
    paddingVertical: 14,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // ── Modals / sheets
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  sheetHeaderTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#1E293B' },
  sheetActions: { flexDirection: 'row', marginTop: 16 },

  // confirm modals
  sheetIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', textAlign: 'center', marginBottom: 10 },
  sheetBody:  { fontSize: 14, color: '#64748B', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  sheetPrimaryBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetPrimaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  sheetSecondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  sheetSecondaryBtnText: { fontSize: 14, fontWeight: '700', color: '#64748B' },

  // password hints
  hintBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EEF0',
    padding: 12,
    marginBottom: 20,
  },
});
