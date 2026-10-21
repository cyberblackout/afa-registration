/*
 * MTN AFA Portal service worker.
 *
 * Strategies:
 *  - Navigations: network-first with offline fallback to the cached app shell.
 *  - <scope>/assets/* (content-hashed): cache-first — immutable after first fetch.
 *  - Same-origin static (manifest, favicon, etc.): stale-while-revalidate.
 *  - Cross-origin (Supabase, Paystack, fonts): pass-through, never cached.
 *
 * All paths are resolved against the registration scope ('/' on Netlify,
 * '/afa-registration/' on the GH Pages mirror) so the same file works on
 * both deployments.
 */
const CACHE_VERSION = 'afa-shell-v5';
const BASE = new URL(self.registration.scope).pathname; // '/' or '/afa-registration/'
const SHELL_URLS = [BASE, BASE + 'manifest.json', BASE + 'favicon.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        // Tolerate individual precache misses (e.g. missing favicon on a fork).
        return Promise.all(
          SHELL_URLS.map(function (url) {
            return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) { return name !== CACHE_VERSION; })
            .map(function (name) { return caches.delete(name); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build assets are immutable — cache-first.
  if (url.pathname.startsWith(BASE + 'assets/')) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        });
      })
    );
    return;
  }

  // SPA navigations — network-first, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(BASE, copy);
              cache.put(BASE + 'index.html', copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(BASE + 'index.html').then(function (page) {
            return page || caches.match(BASE);
          }).then(function (page) {
            return page || Response.error();
          });
        })
    );
    return;
  }

  // Small same-origin static files — stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(function (cached) {
      const network = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});

self.addEventListener('push', function (event) {
  let data = { title: 'MTN AFA Portal', body: '' };
  try {
    data = event.data ? event.data.json() : data;
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body || '',
    icon: BASE + 'favicon.png',
    badge: BASE + 'favicon.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(data.title || 'MTN AFA Portal', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const rawUrl = event.notification.data && event.notification.data.url;
  // Only allow same-origin app paths to prevent open redirect. Payload paths
  // like '/cyberin/x' are app-relative: resolve them against the scope so the
  // GH Pages mirror navigates to '/afa-registration/cyberin/x', not the host root.
  let url = BASE + 'dashboard';
  if (typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    url = rawUrl.startsWith(BASE) ? rawUrl : BASE.replace(/\/$/, '') + rawUrl;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
