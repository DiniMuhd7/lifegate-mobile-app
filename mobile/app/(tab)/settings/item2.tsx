import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

// ── FAQ data ─────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
async function openFirstSupportedUrl(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) { await Linking.openURL(url); return true; }
    } catch { /* try next */ }
  }
  return false;
}

// ── Sub-components (About screen pattern) ─────────────────────────────────────

function FaqItem({
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
      className={`flex-row items-start py-3 ${!last ? 'border-b border-[#F1F5F9]' : ''} active:opacity-70`}
    >
      <View className="h-8 w-8 rounded-full bg-[#E9F8F7] items-center justify-center mr-3 mt-0.5 flex-shrink-0">
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#0B8E8D' }}>
          {String(index + 1).padStart(2, '0')}
        </Text>
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-semibold leading-5 ${expanded ? 'text-[#0EA5A4]' : 'text-gray-900'}`}>
          {question}
        </Text>
        {expanded && (
          <Text className="text-sm text-gray-600 leading-5 mt-2">{answer}</Text>
        )}
      </View>
      <Ionicons
        name={expanded ? 'remove-circle-outline' : 'add-circle-outline'}
        size={18}
        color={expanded ? '#0EA5A4' : '#CBD5DB'}
        style={{ marginLeft: 8, marginTop: 2 }}
      />
    </Pressable>
  );
}

function ContactRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80 mb-3"
    >
      <Ionicons name={icon} size={20} color="#14A8A8" />
      <Text className="ml-3 text-base text-gray-900 font-medium flex-1">{label}</Text>
      <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-[#F1F5F9]">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{value}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function Item2Screen() {
  const insets = useSafeAreaInsets();
  const [openFaq, setOpenFaq]               = useState<string | null>(null);
  const [faqQuery, setFaqQuery]             = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const params = useLocalSearchParams<{ feedback?: string; referenceId?: string }>();
  const [showFeedbackBanner, setShowFeedbackBanner] = useState(true);
  const feedbackSent = params.feedback === 'sent' && showFeedbackBanner;

  const appVersion     = Constants.expoConfig?.version ?? '1.0.0';
  const androidPackage = Constants.expoConfig?.android?.package ?? 'com.lazyapp.lifegatemobile';
  const iosAppId       = String(Constants.expoConfig?.extra?.iosAppId ?? '').trim();

  const handleCallSupport  = () => openFirstSupportedUrl(['tel:+2349013453490', 'tel:+2349110192583']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open dialer.'); });
  const handleEmailSupport = () => openFirstSupportedUrl(['mailto:contact@dshub.com.ng']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open email.'); });
  const handleOpenWebsite  = () => openFirstSupportedUrl(['https://lifegate.dshub.com.ng']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open website.'); });
  const handleRateAndroid  = () => openFirstSupportedUrl([`market://details?id=${androidPackage}`, `https://play.google.com/store/apps/details?id=${androidPackage}`]).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open Play Store.'); });
  const handleRateIOS      = () => openFirstSupportedUrl(iosAppId ? [`itms-apps://itunes.apple.com/app/id${iosAppId}?action=write-review`, `https://apps.apple.com/app/id${iosAppId}?action=write-review`] : ['itms-apps://apps.apple.com/ng/search?term=LifeGate%20DSHub']).then((ok) => { if (!ok) Alert.alert('Unavailable', 'Unable to open App Store.'); });

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

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>

      {/* ── Header (About screen pattern) ── */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-xl font-black text-gray-900">Help Centre</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Hero card (About screen pattern) ── */}
        <View className="mb-4 rounded-3xl bg-white border border-[#DCEFEF] p-5 overflow-hidden">
          <View className="absolute -top-8 -right-4 h-24 w-24 rounded-full bg-[#E7F8F7]" />
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4] mb-1">LifeGate</Text>
          <Text className="text-2xl font-black text-gray-900 mb-2">Help Centre</Text>
          <Text className="text-sm text-gray-600 leading-5">
            Find answers to common questions, contact support, and learn how to get the most from LifeGate.
          </Text>
        </View>

        {/* ── Feedback success banner ── */}
        {feedbackSent && (
          <View className="mb-3 flex-row items-center rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] px-4 py-3">
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <View className="flex-1 ml-3">
              <Text className="text-sm font-bold text-[#065F46]">Feedback sent</Text>
              <Text className="text-xs text-[#059669] mt-0.5">
                {params.referenceId ? `Ref: ${params.referenceId}` : 'Our team will review your message shortly.'}
              </Text>
            </View>
            <Pressable onPress={() => setShowFeedbackBanner(false)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#059669" />
            </Pressable>
          </View>
        )}

        {/* ── Search ── */}
        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-3 flex-row items-center">
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={faqQuery}
            onChangeText={(t) => { setFaqQuery(t); setActiveCategory(null); }}
            placeholder="Search help topics"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-sm text-gray-900 ml-2"
            style={{ paddingVertical: 2 }}
            returnKeyType="search"
            autoCorrect={false}
          />
          {faqQuery ? (
            <Pressable onPress={() => setFaqQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>

        {/* ── Get Support ── */}
        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Get Support</Text>
          <ContactRow icon="chatbubble-ellipses-outline" label="Send Feedback" onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')} />
          <ContactRow icon="headset-outline"             label="Contact Us"    onPress={() => router.push('/(tab)/settings/contact-us')} />
          <ContactRow icon="call-outline"                label="Call Support"  onPress={() => void handleCallSupport()} />
          <ContactRow icon="mail-outline"                label="Email Us — contact@dshub.com.ng" onPress={() => void handleEmailSupport()} />
        </View>

        {/* ── App Info ── */}
        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">App Info</Text>
          <InfoRow label="Version"  value={`v${appVersion}`} />
          <InfoRow label="Platform" value={androidPackage.split('.').pop() ?? 'mobile'} />
          <View className="flex-row items-center justify-between py-2.5">
            <Text className="text-sm text-gray-500">Website</Text>
            <Pressable onPress={() => void handleOpenWebsite()} className="flex-row items-center active:opacity-70">
              <Text className="text-sm font-semibold text-[#0EA5A4] mr-1">lifegate.dshub.com.ng</Text>
              <Ionicons name="open-outline" size={14} color="#0EA5A4" />
            </Pressable>
          </View>
        </View>

        {/* ── Rate the App ── */}
        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Rate the App</Text>
          <Pressable onPress={() => void handleRateAndroid()} className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80 mb-3">
            <Ionicons name="logo-google-playstore" size={20} color="#01875F" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">Google Play</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>
          <Pressable onPress={() => void handleRateIOS()} className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80">
            <Ionicons name="logo-apple" size={20} color="#000000" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">App Store</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>
        </View>

        {/* ── FAQ Category chips ── */}
        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 mt-1">
          Frequently Asked
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          <Pressable
            onPress={() => { setActiveCategory(null); setFaqQuery(''); }}
            className={`flex-row items-center rounded-full px-3 py-1.5 border ${!activeCategory ? 'bg-[#0EA5A4] border-[#0EA5A4]' : 'bg-white border-[#E4EEEE]'}`}
          >
            <Ionicons name="apps-outline" size={12} color={!activeCategory ? '#fff' : '#0EA5A4'} />
            <Text className={`text-xs font-semibold ml-1 ${!activeCategory ? 'text-white' : 'text-[#0EA5A4]'}`}>All</Text>
          </Pressable>
          {FAQ_SECTIONS.map((sec) => {
            const active = activeCategory === sec.id;
            return (
              <Pressable
                key={sec.id}
                onPress={() => { setActiveCategory(active ? null : sec.id); setFaqQuery(''); }}
                className={`flex-row items-center rounded-full px-3 py-1.5 border ${active ? 'bg-[#0EA5A4] border-[#0EA5A4]' : 'bg-white border-[#E4EEEE]'}`}
              >
                <Ionicons name={sec.icon} size={12} color={active ? '#fff' : '#0EA5A4'} />
                <Text className={`text-xs font-semibold ml-1 ${active ? 'text-white' : 'text-[#0EA5A4]'}`}>{sec.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── FAQ sections ── */}
        {filteredSections.length === 0 ? (
          <View className="rounded-2xl bg-white border border-[#E4EEEE] px-4 py-10 items-center mb-3">
            <Ionicons name="search-outline" size={36} color="#CBD5DB" />
            <Text className="text-base font-semibold text-gray-900 mt-3">No results</Text>
            <Text className="text-sm text-gray-500 text-center leading-5 mt-1 max-w-xs">
              Try a different keyword or send us your question directly.
            </Text>
            <Pressable
              onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
              className="mt-5 bg-[#0EA5A4] rounded-xl px-6 py-2.5 active:opacity-85"
            >
              <Text className="text-sm font-bold text-white">Send Feedback</Text>
            </Pressable>
          </View>
        ) : (
          filteredSections.map((section) => (
            <View key={section.id} className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
              {/* Section header (About FeatureRow label style) */}
              <View className="flex-row items-center mb-3">
                <View className="h-8 w-8 rounded-full bg-[#E9F8F7] items-center justify-center mr-3">
                  <Ionicons name={section.icon} size={16} color="#0EA5A4" />
                </View>
                <Text className="text-sm font-semibold text-gray-900 flex-1">{section.title}</Text>
                <View className="rounded-full bg-[#E9F8F7] px-2 py-0.5">
                  <Text className="text-xs font-bold text-[#0B8E8D]">{section.items.length}</Text>
                </View>
              </View>
              {/* FAQ accordion items */}
              {section.items.map((item, idx) => (
                <FaqItem
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
          ))
        )}

        {/* ── Disclaimer (About screen footer pattern) ── */}
        <View className="mb-2 px-2">
          <Text className="text-xs text-gray-500 text-center leading-5">
            LifeGate provides digital health support and triage guidance. It is not a substitute for emergency medical services or professional clinical advice.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
