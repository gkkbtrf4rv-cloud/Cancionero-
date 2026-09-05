import { getSessionUser, publicUser } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: 'Sesión no válida.' });
    return res.status(200).json({ ok: true, user: publicUser(session.user) });
  } catch (err) {
    console.error('Error comprobando sesión:', err);
    return res.status(500).json({ error: 'No se pudo comprobar la sesión.' });
  }
}
