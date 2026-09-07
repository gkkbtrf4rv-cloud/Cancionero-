import crypto from 'crypto';
import { getSessionUser } from '../lib/auth.js';
import { CANCIONES } from '../lib/canciones.js';
import { kv } from '@vercel/kv';

const CONTENT_JSON = JSON.stringify(CANCIONES);
const CONTENT_VERSION = crypto.createHash('sha256').update(CONTENT_JSON).digest('hex').slice(0, 16);

function adminOk(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  try {
    // Reutilizamos esta función para no aumentar el número de Vercel Functions del plan Hobby.
    if (req.method === 'POST') {
      if (!adminOk(req.body?.password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
      const action = req.body?.action;

      if (action === 'set-popup') {
        const imageData = String(req.body?.imageData || '');
        const title = String(req.body?.title || '').trim().slice(0, 80);
        const body = String(req.body?.body || '').trim().slice(0, 300);
        if (!imageData.startsWith('data:image/')) return res.status(400).json({ error: 'Selecciona una imagen válida.' });
        // El cliente comprime la foto antes de subirla. Dejamos margen para JSON/base64.
        if (imageData.length > 1_250_000) return res.status(413).json({ error: 'La imagen sigue siendo demasiado pesada. Usa una foto más pequeña.' });
        const popup = {
          id: `popup-${Date.now()}`,
          imageData, title, body, active: true,
          createdAt: new Date().toISOString()
        };
        await kv.set('app:popup', popup);
        return res.status(200).json({ ok: true, popup: { ...popup, imageData: undefined } });
      }

      if (action === 'clear-popup') {
        await kv.del('app:popup');
        return res.status(200).json({ ok: true });
      }

      if (action === 'get-popup-admin') {
        const popup = await kv.get('app:popup');
        return res.status(200).json({ ok: true, popup: popup || null });
      }

      return res.status(400).json({ error: 'Acción no válida.' });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para consultar el cancionero.' });
    if (session.user.approved !== true) return res.status(403).json({ error: 'Tu cuenta está pendiente de autorización.' });

    const popup = await kv.get('app:popup');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      version: CONTENT_VERSION,
      canciones: CANCIONES,
      popup: popup?.active ? popup : null
    });
  } catch (err) {
    console.error('Error en cancionero:', err);
    return res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  }
}
