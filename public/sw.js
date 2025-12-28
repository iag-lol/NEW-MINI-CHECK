// Service Worker for Push Notifications
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activated');
    event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('Push notification received:', event);

    let data = {
        title: 'Nueva notificación',
        body: 'Tienes una nueva actualización',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: { url: '/aseo' }
    };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.error('Error parsing push data:', e);
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/badge-72.png',
        vibrate: data.vibrate || [200, 100, 200],
        tag: data.tag || 'aseo-notification',
        requireInteraction: true,
        data: data.data || {}
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/aseo';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if there's already a window open
                for (const client of clientList) {
                    if (client.url.includes('/aseo') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if none exists
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event);
});
