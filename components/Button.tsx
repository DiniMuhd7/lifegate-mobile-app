import React, { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

type ButtonType = "primary" | "secondary";

interface PrimaryButtonProps {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  type?: ButtonType;
  width?: number;
  disabled?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading,
  type = "primary",
  disabled,
}) => {
  const [dots, setDots] = useState(".");

  // Animate loading dots
  useEffect(() => {
    if (!loading) {
      setDots(".");
      return;
    }

    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === ".") return "..";
        if (prev === "..") return "...";
        return ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, [loading]);

  const isPrimary = type === "primary";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`p-6 rounded-2xl items-center justify-center active:opacity-80 ${
        isDisabled ? "opacity-60" : ""
      } ${
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
        {loading ? `Loading${dots}` : title}
      </Text>
    </Pressable>
  );
};