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
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(clients.openWindow(url));
});
