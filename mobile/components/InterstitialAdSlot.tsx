/**
 * InterstitialAdSlot.tsx — AdMob Interstitial Ad (native).
 *
 * Invisible component — loads a full-screen interstitial in the background.
 * Call `ref.current?.show()` to display it (e.g. after a reward is claimed).
 * The ad is pre-loaded on mount and automatically reloads after each dismissal.
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
  /** Show the interstitial if loaded; silently skips if not yet ready. */
  show: () => void;
}

export interface InterstitialAdSlotProps {
  /** Called after the ad is dismissed. */
  onDismissed?: () => void;
}

export const InterstitialAdSlot = forwardRef<InterstitialAdSlotHandle, InterstitialAdSlotProps>(
  function InterstitialAdSlot({ onDismissed }, ref) {
    const interstitial = useRef(InterstitialAd.createForAdRequest(AD_UNIT_ID)).current;
    const [loaded, setLoaded] = useState(false);

    useImperativeHandle(ref, () => ({
      show: () => {
        if (loaded) interstitial.show();
      },
    }), [loaded]);

    useEffect(() => {
      const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        setLoaded(true);
      });
      const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        setLoaded(false);
        onDismissed?.();
        interstitial.load();
      });
      const unsubError = interstitial.addAdEventListener(AdEventType.ERROR, () => {
        setLoaded(false);
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
