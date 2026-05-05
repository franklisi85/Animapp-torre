const CACHE_NAME = 'animapp-v37';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.js?v=4.27',
    '/style.css?v=16',
    '/sw.js',
    '/manifest.json',
    '/icona-animapp.png'
];

// Installa: pre-carica i file statici in cache
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Attivazione: elimina cache vecchie e ricarica tutti i client con i nuovi file
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then(clients => clients.forEach(client => client.navigate(client.url)))
    );
});

// Fetch: Cache First pura
// - Se il file è in cache → risponde subito, ZERO richieste a Netlify
// - Se non è in cache (primo avvio) → scarica da rete e mette in cache
// - Al deploy → CACHE_NAME cambia → vecchia cache eliminata → pagina ricaricata automaticamente
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                }
                return response;
            });
        })
    );
});
