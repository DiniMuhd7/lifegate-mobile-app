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

// ── Tokens ────────────────────────────────────────────────────────────────────
const T      = '#0EA5A4';
const T_D    = '#0B8E8D';
const T_L    = '#E0F3F3';
const BG     = '#FAFAFA';

// ── Data ──────────────────────────────────────────────────────────────────────
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

type Tab = 'profile' | 'security' | 'preferences';
const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'profile',     label: 'Profile',     icon: 'person-outline'         },
  { id: 'security',    label: 'Security',    icon: 'shield-outline'         },
  { id: 'preferences', label: 'Preferences', icon: 'options-outline'        },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function InfoCard({
  icon,
  label,
  value,
  actionLabel,
  onPress,
  locked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  actionLabel?: string;
  onPress?: () => void;
  locked?: boolean;
}) {
  return (
    <View style={s.infoCard}>
      <View style={s.infoCardIconWrap}>
        <Ionicons name={icon} size={17} color={T} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoCardLabel}>{label}</Text>
        <Text style={[s.infoCardValue, !value && s.infoCardEmpty]}>
          {value || 'Not set'}
        </Text>
      </View>
      {locked && (
        <Ionicons name="lock-closed" size={14} color="#D1D5DB" />
      )}
      {!locked && onPress && (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [s.infoCardAction, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.infoCardActionText}>{actionLabel ?? 'Edit'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SecurityRow({
  icon,
  title,
  subtitle,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.secRow, pressed && { opacity: 0.8 }]}
      android_ripple={{ color: '#F1F5F9' }}
    >
      <View style={[s.secRowIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.secRowTitle}>{title}</Text>
        <Text style={s.secRowSub}>{subtitle}</Text>
      </View>
      <Ionicons name="arrow-forward-circle-outline" size={22} color={color} />
    </Pressable>
  );
}

function HintRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'radio-button-off-outline'} size={14} color={ok ? T : '#CBD5E1'} />
      <Text style={{ marginLeft: 8, fontSize: 12, color: ok ? T_D : '#94A3B8' }}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function AccountSettingScreen() {
  const { user } = useAuthStore();
  const { changePassword, updateHealthProfile, updateBasicProfile, loading, getProfile, error, requestAccountDeletion, cancelAccountDeletion } = useProfileStore();

  const [activeTab, setActiveTab]               = useState<Tab>('profile');
  const [isRefreshing, setIsRefreshing]         = useState(false);
  const [showEditModal, setShowEditModal]         = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal]     = useState(false);
  const [showCancelModal, setShowCancelModal]     = useState(false);
  const [deletionLoading, setDeletionLoading]     = useState(false);
  const [languageSaving, setLanguageSaving]       = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0]            || '',
    lastName:  user?.name?.split(' ').slice(1).join(' ') || '',
    phone:     user?.phone  || '',
    dob:       user?.dob    || '',
    gender:    user?.gender || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => { getProfile(); }, [getProfile]);
  useEffect(() => {
    if (user) {
      setEditForm({
        firstName: user?.name?.split(' ')[0]            || '',
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
      <SafeAreaView style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person-circle-outline" size={64} color="#CBD5E1" />
        <Text style={{ color: '#64748B', marginTop: 12, marginBottom: 20 }}>Profile unavailable</Text>
        <PrimaryButton title="Retry" onPress={() => getProfile()} />
      </SafeAreaView>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const profileFields     = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
  const profileCompletion = Math.round((profileFields.filter((v) => !!String(v ?? '').trim()).length / profileFields.length) * 100);
  const initials = user.name?.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P';
  const firstName = user.name?.split(' ')[0] || 'Patient';
  const formattedDob = (() => {
    if (!user.dob) return '';
    const d = new Date(user.dob);
    return isNaN(d.getTime()) ? user.dob : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  })();
  const genderDisplay  = user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : '';
  const completionColor = profileCompletion >= 80 ? '#10B981' : profileCompletion >= 50 ? '#F59E0B' : '#EF4444';
  const isDeletionScheduled = !!user.deletion_scheduled_at;
  const deletionDate = isDeletionScheduled
    ? new Date(user.deletion_scheduled_at!).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const passwordChecks = {
    minLength: passwordForm.new.length >= 6,
    hasUpper:  /[A-Z]/.test(passwordForm.new),
    hasNumber: /\d/.test(passwordForm.new),
    matches:   passwordForm.new.length > 0 && passwordForm.new === passwordForm.confirm,
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'Please fill in first and last name'); return;
    }
    const dobValue = editForm.dob.trim();
    if (dobValue && !/^\d{4}-\d{2}-\d{2}$/.test(dobValue)) {
      Alert.alert('Validation', 'Date of birth must be YYYY-MM-DD'); return;
    }
    const success = await updateBasicProfile({
      name:   [editForm.firstName.trim(), editForm.lastName.trim()].join(' '),
      phone:  editForm.phone.trim()  || undefined,
      dob:    dobValue               || undefined,
      gender: editForm.gender.trim() || undefined,
    });
    if (success) { Alert.alert('Updated', 'Profile saved'); setShowEditModal(false); }
    else Alert.alert('Error', 'Failed to update profile.');
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
      Alert.alert('Validation', 'Please fill in all fields'); return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      Alert.alert('Validation', 'New passwords do not match'); return;
    }
    if (passwordForm.new.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters'); return;
    }
    try {
      const success = await changePassword(passwordForm.current, passwordForm.new, passwordForm.confirm);
      if (success) { Alert.alert('Done', 'Password updated'); setPasswordForm({ current: '', new: '', confirm: '' }); setShowPasswordModal(false); }
      else Alert.alert('Error', 'Failed to change password.');
    } catch { Alert.alert('Error', 'An unexpected error occurred'); }
  };

  const handleConfirmDelete = async () => {
    setDeletionLoading(true);
    const ok = await requestAccountDeletion();
    setDeletionLoading(false);
    setShowDeleteModal(false);
    if (ok) Alert.alert('Deletion Scheduled', 'Your account will be deleted in 90 days. You can cancel at any time.');
    else Alert.alert('Error', 'Failed to schedule deletion.');
  };

  const handleConfirmCancelDeletion = async () => {
    setDeletionLoading(true);
    const ok = await cancelAccountDeletion();
    setDeletionLoading(false);
    setShowCancelModal(false);
    if (ok) Alert.alert('Cancelled', 'Account deletion cancelled. Your account is safe.');
    else Alert.alert('Error', 'Failed to cancel deletion.');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.headerBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={20} color="#1E293B" />
          </Pressable>
          <Text style={s.headerTitle}>Account Setting</Text>
          <Pressable onPress={() => setShowEditModal(true)} style={({ pressed }) => [s.headerEdit, pressed && { opacity: 0.7 }]}>
            <Ionicons name="pencil-outline" size={18} color={T} />
          </Pressable>
        </View>

        {/* ── Profile card (centred avatar) ── */}
        <View style={s.profileCard}>
          {/* Avatar with completion ring */}
          <View style={s.avatarWrap}>
            <View style={[s.avatarRing, { borderColor: completionColor }]}>
              <View style={s.avatarInner}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            </View>
            <View style={[s.completionDot, { backgroundColor: completionColor }]}>
              <Text style={s.completionDotText}>{profileCompletion}%</Text>
            </View>
          </View>

          <Text style={s.profileName}>{user.name || firstName}</Text>
          <Text style={s.profileEmail}>{user.email}</Text>
          {user.patient_id && (
            <View style={s.pidBadge}>
              <Ionicons name="id-card-outline" size={12} color={T_D} />
              <Text style={s.pidBadgeText}>{user.patient_id}</Text>
            </View>
          )}
          {profileCompletion < 100 && (
            <Pressable onPress={() => setShowEditModal(true)} style={({ pressed }) => [s.completePrompt, pressed && { opacity: 0.8 }]}>
              <Ionicons name="alert-circle-outline" size={13} color="#F59E0B" />
              <Text style={s.completePromptText}>Complete your profile</Text>
            </Pressable>
          )}
        </View>

        {/* ── Deletion alert strip ── */}
        {isDeletionScheduled && (
          <View style={s.deletionStrip}>
            <Ionicons name="warning" size={14} color="#B91C1C" />
            <Text style={s.deletionStripText}>Account deletion scheduled · {deletionDate}</Text>
            <Pressable onPress={() => setShowCancelModal(true)} style={({ pressed }) => [s.deletionStripBtn, pressed && { opacity: 0.8 }]}>
              <Text style={s.deletionStripBtnText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── Tab bar ── */}
        <View style={s.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={({ pressed }) => [s.tabItem, activeTab === tab.id && s.tabItemActive, pressed && { opacity: 0.8 }]}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={activeTab === tab.id ? T : '#9CA3AF'}
              />
              <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Tab content ── */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={T} />}
        >

          {/* ── Profile tab ── */}
          {activeTab === 'profile' && (
            <View style={{ gap: 10 }}>
              <Text style={s.tabSectionTitle}>Personal Details</Text>
              <View style={s.cardGroup}>
                <InfoCard icon="person-outline"     label="Full name"     value={user.name}       actionLabel="Edit"     onPress={() => setShowEditModal(true)} />
                <View style={s.cardDivider} />
                <InfoCard icon="mail-outline"        label="Email address" value={user.email}      locked />
                <View style={s.cardDivider} />
                <InfoCard icon="call-outline"        label="Phone number"  value={user.phone}      actionLabel="Edit"     onPress={() => setShowEditModal(true)} />
                <View style={s.cardDivider} />
                <InfoCard icon="male-female-outline" label="Gender"        value={genderDisplay}   actionLabel="Edit"     onPress={() => setShowEditModal(true)} />
                <View style={s.cardDivider} />
                <InfoCard icon="calendar-outline"    label="Date of birth" value={formattedDob || user.dob} actionLabel="Edit" onPress={() => setShowEditModal(true)} />
                <View style={s.cardDivider} />
                <InfoCard icon="id-card-outline"     label="Patient ID"    value={user.patient_id} locked />
              </View>
            </View>
          )}

          {/* ── Security tab ── */}
          {activeTab === 'security' && (
            <View style={{ gap: 10 }}>
              <Text style={s.tabSectionTitle}>Account Security</Text>
              <View style={s.cardGroup}>
                <SecurityRow
                  icon="heart-outline"
                  title="Health Profile"
                  subtitle="Blood type, allergies, medications & emergency contact"
                  color={T}
                  onPress={() => router.push('/(tab)/settings/manage-profile' as any)}
                />
                <View style={s.cardDivider} />
                <SecurityRow
                  icon="lock-closed-outline"
                  title="Change Password"
                  subtitle="Update your login password"
                  color="#7C3AED"
                  onPress={() => setShowPasswordModal(true)}
                />
              </View>

              <Text style={[s.tabSectionTitle, { marginTop: 12 }]}>Danger Zone</Text>
              <View style={[s.cardGroup, s.dangerCard]}>
                {isDeletionScheduled ? (
                  <SecurityRow
                    icon="time-outline"
                    title="Deletion Pending"
                    subtitle={`Scheduled for ${deletionDate}`}
                    color="#DC2626"
                    onPress={() => setShowCancelModal(true)}
                  />
                ) : (
                  <View style={{ padding: 16, gap: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Ionicons name="warning-outline" size={16} color="#DC2626" style={{ marginTop: 1 }} />
                      <Text style={s.dangerText}>Deleting your account is permanent after the 90-day grace period. All health records and personal data will be removed.</Text>
                    </View>
                    <Pressable
                      onPress={() => setShowDeleteModal(true)}
                      style={({ pressed }) => [s.dangerBtn, pressed && { opacity: 0.85 }]}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={s.dangerBtnText}>Delete Account</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── Preferences tab ── */}
          {activeTab === 'preferences' && (
            <View style={{ gap: 10 }}>
              <Text style={s.tabSectionTitle}>Language</Text>
              <View style={s.cardGroup}>
                <View style={s.prefRow}>
                  <View style={s.prefIcon}>
                    <Ionicons name="globe-outline" size={17} color={T} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.prefLabel}>Preferred Language</Text>
                    {languageSaving && <ActivityIndicator size="small" color={T} style={{ marginTop: 6 }} />}
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

              <Text style={[s.tabSectionTitle, { marginTop: 8 }]}>App</Text>
              <View style={s.cardGroup}>
                <SecurityRow
                  icon="notifications-outline"
                  title="Notification Settings"
                  subtitle="Manage alerts and push preferences"
                  color="#0891B2"
                  onPress={() => router.push('/(tab)/settings/notification')}
                />
                <View style={s.cardDivider} />
                <SecurityRow
                  icon="card-outline"
                  title="Subscription"
                  subtitle="Credits, billing and payment history"
                  color="#7C3AED"
                  onPress={() => router.push('/(tab)/settings/subscription')}
                />
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Delete Confirm Modal ── */}
        <Modal visible={showDeleteModal} transparent animationType="fade">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIcon, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="warning" size={28} color="#DC2626" />
              </View>
              <Text style={s.sheetTitle}>Delete Account?</Text>
              <Text style={s.sheetBody}>
                Your account will be scheduled for deletion in{' '}
                <Text style={{ fontWeight: '800' }}>90 days</Text>. All health records, diagnoses and personal data will be{' '}
                <Text style={{ fontWeight: '800' }}>permanently deleted</Text> at the end of this window.
              </Text>
              <Pressable style={({ pressed }) => [s.sheetPrimary, { backgroundColor: '#DC2626' }, pressed && { opacity: 0.85 }]} onPress={handleConfirmDelete} disabled={deletionLoading}>
                {deletionLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.sheetPrimaryText}>Yes, Delete My Account</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [s.sheetSecondary, pressed && { opacity: 0.8 }]} onPress={() => setShowDeleteModal(false)} disabled={deletionLoading}>
                <Text style={s.sheetSecondaryText}>Keep My Account</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* ── Cancel Deletion Modal ── */}
        <Modal visible={showCancelModal} transparent animationType="fade">
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={[s.sheetIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="shield-checkmark" size={28} color="#059669" />
              </View>
              <Text style={s.sheetTitle}>Cancel Deletion?</Text>
              <Text style={s.sheetBody}>This will restore your account to fully active. All your data will remain intact.</Text>
              <Pressable style={({ pressed }) => [s.sheetPrimary, { backgroundColor: '#059669' }, pressed && { opacity: 0.85 }]} onPress={handleConfirmCancelDeletion} disabled={deletionLoading}>
                {deletionLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.sheetPrimaryText}>Yes, Keep My Account</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [s.sheetSecondary, pressed && { opacity: 0.8 }]} onPress={() => setShowCancelModal(false)} disabled={deletionLoading}>
                <Text style={s.sheetSecondaryText}>Go Back</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* ── Edit Profile Modal ── */}
        <Modal visible={showEditModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.overlay}>
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <View style={s.sheetRow}>
                  <Text style={s.sheetTitle}>Edit Profile</Text>
                  <Pressable onPress={() => setShowEditModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}>
                    <Ionicons name="close-circle" size={26} color="#CBD5E1" />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="First Name" required placeholder="First Name" value={editForm.firstName} onChangeText={(t) => setEditForm({ ...editForm, firstName: t })} />
                  <LabeledInput label="Last Name"  required placeholder="Last Name"  value={editForm.lastName}  onChangeText={(t) => setEditForm({ ...editForm, lastName: t })} />
                  <LabeledInput label="Phone Number" placeholder="Phone Number" keyboardType="phone-pad" value={editForm.phone} onChangeText={(t) => setEditForm({ ...editForm, phone: t })} />
                  <DOBInput label="Date of Birth" value={parseYMD(editForm.dob)} onChange={(date: Date) => setEditForm({ ...editForm, dob: fmt(date) })} />
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

        {/* ── Change Password Modal ── */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.overlay}>
              <View style={s.sheet}>
                <View style={s.sheetHandle} />
                <View style={s.sheetRow}>
                  <Text style={s.sheetTitle}>Change Password</Text>
                  <Pressable onPress={() => setShowPasswordModal(false)} style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}>
                    <Ionicons name="close-circle" size={26} color="#CBD5E1" />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <LabeledInput label="Current Password" placeholder="Enter current password" value={passwordForm.current} onChangeText={(t) => setPasswordForm({ ...passwordForm, current: t })} secureToggle />
                  <LabeledInput label="New Password"     placeholder="Enter new password"     value={passwordForm.new}     onChangeText={(t) => setPasswordForm({ ...passwordForm, new: t })}     secureToggle />
                  <LabeledInput label="Confirm Password" placeholder="Confirm new password"   value={passwordForm.confirm} onChangeText={(t) => setPasswordForm({ ...passwordForm, confirm: t })} secureToggle />
                  <View style={s.hintBox}>
                    <HintRow label="At least 6 characters"    ok={passwordChecks.minLength} />
                    <HintRow label="Contains uppercase letter" ok={passwordChecks.hasUpper}  />
                    <HintRow label="Contains a number"         ok={passwordChecks.hasNumber} />
                    <HintRow label="Passwords match"          ok={passwordChecks.matches}   />
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  headerEdit: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T_L,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile card
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  avatarWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: T_L,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 26, fontWeight: '900', color: '#076F6E' },
  completionDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  completionDotText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  profileName:  { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  profileEmail: { fontSize: 12, color: '#94A3B8', marginBottom: 10 },
  pidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T_L,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  pidBadgeText: { fontSize: 11, fontWeight: '700', color: T_D },
  completePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  completePromptText: { fontSize: 11, fontWeight: '700', color: '#B45309' },

  // Deletion strip
  deletionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deletionStripText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#991B1B' },
  deletionStripBtn: { backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  deletionStripBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: T },
  tabLabel:      { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  tabLabelActive: { color: T, fontWeight: '800' },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60, gap: 0 },
  tabSectionTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  // Card group
  cardGroup: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EEF0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F1F8F8', marginHorizontal: 16 },

  // Info card row
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoCardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T_L,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCardLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  infoCardValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  infoCardEmpty: { color: '#CBD5E1', fontStyle: 'italic' },
  infoCardAction: {
    backgroundColor: T_L,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  infoCardActionText: { fontSize: 12, fontWeight: '700', color: T_D },

  // Security row
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  secRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secRowTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 3 },
  secRowSub:   { fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  // Danger
  dangerCard: { borderColor: '#FEE2E2', backgroundColor: '#FFF8F8' },
  dangerText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 18 },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 13,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Preferences
  prefRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  prefIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: T_L,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },

  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 16,
    maxHeight: '88%',
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 20 },
  sheetRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetIcon:   { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  sheetTitle:  { fontSize: 20, fontWeight: '800', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
  sheetBody:   { fontSize: 14, color: '#64748B', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  sheetPrimary: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  sheetPrimaryText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  sheetSecondary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#F1F5F9' },
  sheetSecondaryText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  sheetActions: { flexDirection: 'row', marginTop: 16 },
  hintBox: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2EEF0', padding: 12, marginBottom: 20 },
});
