const CACHE_NAME = "cancionero-tuna-derecho-v3";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Instalación: precachea el shell de la app
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activación: limpia caches antiguos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: siempre devuelve una Response válida, nunca undefined
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  try {
    const cached = await caches.match(request);

    if (cached) {
      // Ya hay copia local: la servimos de inmediato y actualizamos en segundo plano
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
          }
        })
        .catch(() => {
          // sin conexión: no pasa nada, ya servimos la versión cacheada
        });
      return cached;
    }

    // No hay copia local todavía: vamos a la red
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Última salida: si es una navegación, intenta servir el index cacheado
    const fallbackIndex = await caches.match("/index.html") || await caches.match("/");
    if (fallbackIndex) return fallbackIndex;

    return new Response(
      "Sin conexión y sin versión guardada de esta página todavía.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}
