// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Raidex web push service worker.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'Raidex';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: new URL('appicon.svg', self.location).href,
      badge: new URL('favicon.png', self.location).href,
      data: data.data || {},
      tag: (data.data && data.data.type) || 'raidex',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const base = self.location.pathname.replace(/sw\.js$/, '');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow(base);
    }),
  );
});
