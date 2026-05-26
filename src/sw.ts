/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// Activate new SW immediately so users aren't stuck on stale builds.
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// __WB_MANIFEST is injected at build time by vite-plugin-pwa (injectManifest mode).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  new NavigationRoute(async ({ event }) => {
    const url = new URL((event as FetchEvent).request.url);
    const skip =
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/reset-password') ||
      url.pathname.startsWith('/accept-invite');
    if (skip) return fetch((event as FetchEvent).request);
    const cache = await caches.match('/index.html');
    return cache ?? fetch((event as FetchEvent).request);
  }),
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  brandSlug?: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {
    title: 'Reinigungs-Portal',
    body: 'Neuer Vorgang',
  };
  try {
    if (event.data) {
      const parsed = event.data.json() as Partial<PushPayload>;
      payload = {
        title: parsed.title ?? payload.title,
        body: parsed.body ?? payload.body,
        url: parsed.url,
        tag: parsed.tag,
        brandSlug: parsed.brandSlug,
      };
    }
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  // `renotify` is missing from older TS NotificationOptions types.
  const options: NotificationOptions & Record<string, unknown> = {
    body: payload.body,
    icon: '/icon-app.svg',
    badge: '/icon-maskable.svg',
    tag: payload.tag,
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url ?? '/', brandSlug: payload.brandSlug },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const origin = self.location.origin;
      for (const client of all) {
        if (client.url.startsWith(origin)) {
          await client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(targetUrl);
            } catch {
              // cross-origin navigation not allowed
            }
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
