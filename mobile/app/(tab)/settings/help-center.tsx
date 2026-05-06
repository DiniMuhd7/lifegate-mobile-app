import { View, Text, Pressable, ScrollView, Alert, Linking, TextInput, StyleSheet } from 'react-native';
import { useMemo, useState } from 'react';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

type FaqEntry = {
  q: string;
  a: string;
};

type FaqSection = {
  title: string;
  items: FaqEntry[];
};

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Account & Access Issues',
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
    title: 'Subscription & Billing Complaints',
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
        q: 'Can I request a refund for a failed payment or duplicate debit?',
        a: 'Yes. Contact support with proof of payment, transaction reference, and timestamp. Refund and reversal eligibility depends on payment status verification and platform policy.',
      },
    ],
  },
  {
    title: 'Tests, Modes & Clinical Output',
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
        a: 'EDIS is LifeGate\'s clinical interpretation and safety layer. It structures user input, applies guardrails, and prioritizes risk before recommendations are shown.',
      },
      {
        q: 'How do I improve diagnosis quality?',
        a: 'Keep your health profile updated, provide clear symptom timeline and severity, include medication/allergy history, and complete requested tests with accurate responses.',
      },
    ],
  },
  {
    title: 'Technical & App Performance Issues',
    items: [
      {
        q: 'The app is slow, freezing, or showing a blank screen.',
        a: 'Close and reopen the app, then check your network. If issue remains, restart device and update to latest app version. If still unresolved, send feedback with device model, OS version, and exact screen where it happens.',
      },
      {
        q: 'Why am I not receiving notifications?',
        a: 'Open Notifications in Settings and enable push access. If disabled at device level, tap Open Device Settings and grant permission. Also check battery optimization rules that may block background alerts.',
      },
      {
        q: 'Some pages or actions fail to load.',
        a: 'This is often due to unstable connection or temporary service downtime. Retry after reconnecting, and if repeated, report the action, time, and screenshot through Send Feedback.',
      },
      {
        q: 'My submitted feedback did not get a response.',
        a: 'After submission, keep your reference ID. Support responses may take a short time depending on queue volume. If delayed, contact support directly and include the reference ID for faster tracking.',
      },
    ],
  },
  {
    title: 'Safety, Emergencies & Care Boundaries',
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
    items: [
      {
        q: 'What are Lifecoins?',
        a: 'Lifecoins are LifeGate\'s in-app reward currency. You earn them by completing health activities such as watching educational videos, completing check-ins, and engaging with the platform. They are stored in your Lifecoins wallet.',
      },
      {
        q: 'How do I earn Lifecoins?',
        a: 'You earn Lifecoins by watching health videos on the Explore screen until the required watch threshold is met, completing daily check-ins, and other in-app health activities. Each video shows the exact coin reward before you start.',
      },
      {
        q: 'Is there a daily limit on earning Lifecoins from videos?',
        a: `Yes. You can earn Lifecoins from up to ${5} videos per day. The daily count resets at midnight. You can still watch more videos, but coins are only awarded for the first ${5} completions each day.`,
      },
      {
        q: 'What is the Lifecoins wallet?',
        a: 'The Lifecoins wallet tracks your total balance, recent transactions, and earning history. Access it from the Health screen or your profile. Pending approvals are shown separately until confirmed.',
      },
      {
        q: 'How do I redeem or use my Lifecoins?',
        a: 'Redemption options are shown in the wallet screen. Eligibility criteria apply. If you believe a redemption failed or was processed incorrectly, contact support with your wallet transaction reference.',
      },
      {
        q: 'My Lifecoins balance did not update after completing a video.',
        a: 'Allow a short moment for the wallet to sync. Pull to refresh on the wallet screen. If the balance is still incorrect after a few minutes, report it from Send Feedback and include the video title, date, and time.',
      },
    ],
  },
  {
    title: 'Physician Assignment & Consultations',
    items: [
      {
        q: 'How does physician assignment work?',
        a: 'When your case requires clinical review, LifeGate assigns an available licensed physician from the queue. Assignment happens automatically based on case urgency, specialty, and physician availability.',
      },
      {
        q: 'When will a physician respond to my case?',
        a: 'Response times depend on physician availability and your case urgency level. Urgent cases are prioritised. You will receive an in-app notification when a physician reviews or responds to your case.',
      },
      {
        q: 'Can I message my assigned physician?',
        a: 'Yes. Once a physician is assigned to your active case, a chat icon appears in the Diagnosis Report screen. Tap it to open the Instant Message panel and communicate directly with your physician.',
      },
      {
        q: 'What is a follow-up consultation?',
        a: 'After an initial consultation, you may request or receive a follow-up to review progress, update your condition, or address new symptoms. Follow-ups are linked to the original case record.',
      },
      {
        q: 'My case shows Active but no physician has responded.',
        a: 'Cases in the queue may take time depending on volume. If your case has been Active without any update for an unexpectedly long time, contact support with your case ID for a status check.',
      },
      {
        q: 'Can I request a different physician?',
        a: 'Physician re-assignment is not self-service. If you have a concern about the assigned physician or the consultation outcome, raise it through Send Feedback or Contact Support with your case details.',
      },
    ],
  },
  {
    title: 'Privacy & Data Management',
    items: [
      {
        q: 'What health data does LifeGate store?',
        a: 'LifeGate stores profile information, symptom reports, health metrics, test results, and consultation history needed to deliver clinical services safely. Data is used only for the purposes you engage with in the app.',
      },
      {
        q: 'How is my data protected?',
        a: 'LifeGate uses encrypted transmission and controlled access policies. Sensitive health records are only accessible to licensed personnel involved in your care pathway. Never share your login credentials.',
      },
      {
        q: 'Can I delete my account and data?',
        a: 'Yes. Go to Settings and look for Account Deletion or contact support to initiate a deletion request. Deletion removes your personal data subject to applicable legal retention requirements.',
      },
      {
        q: 'Can I export my health records?',
        a: 'Data export requests can be submitted through the support channel. Include your patient ID and the type of records you need. The support team will guide you through the process.',
      },
      {
        q: 'Who can see my clinical information?',
        a: 'Your clinical data is visible to assigned physicians in the context of active cases, and to authorised admin personnel for safety and compliance purposes. LifeGate does not sell personal health data.',
      },
    ],
  },

const HelpItem = ({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="flex-row items-center px-4 py-4 rounded-xl bg-white border border-[#E4EEEE] mb-3 active:opacity-80"
  >
    <View className="w-9 h-9 rounded-full bg-[#E9F8F7] items-center justify-center">
      {icon}
    </View>

    <View className="ml-3 flex-1">
      <Text className="text-[15px] text-gray-800 font-semibold">{title}</Text>
      {subtitle && (
        <Text className="text-[12px] text-gray-500 mt-1">{subtitle}</Text>
      )}
    </View>
    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
  </Pressable>
);

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
      className="rounded-xl bg-white border border-[#E4EEEE] px-4 py-4 mb-3 active:opacity-80"
    >
      <View className="flex-row items-center">
        <Text className="flex-1 text-sm font-semibold text-gray-900 pr-3">{question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </View>
      {expanded ? <Text className="text-sm text-gray-600 mt-3 leading-5">{answer}</Text> : null}
    </Pressable>
  );
}

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

  const openFirstSupportedUrl = async (urls: string[]) => {
    for (const url of urls) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
          return true;
        }
      } catch {
        // Try next URL candidate.
      }
    }
    return false;
  };

  const handleOpenWebsite = async () => {
    const ok = await openFirstSupportedUrl([appWebsite]);
    if (!ok) Alert.alert('Unavailable', 'Unable to open website right now.');
  };

  const handleRateAndroid = async () => {
    const opened = await openFirstSupportedUrl([
      `market://details?id=${androidPackage}`,
      `https://play.google.com/store/apps/details?id=${androidPackage}`,
    ]);
    if (!opened) Alert.alert('Unavailable', 'Unable to open Play Store right now.');
  };

  const handleRateIOS = async () => {
    const opened = await openFirstSupportedUrl(
      iosAppId
        ? [
            `itms-apps://itunes.apple.com/app/id${iosAppId}?action=write-review`,
            `https://apps.apple.com/app/id${iosAppId}?action=write-review`,
          ]
        : [
            'itms-apps://apps.apple.com/ng/search?term=LifeGate%20DSHub',
            'https://apps.apple.com/ng/search?term=LifeGate%20DSHub',
          ]
    );
    if (!opened) Alert.alert('Unavailable', 'Unable to open App Store right now.');
  };

  const handleCallSupport = async () => {
    const opened = await openFirstSupportedUrl(['tel:+2349013453490', 'tel:+2349110192583']);
    if (!opened) Alert.alert('Unavailable', 'Unable to open dialer right now.');
  };

  const handleEmailSupport = async () => {
    const opened = await openFirstSupportedUrl(['mailto:contact@dshub.com.ng']);
    if (!opened) Alert.alert('Unavailable', 'Unable to open email app right now.');
  };

  const normalizedQuery = faqQuery.trim().toLowerCase();
  const filteredFaqSections = useMemo(() => {
    if (!normalizedQuery) return FAQ_SECTIONS;

    return FAQ_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.q.toLowerCase().includes(normalizedQuery) ||
          item.a.toLowerCase().includes(normalizedQuery) ||
          section.title.toLowerCase().includes(normalizedQuery)
      ),
    })).filter((section) => section.items.length > 0);
  }, [normalizedQuery]);

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={24} color="#1f2937" />
        </Pressable>

        <Text className="text-xl font-black text-gray-900">Help Center</Text>

        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 26 }}>
        {feedbackSent ? (
          <View className="rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] px-4 py-3 mb-4">
            <View className="flex-row items-start">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-semibold text-[#065F46]">Feedback sent successfully</Text>
                <Text className="text-sm text-[#065F46] mt-1">
                  {params.referenceId
                    ? `Reference ID: ${params.referenceId}`
                    : 'Our support team will review your message shortly.'}
                </Text>
              </View>
              <Pressable onPress={() => setShowFeedbackSuccess(false)} className="p-1">
                <Ionicons name="close" size={16} color="#065F46" />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View className="rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4 mb-4">
          <Text className="text-sm text-gray-700 leading-5">
            Find quick answers, report issues, and access practical app support.
          </Text>
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Support Actions</Text>
        <HelpItem
          title="Send Feedback"
          onPress={() => router.push('/(tab)/settings/(extra)/sendFeedback')}
          subtitle="Report bugs or suggest improvements"
          icon={<Feather name="message-circle" size={18} color="#38887D" />}
        />

        <HelpItem
          onPress={() => router.push('/(tab)/settings/contact-us')}
          subtitle="Call or email our support team"
          title="Contact Support"
          icon={<Feather name="phone-call" size={18} color="#38887D" />}
        />

        <View className="rounded-2xl bg-[#FFF7ED] border border-[#FED7AA] px-4 py-4 mb-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#9A3412] mb-2">Need Urgent Help?</Text>
          <Text className="text-sm text-[#9A3412] leading-5 mb-3">
            For urgent support issues, call directly or send an email and include your patient ID.
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => void handleCallSupport()}
              className="flex-1 h-10 rounded-xl bg-[#EA580C] items-center justify-center active:opacity-80"
            >
              <Text className="text-sm font-bold text-white">Call Support</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleEmailSupport()}
              className="flex-1 h-10 rounded-xl bg-white border border-[#FDBA74] items-center justify-center active:opacity-80"
            >
              <Text className="text-sm font-bold text-[#C2410C]">Email Support</Text>
            </Pressable>
          </View>
        </View>

        <View className="rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4 mb-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">App Info</Text>
          <InfoTextRow label="App" value={appName} />
          <InfoTextRow label="Version" value={appVersion} />
          <InfoTextRow label="Android Package" value={androidPackage} />
          <InfoTextRow label="iOS Bundle ID" value={iosBundleId} />
          <Pressable onPress={() => void handleOpenWebsite()} className="mt-3 py-2 active:opacity-80">
            <Text className="text-sm font-semibold text-[#0EA5A4]">Website: lifegate.dshub.com.ng</Text>
          </Pressable>
        </View>

        <View className="rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4 mb-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Rate Us on the App Stores</Text>
          <Text className="text-xs text-gray-400 mb-4 leading-4">Enjoying LifeGate? Leave us a review — it helps others find trusted health support.</Text>
          <View className="flex-row gap-3">
            {/* Google Play badge */}
            <Pressable
              onPress={() => void handleRateAndroid()}
              style={styles.storeBadge}
              className="active:opacity-80"
            >
              <View style={styles.storeBadgeLeft}>
                <Ionicons name="logo-google-playstore" size={28} color="#fff" />
              </View>
              <View style={styles.storeBadgeText}>
                <Text style={styles.storeBadgeSuper}>GET IT ON</Text>
                <Text style={styles.storeBadgeName}>Google Play</Text>
              </View>
            </Pressable>

            {/* App Store badge */}
            <Pressable
              onPress={() => void handleRateIOS()}
              style={[styles.storeBadge, styles.storeBadgeApple]}
              className="active:opacity-80"
            >
              <View style={styles.storeBadgeLeft}>
                <Ionicons name="logo-apple" size={28} color="#fff" />
              </View>
              <View style={styles.storeBadgeText}>
                <Text style={styles.storeBadgeSuper}>DOWNLOAD ON THE</Text>
                <Text style={styles.storeBadgeName}>App Store</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 mt-2">FAQ</Text>
        <View className="rounded-xl bg-white border border-[#E4EEEE] px-3 py-2 mb-3 flex-row items-center">
          <Ionicons name="search-outline" size={16} color="#6B7280" />
          <TextInput
            value={faqQuery}
            onChangeText={setFaqQuery}
            placeholder="Search help topics"
            placeholderTextColor="#9CA3AF"
            className="ml-2 flex-1 text-sm text-gray-900"
          />
          {faqQuery ? (
            <Pressable onPress={() => setFaqQuery('')} className="p-1">
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>

        <Text className="text-xs text-gray-500 mb-3">Issues are grouped by category to help you find complaints faster.</Text>

        {filteredFaqSections.length === 0 ? (
          <View className="rounded-xl bg-white border border-[#E4EEEE] px-4 py-4 mb-3">
            <Text className="text-sm font-semibold text-gray-800 mb-1">No matching FAQ found</Text>
            <Text className="text-sm text-gray-600">Try a different keyword or send feedback to support.</Text>
          </View>
        ) : null}

        {filteredFaqSections.map((section) => (
          <View key={section.title} className="mb-1">
            <View className="flex-row items-center justify-between px-1 mb-2 mt-1">
              <Text className="text-xs font-bold uppercase tracking-wide text-[#0B8E8D]">{section.title}</Text>
              <View className="px-2 py-0.5 rounded-full bg-[#E9F8F7]">
                <Text className="text-[10px] font-semibold text-[#0B8E8D]">{section.items.length} items</Text>
              </View>
            </View>
            {section.items.map((item) => (
              <FaqItem
                key={item.q}
                question={item.q}
                answer={item.a}
                expanded={openFaq === item.q}
                onToggle={() => setOpenFaq(openFaq === item.q ? null : item.q)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoTextRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2 border-b border-[#F1F5F9] last:border-b-0">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{value}</Text>
    </View>
  );
}

// ── App Store badge styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  storeBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#01875F', // Google Play green
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  storeBadgeApple: {
    backgroundColor: '#111111', // Apple black
  },
  storeBadgeLeft: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeBadgeText: {
    flex: 1,
  },
  storeBadgeSuper: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  storeBadgeName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 1,
  },
});