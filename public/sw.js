// This is the service worker file for handling push notifications.

// Listen for the 'push' event, which is triggered when the server sends a push message.
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.error('Push event but no data');
    return;
  }
  
  // The data from the server is a JSON string, so we parse it.
  const data = event.data.json();

  // Prepare the notification options from the received data.
  const title = data.title;
  const options = {
    body: data.body,
    icon: data.icon, // The server should provide a valid icon path
  };

  // The waitUntil promise keeps the service worker alive until the notification is shown.
  event.waitUntil(self.registration.showNotification(title, options));
});

// Listen for the 'notificationclick' event, which is fired when a user clicks on the notification.
self.addEventListener('notificationclick', (event) => {
  // Close the notification pop-up.
  event.notification.close();

  // This function tries to focus an existing window/tab for your app. 
  // If it can't find one, it opens a new one.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
