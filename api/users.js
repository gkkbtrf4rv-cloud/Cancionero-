import { kv } from '@vercel/kv';
import { sendEmail, approvedEmail, getAppUrl } from '../lib/email.js';

function adminOk(password) { return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD; }

export default async function handler(req, res) {
  if (!['POST','PATCH'].includes(req.method)) return res.status(405).json({ error: 'Método no permitido' });
  const password = req.body?.password;
  if (!adminOk(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  try {
    if (req.method === 'PATCH') {
      const userId = String(req.body?.userId || '');
      const approved = req.body?.approved === true;
      const user = await kv.get(`user:${userId}`);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (approved && user.emailVerified === false) return res.status(409).json({ error: 'El usuario todavía no ha verificado su correo.' });
      const wasApproved = user.approved === true;
      user.approved = approved;
      user.accessStatus = approved ? 'approved' : 'revoked';
      user.approvedAt = approved ? new Date().toISOString() : null;
      await kv.set(`user:${userId}`, user);

      let emailSent = false;
      let emailError = null;
      if (approved && !wasApproved && user.email) {
        const mail = approvedEmail({ mote:user.mote, appUrl:getAppUrl(req) });
        const sent = await sendEmail({ to:user.email, ...mail });
        emailSent = sent.ok === true;
        emailError = sent.ok ? null : (sent.error || 'No se pudo enviar el correo.');
      }
      return res.status(200).json({ ok:true, emailSent, emailError, user:{ id:user.id, email:user.email || user.username || '', mote:user.mote, approved:user.approved, accessStatus:user.accessStatus } });
    }

    const ids = await kv.smembers('users:all');
    const users = [];
    for (const id of ids) {
      const u = await kv.get(`user:${id}`);
      if (!u) continue;
      // Las cuentas nuevas no aparecen al administrador hasta verificar su correo.
      if (u.emailVerified === false) continue;
      const subIds = await kv.smembers(`user:${id}:subs`);
      users.push({
        id:u.id, email:u.email || u.username || '', mote:u.mote, emailVerified:u.emailVerified !== false, approved:u.approved === true,
        accessStatus:u.approved === true ? 'approved' : (u.accessStatus || 'pending'),
        createdAt:u.createdAt || null, lastLoginAt:u.lastLoginAt || null, devices:subIds.length
      });
    }
    users.sort((a,b)=>String(a.mote).localeCompare(String(b.mote),'es'));
    return res.status(200).json({ ok:true, total:users.length, users });
  } catch (err) {
    console.error('Error administrando usuarios:', err);
    return res.status(500).json({ error: 'No se pudieron cargar o actualizar los usuarios.' });
  }
}
