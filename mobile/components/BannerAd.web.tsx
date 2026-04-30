/**
 * BannerAd.web.tsx — AdMob banner for Expo Web.
 *
 * Uses the adsbygoogle (Google Publisher) JavaScript SDK which is the web
 * delivery mechanism for AdMob/AdSense publishers.
 *
 * App ID  : ca-app-pub-4516568539037938~3922174578
 * Unit ID : ca-app-pub-4516568539037938/4524809808
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

const PUBLISHER_ID = 'ca-app-pub-4516568539037938';
const AD_UNIT_ID = 'ca-app-pub-4516568539037938/4524809808';

// Extend window type for adsbygoogle
declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
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

  useEffect(() => {
    loadAdScript();

    if (!pushed.current && adRef.current) {
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        (window.adsbygoogle as unknown[]).push({});
        pushed.current = true;
      } catch {
        // adsbygoogle not yet ready — will retry on next render
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
        data-ad-slot={AD_UNIT_ID.split('/')[1]}
        data-ad-format="banner"
        data-full-width-responsive="false"
      />
    </View>
  );
}
