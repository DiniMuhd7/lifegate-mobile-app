/**
 * InterstitialAdSlot.web.tsx — AdSense interstitial / vignette for Expo Web.
 *
 * Uses the adsbygoogle adBreak() API to show a vignette-style interstitial
 * when show() is invoked via ref. Requires "Auto ads → Vignettes" to be
 * enabled in your AdSense account (adsense.google.com → Ads → Auto ads).
 * No ad unit ID is needed — AdSense auto ads manages interstitials centrally.
 *
 * Publisher ID : ca-pub-8968729342650927
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-pub-8968729342650927';
// Interstitial unit ID is optional for AdSense auto-ads vignettes.
// Only set this if you have a dedicated AdSense interstitial unit.
const AD_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_WEB_INTERSTITIAL_UNIT_ID ?? undefined;

declare global {
  interface Window {
    adsbygoogle: unknown[];
    adBreak?: (config: AdBreakConfig) => void;
  }
}

interface AdBreakConfig {
  type: 'start' | 'pause' | 'next' | 'browse' | 'reward';
  adUnitId?: string;
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adDismissed?: () => void;
}

let adConfigured = false;

function ensureAdConfig() {
  if (typeof document === 'undefined' || adConfigured) return;
  adConfigured = true;

  if (!document.getElementById('adsense-interstitial-script')) {
    const s = document.createElement('script');
    s.id = 'adsense-interstitial-script';
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  // Initialize adsbygoogle array before any push (required by the SDK).
  window.adsbygoogle = window.adsbygoogle || [];
  (window.adsbygoogle as unknown[]).push({
    preloadAdBreaks: 'on',
    google_ad_client: PUBLISHER_ID,
  });
}

export interface InterstitialAdSlotHandle {
  show: () => void;
  /** Always true on web — adBreak fires synchronously when called. */
  isLoaded: boolean;
}

export interface InterstitialAdSlotProps {
  onLoaded?: () => void;
  onFailed?: () => void;
  onDismissed?: () => void;
}

export const InterstitialAdSlot = forwardRef<InterstitialAdSlotHandle, InterstitialAdSlotProps>(
  function InterstitialAdSlot({ onLoaded, onFailed, onDismissed }, ref) {
    const pendingRef = useRef(false);

    // On web the adBreak API is always "ready" once the script is injected.
    // Signal loaded on first render so the parent can enable the claim button.
    useEffect(() => {
      ensureAdConfig();
      onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      isLoaded: true,
      show: () => {
        if (typeof window === 'undefined' || pendingRef.current) {
          onFailed?.();
          return;
        }
        pendingRef.current = true;

        const adBreak: (cfg: AdBreakConfig) => void =
          window.adBreak ??
          ((cfg) => {
            (window.adsbygoogle as unknown[]).push(cfg);
          });

        adBreak({
          type: 'next',
          ...(AD_UNIT_ID ? { adUnitId: AD_UNIT_ID } : {}),
          name: 'explore-interstitial',
          afterAd: () => { pendingRef.current = false; },
          adDismissed: () => {
            pendingRef.current = false;
            onDismissed?.();
          },
        });
      },
    }));

    return null;
  }
);
