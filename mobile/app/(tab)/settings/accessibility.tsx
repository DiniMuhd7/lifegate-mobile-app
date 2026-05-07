import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { useAccessibilityStore } from 'stores/accessibility-store';

type PreferenceRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export default function AccessibilityScreen() {
  const insets = useSafeAreaInsets();
  const {
    initialized,
    initialize,
    largerText,
    highContrast,
    reduceMotion,
    setLargerText,
    setHighContrast,
    setReduceMotion,
    resetPreferences,
  } = useAccessibilityStore();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#F2F8F8]" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-3 pb-4">
        <Pressable onPress={() => router.back()} className="p-2 rounded-full bg-white">
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text className="text-xl font-black text-gray-900">Accessibility</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="mb-4 rounded-3xl bg-white border border-[#DCEFEF] p-5 overflow-hidden">
          <View className="absolute -top-8 -right-4 h-24 w-24 rounded-full bg-[#E7F8F7]" />
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0EA5A4] mb-1">Display & Interaction</Text>
          <Text className="text-2xl font-black text-gray-900 mb-2">Make the app easier to read and use</Text>
          <Text className="text-sm text-gray-600 leading-5">
            Adjust visual comfort settings for readability, contrast, and motion sensitivity. These controls are local to this device.
          </Text>
        </View>

        <View className="mb-3 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-2">
          <PreferenceRow
            icon="text-outline"
            title="Larger text"
            subtitle="Increase the size of key reading surfaces across the app."
            value={largerText}
            onValueChange={(value) => {
              setLargerText(value).catch(() => {});
            }}
          />
          <PreferenceRow
            icon="contrast-outline"
            title="High contrast"
            subtitle="Strengthen color contrast for buttons, labels, and status chips."
            value={highContrast}
            onValueChange={(value) => {
              setHighContrast(value).catch(() => {});
            }}
          />
          <PreferenceRow
            icon="walk-outline"
            title="Reduce motion"
            subtitle="Limit animations and motion-heavy transitions where possible."
            value={reduceMotion}
            onValueChange={(value) => {
              setReduceMotion(value).catch(() => {});
            }}
          />
        </View>

        <View className="mb-3 rounded-2xl bg-[#E9F8F7] border border-[#BEECE9] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#0B8E8D] mb-2">Note</Text>
          <Text className="text-sm text-gray-700 leading-6">
            These preferences are saved on this device for this app. Full system-wide accessibility sync can be added later.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            resetPreferences().catch(() => {});
          }}
          className="mb-3 h-12 rounded-2xl bg-white border border-[#DCEFEF] items-center justify-center active:opacity-80"
        >
          <Text className="text-sm font-bold text-[#0EA5A4]">Reset accessibility preferences</Text>
        </Pressable>

        <View className="mb-2 rounded-2xl bg-white border border-[#E4EEEE] px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Recommended</Text>
          <TipRow icon="notifications-outline" text="Keep critical health alerts enabled so urgent care guidance is not missed." />
          <TipRow icon="phone-portrait-outline" text="Use your device accessibility settings for larger fonts and screen zoom outside the app." />
          <TipRow icon="shield-checkmark-outline" text="Review consent, privacy, and account settings regularly if you share your device." />
        </View>

        {!initialized ? (
          <View className="mb-2 px-2">
            <Text className="text-xs text-gray-500 text-center">Loading saved accessibility preferences...</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PreferenceRow({ icon, title, subtitle, value, onValueChange }: PreferenceRowProps) {
  return (
    <View className="flex-row items-start py-4 border-b border-[#F1F5F9] last:border-b-0">
      <View className="h-10 w-10 rounded-full bg-[#E9F8F7] items-center justify-center mr-3 mt-0.5">
        <Ionicons name={icon} size={18} color="#0EA5A4" />
      </View>
      <View className="flex-1 pr-3">
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
        <Text className="text-sm text-gray-600 mt-1 leading-5">{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor="#ffffff"
        trackColor={{ false: '#D1D5DB', true: '#14B8A6' }}
      />
    </View>
  );
}

function TipRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-start py-2.5">
      <View className="h-8 w-8 rounded-full bg-[#F4FAFA] items-center justify-center mr-3 mt-0.5">
        <Ionicons name={icon} size={16} color="#0EA5A4" />
      </View>
      <Text className="flex-1 text-sm text-gray-700 leading-5">{text}</Text>
    </View>
  );
}