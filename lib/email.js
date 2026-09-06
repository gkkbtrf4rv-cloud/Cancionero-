function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export function emailConfigStatus() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
  return {
    configured: Boolean(apiKey && from),
    hasApiKey: Boolean(apiKey),
    hasFrom: Boolean(from),
    hasAdminEmail: Boolean(adminEmail),
    from: from || null,
    adminEmail: adminEmail || null
  };
}

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  const recipient = String(to || '').trim();

  if (!apiKey) return { ok:false, code:'missing_api_key', error:'Falta RESEND_API_KEY en las variables de Vercel.' };
  if (!from) return { ok:false, code:'missing_from', error:'Falta EMAIL_FROM en las variables de Vercel.' };
  if (!recipient) return { ok:false, code:'missing_recipient', error:'No se indicó destinatario.' };

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{
        'Authorization':`Bearer ${apiKey}`,
        'Content-Type':'application/json',
        'User-Agent':'Cancionero-Tuna/1.0'
      },
      body:JSON.stringify({ from, to:[recipient], subject, html, text })
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) {
      const providerMessage = data?.message || data?.error?.message || `Resend respondió HTTP ${r.status}`;
      console.error('Resend rechazó el correo:', r.status, data);
      return { ok:false, code:data?.name || `http_${r.status}`, status:r.status, error:providerMessage };
    }
    if (!data?.id) {
      console.error('Resend respondió sin id de mensaje:', data);
      return { ok:false, code:'missing_message_id', error:'El proveedor no confirmó el mensaje.' };
    }
    console.log('Correo aceptado por Resend:', { id:data.id, to:recipient, subject });
    return { ok:true, id:data.id };
  } catch (err) {
    console.error('Error conectando con Resend:', err);
    return { ok:false, code:'network_error', error:String(err?.message || err) };
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
