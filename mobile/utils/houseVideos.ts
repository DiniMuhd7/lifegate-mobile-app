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
  // drive.usercontent.google.com serves the bytes directly with
  // Content-Type: video/mp4. The drive.google.com/uc URL 303-redirects there,
  // but its first response is application/binary + nosniff, which some video
  // players (notably ExoPlayer on Android) reject.
  return DEFAULT_VIDEO_IDS.map(
    (id) => `https://drive.usercontent.google.com/download?id=${id}&export=download`
  );
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
