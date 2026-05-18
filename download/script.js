const STORAGE_KEY = "lifegate_download_metrics_v2";
const SEED_METRICS = { views: 527, android: 225, ios: 250, lastUpdated: null };
const API_BASE = resolveApiBase();

function resolveApiBase() {
  const configured = document
    .querySelector('meta[name="lifegate-api-base"]')
    ?.getAttribute("content")
    ?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://edis.dshub.com.ng/api";
}

function readLocalMetrics() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SEED_METRICS };
    const parsed = JSON.parse(raw);
    return {
      views:   Math.max(Number(parsed.views   || 0), SEED_METRICS.views),
      android: Math.max(Number(parsed.android || 0), SEED_METRICS.android),
      ios:     Math.max(Number(parsed.ios     || 0), SEED_METRICS.ios),
      lastUpdated: parsed.lastUpdated || null,
    };
  } catch {
    return { ...SEED_METRICS };
  }
}

function writeLocalMetrics(metrics) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function formatDate(isoString) {
  if (!isoString) return "--";
  const date = new Date(isoString);
  return date.toLocaleString();
}

function renderMetrics(metrics) {
  const totalDownloads = metrics.android + metrics.ios;
  const ctr = metrics.views > 0 ? ((totalDownloads / metrics.views) * 100).toFixed(1) : "0.0";
  const maxClicks = Math.max(metrics.android, metrics.ios, 1);

  document.getElementById("stat-views").textContent = formatNumber(metrics.views);
  document.getElementById("stat-android").textContent = formatNumber(metrics.android);
  document.getElementById("stat-ios").textContent = formatNumber(metrics.ios);
  document.getElementById("stat-ctr").textContent = `${ctr}%`;

  document.getElementById("bar-android").style.width = `${(metrics.android / maxClicks) * 100}%`;
  document.getElementById("bar-ios").style.width = `${(metrics.ios / maxClicks) * 100}%`;
  document.getElementById("bar-label-android").textContent = String(metrics.android);
  document.getElementById("bar-label-ios").textContent = String(metrics.ios);
  document.getElementById("last-updated").textContent = `Last updated: ${formatDate(metrics.lastUpdated)}`;
}

function setStatsSource(text) {
  const el = document.getElementById("stats-source");
  if (el) el.textContent = text;
}

function updateLocalMetrics(updateFn) {
  const metrics = readLocalMetrics();
  const next = updateFn(metrics);
  next.lastUpdated = new Date().toISOString();
  writeLocalMetrics(next);
  renderMetrics(next);
}

function mapApiData(data) {
  return {
    views:   Math.max(Number(data?.pageViews      || 0), SEED_METRICS.views),
    android: Math.max(Number(data?.androidClicks  || 0), SEED_METRICS.android),
    ios:     Math.max(Number(data?.iosClicks       || 0), SEED_METRICS.ios),
    lastUpdated: data?.updatedAt || null,
  };
}

async function fetchServerStats() {
  const response = await fetch(`${API_BASE}/download-stats`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("stats request failed");
  const body = await response.json();
  if (!body?.success) throw new Error("stats response not successful");
  return mapApiData(body.data);
}

async function postEvent(eventName) {
  const response = await fetch(`${API_BASE}/download-stats/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ event: eventName }),
    keepalive: true,
  });
  if (!response.ok) throw new Error("event request failed");
  const body = await response.json();
  if (!body?.success) throw new Error("event response not successful");
  return mapApiData(body.data);
}

async function loadInitialStats() {
  try {
    const serverMetrics = await fetchServerStats();
    renderMetrics(serverMetrics);
    writeLocalMetrics(serverMetrics);
    setStatsSource("Source: live server analytics");
  } catch {
    renderMetrics(readLocalMetrics());
    setStatsSource("Source: browser local fallback");
  }
}

async function incrementViewsOncePerSession() {
  const sessionKey = "lifegate_view_counted";
  if (sessionStorage.getItem(sessionKey) === "1") {
    return;
  }
  try {
    const updated = await postEvent("view");
    renderMetrics(updated);
    writeLocalMetrics(updated);
    setStatsSource("Source: live server analytics");
  } catch {
    updateLocalMetrics((metrics) => ({ ...metrics, views: metrics.views + 1 }));
    setStatsSource("Source: browser local fallback");
  }
  sessionStorage.setItem(sessionKey, "1");
}

async function triggerAndroidDownload(apkUrl) {
  // Intentionally removed — fetching the APK as a blob was causing two problems:
  // 1. The entire file had to buffer in browser memory before the download started (slow).
  // 2. A blob: URL hides the real origin, triggering stronger browser security warnings.
  // The browser now downloads directly via the native <a download> link (see below).
}

function attachDownloadTracking() {
  const links = document.querySelectorAll("a[data-platform]");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      const platform = link.getAttribute("data-platform");
      const event = platform === "android" ? "android_download" : platform === "ios" ? "ios_download" : "";
      if (!event) return;

      // Fire tracking in the background — keepalive:true means it survives page unload.
      // Do NOT await or preventDefault; let the browser start the download instantly.
      postEvent(event)
        .then((updated) => {
          renderMetrics(updated);
          writeLocalMetrics(updated);
          setStatsSource("Source: live server analytics");
        })
        .catch(() => {
          updateLocalMetrics((metrics) => ({
            ...metrics,
            [platform]: (metrics[platform] || 0) + 1,
          }));
          setStatsSource("Source: browser local fallback");
        });

      // Browser follows the link natively — fastest possible download,
      // and the real HTTPS origin is visible to Safe Browsing.
    });
  });
}

// Render seed values immediately so the page never flashes zeros.
renderMetrics(SEED_METRICS);
loadInitialStats();
incrementViewsOncePerSession();
attachDownloadTracking();
