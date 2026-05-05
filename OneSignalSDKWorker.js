importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data;
    const view = data && data.view ? data.view : null;
    if (!view) return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Se c'è già una finestra aperta: manda messaggio diretto
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE_TO', view });
                    return;
                }
            }
            // Nessuna finestra aperta: apri con hash nell'URL
            return clients.openWindow(`https://torreserenalogistic26.netlify.app/#view=${view}`);
        })
    );
}, true);
