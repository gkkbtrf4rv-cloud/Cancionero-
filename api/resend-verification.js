import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { normalizeEmail, userIdFromEmail } from '../lib/auth.js';
import { sendEmail, verificationEmail, getAppUrl } from '../lib/email.js';

const VERIFY_TTL_SECONDS = 60 * 60 * 48;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Método no permitido' });
  try {
    const email = normalizeEmail(req.body?.email);
    const userId = userIdFromEmail(email);
    const user = await kv.get(`user:${userId}`);

    // Respuesta deliberadamente neutra para no revelar si existe una cuenta.
    if (!user || user.emailVerified !== false) {
      return res.status(200).json({ ok:true, message:'Si la cuenta existe y está pendiente, enviaremos un correo de verificación.' });
    }

    const verifyToken = crypto.randomBytes(32).toString('base64url');
    await kv.set(`verify:${verifyToken}`, userId, { ex: VERIFY_TTL_SECONDS });
    const appUrl = getAppUrl(req);
    const verifyUrl = `${appUrl}/api/verify-email?token=${encodeURIComponent(verifyToken)}`;
    const mail = verificationEmail({ mote:user.mote, email:user.email, verifyUrl });
    const sent = await sendEmail({ to:user.email, ...mail });

    return res.status(200).json({ ok:true, sent:sent.ok === true, message:'Si la cuenta existe y está pendiente, enviaremos un correo de verificación.' });
  } catch (err) {
    console.error('Error reenviando verificación:', err);
    return res.status(500).json({ error:'No se pudo reenviar la verificación.' });
  }
}
