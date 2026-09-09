/* eslint-env serviceworker */
/**
 * Birthday Bot service worker.
 *
 * BUILD_ID is stamped at build time by scripts/stamp-sw.mjs from a hash of the
 * BUILT APP, not of this file — a worker whose id only depends on itself never
 * changes when you ship a feature, so no browser ever installs the new one and
 * installed clients serve a stale shell forever.
 */
const BUILD_ID = "__BUILD_ID__";
const SHELL_CACHE = `birthday-shell-${BUILD_ID}`;

const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {}) // a failed precache must never block activation
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

/**
 * Fetch strategy. Two rules keep this from breaking the whole page:
 *   1. caching happens OUTSIDE the response path — `caches.open` can reject
 *      (private mode, storage denied, quota) and if that rejection lands inside
 *      the try-block, a request that already succeeded on the network turns into
 *      net::ERR_FAILED and the page renders unstyled with no explanation.
 *   2. respondWith never rejects: the fallback is Response.error(), so the
 *      browser shows its own network error instead of one we manufactured.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live

  const isNavigation = request.mode === "navigate";

  event.respondWith(
    (async () => {
      // Navigations: network first, so a deploy is picked up immediately.
      if (isNavigation) {
        try {
          const fresh = await fetch(request);
          stash(request, fresh);
          return fresh;
        } catch {
          const cached = (await safeMatch(request)) ?? (await safeMatch("/"));
          return cached ?? Response.error();
        }
      }

      // Static assets: cache first, they carry a content hash in the filename.
      const cached = await safeMatch(request);
      if (cached) return cached;

      try {
        const fresh = await fetch(request);
        stash(request, fresh);
        return fresh;
      } catch {
        return Response.error();
      }
    })(),
  );
});

function stash(request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  const copy = response.clone();
  caches
    .open(SHELL_CACHE)
    .then((cache) => cache.put(request, copy))
    .catch(() => {});
}

async function safeMatch(request) {
  try {
    return await caches.match(request);
  } catch {
    return undefined;
  }
}

/* ------------------------------ Web Push ------------------------------ */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Birthday Bot", body: event.data?.text() ?? "" };
  }

  const title = payload.title || "Birthday Bot";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      // Android renders the badge from its ALPHA CHANNEL alone, so this file is
      // a white glyph on transparent — an opaque icon here becomes a grey blob.
      badge: "/icons/badge-96.png",
      tag: payload.tag ?? "birthday",
      renotify: Boolean(payload.renotify),
      requireInteraction: false,
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
