/**
 * Google Sign-In service.
 *
 * Web uses Firebase signInWithPopup (GoogleAuthProvider).
 * Native platforms are intentionally excluded.
 */
import { Platform } from 'react-native';

export interface GoogleSignInResult {
  idToken: string;
  email: string;
  name: string;
}

async function signInWeb(): Promise<GoogleSignInResult> {
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const { auth } = await import('./firebase');

  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');

  try {
    const result = await signInWithPopup(auth, provider);
    // getIdToken() returns the Firebase ID token (signed by Firebase, not Google).
    // This is what the backend's accounts:lookup endpoint expects.
    const idToken = await result.user.getIdToken();

    return {
      idToken,
      email: result.user.email ?? '',
      name: result.user.displayName ?? '',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err ?? '');
    const code =
      typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';

    // Firebase can surface this when the browser blocks storage required by
    // the auth redirect handler (common in partitioned or embedded browsers).
    if (code.includes('auth/missing-initial-state') || /missing initial state/i.test(message)) {
      throw new Error(
        'Google sign-in could not be completed because this browser blocked required auth storage. Try again in a regular browser tab (not an embedded in-app browser), allow site storage/cookies for this site, then retry Google sign-in.'
      );
    }

    if (code.includes('auth/unauthorized-domain') || code.includes('auth/unauthorised-domain')) {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      throw new Error(
        `Google sign-in is not enabled for ${host}. Add this domain in Firebase Console -> Authentication -> Settings -> Authorized domains.`
      );
    }
    throw err;
  }
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (Platform.OS === 'web') {
    return signInWeb();
  }
  throw new Error('Google sign-in is only available on web. Please use email/password login or register instead.');
}
