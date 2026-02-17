// File: app/(auth)/login.tsx
import { Text,Pressable } from 'react-native';
export const PrimaryButton = ({ title, onPress, loading }: { title: string; onPress?: () => void; loading?: boolean }) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className="bg-[#0EA5A4] p-6 rounded-2xl items-center justify-center active:opacity-80"
    >
      <Text className="text-white font-semibold text-base">
        {loading ? 'Please wait…' : `${title}  →`}
      </Text>
    </Pressable>
  );
};