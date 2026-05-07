import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { PatientBottomTabBar } from 'components/PatientBottomTabBar';

// ── iOS system palette (same as profile.tsx) ──────────────────────────────────
const SYS_BG     = '#F2F2F7';
const SYS_WHITE  = '#FFFFFF';
const SYS_LABEL  = '#000000';
const SYS_SECOND = '#3C3C43';
const SYS_THIRD  = '#8E8E93';
const SYS_FILL   = '#E5E5EA';
const SYS_TEAL   = '#0EA5A4';
const SYS_RED    = '#FF3B30';
const SYS_BLUE   = '#34AADC';
const SYS_GREEN  = '#34C759';
const SYS_PURPLE = '#AF52DE';

// ── FAQ data (same as help-center.tsx) ────────────────────────────────────────
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

// ── Sub-components (iOS style, same as profile.tsx) ───────────────────────────

function SysHeader({ title }: { title: string }) {
  return <Text style={s.sysHeader}>{title.toUpperCase()}</Text>;
}

function SysRow({
  icon,
  iconBg,
  label,
  value,
  chevron,
  last,
  onPress,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  label: string;
  value?: string;
  chevron?: boolean;
  last?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const inner = (
    <View style={[s.sysRow, !last && s.sysRowDivider]}>
      {icon && (
        <View style={[s.sysRowIcon, { backgroundColor: iconBg ?? SYS_TEAL }]}>
          <Ionicons name={icon} size={14} color="#fff" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.sysRowLabel}>{label}</Text>
        {children}
      </View>
      {value ? <Text style={s.sysRowValue} numberOfLines={1}>{value}</Text> : null}
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

/** Expandable FAQ row in iOS inset-grouped style */
function FaqRow({
  index,
  question,
  answer,
  expanded,
  onToggle,
  last,
}: {
  index: number;
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      android_ripple={{ color: '#E5E5EA' }}
      style={({ pressed }) => (pressed && Platform.OS === 'ios' ? { opacity: 0.5 } : {})}
    >
      <View style={[s.sysRow, { alignItems: 'flex-start', paddingVertical: 14 }, !last && s.sysRowDivider]}>
        <View style={[s.sysRowIcon, { backgroundColor: SYS_FILL, marginTop: 2 }]}>
          <Text style={s.faqNum}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sysRowLabel, expanded && { color: SYS_TEAL }]}>{question}</Text>
          {expanded && (
            <Text style={s.faqAnswer}>{answer}</Text>
          )}
        </View>
        <Ionicons
          name={expanded ? 'remove-circle-outline' : 'add-circle-outline'}
          size={18}
          color={expanded ? SYS_TEAL : SYS_FILL}
          style={{ marginLeft: 8, marginTop: 2 }}
        />
      </View>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function Item2Screen() {
  const [openFaq, setOpenFaq]               = useState<string | null>(null);
  const [faqQuery, setFaqQuery]             = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const params = useLocalSearchParams<{ feedback?: string; referenceId?: string }>();
  const [showFeedbackBanner, setShowFeedbackBanner] = useState(true);
  const feedbackSent = params.feedback === 'sent' && showFeedbackBanner;

  const appVersion     = Constants.expoConfig?.version ?? '1.0.0';
  const appName        = Constants.expoConfig?.name ?? 'LifeGate';
  const appWebsite     = 'https://lifegate.dshub.com.ng';
  const androidPackage = Constants.expoConfig?.android?.package ?? 'com.lazyapp.lifegatemobile';
  const iosAppId       = String(Constants.expoConfig?.extra?.iosAppId ?? '').trim();

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openFirstSupportedUrl = async (urls: string[]) => {
    for (const url of urls) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) { await Linking.openURL(url); return true; }
      } catch { /* try next */ }
    }
    return false;
  };
  const handleOpenWebsite  = () => openFirstSupportedUrl([appWebsite]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open website.'); });
  const handleCallSupport  = () => openFirstSupportedUrl(['tel:+2349013453490', 'tel:+2349110192583']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open dialer.'); });
  const handleEmailSupport = () => openFirstSupportedUrl(['mailto:contact@dshub.com.ng']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open email.'); });
  const handleRateAndroid  = () => openFirstSupportedUrl([`market://details?id=${androidPackage}`, `https://play.google.com/store/apps/details?id=${androidPackage}`]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open Play Store.'); });
  const handleRateIOS      = () => openFirstSupportedUrl(iosAppId ? [`itms-apps://itunes.apple.com/app/id${iosAppId}?action=write-review`, `https://apps.apple.com/app/id${iosAppId}?action=write-review`] : [`itms-apps://apps.apple.com/ng/search?term=LifeGate%20DSHub`, `https://apps.apple.com/ng/search?term=LifeGate%20DSHub`]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open App Store.'); });

  // ── FAQ filtering (same as help-center.tsx) ────────────────────────────────
  const normalizedQuery = faqQuery.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    let sections = FAQ_SECTIONS;
    if (activeCategory) sections = sections.filter((sec) => sec.id === activeCategory);
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
    <View style={{ flex: 1, backgroundColor: SYS_BG }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── iOS navigation bar ── */}
        <View style={s.navBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.navBack, pressed && { opacity: 0.5 }]}>
            <Ionicons name="chevron-back" size={20} color={SYS_TEAL} />
            <Text style={s.navBackText}>Settings</Text>
          </Pressable>
          <Text style={s.navTitle}>Help Centre</Text>
          <View style={s.navAction} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Feedback success banner ── */}
          {feedbackSent && (
            <View style={s.feedbackBanner}>
              <Ionicons name="checkmark-circle" size={18} color={SYS_GREEN} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.feedbackBannerTitle}>Feedback sent</Text>
                <Text style={s.feedbackBannerSub}>
                  {params.referenceId ? `Ref: ${params.referenceId}` : 'Our team will review your message shortly.'}
                </Text>
              </View>
              <Pressable onPress={() => setShowFeedbackBanner(false)} hitSlop={8}>
                <Ionicons name="close" size={16} color={SYS_GREEN} />
              </Pressable>
            </View>
          )}

          {/* ── Search ── */}
          <View style={s.searchWrap}>
            <View style={s.searchBar}>
              <Ionicons name="search" size={15} color={SYS_THIRD} style={{ marginRight: 8 }} />
              <TextInput
                value={faqQuery}
                onChangeText={(t) => { setFaqQuery(t); setActiveCategory(null); }}
                placeholder="Search help topics"
                placeholderTextColor={SYS_THIRD}
                style={s.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {faqQuery ? (
                <Pressable onPress={() => setFaqQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={15} color={SYS_THIRD} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ── Get Support ── */}
          <SysHeader title="Get Support" />
          <View style={s.sysGroup}>
            <SysRow icon="chatbubble-ellipses-outline" iconBg={SYS_TEAL}   label="Send Feedback" value="Report bugs"        chevron onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')} />
            <SysRow icon="headset-outline"              iconBg={SYS_PURPLE} label="Contact Us"    value="Talk to support"    chevron onPress={() => router.push('/(tab)/settings/contact-us')} />
            <SysRow icon="call-outline"                 iconBg={SYS_RED}    label="Call Now"      value="Urgent help"        chevron onPress={() => void handleCallSupport()} />
            <SysRow icon="mail-outline"                 iconBg={SYS_BLUE}   label="Email Us"      value="contact@dshub.com.ng" chevron onPress={() => void handleEmailSupport()} last />
          </View>

          {/* ── App Info ── */}
          <SysHeader title="App Info" />
          <View style={s.sysGroup}>
            <SysRow icon="information-circle-outline" iconBg="#5856D6" label="Version"  value={`v${appVersion}`} />
            <SysRow icon="phone-portrait-outline"     iconBg="#8E8E93" label="Platform" value={androidPackage.split('.').pop()} />
            <SysRow icon="globe-outline"              iconBg={SYS_BLUE} label="Website" value="Open" chevron onPress={() => void handleOpenWebsite()} last />
          </View>

          {/* ── Rate the App ── */}
          <SysHeader title="Rate the App" />
          <View style={s.sysGroup}>
            <SysRow icon="logo-google-playstore" iconBg="#01875F" label="Google Play" value="Rate us"     chevron onPress={() => void handleRateAndroid()} />
            <SysRow icon="logo-apple"            iconBg="#000000" label="App Store"   value="Rate us"     chevron onPress={() => void handleRateIOS()}     last />
          </View>

          {/* ── FAQ Category filter chips ── */}
          <SysHeader title="Frequently Asked" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            <Pressable
              onPress={() => { setActiveCategory(null); setFaqQuery(''); }}
              style={({ pressed }) => [s.chip, !activeCategory && s.chipActive, pressed && activeCategory && { opacity: 0.7 }]}
            >
              <Ionicons name="apps-outline" size={12} color={!activeCategory ? SYS_WHITE : SYS_TEAL} />
              <Text style={[s.chipText, !activeCategory && s.chipTextActive]}>All</Text>
            </Pressable>
            {FAQ_SECTIONS.map((sec) => {
              const active = activeCategory === sec.id;
              return (
                <Pressable
                  key={sec.id}
                  onPress={() => { setActiveCategory(active ? null : sec.id); setFaqQuery(''); }}
                  style={({ pressed }) => [s.chip, active && s.chipActive, pressed && !active && { opacity: 0.7 }]}
                >
                  <Ionicons name={sec.icon} size={12} color={active ? SYS_WHITE : SYS_TEAL} />
                  <Text style={[s.chipText, active && s.chipTextActive]}>{sec.title}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── FAQ sections as inset grouped lists ── */}
          {filteredSections.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="search-outline" size={36} color={SYS_FILL} />
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
              <View key={section.id}>
                <View style={s.faqSectionHeader}>
                  <View style={[s.sysRowIcon, { backgroundColor: SYS_TEAL, marginRight: 8 }]}>
                    <Ionicons name={section.icon} size={14} color="#fff" />
                  </View>
                  <Text style={s.faqSectionTitle}>{section.title}</Text>
                  <View style={s.faqCountPill}>
                    <Text style={s.faqCountText}>{section.items.length}</Text>
                  </View>
                </View>
                <View style={s.sysGroup}>
                  {section.items.map((item, idx) => (
                    <FaqRow
                      key={item.q}
                      index={idx}
                      question={item.q}
                      answer={item.a}
                      expanded={openFaq === item.q}
                      onToggle={() => setOpenFaq(openFaq === item.q ? null : item.q)}
                      last={idx === section.items.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))
          )}

        </ScrollView>
      </SafeAreaView>
      <PatientBottomTabBar activeTab="settings" />
    </View>
  );
}

// ── Styles (iOS native system pattern, same as profile.tsx) ──────────────────
const s = StyleSheet.create({

  // Navigation bar
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
  navBack:     { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  navBackText: { fontSize: 17, color: SYS_TEAL },
  navTitle:    { fontSize: 17, fontWeight: '600', color: SYS_LABEL, textAlign: 'center', flex: 1 },
  navAction:   { minWidth: 60 },

  // Feedback success banner
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
  },
  feedbackBannerTitle: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  feedbackBannerSub:   { fontSize: 11, color: '#059669', marginTop: 1 },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SYS_WHITE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: SYS_LABEL,
    paddingVertical: 0,
  },

  // Inset grouped section header (same as profile.tsx)
  sysHeader: {
    fontSize: 13,
    fontWeight: '400',
    color: SYS_THIRD,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 24,
  },

  // Grouped section container (same as profile.tsx)
  sysGroup: {
    backgroundColor: SYS_WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    marginBottom: 0,
  },

  // Single row (same as profile.tsx)
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
    marginLeft: 16 + 28 + 12,
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
  sysRowLabel: { fontSize: 17, fontWeight: '400', color: SYS_LABEL, flex: 1 },
  sysRowValue: { fontSize: 17, color: SYS_THIRD, maxWidth: '45%' },

  // FAQ section header row (above each SysGroup)
  faqSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  faqSectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: SYS_THIRD,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  faqCountPill: {
    backgroundColor: SYS_FILL,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  faqCountText: { fontSize: 11, fontWeight: '700', color: SYS_THIRD },

  // FAQ number badge inside row icon slot
  faqNum: { fontSize: 9, fontWeight: '800', color: SYS_SECOND },

  // FAQ expanded answer text
  faqAnswer: {
    fontSize: 13,
    color: SYS_SECOND,
    lineHeight: 19,
    marginTop: 8,
  },

  // Category chips
  chipsRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    paddingTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SYS_WHITE,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C6C6C8',
  },
  chipActive:     { backgroundColor: SYS_TEAL, borderColor: SYS_TEAL },
  chipText:       { fontSize: 12, fontWeight: '600', color: SYS_TEAL },
  chipTextActive: { color: SYS_WHITE },

  // Empty state
  emptyState:  { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 40 },
  emptyTitle:  { fontSize: 15, fontWeight: '600', color: SYS_LABEL, marginTop: 8 },
  emptySub:    { fontSize: 13, color: SYS_THIRD, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  emptyBtn:    { marginTop: 16, backgroundColor: SYS_TEAL, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 24 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: SYS_WHITE },
});
