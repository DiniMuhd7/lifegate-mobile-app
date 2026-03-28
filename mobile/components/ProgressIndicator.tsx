import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface WizardProgressProps {
  totalSteps: number;
  currentStep: number;
}

export const WizardProgress: React.FC<WizardProgressProps> = ({
  totalSteps,
  currentStep,
}) => {
  return (
    <View className="flex-row items-center justify-center mt-6">
      {Array.from({ length: totalSteps }).map((_, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;

        return (
          <View key={index} className="flex-row items-center">
            {/* Step Circle */}
            <View
              className={`h-8 w-8 items-center justify-center rounded-full border-2 border-white ${
                isCompleted || isActive ? "bg-white" : "bg-white/20"
              }`}
            >
              {isCompleted ? (
                <Ionicons name="checkmark" size={16} color="#0AADA2" />
              ) : (
                <Text
                  className={`text-sm font-bold ${
                    isActive ? "text-[#0AADA2]" : "text-white/70"
                  }`}
                >
                  {stepNumber}
                </Text>
              )}
            </View>

            {/* Connecting Line */}
            {index !== totalSteps - 1 && (
              <View
                className={`mx-2 h-[2px] w-8 ${
                  isCompleted ? "bg-white" : "bg-white/30"
                }`}
              />
            )}
          </View>
        );
      })}
    </View>
  );
};
