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
