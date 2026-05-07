import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore, useProfileStore } from 'stores/auth-store';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

const TAB_LIST = ['Profile', 'Security', 'Preferences'] as const;
type Tab = (typeof TAB_LIST)[number];

const LANGUAGES = ['English', 'Hausa', 'Yoruba', 'Igbo', 'Pidgin', 'French', 'Swahili', 'Arabic'] as const;

export default function AccountScreen() {
  const { user } = useAuthStore();
  const {
    getProfile,
    loading,
    updateBasicProfile,
    updateHealthProfile,
    changePassword,
    requestAccountDeletion,
    cancelAccountDeletion,
  } = useProfileStore();

  const [tab, setTab] = useState<Tab>('Profile');
  const [refreshing, setRefreshing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showCancelDelete, setShowCancelDelete] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');

  useEffect(() => {
    getProfile();
  }, [getProfile]);

  useEffect(() => {
    if (!user) return;
    const parts = (user.name ?? '').split(' ');
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' '));
    setPhone(user.phone ?? '');
  }, [user]);

  const completionPct = useMemo(() => {
    if (!user) return 0;
    const fields = [user.name, user.email, user.phone, user.gender, user.dob, user.language];
    return Math.round((fields.filter((v) => !!String(v ?? '').trim()).length / fields.length) * 100);
  }, [user]);

  const initials = useMemo(() => {
    if (!user?.name) return 'P';
    return user.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('');
  }, [user]);

  const isDeletionScheduled = !!user?.deletion_scheduled_at;
  const deletionDateLabel = isDeletionScheduled && user?.deletion_scheduled_at
    ? new Date(user.deletion_scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const onRefresh = async () => {
    setRefreshing(true);
    await getProfile();
    setRefreshing(false);
  };

  const onSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Validation', 'First and last name are required.');
      return;
    }
    const ok = await updateBasicProfile({
      name: `${firstName.trim()} ${lastName.trim()}`,
      phone: phone.trim() || undefined,
    });
    if (ok) {
      setShowEdit(false);
      Alert.alert('Saved', 'Profile updated successfully.');
    } else {
      Alert.alert('Error', 'Unable to save profile.');
    }
  };

  const onChangePassword = async () => {
    if (!pwdCurrent || !pwdNew || !pwdConfirm) {
      Alert.alert('Validation', 'Please fill in all password fields.');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      Alert.alert('Validation', 'New password and confirmation do not match.');
      return;
    }
    const ok = await changePassword(pwdCurrent, pwdNew, pwdConfirm);
    if (ok) {
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      setShowPassword(false);
      Alert.alert('Done', 'Password changed successfully.');
    } else {
      Alert.alert('Error', 'Failed to change password.');
    }
  };

  const onScheduleDeletion = async () => {
    setDeletionBusy(true);
    const ok = await requestAccountDeletion();
    setDeletionBusy(false);
    setShowDelete(false);
    if (ok) Alert.alert('Deletion Scheduled', 'Account will be deleted in 90 days.');
    else Alert.alert('Error', 'Failed to schedule deletion.');
  };

  const onCancelDeletion = async () => {
    setDeletionBusy(true);
    const ok = await cancelAccountDeletion();
    setDeletionBusy(false);
    setShowCancelDelete(false);
    if (ok) Alert.alert('Cancelled', 'Account deletion cancelled.');
    else Alert.alert('Error', 'Failed to cancel deletion.');
  };

  if (!user) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.emptyWrap}>
          <ActivityIndicator color="#0EA5A4" />
          <Text style={s.emptyText}>Loading account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={20} color="#F9FAFB" />
          </Pressable>
          <Text style={s.headerTitle}>Account</Text>
          <Pressable onPress={() => setShowEdit(true)} style={[s.iconBtn, s.iconBtnAccent]}>
            <Ionicons name="create-outline" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5A4" />}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          <View style={s.hero}>
            <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
            <Text style={s.name}>{user.name || 'Patient'}</Text>
            <Text style={s.email}>{user.email}</Text>
            <View style={s.statsRow}>
              <Stat label="Completion" value={`${completionPct}%`} />
              <Stat label="Role" value="Patient" />
              <Stat label="ID" value={user.patient_id ? `#${String(user.patient_id).slice(0, 6)}` : '–'} />
            </View>
          </View>

          <View style={s.tabs}>
            {TAB_LIST.map((t) => {
              const active = tab === t;
              return (
                <Pressable key={t} onPress={() => setTab(t)} style={[s.tabBtn, active && s.tabBtnActive]}>
                  <Text style={[s.tabText, active && s.tabTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'Profile' ? (
            <View style={s.contentPad}>
              <Section title="Basic Information">
                <Row label="Full Name" value={user.name} onPress={() => setShowEdit(true)} />
                <Row label="Email Address" value={user.email} />
                <Row label="Phone Number" value={user.phone || 'Not set'} onPress={() => setShowEdit(true)} />
                <Row label="Gender" value={user.gender || 'Not set'} />
                <Row label="Date of Birth" value={user.dob || 'Not set'} last />
              </Section>

              <Section title="Account Details">
                <Row label="Patient ID" value={user.patient_id ? String(user.patient_id) : '–'} />
                <Row label="Health Profile" onPress={() => router.push('/(tab)/settings/manage-profile')} last />
              </Section>
            </View>
          ) : null}

          {tab === 'Security' ? (
            <View style={s.contentPad}>
              <Section title="Password & Login">
                <Row label="Change Password" value="Update your login password" onPress={() => setShowPassword(true)} last />
              </Section>

              <Section title="Danger Zone">
                {isDeletionScheduled ? (
                  <Row label="Deletion Scheduled" value={`Account will be deleted on ${deletionDateLabel}`} onPress={() => setShowCancelDelete(true)} last />
                ) : (
                  <Row label="Delete Account" value="Schedule permanent account deletion" onPress={() => setShowDelete(true)} danger last />
                )}
              </Section>
            </View>
          ) : null}

          {tab === 'Preferences' ? (
            <View style={s.contentPad}>
              <Section title="Language">
                {LANGUAGES.map((lang, idx) => {
                  const selected = (user.language || 'English') === lang;
                  return (
                    <Pressable
                      key={lang}
                      style={[s.languageRow, idx < LANGUAGES.length - 1 && s.rowDivider]}
                      onPress={async () => {
                        if (selected) return;
                        useAuthStore.setState((st) => ({ user: st.user ? { ...st.user, language: lang } : st.user }));
                        setLanguageSaving(true);
                        const ok = await updateHealthProfile({ language: lang });
                        setLanguageSaving(false);
                        if (!ok) {
                          Alert.alert('Error', 'Could not save language preference.');
                        }
                      }}
                    >
                      <Text style={s.languageText}>{lang}</Text>
                      {selected ? <Ionicons name="checkmark-circle" size={18} color="#0EA5A4" /> : null}
                    </Pressable>
                  );
                })}
                {languageSaving ? <ActivityIndicator color="#0EA5A4" style={{ marginTop: 12 }} /> : null}
              </Section>
            </View>
          ) : null}
        </ScrollView>

        <BottomSheet visible={showEdit} onClose={() => setShowEdit(false)}>
              <Text style={s.modalTitle}>Edit Profile</Text>
              <TextInput style={s.input} value={firstName} onChangeText={setFirstName} placeholder="First Name" placeholderTextColor="#9CA3AF" />
              <TextInput style={s.input} value={lastName} onChangeText={setLastName} placeholder="Last Name" placeholderTextColor="#9CA3AF" />
              <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="Phone Number" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
              <View style={s.modalActions}>
                <Pressable style={[s.actionBtn, s.actionSecondary]} onPress={() => setShowEdit(false)}><Text style={s.actionSecondaryText}>Cancel</Text></Pressable>
                <Pressable style={[s.actionBtn, s.actionBtnSecondary, s.actionPrimary]} onPress={onSaveProfile}><Text style={s.actionPrimaryText}>Save</Text></Pressable>
              </View>
        </BottomSheet>

        <BottomSheet visible={showPassword} onClose={() => setShowPassword(false)}>
              <Text style={s.modalTitle}>Change Password</Text>
              <TextInput style={s.input} value={pwdCurrent} onChangeText={setPwdCurrent} placeholder="Current Password" placeholderTextColor="#9CA3AF" secureTextEntry />
              <TextInput style={s.input} value={pwdNew} onChangeText={setPwdNew} placeholder="New Password" placeholderTextColor="#9CA3AF" secureTextEntry />
              <TextInput style={s.input} value={pwdConfirm} onChangeText={setPwdConfirm} placeholder="Confirm Password" placeholderTextColor="#9CA3AF" secureTextEntry />
              <View style={s.modalActions}>
                <Pressable style={[s.actionBtn, s.actionSecondary]} onPress={() => setShowPassword(false)}><Text style={s.actionSecondaryText}>Cancel</Text></Pressable>
                <Pressable style={[s.actionBtn, s.actionBtnSecondary, s.actionPrimary]} onPress={onChangePassword}><Text style={s.actionPrimaryText}>Update</Text></Pressable>
              </View>
        </BottomSheet>

        <BottomSheet visible={showDelete} onClose={() => setShowDelete(false)}>
              <Text style={s.modalTitle}>Delete Account?</Text>
              <Text style={s.modalBody}>Your account will be permanently deleted after a 90-day grace period.</Text>
              <View style={s.modalActions}>
                <Pressable style={[s.actionBtn, s.actionSecondary]} onPress={() => setShowDelete(false)}><Text style={s.actionSecondaryText}>Cancel</Text></Pressable>
                <Pressable style={[s.actionBtn, s.actionBtnSecondary, s.actionDanger]} onPress={onScheduleDeletion} disabled={deletionBusy}>
                  {deletionBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.actionPrimaryText}>Schedule</Text>}
                </Pressable>
              </View>
        </BottomSheet>

        <BottomSheet visible={showCancelDelete} onClose={() => setShowCancelDelete(false)}>
              <Text style={s.modalTitle}>Cancel Deletion?</Text>
              <Text style={s.modalBody}>Your account will remain active and all data stays intact.</Text>
              <View style={s.modalActions}>
                <Pressable style={[s.actionBtn, s.actionSecondary]} onPress={() => setShowCancelDelete(false)}><Text style={s.actionSecondaryText}>Go Back</Text></Pressable>
                <Pressable style={[s.actionBtn, s.actionBtnSecondary, s.actionPrimary]} onPress={onCancelDeletion} disabled={deletionBusy}>
                  {deletionBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.actionPrimaryText}>Keep Account</Text>}
                </Pressable>
              </View>
        </BottomSheet>
      </SafeAreaView>

      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!visible) return null;

  if (Platform.OS === 'web') {
    return (
      <View style={[s.modalOverlay, s.modalOverlayWeb]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={s.modalCard}>{children}</View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={s.modalCard}>{children}</View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.sectionCard}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, onPress, danger, last }: { label: string; value?: string; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const rowContent = (
    <View style={[s.row, !last && s.rowDivider]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {value ? <Text style={[s.rowValue, danger && { color: '#EF4444' }]}>{value}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color="#6B7280" /> : null}
    </View>
  );

  if (!onPress) return rowContent;
  return <Pressable onPress={onPress}>{rowContent}</Pressable>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#F9FAFB', fontSize: 18, fontWeight: '700' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  iconBtnAccent: { backgroundColor: '#0EA5A4' },
  hero: { paddingHorizontal: 20, paddingBottom: 22, alignItems: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: '#0EA5A4', backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0EA5A4', fontSize: 30, fontWeight: '800' },
  name: { marginTop: 12, fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  email: { marginTop: 4, fontSize: 13, color: '#9CA3AF' },
  statsRow: { marginTop: 16, width: '100%', flexDirection: 'row', backgroundColor: '#1F2937', borderRadius: 14, paddingVertical: 12 },
  statValue: { color: '#F9FAFB', fontSize: 15, fontWeight: '700' },
  statLabel: { marginTop: 2, color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  tabs: { marginHorizontal: 20, marginBottom: 18, backgroundColor: '#1F2937', borderRadius: 999, padding: 4, flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', borderRadius: 999, paddingVertical: 10 },
  tabBtnActive: { backgroundColor: '#0EA5A4' },
  tabText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  contentPad: { paddingHorizontal: 16 },
  sectionCard: { backgroundColor: '#1F2937', borderRadius: 16, marginBottom: 14, overflow: 'hidden' },
  sectionTitle: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#374151' },
  rowLabel: { color: '#F9FAFB', fontSize: 14, fontWeight: '600' },
  rowValue: { color: '#9CA3AF', fontSize: 13, marginTop: 3 },
  languageRow: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  languageText: { color: '#F9FAFB', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalOverlayWeb: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16 },
  modalTitle: { color: '#111827', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalBody: { color: '#4B5563', fontSize: 14, lineHeight: 21 },
  input: { height: 46, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, marginBottom: 10, color: '#111827' },
  modalActions: { marginTop: 14, flexDirection: 'row' },
  actionBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBtnSecondary: { marginLeft: 10 },
  actionPrimary: { backgroundColor: '#0EA5A4' },
  actionDanger: { backgroundColor: '#EF4444' },
  actionSecondary: { backgroundColor: '#F3F4F6' },
  actionPrimaryText: { color: '#FFFFFF', fontWeight: '700' },
  actionSecondaryText: { color: '#111827', fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#9CA3AF', marginTop: 10 },
});
