/**
 * BannerAd.web.tsx — house-ad banner for Expo Web.
 *
 * AdSense has been removed from the web build; banner slots show LifeGate's
 * own rotating house creatives (Premium / referral / redeem) instead.
 * Native (iOS/Android) continues to use AdMob via BannerAd.tsx.
 */
import React from 'react';
import { View } from 'react-native';
import { HouseAd } from './HouseAd';

export function BannerAd() {
  // SSR: render nothing on the server.
  if (typeof window === 'undefined') return null;

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <HouseAd />
    </View>
  );
}
