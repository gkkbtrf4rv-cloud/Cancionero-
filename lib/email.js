import nodemailer from 'nodemailer';
import { readFileSync } from 'node:fs';
import { institutionalEmail } from './email-template.js';

export function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export function emailConfigStatus() {
  const gmailUser = String(process.env.GMAIL_USER || '').trim();
  const gmailPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
  const adminCcEmail = String(process.env.ADMIN_CC_EMAIL || '').trim();
  const from = gmailUser ? `Cancionero Tuna <${gmailUser}>` : null;
  return {
    configured: Boolean(gmailUser && gmailPassword),
    hasGmailUser: Boolean(gmailUser),
    hasGmailPassword: Boolean(gmailPassword),
    hasAdminEmail: Boolean(adminEmail),
    hasAdminCcEmail: Boolean(adminCcEmail),
    from,
    adminEmail: adminEmail || null,
    adminCcEmail: adminCcEmail || null
  };
}

export async function sendEmail({ to, cc, subject, html, text, attachments }) {
  const gmailUser = String(process.env.GMAIL_USER || '').trim();
  const gmailPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const recipient = String(to || '').trim();
  const copyRecipient = String(cc || '').trim();

  if (!gmailUser) return { ok:false, code:'missing_gmail_user', error:'Falta GMAIL_USER en las variables de Vercel.' };
  if (!gmailPassword) return { ok:false, code:'missing_gmail_password', error:'Falta GMAIL_APP_PASSWORD en las variables de Vercel.' };
  if (!recipient) return { ok:false, code:'missing_recipient', error:'No se indicó destinatario.' };

  try {
    const transporter = nodemailer.createTransport({
      host:'smtp.gmail.com',
      port:465,
      secure:true,
      auth:{ user:gmailUser, pass:gmailPassword }
    });

    const info = await transporter.sendMail({
      from:`Cancionero Tuna <${gmailUser}>`,
      to:recipient,
      ...(copyRecipient ? { cc:copyRecipient } : {}),
      subject,
      text,
      html,
      ...(attachments ? { attachments } : {})
    });

    const id = info?.messageId || null;
    console.log('Correo enviado por Gmail SMTP:', { id, to:recipient, cc:copyRecipient || null, subject });
    return { ok:true, id, accepted:info?.accepted || [], rejected:info?.rejected || [], envelope:info?.envelope || null, response:info?.response || null };
  } catch (err) {
    const code = String(err?.code || err?.responseCode || 'gmail_error');
    const message = String(err?.response || err?.message || err);
    console.error('Error enviando por Gmail SMTP:', { code, message });
    return { ok:false, code, error:message };
  }
}

function styledEmail({ subject, text, ...options }) {
  return {
    subject, text,
    html: institutionalEmail(options),
    attachments: [{ filename:'escudo-tuna.png', content:readFileSync(new URL('../icon-512.png', import.meta.url)), contentType:'image/png', cid:'tuna-crest@cancionero', contentDisposition:'inline' }]
  };
}

export function verificationEmail({ mote, email, verifyUrl }) {
  return styledEmail({
    subject:'Verifica tu correo · Cancionero Tuna de Derecho',
    text:`Hola ${mote}. Confirma que ${email} es tu correo abriendo este enlace: ${verifyUrl}. Después de verificarlo, el administrador recibirá tu solicitud de acceso. El enlace es de un solo uso y caduca en 48 horas. Si no solicitaste este registro, puedes ignorar este mensaje.`,
    title:'Confirma tu correo electrónico', greeting:`Hola, ${mote}:`,
    paragraphs:[`Gracias por registrarte en el Cancionero de la Tuna de Derecho. Para continuar, confirma tu dirección de correo: ${email}.`],
    buttonLabel:'Confirmar mi correo', buttonUrl:verifyUrl,
    after:['Después de confirmar tu correo, tu cuenta quedará pendiente de autorización por un administrador.'],
    note:'El enlace es de un solo uso y caduca en 48 horas. Si no solicitaste este registro, puedes ignorar este mensaje.'
  });
}

export function adminRequestEmail({ mote, email, appUrl }) {
  const adminUrl=appUrl ? `${appUrl.replace(/\/$/,'')}/admin.html` : '';
  return styledEmail({
    subject:`Nueva solicitud de acceso · ${mote}`,
    text:`${mote} (${email}) verificó su correo y solicita acceso al Cancionero. ${adminUrl ? `Administra el acceso en ${adminUrl}` : ''}`,
    title:'Nueva solicitud de acceso',
    paragraphs:['Un integrante ha verificado su correo electrónico y solicita acceso al Cancionero.',`Mote: ${mote}`,`Correo: ${email}`],
    buttonLabel:'Revisar solicitud', buttonUrl:adminUrl,
    after:['La cuenta continúa pendiente. El integrante podrá consultar el Cancionero cuando autorices su acceso.']
  });
}

export function approvedEmail({ mote, appUrl }) {
  return styledEmail({
    subject:'Acceso autorizado · Cancionero Tuna de Derecho',
    text:`Hola ${mote}. Tu acceso al Cancionero de la Tuna de Derecho ha sido autorizado. ${appUrl ? `Puedes entrar en ${appUrl}` : ''}`,
    title:'Tu acceso ha sido autorizado', greeting:`Hola, ${mote}:`,
    paragraphs:['El administrador ha autorizado tu cuenta. Ya puedes entrar al Cancionero de la Tuna de Derecho.'],
    buttonLabel:'Abrir Cancionero', buttonUrl:appUrl,
    after:['Te damos la bienvenida a este espacio de tradición, música y hermandad.']
  });
}

export function passwordResetEmail({ mote, resetUrl }) {
  return styledEmail({
    subject:'Recupera tu contraseña · Cancionero Tuna de Derecho',
    text:`Hola ${mote}. Crea tu nueva contraseña aquí: ${resetUrl}. El enlace caduca en 30 minutos y se puede usar una sola vez. Si no lo solicitaste, ignora este correo; tu contraseña no ha cambiado.`,
    title:'Recupera tu contraseña', greeting:`Hola, ${mote}:`,
    paragraphs:['Recibimos una solicitud para restablecer tu contraseña. Utiliza el siguiente botón para crear una nueva.'],
    buttonLabel:'Crear nueva contraseña', buttonUrl:resetUrl,
    after:['El enlace caduca en 30 minutos y es de un solo uso. Tu cuenta conserva su autorización.'],
    note:'Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña no ha cambiado.'
  });
}

export function testEmail({ from, appUrl }) {
  return styledEmail({
    subject:'Prueba de correo · Cancionero Tuna de Derecho',
    text:`Si recibiste este mensaje, el envío de correos del Cancionero está funcionando. ${appUrl || ''}`,
    title:'Correo de prueba',
    paragraphs:['Este mensaje confirma que el sistema de correo del Cancionero está funcionando.',`Remitente: ${from}`],
    buttonLabel:'Abrir Cancionero', buttonUrl:appUrl,
    after:['La conexión con Gmail ha enviado este correo correctamente.']
  });
}
