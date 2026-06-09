/**
 * BannerAd.tsx — house-ad banner (all platforms).
 *
 * Third-party ad networks (AdMob/AdSense) have been removed; banner slots
 * show LifeGate's own rotating house creatives instead. See HouseAd.tsx.
 */
import React from 'react';
import { View } from 'react-native';
import { HouseAd } from './HouseAd';

export function BannerAd() {
  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <HouseAd />
    </View>
  );
}
