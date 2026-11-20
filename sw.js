/* Service worker d'Aldo Ciné : l'application s'ouvre même hors connexion.
   - pages : réseau d'abord, copie en cache en secours ;
   - fichiers du site : réseau d'abord, cache en secours ;
   - affiches TMDB : cache d'abord (limité à 400 images) ;
   - /api : jamais mis en cache. */
const VERSION = "aldo-cine-v4";
const SHELL = ["/", "/assets/app.css", "/assets/app.js", "/assets/wrapped.js", "/assets/effects.js", "/assets/wrapped-link.js", "/manifest.json", "/icons/icon.svg", "/icons/icon-192.png"];
const IMAGES = "aldo-cine-images";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMAGES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimImages() {
  const cache = await caches.open(IMAGES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - 400; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "image.tmdb.org") {
    event.respondWith(caches.open(IMAGES).then(async cache => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok || response.type === "opaque") { cache.put(request, response.clone()); trimImages(); }
      return response;
    }));
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => { const copy = response.clone(); caches.open(VERSION).then(c => c.put("/", copy)); return response; })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Fichiers du site : réseau d'abord (toujours la dernière version), cache en secours hors connexion.
  event.respondWith(
    fetch(request)
      .then(response => { if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(c => c.put(request, copy)); } return response; })
      .catch(() => caches.match(request))
  );
});
