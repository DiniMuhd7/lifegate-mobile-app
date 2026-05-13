/**
 * adsConsent.native.ts — ATT (iOS) + UMP (EU/GDPR) consent flow for AdMob.
 *
 * Native-only (iOS / Android). The web counterpart (adsConsent.ts) is a no-op.
 * Metro resolves .native.ts before .ts, so this file is never bundled for web.
 *
 * Flow:
 *  1. Request UMP consent form (GDPR/CCPA) → shows dialog when required.
 *  2. On iOS, request ATT permission after UMP (per Apple guidelines the ATT
 *     prompt must appear AFTER any consent form from a third-party CMP).
 *  3. Determine whether non-personalized ads should be used from the UMP result.
 *  4. Call MobileAds().initialize() with the correct RequestConfiguration.
 */
import { Platform } from 'react-native';
import MobileAds, { AdsConsent, AdsConsentStatus } from 'react-native-google-mobile-ads';

export async function initializeAdsWithConsent(): Promise<void> {
  try {
    // ── Step 1: UMP consent (EU/GDPR) ──────────────────────────────────────
    await AdsConsent.requestInfoUpdate();
    const consentInfo = await AdsConsent.getConsentInfo();

    if (
      consentInfo.isConsentFormAvailable &&
      consentInfo.status === AdsConsentStatus.REQUIRED
    ) {
      await AdsConsent.showForm();
    }

    const { status } = await AdsConsent.getConsentInfo();
    const nonPersonalized =
      status !== AdsConsentStatus.OBTAINED && status !== AdsConsentStatus.NOT_REQUIRED;

    // ── Step 2: ATT permission (iOS 14.5+) ─────────────────────────────────
    if (Platform.OS === 'ios') {
      const { requestTrackingPermissionsAsync } = await import(
        'expo-tracking-transparency'
      );
      await requestTrackingPermissionsAsync();
    }

    // ── Step 3: Initialize MobileAds with consent-aware configuration ──────
    await MobileAds().initialize();
    await MobileAds().setRequestConfiguration({
      maxAdContentRating: 'T',
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });

    if (nonPersonalized) {
      (global as Record<string, unknown>).__adsNonPersonalized = true;
    }
  } catch {
    // Non-fatal — the app continues; ads may not show for this session.
  }
}
    // Non-fatal — the app continues; ads may not show for this session.
  }
}
