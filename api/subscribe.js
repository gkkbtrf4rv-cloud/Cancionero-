import { kv } from '@vercel/kv';
import { getSessionUser } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const session = await getSessionUser(req, req.body?.token || null);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para registrar este dispositivo.' });

    const subscription = req.body?.subscription || req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Suscripción inválida' });

    const id = Buffer.from(subscription.endpoint).toString('base64url');
    const now = new Date().toISOString();
    const device = req.body?.device || {};

    await kv.set(`sub:${id}`, subscription);
    await kv.set(`submeta:${id}`, {
      id,
      userId: session.userId,
      username: session.user.username,
      mote: session.user.mote,
      userAgent: String(device.userAgent || req.headers['user-agent'] || '').slice(0, 300),
      platform: String(device.platform || '').slice(0, 100),
      installed: Boolean(device.installed),
      createdAt: (await kv.get(`submeta:${id}`))?.createdAt || now,
      lastSeenAt: now,
      lastDelivery: (await kv.get(`submeta:${id}`))?.lastDelivery || null
    });
    await kv.sadd('subs:all', id);
    await kv.sadd(`user:${session.userId}:subs`, id);

    return res.status(200).json({ ok: true, id, mote: session.user.mote });
  } catch (err) {
    console.error('Error guardando suscripción:', err);
    return res.status(500).json({ error: 'Error guardando la suscripción' });
  }
}
