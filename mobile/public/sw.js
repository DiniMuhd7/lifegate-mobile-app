/**
 * LifeGate Web Push Service Worker
 *
 * Installed by webPushRegistration.ts. Handles incoming push events from the
 * backend and displays OS-level notifications while the app is in the
 * background or closed.
 *
 * Push payload shape (JSON):
 *   { title: string, body: string, data?: Record<string, string> }
 */

const CACHE_NAME = 'lifegate-app-shell-v2';
const APP_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.png',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('/', networkResponse.clone()).catch(() => {});
        return networkResponse;
      } catch {
        const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
        if (cachedResponse) return cachedResponse;
        return caches.match('/');
      }
    })());
    return;
  }

  // Only cache a tiny app-shell allowlist. Runtime JS/CSS chunks are fetched
  // from network to avoid stale UI after deploys.
  const shellPath = requestUrl.pathname;
  if (APP_SHELL_ASSETS.includes(shellPath)) {
    event.respondWith((async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch {
        return cachedResponse;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      return await fetch(event.request);
    } catch {
      return caches.match(event.request);
    }
  })());
});

async function setBadgeCount(count) {
  const badgedNavigator = self.navigator;

  try {
    if (count > 0 && typeof badgedNavigator?.setAppBadge === 'function') {
      await badgedNavigator.setAppBadge(count);
      return;
    }

    if (typeof badgedNavigator?.clearAppBadge === 'function') {
      await badgedNavigator.clearAppBadge();
    }
  } catch {
    // Ignore unsupported or rejected badge updates.
  }
}

async function syncBadgeFromNotifications() {
  const notifications = await self.registration.getNotifications();
  await setBadgeCount(notifications.length);
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'LifeGate', body: event.data.text() };
  }

  const title = payload.title || 'LifeGate';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.png',
    badge: payload.badge || '/badge.png',
    image: payload.image || undefined,
    data: payload.data || {},
    tag: payload.data?.type || 'lifegate',   // collapses same-type notifs
    renotify: true,
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    await syncBadgeFromNotifications();
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const caseId = data.caseId || data.diagnosisId;

  // Navigate to the relevant case or fall back to the app root.
  const url = caseId
    ? `${self.location.origin}/(tab)/diagnosis/${caseId}`
    : self.location.origin;

  event.waitUntil((async () => {
    await syncBadgeFromNotifications();

    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an existing window if one is open.
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    // Otherwise open a new window.
    if (clients.openWindow) {
      return clients.openWindow(url);
    }
  })());
});

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(syncBadgeFromNotifications());
});
