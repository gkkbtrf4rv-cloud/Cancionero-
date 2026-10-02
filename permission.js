(() => {
  const status = document.getElementById('permissionStatus');
  const modal = document.createElement('dialog');
  modal.id = 'permissionViewer';
  modal.setAttribute('aria-labelledby','permissionTitle');
  modal.innerHTML = '<div class="permission-toolbar"><strong id="permissionTitle">📄 Permiso de ensayo</strong><button type="button" id="permissionFullscreen">Pantalla completa</button><a id="permissionOpen" target="_blank" rel="noopener">Abrir documento</a><button type="button" id="permissionClose" aria-label="Cerrar permiso">✕</button></div><p id="permissionMessage" role="status"></p><div id="permissionContent"></div>';
  document.body.appendChild(modal);
  const style = document.createElement('style');
  style.textContent = '#permissionViewer{width:96vw;max-width:1100px;height:94dvh;max-height:96dvh;padding:14px;border:1px solid #d5ad5a;border-radius:18px;background:#171313;color:#f7f2e7}#permissionViewer::backdrop{background:#000c}.permission-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.permission-toolbar strong{flex:1}.permission-toolbar button,.permission-toolbar a{padding:10px;border:1px solid #d5ad5a;border-radius:9px;background:#311619;color:#f0d58e;font:14px sans-serif;cursor:pointer}#permissionContent{height:calc(100% - 100px);overflow:auto;background:white}#permissionContent iframe{width:100%;height:100%;border:0}#permissionContent img{display:block;width:100%;height:auto}#permissionViewer:fullscreen{width:100vw;height:100dvh;max-width:none;max-height:none;border-radius:0}';
  document.head.appendChild(style);
  let doc = null, objectUrl = null, generation = 0;
  const userKey = () => currentUser?.approved && token() ? currentUser.id : null;
  const cacheName = () => 'cancionero-permission-v1-' + userKey();
  function release() {
    document.getElementById('permissionContent').replaceChildren();
    document.getElementById('permissionOpen').removeAttribute('href');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  window.clearRehearsalPermission = async () => {
    generation++; doc = null; release(); if(modal.open) modal.close();
    status.textContent = 'Autorización · FES Acatlán';
    if ('caches' in window) { try { await Promise.all((await caches.keys()).filter(k => k.startsWith('cancionero-permission-v1-')).map(k => caches.delete(k))); } catch {} }
  };
  async function documentBlob() {
    if(!userKey() || !doc) throw new Error('Inicia sesión con una cuenta autorizada.');
    const epoch = generation, owner = userKey(), target = doc.url, name = cacheName();
    let cache = null, response = null;
    if('caches' in window) { try { cache = await caches.open(name); response = await cache.match(target); } catch {} }
    if(!response) {
      response = await fetch(target, { headers:authHeaders(), cache:'no-store' });
      if(!response.ok) {
        if(response?.status===401 || response.status===403) await window.clearRehearsalPermission();
        throw new Error(response.status===404 ? 'El permiso cambió. Conéctate y actualiza el Cancionero.' : 'No se pudo abrir el permiso. Revisa tu sesión o conexión.');
      }
      if(epoch !== generation || userKey() !== owner) throw new Error('La sesión cambió.');
      if(cache) { try { await cache.put(target,response.clone());
        for(const key of await cache.keys()) if(key.url !== new URL(target,location.origin).href) await cache.delete(key);
      } catch { cache = null; } }
    }
    const blob = await response.blob();
    if(epoch !== generation || userKey() !== owner) { if(cache && doc?.url !== target) await cache.delete(target).catch(() => {}); throw new Error('La sesión cambió.'); }
    status.textContent = cache ? 'Disponible sin conexión' : 'Disponible · requiere conexión';
    return blob;
  }
  window.setRehearsalPermission = async value => {
    if(doc?.version !== value?.version && objectUrl) release();
    generation++; doc = value || null;
    if(!doc) {
      release(); status.textContent = 'Pendiente de subir en administración';
      if('caches' in window && userKey()) await caches.delete(cacheName()).catch(() => {});
      return;
    }
    status.textContent = 'Guardando para usar sin conexión…';
    try { await documentBlob(); } catch { if(doc?.version !== value?.version) return; status.textContent = navigator.onLine ? 'Toca para abrir el permiso' : 'Sin copia offline · conecta para descargar'; }
  };
  document.getElementById('btnPermission').onclick = async () => {
    if(!userKey()) { document.getElementById('authModal').classList.add('open'); return; }
    modal.showModal(); release();
    const message = document.getElementById('permissionMessage');
    message.textContent = 'Cargando autorización…';
    try {
      if(navigator.onLine) {
        let response;
        try { response = await fetch('/api/cancionero?action=permission', {headers:authHeaders(),cache:'no-store'}); }
        catch(err) { if(!doc) throw err; }
        if(response?.status===401 || response?.status===403) { await window.clearRehearsalPermission(); throw new Error('Inicia sesión con una cuenta autorizada.'); }
        if(response && !response.ok) throw new Error('No se pudo comprobar el permiso vigente.');
        const data = response ? await response.json() : {permission:doc};
        if(data.permission?.version !== doc?.version) await window.setRehearsalPermission(data.permission);
      }
      if(!doc) { message.textContent = 'Todavía no hay hoja de autorización. El administrador puede subirla en “Permiso de ensayo”.'; return; }
      const version = doc.version;
      const blob = await documentBlob();
      if(!modal.open || doc?.version!==version || !userKey()) return;
      objectUrl = URL.createObjectURL(blob);
      const el = document.createElement(doc.mimeType==='application/pdf' ? 'iframe' : 'img');
      el.src = objectUrl; el.title = 'Hoja de autorización de ensayos'; el.alt = 'Hoja de autorización de ensayos';
      document.getElementById('permissionContent').appendChild(el);
      document.getElementById('permissionOpen').href = objectUrl;
      message.textContent = (navigator.onLine ? 'Autorización vigente' : 'Copia guardada sin conexión') + ' · ' + new Date(doc.updatedAt).toLocaleDateString('es-MX') + '. Si el PDF no se muestra, pulsa “Abrir documento”.';
    } catch(err) { message.textContent = err.message || 'Sin conexión y sin una copia guardada. Abre el permiso una vez con internet.'; }
  };
  document.getElementById('permissionClose').onclick = () => modal.close();
  modal.addEventListener('close',release);
  document.getElementById('permissionFullscreen').onclick = async () => {
    try { if(modal.requestFullscreen) await modal.requestFullscreen(); else if(objectUrl) window.open(objectUrl,'_blank','noopener'); }
    catch { if(objectUrl) window.open(objectUrl,'_blank','noopener'); }
  };
})();
