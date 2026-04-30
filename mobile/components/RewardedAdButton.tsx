/**
 * RewardedAdButton.tsx — AdMob Rewarded Ad stub for native (iOS / Android).
 *
 * Native rewarded ads require a development build with
 * react-native-google-mobile-ads. This stub renders nothing in Expo Go.
 *
 * App ID  : ca-app-pub-4516568539037938~3922174578  (set in app.json)
 * Unit ID : ca-app-pub-4516568539037938/1561718040
 */
import React from 'react';
import { View } from 'react-native';

export interface RewardedAdButtonProps {
  onRewarded: () => void;
  onDismissed?: () => void;
  label?: string;
  sublabel?: string;
  coinsLabel?: string;
  disabled?: boolean;
}

export function RewardedAdButton(_props: RewardedAdButtonProps) {
  // Native rewarded ads require a development build — returns null in Expo Go.
  return <View />;
}
