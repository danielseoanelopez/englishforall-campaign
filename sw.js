/* Rank Up City service worker — offline play + installable app.
   Bump CACHE on each deploy that changes precached assets. */
const CACHE = "rankup-v40";  // v19: A1 L4 family tree
const CORE = [
  "index.html", "lesson.html", "lesson.css", "assets/icons.css?v=1",
  "assets/fonts.css?v=1", "assets/brands.css?v=1", "assets/progress.js?v=2",
  "assets/fonts/press-start-2p-latin.woff2", "assets/fonts/share-tech-mono-latin.woff2",
  "city.html", "neon-cafe.html", "neon-office.html", "game.html", "cards.html", "manifest.json",
  "assets/game.js?v=4", "assets/game.css?v=2", "games/cafe.json", "games/office.json", "games/registry.json", "games/agency.json", "games/vault.json",
  "logo.webp", "bg-cafe.webp", "nebula.webp", "map-city.webp",
  "icon-192.png", "icon-rankup.png",
  "sprite-mia.webp", "sprite-jack.webp", "sprite-vera.webp", "sprite-vera-inspector.webp",
  "sprite-dan.webp", "sprite-totti.webp", "sprite-enri.webp",
  "item-flatwhite.webp", "item-latte.webp", "item-tea.webp", "item-juice.webp",
  "item-avotoast.webp", "item-bagel.webp", "item-muffin.webp", "item-cookie.webp"
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
  const isLessonData = /\/(lessons|games)\/[^/]+\.json$/.test(url.pathname);   // lesson and game content

  if (isHTML || isLessonData) {
    // network-first so new deploys always win when online
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match(
          /city|neon|game/.test(url.pathname) && !isLessonData ? "city.html" : "index.html")))
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
