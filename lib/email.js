function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) {
    console.warn('Correo omitido: faltan RESEND_API_KEY, EMAIL_FROM o destinatario.');
    return { ok:false, skipped:true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ from, to:[to], subject, html, text })
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) {
      console.error('Error enviando correo:', r.status, data);
      return { ok:false, status:r.status, error:data?.message || 'Error de proveedor' };
    }
    return { ok:true, id:data?.id || null };
  } catch (err) {
    console.error('Error conectando con proveedor de correo:', err);
    return { ok:false, error:String(err?.message || err) };
  }
}

export function verificationEmail({ mote, email, verifyUrl }) {
  const m = esc(mote), e = esc(email), url = esc(verifyUrl || '');
  return {
    subject:'Verifica tu correo · Cancionero Tuna de Derecho',
    text:`Hola ${mote}. Confirma que ${email} es tu correo abriendo este enlace: ${verifyUrl}. Después de verificarlo, el administrador recibirá tu solicitud de acceso.`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2a0509"><h2 style="color:#6b0f1a">Verifica tu correo</h2><p>Hola <strong>${m}</strong>.</p><p>Tu cuenta fue creada con <strong>${e}</strong>, pero todavía necesitamos comprobar que ese correo te pertenece.</p>${url?`<p><a href="${url}" style="display:inline-block;padding:11px 18px;background:#6b0f1a;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Verificar mi correo</a></p>`:''}<p>Después de verificarlo, el administrador recibirá tu solicitud y podrá darte acceso al cancionero.</p><p style="font-size:12px;color:#666">El enlace es de un solo uso y caduca en 48 horas.</p><p style="font-size:12px;color:#666">Tuna de Derecho · FES Acatlán · UNAM</p></div>`
  };
}

export function adminRequestEmail({ mote, email, appUrl }) {
  const m = esc(mote), e = esc(email), adminUrl = esc(appUrl ? `${appUrl}/admin.html` : '');
  return {
    subject:`Nueva solicitud de acceso · ${mote}`,
    text:`${mote} (${email}) verificó su correo y solicita acceso al Cancionero. ${appUrl ? `Administra el acceso en ${appUrl}/admin.html` : ''}`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2a0509"><h2 style="color:#6b0f1a">Nueva solicitud de acceso</h2><p>El correo del integrante ya fue <strong>verificado</strong>.</p><p><strong>Mote:</strong> ${m}</p><p><strong>Correo:</strong> ${e}</p><p>La cuenta sigue pendiente y no puede consultar las canciones hasta que la autorices.</p>${adminUrl?`<p><a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:#6b0f1a;color:white;text-decoration:none;border-radius:8px">Abrir panel de administración</a></p>`:''}</div>`
  };
}

export function approvedEmail({ mote, appUrl }) {
  const m = esc(mote), url = esc(appUrl || '');
  return {
    subject:'Acceso autorizado · Cancionero Tuna de Derecho',
    text:`Hola ${mote}. Tu acceso al Cancionero de la Tuna de Derecho ha sido autorizado. ${appUrl ? `Puedes entrar en ${appUrl}` : ''}`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2a0509"><h2 style="color:#6b0f1a">✅ Acceso autorizado</h2><p>Hola <strong>${m}</strong>.</p><p>El administrador ya autorizó tu cuenta. Ya puedes entrar al Cancionero de la Tuna de Derecho.</p>${url?`<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#6b0f1a;color:white;text-decoration:none;border-radius:8px">Abrir Cancionero</a></p>`:''}</div>`
  };
}
