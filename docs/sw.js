// Bump on every deploy, or phones keep serving the old build.
const CACHE = "baseline-v2";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png", "icons/icon-512.png",
  "fonts/archivo-latin-wdth-normal.woff2", "fonts/archivo-latin-ext-wdth-normal.woff2",
  "fonts/instrument-sans-latin-wdth-normal.woff2", "fonts/instrument-sans-latin-ext-wdth-normal.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first so updates land quickly; cache when offline.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
