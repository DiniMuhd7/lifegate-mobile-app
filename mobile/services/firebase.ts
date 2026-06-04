import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const FALLBACK_FIREBASE_API_KEY = 'AIzaSyA1j0L_Tsz3KQRqF4BGpk7nJRRKEvZCXAc';
const resolvedApiKey =
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || FALLBACK_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey: resolvedApiKey,
  authDomain: 'dshub-f226b.firebaseapp.com',
  projectId: 'dshub-f226b',
  storageBucket: 'dshub-f226b.firebasestorage.app',
  messagingSenderId: '31456730935',
  appId: '1:31456730935:web:f25ab287440300cde204b2',
  measurementId: 'G-08QFRS9BYM',
};

// Prevent re-initializing the app on hot reloads
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analytics is only supported on the web platform
export const analytics: Analytics | null =
  typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;
