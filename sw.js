/* Rank Up City service worker — offline play + installable app.
   Bump CACHE on each deploy that changes precached assets. */
const CACHE = "rankup-v1";
const CORE = [
  "city.html", "neon-cafe.html", "cards.html", "manifest.json",
  "logo.png", "bg-cafe.jpg", "nebula.jpg",
  "icon-192.png", "icon-rankup.png",
  "sprite-mia.png", "sprite-jack.png", "sprite-vera.png", "sprite-vera-inspector.png",
  "sprite-dan.png", "sprite-totti.png", "sprite-enri.png",
  "item-flatwhite.png", "item-latte.png", "item-tea.png", "item-juice.png",
  "item-avotoast.png", "item-bagel.png", "item-muffin.png", "item-cookie.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(CORE.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isHTML = req.mode === "navigate" || url.pathname.endsWith(".html");

  if (isHTML) {
    // network-first so new deploys always win when online
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match("city.html")))
    );
    return;
  }

  // assets (images, audio, fonts): cache-first, then network + cache
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const ok = res && res.status === 200;
        const cacheable = url.origin === location.origin || /gstatic|googleapis/.test(url.host);
        if (ok && cacheable) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
    })
  );
});
