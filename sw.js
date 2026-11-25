/* Offline support for the Kanazawa trip map.
   App files: network first (so updates show), cached copy when offline.
   Map tiles, fonts, libraries, photos: cached on first use or by "Save for offline".
   Weather: always live (the page keeps its own last forecast). */
const CACHE = 'kanazawa-v1';
const CORE = [
  './', './index.html', './places.json', './icon.png', './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, {mode: u.startsWith('http') ? 'cors' : 'same-origin'})).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('open-meteo.com')) return; // weather stays live

  const same = url.origin === self.location.origin;
  if (same || req.mode === 'navigate') {
    // network first, fall back to cache
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await timeout(fetch(req), 5000);
        if (res && res.ok) c.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
        return res;
      } catch (err) {
        return (await c.match(req, {ignoreSearch: true})) || (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // everything else: cache first, then network (and keep a copy)
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, {ignoreVary: true});
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
