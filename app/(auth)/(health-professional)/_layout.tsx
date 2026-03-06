import { Stack, router, useSegments } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { WizardProgress } from 'components/progress-indicator';
import { STEP_TITLES } from 'constants/constants';

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
      router.replace('/(auth)/login');
    } else {
      router.back();
    }
  };

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.4 }}
      style={{ flex: 1 }}>
      {/* ================= HEADER ================= */}
      <View className="h-56 px-6 pt-12">
        {/* Back Button */}
        <Pressable onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>

        {/* Dynamic Title */}
        <View className="mt-4 items-center">
          <Text className="text-2xl font-bold text-white">{STEP_TITLES[currentStep]}</Text>
        </View>

        {/* Progress Indicator */}
        <WizardProgress currentStep={currentStep} 
        totalSteps={totalSteps} />
      </View>

      {/* ================= SCREEN CONTENT ================= */}
      <View className="flex-1 rounded-t-[40px] bg-[#F7FEFD] pt-12 px-6">
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            gestureEnabled: false, // prevents skipping steps
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </View>
    </LinearGradient>
  );
}
