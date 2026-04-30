import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
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

export default app;
