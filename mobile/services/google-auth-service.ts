/**
 * Google Sign-In service — platform-aware.
 *
 * • Web  → Firebase signInWithPopup (GoogleAuthProvider)
 * • Native → @react-native-google-signin/google-signin
 *
 * Both paths return a { idToken, email, name } object that is then posted
 * to the LifeGate backend at POST /auth/google.
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

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.idToken) {
    throw new Error('Failed to retrieve Google ID token');
  }

  return {
    idToken: credential.idToken,
    email: result.user.email ?? '',
    name: result.user.displayName ?? '',
  };
}

async function signInNative(): Promise<GoogleSignInResult> {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();

  const tokens = await GoogleSignin.getTokens();
  if (!tokens.idToken) {
    throw new Error('Failed to retrieve Google ID token');
  }

  return {
    idToken: tokens.idToken,
    email: userInfo.data?.user.email ?? '',
    name: userInfo.data?.user.name ?? '',
  };
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (Platform.OS === 'web') {
    return signInWeb();
  }
  return signInNative();
}

/**
 * Configure Google Sign-In for native platforms.
 * Call this once at app startup (e.g. in _layout.tsx) for iOS/Android.
 * webClientId is the Web OAuth 2.0 client ID from Firebase console.
 */
export function configureGoogleSignIn(webClientId: string) {
  if (Platform.OS !== 'web') {
    import('@react-native-google-signin/google-signin').then(({ GoogleSignin }) => {
      GoogleSignin.configure({ webClientId });
    });
  }
}
