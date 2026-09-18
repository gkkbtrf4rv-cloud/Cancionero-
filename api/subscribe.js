import { kv } from '@vercel/kv';
import { getSessionUser } from '../lib/auth.js';
import { pushConfiguration, requestOrigin, removeSubscription } from '../lib/push.js';

function validSubscription(sub) {
  try {
    const url = new URL(sub.endpoint);
    const hosts = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/i;
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && hosts.test(url.hostname)
      && /^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys?.p256dh || '') && Buffer.from(sub.keys.p256dh, 'base64url').length === 65
      && /^[A-Za-z0-9_-]+={0,2}$/.test(sub.keys?.auth || '') && Buffer.from(sub.keys.auth, 'base64url').length === 16;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Método no permitido' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, ...pushConfiguration() });
    const session = await getSessionUser(req, req.body?.token || null);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para registrar este dispositivo.' });
    const sub = req.body?.subscription || req.body;
    if (!validSubscription(sub)) return res.status(400).json({ error: 'Suscripción inválida o servicio no compatible.' });
    const id = Buffer.from(sub.endpoint).toString('base64url'), oldMeta = await kv.get(`submeta:${id}`);
    if (req.method === 'DELETE') {
      if (oldMeta?.userId === session.userId) await removeSubscription(id, oldMeta);
      return res.status(200).json({ ok: true });
    }
    if (session.user.approved !== true) return res.status(403).json({ error: 'Tu cuenta aún no está autorizada para usar el cancionero.' });
    const { publicKey } = pushConfiguration();
    if (req.body?.publicKey !== publicKey) return res.status(409).json({ error: 'La configuración cambió. Vuelve a activar los avisos.' });
    const origin = requestOrigin(req);
    if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({ error: 'Origen no autorizado.' });
    const now = new Date().toISOString(), device = req.body?.device || {};
    if (oldMeta?.userId && oldMeta.userId !== session.userId) await kv.srem(`user:${oldMeta.userId}:subs`, id);
    await kv.set(`sub:${id}`, { endpoint: sub.endpoint, expirationTime: sub.expirationTime || null, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    await kv.set(`submeta:${id}`, {
      id, origin, userId: session.userId, email: session.user.email || session.user.username || '', mote: session.user.mote,
      userAgent: String(device.userAgent || req.headers['user-agent'] || '').slice(0, 300), platform: String(device.platform || '').slice(0, 100), installed: Boolean(device.installed),
      createdAt: oldMeta?.createdAt || now, lastSeenAt: now, lastDelivery: oldMeta?.userId === session.userId ? oldMeta?.lastDelivery || null : null
    });
    await kv.sadd('subs:all', id);
    await kv.sadd(`user:${session.userId}:subs`, id);
    return res.status(200).json({ ok: true, id, mote: session.user.mote });
  } catch {
    return res.status(503).json({ error: 'No se pudo registrar este dispositivo. Revisa la conexión y la configuración del servidor.' });
  }
}
