/**
 * adsConsent.ts — Web no-op stub.
 *
 * Metro resolves .native.ts before .ts for iOS/Android builds, so the real
 * consent flow in adsConsent.native.ts is used on native platforms.
 * This file is bundled for web only, where AdMob native SDKs don't exist.
 */
export async function initializeAdsWithConsent(): Promise<void> {
  // No-op on web — adsbygoogle is initialised directly in BannerAd.web.tsx.
}
