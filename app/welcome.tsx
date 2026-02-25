import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton } from 'components/Button';
import Logo from 'assets/logo.svg';

export default function WelcomeScreen() {
  return (
    <LinearGradient
      colors={['#FFFFFF', '#0AADA2']}
      start={{ x: 0.5, y: 0.5 }}
      end={{ x: 0.5, y: 0 }}
      style={{ flex: 1 }}
    >
      <View className="flex-1 justify-around items-center ">
        <View className="items-center mt-24">
          <Logo width={72} height={72} />
        </View>
        <View className="px-10 mb-4">
          <Text className="text-5xl font-bold text-[#0F8F8B] text-center">
            Empowering
          </Text>
            <Text className="text-5xl font-bold text-[#0F8F8B] text-center">
            Clinicians,
          </Text>
          <Text className="text-5xl font-bold text-[#0F8F8B] text-center mt-2">
            Saving Lives.
          </Text>
        </View>
        <View className="px-8 mb-24 w-full">
          <PrimaryButton
            title="Start Health Check"
            onPress={() => {router.push('/(auth)/login')}}
          />

          <View className="h-5" />

          <PrimaryButton
            title="For Physicians"
            type="secondary"
            onPress={() => {}}
          />
        </View>

      </View>
    </LinearGradient>
  );
}
