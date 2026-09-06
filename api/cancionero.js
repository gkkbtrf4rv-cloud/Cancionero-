import crypto from 'crypto';
import { getSessionUser } from '../lib/auth.js';
import { CANCIONES } from '../lib/canciones.js';

const CONTENT_JSON = JSON.stringify(CANCIONES);
const CONTENT_VERSION = crypto.createHash('sha256').update(CONTENT_JSON).digest('hex').slice(0, 16);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para consultar el cancionero.' });
    if (session.user.approved !== true) return res.status(403).json({ error: 'Tu cuenta está pendiente de autorización.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      version: CONTENT_VERSION,
      canciones: CANCIONES
    });
  } catch (err) {
    console.error('Error cargando cancionero:', err);
    return res.status(500).json({ error: 'No se pudo cargar el cancionero.' });
  }
}
