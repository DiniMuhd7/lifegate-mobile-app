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
} from 'react-native';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

// ── Brand tokens ────────────────────────────────────────────────────────────
const T = '#0EA5A4';
const T_DARK = '#0B8E8D';
const T_LIGHT = '#E0F3F3';
const BG = '#F0F8F8';

// ── FAQ data ─────────────────────────────────────────────────────────────────
type FaqEntry = { q: string; a: string };
type FaqSection = { title: string; icon: keyof typeof Ionicons.glyphMap; items: FaqEntry[] };

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Account & Access',
    icon: 'person-circle-outline',
    items: [
      {
        q: 'I cannot log in. What should I do?',
        a: 'First confirm your internet connection. Then verify your email/phone and password. If you still cannot log in, reset your password and try again. If the issue persists, contact support and include your registered phone/email.',
      },
      {
        q: 'I forgot my password and reset is not working.',
        a: 'Check for typing errors, ensure your new password meets complexity rules, and wait a few minutes before retrying. If reset links or OTPs are delayed, verify network and spam folders. Contact support if no reset message arrives after multiple attempts.',
      },
      {
        q: 'My profile details are outdated or incomplete.',
        a: 'Go to Settings > Manage Profile and update blood type, genotype, allergies, medications, and emergency contact. Keeping this complete improves triage safety and recommendation quality.',
      },
    ],
  },
  {
    title: 'Subscription & Billing',
    icon: 'card-outline',
    items: [
      {
        q: 'How do subscriptions and credits work?',
        a: 'Go to Settings > Subscription to buy credit bundles. Credits are used for eligible clinical workflows and deducted per session. Review usage and payment records in your transaction history.',
      },
      {
        q: 'I was charged but credits did not reflect.',
        a: 'Allow a short sync window, then refresh the app. If credits still do not appear, send a support message with transaction date, amount, and channel used. The billing team can reconcile and apply corrections quickly.',
      },
      {
        q: 'Why were credits deducted unexpectedly?',
        a: 'Credits are consumed when certain clinical workflows are completed. Check your recent sessions and transaction records. If the deduction looks incorrect, report it from Send Feedback with session details for investigation.',
      },
      {
        q: 'Can I request a refund for a failed payment?',
        a: 'Yes. Contact support with proof of payment, transaction reference, and timestamp. Refund and reversal eligibility depends on payment status verification and platform policy.',
      },
    ],
  },
  {
    title: 'Tests, Modes & Clinical Output',
    icon: 'medkit-outline',
    items: [
      {
        q: 'How does the Vision Test work?',
        a: 'Vision Test guides you through automated checks such as acuity and related screening steps. For best results, use good lighting, follow distance instructions, and complete each step carefully.',
      },
      {
        q: 'How does the Hearing Test work?',
        a: 'Hearing Test runs guided tone and listening checks to estimate hearing patterns. Use quality headphones in a quiet space and avoid interruptions to improve reliability.',
      },
      {
        q: 'What is General Mode?',
        a: 'General Mode provides broad health guidance and wellness education. It is best for low-risk concerns and does not replace formal diagnosis in urgent or complex cases.',
      },
      {
        q: 'What is Clinical Mode?',
        a: 'Clinical Mode is for structured symptom assessment and higher-risk support. It can trigger physician review workflows, urgency scoring, and stricter safety checks.',
      },
      {
        q: 'What is EDIS in LifeGate?',
        a: "EDIS is LifeGate's clinical interpretation and safety layer. It structures user input, applies guardrails, and prioritizes risk before recommendations are shown.",
      },
      {
        q: 'How do I improve diagnosis quality?',
        a: 'Keep your health profile updated, provide clear symptom timeline and severity, include medication/allergy history, and complete requested tests with accurate responses.',
      },
    ],
  },
  {
    title: 'App Performance',
    icon: 'phone-portrait-outline',
    items: [
      {
        q: 'The app is slow, freezing, or showing a blank screen.',
        a: 'Close and reopen the app, then check your network. If issue remains, restart device and update to latest app version. If still unresolved, send feedback with device model, OS version, and exact screen where it happens.',
      },
      {
        q: 'Why am I not receiving notifications?',
        a: 'Open Notifications in Settings and enable push access. If disabled at device level, grant permission in device settings. Also check battery optimization rules that may block background alerts.',
      },
      {
        q: 'Some pages or actions fail to load.',
        a: 'This is often due to unstable connection or temporary service downtime. Retry after reconnecting, and if repeated, report the action, time, and screenshot through Send Feedback.',
      },
      {
        q: 'My submitted feedback did not get a response.',
        a: 'After submission, keep your reference ID. Support responses may take some time depending on queue volume. If delayed, contact support directly and include the reference ID for faster tracking.',
      },
    ],
  },
  {
    title: 'Safety & Emergencies',
    icon: 'shield-checkmark-outline',
    items: [
      {
        q: 'Does LifeGate replace my doctor?',
        a: 'No. LifeGate supports triage and guidance. Licensed physicians handle clinical review and final treatment decisions where required.',
      },
      {
        q: 'What should I do in an emergency?',
        a: 'If you have severe chest pain, breathing difficulty, seizure, heavy bleeding, confusion, or loss of consciousness, seek emergency medical care immediately. Do not wait for in-app responses.',
      },
      {
        q: 'What if I disagree with the app recommendation?',
        a: 'Use your clinical judgement and seek physician review, especially if symptoms worsen. You can request further evaluation or escalate by contacting support with your case context.',
      },
      {
        q: 'How is my health information protected?',
        a: 'LifeGate uses secure handling practices for clinical data and limits sensitive access to relevant workflows. Do not share your account credentials, and report suspicious activity immediately.',
      },
    ],
  },
  {
    title: 'Lifecoins & Rewards',
    icon: 'heart-outline',
    items: [
      {
        q: 'What are Lifecoins?',
        a: "Lifecoins are LifeGate's in-app reward currency. You earn them by completing health activities such as watching educational videos, completing check-ins, and engaging with the platform.",
      },
      {
        q: 'How do I earn Lifecoins?',
        a: 'Earn Lifecoins by watching health videos on the Explore screen until the required watch threshold is met, completing daily check-ins, and other in-app health activities.',
      },
      {
        q: 'Is there a daily limit on earning Lifecoins?',
        a: `Yes. You can earn Lifecoins from up to ${5} videos per day. The daily count resets at midnight. You can still watch more videos, but coins are only awarded for the first ${5} completions each day.`,
      },
      {
        q: 'My Lifecoins balance did not update.',
        a: 'Allow a short moment for the wallet to sync. Pull to refresh on the wallet screen. If still incorrect, report it from Send Feedback and include the video title, date, and time.',
      },
    ],
  },
  {
    title: 'Physician Consultations',
    icon: 'person-add-outline',
    items: [
      {
        q: 'How does physician assignment work?',
        a: 'When your case requires clinical review, LifeGate assigns an available licensed physician based on case urgency, specialty, and physician availability.',
      },
      {
        q: 'When will a physician respond?',
        a: 'Response times depend on physician availability and your case urgency level. Urgent cases are prioritised. You will receive an in-app notification when a physician reviews or responds.',
      },
      {
        q: 'Can I message my assigned physician?',
        a: 'Yes. Once a physician is assigned to your active case, a chat icon appears in the Diagnosis Report screen. Tap it to open the Instant Message panel.',
      },
      {
        q: 'My case shows Active but no physician has responded.',
        a: 'Cases in the queue may take time depending on volume. If your case has been Active without any update for an unexpectedly long time, contact support with your case ID.',
      },
    ],
  },
  {
    title: 'Privacy & Data',
    icon: 'lock-closed-outline',
    items: [
      {
        q: 'What health data does LifeGate store?',
        a: 'LifeGate stores profile information, symptom reports, health metrics, test results, and consultation history needed to deliver clinical services safely.',
      },
      {
        q: 'Can I delete my account and data?',
        a: 'Yes. Go to Settings and look for Account Deletion or contact support to initiate a deletion request. Deletion removes your personal data subject to applicable legal retention requirements.',
      },
      {
        q: 'Who can see my clinical information?',
        a: 'Your clinical data is visible to assigned physicians in the context of active cases, and to authorised admin personnel for safety purposes. LifeGate does not sell personal health data.',
      },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelAccent} />
      <Text style={styles.sectionLabel}>{title}</Text>
    </View>
  );
}

function QuickActionButton({
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
      style={({ pressed }) => [
        styles.quickRow,
        !last && styles.quickRowBorder,
        pressed && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
      android_ripple={{ color: '#f0fafb' }}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={18} color={T} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.quickLabel}>{label}</Text>
        {sublabel ? <Text style={styles.quickSublabel}>{sublabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#C8D4D4" />
    </Pressable>
  );
}

function FaqItem({
  question,
  answer,
  expanded,
  onToggle,
}: {
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.faqItem,
        expanded && styles.faqItemExpanded,
        pressed && Platform.OS === 'ios' && { opacity: 0.8 },
      ]}
      android_ripple={{ color: '#f0fafb' }}
    >
      <View style={styles.faqItemRow}>
        <Text style={styles.faqQuestion} numberOfLines={expanded ? undefined : 2}>
          {question}
        </Text>
        <View style={[styles.faqChevron, expanded && styles.faqChevronOpen]}>
          <Ionicons name="chevron-down" size={14} color={expanded ? T_DARK : '#94A3B8'} />
        </View>
      </View>
      {expanded ? (
        <Text style={styles.faqAnswer}>{answer}</Text>
      ) : null}
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function HelpScreen() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [faqQuery, setFaqQuery] = useState('');
  const params = useLocalSearchParams<{ feedback?: string; referenceId?: string }>();
  const [showFeedbackSuccess, setShowFeedbackSuccess] = useState(true);
  const feedbackSent = params.feedback === 'sent' && showFeedbackSuccess;

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const appName = Constants.expoConfig?.name ?? 'LifeGate';
  const appWebsite = 'https://lifegate.dshub.com.ng';
  const androidPackage = Constants.expoConfig?.android?.package ?? 'com.lazyapp.lifegatemobile';
  const iosBundleId = Constants.expoConfig?.ios?.bundleIdentifier ?? 'Not configured';
  const iosAppId = String(Constants.expoConfig?.extra?.iosAppId ?? '').trim();

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const openFirstSupportedUrl = async (urls: string[]) => {
    for (const url of urls) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) { await Linking.openURL(url); return true; }
      } catch { /* try next */ }
    }
    return false;
  };

  const handleOpenWebsite = () =>
    openFirstSupportedUrl([appWebsite]).then((ok) => {
      if (!ok) Alert.alert('Unavailable', 'Unable to open website right now.');
    });

  const handleRateAndroid = () =>
    openFirstSupportedUrl([
      `market://details?id=${androidPackage}`,
      `https://play.google.com/store/apps/details?id=${androidPackage}`,
    ]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open Play Store.'); });

  const handleRateIOS = () =>
    openFirstSupportedUrl(
      iosAppId
        ? [`itms-apps://itunes.apple.com/app/id${iosAppId}?action=write-review`,
           `https://apps.apple.com/app/id${iosAppId}?action=write-review`]
        : [`itms-apps://apps.apple.com/ng/search?term=LifeGate%20DSHub`,
           `https://apps.apple.com/ng/search?term=LifeGate%20DSHub`]
    ).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open App Store.'); });

  const handleCallSupport = () =>
    openFirstSupportedUrl(['tel:+2349013453490', 'tel:+2349110192583']).then((ok) => {
      if (!ok) Alert.alert('Unavailable', 'Unable to open dialer right now.');
    });

  const handleEmailSupport = () =>
    openFirstSupportedUrl(['mailto:contact@dshub.com.ng']).then((ok) => {
      if (!ok) Alert.alert('Unavailable', 'Unable to open email app right now.');
    });

  // ── FAQ filter ───────────────────────────────────────────────────────────────
  const normalizedQuery = faqQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return FAQ_SECTIONS;
    return FAQ_SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter(
        (item) =>
          item.q.toLowerCase().includes(normalizedQuery) ||
          item.a.toLowerCase().includes(normalizedQuery) ||
          s.title.toLowerCase().includes(normalizedQuery),
      ),
    })).filter((s) => s.items.length > 0);
  }, [normalizedQuery]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#1A1A2E" />
          </Pressable>
          <Text style={styles.headerTitle}>Help Center</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Feedback success banner ── */}
          {feedbackSent && (
            <View style={styles.successBanner}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>Feedback sent</Text>
                <Text style={styles.successSub}>
                  {params.referenceId
                    ? `Reference: ${params.referenceId}`
                    : 'Our support team will review your message shortly.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowFeedbackSuccess(false)}
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : {})}
              >
                <Ionicons name="close-circle" size={20} color="#059669" />
              </Pressable>
            </View>
          )}

          {/* ── Hero card ── */}
          <View style={styles.heroCard}>
            <View style={styles.heroInner}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="help-buoy-outline" size={26} color={T} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>How can we help?</Text>
                <Text style={styles.heroSub}>
                  Browse FAQs, send feedback, or reach our support team directly.
                </Text>
              </View>
            </View>
          </View>

          {/* ── Quick Actions ── */}
          <SectionLabel title="Support" />
          <View style={styles.card}>
            <QuickActionButton
              icon="chatbubble-ellipses-outline"
              label="Send Feedback"
              sublabel="Report bugs or suggest improvements"
              onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
            />
            <QuickActionButton
              icon="headset-outline"
              label="Contact Support"
              sublabel="Call or email our support team"
              onPress={() => router.push('/(tab)/settings/contact-us')}
              last
            />
          </View>

          {/* ── Urgent Help ── */}
          <View style={styles.urgentCard}>
            <View style={styles.urgentHeader}>
              <View style={styles.urgentIconWrap}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.urgentTitle}>Need urgent help?</Text>
                <Text style={styles.urgentSub}>
                  Include your patient ID for the fastest resolution.
                </Text>
              </View>
            </View>
            <View style={styles.urgentActions}>
              <Pressable
                onPress={() => void handleCallSupport()}
                style={({ pressed }) => [styles.urgentBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="call" size={15} color="#fff" />
                <Text style={styles.urgentBtnText}>Call Support</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleEmailSupport()}
                style={({ pressed }) => [styles.urgentBtnOutline, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="mail-outline" size={15} color="#DC2626" />
                <Text style={styles.urgentBtnOutlineText}>Email</Text>
              </Pressable>
            </View>
          </View>

          {/* ── App Info ── */}
          <SectionLabel title="App Info" />
          <View style={styles.card}>
            <InfoRow label="App name" value={appName} />
            <InfoRow label="Version" value={appVersion} />
            <InfoRow label="Android package" value={androidPackage} />
            <InfoRow label="iOS bundle ID" value={iosBundleId} />
            <Pressable
              onPress={() => void handleOpenWebsite()}
              style={({ pressed }) => [styles.websiteRow, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="globe-outline" size={15} color={T} />
              <Text style={styles.websiteText}>lifegate.dshub.com.ng</Text>
              <Ionicons name="open-outline" size={13} color={T_DARK} style={{ marginLeft: 'auto' }} />
            </Pressable>
          </View>

          {/* ── Rate Us ── */}
          <SectionLabel title="Rate Us" />
          <View style={styles.card}>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
              <Text style={styles.rateHint}>
                Enjoying LifeGate? A review helps others find trusted health support.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Pressable
                onPress={() => void handleRateAndroid()}
                style={({ pressed }) => [styles.storeBadge, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="logo-google-playstore" size={26} color="#fff" />
                <View>
                  <Text style={styles.storeBadgeSuper}>GET IT ON</Text>
                  <Text style={styles.storeBadgeName}>Google Play</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => void handleRateIOS()}
                style={({ pressed }) => [styles.storeBadge, styles.storeBadgeApple, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="logo-apple" size={26} color="#fff" />
                <View>
                  <Text style={styles.storeBadgeSuper}>DOWNLOAD ON THE</Text>
                  <Text style={styles.storeBadgeName}>App Store</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* ── FAQ ── */}
          <SectionLabel title="FAQ" />

          {/* Search bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color="#94A3B8" />
            <TextInput
              value={faqQuery}
              onChangeText={setFaqQuery}
              placeholder="Search help topics…"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {faqQuery ? (
              <Pressable onPress={() => setFaqQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>

          {filteredSections.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={32} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptySub}>
                Try a different keyword, or send us your question directly.
              </Text>
              <Pressable
                onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
                style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.emptyActionText}>Send Feedback</Text>
              </Pressable>
            </View>
          ) : null}

          {filteredSections.map((section, sIdx) => (
            <View key={section.title} style={{ marginBottom: sIdx === filteredSections.length - 1 ? 0 : 20 }}>
              {/* Section header */}
              <View style={styles.faqSectionHead}>
                <View style={styles.faqSectionIcon}>
                  <Ionicons name={section.icon} size={14} color={T_DARK} />
                </View>
                <Text style={styles.faqSectionTitle}>{section.title}</Text>
                <View style={styles.faqSectionBadge}>
                  <Text style={styles.faqSectionBadgeText}>{section.items.length}</Text>
                </View>
              </View>

              {/* FAQ items */}
              <View style={styles.card}>
                {section.items.map((item, idx) => (
                  <View key={item.q} style={idx < section.items.length - 1 && styles.faqDivider}>
                    <FaqItem
                      question={item.q}
                      answer={item.a}
                      expanded={openFaq === item.q}
                      onToggle={() => setOpenFaq(openFaq === item.q ? null : item.q)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: BG,
  },
  backBtn: {
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

  // scroll
  scrollContent: { paddingHorizontal: 16, paddingBottom: 48, paddingTop: 4 },

  // Section labels
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

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAF2F2',
    shadowColor: T,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  // Success banner
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  successIconWrap: { marginRight: 2 },
  successTitle: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  successSub: { fontSize: 11, color: '#059669', marginTop: 2 },

  // Hero
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCEFEF',
    shadowColor: T,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    marginBottom: 4,
  },
  heroInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 4 },
  heroSub: { fontSize: 12, color: '#64748B', lineHeight: 17 },

  // Quick actions
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  quickRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F8F8' },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  quickSublabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // Urgent
  urgentCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  urgentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  urgentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTitle: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  urgentSub: { fontSize: 11, color: '#DC2626', marginTop: 2 },
  urgentActions: { flexDirection: 'row', gap: 10 },
  urgentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#DC2626',
    borderRadius: 11,
    paddingVertical: 12,
  },
  urgentBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  urgentBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#fff',
    borderRadius: 11,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  urgentBtnOutlineText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  // App info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F8F8',
  },
  infoLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1E293B', maxWidth: '65%' },
  websiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  websiteText: { fontSize: 13, fontWeight: '600', color: T },

  // Rate Us
  rateHint: { fontSize: 12, color: '#64748B', lineHeight: 18 },
  storeBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#01875F',
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  storeBadgeApple: { backgroundColor: '#111111' },
  storeBadgeSuper: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.70)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  storeBadgeName: { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 1 },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2ECEC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    shadowColor: T,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    paddingVertical: 0,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 4 },
  emptySub: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 18 },
  emptyAction: {
    marginTop: 8,
    backgroundColor: T,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  emptyActionText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // FAQ section header
  faqSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingLeft: 2,
  },
  faqSectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: T_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqSectionTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#374151' },
  faqSectionBadge: {
    backgroundColor: T_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  faqSectionBadgeText: { fontSize: 11, fontWeight: '700', color: T_DARK },

  // FAQ items
  faqDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F8F8' },
  faqItem: {
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  faqItemExpanded: { backgroundColor: '#FAFFFE' },
  faqItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 20,
  },
  faqChevron: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  faqChevronOpen: { backgroundColor: T_LIGHT, transform: [{ rotate: '180deg' }] },
  faqAnswer: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
    marginTop: 10,
    paddingLeft: 0,
  },
});
