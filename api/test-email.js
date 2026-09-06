import { sendEmail, emailConfigStatus, getAppUrl } from '../lib/email.js';

function adminOk(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Método no permitido' });
  if (!adminOk(req.body?.password)) return res.status(401).json({ error:'Contraseña incorrecta' });

  const config = emailConfigStatus();
  if (!config.hasAdminEmail) {
    return res.status(400).json({ error:'Falta ADMIN_EMAIL en Vercel.', config });
  }
  if (!config.configured) {
    return res.status(400).json({ error:'Falta configurar RESEND_API_KEY o EMAIL_FROM en Vercel.', config });
  }

  const appUrl = getAppUrl(req);
  const sent = await sendEmail({
    to:config.adminEmail,
    subject:'Prueba de correo · Cancionero Tuna de Derecho',
    text:`Si recibiste este mensaje, el envío de correos del Cancionero está funcionando. ${appUrl || ''}`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>✅ Correo de prueba</h2><p>El sistema de correo del Cancionero está funcionando y Resend aceptó este mensaje.</p><p><strong>Remitente:</strong> ${config.from}</p></div>`
  });

  if (!sent.ok) {
    return res.status(502).json({ error:'Resend rechazó el correo de prueba.', detail:sent.error, emailCode:sent.code, config });
  }
  return res.status(200).json({ ok:true, message:'Correo de prueba aceptado por Resend.', emailMessageId:sent.id, to:config.adminEmail, from:config.from });
}
