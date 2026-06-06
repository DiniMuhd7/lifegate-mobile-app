/**
 * app.config.js — Dynamic Expo config.
 *
 * Merges static values from app.json and injects environment variables so
 * that sensitive/environment-specific IDs (AdMob, etc.) never need to be
 * hard-coded in source files.
 *
 * Set EXPO_PUBLIC_ADMOB_* in:
 *   • .env          — local development
 *   • EAS secrets   — managed EAS Build (iOS / Android)
 *   • render.yaml   — Render static web deployment
 */

/** @param {{ config: import('@expo/config-types').ExpoConfig }} ctx */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    'expo-router',
    '@react-native-community/datetimepicker',
    'expo-secure-store',
    [
      'react-native-google-mobile-ads',
      {
        androidAppId:
          process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ??
          'ca-app-pub-4516568539037938~3922174578',
        iosAppId:
          process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ??
          'ca-app-pub-4516568539037938~3952077665',
      },
    ],
    [
      'expo-notifications',
      {
        // Android status-bar notification icons must be a transparent
        // silhouette — a fully-opaque image (icon.png) renders as a blank
        // white square. adaptive-icon.png has alpha transparency so the
        // LifeGate mark shows as the small icon, tinted with the color below.
        icon: './assets/adaptive-icon.png',
        color: '#0AADA2',
        sounds: [],
        androidMode: 'default',
        androidCollapsedTitle: 'LifeGate',
      },
    ],
  ],
  // Ensure the Android adaptive (launcher) icon is also wired here since
  // app.config.js overrides app.json — keeps the app icon consistent.
  android: {
    ...config.android,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
  },
});
