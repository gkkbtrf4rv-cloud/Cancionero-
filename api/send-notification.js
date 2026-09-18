import { sendPushBatch, localNotificationURL } from '../lib/push.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const { password, title, body, url } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Contraseña incorrecta' });
  if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Falta el título o el mensaje' });
  try {
    const result = await sendPushBatch(req, { title: title.trim().slice(0, 60), body: body.trim().slice(0, 200), url: localNotificationURL(url) });
    return res.status(200).json({ ok: true, ...result });
  } catch {
    return res.status(503).json({ error: 'No se pudo enviar. Comprueba la configuración de notificaciones y la conexión del servidor.' });
  }
}
