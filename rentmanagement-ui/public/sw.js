const CACHE_NAME = 'rent-mgmt-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'logisync_rent_logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).catch(() => {
        // Fallback or offline support
      });
    })
  );
});
