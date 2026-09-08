import { kv } from '@vercel/kv';
import { sendEmail, adminRequestEmail, getAppUrl } from '../lib/email.js';

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Método no permitido' });
  const appUrl = getAppUrl(req) || '/';
  try {
    const token = String(req.query?.token || '');
    if (!token) return redirect(res, `${appUrl}/?email_verified=invalid`);

    const userId = await kv.get(`verify:${token}`);
    if (!userId) return redirect(res, `${appUrl}/?email_verified=expired`);

    const user = await kv.get(`user:${userId}`);
    if (!user) {
      await kv.del(`verify:${token}`);
      return redirect(res, `${appUrl}/?email_verified=invalid`);
    }

    if (user.emailVerified !== true) {
      user.emailVerified = true;
      user.emailVerifiedAt = new Date().toISOString();
      user.accessStatus = user.approved === true ? 'approved' : 'pending';
      await kv.set(`user:${userId}`, user);

      const mail = adminRequestEmail({ mote:user.mote, email:user.email, appUrl });
      const sent = await sendEmail({ to:process.env.ADMIN_EMAIL, cc:process.env.ADMIN_CC_EMAIL, ...mail });
      if (!sent.ok) console.warn('El correo al administrador no pudo enviarse.', sent);
    }

    await kv.del(`verify:${token}`);
    return redirect(res, `${appUrl}/?email_verified=1`);
  } catch (err) {
    console.error('Error verificando correo:', err);
    return redirect(res, `${appUrl}/?email_verified=error`);
  }
}
