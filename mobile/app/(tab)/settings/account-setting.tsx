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
  FlatList,
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

// ── Dark dashboard palette ────────────────────────────────────────────────────
const CANVAS    = '#111827';   // near-black canvas
const SURFACE   = '#1F2937';   // card background
const BORDER    = '#374151';   // subtle border
const TEAL      = '#0EA5A4';   // brand accent
const TEAL_D    = '#0B8E8D';
const TEAL_L    = '#E0F3F3';
const WHITE     = '#FFFFFF';
const MID       = '#9CA3AF';   // muted text (on dark)
const LIGHT_TX  = '#F9FAFB';   // primary text (on dark)
const DANGER    = '#EF4444';

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

const TABS = ['Profile', 'Security', 'Preferences'] as const;
type Tab = (typeof TABS)[number];

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

/** Dark card floating on canvas */
function DarkCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[d.card, style]}>{children}</View>;
}

/** Section header inside a dark card */
function CardSection({ title }: { title: string }) {
  return <Text style={d.cardSection}>{title}</Text>;
}

/** A single data row inside a card — no icons, text-first */
function DataRow({
  label,
  value,
  onPress,
  last,
  danger,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  const inner = (
    <View style={[d.dataRow, !last && d.dataRowDivider]}>
      <View style={{ flex: 1 }}>
        <Text style={d.dataLabel}>{label}</Text>
        {value ? <Text style={[d.dataValue, danger && { color: DANGER }]} numberOfLines={2}>{value}</Text> : null}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={MID} />}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: '#ffffff14' }} style={({ pressed }) => (pressed && Platform.OS === 'ios' ? { opacity: 0.65 } : {})}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/** Password strength hint */
function PwdHint({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'radio-button-off-outline'} size={14} color={ok ? TEAL : BORDER} />
      <Text style={{ fontSize: 13, color: ok ? TEAL_L : MID }}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AccountSettingScreen() {
  const { user } = useAuthStore();
  const { changePassword, updateHealthProfile, updateBasicProfile, loading, getProfile, error, requestAccountDeletion, cancelAccountDeletion } = useProfileStore();

  const [tab, setTab]                         = useState<Tab>('Profile');
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
      });
    }
  }, [user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await getProfile();
    setIsRefreshing(false);
  };

  if (loading && !user) return <ProfileSkeleton />;
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person-circle-outline" size={64} color={BORDER} />
        <Text style={{ color: MID, marginTop: 12, marginBottom: 20 }}>Profile unavailable</Text>
        <PrimaryButton title="Retry" onPress={() => getProfile()} />
      </View>
    );
  }

  // derived
  const profileFields     = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const completionPct     = Math.round((profileFields.filter((v) => !!String(v ?? '').trim()).length / profileFields.length) * 100);
  const initials          = user.name?.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P';
  const formattedDob      = (() => {
    if (!user.dob) return 'Not set';
    const d = new Date(user.dob);
    return isNaN(d.getTime()) ? user.dob : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
  const genderDisplay  = user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'Not set';
  const isDel          = !!user.deletion_scheduled_at;
  const delDate        = isDel ? new Date(user.deletion_scheduled_at!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : null;
  const completionColor = completionPct >= 80 ? '#10B981' : completionPct >= 50 ? '#F59E0B' : DANGER;

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
    if (ok) { Alert.alert('Saved', 'Profile updated successfully'); setShowEditModal(false); }
    else Alert.alert('Error', 'Failed to update profile.');
  };

  const handleChangePwd = async () => {
    if (!pwdForm.current || !pwdForm.new || !pwdForm.confirm) {
      Alert.alert('Validation', 'Please fill in all fields'); return;
    }
    if (pwdForm.new !== pwdForm.confirm) { Alert.alert('Validation', 'Passwords do not match'); return; }
    if (pwdForm.new.length < 6) { Alert.alert('Validation', 'Password must be at least 6 characters'); return; }
    try {
      const ok = await changePassword(pwdForm.current, pwdForm.new, pwdForm.confirm);
      if (ok) {
        Alert.alert('Done', 'Password changed successfully');
        setPwdForm({ current: '', new: '', confirm: '' });
        setShowPwdModal(false);
      } else Alert.alert('Error', 'Failed to change password.');
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
    if (ok) Alert.alert('Cancelled', 'Account deletion cancelled.');
    else Alert.alert('Error', 'Failed to cancel deletion.');
  };

  // ── Render ──
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Top bar ── */}
        <View style={d.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [d.topBarBack, pressed && { opacity: 0.55 }]}>
            <Ionicons name="arrow-back" size={20} color={LIGHT_TX} />
          </Pressable>
          <Text style={d.topBarTitle}>Account Setting</Text>
          <Pressable onPress={() => setShowEditModal(true)} style={({ pressed }) => [d.topBarEdit, pressed && { opacity: 0.7 }]}>
            <Ionicons name="create-outline" size={18} color={WHITE} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={TEAL} />}
        >

          {/* ── Profile hero block ── */}
          <View style={d.heroBlock}>
            {/* Avatar */}
            <View style={d.avatarOuter}>
              <View style={d.avatarInner}>
                <Text style={d.avatarText}>{initials}</Text>
              </View>
              {/* Completion ring segment */}
              <View style={[d.completionChip, { backgroundColor: completionColor }]}>
                <Text style={d.completionChipText}>{completionPct}%</Text>
              </View>
            </View>
            <Text style={d.heroName}>{user.name || 'Patient'}</Text>
            <Text style={d.heroEmail}>{user.email}</Text>

            {/* Stat chips row */}
            <View style={d.statRow}>
              <View style={d.statChip}>
                <Text style={d.statChipValue}>{completionPct}%</Text>
                <Text style={d.statChipLabel}>Completion</Text>
              </View>
              <View style={d.statDivider} />
              <View style={d.statChip}>
                <Text style={d.statChipValue}>Patient</Text>
                <Text style={d.statChipLabel}>Role</Text>
              </View>
              <View style={d.statDivider} />
              <View style={d.statChip}>
                <Text style={d.statChipValue} numberOfLines={1}>{user.patient_id ? `#${String(user.patient_id).slice(0, 6)}` : '–'}</Text>
                <Text style={d.statChipLabel}>ID</Text>
              </View>
            </View>
          </View>

          {/* ── Pill tab bar ── */}
          <View style={d.tabRail}>
            {TABS.map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[d.tabPill, active && d.tabPillActive]}
                  android_ripple={{ color: '#00000020', borderless: true }}
                >
                  <Text style={[d.tabPillText, active && d.tabPillTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── PROFILE TAB ── */}
          {tab === 'Profile' && (
            <View style={d.tabContent}>
              <DarkCard>
                <CardSection title="Basic Information" />
                <DataRow label="Full Name"     value={user.name}       onPress={() => setShowEditModal(true)} />
                <DataRow label="Email Address" value={user.email}                                             />
                <DataRow label="Phone Number"  value={user.phone || 'Not set'}  onPress={() => setShowEditModal(true)} />
                <DataRow label="Gender"        value={genderDisplay}   onPress={() => setShowEditModal(true)} />
                <DataRow label="Date of Birth" value={formattedDob}    onPress={() => setShowEditModal(true)} last />
              </DarkCard>
              <DarkCard style={{ marginTop: 16 }}>
                <CardSection title="Account Details" />
                <DataRow label="Patient ID"    value={user.patient_id ? String(user.patient_id) : '–'}       />
                <DataRow label="Health Profile" onPress={() => router.push('/(tab)/settings/manage-profile' as any)} last />
              </DarkCard>
            </View>
          )}

          {/* ── SECURITY TAB ── */}
          {tab === 'Security' && (
            <View style={d.tabContent}>
              <DarkCard>
                <CardSection title="Password & Login" />
                <DataRow label="Change Password" value="Update your login password" onPress={() => setShowPwdModal(true)} last />
              </DarkCard>
              <DarkCard style={{ marginTop: 16 }}>
                <CardSection title="Danger Zone" />
                {isDel ? (
                  <DataRow label="Deletion Scheduled" value={`Account will be deleted on ${delDate}`} onPress={() => setShowCancelModal(true)} last />
                ) : (
                  <DataRow label="Delete Account" value="Schedule permanent account deletion" onPress={() => setShowDeleteModal(true)} danger last />
                )}
              </DarkCard>
              {isDel && (
                <Pressable onPress={() => setShowCancelModal(true)} style={({ pressed }) => [d.cancelDelBtn, pressed && { opacity: 0.75 }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={TEAL} />
                  <Text style={d.cancelDelText}>Cancel Scheduled Deletion</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── PREFERENCES TAB ── */}
          {tab === 'Preferences' && (
            <View style={d.tabContent}>
              <DarkCard>
                <CardSection title="Language" />
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  {langSaving && <ActivityIndicator size="small" color={TEAL} style={{ marginBottom: 8 }} />}
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
              </DarkCard>
            </View>
          )}

        </ScrollView>

        {/* ── Modals ── */}

        {/* Delete confirm */}
        <Modal visible={showDeleteModal} transparent animationType="slide">
          <View style={d.overlay}>
            <View style={d.sheet}>
              <View style={d.sheetHandle} />
              <View style={[d.sheetIconCircle, { backgroundColor: '#2D1515' }]}>
                <Ionicons name="warning" size={28} color={DANGER} />
              </View>
              <Text style={d.sheetTitle}>Delete Account?</Text>
              <Text style={d.sheetBody}>Your account will be permanently deleted after a 90-day grace period. This action can be reversed during the window.</Text>
              <Pressable style={({ pressed }) => [d.sheetBtn, { backgroundColor: DANGER }, pressed && { opacity: 0.85 }]} onPress={handleConfirmDelete} disabled={delLoading}>
                {delLoading ? <ActivityIndicator color="#fff" /> : <Text style={d.sheetBtnText}>Schedule Deletion</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [d.sheetBtnGhost, pressed && { opacity: 0.7 }]} onPress={() => setShowDeleteModal(false)}>
                <Text style={d.sheetBtnGhostText}>Keep Account</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Cancel deletion confirm */}
        <Modal visible={showCancelModal} transparent animationType="slide">
          <View style={d.overlay}>
            <View style={d.sheet}>
              <View style={d.sheetHandle} />
              <View style={[d.sheetIconCircle, { backgroundColor: '#0D2620' }]}>
                <Ionicons name="shield-checkmark" size={28} color="#10B981" />
              </View>
              <Text style={d.sheetTitle}>Cancel Deletion?</Text>
              <Text style={d.sheetBody}>Your account will be restored to fully active status. All data remains intact.</Text>
              <Pressable style={({ pressed }) => [d.sheetBtn, { backgroundColor: '#10B981' }, pressed && { opacity: 0.85 }]} onPress={handleConfirmCancelDel} disabled={delLoading}>
                {delLoading ? <ActivityIndicator color="#fff" /> : <Text style={d.sheetBtnText}>Keep My Account</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [d.sheetBtnGhost, pressed && { opacity: 0.7 }]} onPress={() => setShowCancelModal(false)}>
                <Text style={d.sheetBtnGhostText}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Edit Profile */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={d.overlay}>
              <View style={d.sheet}>
                <View style={d.sheetHandle} />
                <View style={d.sheetHeaderRow}>
                  <Text style={d.sheetTitle}>Edit Profile</Text>
                  <Pressable onPress={() => setShowEditModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.5 } : {})}>
                    <Ionicons name="close-circle" size={24} color={BORDER} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="First Name" required placeholder="First Name" value={editForm.firstName} onChangeText={(t: string) => setEditForm({ ...editForm, firstName: t })} />
                  <LabeledInput label="Last Name"  required placeholder="Last Name"  value={editForm.lastName}  onChangeText={(t: string) => setEditForm({ ...editForm, lastName: t })} />
                  <LabeledInput label="Phone Number" placeholder="Phone Number" keyboardType="phone-pad" value={editForm.phone} onChangeText={(t: string) => setEditForm({ ...editForm, phone: t })} />
                  <DOBInput label="Date of Birth" value={parseYMD(editForm.dob)} onChange={(date: Date) => setEditForm({ ...editForm, dob: fmt(date) })} />
                  <Dropdown label="Gender" options={GENDER_OPTIONS} placeholder="Select gender" selectedValue={editForm.gender} onChange={(value: string) => setEditForm({ ...editForm, gender: value })} />
                </ScrollView>
                <View style={d.sheetActions}>
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

        {/* Change Password */}
        <Modal visible={showPwdModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={d.overlay}>
              <View style={d.sheet}>
                <View style={d.sheetHandle} />
                <View style={d.sheetHeaderRow}>
                  <Text style={d.sheetTitle}>Change Password</Text>
                  <Pressable onPress={() => setShowPwdModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.5 } : {})}>
                    <Ionicons name="close-circle" size={24} color={BORDER} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="Current Password" placeholder="Current password" value={pwdForm.current} onChangeText={(t: string) => setPwdForm({ ...pwdForm, current: t })} secureToggle />
                  <LabeledInput label="New Password"     placeholder="New password"     value={pwdForm.new}     onChangeText={(t: string) => setPwdForm({ ...pwdForm, new: t })}     secureToggle />
                  <LabeledInput label="Confirm Password" placeholder="Confirm password" value={pwdForm.confirm} onChangeText={(t: string) => setPwdForm({ ...pwdForm, confirm: t })} secureToggle />
                  <View style={d.hintBox}>
                    <PwdHint label="At least 6 characters"    ok={pwdChecks.minLength} />
                    <PwdHint label="Contains uppercase letter" ok={pwdChecks.hasUpper}  />
                    <PwdHint label="Contains a number"         ok={pwdChecks.hasNumber} />
                    <PwdHint label="Passwords match"          ok={pwdChecks.matches}   />
                  </View>
                </ScrollView>
                <View style={d.sheetActions}>
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
const d = StyleSheet.create({

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: CANVAS,
  },
  topBarBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: LIGHT_TX },
  topBarEdit:  { width: 36, height: 36, borderRadius: 18, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },

  // Hero block
  heroBlock: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
  },
  avatarOuter: { position: 'relative', marginBottom: 14 },
  avatarInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: SURFACE,
    borderWidth: 3,
    borderColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText:    { fontSize: 34, fontWeight: '800', color: TEAL },
  completionChip: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    borderRadius: 30,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 36,
    alignItems: 'center',
  },
  completionChipText: { fontSize: 11, fontWeight: '800', color: WHITE },
  heroName:     { fontSize: 24, fontWeight: '800', color: WHITE, marginBottom: 4 },
  heroEmail:    { fontSize: 14, color: MID, marginBottom: 20 },

  // Stat row
  statRow:    { flexDirection: 'row', backgroundColor: SURFACE, borderRadius: 16, paddingVertical: 14, width: '100%' },
  statChip:   { flex: 1, alignItems: 'center' },
  statChipValue: { fontSize: 16, fontWeight: '700', color: WHITE, marginBottom: 2 },
  statChipLabel: { fontSize: 11, color: MID, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: BORDER },

  // Pill tab bar
  tabRail: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 40,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 4,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 40,
    alignItems: 'center',
  },
  tabPillActive:    { backgroundColor: TEAL },
  tabPillText:      { fontSize: 14, fontWeight: '600', color: MID },
  tabPillTextActive: { color: WHITE },

  // Tab content area
  tabContent: { paddingHorizontal: 16 },

  // Dark card
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 12,
  },
  cardSection: {
    fontSize: 11,
    fontWeight: '700',
    color: MID,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },

  // Data row (text-first, no icon chips)
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  dataRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  dataLabel: { fontSize: 14, color: MID, marginBottom: 3 },
  dataValue: { fontSize: 16, fontWeight: '500', color: LIGHT_TX },

  // Cancel deletion button
  cancelDelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginHorizontal: 0,
    borderWidth: 1,
    borderColor: TEAL,
  },
  cancelDelText: { fontSize: 14, fontWeight: '600', color: TEAL },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    maxHeight: '88%',
  },
  sheetHandle:    { width: 36, height: 5, borderRadius: 3, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 20 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetIconCircle:{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  sheetTitle:     { fontSize: 20, fontWeight: '700', color: WHITE, textAlign: 'center', marginBottom: 8 },
  sheetBody:      { fontSize: 15, color: MID, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  sheetBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetBtnText:      { fontSize: 17, fontWeight: '700', color: WHITE },
  sheetBtnGhost:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center', backgroundColor: '#374151' },
  sheetBtnGhostText: { fontSize: 17, color: LIGHT_TX },
  sheetActions:      { flexDirection: 'row', marginTop: 12 },
  hintBox: {
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
});
