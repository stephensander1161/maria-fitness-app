/**
 * A deliberately small service worker.
 *
 * It exists for two reasons: Chrome will not offer to install the app without
 * one, and the build assets are worth not re-downloading on gym wifi.
 *
 * What it must never do is cache her data. Everything here is scoped to
 * content-hashed build output, which is immutable by construction. Documents,
 * RSC payloads and /api responses are passed straight through to the network:
 * they are per-account and often per-minute, and serving a stale one would
 * show her yesterday's numbers as today's — the same class of mistake as
 * summing an unknown as a zero, but harder to notice.
 */

const CACHE = "coach-static-v1";

// Content-hashed and immutable. A new build produces new URLs, so a stale
// entry is unreachable rather than wrong.
const isImmutable = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname === "/icon" ||
  url.pathname === "/icon-192" ||
  url.pathname === "/icon-512" ||
  url.pathname === "/apple-icon";

self.addEventListener("install", () => {
  // Nothing to precache: the asset URLs change every build, so a hard-coded
  // list would be wrong the moment it shipped.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!isImmutable(url)) return; // documents and /api go straight to the network

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Only store a clean, complete response. An opaque or partial one cached
      // here would break the page it belongs to on the next load.
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
