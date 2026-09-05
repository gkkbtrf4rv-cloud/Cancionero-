const CACHE_NAME = "cancionero-tuna-derecho-v9";
const ASSETS_TO_CACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(handleFetch(event.request));
});

async function stripRedirectFlag(response) {
  if (!response || !response.redirected) return response;
  const body = await response.clone().arrayBuffer();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function handleFetch(request) {
  try {
    const cached = await caches.match(request);
    if (cached) {
      fetch(request).then(async (networkResponse) => {
        if (networkResponse?.ok) {
          const clean = await stripRedirectFlag(networkResponse);
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clean.clone()));
        }
      }).catch(() => {});
      return cached;
    }
    const networkResponse = await fetch(request);
    const clean = await stripRedirectFlag(networkResponse);
    if (clean?.ok) (await caches.open(CACHE_NAME)).put(request, clean.clone());
    return clean;
  } catch (err) {
    const fallbackIndex = await caches.match("/");
    if (fallbackIndex) return fallbackIndex;
    return new Response("Sin conexión y sin versión guardada de esta página todavía.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
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
