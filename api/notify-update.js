import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { getAllSongs } from '../lib/song-store.js';
import { getEventSummaries } from '../lib/event-store.js';
import { sendPushBatch, deliveryScope, requestOrigin, eligibleSubscription, pushConfiguration } from '../lib/push.js';

async function contentVersion() {
  const [songs, events] = await Promise.all([getAllSongs(), getEventSummaries()]);
  return crypto.createHash('sha256').update(JSON.stringify({ songs, events: events.map(({ commentCount, photoCount, ...e }) => e) })).digest('hex').slice(0, 16);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const { password, action = 'status' } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });
  if (!['status', 'notify'].includes(action)) return res.status(400).json({ error: 'Acción no válida' });
  let lockKey, acquired = false;
  try {
    const version = await contentVersion(), scope = deliveryScope(req);
    const receiptKey = `push:update:${scope}:${version}`, origin = requestOrigin(req);
    const ids = await kv.smembers('subs:all'), delivered = new Set(await kv.smembers(receiptKey));
    let pending = 0, eligible = 0;
    for (const id of ids) {
      const entry = await eligibleSubscription(id, origin);
      if (!entry.reason) { eligible++; if (!delivered.has(id)) pending++; }
    }
    let configured = true;
    try { pushConfiguration(); } catch { configured = false; }
    if (action === 'status') return res.status(200).json({ ok: true, version, hasChanges: pending > 0, pending, eligible, configured });
    if (!configured) return res.status(503).json({ error: 'Revisa las claves VAPID y el contacto de notificaciones en el servidor.' });
    if (!pending) return res.status(200).json({ ok: true, sent: false, version, reason: eligible ? 'same-version' : 'no-subscribers', message: eligible ? 'El servicio ya aceptó esta versión para todos los dispositivos registrados en este sitio.' : 'No hay dispositivos autorizados sincronizados en este sitio. Abre la app y activa los avisos en cada dispositivo.' });
    lockKey = `push:lock:${scope}:${version}`;
    acquired = Boolean(await kv.set(lockKey, 'sending', { nx: true, ex: 300 }));
    if (!acquired) return res.status(409).json({ error: 'Ya hay un envío en curso. Espera a que termine antes de reintentar.' });
    const result = await sendPushBatch(req, { title: '📚 Cancionero actualizado', body: 'Hay cambios en el repertorio. Toca para consultarlos.', url: `/?actualizar=${version}`, kind: 'content-update', version }, { receiptKey });
    return res.status(200).json({ ok: true, sent: true, version, retryable: result.fallidos > 0, ...result });
  } catch {
    return res.status(503).json({ error: 'No se pudo comprobar o notificar la actualización. Puedes reintentar.' });
  } finally {
    if (acquired) await kv.del(lockKey).catch(() => {});
  }
}
