import { Stack, router, useSegments } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { WizardProgress } from "components/ProgressIndicator";
import { SafeAreaView } from "react-native-safe-area-context";

const stepMap: Record<string, number> = {
  "(user)": 1,
  profile: 2,
  review: 3,
};

const titleMap: Record<number, string> = {
  1: "Get Started Today",
  2: "Complete Profile Setup",
  3: "Review & Submit",
};

export default function RegisterLayout() {
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1];

  const currentStep = stepMap[lastSegment] ?? 1;
  const totalSteps = 3;

  const goBack = () => {
    if (currentStep === 1) {
      router.replace('/(auth)/register-choice');
    } else {
      router.back();
    }
  };

  return (

    <SafeAreaView className="flex-1">
      
    <LinearGradient
      colors={["#0AADA2", "#043B3C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 0.4 }}
      style={{ flex: 1 }}
    >
      {/* HEADER */}
      <View className="px-6 pt-4 pb-8">
        <View className="mb-5 flex-row items-center">
          <Pressable onPress={goBack} className="-ml-1 p-1">
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
          <Text className="flex-1 text-center text-xl font-bold text-white">
            {titleMap[currentStep]}
          </Text>
          <View className="w-8" />
        </View>
        <WizardProgress currentStep={currentStep} totalSteps={totalSteps} />
      </View>

      {/* STACK RENDERING */}
      <View className="flex-1 rounded-t-[36px] bg-[#F7FEFD] px-6 pt-6">
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            gestureEnabled: false,
            contentStyle: { backgroundColor: "#F7FEFD" },
          }}
        />
      </View>
    </LinearGradient>
    </SafeAreaView>
  );
}
