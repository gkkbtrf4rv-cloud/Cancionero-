const CACHE_NAME = "cancionero-tuna-derecho-v85";
const UPDATE_MARKER_URL = "/__cancionero_update_marker__";
const ASSETS_TO_CACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // El cache-bust evita reutilizar una copia HTTP antigua del shell.
    const fresh = await fetch('/?app-shell=v85', { cache: 'no-store' });
    if (!fresh?.ok) throw new Error('No se pudo guardar el arranque.');
    await cache.put('/', fresh.clone());
    await cache.addAll(['/glass.js?v=84','/themes.js?v=81','/redesign.css?v=85','/offline.html','/offline-data.js?v=75','/permission.js?v=76','/attendance.js?v=74','/responsive.css?v=63','/safe-area.css?v=64','/site-footer.css?v=63','/site-footer.js?v=61']);
    await Promise.allSettled([
      cache.add(new Request('/assets/approved-design.webp?v=85', { cache: 'reload' })),
      cache.add(new Request('/assets/manizales-hero.webp?v=83', { cache: 'reload' })),
      cache.add(new Request('/manifest.json', { cache: 'reload' })),
      cache.add(new Request('/icon-192.png', { cache: 'reload' })),
      cache.add(new Request('/icon-512.png', { cache: 'reload' })),
      cache.add(new Request('/logo-tuna.webp', { cache: 'reload' })),
      ...['/asistencias.html','/attendance.js?v=69','/attendance-page.js?v=69','/attendance.css?v=69'].map(url=>cache.add(new Request(url,{cache:'reload'}))),
      cache.add(new Request('/attendance.js', { cache: 'reload' })),
      cache.add(new Request('/responsive.css?v=63', { cache: 'reload' })),
      cache.add(new Request('/permission.js?v=76', { cache: 'reload' })),
      cache.add(new Request('/safe-area.css?v=64', { cache: 'reload' })),
      cache.add(new Request('/responsive.css?v=65', { cache: 'reload' })),
      cache.add(new Request('/ia.html', { cache: 'reload' })),
      ...['/site-footer.css?v=63','/site-footer.js?v=61','/terminos.html','/privacidad.html'].map(url=>cache.add(new Request(url,{cache:'reload'})))
    ]);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('cancionero-tuna-derecho-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();

  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  // El administrador debe recibir sus controles actuales al conectarse.
  if (url.pathname.startsWith('/admin-assets/')) return;

  // El administrador es una página independiente. No debe recibir el shell de la app.
  if (event.request.mode === 'navigate') {
    if (url.pathname === '/reader.html') return;
    if (url.pathname === '/asistencias.html') { event.respondWith(cacheFirst(new Request(url.origin+url.pathname))); return; }
    if (['/ia.html','/terminos.html','/privacidad.html'].includes(url.pathname)) { event.respondWith(cacheFirst(event.request)); return; }
    if (url.pathname === '/admin.html' || url.pathname === '/admin') return;
    event.respondWith(cacheFirstPage(event.request));
    return;
  }
  if (url.origin === self.location.origin && ['/attendance.js','/attendance-page.js','/attendance.css'].includes(url.pathname)){event.respondWith((async()=>{try{const r=await fetch(event.request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE_NAME);await c.put(event.request,r.clone());return r;}return await cacheFirst(event.request);}catch{return cacheFirst(event.request);}})());return;}
  if (url.origin === self.location.origin) event.respondWith(cacheFirst(event.request));
});

async function cacheFirstPage(request) {
  try {
    const response=await fetch(request,{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw new Error('No disponible');
    return response;
  } catch {
    const cache=await caches.open(CACHE_NAME);
    return (await cache.match('/offline.html')) || (await cache.match('/')) || new Response('No hay una copia disponible. Abre el Cancionero con conexión desde este mismo icono.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
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
