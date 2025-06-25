// This is the service worker file.
// It runs in the background and listens for push notifications.

self.addEventListener('push', function(event) {
    if (!event.data) {
        console.error("Push event but no data");
        return;
    }

    try {
        const data = event.data.json();
        const options = {
            body: data.body,
            // You can add icons here later if you add them to the /public folder
            // icon: '/icon-192x192.png',
            // badge: '/badge-72x72.png',
            data: {
                url: data.url, // URL to open when notification is clicked
            },
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    } catch (e) {
        console.error('Error parsing push data:', e);
        // Fallback for plain text notifications
        const title = "New Notification";
        const options = {
            body: event.data.text(),
        };
        event.waitUntil(self.registration.showNotification(title, options));
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});
