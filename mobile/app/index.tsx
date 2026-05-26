// File: app/index.tsx  (Splash Screen - shows for 3 seconds then navigates)
import { useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import { useAuthStore } from 'stores/auth-store';
import { useSessionStore } from 'stores/session-store';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LogoImage from 'assets/lifegate-logo.png';
import { INTRO_SEEN_KEY } from './intro';



export default function SplashScreen() {
  // useRootNavigationState().key is undefined until the root <Stack> has mounted.
  // We must not call router.replace() before it is defined.
  const rootNavKey = useRootNavigationState()?.key;

  useEffect(() => {
    if (!rootNavKey) return; // Root layout not yet mounted — wait.

    const initializeApp = async () => {
      try {
        // _layout.tsx already triggered restoreSession(); wait for it to settle.
        const store = useAuthStore.getState();
        if (store.sessionLoading) {
          await new Promise<void>((resolve) => {
            const unsub = useAuthStore.subscribe((s) => {
              if (!s.sessionLoading) {
                unsub();
                resolve();
              }
            });
          });
        }

        // Check if user is authenticated after restoring session
        const { isAuthenticated } = useAuthStore.getState();

        // For patient users, check the server for an abandoned session so that
        // the ResumeSessionModal can be shown after navigation.
        if (isAuthenticated) {
          const { user } = useAuthStore.getState();
          if (user?.role === 'user') {
            // Non-blocking — failure does not block navigation.
            useSessionStore.getState().fetchIncomplete().catch(() => {});
          }
        }

        // Check if first-launch intro has been seen
        const introSeen = await AsyncStorage.getItem(INTRO_SEEN_KEY);

        // Navigate based on auth state
        setTimeout(() => {
          // First-ever launch: show onboarding regardless of auth state
          if (!introSeen) {
            router.replace('/intro');
            return;
          }

          if (isAuthenticated) {
            const { user } = useAuthStore.getState();
            if (user?.role === 'admin') {
              router.replace('/(admin-tab)/dashboard');
            } else if (user?.role === 'professional') {
              if (user.mdcn_verified) {
                router.replace('/(prof-tab)/review');
              } else {
                router.replace('/physician-pending');
              }
            } else {
              router.replace('/(tab)/health');
            }
          } else {
            router.replace('/welcome');
          }
        }, 1500); // Show splash for 1.5 seconds
      } catch (error) {
        console.error('Error initializing app:', error);
        setTimeout(() => router.replace('/welcome'), 1500);
      }
    };

    initializeApp();
  }, [rootNavKey]);

  return (
    <LinearGradient
      colors={['#0AADA2', '#043B3C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <Image source={LogoImage} style={{ width: 96, height: 96 }} resizeMode="contain" />
      <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 20, letterSpacing: -0.5 }}>
        LifeGate
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 6 }}>
        By DSHub
      </Text>

      {/* Bottom tagline */}
      <Text style={{
        position: 'absolute',
        bottom: 40,
        color: 'rgba(255,255,255,0.45)',
        fontSize: 12,
        letterSpacing: 0.3,
      }}>
        Powered by DSHub
      </Text>
    </LinearGradient>
  );
}