import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
      res.status(400).json({ error: 'Suscripción inválida' });
      return;
    }

    const id = Buffer.from(subscription.endpoint).toString('base64url');

    await kv.set(`sub:${id}`, subscription);
    await kv.sadd('subs:all', id);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error guardando suscripción:', err);
    res.status(500).json({ error: 'Error guardando la suscripción' });
  }
}
