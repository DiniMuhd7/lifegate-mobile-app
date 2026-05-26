// File: app/_layout.tsx
import '../global.css' // Ensure global styles are applied to all screens
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { PWAInstallBanner } from '../components/PWAInstallBanner';
import { IncomingCallOverlay } from '../components/IncomingCallOverlay';
import { VoiceCallScreen } from '../components/VoiceCallScreen';
import { VideoCallScreen } from '../components/VideoCallScreen';
import { useAuthStore } from '../stores/auth-store';
import { useCallStore } from '../stores/call-store';
import { installWebAlertPolyfill } from '../utils/installWebAlertPolyfill';
import { initializeAdsWithConsent } from '../utils/adsConsent';
import wsService from '../services/websocket-service';
import type {
  CallRingingPayload,
  CallAnsweredPayload,
  CallRejectedPayload,
  CallEndedPayload,
  CallIceCandidatePayload,
} from '../types/call-types';

const INSTALL_BANNER_DISMISS_UNTIL_KEY = 'lifegate:pwa-install-banner-dismiss-until';
const INSTALL_BANNER_INSTALLED_KEY = 'lifegate:pwa-installed';
const INSTALL_BANNER_DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const standaloneMatch =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches;
  const launchedFromAndroidHost = typeof document !== 'undefined' &&
    document.referrer.startsWith('android-app://');
  return iosStandalone || standaloneMatch || launchedFromAndroidHost;
}

export default function RootLayout() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    document.title = 'LifeGate';

    const upsertMeta = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    };

    const upsertLink = (rel: string, href: string) => {
      let tag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!tag) {
        tag = document.createElement('link');
        tag.rel = rel;
        document.head.appendChild(tag);
      }
      tag.href = href;
    };

    upsertMeta('theme-color', '#0AADA2');
    upsertMeta('mobile-web-app-capable', 'yes');
    upsertMeta('apple-mobile-web-app-capable', 'yes');
    upsertMeta('apple-mobile-web-app-status-bar-style', 'default');
    upsertMeta('apple-mobile-web-app-title', 'LifeGate');
    upsertLink('manifest', '/manifest.json');
    upsertLink('icon', '/icon.png');
    upsertLink('apple-touch-icon', '/icon.png');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Best-effort registration; the app remains usable if this fails.
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let dismissUntilInMemory = 0;

    const markInstalled = () => {
      try {
        localStorage.setItem(INSTALL_BANNER_INSTALLED_KEY, '1');
      } catch {
        // Ignore storage failures (private mode / browser restrictions).
      }
    };

    const isDismissed = () => {
      if (dismissUntilInMemory > Date.now()) return true;
      try {
        const until = Number(localStorage.getItem(INSTALL_BANNER_DISMISS_UNTIL_KEY) ?? '0');
        if (until > Date.now()) {
          dismissUntilInMemory = until;
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const isInstalled = () => {
      if (isStandaloneMode()) return true;
      try {
        return localStorage.getItem(INSTALL_BANNER_INSTALLED_KEY) === '1';
      } catch {
        return false;
      }
    };

    if (isStandaloneMode()) {
      markInstalled();
      setShowInstallBanner(false);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isInstalled() || isDismissed()) {
        setShowInstallBanner(false);
        return;
      }
      setShowInstallBanner(true);
    };

    const onAppInstalled = () => {
      markInstalled();
      setShowInstallBanner(false);
    };

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      markInstalled();
      setShowInstallBanner(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    media.addEventListener('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      media.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  // Restore auth session on every cold start / web page refresh so that
  // the user is not lost when landing on any deep-linked route directly.
  useEffect(() => {
    installWebAlertPolyfill();
    restoreSession();

    // Run the full consent + SDK init flow on native only.
    // Order: UMP consent form (EU/GDPR) → ATT permission (iOS) → initialize.
    if (Platform.OS !== 'web') {
      initializeAdsWithConsent();
    }
  }, []);

  // ── Call WebSocket event listeners ─────────────────────────────────────────
  useEffect(() => {
    const store = useCallStore.getState();

    const unsubs = [
      wsService.on('call.ringing', (data) => {
        store.onCallRinging(data as CallRingingPayload);
      }),
      wsService.on('call.answered', (data) => {
        store.onCallAnswered(data as CallAnsweredPayload);
      }),
      wsService.on('call.rejected', (data) => {
        store.onCallRejected(data as CallRejectedPayload);
      }),
      wsService.on('call.ended', (data) => {
        store.onCallEnded(data as CallEndedPayload);
      }),
      wsService.on('call.ice-candidate', (data) => {
        store.onIceCandidate(data as CallIceCandidatePayload);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  // Read active call for conditional rendering (avoids re-creating the layout
  // on unrelated store changes by reading only the fields we need).
  const callType   = useCallStore((s) => s.activeCall?.callType ?? null);
  const callStatus = useCallStore((s) => s.activeCall?.status ?? null);
  // The store auto-clears activeCall after a delay when status becomes 'ended'
  // or 'rejected', so screens remain mounted long enough to show feedback.
  const hasActiveCall = callType !== null && callStatus !== null;

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          {/* Splash first — no back gesture so auth can't be reached from authenticated area */}
          <Stack.Screen name="index" options={{ gestureEnabled: false }} />
          {/* First-launch onboarding */}
          <Stack.Screen name="intro" options={{ gestureEnabled: false, animation: 'fade' }} />
          {/* Landing screen for unauthenticated users */}
          <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
          {/* Physician post-registration: verification pending notice */}
          <Stack.Screen name="physician-pending" options={{ gestureEnabled: false, animation: 'fade' }} />
          {/* Legal pages — publicly accessible, no auth required */}
          <Stack.Screen name="terms" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="delete-account" options={{ animation: 'slide_from_right' }} />
          {/* Auth group — gestures disabled; replace() clears history on login success */}
          <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
        </Stack>
        <PWAInstallBanner
          visible={showInstallBanner}
          onDismiss={() => {
            setShowInstallBanner(false);
            if (Platform.OS !== 'web' || typeof window === 'undefined') return;
            if (isStandaloneMode()) return;
            const until = Date.now() + INSTALL_BANNER_DISMISS_TTL_MS;
            try {
              localStorage.setItem(INSTALL_BANNER_DISMISS_UNTIL_KEY, String(until));
            } catch {
              // Ignore storage failures; dismiss still applies for current state.
            }
          }}
        />
        {/* Offline indicator — floats above all screens */}
        <OfflineBanner />
        {/* Incoming call — full-screen overlay, shown when call.ringing arrives */}
        <IncomingCallOverlay />
        {/* Active call screens — rendered as top-level overlays via Modal */}
        {hasActiveCall && callType === 'voice' && <VoiceCallScreen />}
        {hasActiveCall && callType === 'video' && <VideoCallScreen />}
      </View>
    </ErrorBoundary>
  );
}