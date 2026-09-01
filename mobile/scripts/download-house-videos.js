/**
 * download-house-videos.js — fetch LifeGate promo videos into the web build.
 *
 * Run after `expo export -p web` (see render.yaml buildCommand). Downloads
 * the house-ad videos from Google Drive into <outDir>/videos so the deployed
 * site serves them first-party (https://lifegate.dshub.com.ng/videos/…) instead
 * of streaming from Drive at runtime (which enforces download quotas).
 *
 * Usage: node scripts/download-house-videos.js [outDir]   (default: dist)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const VIDEOS = [
  { id: '1MD05PTJXlKLif3s6YdAJUk5qfKeLzWQ8', name: 'lifegate-promo-1.mp4' },
  { id: '1eCUblwhPekf6cRF7xMg1kRuJWa3MTTC4', name: 'lifegate-promo-2.mp4' },
  { id: '1V_ndFSaDCJRLsq7aEWWFduxAE0j_ARmu', name: 'lifegate-promo-3.mp4' },
  { id: '1jBOL2o10PPF9aBXGwYnEpUphVaNqJB2y', name: 'lifegate-promo-4.mp4' },
];

const outDir = path.join(process.argv[2] || 'dist', 'videos');

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error(`Too many redirects: ${url}`));
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const type = res.headers['content-type'] || '';
        if (!type.startsWith('video/')) {
          res.resume();
          return reject(new Error(`Unexpected content-type "${type}" for ${url}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let failures = 0;
  for (const { id, name } of VIDEOS) {
    const url = `https://drive.usercontent.google.com/download?id=${id}&export=download`;
    const dest = path.join(outDir, name);
    try {
      await download(url, dest);
      const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
      console.log(`✓ ${name} (${mb} MB)`);
    } catch (err) {
      failures++;
      console.error(`✗ ${name}: ${err.message}`);
    }
  }
  if (failures === VIDEOS.length) {
    // All downloads failed — fail the build so we don't ship a site with a
    // broken rewarded-video flow.
    process.exit(1);
  }
})();
