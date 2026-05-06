/**
 * BannerAd.web.tsx — AdMob banner for Expo Web.
 *
 * Uses the adsbygoogle (Google Publisher) JavaScript SDK which is the web
 * delivery mechanism for AdMob/AdSense publishers.
 *
 * App ID  : ca-app-pub-4516568539037938~3922174578
 * Unit ID : ca-app-pub-4516568539037938/4524809808
 *
 * The banner is only rendered in production builds (not on localhost / dev
 * tunnels) because adsbygoogle rejects unapproved origins and throws an
 * uncaught console error that pollutes dev output.
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

const PUBLISHER_ID =
  process.env.EXPO_PUBLIC_ADMOB_WEB_PUBLISHER_ID ?? 'ca-app-pub-3940256099942544';
const AD_SLOT =
  process.env.EXPO_PUBLIC_ADMOB_WEB_BANNER_SLOT ?? '6300978111';

// Extend window type for adsbygoogle
declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/** Returns true only when running on the deployed production origin. */
// Dev-mode: always enabled so test ads render on localhost / Codespaces.
function isProduction(): boolean {
  return typeof window !== 'undefined';
}

function loadAdScript() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('admob-web-script')) return;

  const script = document.createElement('script');
  script.id = 'admob-web-script';
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

export function BannerAd() {
  const adRef = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);

  // Skip rendering entirely in development / unapproved origins.
  if (!isProduction()) return null;

  useEffect(() => {
    loadAdScript();

    const el = adRef.current as (HTMLElement & { dataset: DOMStringMap }) | null;
    // adsbygoogle sets data-adsbygoogle-status="done" once the slot is filled.
    // Guard against double-push on hot-reload / StrictMode double-invocation.
    if (!pushed.current && el && !el.dataset['adsbygoogleStatus']) {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        (window.adsbygoogle as unknown[]).push({});
        pushed.current = true;
      } catch {
        // Non-fatal — slot will remain empty rather than crashing the UI.
      }
    }
  }, []);

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      {/* @ts-expect-error — ins is a valid HTML element not typed in RN */}
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', width: 320, height: 50 }}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={AD_SLOT}
        data-ad-format="banner"
        data-full-width-responsive="false"
      />
    </View>
  );
}
