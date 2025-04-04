// Increment version number for updates
const CACHE_NAME = 'pa-core-v3';
const urlsToCache = [
    '/', // Cache the root URL (often resolves to index.html)
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'icon-192.png', // Cache your icons
    'icon-512.png'
    // Add other static assets if needed
];

// Install event: Cache static assets
self.addEventListener('install', event => {
    console.log('[SW] Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                 console.error("[SW] Failed to cache resources during install:", err);
            })
            .then(() => {
                // Force the waiting service worker to become the active service worker.
                return self.skipWaiting();
            })
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activate event');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            // Tell the active service worker to take control of the page immediately.
            return self.clients.claim();
        })
    );
});

// Fetch event: Serve cached assets first (Cache-First Strategy)
self.addEventListener('fetch', event => {
    // console.log('[SW] Fetch event for:', event.request.url); // Can be noisy
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    // console.log('[SW] Serving from cache:', event.request.url);
                    return response;
                }
                // Not in cache - fetch from network
                // console.log('[SW] Fetching from network:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // Optional: Cache dynamic requests if needed carefully
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error("[SW] Fetch failed:", error);
                    // Optional: Return a basic offline fallback page
                    // return caches.match('/offline.html');
                    // Or just let the browser handle the error
                });
            })
    );
});