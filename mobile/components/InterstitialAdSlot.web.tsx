/**
 * InterstitialAdSlot.web.tsx — Web stub for the AdMob Interstitial Ad slot.
 *
 * Invisible component — calls adBreak() (H5 Game Ads API) when show() is
 * invoked via ref.  Matches the same forwardRef interface as the native file.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-app-pub-4516568539037938';
const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_INTERSTITIAL_UNIT_ID ??
  'ca-app-pub-3940256099942544/1033173712';

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

  if (!document.getElementById('admob-h5-script')) {
    const s = document.createElement('script');
    s.id = 'admob-h5-script';
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

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
          adUnitId: AD_UNIT_ID,
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
