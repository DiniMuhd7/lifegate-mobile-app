/**
 * RewardedAdButton.web.tsx — Web stub for the rewarded ad button.
 *
 * Rewarded ads (adBreak type='reward') are part of Google's H5 Games Ads
 * programme, which is invite-only and restricted to browser games. They are
 * NOT available via standard AdSense for web apps.
 *
 * This stub returns null so the button is hidden on web. The feature remains
 * fully functional on iOS and Android via AdMob (RewardedAdButton.tsx).
 */
import React from 'react';

export interface RewardedAdButtonProps {
  onRewarded: () => void;
  onDismissed?: () => void;
  label?: string;
  sublabel?: string;
  coinsLabel?: string;
  disabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RewardedAdButton(_props: RewardedAdButtonProps) {
  return null;
}
