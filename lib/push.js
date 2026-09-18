import crypto from 'node:crypto';
import webpush from 'web-push';
import { kv } from '@vercel/kv';

export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || '';
  if (!publicKey || !privateKey || !subject) throw new Error('Falta configurar las claves y el contacto de notificaciones en el servidor.');
  // Validar dentro de la solicitud evita que una configuración incompleta
  // impida siquiera consultar el estado o devolver un error legible.
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey };
}

export function requestOrigin(req) {
  const host = req.headers?.host;
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('Host no válido.');
  return new URL(`${host.startsWith('localhost:') ? 'http' : 'https'}://${host}`).origin;
}

export function deliveryScope(req) {
  return crypto.createHash('sha256').update(requestOrigin(req)).digest('hex').slice(0, 24);
}

export function localNotificationURL(value = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  return value.slice(0, 1500);
}

export async function removeSubscription(id, meta) {
  await kv.srem('subs:all', id);
  if (meta?.userId) await kv.srem(`user:${meta.userId}:subs`, id);
  await kv.del(`sub:${id}`, `submeta:${id}`);
}

export async function eligibleSubscription(id, origin) {
  const [sub, meta] = await Promise.all([kv.get(`sub:${id}`), kv.get(`submeta:${id}`)]);
  if (!sub) return { sub, meta, reason: 'Suscripción ausente' };
  // Una vista privada nunca debe enviar a los dispositivos de producción.
  // Las suscripciones antiguas se asocian al origen al volver a abrir la app.
  if (!meta?.userId || meta.origin !== origin) return { sub, meta, reason: 'Dispositivo pendiente de sincronizar en este sitio' };
  const user = await kv.get(`user:${meta.userId}`);
  if (user?.approved !== true) return { sub, meta, reason: 'Usuario sin acceso autorizado' };
  return { sub, meta, reason: null };
}

export async function sendPushBatch(req, payload, { receiptKey } = {}) {
  pushConfiguration();
  const origin = requestOrigin(req), ids = await kv.smembers('subs:all');
  const delivered = new Set(receiptKey ? await kv.smembers(receiptKey) : []);
  const result = { enviados: 0, fallidos: 0, eliminados: 0, omitidos: 0, huerfanos: 0, yaEnviados: 0, total: ids.length, details: [] };
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      let meta;
      try {
        const entry = await eligibleSubscription(id, origin);
        meta = entry.meta;
        const base = { id, mote: meta?.mote || 'Sin identificar', email: meta?.email || '—', at: new Date().toISOString() };
        if (!entry.sub) { await removeSubscription(id, meta); result.huerfanos++; continue; }
        if (entry.reason) { result.omitidos++; result.details.push({ ...base, status: 'omitido', error: entry.reason }); continue; }
        if (delivered.has(id)) { result.yaEnviados++; continue; }
        try {
          const response = await webpush.sendNotification(entry.sub, JSON.stringify(payload), { TTL: 86400, timeout: 8000 });
          if (receiptKey) await kv.sadd(receiptKey, id);
          result.enviados++;
          const status = { ...base, status: 'enviado', statusCode: response?.statusCode || 201 };
          result.details.push(status);
          await kv.set(`submeta:${id}`, { ...meta, lastDelivery: status }).catch(() => {});
        } catch (err) {
          const code = Number(err?.statusCode || 0);
          if (code === 404 || code === 410) {
            await removeSubscription(id, meta);
            result.eliminados++;
            result.details.push({ ...base, status: 'eliminado', statusCode: code });
          } else {
            result.fallidos++;
            const status = { ...base, status: 'fallido', statusCode: code || null, error: code ? `El servicio devolvió ${code}. Puedes reintentar.` : 'No se pudo confirmar el envío. Puedes reintentar.' };
            result.details.push(status);
            await kv.set(`submeta:${id}`, { ...meta, lastDelivery: status }).catch(() => {});
          }
        }
      } catch {
        result.fallidos++;
        result.details.push({ id, mote: meta?.mote || 'Sin identificar', status: 'fallido', error: 'No se pudo procesar este dispositivo.' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, ids.length) }, worker));
  result.details.sort((a, b) => String(a.mote).localeCompare(String(b.mote), 'es'));
  return result;
}
