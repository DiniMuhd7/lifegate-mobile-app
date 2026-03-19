import { View, Text, BackHandler } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  useEffect(() => {
    const backAction = () => {
      router.replace('/'); // send user to root
      return true; // prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, []);
  return (
    <SafeAreaView className="flex-1">
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="mb-2 text-xl font-semibold text-gray-800">Chat</Text>
        <Text className="px-6 text-center text-gray-500">Coming soon...</Text>
      </View>
    </SafeAreaView>
  );
}
