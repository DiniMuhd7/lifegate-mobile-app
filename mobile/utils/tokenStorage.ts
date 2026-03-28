import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'lifegate_token';

/**
 * Cache the result after the first probe so we don't pay the try/catch cost
 * on every call. null = not yet tested, true/false = result of probe.
 */
let secureStoreWorks: boolean | null = null;

/**
 * Probe SecureStore by actually calling setItemAsync with an empty string.
 * This is the only reliable way to detect whether the native layer supports
 * the v15 API (setItemAsync/getItemAsync) on the current Expo Go runtime.
 * Older Expo Go versions throw "setValueWithKeyAsync is not a function".
 */
async function probeSecureStore(): Promise<boolean> {
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

export async function saveToken(token: string): Promise<void> {
  if (await probeSecureStore()) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (await probeSecureStore()) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function removeToken(): Promise<void> {
  if (await probeSecureStore()) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export async function isTokenValid(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}
