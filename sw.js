// sw.js — minimal Repflow service worker.
// Network-first for HTML/JSX/CSS (so deploys land instantly when online),
// cache-first for fonts and the icon (which never change).
// Skips API routes entirely so the AI rail and enrollment never get cached.

const CACHE = "repflow-v1";
const PRECACHE = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;            // pass-through cross-origin
  if (url.pathname.startsWith("/api/")) return;                // API never cached
  if (url.pathname.startsWith("/rest/")) return;
  if (event.request.method !== "GET") return;

  // Network-first with offline fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match("/")))
  );
});
