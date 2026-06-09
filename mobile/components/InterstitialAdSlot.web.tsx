/**
 * InterstitialAdSlot.web.tsx — pass-through stub for Expo Web.
 *
 * AdSense has been removed from the web build, so there is no web
 * interstitial. This keeps the same ref/callback contract as the native
 * AdMob implementation (InterstitialAdSlot.tsx): `show()` immediately fires
 * `onDismissed`, so claim flows that show an ad before granting continue to
 * work on web without one.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface InterstitialAdSlotHandle {
  show: () => void;
  /** Always true on web — show() resolves synchronously. */
  isLoaded: boolean;
}

export interface InterstitialAdSlotProps {
  onLoaded?: () => void;
  onFailed?: () => void;
  onDismissed?: () => void;
}

export const InterstitialAdSlot = forwardRef<InterstitialAdSlotHandle, InterstitialAdSlotProps>(
  function InterstitialAdSlot({ onLoaded, onDismissed }, ref) {
    const pendingRef = useRef(false);

    // Signal loaded on first render so the parent can enable the claim button.
    useEffect(() => {
      onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      isLoaded: true,
      show: () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        // No web ad to show — continue the flow immediately.
        queueMicrotask(() => {
          pendingRef.current = false;
          onDismissed?.();
        });
      },
    }));

    return null;
  }
);
