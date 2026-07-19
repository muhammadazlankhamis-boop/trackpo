// TRACKPO Service Worker
const CACHE_NAME = 'trackpo-v1';
const STATIC_ASSETS = [
  '/login.html',
  '/css/theme.css',
  '/css/style.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first — always get fresh data from Supabase
self.addEventListener('fetch', event => {
  // Skip Supabase API calls — must always be fresh
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request)
    )
  );
});
