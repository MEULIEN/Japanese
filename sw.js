/* ============================================================
   Michi — service worker (offline-first)
   ------------------------------------------------------------
   Install: precache the app shell AND every data file listed in
   data/index.json, so the whole curriculum works offline after the first
   visit (the list is read from the index, never hard-coded, so adding a
   topic file needs no change here).
   Fetch: network-first with a short timeout for same-origin files, so a
   content correction reaches the learner on the next online visit; when
   offline (or slow), the cached copy is served. Query strings (?v=) are
   ignored for cache keys. Bump BUILD_ID (scripts/bump-version.sh) per deploy.
   ============================================================ */
const BUILD_ID = 'v8';
const CACHE = 'michi-' + BUILD_ID;
const SHELL = ['./', './index.html', './style.css', './manifest.json',
  './js/policy.js', './js/calendar.js', './js/kana.js', './js/answer.js', './js/conjugate.js', './js/srs.js',
  './js/curriculum.js', './js/exercises.js', './js/planner.js', './js/store.js', './js/progress.js', './js/speech.js',
  './js/kanji.js', './js/engine.js', './js/app.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './data/index.json'];

async function dataFiles() {
  const r = await fetch('./data/index.json', { cache: 'no-cache' });
  const idx = await r.json();
  return [idx.topics, idx.grammar, idx.conjugation, idx.recovery, idx.milestones, idx.synonyms, idx.kanji].concat(idx.items || []).filter(Boolean).map(f => './data/' + f);
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await cache.addAll(await dataFiles());
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const keyOf = req => { const u = new URL(req.url); u.search = ''; return u.href; };
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // the app makes no cross-origin requests
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
      if (res && res.ok) cache.put(keyOf(req), res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(keyOf(req));
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match(new URL('./index.html', self.registration.scope).href)) || Response.error();
      return Response.error();
    }
  })());
});
