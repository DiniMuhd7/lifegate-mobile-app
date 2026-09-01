/**
 * houseVideos.ts — LifeGate's self-hosted promo videos.
 *
 * Used as rewarded ad inventory: the RewardedAdButton and the shorts/reels
 * claim flow play these fullscreen and grant coins on completion.
 *
 * The videos are baked into the Render web deployment at build time by
 * mobile/scripts/download-house-videos.js and served first-party from
 * https://lifegate.dshub.com.ng/videos/ (native apps stream the same URLs).
 * Override with EXPO_PUBLIC_WEB_REWARDED_VIDEO_URLS (comma-separated URLs).
 */
import { Platform } from 'react-native';

const VIDEO_FILES = [
  'lifegate-promo-1.mp4',
  'lifegate-promo-2.mp4',
  'lifegate-promo-3.mp4',
  'lifegate-promo-4.mp4',
];

const VIDEO_BASE_URLS = ['https://lifegate.dshub.com.ng/videos'];

export const HOUSE_VIDEO_URLS: string[] = (() => {
  const env = process.env.EXPO_PUBLIC_WEB_REWARDED_VIDEO_URLS;
  if (env) return env.split(',').map((s: string) => s.trim()).filter(Boolean);
  // In local dev the Metro/Expo dev server has no /videos directory — stream
  // from the production deployment instead so the flow stays testable.
  if (__DEV__) return VIDEO_FILES.flatMap((f) => VIDEO_BASE_URLS.map((base) => `${base}/${f}`));
  // On web, same-origin relative URLs keep working on preview deploys and
  // custom domains alike; native needs the absolute production URL.
  if (Platform.OS === 'web') return VIDEO_FILES.map((f) => `/videos/${f}`);
  return VIDEO_FILES.flatMap((f) => VIDEO_BASE_URLS.map((base) => `${base}/${f}`));
})();

export function pickHouseVideoUrl(): string {
  return HOUSE_VIDEO_URLS[Math.floor(Math.random() * HOUSE_VIDEO_URLS.length)];
}

/** All video URLs in random order — callers can fall through on load errors. */
export function shuffledHouseVideoUrls(): string[] {
  const urls = [...HOUSE_VIDEO_URLS];
  for (let i = urls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [urls[i], urls[j]] = [urls[j], urls[i]];
  }
  return urls;
}
