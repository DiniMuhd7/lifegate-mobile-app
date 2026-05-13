/**
 * adsConsent.ts — ATT (iOS) + UMP (EU/GDPR) consent flow for AdMob.
 *
 * Call `initializeAdsWithConsent()` once at app startup (before any ad unit
 * renders).  The function is safe to call on all platforms; it no-ops on web.
 *
 * Flow:
 *  1. Request UMP consent form (GDPR/CCPA) → shows dialog when required.
 *  2. On iOS, request ATT permission after UMP (per Apple guidelines the ATT
 *     prompt must appear AFTER any consent form from a third-party CMP).
 *  3. Determine whether non-personalized ads should be used from the UMP result.
 *  4. Call MobileAds().initialize() with the correct RequestConfiguration.
 */
import { Platform } from 'react-native';

export async function initializeAdsWithConsent(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const [
      { AdsConsent, AdsConsentStatus },
      { default: MobileAds },
    ] = await Promise.all([
      import('react-native-google-mobile-ads'),
      import('react-native-google-mobile-ads'),
    ]);

    // ── Step 1: UMP consent (EU/GDPR) ──────────────────────────────────────
    // requestInfoUpdate either silently confirms consent is not required, or
    // marks the form as available for collection.
    await AdsConsent.requestInfoUpdate();
    const consentInfo = await AdsConsent.getConsentInfo();

    // Show the consent form if it is required and not yet obtained.
    if (
      consentInfo.isConsentFormAvailable &&
      consentInfo.status === AdsConsentStatus.REQUIRED
    ) {
      await AdsConsent.showForm();
    }

    // Re-read after potential form display to get the final status.
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
      // Only request non-personalized ads when consent was not obtained
      // (e.g. user in EU who did not consent, or ATT denied on iOS).
      maxAdContentRating: 'T',
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });

    if (nonPersonalized) {
      // Signal to ad requests to use non-personalized ads only.
      // Individual ad components read this flag via their requestOptions.
      (global as Record<string, unknown>).__adsNonPersonalized = true;
    }
  } catch {
    // Non-fatal — the app continues; ads may not show for this session.
  }
}
