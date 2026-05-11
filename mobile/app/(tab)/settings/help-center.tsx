import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  StyleSheet,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuthStore } from 'stores/auth/auth-store';
import { useProfileStore } from 'stores/auth/profile-store';
import { LabeledInput } from 'components/LabeledInput';
import { Dropdown } from 'components/DropDown';
import { openExternalUrl, openFirstSupportedExternalUrl } from '@/utils/external-link';

// ── Tokens ───────────────────────────────────────────────────────────────────
const TEAL      = '#0EA5A4';
const TEAL_D    = '#0B8E8D';
const TEAL_L    = '#E0F3F3';
const TEAL_DEEP = '#076F6E';
const BG        = '#F5F9F9';

// ── FAQ data ──────────────────────────────────────────────────────────────────
type FaqEntry   = { q: string; a: string };
type FaqSection = { id: string; title: string; icon: keyof typeof Ionicons.glyphMap; items: FaqEntry[] };

const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'account',
    title: 'Account & Access',
    icon: 'person-circle-outline',
    items: [
      { q: 'I cannot log in. What should I do?', a: 'First confirm your internet connection. Then verify your email/phone and password. If you still cannot log in, reset your password and try again. If the issue persists, contact support and include your registered phone/email.' },
      { q: 'I forgot my password and reset is not working.', a: 'Check for typing errors, ensure your new password meets complexity rules, and wait a few minutes before retrying. If reset links or OTPs are delayed, verify network and spam folders. Contact support if no reset message arrives after multiple attempts.' },
      { q: 'My profile details are outdated or incomplete.', a: 'Go to Settings > Manage Profile and update blood type, genotype, allergies, medications, and emergency contact. Keeping this complete improves triage safety and recommendation quality.' },
    ],
  },
  {
    id: 'billing',
    title: 'Subscription & Billing',
    icon: 'card-outline',
    items: [
      { q: 'How do subscriptions and credits work?', a: 'Go to Settings > Subscription to buy credit bundles. Credits are used for eligible clinical workflows and deducted per session. Review usage and payment records in your transaction history.' },
      { q: 'I was charged but credits did not reflect.', a: 'Allow a short sync window, then refresh the app. If credits still do not appear, send a support message with transaction date, amount, and channel used. The billing team can reconcile and apply corrections quickly.' },
      { q: 'Why were credits deducted unexpectedly?', a: 'Credits are consumed when certain clinical workflows are completed. Check your recent sessions and transaction records. If the deduction looks incorrect, report it from Send Feedback with session details for investigation.' },
      { q: 'Can I request a refund for a failed payment?', a: 'Yes. Contact support with proof of payment, transaction reference, and timestamp. Refund and reversal eligibility depends on payment status verification and platform policy.' },
    ],
  },
  {
    id: 'clinical',
    title: 'Tests & Clinical',
    icon: 'medkit-outline',
    items: [
      { q: 'How does the Vision Test work?', a: 'Vision Test guides you through automated checks such as acuity and related screening steps. For best results, use good lighting, follow distance instructions, and complete each step carefully.' },
      { q: 'How does the Hearing Test work?', a: 'Hearing Test runs guided tone and listening checks to estimate hearing patterns. Use quality headphones in a quiet space and avoid interruptions to improve reliability.' },
      { q: 'What is General Mode?', a: 'General Mode provides broad health guidance and wellness education. It is best for low-risk concerns and does not replace formal diagnosis in urgent or complex cases.' },
      { q: 'What is Clinical Mode?', a: 'Clinical Mode is for structured symptom assessment and higher-risk support. It can trigger physician review workflows, urgency scoring, and stricter safety checks.' },
      { q: "What is EDIS in LifeGate?", a: "EDIS is LifeGate's clinical interpretation and safety layer. It structures user input, applies guardrails, and prioritizes risk before recommendations are shown." },
      { q: 'How do I improve diagnosis quality?', a: 'Keep your health profile updated, provide clear symptom timeline and severity, include medication/allergy history, and complete requested tests with accurate responses.' },
    ],
  },
  {
    id: 'performance',
    title: 'App Performance',
    icon: 'phone-portrait-outline',
    items: [
      { q: 'The app is slow, freezing, or showing a blank screen.', a: 'Close and reopen the app, then check your network. If issue remains, restart device and update to latest app version. If still unresolved, send feedback with device model, OS version, and exact screen where it happens.' },
      { q: 'Why am I not receiving notifications?', a: 'Open Notifications in Settings and enable push access. If disabled at device level, grant permission in device settings. Also check battery optimization rules that may block background alerts.' },
      { q: 'Some pages or actions fail to load.', a: 'This is often due to unstable connection or temporary service downtime. Retry after reconnecting, and if repeated, report the action, time, and screenshot through Send Feedback.' },
      { q: 'My submitted feedback did not get a response.', a: 'After submission, keep your reference ID. Support responses may take some time depending on queue volume. If delayed, contact support directly and include the reference ID for faster tracking.' },
    ],
  },
  {
    id: 'safety',
    title: 'Safety & Emergencies',
    icon: 'shield-checkmark-outline',
    items: [
      { q: 'Does LifeGate replace my doctor?', a: 'No. LifeGate supports triage and guidance. Licensed physicians handle clinical review and final treatment decisions where required.' },
      { q: 'What should I do in an emergency?', a: 'If you have severe chest pain, breathing difficulty, seizure, heavy bleeding, confusion, or loss of consciousness, seek emergency medical care immediately. Do not wait for in-app responses.' },
      { q: 'What if I disagree with the app recommendation?', a: 'Use your clinical judgement and seek physician review, especially if symptoms worsen. You can request further evaluation or escalate by contacting support with your case context.' },
      { q: 'How is my health information protected?', a: 'LifeGate uses secure handling practices for clinical data and limits sensitive access to relevant workflows. Do not share your account credentials, and report suspicious activity immediately.' },
    ],
  },
  {
    id: 'coins',
    title: 'Lifecoins & Rewards',
    icon: 'heart-outline',
    items: [
      { q: 'What are Lifecoins?', a: "Lifecoins are LifeGate's in-app reward currency. You earn them by completing health activities such as watching educational videos, completing check-ins, and engaging with the platform." },
      { q: 'How do I earn Lifecoins?', a: 'Earn Lifecoins by watching health videos on the Explore screen until the required watch threshold is met, completing daily check-ins, and other in-app health activities.' },
      { q: 'Is there a daily limit on earning Lifecoins?', a: `Yes. You can earn Lifecoins from up to ${5} videos per day. The daily count resets at midnight. You can still watch more videos, but coins are only awarded for the first ${5} completions each day.` },
      { q: 'My Lifecoins balance did not update.', a: 'Allow a short moment for the wallet to sync. Pull to refresh on the wallet screen. If still incorrect, report it from Send Feedback and include the video title, date, and time.' },
    ],
  },
  {
    id: 'physician',
    title: 'Physician Consultations',
    icon: 'person-add-outline',
    items: [
      { q: 'How does physician assignment work?', a: 'When your case requires clinical review, LifeGate assigns an available licensed physician based on case urgency, specialty, and physician availability.' },
      { q: 'When will a physician respond?', a: 'Response times depend on physician availability and your case urgency level. Urgent cases are prioritised. You will receive an in-app notification when a physician reviews or responds.' },
      { q: 'Can I message my assigned physician?', a: 'Yes. Once a physician is assigned to your active case, a chat icon appears in the Diagnosis Report screen. Tap it to open the Instant Message panel.' },
      { q: 'My case shows Active but no physician has responded.', a: 'Cases in the queue may take time depending on volume. If your case has been Active without any update for an unexpectedly long time, contact support with your case ID.' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & Data',
    icon: 'lock-closed-outline',
    items: [
      { q: 'What health data does LifeGate store?', a: 'LifeGate stores profile information, symptom reports, health metrics, test results, and consultation history needed to deliver clinical services safely.' },
      { q: 'Can I delete my account and data?', a: 'Yes. Go to Settings and look for Account Deletion or contact support to initiate a deletion request. Deletion removes your personal data subject to applicable legal retention requirements.' },
      { q: 'Who can see my clinical information?', a: 'Your clinical data is visible to assigned physicians in the context of active cases, and to authorised admin personnel for safety purposes. LifeGate does not sell personal health data.' },
    ],
  },
];

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

function HelpActionModal({
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
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onPress={onClose}
      >
        <Pressable
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#D1EAE9',
            padding: 18,
          }}
          onPress={() => {}}
        >
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 14 }}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryChip({
  section,
  active,
  onPress,
}: {
  section: FaqSection;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        active && s.chipActive,
        pressed && !active && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={section.icon} size={13} color={active ? '#fff' : TEAL_D} />
      <Text style={[s.chipText, active && s.chipTextActive, { marginLeft: 6 }]}>{section.title}</Text>
    </Pressable>
  );
}

function ContactTile({
  icon,
  label,
  sub,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.contactTile, pressed && { opacity: 0.85 }]}
      android_ripple={{ color: '#EAF6F6' }}
    >
      <View style={[s.contactTileIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={s.contactTileLabel}>{label}</Text>
      <Text style={s.contactTileSub}>{sub}</Text>
    </Pressable>
  );
}

function FaqAccordionItem({
  index,
  question,
  answer,
  expanded,
  onToggle,
}: {
  index: number;
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [s.accordionItem, expanded && s.accordionItemOpen, pressed && Platform.OS === 'ios' && { opacity: 0.85 }]}
      android_ripple={{ color: '#EAF6F6' }}
    >
      <View style={s.accordionRow}>
        <View style={[s.accordionNum, expanded && s.accordionNumOpen]}>
          <Text style={[s.accordionNumText, expanded && s.accordionNumTextOpen]}>
            {String(index + 1).padStart(2, '0')}
          </Text>
        </View>
        <Text style={[s.accordionQ, expanded && s.accordionQOpen]} numberOfLines={expanded ? undefined : 2}>
          {question}
        </Text>
        <Ionicons
          name={expanded ? 'remove-circle' : 'add-circle-outline'}
          size={20}
          color={expanded ? TEAL : '#CBD5E1'}
        />
      </View>
      {expanded && (
        <View style={s.accordionAnswer}>
          <Text style={s.accordionAnswerText}>{answer}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function HelpScreen() {
  const [openFaq, setOpenFaq]             = useState<string | null>(null);
  const [faqQuery, setFaqQuery]           = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const params = useLocalSearchParams<{ feedback?: string; referenceId?: string }>();
  const [showFeedbackSuccess, setShowFeedbackSuccess] = useState(true);
  const feedbackSent = params.feedback === 'sent' && showFeedbackSuccess;

  const user = useAuthStore((s) => s.user);
  const { updateBasicProfile, updateHealthProfile, changePassword, requestAccountDeletion, cancelAccountDeletion } = useProfileStore();

  const [showEditModal, setShowEditModal]     = useState(false);
  const [showPwdModal, setShowPwdModal]       = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [langSaving, setLangSaving]           = useState(false);
  const [pwdSaving, setPwdSaving]             = useState(false);
  const [delLoading, setDelLoading]           = useState(false);

  const [editForm, setEditForm] = useState({
    firstName: user?.name?.split(' ')[0] ?? '',
    lastName: user?.name?.split(' ').slice(1).join(' ') ?? '',
    phone: user?.phone ?? '',
    dob: user?.dob ?? '',
    gender: user?.gender ?? '',
  });
  const [language, setLanguage]           = useState(user?.language ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const isDeletionScheduled = !!user?.deletion_scheduled_at;
  const deletionDate = isDeletionScheduled
    ? new Date(user!.deletion_scheduled_at as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const handleSaveEdit = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert('Validation', 'First and last name are required.'); return;
    }
    if (editForm.dob.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(editForm.dob.trim())) {
      Alert.alert('Validation', 'Date of birth must be YYYY-MM-DD.'); return;
    }
    const ok = await updateBasicProfile({
      name: `${editForm.firstName.trim()} ${editForm.lastName.trim()}`,
      phone: editForm.phone.trim() || undefined,
      dob: editForm.dob.trim() || undefined,
      gender: editForm.gender.trim() || undefined,
    });
    if (ok) { setShowEditModal(false); Alert.alert('Saved', 'Profile updated.'); }
    else Alert.alert('Error', 'Could not update profile.');
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation', 'Fill in all password fields.'); return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.'); return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.'); return;
    }
    setPwdSaving(true);
    const ok = await changePassword(currentPassword, newPassword, confirmPassword);
    setPwdSaving(false);
    if (ok) {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setShowPwdModal(false); Alert.alert('Saved', 'Password changed successfully.');
    } else Alert.alert('Error', 'Could not change password.');
  };

  const handleSaveLanguage = async () => {
    setLangSaving(true);
    const ok = await updateHealthProfile({ language: language || null });
    setLangSaving(false);
    if (ok) Alert.alert('Saved', 'Language preference updated.');
    else Alert.alert('Error', 'Could not save language preference.');
  };

  const handleRequestDelete = async () => {
    setDelLoading(true);
    const ok = await requestAccountDeletion();
    setDelLoading(false);
    setShowDeleteModal(false);
    if (ok) Alert.alert('Deletion Scheduled', 'Account scheduled for deletion in 90 days.');
    else Alert.alert('Error', 'Failed to schedule account deletion.');
  };

  const handleCancelDelete = async () => {
    setDelLoading(true);
    const ok = await cancelAccountDeletion();
    setDelLoading(false);
    setShowCancelModal(false);
    if (ok) Alert.alert('Cancelled', 'Account deletion cancelled.');
    else Alert.alert('Error', 'Failed to cancel account deletion.');
  };

  const appVersion     = Constants.expoConfig?.version ?? '1.0.0';
  const appName        = Constants.expoConfig?.name ?? 'LifeGate';
  const appWebsite     = 'https://lifegate.dshub.com.ng';
  const androidPackage = Constants.expoConfig?.android?.package ?? 'com.dshub.lifegate';
  const iosBundleId    = Constants.expoConfig?.ios?.bundleIdentifier ?? 'Not configured';
  const iosAppId       = String(Constants.expoConfig?.extra?.iosAppId ?? '').trim();

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openFirstSupportedUrl = async (urls: string[]) => {
    return openFirstSupportedExternalUrl(urls);
  };
  const handleOpenWebsite  = () => openFirstSupportedUrl([appWebsite]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open website.'); });
  const handleCallSupport  = () => openFirstSupportedUrl(['tel:+2349013453490', 'tel:+2349110192583']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open dialer.'); });
  const handleEmailSupport = () => openFirstSupportedUrl(['mailto:contact@dshub.com.ng']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open email.'); });
  const handleRateAndroid  = () => openFirstSupportedUrl([`market://details?id=${androidPackage}`, `https://play.google.com/store/apps/details?id=${androidPackage}`]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open Play Store.'); });
  const handleRateIOS      = () => openFirstSupportedUrl(iosAppId ? [`itms-apps://itunes.apple.com/app/id${iosAppId}?action=write-review`, `https://apps.apple.com/app/id${iosAppId}?action=write-review`] : [`itms-apps://apps.apple.com/ng/search?term=LifeGate%20DSHub`, `https://apps.apple.com/ng/search?term=LifeGate%20DSHub`]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open App Store.'); });
  const handleOpenProductHunt = () => {
    const url = 'https://www.producthunt.com/products/lifegate-by-dshub';
    void openExternalUrl(url).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open Product Hunt.'); });
  };

  // ── FAQ filter ─────────────────────────────────────────────────────────────
  const normalizedQuery = faqQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    let sections = FAQ_SECTIONS;
    if (activeCategory) sections = sections.filter((s) => s.id === activeCategory);
    if (!normalizedQuery) return sections;
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (item) =>
            item.q.toLowerCase().includes(normalizedQuery) ||
            item.a.toLowerCase().includes(normalizedQuery) ||
            sec.title.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [normalizedQuery, activeCategory]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Account modals ── */}
      <HelpActionModal visible={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Profile">
        <LabeledInput label="First Name" value={editForm.firstName} onChangeText={(t: string) => setEditForm({ ...editForm, firstName: t })} placeholder="First name" />
        <LabeledInput label="Last Name" value={editForm.lastName} onChangeText={(t: string) => setEditForm({ ...editForm, lastName: t })} placeholder="Last name" />
        <LabeledInput label="Phone" value={editForm.phone} onChangeText={(t: string) => setEditForm({ ...editForm, phone: t })} placeholder="Phone number" keyboardType="phone-pad" />
        <LabeledInput label="Date of Birth" value={editForm.dob} onChangeText={(t: string) => setEditForm({ ...editForm, dob: t })} placeholder="YYYY-MM-DD" />
        <LabeledInput label="Gender" value={editForm.gender} onChangeText={(t: string) => setEditForm({ ...editForm, gender: t })} placeholder="male / female / other" />
        <Pressable onPress={handleSaveEdit} style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.85 }]}>
          <Text style={s.modalBtnText}>Save Changes</Text>
        </Pressable>
        <Pressable onPress={() => setShowEditModal(false)} style={({ pressed }) => [s.modalBtnGhost, pressed && { opacity: 0.7 }]}>
          <Text style={s.modalBtnGhostText}>Cancel</Text>
        </Pressable>
      </HelpActionModal>

      <HelpActionModal visible={showPwdModal} onClose={() => setShowPwdModal(false)} title="Change Password">
        <LabeledInput label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current password" secureToggle />
        <LabeledInput label="New Password" value={newPassword} onChangeText={setNewPassword} placeholder="New password" secureToggle />
        <LabeledInput label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureToggle />
        <Pressable onPress={handleChangePassword} disabled={pwdSaving} style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.85 }]}>
          {pwdSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Update Password</Text>}
        </Pressable>
        <Pressable onPress={() => setShowPwdModal(false)} style={({ pressed }) => [s.modalBtnGhost, pressed && { opacity: 0.7 }]}>
          <Text style={s.modalBtnGhostText}>Cancel</Text>
        </Pressable>
      </HelpActionModal>

      <HelpActionModal visible={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Account?">
        <Text style={{ fontSize: 14, color: '#64748B', marginBottom: 16, lineHeight: 21 }}>
          Your account will be permanently deleted after a 90-day grace period. You can cancel anytime before then.
        </Text>
        <Pressable onPress={handleRequestDelete} disabled={delLoading} style={({ pressed }) => [s.modalBtn, { backgroundColor: '#DC2626' }, pressed && { opacity: 0.85 }]}>
          {delLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Schedule Deletion</Text>}
        </Pressable>
        <Pressable onPress={() => setShowDeleteModal(false)} style={({ pressed }) => [s.modalBtnGhost, pressed && { opacity: 0.7 }]}>
          <Text style={s.modalBtnGhostText}>Keep Account</Text>
        </Pressable>
      </HelpActionModal>

      <HelpActionModal visible={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancel Deletion?">
        <Text style={{ fontSize: 14, color: '#64748B', marginBottom: 16, lineHeight: 21 }}>
          This will restore your account to active status and stop the scheduled deletion.
        </Text>
        <Pressable onPress={handleCancelDelete} disabled={delLoading} style={({ pressed }) => [s.modalBtn, pressed && { opacity: 0.85 }]}>
          {delLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Keep My Account</Text>}
        </Pressable>
        <Pressable onPress={() => setShowCancelModal(false)} style={({ pressed }) => [s.modalBtnGhost, pressed && { opacity: 0.7 }]}>
          <Text style={s.modalBtnGhostText}>Go Back</Text>
        </Pressable>
      </HelpActionModal>

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Dark teal hero banner ── */}
        <View style={s.hero}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [s.heroBack, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>

          <View style={{ flex: 1, paddingHorizontal: 14 }}>
            <Text style={s.heroTitle}>Help Centre</Text>
            <Text style={s.heroSub}>v{appVersion} · {appName}</Text>
          </View>

          <View style={s.heroVersionBadge}>
            <Ionicons name="help-buoy-outline" size={22} color="rgba(255,255,255,0.8)" />
          </View>
        </View>

        {/* ── Floating search bar ── */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 10 }} />
            <TextInput
              value={faqQuery}
              onChangeText={(t) => { setFaqQuery(t); setActiveCategory(null); }}
              placeholder="Search help topics…"
              placeholderTextColor="#94A3B8"
              style={s.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {faqQuery ? (
              <Pressable onPress={() => setFaqQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 56 }}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Feedback success banner ── */}
          {feedbackSent && (
            <View style={s.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#059669" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.successTitle}>Feedback sent</Text>
                <Text style={s.successSub}>
                  {params.referenceId ? `Ref: ${params.referenceId}` : 'Our team will review your message shortly.'}
                </Text>
              </View>
              <Pressable onPress={() => setShowFeedbackSuccess(false)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#059669" />
              </Pressable>
            </View>
          )}

          {/* ── Account section ── */}
          {user && (
            <View style={s.sectionBlock}>
              <Text style={s.blockTitle}>Account</Text>

              {/* Profile identity row */}
              <View style={s.accountCard}>
                <View style={s.accountAvatar}>
                  <Text style={s.accountAvatarText}>
                    {(user.name ?? 'P').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.accountName}>{user.name || 'Patient'}</Text>
                  <Text style={s.accountEmail} numberOfLines={1}>{user.email}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setEditForm({
                      firstName: user.name?.split(' ')[0] ?? '',
                      lastName: user.name?.split(' ').slice(1).join(' ') ?? '',
                      phone: user.phone ?? '',
                      dob: user.dob ?? '',
                      gender: user.gender ?? '',
                    });
                    setShowEditModal(true);
                  }}
                  style={({ pressed }) => [s.accountEditBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                </Pressable>
              </View>

              {/* Action rows */}
              <View style={s.accountRows}>
                <Pressable onPress={() => setShowPwdModal(true)} style={({ pressed }) => [s.accountRow, pressed && { backgroundColor: '#F7FFFE' }]}>
                  <View style={[s.accountRowIcon, { backgroundColor: '#7C3AED18' }]}>
                    <Ionicons name="lock-closed-outline" size={16} color="#7C3AED" />
                  </View>
                  <Text style={s.accountRowLabel}>Change Password</Text>
                  <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                </Pressable>

                <Pressable onPress={() => router.push('/(tab)/settings/manage-profile')} style={({ pressed }) => [s.accountRow, pressed && { backgroundColor: '#F7FFFE' }]}>
                  <View style={[s.accountRowIcon, { backgroundColor: TEAL + '18' }]}>
                    <Ionicons name="fitness-outline" size={16} color={TEAL} />
                  </View>
                  <Text style={s.accountRowLabel}>Health Profile</Text>
                  <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                </Pressable>

                {isDeletionScheduled ? (
                  <Pressable onPress={() => setShowCancelModal(true)} style={({ pressed }) => [s.accountRow, pressed && { backgroundColor: '#F7FFFE' }]}>
                    <View style={[s.accountRowIcon, { backgroundColor: '#DC262618' }]}>
                      <Ionicons name="warning-outline" size={16} color="#DC2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.accountRowLabel, { color: '#DC2626' }]}>Deletion Scheduled</Text>
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Deletes on {deletionDate}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setShowDeleteModal(true)} style={({ pressed }) => [s.accountRow, { borderBottomWidth: 0 }, pressed && { backgroundColor: '#FFF5F5' }]}>
                    <View style={[s.accountRowIcon, { backgroundColor: '#DC262618' }]}>
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </View>
                    <Text style={[s.accountRowLabel, { color: '#DC2626' }]}>Delete Account</Text>
                    <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                  </Pressable>
                )}
              </View>

              {/* Language preference */}
              <View style={[s.accountRows, { marginTop: 10, paddingHorizontal: 12, paddingBottom: 4 }]}>
                <Text style={[s.blockTitle, { marginBottom: 8 }]}>Language</Text>
                <Dropdown
                  label=""
                  options={LANGUAGE_OPTIONS}
                  placeholder="Select language"
                  selectedValue={language}
                  onChange={(value: string) => setLanguage(value)}
                />
                <Pressable
                  onPress={handleSaveLanguage}
                  disabled={langSaving}
                  style={({ pressed }) => [s.modalBtn, { marginTop: 4 }, pressed && { opacity: 0.85 }]}
                >
                  {langSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Save Language</Text>}
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Contact action tiles ── */}
          <View style={s.sectionBlock}>
            <Text style={s.blockTitle}>Get Support</Text>
            <View style={s.contactGrid}>
              <ContactTile
                icon="chatbubble-ellipses-outline"
                label="Send Feedback"
                sub="Report bugs"
                color={TEAL}
                onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
              />
              <ContactTile
                icon="headset-outline"
                label="Contact Us"
                sub="Talk to support"
                color="#7C3AED"
                onPress={() => router.push('/(tab)/settings/contact-us')}
              />
              <ContactTile
                icon="call-outline"
                label="Call Now"
                sub="Urgent help"
                color="#DC2626"
                onPress={() => void handleCallSupport()}
              />
              <ContactTile
                icon="mail-outline"
                label="Email Us"
                sub="contact@dshub"
                color="#0891B2"
                onPress={() => void handleEmailSupport()}
              />
            </View>
          </View>

          {/* ── App info row ── */}
          <View style={s.sectionBlock}>
            <Text style={s.blockTitle}>App Info</Text>
            <View style={s.infoStrip}>
              <View style={s.infoStripItem}>
                <Text style={s.infoStripLabel}>Version</Text>
                <Text style={s.infoStripValue}>{appVersion}</Text>
              </View>
              <View style={s.infoStripDivider} />
              <View style={s.infoStripItem}>
                <Text style={s.infoStripLabel}>Platform</Text>
                <Text style={s.infoStripValue}>{androidPackage.split('.').pop()}</Text>
              </View>
              <View style={s.infoStripDivider} />
              <Pressable
                style={({ pressed }) => [s.infoStripItem, pressed && { opacity: 0.7 }]}
                onPress={() => void handleOpenWebsite()}
              >
                <Text style={s.infoStripLabel}>Website</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[s.infoStripValue, { color: TEAL, marginRight: 4 }]}>Open</Text>
                  <Ionicons name="open-outline" size={11} color={TEAL} />
                </View>
              </Pressable>
            </View>
          </View>

          {/* ── Rate Us ── */}
          <View style={s.sectionBlock}>
            <Text style={s.blockTitle}>Rate the App</Text>
            <View style={s.storeRow}>
              <Pressable
                onPress={() => void handleRateAndroid()}
                style={({ pressed }) => [s.storeBadge, { backgroundColor: '#01875F' }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="logo-google-playstore" size={22} color="#fff" style={{ marginRight: 10 }} />
                <View>
                  <Text style={s.storeBadgeSuper}>GET IT ON</Text>
                  <Text style={s.storeBadgeName}>Google Play</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => void handleRateIOS()}
                style={({ pressed }) => [s.storeBadge, { backgroundColor: '#111' }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="logo-apple" size={22} color="#fff" style={{ marginRight: 10 }} />
                <View>
                  <Text style={s.storeBadgeSuper}>DOWNLOAD ON THE</Text>
                  <Text style={s.storeBadgeName}>App Store</Text>
                </View>
              </Pressable>
            </View>
            <Pressable
              onPress={handleOpenProductHunt}
              style={({ pressed }) => [s.storeBadge, { backgroundColor: '#DA552F', marginTop: 10, alignSelf: 'flex-start' }, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="rocket-outline" size={22} color="#fff" style={{ marginRight: 10 }} />
              <View>
                <Text style={s.storeBadgeSuper}>FIND US ON</Text>
                <Text style={s.storeBadgeName}>Product Hunt</Text>
              </View>
            </Pressable>
          </View>

          {/* ── FAQ ── */}
          <View style={s.sectionBlock}>
            <Text style={s.blockTitle}>Frequently Asked</Text>

            {/* Category chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
            >
              <Pressable
                onPress={() => { setActiveCategory(null); setFaqQuery(''); }}
                style={({ pressed }) => [s.chip, !activeCategory && s.chipActive, pressed && activeCategory && { opacity: 0.7 }]}
              >
                <Ionicons name="apps-outline" size={13} color={!activeCategory ? '#fff' : TEAL_D} />
                <Text style={[s.chipText, !activeCategory && s.chipTextActive, { marginLeft: 6 }]}>All</Text>
              </Pressable>
              {FAQ_SECTIONS.map((sec) => (
                <CategoryChip
                  key={sec.id}
                  section={sec}
                  active={activeCategory === sec.id}
                  onPress={() => { setActiveCategory(activeCategory === sec.id ? null : sec.id); setFaqQuery(''); }}
                />
              ))}
            </ScrollView>

            {/* Sections */}
            {filteredSections.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="search-outline" size={36} color="#CBD5E1" />
                <Text style={s.emptyTitle}>No results</Text>
                <Text style={s.emptySub}>Try a different keyword or send us your question.</Text>
                <Pressable
                  onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
                  style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={s.emptyBtnText}>Send Feedback</Text>
                </Pressable>
              </View>
            ) : (
              filteredSections.map((section) => (
                <View key={section.id} style={s.faqSection}>
                  {/* Section header strip */}
                  <View style={s.faqSectionHead}>
                    <View style={s.faqSectionIconWrap}>
                      <Ionicons name={section.icon} size={14} color="#fff" />
                    </View>
                    <Text style={s.faqSectionTitle}>{section.title}</Text>
                    <View style={s.faqCountBadge}>
                      <Text style={s.faqCountText}>{section.items.length}</Text>
                    </View>
                  </View>

                  {/* Items */}
                  <View style={s.accordionList}>
                    {section.items.map((item, idx) => (
                      <FaqAccordionItem
                        key={item.q}
                        index={idx}
                        question={item.q}
                        answer={item.a}
                        expanded={openFaq === item.q}
                        onToggle={() => setOpenFaq(openFaq === item.q ? null : item.q)}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // Hero
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
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  heroVersionBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchWrap: {
    backgroundColor: TEAL_DEEP,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    paddingVertical: 0,
  },

  // Success banner
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 12,
  },
  successTitle: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  successSub:   { fontSize: 11, color: '#059669', marginTop: 1 },

  // Section blocks
  sectionBlock: { paddingHorizontal: 16, paddingTop: 22 },
  blockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Contact grid
  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  contactTile: {
    width: '48%',
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAF2F2',
    shadowColor: TEAL,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  contactTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  contactTileLabel: { fontSize: 13, fontWeight: '800', color: '#1E293B', marginBottom: 2 },
  contactTileSub:   { fontSize: 11, color: '#94A3B8' },

  // App info strip
  infoStrip: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAF2F2',
    overflow: 'hidden',
  },
  infoStripItem:    { flex: 1, alignItems: 'center', paddingVertical: 14 },
  infoStripDivider: { width: 1, backgroundColor: '#EAF2F2' },
  infoStripLabel:   { fontSize: 10, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  infoStripValue:   { fontSize: 13, fontWeight: '700', color: '#1E293B' },

  // Store badges
  storeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  storeBadge: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  storeBadgeSuper: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.3, textTransform: 'uppercase' },
  storeBadgeName:  { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 1 },

  // Category chips
  chipsRow: { paddingRight: 16, paddingBottom: 14, flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#D1EAE9',
  },
  chipActive:     { backgroundColor: TEAL_D, borderColor: TEAL_D },
  chipText:       { fontSize: 12, fontWeight: '700', color: TEAL_D },
  chipTextActive: { color: '#fff' },

  // FAQ section
  faqSection: { marginBottom: 20 },
  faqSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TEAL_DEEP,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  faqSectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  faqSectionTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' },
  faqCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  faqCountText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // Accordion list
  accordionList: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAF2F2',
    overflow: 'hidden',
  },
  accordionItem: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAF2F2',
  },
  accordionItemOpen: { backgroundColor: '#F7FFFE' },

  // Account section
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAF2F2',
    padding: 14,
    marginBottom: 10,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DFF4F3',
    borderWidth: 2,
    borderColor: '#A9E4E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountAvatarText: { fontSize: 15, fontWeight: '900', color: TEAL_D },
  accountName: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  accountEmail: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  accountEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: TEAL_D,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRows: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAF2F2',
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAF2F2',
  },
  accountRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountRowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1E293B' },

  // Modal buttons (light themed)
  modalBtn: {
    backgroundColor: TEAL_D,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  modalBtnGhost: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalBtnGhostText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  accordionRow:      { flexDirection: 'row', alignItems: 'flex-start' },
  accordionNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  accordionNumOpen:     { backgroundColor: TEAL_L },
  accordionNumText:     { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  accordionNumTextOpen: { color: TEAL_D },
  accordionQ:     { flex: 1, fontSize: 14, fontWeight: '600', color: '#1E293B', lineHeight: 20 },
  accordionQOpen: { color: TEAL_D },
  accordionAnswer: {
    marginTop: 12,
    marginLeft: 40,
    backgroundColor: TEAL_L,
    borderRadius: 10,
    padding: 12,
  },
  accordionAnswerText: { fontSize: 13, color: '#374151', lineHeight: 20 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 4 },
  emptySub:   { fontSize: 12, color: '#94A3B8', textAlign: 'center', maxWidth: 240, lineHeight: 18, marginTop: 8 },
  emptyBtn:   { marginTop: 8, backgroundColor: TEAL, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 24 },
  emptyBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
