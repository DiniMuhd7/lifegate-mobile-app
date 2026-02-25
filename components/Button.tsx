import React from "react";
import { Pressable, Text } from "react-native";

type ButtonType = "primary" | "secondary";

interface PrimaryButtonProps {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  type?: ButtonType; // new prop
  width?: number;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading,
  type = "primary", // default to primary
}) => {
  // Styles based on button type
  const isPrimary = type === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`p-6 rounded-2xl items-center justify-center active:opacity-80 ${
        isPrimary
          ? "bg-[#0EA5A4]"
          : "bg-transparent border border-[#0EA5A4]"
      }`}
    >
      <Text
        className={`font-semibold text-base ${
          isPrimary ? "text-white" : "text-[#0EA5A4]"
        }`}
      >
        {loading ? "Please wait…" : title}
      </Text>
    </Pressable>
  );
};
