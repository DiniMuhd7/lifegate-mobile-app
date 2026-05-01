import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'lifegate_token';
const REFRESH_TOKEN_KEY = 'lifegate_refresh_token';

/**
 * Returns true when running in a real browser or native app.
 * During Expo static export (SSG prerendering) this module is executed in
 * Node.js, where `window` is undefined. All storage calls must be no-ops in
 * that context to prevent "window is not defined" crashes at build time.
 */
const isClient = typeof window !== 'undefined';

/**
 * On web always use localStorage (via AsyncStorage) so that tokens survive
 * page refreshes reliably. The SecureStore probe is only needed on native
 * where older Expo Go runtimes may not support the v15 API.
 *
 * Cache the probe result so we don't pay the try/catch cost on every call.
 */
let secureStoreWorks: boolean | null = null;

async function probeSecureStore(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (secureStoreWorks !== null) return secureStoreWorks;
  try {
    await SecureStore.setItemAsync('__probe__', '1');
    await SecureStore.deleteItemAsync('__probe__');
    secureStoreWorks = true;
  } catch {
    secureStoreWorks = false;
  }
  return secureStoreWorks;
}

async function storeSet(key: string, value: string): Promise<void> {
  if (!isClient) return;
  if (await probeSecureStore()) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

async function storeGet(key: string): Promise<string | null> {
  if (!isClient) return null;
  if (await probeSecureStore()) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

async function storeRemove(key: string): Promise<void> {
  if (!isClient) return;
  if (await probeSecureStore()) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

// ─── Access token ─────────────────────────────────────────────────────────────
// NOTE: The access token is intentionally kept in-memory only (Zustand state +
// api.ts module variable). These functions are kept for legacy session restore
// but should not be used for new write paths.

export async function saveToken(token: string): Promise<void> {
  await storeSet(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return storeGet(TOKEN_KEY);
}

export async function removeToken(): Promise<void> {
  await storeRemove(TOKEN_KEY);
}

/**
 * Returns true only when a token exists AND its exp claim is
 * more than 10 seconds in the future. A missing or malformed
 * JWT is treated as invalid.
 */
export async function isTokenValid(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 > Date.now() + 10_000;
  } catch {
    return false;
  }
}

// ─── Refresh token ────────────────────────────────────────────────────────────

export async function saveRefreshToken(token: string): Promise<void> {
  await storeSet(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return storeGet(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken(): Promise<void> {
  await storeRemove(REFRESH_TOKEN_KEY);
}
