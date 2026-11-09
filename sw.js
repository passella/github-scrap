const CACHE_NAME = 'github-scrap-shell-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './favicon.svg',
  './manifest.json',
  './src/domain/repo-parser.js',
  './src/domain/text-formatter.js',
  './src/domain/file-classifier.js',
  './src/adapters/i18n.js',
  './src/adapters/github-client.js',
  './src/adapters/zip-encoder.js',
  './src/adapters/export-worker.js',
  './src/adapters/storage-adapter.js',
  './src/adapters/tree-cache-adapter.js',
  './src/adapters/crypto-adapter.js',
  './src/adapters/dom-controller.js',
];

const PRECACHE_ASSETS = APP_SHELL_ASSETS;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.hostname === 'api.github.com' ||
    url.hostname === 'raw.githubusercontent.com' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
