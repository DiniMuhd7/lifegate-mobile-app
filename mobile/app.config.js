/**
 * app.config.js — Dynamic Expo config.
 *
 * Merges static values from app.json and injects environment variables so
 * that environment-specific values never need to be hard-coded in source.
 */

/** @param {{ config: import('@expo/config-types').ExpoConfig }} ctx */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    'expo-router',
    '@react-native-community/datetimepicker',
    'expo-secure-store',
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
