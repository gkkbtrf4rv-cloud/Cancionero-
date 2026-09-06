import { kv } from '@vercel/kv';
import { getBearerToken } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const token = getBearerToken(req) || req.body?.token;
  if (token) await kv.del(`session:${token}`);
  return res.status(200).json({ ok: true });
}
