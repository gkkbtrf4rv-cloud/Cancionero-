import webpush from 'web-push';
import { kv } from '@vercel/kv';

webpush.setVapidDetails(
  'mailto:tuna.derecho.acatlan@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { password, title, body, url } = req.body || {};

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Contraseña incorrecta' });
    return;
  }

  if (!title || !body) {
    res.status(400).json({ error: 'Falta el título o el mensaje' });
    return;
  }

  try {
    const ids = await kv.smembers('subs:all');
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/'
    });

    let enviados = 0;
    let eliminados = 0;

    await Promise.all(
      ids.map(async (id) => {
        const sub = await kv.get(`sub:${id}`);
        if (!sub) return;
        try {
          await webpush.sendNotification(sub, payload);
          enviados++;
        } catch (err) {
          // Suscripción caducada o inválida: la limpiamos
          if (err.statusCode === 404 || err.statusCode === 410) {
            await kv.del(`sub:${id}`);
            await kv.srem('subs:all', id);
            eliminados++;
          }
        }
      })
    );

    res.status(200).json({ ok: true, enviados, eliminados, total: ids.length });
  } catch (err) {
    console.error('Error enviando notificaciones:', err);
    res.status(500).json({ error: 'Error enviando las notificaciones' });
  }
}
