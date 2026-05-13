/**
 * InterstitialAdSlot.tsx — AdMob Interstitial Ad (native).
 *
 * Invisible component — loads a full-screen interstitial in the background.
 * The parent gates the claim reward on a successful ad load:
 *   1. Render <InterstitialAdSlot ref={adRef} onLoaded={...} onDismissed={...} onFailed={...} />
 *   2. When adReady === true, enable the Claim button.
 *   3. On press, call adRef.current?.show() — executes claim inside onDismissed.
 *
 * App ID  : ca-app-pub-3940256099942544~3347511713  (test — iOS)
 * App ID  : ca-app-pub-3940256099942544~1458002511  (test — Android)
 * Unit ID : ca-app-pub-3940256099942544/1033173712  (test interstitial)
 */
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID ?? TestIds.INTERSTITIAL;

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
