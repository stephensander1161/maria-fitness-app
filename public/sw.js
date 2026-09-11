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

/**
 * A push arrives with no payload on purpose.
 *
 * Nothing about anybody passes through Apple's or Google's push service — the
 * envelope is empty and always has been. What changed is that there is now
 * more than one thing a notification can be about, so instead of baking the
 * only wording into this file, the worker asks the app over its own session
 * and shows what comes back. The push service still sees nothing.
 *
 * The fallback is the weigh-in wording: it is the notification this app sent
 * for its whole life so far, and a woken device that says nothing at all is
 * worse than one that says the likely thing.
 */
const FALLBACK = {
  title: "Time to weigh in",
  body: "Ten seconds on the scale. No single reading is judged.",
  url: "/progress",
  tag: "coach-weigh-in",
};

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let say = FALLBACK;
      try {
        const res = await fetch("/api/push/pending", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.title) say = data;
        }
      } catch {
        // Offline, or the session has gone. Show the likely thing.
      }
      await self.registration.showNotification(say.title, {
        body: say.body,
        icon: "/icon-192",
        badge: "/icon-192",
        // One of a kind replaces the last rather than stacking up a column of
        // them after a few days away.
        tag: say.tag || FALLBACK.tag,
        renotify: true,
        data: { url: say.url || FALLBACK.url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/progress";
  event.waitUntil(
    (async () => {
      // Focus the app if it is already open — opening a second window for an
      // installed app is the thing that makes a PWA feel like a web page.
      for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
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
