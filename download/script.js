const STORAGE_KEY = "lifegate_download_metrics_v1";
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
    if (!raw) return { views: 0, android: 0, ios: 0, lastUpdated: null };
    const parsed = JSON.parse(raw);
    return {
      views: Number(parsed.views || 0),
      android: Number(parsed.android || 0),
      ios: Number(parsed.ios || 0),
      lastUpdated: parsed.lastUpdated || null,
    };
  } catch {
    return { views: 0, android: 0, ios: 0, lastUpdated: null };
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
    views: Number(data?.pageViews || 0),
    android: Number(data?.androidClicks || 0),
    ios: Number(data?.iosClicks || 0),
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
  try {
    const response = await fetch(apkUrl, { mode: "cors" });
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "lifegate-signed.apk";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    // CORS or network error — direct link fallback with download hint
    const a = document.createElement("a");
    a.href = apkUrl;
    a.download = "lifegate-signed.apk";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function attachDownloadTracking() {
  const links = document.querySelectorAll("a[data-platform]");
  links.forEach((link) => {
    link.addEventListener("click", async (e) => {
      const platform = link.getAttribute("data-platform");
      const event = platform === "android" ? "android_download" : platform === "ios" ? "ios_download" : "";
      if (!event) return;

      if (platform === "android") {
        e.preventDefault();
        // Track the event first, then initiate the renamed download
        try {
          const updated = await postEvent(event);
          renderMetrics(updated);
          writeLocalMetrics(updated);
          setStatsSource("Source: live server analytics");
        } catch {
          updateLocalMetrics((metrics) => ({ ...metrics, android: metrics.android + 1 }));
          setStatsSource("Source: browser local fallback");
        }
        await triggerAndroidDownload(link.getAttribute("href"));
        return;
      }

      // iOS — track only, browser follows the link normally
      try {
        const updated = await postEvent(event);
        renderMetrics(updated);
        writeLocalMetrics(updated);
        setStatsSource("Source: live server analytics");
      } catch {
        updateLocalMetrics((metrics) => ({ ...metrics, ios: metrics.ios + 1 }));
        setStatsSource("Source: browser local fallback");
      }
    });
  });
}

loadInitialStats();
incrementViewsOncePerSession();
attachDownloadTracking();
