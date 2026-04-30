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
    icon: '/icon.png',
    badge: '/favicon.png',
    data: payload.data || {},
    tag: payload.data?.type || 'lifegate',   // collapses same-type notifs
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const caseId = data.caseId || data.diagnosisId;

  // Navigate to the relevant case or fall back to the app root.
  const url = caseId
    ? `${self.location.origin}/(tab)/diagnosis/${caseId}`
    : self.location.origin;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
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
      }),
  );
});
