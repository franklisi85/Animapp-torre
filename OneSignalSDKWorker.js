importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data;
    if (data && data.view) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
                // Notifica tutti i client aperti di navigare
                clientList.forEach(client => {
                    client.postMessage({ type: 'NAVIGATE_TO', view: data.view });
                });
            })
        );
    }
}, true);
