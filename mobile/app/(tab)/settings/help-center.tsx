import { View, Text, Pressable, ScrollView } from 'react-native';
import { useState } from 'react';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const params = useLocalSearchParams<{ feedback?: string; referenceId?: string }>();
  const [showFeedbackSuccess, setShowFeedbackSuccess] = useState(true);
  const feedbackSent = params.feedback === 'sent' && showFeedbackSuccess;

  const faqs = [
    {
      q: 'How do credits work in LifeGate?',
      a: 'Each clinical diagnosis session consumes one credit. You can top up credits from the Subscription screen at any time.',
    },
    {
      q: 'How can I update my health details?',
      a: 'Go to Settings, then Manage Profile. Update your blood type, genotype, allergies, medications, and emergency contact, then save.',
    },
    {
      q: 'Why am I not receiving notifications?',
      a: 'Open the Notifications screen and enable push notifications. If disabled at the device level, tap Open Device Settings to grant permission.',
    },
    {
      q: 'How do I contact support quickly?',
      a: 'Use Contact Us to call or email support directly. You can also send feedback from this Help Center.',
    },
  ];

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

        <HelpItem
          title="App Info"
          subtitle="Version, release notes, and compliance"
          icon={<Feather name="info" size={18} color="#38887D" />}
        />

        <HelpItem
          title="Rate Us"
          subtitle="Tell us how we can improve your experience"
          icon={<Feather name="star" size={18} color="#38887D" />}
        />

        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 mt-2">FAQ</Text>
        {faqs.map((item, idx) => (
          <FaqItem
            key={item.q}
            question={item.q}
            answer={item.a}
            expanded={openFaq === idx}
            onToggle={() => setOpenFaq(openFaq === idx ? null : idx)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}