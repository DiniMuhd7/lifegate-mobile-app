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
import { CountryPicker } from 'components/CountryPicker';
import { SuggestInput } from 'components/SuggestInput';
import { NIGERIA_STATES } from 'constants/geo';
import { SafeAreaView } from 'react-native-safe-area-context';

// iOS system palette
const SYS_BG      = '#F2F2F7';
const SYS_WHITE   = '#FFFFFF';
const SYS_LABEL   = '#000000';
const SYS_SECOND  = '#3C3C43';
const SYS_THIRD   = '#8E8E93';
const SYS_FILL    = '#E5E5EA';
const SYS_TEAL    = '#0EA5A4';
const SYS_RED     = '#FF3B30';
const SYS_BLUE    = '#34AADC';

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Hausa',   value: 'Hausa'   },
  { label: 'Yoruba',  value: 'Yoruba'  },
  { label: 'Igbo',    value: 'Igbo'    },
  { label: 'Pidgin',  value: 'Pidgin'  },
  { label: 'French',  value: 'French'  },
  { label: 'Swahili', value: 'Swahili' },
  { label: 'Arabic',  value: 'Arabic'  },
];
const GENDER_OPTIONS = [
  { label: 'Male',   value: 'male'   },
  { label: 'Female', value: 'female' },
  { label: 'Other',  value: 'other'  },
];

function fmt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseYMD(v: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  const p = new Date(y, m - 1, d);
  return isNaN(p.getTime()) ? null : p;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** iOS-style inset grouped section header */
function SysHeader({ title }: { title: string }) {
  return <Text style={s.sysHeader}>{title.toUpperCase()}</Text>;
}

/** iOS-style single row inside a grouped section */
function SysRow({
  icon,
  iconBg,
  label,
  value,
  chevron,
  last,
  onPress,
  destructive,
  accessory,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  label: string;
  value?: string;
  chevron?: boolean;
  last?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  accessory?: React.ReactNode;
}) {
  const inner = (
    <View style={[s.sysRow, !last && s.sysRowDivider]}>
      {icon && (
        <View style={[s.sysRowIcon, { backgroundColor: iconBg ?? SYS_TEAL }]}>
          <Ionicons name={icon} size={14} color="#fff" />
        </View>
      )}
      <Text style={[s.sysRowLabel, destructive && { color: SYS_RED }]}>{label}</Text>
      {value ? <Text style={s.sysRowValue} numberOfLines={1}>{value}</Text> : null}
      {accessory ?? null}
      {chevron && <Ionicons name="chevron-forward" size={14} color={SYS_THIRD} style={{ marginLeft: 4 }} />}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: '#E5E5EA' }}
        style={({ pressed }) => (pressed && Platform.OS === 'ios' ? { opacity: 0.5 } : {})}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

function HintRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'radio-button-off-outline'} size={14} color={ok ? SYS_TEAL : SYS_FILL} />
      <Text style={{ marginLeft: 8, fontSize: 13, color: ok ? '#095D5C' : SYS_THIRD }}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ManageProfileScreen() {
  const { user } = useAuthStore();
  const {
    changePassword, updateHealthProfile, updateBasicProfile,
    loading, getProfile, error,
    requestAccountDeletion, cancelAccountDeletion,
  } = useProfileStore();

  const [isRefreshing, setIsRefreshing]       = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [showPwdModal, setShowPwdModal]       = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [delLoading, setDelLoading]           = useState(false);
  const [langSaving, setLangSaving]           = useState(false);

  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName:  user?.name?.split(' ').slice(1).join(' ') || '',
    phone:     user?.phone  || '',
    dob:       user?.dob    || '',
    gender:    user?.gender || '',
    country:   user?.country ?? '',
    state:     user?.state   ?? '',
  });
  const [pwdForm, setPwdForm] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => { getProfile(); }, [getProfile]);
  useEffect(() => {
    if (user) {
      setEditForm({
        firstName: user?.name?.split(' ')[0] || '',
        lastName:  user?.name?.split(' ').slice(1).join(' ') || '',
        phone:     user?.phone  || '',
        dob:       user?.dob    || '',
        gender:    user?.gender || '',
        country:   user?.country ?? '',
        state:     user?.state   ?? '',
      });
    }
  }, [user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const [ok] = await Promise.all([getProfile()]);
    setIsRefreshing(false);
    if (!ok) Alert.alert('Refresh Failed', error || 'Could not fetch profile.');
  };

  if (loading && !user) return <ProfileSkeleton />;
  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: SYS_BG, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person-circle-outline" size={64} color={SYS_FILL} />
        <Text style={{ color: SYS_THIRD, marginTop: 12, marginBottom: 20 }}>Profile unavailable</Text>
        <PrimaryButton title="Retry" onPress={() => getProfile()} />
      </SafeAreaView>
    );
  }

  // derived
  const profileFields     = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const profileCompletion = Math.round((profileFields.filter((v) => !!String(v ?? '').trim()).length / profileFields.length) * 100);
  const initials = user.name?.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P';
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const formattedDob = (() => {
    if (!user.dob) return '';
    const d = new Date(user.dob);
    return isNaN(d.getTime()) ? user.dob : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
  const genderDisplay   = user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : '';
  const completionColor = profileCompletion >= 80 ? '#34C759' : profileCompletion >= 50 ? '#FF9500' : SYS_RED;
  const isDel           = !!user.deletion_scheduled_at;
  const delDate         = isDel ? new Date(user.deletion_scheduled_at!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : null;
  const pwdChecks = {
    minLength: pwdForm.new.length >= 6,
    hasUpper:  /[A-Z]/.test(pwdForm.new),
    hasNumber: /\d/.test(pwdForm.new),
    matches:   pwdForm.new.length > 0 && pwdForm.new === pwdForm.confirm,
  };

  // handlers
  const handleSaveEdit = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'First and last name are required'); return;
    }
    const dobValue = editForm.dob.trim();
    if (dobValue && !/^\d{4}-\d{2}-\d{2}$/.test(dobValue)) {
      Alert.alert('Validation', 'Date of birth must be YYYY-MM-DD'); return;
    }
    const ok = await updateBasicProfile({
      name:   [editForm.firstName.trim(), editForm.lastName.trim()].join(' '),
      phone:  editForm.phone.trim()  || undefined,
      dob:    dobValue               || undefined,
      gender: editForm.gender.trim() || undefined,
    });
    if (ok) {
      const countryChanged = editForm.country !== (user?.country ?? '');
      const stateChanged   = editForm.state   !== (user?.state   ?? '');
      if (countryChanged || stateChanged) {
        await updateHealthProfile({
          country: editForm.country.trim() || null,
          state:   editForm.state.trim()   || null,
        });
      }
      Alert.alert('Saved', 'Profile updated successfully');
      setShowEditModal(false);
    } else Alert.alert('Error', 'Failed to update profile.');
  };

  const handleChangePwd = async () => {
    if (!pwdForm.current || !pwdForm.new || !pwdForm.confirm) {
      Alert.alert('Validation', 'Please fill in all fields'); return;
    }
    if (pwdForm.new !== pwdForm.confirm) { Alert.alert('Validation', 'Passwords do not match'); return; }
    if (pwdForm.new.length < 6) { Alert.alert('Validation', 'Password must be at least 6 characters'); return; }
    try {
      const ok = await changePassword(pwdForm.current, pwdForm.new, pwdForm.confirm);
      if (ok) { Alert.alert('Done', 'Password changed successfully'); setPwdForm({ current: '', new: '', confirm: '' }); setShowPwdModal(false); }
      else Alert.alert('Error', 'Failed to change password.');
    } catch { Alert.alert('Error', 'An unexpected error occurred'); }
  };

  const handleConfirmDelete = async () => {
    setDelLoading(true);
    const ok = await requestAccountDeletion();
    setDelLoading(false);
    setShowDeleteModal(false);
    if (ok) Alert.alert('Deletion Scheduled', 'Account will be deleted in 90 days. You can cancel at any time.');
    else Alert.alert('Error', 'Failed to schedule deletion.');
  };

  const handleConfirmCancelDel = async () => {
    setDelLoading(true);
    const ok = await cancelAccountDeletion();
    setDelLoading(false);
    setShowCancelModal(false);
    if (ok) Alert.alert('Cancelled', 'Account deletion cancelled. Your account is safe.');
    else Alert.alert('Error', 'Failed to cancel deletion.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: SYS_BG }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Navigation bar (iOS native style) ── */}
        <View style={s.navBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.navBack, pressed && { opacity: 0.5 }]}>
            <Ionicons name="chevron-back" size={20} color={SYS_TEAL} />
            <Text style={s.navBackText}>Settings</Text>
          </Pressable>
          <Text style={s.navTitle}>Account Settings</Text>
          <Pressable onPress={() => setShowEditModal(true)} style={({ pressed }) => [s.navAction, pressed && { opacity: 0.5 }]}>
            <Text style={s.navActionText}>Edit</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={SYS_TEAL} />}
        >

          {/* ── Profile identity block ── */}
          <View style={s.identityBlock}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <Text style={s.identityName}>{user.name || firstName}</Text>
            <Text style={s.identityEmail}>{user.email}</Text>
            {/* Completion meter */}
            <View style={s.meterRow}>
              <View style={s.meterTrack}>
                <View style={[s.meterFill, { width: `${profileCompletion}%` as any, backgroundColor: completionColor }]} />
              </View>
              <Text style={[s.meterLabel, { color: completionColor }]}>{profileCompletion}%</Text>
            </View>
          </View>

          {/* ── Deletion warning ── */}
          {isDel && (
            <View style={s.warnBanner}>
              <Text style={s.warnText}>Account deletion scheduled for {delDate}</Text>
              <Pressable onPress={() => setShowCancelModal(true)}>
                <Text style={s.warnAction}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {/* ── Personal Information ── */}
          <SysHeader title="Personal Information" />
          <View style={s.sysGroup}>
            <SysRow icon="person"           iconBg="#8E8E93" label="Full Name"     value={user.name}       chevron onPress={() => setShowEditModal(true)} />
            <SysRow icon="mail"             iconBg="#FF3B30" label="Email"         value={user.email}                                                       />
            <SysRow icon="call"             iconBg="#34C759" label="Phone"         value={user.phone}      chevron onPress={() => setShowEditModal(true)} />
            <SysRow icon="people"           iconBg="#FF9500" label="Gender"        value={genderDisplay}   chevron onPress={() => setShowEditModal(true)} />
            <SysRow icon="calendar"         iconBg="#5856D6" label="Date of Birth" value={formattedDob || user.dob} chevron onPress={() => setShowEditModal(true)} />
            <SysRow icon="location-outline" iconBg="#0EA5A4" label="Country"       value={user.country ?? ''} chevron onPress={() => setShowEditModal(true)} />
            <SysRow icon="map-outline"      iconBg="#34C759" label="State"         value={user.state   ?? ''} chevron onPress={() => setShowEditModal(true)} />
            <SysRow icon="card"             iconBg="#8E8E93" label="Patient ID"    value={user.patient_id} last />
          </View>

          {/* ── Account & Security ── */}
          <SysHeader title="Account & Security" />
          <View style={s.sysGroup}>
            <SysRow icon="heart"            iconBg={SYS_TEAL}   label="Health Profile"   chevron onPress={() => router.push('/(tab)/settings/manage-profile' as any)} />
            <SysRow icon="lock-closed"      iconBg="#5856D6"     label="Change Password"  chevron onPress={() => setShowPwdModal(true)} last />
          </View>

          {/* ── Preferences ── */}
          <SysHeader title="Preferences" />
          <View style={s.sysGroup}>
            <View style={[s.sysRow, s.sysRowDivider, { alignItems: 'flex-start', paddingVertical: 12 }]}>
              <View style={[s.sysRowIcon, { backgroundColor: SYS_BLUE }]}>
                <Ionicons name="globe" size={14} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sysRowLabel}>Language</Text>
                {langSaving && <ActivityIndicator size="small" color={SYS_TEAL} style={{ marginTop: 4 }} />}
                <Dropdown
                  label=""
                  options={LANGUAGE_OPTIONS}
                  placeholder="Select language"
                  selectedValue={user.language || ''}
                  onChange={async (value) => {
                    useAuthStore.setState((st) => ({ user: st.user ? { ...st.user, language: value } : st.user }));
                    setLangSaving(true);
                    const ok = await updateHealthProfile({ language: value });
                    setLangSaving(false);
                    if (!ok) {
                      useAuthStore.setState((st) => ({ user: st.user ? { ...st.user, language: user.language ?? '' } : st.user }));
                      Alert.alert('Error', 'Could not save language preference.');
                    }
                  }}
                />
              </View>
            </View>
          </View>

          {/* ── Danger Zone ── */}
          <SysHeader title="Danger Zone" />
          <View style={s.sysGroup}>
            {isDel ? (
              <SysRow
                icon="time"
                iconBg={SYS_RED}
                label="Deletion Pending"
                value={`Scheduled for ${delDate}`}
                chevron
                onPress={() => setShowCancelModal(true)}
                last
              />
            ) : (
              <SysRow icon="trash" iconBg={SYS_RED} label="Delete Account" onPress={() => setShowDeleteModal(true)} destructive chevron last />
            )}
          </View>
          <Text style={s.dangerFooter}>
            Account deletion is permanent after the 90-day grace period. All health records and personal data will be removed.
          </Text>

        </ScrollView>

        {/* ── Delete confirm ── */}
        <Modal visible={showDeleteModal} transparent animationType="slide">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIconRound, { backgroundColor: '#FFE5E5' }]}>
                <Ionicons name="warning" size={26} color={SYS_RED} />
              </View>
              <Text style={s.sheetTitle}>Delete Account?</Text>
              <Text style={s.sheetBody}>
                Your account will be scheduled for permanent deletion in{' '}
                <Text style={{ fontWeight: '800' }}>90 days</Text>. You can cancel at any time during this window.
              </Text>
              <Pressable style={({ pressed }) => [s.sheetBtn, { backgroundColor: SYS_RED }, pressed && { opacity: 0.85 }]} onPress={handleConfirmDelete} disabled={delLoading}>
                {delLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.sheetBtnText}>Yes, Delete My Account</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [s.sheetBtnGhost, pressed && { opacity: 0.7 }]} onPress={() => setShowDeleteModal(false)}>
                <Text style={s.sheetBtnGhostText}>Keep Account</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* ── Cancel deletion confirm ── */}
        <Modal visible={showCancelModal} transparent animationType="slide">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIconRound, { backgroundColor: '#E6F9EF' }]}>
                <Ionicons name="shield-checkmark" size={26} color="#34C759" />
              </View>
              <Text style={s.sheetTitle}>Cancel Deletion?</Text>
              <Text style={s.sheetBody}>Your account will be restored to fully active. All data remains intact.</Text>
              <Pressable style={({ pressed }) => [s.sheetBtn, { backgroundColor: '#34C759' }, pressed && { opacity: 0.85 }]} onPress={handleConfirmCancelDel} disabled={delLoading}>
                {delLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.sheetBtnText}>Keep My Account</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [s.sheetBtnGhost, pressed && { opacity: 0.7 }]} onPress={() => setShowCancelModal(false)}>
                <Text style={s.sheetBtnGhostText}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* ── Edit Profile ── */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.overlay}>
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <View style={s.sheetHeaderRow}>
                  <Text style={s.sheetTitle}>Edit Profile</Text>
                  <Pressable onPress={() => setShowEditModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.5 } : {})}>
                    <Ionicons name="close-circle" size={24} color={SYS_FILL} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="First Name" required placeholder="First Name" value={editForm.firstName} onChangeText={(t) => setEditForm({ ...editForm, firstName: t })} />
                  <LabeledInput label="Last Name"  required placeholder="Last Name"  value={editForm.lastName}  onChangeText={(t) => setEditForm({ ...editForm, lastName: t })} />
                  <LabeledInput label="Phone Number" placeholder="Phone Number" keyboardType="phone-pad" value={editForm.phone} onChangeText={(t) => setEditForm({ ...editForm, phone: t })} />
                  <DOBInput label="Date of Birth" value={parseYMD(editForm.dob)} onChange={(date: Date) => setEditForm({ ...editForm, dob: fmt(date) })} />
                  <Dropdown label="Gender" options={GENDER_OPTIONS} placeholder="Select gender" selectedValue={editForm.gender} onChange={(value) => setEditForm({ ...editForm, gender: value })} />
                  <CountryPicker
                    label="Country"
                    value={editForm.country}
                    onChange={(v) => setEditForm({ ...editForm, country: v, state: v !== editForm.country ? '' : editForm.state })}
                    placeholder="Select your country…"
                  />
                  <SuggestInput
                    value={editForm.state}
                    onChangeText={(v) => setEditForm({ ...editForm, state: v })}
                    suggestions={editForm.country === 'Nigeria' ? NIGERIA_STATES : []}
                    placeholder={editForm.country === 'Nigeria' ? 'Search state…' : 'Enter state or province'}
                    placeholderTextColor="#9CA3AF"
                    inputClassName="rounded-xl p-3 text-sm text-gray-800 h-12 bg-[#F2F4F7]"
                  />
                </ScrollView>
                <View style={s.sheetActions}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <PrimaryButton title="Save" onPress={handleSaveEdit} loading={loading} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Cancel" type="cancel" onPress={() => setShowEditModal(false)} />
                  </View>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Change Password ── */}
        <Modal visible={showPwdModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.overlay}>
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <View style={s.sheetHeaderRow}>
                  <Text style={s.sheetTitle}>Change Password</Text>
                  <Pressable onPress={() => setShowPwdModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.5 } : {})}>
                    <Ionicons name="close-circle" size={24} color={SYS_FILL} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="Current Password" placeholder="Current password" value={pwdForm.current} onChangeText={(t) => setPwdForm({ ...pwdForm, current: t })} secureToggle />
                  <LabeledInput label="New Password"     placeholder="New password"     value={pwdForm.new}     onChangeText={(t) => setPwdForm({ ...pwdForm, new: t })}     secureToggle />
                  <LabeledInput label="Confirm Password" placeholder="Confirm password" value={pwdForm.confirm} onChangeText={(t) => setPwdForm({ ...pwdForm, confirm: t })} secureToggle />
                  <View style={s.hintBox}>
                    <HintRow label="At least 6 characters"    ok={pwdChecks.minLength} />
                    <HintRow label="Contains uppercase letter" ok={pwdChecks.hasUpper}  />
                    <HintRow label="Contains a number"         ok={pwdChecks.hasNumber} />
                    <HintRow label="Passwords match"          ok={pwdChecks.matches}   />
                  </View>
                </ScrollView>
                <View style={s.sheetActions}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <PrimaryButton title="Update" onPress={handleChangePwd} loading={loading} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Cancel" type="cancel" onPress={() => setShowPwdModal(false)} />
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

  // Navigation bar (iOS pattern)
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SYS_WHITE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  navBackText: { fontSize: 17, color: SYS_TEAL },
  navTitle: { fontSize: 17, fontWeight: '600', color: SYS_LABEL, textAlign: 'center', flex: 1 },
  navAction: { minWidth: 60, alignItems: 'flex-end' },
  navActionText: { fontSize: 17, color: SYS_TEAL },

  // Identity block
  identityBlock: {
    alignItems: 'center',
    backgroundColor: SYS_WHITE,
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText:    { fontSize: 26, fontWeight: '700', color: '#3C3C43' },
  identityName:  { fontSize: 20, fontWeight: '600', color: SYS_LABEL, marginBottom: 3 },
  identityEmail: { fontSize: 14, color: SYS_THIRD, marginBottom: 14 },
  meterRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, width: '80%' },
  meterTrack: {
    flex: 1,
    height: 4,
    backgroundColor: SYS_FILL,
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill:  { height: '100%', borderRadius: 2 },
  meterLabel: { fontSize: 12, fontWeight: '700', minWidth: 32 },

  // Deletion warning banner
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF1F0',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFCCC9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: -28,
    marginBottom: 28,
  },
  warnText:   { flex: 1, fontSize: 13, color: '#C0392B' },
  warnAction: { fontSize: 13, fontWeight: '600', color: SYS_RED, marginLeft: 12 },

  // Inset grouped section header
  sysHeader: {
    fontSize: 13,
    fontWeight: '400',
    color: SYS_THIRD,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  // Grouped section container
  sysGroup: {
    backgroundColor: SYS_WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    marginBottom: 36,
  },

  // Single row
  sysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: SYS_WHITE,
    minHeight: 44,
  },
  sysRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
    marginLeft: 16 + 28 + 12, // indent past icon
  },
  sysRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  sysRowLabel: { flex: 1, fontSize: 17, fontWeight: '400', color: SYS_LABEL },
  sysRowValue: { fontSize: 17, color: SYS_THIRD, maxWidth: '40%' },

  // Danger footer note
  dangerFooter: {
    fontSize: 13,
    color: SYS_THIRD,
    paddingHorizontal: 20,
    marginTop: -28,
    marginBottom: 20,
    lineHeight: 18,
  },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: SYS_WHITE,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    maxHeight: '88%',
  },
  sheetHandle:    { width: 36, height: 5, borderRadius: 3, backgroundColor: SYS_FILL, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetIconRound: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  sheetTitle:     { fontSize: 20, fontWeight: '700', color: SYS_LABEL, textAlign: 'center', marginBottom: 8 },
  sheetBody:      { fontSize: 15, color: SYS_THIRD, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  sheetBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetBtnText:      { fontSize: 17, fontWeight: '600', color: '#fff' },
  sheetBtnGhost:     { borderRadius: 12, paddingVertical: 16, alignItems: 'center', backgroundColor: SYS_BG },
  sheetBtnGhostText: { fontSize: 17, fontWeight: '400', color: SYS_LABEL },
  sheetActions:      { flexDirection: 'row', marginTop: 12 },
  hintBox: {
    backgroundColor: SYS_BG,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
});
