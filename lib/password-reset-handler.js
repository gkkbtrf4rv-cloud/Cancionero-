import { waitUntil } from '@vercel/functions';
import { isValidEmail } from './auth.js';
import { requestPasswordReset, confirmPasswordReset, GENERIC_MESSAGE } from './password-reset.js';
import { passwordResetPage } from './password-reset-page.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(passwordResetPage);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  try {
    if (req.body?.action === 'request-reset') {
      const email = typeof req.body.email === 'string' ? req.body.email : '';
      if (!isValidEmail(email)) return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
      const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const app = new URL(process.env.APP_URL || '');
      if (app.protocol !== 'https:' || app.username || app.password) throw new Error('invalid_app_url');
      // La respuesta no espera al SMTP y es igual para cuentas existentes o no.
      waitUntil(requestPasswordReset(email, ip).catch(err => {
        console.error('Error solicitando enlace:', err?.code || 'reset_error');
      }));
      return res.status(200).json({ ok: true, message: GENERIC_MESSAGE });
    }
    if (req.body?.action === 'confirm-reset') {
      const token = typeof req.body.token === 'string' ? req.body.token : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' });
      if (!await confirmPasswordReset(token, password)) return res.status(400).json({ error: 'El enlace no es válido, ya fue usado o caducó. Solicita uno nuevo.' });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Acción no válida.' });
  } catch (err) {
    // No imprimir tokens, contraseñas ni el cuerpo de la petición.
    console.error('Error en recuperación de contraseña:', err?.code || 'reset_error');
    return res.status(503).json({ error: 'No se pudo completar la recuperación. Inténtalo más tarde.' });
  }
}
