/**
 * BannerAd.tsx — AdMob banner for native (iOS / Android).
 *
 * iOS App ID     : ca-app-pub-4516568539037938~3952077665
 * iOS Unit ID    : ca-app-pub-4516568539037938/1507250875
 * Android App ID : ca-app-pub-4516568539037938~3922174578
 * Android Unit ID: ca-app-pub-4516568539037938/4524809808
 */
import React from 'react';
import { Platform } from 'react-native';
import { BannerAd as RNBannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// In debug/development builds always use Google's test IDs — live IDs are
// blocked by the AdMob SDK in non-release environments to prevent invalid
// traffic. Register your physical device as a test device in AdMob if you
// want to see test ads with your live unit IDs during QA.
const AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.select({
      ios:
        process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_UNIT_ID ??
        'ca-app-pub-4516568539037938/1507250875',
      android:
        process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_UNIT_ID ??
        'ca-app-pub-4516568539037938/4524809808',
      default: TestIds.BANNER,
    });

export function BannerAd() {
  const nonPersonalized = !!(global as Record<string, unknown>).__adsNonPersonalized;
  return (
    <RNBannerAd
      unitId={AD_UNIT_ID}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: nonPersonalized }}
    />
  );
}
