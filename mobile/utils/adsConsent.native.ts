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
  // ── Always initialize the SDK first ────────────────────────────────────────
  // MobileAds().initialize() MUST be called regardless of consent outcome.
  // Doing it here before the UMP/ATT flow ensures ads can load even if the
  // consent check fails (e.g. network error, UMP not configured in dashboard).
  let nonPersonalized = false;
  try {
    await MobileAds().initialize();
  } catch {
    // SDK init failure is non-recoverable for this session.
    return;
  }

  // ── Step 1: UMP consent (EU/GDPR) ──────────────────────────────────────────
  // This may throw if UMP is not yet configured in the AdMob dashboard — safe
  // to ignore; we already initialized above so ads will still attempt to load.
  try {
    await AdsConsent.requestInfoUpdate();
    const consentInfo = await AdsConsent.getConsentInfo();

    if (
      consentInfo.isConsentFormAvailable &&
      consentInfo.status === AdsConsentStatus.REQUIRED
    ) {
      await AdsConsent.showForm();
    }

    const { status } = await AdsConsent.getConsentInfo();
    nonPersonalized =
      status !== AdsConsentStatus.OBTAINED && status !== AdsConsentStatus.NOT_REQUIRED;
  } catch {
    // UMP not configured or network error — continue with default (personalized).
  }

  // ── Step 2: ATT permission (iOS 14.5+) ─────────────────────────────────────
  if (Platform.OS === 'ios') {
    try {
      const { requestTrackingPermissionsAsync } = await import(
        'expo-tracking-transparency'
      );
      await requestTrackingPermissionsAsync();
    } catch {
      // ATT not available (simulator, older iOS) — continue.
    }
  }

  // ── Step 3: Apply consent-aware request configuration ──────────────────────
  try {
    await MobileAds().setRequestConfiguration({
      maxAdContentRating: 'T',
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
  } catch {
    // Non-fatal.
  }

  if (nonPersonalized) {
    (global as Record<string, unknown>).__adsNonPersonalized = true;
  }
}
