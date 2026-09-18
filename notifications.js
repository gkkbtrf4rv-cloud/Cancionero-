// Avisos por dispositivo. Dar permiso no equivale a quedar registrado.
let vapidPublicKey = null;
let notificationOperation = false;

function pushSupported() {
  return window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}
function urlBase64ToUint8Array(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function sameKey(sub) {
  try {
    const a = new Uint8Array(sub.options.applicationServerKey || []), b = urlBase64ToUint8Array(vapidPublicKey);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  } catch { return false; }
}
function notificationTimeout(promise, message, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
async function notificationFetch(url, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok !== true) throw new Error(d.error || 'No se pudo confirmar el registro. Reintenta con conexión.');
    return d;
  } finally { clearTimeout(timer); }
}
async function prepareNotifications() {
  const [config, reg] = await Promise.all([
    notificationFetch('/api/subscribe'),
    notificationTimeout(navigator.serviceWorker.ready, 'No se pudo preparar la app. Recarga e inténtalo de nuevo.')
  ]);
  if (typeof config.publicKey !== 'string' || urlBase64ToUint8Array(config.publicKey).length !== 65) throw new Error('La configuración de avisos del servidor no es válida.');
  vapidPublicKey = config.publicKey;
  return reg;
}
async function syncSubscription(sub) {
  return notificationFetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ subscription: sub, publicKey: vapidPublicKey, device: deviceInfo() }) });
}
function notificationButton(label, enabled = true) {
  btnNotificaciones.textContent = label;
  btnNotificaciones.disabled = !enabled;
  btnNotificaciones.style.display = 'block';
}
function notificationPrerequisites() {
  btnNotificaciones.style.display = 'none';
  btnNotificaciones.disabled = false;
  if (!currentUser?.approved) {
    statusNotif(currentUser ? 'Tu cuenta debe ser autorizada antes de activar avisos.' : 'Inicia sesión para activar avisos en este dispositivo.');
    notificationButton(currentUser ? '⏳ Esperando autorización' : '👤 Iniciar sesión', !currentUser);
    return false;
  }
  // Safari sin instalar puede no exponer Notification ni PushManager.
  if (isIOS && !isStandalone()) {
    statusNotif('Para recibir avisos en iPhone o iPad (iOS/iPadOS 16.4 o posterior): abre en Safari → Compartir → Añadir a pantalla de inicio. Después abre el Cancionero desde su icono.');
    return false;
  }
  if (!pushSupported()) {
    statusNotif('Este navegador no permite notificaciones. Puedes seguir consultando el cancionero y sus actualizaciones al abrirlo.');
    return false;
  }
  if (Notification.permission === 'denied') {
    statusNotif('Los avisos están bloqueados. Habilítalos en los ajustes de notificaciones de esta app o en los permisos del sitio y vuelve aquí.');
    return false;
  }
  if (!navigator.onLine) {
    statusNotif('Sin conexión: no se pudo comprobar el registro de avisos. Puedes consultar la copia guardada del cancionero.');
    return false;
  }
  return true;
}
async function actualizarNotificaciones() {
  if (notificationOperation || !notificationPrerequisites()) return;
  notificationOperation = true;
  try {
    notificationButton('Comprobando avisos…', false);
    const reg = await prepareNotifications(), sub = await reg.pushManager.getSubscription();
    if (Notification.permission === 'granted' && sub && sameKey(sub)) {
      await syncSubscription(sub);
      btnNotificaciones.style.display = 'none';
      statusNotif('✅ Este dispositivo está registrado para recibir avisos de cambios en el repertorio.');
    } else {
      statusNotif(sub ? 'La configuración cambió. Toca para renovar los avisos en este dispositivo.' : 'Activa los avisos de cambios en el repertorio en cada dispositivo que uses.');
      notificationButton(sub ? '🔔 Renovar avisos' : '🔔 Activar notificaciones');
    }
  } catch (err) {
    statusNotif(`No se confirmó el registro de avisos: ${err.name === 'AbortError' ? 'el servidor tardó demasiado.' : err.message}`);
    notificationButton('🔔 Reintentar activación');
  } finally { notificationOperation = false; }
}
async function activarNotificaciones() {
  if (!currentUser) { authModal.classList.add('open'); return; }
  if (notificationOperation || !notificationPrerequisites()) return;
  notificationOperation = true;
  notificationButton('Activando avisos…', false);
  try {
    // Se solicita inmediatamente desde el toque, antes de esperar red o SW.
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      statusNotif(permission === 'denied' ? 'Avisos bloqueados. Puedes habilitarlos en los ajustes del dispositivo o del sitio.' : 'No se activaron los avisos. Puedes intentarlo cuando quieras.');
      if (permission === 'denied') btnNotificaciones.style.display = 'none';
      else notificationButton('🔔 Activar notificaciones');
      return;
    }
    const reg = await prepareNotifications();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub)) {
      if (!await sub.unsubscribe()) throw new Error('No se pudo renovar la suscripción anterior. Reintenta.');
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    await syncSubscription(sub);
    btnNotificaciones.style.display = 'none';
    statusNotif('✅ Este dispositivo está registrado para recibir avisos de cambios en el repertorio.');
  } catch (err) {
    statusNotif(`No se confirmó el registro de avisos: ${err.name === 'AbortError' ? 'el servidor tardó demasiado.' : err.message}`);
    notificationButton('🔔 Reintentar activación');
  } finally { notificationOperation = false; }
}
async function desconectarAvisos() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(), sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    // Se desactiva localmente incluso cuando el servidor no está disponible.
    await sub.unsubscribe();
    await notificationFetch('/api/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ subscription: sub }) }).catch(() => {});
  } catch (err) { console.warn('No se pudo desactivar el registro local de avisos.', err.name); }
}
