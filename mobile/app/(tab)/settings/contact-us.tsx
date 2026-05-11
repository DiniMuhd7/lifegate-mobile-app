import { View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { openExternalUrl } from '@/utils/external-link';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const supportPhones = ['+2349013453490', '+2349110192583'];

  const handlePhonePress = (phone: string) => {
    void openExternalUrl(`tel:${phone}`);
  };

  const handleEmailPress = () => {
    void openExternalUrl('mailto:contact@dshub.com.ng');
  };

  const handleWebsitePress = () => {
    void openExternalUrl('https://lifegate.dshub.com.ng');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tab)/settings')} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-xl font-black text-gray-900">About</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="mb-4 rounded-3xl bg-white border border-[#DCEFEF] p-5 overflow-hidden">
          <View className="absolute -top-8 -right-4 h-24 w-24 rounded-full bg-[#E7F8F7]" />
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4] mb-1">LifeGate</Text>
          <Text className="text-2xl font-black text-gray-900 mb-2">AI-assisted clinical care, built for trust</Text>
          <Text className="text-sm text-gray-600 leading-5">
            LifeGate combines intelligent health triage with mandatory physician oversight for high-stakes clinical decisions.
          </Text>
        </View>

        <View className="mb-3 rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0B8E8D] mb-2">Our Mission</Text>
          <Text className="text-sm text-gray-700 leading-6">
            Deliver safe, accessible, and clinician-supervised digital healthcare for everyday users and high-risk patients alike.
          </Text>
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">What LifeGate Does</Text>
          <FeatureRow icon="chatbubble-ellipses-outline" title="AI Health Triage" subtitle="Structured symptom analysis with context-aware guidance." />
          <FeatureRow icon="medkit-outline" title="Physician Validation" subtitle="Clinical cases are escalated and reviewed by licensed professionals." />
          <FeatureRow icon="pulse-outline" title="Longitudinal Health Context" subtitle="Health profile and history improve recommendation quality over time." />
          <FeatureRow icon="shield-checkmark-outline" title="Safety First" subtitle="Risk signals, urgency grading, and referral pathways are built in." />
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Clinical Safeguards</Text>
          <Text className="text-sm text-gray-700 leading-6">
            LifeGate is designed to support, not replace, clinical judgement. Cases requiring deeper assessment are routed for physician review, and users are advised to seek urgent in-person care when red-flag symptoms are detected.
          </Text>
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Why People Choose LifeGate</Text>
          <FeatureRow icon="time-outline" title="Faster First Response" subtitle="Get timely guidance before your care window narrows." />
          <FeatureRow icon="people-outline" title="Human Oversight" subtitle="Physicians step in for cases that require deeper clinical review." />
          <FeatureRow icon="lock-closed-outline" title="Privacy Conscious" subtitle="Sensitive health context is handled securely across your care journey." />
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Product Information</Text>
          <InfoRow label="App Version" value={appVersion} />
          <InfoRow label="Organization" value="LifeGate by DSHub" />
          <InfoRow label="Platform" value="Mobile + AI + Physician Collaboration" />
          <InfoLinkRow label="Website" value="lifegate.dshub.com.ng" onPress={handleWebsitePress} />
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Contact & Support</Text>

          <Pressable
            onPress={handleEmailPress}
            className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80 mb-3"
          >
            <Ionicons name="mail-outline" size={20} color="#14A8A8" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">contact@dshub.com.ng</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>

          <Pressable
            onPress={() => handlePhonePress(supportPhones[0])}
            className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80 mb-3"
          >
            <Ionicons name="call-outline" size={20} color="#14A8A8" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">+2349013453490</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>

          <Pressable
            onPress={() => handlePhonePress(supportPhones[1])}
            className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80 mb-3"
          >
            <Ionicons name="call-outline" size={20} color="#14A8A8" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">+2349110192583</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>

          <Pressable
            onPress={handleWebsitePress}
            className="flex-row items-center rounded-xl bg-[#F4FAFA] border border-[#DFEFEF] px-3 py-3 active:opacity-80 mb-3"
          >
            <Ionicons name="globe-outline" size={20} color="#14A8A8" />
            <Text className="ml-3 text-base text-gray-900 font-medium flex-1">lifegate.dshub.com.ng</Text>
            <Ionicons name="arrow-forward" size={16} color="#14A8A8" />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tab)/settings/item2')}
            className="h-11 rounded-xl bg-[#0EA5A4] items-center justify-center active:opacity-80"
          >
            <Text className="text-sm font-bold text-white">Open Help Center</Text>
          </Pressable>
        </View>

        <View className="mb-2 px-2">
          <Text className="text-xs text-gray-500 text-center leading-5">
            LifeGate provides digital health support and triage guidance. It is not a substitute for emergency medical services.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureRow({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="flex-row items-start py-2.5">
      <View className="h-8 w-8 rounded-full bg-[#E9F8F7] items-center justify-center mr-3 mt-0.5">
        <Ionicons name={icon} size={16} color="#0EA5A4" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
        <Text className="text-sm text-gray-600 mt-0.5 leading-5">{subtitle}</Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-[#F1F5F9] last:border-b-0">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{value}</Text>
    </View>
  );
}

function InfoLinkRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-2.5 border-b border-[#F1F5F9] last:border-b-0 active:opacity-80"
    >
      <Text className="text-sm text-gray-500">{label}</Text>
      <View className="flex-row items-center">
        <Text className="text-sm font-semibold text-[#0EA5A4] mr-1">{value}</Text>
        <Ionicons name="open-outline" size={14} color="#0EA5A4" />
      </View>
    </Pressable>
  );
}