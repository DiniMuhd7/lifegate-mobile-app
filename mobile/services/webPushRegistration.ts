/**
 * Web Push registration for Expo web.
 *
 * Registers the service worker (public/sw.js), fetches the VAPID public key
 * from the backend, calls PushManager.subscribe(), and POSTs the resulting
 * PushSubscription to /api/web-push/subscribe.
 *
 * Safe to call multiple times — it no-ops on non-web platforms and gracefully
 * handles the case where the user has already subscribed from this browser.
 */

import { Platform } from 'react-native';
import api from './api';

type BadgedNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count?: number) => Promise<void>;
};

type WebPushStatus = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
};

/**
 * Returns current web push capability + subscription status.
 */
export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (Platform.OS !== 'web') {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }

  const permission: NotificationPermission = typeof Notification === 'undefined'
    ? 'default'
    : Notification.permission;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) {
      return { supported: true, permission, subscribed: false };
    }
    const sub = await registration.pushManager.getSubscription();
    return { supported: true, permission, subscribed: !!sub };
  } catch {
    return { supported: true, permission, subscribed: false };
  }
}

/**
 * Register for web push notifications. Call this once per authenticated
 * session on the web platform (e.g. in the root layout useEffect).
 *
 * Returns true on success, false when unsupported or permission denied.
 */
export async function registerWebPush(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[webpush] Not supported in this browser');
    return false;
  }

  try {
    // 1. Register (or reuse) the service worker.
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 2. Fetch the VAPID public key from the backend.
    const { data } = await api.get<{ success: boolean; vapidPublicKey: string }>('/vapid-public-key');
    if (!data.success || !data.vapidPublicKey) {
      console.warn('[webpush] VAPID public key not available from backend');
      return false;
    }

    // 3. Request notification permission.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[webpush] Notification permission denied');
      return false;
    }

    // 4. Subscribe (or retrieve the existing subscription).
    const applicationServerKey = urlBase64ToUint8Array(data.vapidPublicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // 5. Send the subscription to our backend.
    await api.post('/web-push/subscribe', subscription.toJSON());
    return true;
  } catch (err) {
    console.error('[webpush] Registration failed:', err);
    return false;
  }
}

/**
 * Unsubscribe from web push and notify the backend to remove the record.
 */
export async function unregisterWebPush(): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await api.delete('/web-push/subscribe', { data: { endpoint } });
  } catch (err) {
    console.error('[webpush] Unsubscribe failed:', err);
  }
}

export async function syncWebAppBadge(count: number): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (typeof navigator === 'undefined') return;

  const badgedNavigator = navigator as BadgedNavigator;

  try {
    if (count > 0 && typeof badgedNavigator.setAppBadge === 'function') {
      await badgedNavigator.setAppBadge(count);
      return;
    }

    if (typeof badgedNavigator.clearAppBadge === 'function') {
      await badgedNavigator.clearAppBadge();
    }
  } catch {
    // Browsers that expose the API can still reject when the app is not installed.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a URL-safe base64 VAPID public key to the Uint8Array that
 * PushManager.subscribe() expects as `applicationServerKey`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
