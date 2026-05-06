/**
 * BannerAd.tsx — AdMob banner for native (iOS / Android).
 *
 * App ID  : ca-app-pub-3940256099942544~3347511713  (test — iOS)
 * App ID  : ca-app-pub-3940256099942544~1458002511  (test — Android)
 * Unit ID : ca-app-pub-3940256099942544/6300978111  (test banner)
 */
import React from 'react';
import { BannerAd as RNBannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID ?? TestIds.BANNER;

export function BannerAd() {
  return (
    <RNBannerAd
      unitId={AD_UNIT_ID}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: false }}
    />
  );
}
