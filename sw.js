/* ============================================================
   Michi — service worker

   Deployment / cache strategy
   ----------------------------
   1. `BUILD_ID` version bump. Every deploy bumps the cache name so
      the old cache is purged during `activate`. Kept explicit and
      automatic: `scripts/bump-version.sh` rewrites it before a push,
      and index.html/manifest reference the same stamp via `?v=`.
   2. Navigation + app shell (index.html, app.js, style.css,
      manifest.json, icons): NETWORK-FIRST with `cache: 'no-cache'`.
      This revalidates against GitHub Pages on every load, so the
      site's 10-minute HTTP cache never serves a stale shell — a push
      is visible on the next visit without clearing caches or
      reinstalling the app. Falls back to cache when offline.
   3. Data files: also NETWORK-FIRST, so a content correction reaches
      the learner on the next visit (accuracy matters more than speed here).
   4. Cache keys are normalised (query strings like `?v=4` stripped),
      so versioned asset URLs still resolve offline and the SW can be
      updated in place without leaving orphaned entries.
   ============================================================ */

const BUILD_ID = 'v4';
const CACHE_NAME = 'michi-' + BUILD_ID;

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './data/index.json',
  './data/flex.json',
  './data/patterns.json',
  './data/pack_signs.json',
  './data/pack_places.json',
  './data/pack_food.json',
  './data/pack_talk.json',
  './data/pack_drive.json',
  './data/pack_grocery.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Relative paths resolved against the SW scope, so this also works when
// the app is hosted under a sub-path (github.io/<repo>/).
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.replace(/\/$/, '') || '/';
const SHELL_PATHS = new Set([
  scopePath,
  scopePath + '/index.html',
  scopePath + '/style.css',
  scopePath + '/app.js',
  scopePath + '/manifest.json',
  scopePath + '/icons/icon-180.png',
  scopePath + '/icons/icon-192.png',
  scopePath + '/icons/icon-512.png'
]);
const DATA_PATHS = new Set(PRECACHE_ASSETS
  .filter(p => p.startsWith('./data/'))
  .map(p => new URL(p, self.registration.scope).pathname));

// Strip ?v= cache-busters so cached and requested URLs always line up.
function cacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function handleRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return fetch(request);
  const key = cacheKey(request);
  const isNavigate = request.mode === 'navigate';
  const isShell = SHELL_PATHS.has(url.pathname) || DATA_PATHS.has(url.pathname);
  
  if (isNavigate || isShell) {
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response && response.status === 200) {
        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(key, copy);
      }
      return response;
    } catch (err) {
      const cached = await caches.match(key);
      if (cached) return cached;
      const fallback = await caches.match(scopePath + '/index.html');
      if (fallback) return fallback;
      return caches.match(scopePath);
    }
  }

  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(handleRequest(event.request));
});
