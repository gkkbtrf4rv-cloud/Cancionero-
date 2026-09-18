const CACHE_NAME = 'cancionero-tuna-derecho-v52';
const META_CACHE = 'cancionero-notification-state-v1';
const UPDATE_MARKER_URL = '/__cancionero_update_marker__';
const STATIC_ASSETS = new Set(['/manifest.json', '/notifications.js', '/icon-192.png', '/icon-512.png', '/logo-tuna.webp']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(['/', ...STATIC_ASSETS].map(async path => {
      const response = await fetch(path, { cache: 'reload' });
      if (response.ok && !response.redirected) await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Conservar avisos pendientes antes de retirar los shells anteriores.
    const pending = await caches.match(UPDATE_MARKER_URL);
    if (pending) await (await caches.open(META_CACHE)).put(UPDATE_MARKER_URL, pending);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('cancionero-tuna-derecho-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    // No borrar portadas privadas ni recargar mientras se consulta una canción.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') event.respondWith(homePage(event.request));
    // /admin.html y otras rutas conservan sus propias respuestas.
    return;
  }
  if (STATIC_ASSETS.has(url.pathname)) event.respondWith(staticAsset(event.request));
});

async function homePage(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok && !response.redirected) await cache.put('/', response.clone());
    return response;
  } catch {
    return await cache.match('/') || new Response('Sin conexión. Abre el cancionero con internet una vez para guardar una copia.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
async function staticAsset(request) {
  const cache = await caches.open(CACHE_NAME), cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && !response.redirected) await cache.put(request, response.clone());
  return response;
}
function safeURL(value) {
  try {
    const url = new URL(value || '/', self.location.origin);
    if (url.origin === self.location.origin && ['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {}
  return self.location.origin + '/';
}
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || '' }; }
  if (!data || typeof data !== 'object') data = {};
  const update = data.kind === 'content-update' && typeof data.version === 'string';
  event.waitUntil((async () => {
    // Mostrar el aviso aunque falle el guardado local del marcador.
    const shown = self.registration.showNotification(data.title || 'Cancionero de Tuna', {
      body: data.body || 'Hay novedades en el cancionero.', icon: '/icon-192.png', badge: '/icon-192.png',
      tag: update ? `cancionero-update-${data.version}` : undefined,
      data: { url: safeURL(data.url), kind: data.kind || null, version: data.version || null }
    });
    if (update) {
      await (async () => {
        const cache = await caches.open(META_CACHE);
        await cache.put(UPDATE_MARKER_URL, new Response(JSON.stringify({ version: data.version, receivedAt: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } }));
      })().catch(() => {});
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach(client => client.postMessage({ kind: 'content-update', version: data.version }));
    }
    await shown;
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = safeURL(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing && 'navigate' in existing) {
      const navigated = await existing.navigate(target);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(target);
  })());
});
