import crypto from 'crypto';
import webpush from 'web-push';
import { kv } from '@vercel/kv';
import { CANCIONES } from '../lib/canciones.js';

const CONTENT_JSON = JSON.stringify(CANCIONES);
const CONTENT_VERSION = crypto.createHash('sha256').update(CONTENT_JSON).digest('hex').slice(0, 16);
const LAST_NOTIFIED_KEY = 'cancionero:lastNotifiedVersion';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:tuna.derecho.acatlan@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { password, action = 'status' } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  try {
    const lastNotifiedVersion = await kv.get(LAST_NOTIFIED_KEY);
    const hasChanges = lastNotifiedVersion !== CONTENT_VERSION;

    if (action === 'status') {
      return res.status(200).json({
        ok: true,
        version: CONTENT_VERSION,
        lastNotifiedVersion: lastNotifiedVersion || null,
        hasChanges
      });
    }

    if (action !== 'notify') {
      return res.status(400).json({ error: 'Acción no válida' });
    }

    if (!hasChanges) {
      return res.status(200).json({
        ok: true,
        sent: false,
        reason: 'same-version',
        version: CONTENT_VERSION,
        message: 'Esta versión ya fue notificada. No se envió otro aviso.'
      });
    }

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Faltan las claves VAPID en Vercel.' });
    }

    const ids = await kv.smembers('subs:all');
    const payload = JSON.stringify({
      title: '📚 Cancionero actualizado',
      body: 'Hay cambios nuevos en el cancionero. Ábrelo para descargar la nueva versión.',
      url: `/?actualizar=${CONTENT_VERSION}`,
      kind: 'content-update',
      version: CONTENT_VERSION
    });

    let enviados = 0;
    let fallidos = 0;
    let eliminados = 0;
    let omitidos = 0;
    const details = [];

    await Promise.all(ids.map(async (id) => {
      const [sub, meta] = await Promise.all([
        kv.get(`sub:${id}`),
        kv.get(`submeta:${id}`)
      ]);

      if (!sub) {
        await kv.srem('subs:all', id);
        return;
      }

      const base = {
        id,
        mote: meta?.mote || 'Sin identificar',
        email: meta?.email || '—'
      };

      if (meta?.userId) {
        const user = await kv.get(`user:${meta.userId}`);
        if (!user || user.approved !== true) {
          omitidos++;
          details.push({ ...base, status: 'omitido', error: 'Usuario sin acceso autorizado' });
          return;
        }
      }

      try {
        const response = await webpush.sendNotification(sub, payload);
        enviados++;
        const result = {
          ...base,
          status: 'enviado',
          statusCode: response?.statusCode || 201,
          at: new Date().toISOString()
        };
        details.push(result);
        if (meta) await kv.set(`submeta:${id}`, { ...meta, lastDelivery: result });
      } catch (err) {
        const code = Number(err?.statusCode || 0);
        if (code === 404 || code === 410) {
          await kv.del(`sub:${id}`);
          await kv.del(`submeta:${id}`);
          await kv.srem('subs:all', id);
          if (meta?.userId) await kv.srem(`user:${meta.userId}:subs`, id);
          eliminados++;
        } else {
          fallidos++;
          const result = {
            ...base,
            status: 'fallido',
            statusCode: code || null,
            error: String(err?.message || 'Error desconocido').slice(0, 180),
            at: new Date().toISOString()
          };
          details.push(result);
          if (meta) await kv.set(`submeta:${id}`, { ...meta, lastDelivery: result });
        }
      }
    }));

    // Marcamos la versión como notificada aunque algún dispositivo individual falle.
    // Así evitamos bombardear al resto con el mismo aviso al reintentar.
    await kv.set(LAST_NOTIFIED_KEY, CONTENT_VERSION);

    return res.status(200).json({
      ok: true,
      sent: true,
      version: CONTENT_VERSION,
      enviados,
      fallidos,
      eliminados,
      omitidos,
      total: ids.length,
      details
    });
  } catch (err) {
    console.error('Error notificando actualización:', err);
    return res.status(500).json({ error: 'No se pudo comprobar o notificar la actualización.' });
  }
}
