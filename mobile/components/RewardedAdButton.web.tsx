/**
 * RewardedAdButton.web.tsx — In-article AdSense unit for Expo Web.
 *
 * Web has no true rewarded ads on standard AdSense, so in place of the native
 * rewarded button this renders an in-article fluid display unit. It is a
 * passive impression: no reward is granted on web (`onRewarded` is never
 * called) — granting coins for a mere impression violates AdSense policy.
 *
 * Publisher ID : ca-pub-4516568539037938
 * Ad slot      : 4158671196 (in-article, fluid)
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-pub-4516568539037938';
const AD_SLOT =
  process.env.EXPO_PUBLIC_ADMOB_WEB_INARTICLE_SLOT ?? '4158671196';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

function loadAdScript() {
  if (typeof document === 'undefined') return;
  // The web shell (web/index.html) already loads adsbygoogle.js — only inject
  // if it's somehow missing. Loading the SDK twice triggers console errors.
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;

  const script = document.createElement('script');
  script.id = 'adsense-web-script';
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

export interface RewardedAdButtonProps {
  onRewarded: () => void;
  onDismissed?: () => void;
  label?: string;
  sublabel?: string;
  coinsLabel?: string;
  disabled?: boolean;
}

// Props are accepted for parity with the native rewarded button but unused on
// web — this renders a passive in-article ad and never grants a reward.
export function RewardedAdButton(_props: RewardedAdButtonProps) {
  const adRef = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    loadAdScript();

    const el = adRef.current as (HTMLElement & { dataset: DOMStringMap }) | null;
    if (!el) return;

    let frameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const tryPushAd = () => {
      if (pushed.current) return true;

      // Wait until layout has produced a measurable slot width; otherwise
      // AdSense throws "No slot size for availableWidth=0".
      const width = el.getBoundingClientRect().width;
      if (!width || width <= 0 || el.dataset['adsbygoogleStatus']) {
        return false;
      }

      try {
        window.adsbygoogle = window.adsbygoogle || [];
        (window.adsbygoogle as unknown[]).push({});
        pushed.current = true;
        return true;
      } catch {
        // Non-fatal — slot stays empty rather than crashing the UI.
        return false;
      }
    };

    frameId = window.requestAnimationFrame(() => {
      if (tryPushAd()) return;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (tryPushAd()) {
            resizeObserver?.disconnect();
            resizeObserver = null;
          }
        });
        resizeObserver.observe(el);
      }
    });

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, []);

  // SSR: render nothing on the server.
  if (typeof window === 'undefined') return null;

  return (
    <View style={{ width: '100%' }}>
      {/* @ts-expect-error — ins is a valid HTML element not typed in RN */}
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', textAlign: 'center' }}
        data-ad-layout="in-article"
        data-ad-format="fluid"
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={AD_SLOT}
      />
    </View>
  );
}
