(() => {
 const el=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let eventId=null, requestVersion=0;
 const labels={scheduled:'Programado',open:'Registro abierto',closed:'Realizado',cancelled:'Cancelado',pending:'Pendiente de confirmación del administrador',confirmed:'Asistencia confirmada',absent:'Falta'};
 async function call(action,body={}){const r=await fetch('/api/cancionero',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('cancionero_token')},body:JSON.stringify({action,eventId,...body})});const d=await r.json().catch(()=>({error:'El servidor devolvió una respuesta no válida. Pulsa Actualizar.'}));if(!r.ok)throw Error(d.error||'No se pudo guardar');return d;}
 function render(d){
   const m=d.members[0], serverNow=d.serverNow||Date.now();
   el('attendanceContent').innerHTML=`<p>Cuenta: ${esc(d.account?.mote||'')} · ${esc(d.account?.email||'')}</p><p>${m?`${m.percentage===null?'Sin ensayos realizados':m.percentage+' %'} · ${m.confirmed} de ${m.total} ensayos${m.active?'':' · Participación inactiva'}`:'Esta cuenta todavía no figura en los participantes de este evento. Revisa el correo que agregaste en el administrador.'}</p><button type="button" id="attendanceRefresh" class="event-action">Actualizar</button>`+d.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{
     const expired=s.status==='open'&&serverNow>=s.expiresAt;
     return `<div class="attendance-session" style="margin-top:14px"><strong>${esc(new Date(s.date).toLocaleString('es-MX'))}</strong><p>${s.manualOnly?'Registro manual por el administrador':expired?'Clave vencida · el administrador debe renovarla':labels[s.status]} · ${labels[s.myStatus]||'Sin registro'}</p>${s.status==='open'&&!s.manualOnly&&!['pending','confirmed'].includes(s.myStatus)?`<form data-id="${esc(s.id)}"><label>Clave del ensayo <input aria-label="Clave del ensayo" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off" style="display:block;width:100%;box-sizing:border-box;padding:12px;font-size:18px;margin:8px 0"></label><button class="event-action">Solicitar asistencia</button><p role="status" data-feedback></p></form>`:''}</div>`;
   }).join('')+(d.sessions.length?'':'<p>Todavía no hay ensayos programados para esta lista. El administrador debe crear el primero.</p>');
   el('attendanceRefresh').onclick=load;
   el('attendanceContent').querySelectorAll('form').forEach(f=>f.onsubmit=async e=>{
     e.preventDefault();const button=f.querySelector('button'),feedback=f.querySelector('[data-feedback]');button.disabled=true;feedback.textContent='Enviando…';
     try{render(await call('attendance-checkin',{sessionId:f.dataset.id,code:f.elements.code.value}));}
     catch(e){feedback.textContent=e.message;button.disabled=false;}
   });
 }
 async function load(){const version=++requestVersion;el('attendanceContent').textContent='Consultando asistencia…';try{const d=await call('attendance-list');if(version===requestVersion)render(d);}catch(e){if(version===requestVersion)el('attendanceContent').textContent=navigator.onLine?e.message:'Sin conexión. El pase de lista y su confirmación necesitan internet.';}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&eventId&&document.getElementById('vista-evento')?.classList.contains('activa'))load();});
 window.addEventListener('attendance-event',e=>{eventId=e.detail;load();});
 const initialEvent=document.getElementById('attendancePanel')?.dataset?.eventId;if(initialEvent){eventId=initialEvent;load();}
})();
