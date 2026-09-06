const CACHE_NAME = "cancionero-tuna-derecho-v12";
const UPDATE_MARKER_URL = "/__cancionero_update_marker__";
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

  // Los datos privados del cancionero se guardan por usuario desde index.html.
  if (url.pathname.startsWith('/api/')) return;

  // Para no gastar datos en cada apertura, la app usa primero la copia local.
  // La comprobación de una versión nueva se hace una sola vez al día desde index.html.
  if (event.request.mode === 'navigate') {
    event.respondWith(cacheFirstPage(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
  }
});

async function cacheFirstPage(request) {
  const cached = (await caches.match(request)) || (await caches.match('/'));
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/', response.clone());
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Sin conexión y sin una versión guardada todavía.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Sin conexión.', { status: 503 });
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
    tag: data.kind === 'content-update' ? 'cancionero-update' : 'cancionero-tuna',
    renotify: true,
    data: { url: data.url || "/", kind: data.kind || null, version: data.version || null }
  };

  event.waitUntil((async () => {
    // Si el push corresponde a una versión nueva, dejamos una marca LOCAL.
    // Así la próxima apertura puede forzar la descarga aunque la actualización
    // diaria ya se hubiera realizado antes de que el administrador publicara cambios.
    if (data.kind === 'content-update' && data.version) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(UPDATE_MARKER_URL, new Response(JSON.stringify({
          version: data.version,
          receivedAt: new Date().toISOString()
        }), { headers: { 'Content-Type': 'application/json' } }));
      } catch (err) {
        console.warn('No se pudo guardar la marca de actualización:', err);
      }
    }
    await self.registration.showNotification(title, options);
  })());
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
