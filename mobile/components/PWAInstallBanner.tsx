import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const BANNER_HEIGHT = 92;

export function PWAInstallBanner({ visible, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current;
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
    };

    const onAppInstalled = () => {
      deferredPromptRef.current = null;
      onDismiss();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [onDismiss]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -BANNER_HEIGHT,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  if (Platform.OS !== 'web') return null;

  async function handleInstall() {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      onDismiss();
      return;
    }

    await promptEvent.prompt();
    try {
      await promptEvent.userChoice;
    } finally {
      deferredPromptRef.current = null;
      onDismiss();
    }
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        transform: [{ translateY }],
      }}
    >
      <View
        style={{
          marginTop: insets.top + 8,
          marginHorizontal: 16,
          borderRadius: 18,
          padding: 16,
          backgroundColor: '#0f172a',
          borderWidth: 1,
          borderColor: '#1e293b',
          shadowColor: '#020617',
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: '#0AADA2',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="download-outline" size={18} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 4 }}>
              Install LifeGate
            </Text>
            <Text style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 17 }}>
              Add the app to your home screen for faster access and a more app-like experience.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <Pressable
                onPress={onDismiss}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: '#1e293b',
                }}
              >
                <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '700' }}>Not now</Text>
              </Pressable>
              <Pressable
                onPress={handleInstall}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: '#0AADA2',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>
                  Install
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}