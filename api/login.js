import { kv } from '@vercel/kv';
import { normalizeUsername, userIdFromUsername, verifyPassword, createSession, publicUser } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const userId = userIdFromUsername(username);
    const user = await kv.get(`user:${userId}`);
    if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    user.lastLoginAt = new Date().toISOString();
    await kv.set(`user:${userId}`, user);
    const token = await createSession(userId);
    return res.status(200).json({ ok: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('Error iniciando sesión:', err);
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
}
