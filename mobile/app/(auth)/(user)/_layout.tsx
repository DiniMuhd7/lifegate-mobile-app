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
      <View className="h-56 px-6 pt-12 ">
        <Pressable onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>

        <View className="mt-4 items-center">
          <Text className="text-2xl font-bold text-white">{titleMap[currentStep]}</Text>
        </View>

        <WizardProgress currentStep={currentStep} totalSteps={totalSteps} />
      </View>

      {/* STACK RENDERING */}
      <View className="flex-1 rounded-t-[40px] bg-[#F7FEFD] pt-6 px-6">
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            gestureEnabled: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </View>
    </LinearGradient>
    </SafeAreaView>
  );
}
