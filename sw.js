const CACHE_NAME = "cancionero-tuna-derecho-v10";
const ASSETS_TO_CACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Los datos privados del cancionero se guardan por usuario desde index.html,
  // no en la caché pública del Service Worker.
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

async function stripRedirectFlag(response) {
  if (!response || !response.redirected) return response;
  const body = await response.clone().arrayBuffer();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    const clean = await stripRedirectFlag(response);
    if (clean && clean.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/', clean.clone());
      await cache.put(request, clean.clone());
    }
    return clean;
  } catch (err) {
    return (await caches.match(request)) || (await caches.match('/')) ||
      new Response('Sin conexión y sin una versión guardada todavía.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request).then(async (response) => {
    const clean = await stripRedirectFlag(response);
    if (clean && clean.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, clean.clone());
    }
    return clean;
  }).catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;
  return (await caches.match('/')) || new Response('Sin conexión.', { status: 503 });
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: "¡Aúpa Tuna!", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "¡Aúpa Tuna!";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "cancionero-tuna",
    renotify: true,
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        client.navigate?.(target);
        return client.focus();
      }
    }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
