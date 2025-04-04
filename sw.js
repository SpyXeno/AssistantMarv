const CACHE_NAME = 'pa-core-v1'; // Change version if you update assets
const urlsToCache = [
    '/', // Cache the root URL (index.html)
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'icon-192.png', // Cache your icons
    'icon-512.png'
    // Add other static assets if needed (e.g., fonts)
];

// Install event: Cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                 console.error("Failed to cache resources during install:", err);
            })
    );
     self.skipWaiting(); // Activate worker immediately
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
     .then(() => self.clients.claim()) // Take control of clients immediately
  );
});


// Fetch event: Serve cached assets first (Cache-First Strategy)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // Not in cache - fetch from network
                 return fetch(event.request).then(
                     networkResponse => {
                         // Optional: Cache dynamic requests if needed (be careful)
                         // Example: Cache API responses (use cautiously)
                         // if (event.request.url.includes('generativelanguage.googleapis.com')) {
                         //     // Clone response to use in cache and return to browser
                         //     let responseToCache = networkResponse.clone();
                         //     caches.open(CACHE_NAME)
                         //         .then(cache => {
                         //             cache.put(event.request, responseToCache);
                         //         });
                         // }
                         return networkResponse;
                     }
                 ).catch(error => {
                     console.error("Fetch failed; returning offline page or error.", error);
                     // Optional: Return a basic offline fallback page
                     // return caches.match('/offline.html');
                 });
            })
    );
});