/*
 * License Notice Dual-UX - GNU Affero General Public License
 *
 * This file is part of Dual-UX.
 *
 * Dual-UX is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Dual-UX is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with Dual-UX. If not, see <https://www.gnu.org/licenses/>.
 */

/* global workbox */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.6.0/workbox-sw.js');

// ---- Version your caches here ----
const APP_SHELL = 'app-shell-v1';
const WEB_PAGES = 'web-pages-v1';
const STATIC_ASSETS = 'static-v1';
const IMAGES = 'images-v1'; 
const FONTS = 'fonts-v1';
const API = 'api-v1';

// ---- Precache the minimal app shell for offline /app entry ----
workbox.precaching.precacheAndRoute([
  { url: '/index.html', revision: 'v1' },
  { url: '/manifest.json', revision: 'v1' },

  // CSS
  { url: '/assets/css/style.css', revision: 'v1' },

  // Icons
  { url: '/assets/icons/icon-192.png', revision: 'v1' },
  { url: '/assets/icons/icon-512.png', revision: 'v1' },

  // Screenshots
  { url: '/assets/screenshots/app.png', revision: 'v1' },
  { url: '/assets/screenshots/website.png', revision: 'v1' },

  // JS bundles
  { url: '/js/dualux.runtime.js', revision: 'v1' },
  { url: '/js/pwa-install.bundle.js', revision: 'v1' }
], {
  ignoreURLParametersMatching: [/./],
});

// ---- Navigation fallback: only for /app ----
workbox.routing.registerRoute(
  ({ request, url }) => request.mode === 'navigate' && url.pathname.startsWith('/app'),
  new workbox.strategies.NetworkFirst({
    cacheName: APP_SHELL,
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 50 }),
    ],
  })
);

workbox.routing.registerRoute(
  ({ request, url }) => request.mode === 'navigate' && url.pathname === '/app',
  new workbox.strategies.NetworkFirst({ cacheName: APP_SHELL })
);

// ---- Public/SEO HTML pages ----
workbox.routing.registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/app'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: WEB_PAGES,
  })
);

// ---- Static JS/CSS ----
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: STATIC_ASSETS,
  })
);

// ---- Images ----
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: IMAGES,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

// ---- Fonts ----
workbox.routing.registerRoute(
  ({ request, url }) =>
    request.destination === 'font' ||
    url.pathname.match(/\.(?:woff2?|ttf|otf)$/),
  new workbox.strategies.CacheFirst({
    cacheName: FONTS,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  })
);

// ---- API / JSON data (optional) ----
workbox.routing.registerRoute(
  ({ url }) => url.pathname.endsWith('.json') || url.pathname.startsWith('/api/'),
  new workbox.strategies.NetworkFirst({
    cacheName: API,
    networkTimeoutSeconds: 3,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  })
);
