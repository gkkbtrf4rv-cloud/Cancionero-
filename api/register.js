import { kv } from '@vercel/kv';
import { normalizeUsername, normalizeMote, userIdFromUsername, hashPassword, createSession, publicUser } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const username = normalizeUsername(req.body?.username);
    const mote = normalizeMote(req.body?.mote);
    const password = String(req.body?.password || '');

    if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener 3–24 caracteres: letras, números, punto, guion o guion bajo.' });
    }
    if (mote.length < 2 || mote.length > 40) {
      return res.status(400).json({ error: 'El mote debe tener entre 2 y 40 caracteres.' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const userId = userIdFromUsername(username);
    const existing = await kv.get(`user:${userId}`);
    if (existing) return res.status(409).json({ error: 'Ese usuario ya existe.' });

    const { salt, hash } = await hashPassword(password);
    const now = new Date().toISOString();
    const user = { id: userId, username, mote, passwordSalt: salt, passwordHash: hash, createdAt: now, lastLoginAt: now, approved: false, accessStatus: 'pending', approvedAt: null };
    await kv.set(`user:${userId}`, user);
    await kv.sadd('users:all', userId);

    const token = await createSession(userId);
    return res.status(201).json({ ok: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('Error registrando usuario:', err);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
}
