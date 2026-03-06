// File: app/index.tsx  (Splash Screen - shows for 3 seconds then navigates)
import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { LinearGradient } from 'expo-linear-gradient';
import Logo from 'assets/logo.svg';



export default function SplashScreen() {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Restore session from async storage
        const { restoreSession } = useAuthStore.getState();
        await restoreSession();

        // Check if user is authenticated after restoring session
        const { isAuthenticated } = useAuthStore.getState();
        
        // Navigate based on auth state
        setTimeout(() => {
          if (isAuthenticated) {
            router.replace('/(tab)/chatScreen');
          } else {
            router.replace('/welcome');
          }
        }, 1500); // Show splash for 1.5 seconds
      } catch (error) {
        console.error('Error initializing app:', error);
        // router.replace('/(auth)/login');
        router.replace('/welcome');
      }
    };

    initializeApp();
  }, []);

  return ( 
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      className="flex-1"
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1 }}>
    <View className="flex-1 items-center justify-center">
      <View className='flex-1/2 flex-row justify-center'>
      <Logo width={128} height={128} /> 
      </View>
      <Text className="text-white text-6xl font-bold">LifeGate</Text>
      <Text className="text-white/80 mt-2">By DSHub</Text>
    </View>
    </LinearGradient>
  );
}