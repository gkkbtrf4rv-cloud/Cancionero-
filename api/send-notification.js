import webpush from 'web-push';
import { kv } from '@vercel/kv';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:tuna.derecho.acatlan@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const { password, title, body, url } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  if (!title || !body) return res.status(400).json({ error: 'Falta el título o el mensaje' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Faltan las claves VAPID en Vercel.' });
  }

  try {
    const ids = await kv.smembers('subs:all');
    const payload = JSON.stringify({ title, body, url: url || '/' });
    const details = [];
    let enviados = 0, fallidos = 0, eliminados = 0, huerfanos = 0;

    await Promise.all(ids.map(async (id) => {
      const [sub, meta] = await Promise.all([kv.get(`sub:${id}`), kv.get(`submeta:${id}`)]);
      if (!sub) {
        await kv.srem('subs:all', id);
        huerfanos++;
        return;
      }
      const base = { id, mote: meta?.mote || 'Sin identificar', username: meta?.username || '—' };
      try {
        const response = await webpush.sendNotification(sub, payload);
        enviados++;
        const result = { ...base, status: 'enviado', statusCode: response?.statusCode || 201, at: new Date().toISOString() };
        details.push(result);
        if (meta) await kv.set(`submeta:${id}`, { ...meta, lastDelivery: result });
      } catch (err) {
        const code = Number(err?.statusCode || 0);
        const gone = code === 404 || code === 410;
        if (gone) {
          await kv.del(`sub:${id}`);
          await kv.del(`submeta:${id}`);
          await kv.srem('subs:all', id);
          if (meta?.userId) await kv.srem(`user:${meta.userId}:subs`, id);
          eliminados++;
        } else {
          fallidos++;
          const result = { ...base, status: 'fallido', statusCode: code || null, error: String(err?.message || 'Error desconocido').slice(0, 180), at: new Date().toISOString() };
          details.push(result);
          if (meta) await kv.set(`submeta:${id}`, { ...meta, lastDelivery: result });
          console.error('Push fallido', { id, mote: base.mote, code, message: err?.message });
        }
      }
    }));

    details.sort((a, b) => String(a.mote).localeCompare(String(b.mote), 'es'));
    return res.status(200).json({ ok: true, enviados, fallidos, eliminados, huerfanos, total: ids.length, details });
  } catch (err) {
    console.error('Error enviando notificaciones:', err);
    return res.status(500).json({ error: 'Error enviando las notificaciones' });
  }
}
