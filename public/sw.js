// PRECACHE_REVISION is derived from the precached files; `node scripts/sw-revision.mjs`
// rewrites it, and test/pwa.test.js fails while it is stale. Changing it changes this
// file's bytes, which is what makes browsers install the new worker after a deploy.
const PRECACHE_REVISION = '75c18a61d7d4';
const CACHE_PREFIX = 'live-beat-';
const CACHE_NAME = `${CACHE_PREFIX}${PRECACHE_REVISION}`;
const RUNTIME_CACHE_NAME = `${CACHE_PREFIX}runtime`;
const OFFLINE_FALLBACK_URL = '/';
const PLAY_URL = '/play';

// Only URLs that the host serves without a redirect ("/play", not "/play.html").
// WAV loops are intentionally not precached (too large); they are cached at runtime.
const PRECACHE_URLS = [
  '/',
  '/play',
  '/fonts.css',
  '/tokens.css',
  '/components.css',
  '/style.css',
  '/fonts/zen-maru-gothic-500.woff2',
  '/fonts/zen-maru-gothic-700.woff2',
  '/library-app.js',
  '/play-app.js',
  '/register-sw.js',
  '/js/timing.js',
  '/js/ring.js',
  '/js/pad-map.js',
  '/js/sound-picker.js',
  '/js/pack-schema.js',
  '/js/audio-engine.js',
  '/js/recorder.js',
  '/packs/catalog.json',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const IS_DEV = DEV_HOSTNAMES.has(self.location.hostname);

// Safari fails navigations answered with a redirected response, so never store one.
const isCacheable = (response) =>
  response.ok && !response.redirected && response.type === 'basic';

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PRECACHE_URLS.map(async (url) => {
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!isCacheable(response)) {
      throw new Error(`Precache failed for ${url}: ${response.status}`);
    }
    await cache.put(url, response);
  }));
}

async function deleteOldCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(CACHE_PREFIX)
      && name !== CACHE_NAME && name !== RUNTIME_CACHE_NAME)
    .map((name) => caches.delete(name)));
}

async function putInCache(cacheName, request, response) {
  if (isCacheable(response)) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  }
}

const navigationFallback = (url) =>
  url.pathname === PLAY_URL || url.pathname === `${PLAY_URL}.html`
    ? PLAY_URL
    : OFFLINE_FALLBACK_URL;

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    await putInCache(CACHE_NAME, request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true })
      ?? (fallbackUrl ? await caches.match(fallbackUrl) : undefined);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// Sound assets are immutable: serve from cache if present, otherwise fetch and store once.
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  await putInCache(cacheName, request, response.clone());
  return response;
}

function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const refreshed = fetch(request).then(async (response) => {
    await putInCache(cacheName, request, response.clone());
    return response;
  });
  event.waitUntil(refreshed.catch(() => undefined));
  return caches.match(request).then((cached) => cached ?? refreshed);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/sw.js') {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, navigationFallback(url)));
    return;
  }
  // Audio loops: immutable, so serve from cache after the first listen (cache-first).
  // Range requests (206) are not cacheable, so let the browser handle them directly.
  if (url.pathname.endsWith('.wav')) {
    if (request.headers.has('range')) {
      return;
    }
    event.respondWith(cacheFirst(request, RUNTIME_CACHE_NAME));
    return;
  }
  // On localhost, always prefer fresh files so edits show up on the next reload.
  event.respondWith(IS_DEV ? networkFirst(request) : staleWhileRevalidate(event, CACHE_NAME));
});
