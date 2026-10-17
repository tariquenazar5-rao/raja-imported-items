// Service Worker for Raja One Stop Shop PWA
// 202610171712 is replaced with a unique build timestamp at deploy time,
// so every deploy gets a fresh cache and users NEVER need to clear cache manually.
const CACHE_NAME = 'raja-store-pwa-202610171718';
const BASE = '/raja-imported-items';
const PRECACHE_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/pwa-192x192.png',
  BASE + '/pwa-512x512.png',
  BASE + '/apple-touch-icon.png'
];

// Install event - precache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('Pre-caching partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event - delete ALL old caches (any version), then claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network-first with cache fallback.
// HTML navigations ALWAYS try network first (no stale app shell).
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For API or WebSocket calls, let them pass through
  if (url.pathname.startsWith('/api') || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Never cache Firestore / Firebase / Google API calls
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Cache successful same-origin GET responses for offline use
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match(BASE + '/index.html');
          }
        });
      })
  );
});
