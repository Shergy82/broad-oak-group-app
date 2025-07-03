
// This is the service worker file for handling push notifications.

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.error('Push event but no data');
    return;
  }
  
  const data = event.data.json();
  const title = data.title || 'New Notification';
  const options = {
    body: data.body,
    icon: '/icon-192x192.png', // A default icon for the notification
    badge: '/badge-72x72.png', // A badge for the notification bar
    data: data.data, // Custom data to handle clicks
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Close the notification

  const urlToOpen = event.notification.data?.url || '/';

  // This opens the app to the specified URL or the root if none is specified.
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((clientList) => {
      // If a window for the app is already open, focus it.
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window.
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
