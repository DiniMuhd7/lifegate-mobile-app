/**
 * InterstitialAdSlot.tsx — AdMob Interstitial Ad (native).
 *
 * Invisible component — loads a full-screen interstitial in the background.
 * The parent gates the claim reward on a successful ad load:
 *   1. Render <InterstitialAdSlot ref={adRef} onLoaded={...} onDismissed={...} onFailed={...} />
 *   2. When adReady === true, enable the Claim button.
 *   3. On press, call adRef.current?.show() — executes claim inside onDismissed.
 *
 * iOS App ID     : ca-app-pub-4516568539037938~3952077665
 * Android App ID : ca-app-pub-4516568539037938~3922174578
 */
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

// Use test ID in dev; fall back to env var or test ID in production until a
// real interstitial unit is created in the AdMob dashboard.
const AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : (process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID ?? TestIds.INTERSTITIAL);

export interface InterstitialAdSlotHandle {
  /** Show the interstitial. Only effective when an ad is loaded. */
  show: () => void;
  /** Whether a live ad is currently loaded and ready to display. */
  isLoaded: boolean;
}

export interface InterstitialAdSlotProps {
  /** Called when an ad has loaded and is ready to show. */
  onLoaded?: () => void;
  /** Called when the ad load attempt fails (no fill or network error). */
  onFailed?: () => void;
  /** Called after the ad is dismissed by the user. */
  onDismissed?: () => void;
}

export const InterstitialAdSlot = forwardRef<InterstitialAdSlotHandle, InterstitialAdSlotProps>(
  function InterstitialAdSlot({ onLoaded, onFailed, onDismissed }, ref) {
    const interstitial = useRef(
      InterstitialAd.createForAdRequest(AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: !!(global as Record<string, unknown>).__adsNonPersonalized,
      })
    ).current;
    const [loaded, setLoaded] = useState(false);

    useImperativeHandle(ref, () => ({
      show: () => {
        if (loaded) interstitial.show();
      },
      isLoaded: loaded,
    }), [loaded]);

    useEffect(() => {
      const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        setLoaded(true);
        onLoaded?.();
      });
      const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        setLoaded(false);
        onDismissed?.();
        interstitial.load();
      });
      const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => {
        setLoaded(false);
        onFailed?.();
      });

      interstitial.load();

      return () => {
        unsubLoaded();
        unsubClosed();
        unsubError();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
  }
);
