import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { normalizeEmail, normalizeMote, isValidEmail, userIdFromEmail, hashPassword, publicUser } from '../lib/auth.js';
import { sendEmail, verificationEmail, getAppUrl } from '../lib/email.js';

const VERIFY_TTL_SECONDS = 60 * 60 * 48;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const email = normalizeEmail(req.body?.email);
    const mote = normalizeMote(req.body?.mote);
    const password = String(req.body?.password || '');

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
    if (mote.length < 2 || mote.length > 40) return res.status(400).json({ error: 'El mote debe tener entre 2 y 40 caracteres.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });

    const userId = userIdFromEmail(email);
    const existing = await kv.get(`user:${userId}`);
    if (existing) {
      if (existing.emailVerified === false) {
        return res.status(409).json({ error: 'Ya existe una cuenta con ese correo, pero falta verificarlo. Usa “Reenviar verificación”.' });
      }
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    const { salt, hash } = await hashPassword(password);
    const now = new Date().toISOString();
    const user = {
      id:userId, email, mote,
      passwordSalt:salt, passwordHash:hash,
      createdAt:now, lastLoginAt:null,
      emailVerified:false, emailVerifiedAt:null,
      approved:false, accessStatus:'unverified', approvedAt:null
    };
    await kv.set(`user:${userId}`, user);
    await kv.sadd('users:all', userId);

    const verifyToken = crypto.randomBytes(32).toString('base64url');
    await kv.set(`verify:${verifyToken}`, userId, { ex: VERIFY_TTL_SECONDS });
    const appUrl = getAppUrl(req);
    const verifyUrl = `${appUrl}/api/verify-email?token=${encodeURIComponent(verifyToken)}`;
    const mail = verificationEmail({ mote, email, verifyUrl });
    const sent = await sendEmail({ to:email, ...mail });

    return res.status(201).json({
      ok:true,
      user:publicUser(user),
      verificationEmailSent: sent.ok === true
    });
  } catch (err) {
    console.error('Error registrando usuario:', err);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
}
