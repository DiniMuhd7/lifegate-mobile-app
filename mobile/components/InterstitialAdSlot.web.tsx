/**
 * InterstitialAdSlot.web.tsx — Web stub for the AdMob Interstitial Ad slot.
 *
 * Invisible component — calls adBreak() (H5 Game Ads API) when show() is
 * invoked via ref.  Matches the same forwardRef interface as the native file.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-app-pub-3940256099942544';
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
}

export interface InterstitialAdSlotProps {
  onDismissed?: () => void;
}

export const InterstitialAdSlot = forwardRef<InterstitialAdSlotHandle, InterstitialAdSlotProps>(
  function InterstitialAdSlot({ onDismissed }, ref) {
    const pendingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      show: () => {
        if (typeof window === 'undefined' || pendingRef.current) return;
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

    useEffect(() => {
      ensureAdConfig();
    }, []);

    return null;
  }
);
