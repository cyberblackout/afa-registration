const CACHE_VERSION = 'v3';

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) { return name !== CACHE_VERSION; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('push', function (event) {
  const data = event.data?.json() || { title: 'MTN AFA Portal', body: '' };
  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: data.data || {},
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/dashboard';
  // Only allow same-origin paths to prevent open redirect
  const url = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/dashboard';
  event.waitUntil(clients.openWindow(url));
});
