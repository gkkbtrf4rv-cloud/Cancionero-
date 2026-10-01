import passwordResetHandler from '../lib/password-reset-handler.js';
import { kv } from '@vercel/kv';
import { normalizeEmail, userIdFromEmail, verifyPassword, createSession, publicUser } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET' || ['request-reset', 'confirm-reset'].includes(req.body?.action)) return passwordResetHandler(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const userId = userIdFromEmail(email);
    const user = await kv.get(`user:${userId}`);
    if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    if (user.emailVerified === false) {
      return res.status(403).json({ error: 'Primero verifica tu correo electrónico. Revisa tu bandeja de entrada o solicita un nuevo enlace.' });
    }
    user.lastLoginAt = new Date().toISOString();
    const updated = await kv.eval(`
      local raw = redis.call('GET', KEYS[1])
      if not raw then return 0 end
      local current = cjson.decode(raw)
      if current.passwordHash ~= ARGV[1] then return 0 end
      current.lastLoginAt = ARGV[2]
      redis.call('SET', KEYS[1], cjson.encode(current))
      return 1
    `, [`user:${userId}`], [user.passwordHash, user.lastLoginAt]);
    if (Number(updated) !== 1) return res.status(401).json({ error: 'La contraseña cambió. Inicia sesión de nuevo.' });
    const token = await createSession(userId, user.passwordHash);
    return res.status(200).json({ ok:true, token, user:publicUser(user) });
  } catch (err) {
    console.error('Error iniciando sesión:', err);
    return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
}
