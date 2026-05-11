/**
 * Payment Callback Page — /payment-callback
 *
 * Flutterwave redirects the browser to this URL after checkout completes
 * (success, failed, or cancelled). This page is the target of FLW_REDIRECT_URL
 * on web deployments (https://edis.dshub.com.ng/payment-callback).
 *
 * On native the OS intercepts the lifegate:// deep-link before this page is
 * ever loaded, so this component only runs on web.
 *
 * The page does nothing functional — the actual verification is triggered by
 * the user pressing "I've Completed Payment" on the subscription screen.
 * It simply shows a clear message and closes the tab.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type FLWStatus = 'successful' | 'cancelled' | 'failed' | string;

export default function PaymentCallbackPage() {
  const params = useLocalSearchParams<{ status?: string }>();
  const status: FLWStatus = params.status ?? 'successful';

  const [countdown, setCountdown] = useState(5);

  // Notify the subscription screen via postMessage (web opener path)
  // and attempt deep-link redirect for native browser path.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    // Notify parent tab if opened via window.open.
    if (window.opener) {
      try {
        window.opener.postMessage({ type: 'payment_complete', status }, '*');
      } catch (_) {}
    }
  }, [status]);

  // Auto-close the tab after 5 seconds.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          window.close();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isCancelled = status === 'cancelled';
  const isFailed = status === 'failed';
  const isSuccess = !isCancelled && !isFailed;

  const iconName = isSuccess ? 'checkmark-circle' : isCancelled ? 'close-circle' : 'warning';
  const iconColor = isSuccess ? '#0AADA2' : isCancelled ? '#f59e0b' : '#ef4444';
  const heading = isSuccess
    ? 'Payment Submitted'
    : isCancelled
    ? 'Payment Cancelled'
    : 'Payment Failed';
  const body = isSuccess
    ? 'Your payment was received. Return to the LifeGate app and press "I\'ve Completed Payment" to confirm and receive your credits.'
    : isCancelled
    ? 'You cancelled the payment. No charges were made. You can close this tab and try again.'
    : 'The payment could not be processed. No charges were made. You can close this tab and try again.';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#f0faf9',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 24,
          padding: 36,
          alignItems: 'center',
          maxWidth: 420,
          width: '100%',
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 20,
          elevation: 4,
        }}
      >
        <Ionicons name={iconName} size={72} color={iconColor} />

        <Text
          style={{
            fontSize: 22,
            fontWeight: '800',
            color: '#111827',
            marginTop: 20,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          {heading}
        </Text>

        <Text
          style={{
            fontSize: 15,
            color: '#6b7280',
            textAlign: 'center',
            lineHeight: 24,
            marginBottom: 28,
          }}
        >
          {body}
        </Text>

        <Pressable
          onPress={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.close();
            } else {
              router.replace('/(tab)/settings/subscription');
            }
          }}
          style={({ pressed }) => ({
            backgroundColor: '#0AADA2',
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 32,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
            {Platform.OS === 'web' ? 'Close this tab' : 'Return to LifeGate'}
          </Text>
        </Pressable>

        {countdown > 0 && (
          <Text style={{ marginTop: 14, fontSize: 13, color: '#9ca3af' }}>
            Closing automatically in {countdown}s…
          </Text>
        )}
      </View>
    </View>
  );
}
