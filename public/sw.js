self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Broad Oak Build';
  const options = {
    body: data.body || 'Your shift schedule has been updated.',
    icon: '/logo-192.png',
    badge: '/logo-72.png'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
