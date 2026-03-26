import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'lifegate_token';

/**
 * Save JWT token to secure storage
 */
export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    console.log('Token saved to secure storage');
  } catch (error) {
    console.error('Failed to save token to secure storage:', error);
    throw error;
  }
}

/**
 * Retrieve JWT token from secure storage
 */
export async function getToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('Failed to retrieve token from secure storage:', error);
    return null;
  }
}


/**
 * Remove JWT token from secure storage
 */
export async function removeToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    console.log('Token removed from secure storage');
  } catch (error) {
    console.error('Failed to remove token from secure storage:', error);
    throw error;
  }
}

/**
 * Check if a valid token exists
 */

export async function isTokenValid(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}