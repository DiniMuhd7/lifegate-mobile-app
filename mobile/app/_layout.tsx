// File: app/_layout.tsx
import '../global.css' // Ensure global styles are applied to all screens
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
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

export default function RootLayout() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

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
  const hasActiveCall =
    callType !== null &&
    callStatus !== null &&
    callStatus !== 'ended' &&
    callStatus !== 'rejected' &&
    callStatus !== 'missed';

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