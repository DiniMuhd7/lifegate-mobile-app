import { Stack, router, useSegments } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { WizardProgress } from 'components/ProgressIndicator';
import { STEP_TITLES } from 'constants/constants';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * STEP MAPPING
 * Expo Router removes route groups from URL.
 * We detect the active screen using the LAST route segment.
 */
const stepMap: Record<string, number> = {
  '(health-professional)': 1, // index.tsx
  professional: 2,
  license: 3,
  review:4
};



export default function RegisterLayout() {
  // get current route segment
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1];

  // determine step
  const currentStep = stepMap[lastSegment] ?? 1;
  const totalSteps = Object.keys(stepMap).length;

  /**
   * Back button behavior
   * Step 1 should go to login instead of exiting the app
   */
  const goBack = () => {
    if (currentStep === 1) {
      router.replace('/(auth)/register-choice');
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.4 }}
      style={{ flex: 1 }}>
      {/* ================= HEADER ================= */}
      <View className="px-6 pt-4 pb-8">
        <View className="mb-5 flex-row items-center">
          {/* Back Button */}
          <Pressable onPress={goBack} className="-ml-1 p-1">
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
          {/* Centered Dynamic Title */}
          <Text className="flex-1 text-center text-xl font-bold text-white">
            {STEP_TITLES[currentStep]}
          </Text>
          {/* Spacer to balance back button */}
          <View className="w-8" />
        </View>
        {/* Progress Indicator */}
        <WizardProgress currentStep={currentStep} totalSteps={totalSteps} />
      </View>

      {/* ================= SCREEN CONTENT ================= */}
      <View className="flex-1 rounded-t-[36px] bg-[#F7FEFD] px-6 pt-6">
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            gestureEnabled: false, // prevents skipping steps
            contentStyle: { backgroundColor: '#F7FEFD' },
          }}
        />
      </View>
    </LinearGradient>
    </SafeAreaView>
  );
}
