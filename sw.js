// (Keep the same sw.js content as in the previous response)
const CACHE_NAME = 'pa-core-v2'; // Increment cache version
const urlsToCache = [
    '/',
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'icon-192.png',
    'icon-512.png'
];
// ... rest of sw.js remains the same ...

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
     self.skipWaiting();
});
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Delete old caches
          }
        })
      );
    })
     .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) { return response; } // Cache hit
                return fetch(event.request).then(networkResponse => { // Network fetch
                    // Optional: Cache dynamic resources here if needed carefully
                    return networkResponse;
                 }).catch(error => {
                     console.error("Fetch failed:", error);
                     // Optional: return offline fallback page
                 });
            })
    );
});