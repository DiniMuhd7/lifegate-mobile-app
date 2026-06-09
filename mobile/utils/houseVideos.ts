/**
 * houseVideos.ts — LifeGate's self-hosted promo videos.
 *
 * Used as rewarded/interstitial ad inventory of last resort: the web
 * RewardedAdButton plays these directly, and the shorts/reels claim flow
 * falls back to them when AdMob/AdSense has no fill.
 *
 * Override with EXPO_PUBLIC_WEB_REWARDED_VIDEO_URLS (comma-separated URLs).
 * Note: Google Drive enforces per-file download quotas — move these to a
 * proper CDN if traffic grows.
 */

const DEFAULT_VIDEO_IDS = [
  '1MD05PTJXlKLif3s6YdAJUk5qfKeLzWQ8',
  '1eCUblwhPekf6cRF7xMg1kRuJWa3MTTC4',
  '1V_ndFSaDCJRLsq7aEWWFduxAE0j_ARmu',
  '1jBOL2o10PPF9aBXGwYnEpUphVaNqJB2y',
];

export const HOUSE_VIDEO_URLS: string[] = (() => {
  const env = process.env.EXPO_PUBLIC_WEB_REWARDED_VIDEO_URLS;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  return DEFAULT_VIDEO_IDS.map(
    (id) => `https://drive.google.com/uc?export=download&id=${id}`
  );
})();

export function pickHouseVideoUrl(): string {
  return HOUSE_VIDEO_URLS[Math.floor(Math.random() * HOUSE_VIDEO_URLS.length)];
}
