const APP_CACHE = 'yople-app-shell-v5';
const IMAGE_CACHE = 'yople-images-v4';
const YOPLE_CACHE_PREFIX = 'yople-';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './yople-icon.svg', './행정법.txt'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith(YOPLE_CACHE_PREFIX) && ![APP_CACHE, IMAGE_CACHE].includes(name))
    .map(name => caches.delete(name)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  const isImage = requestUrl.pathname.includes('/images/');
  if (isImage) {
    event.respondWith(caches.open(IMAGE_CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(APP_CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request)));
});
