import { View } from "react-native";
export const TypingIndicator = () => {
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <View className="flex-row gap-1">
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            className="h-2 w-2 rounded-full bg-teal-500"
            style={{ opacity: 0.4 + i * 0.2 }}
          />
        ))}
      </View>
    </View>
  );
};