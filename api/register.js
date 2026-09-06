import { kv } from '@vercel/kv';
import { normalizeEmail, normalizeMote, isValidEmail, userIdFromEmail, hashPassword, createSession, publicUser } from '../lib/auth.js';
import { sendEmail, registrationEmail, adminRequestEmail, getAppUrl } from '../lib/email.js';

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
    if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

    const { salt, hash } = await hashPassword(password);
    const now = new Date().toISOString();
    const user = { id:userId, email, mote, passwordSalt:salt, passwordHash:hash, createdAt:now, lastLoginAt:now, approved:false, accessStatus:'pending', approvedAt:null };
    await kv.set(`user:${userId}`, user);
    await kv.sadd('users:all', userId);

    const token = await createSession(userId);
    const appUrl = getAppUrl(req);
    const userMail = registrationEmail({ mote, email, appUrl });
    const adminMail = adminRequestEmail({ mote, email, appUrl });
    const [confirmation, adminNotice] = await Promise.all([
      sendEmail({ to:email, ...userMail }),
      sendEmail({ to:process.env.ADMIN_EMAIL, ...adminMail })
    ]);

    return res.status(201).json({ ok:true, token, user:publicUser(user), emails:{ confirmation:confirmation.ok === true, adminNotice:adminNotice.ok === true } });
  } catch (err) {
    console.error('Error registrando usuario:', err);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
}
