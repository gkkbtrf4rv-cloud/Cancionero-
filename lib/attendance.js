import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { getSessionUser } from './auth.js';
import { getEvent, getEvents } from './event-store.js';

export const GENERAL_ATTENDANCE_ID='tuna-sabados';
export function mexicoDay(value){return new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});}
export function upcomingSaturdays(now=Date.now()){
  const local= new Date(mexicoDay(now)+'T12:00:00Z');
  local.setUTCDate(local.getUTCDate()+(6-local.getUTCDay()+7)%7);
  return Array.from({length:4},(_,i)=>{const day=new Date(local);day.setUTCDate(day.getUTCDate()+i*7);return day.toISOString().slice(0,10)+'T14:00:00-06:00';});
}
export function eligibleForSession(session,member){return mexicoDay(session.date)>=mexicoDay(member.joinedAt);}
// Hide ended events from list pickers without modifying their attendance records.
export function activeAttendanceEvents(events,now=Date.now(),includeHidden=false){
  const today=mexicoDay(now);
  return events.filter(event=>{
    if(!includeHidden && event.visible===false)return false;
    const end=new Date(event.endDate||'').getTime();
    if(Number.isFinite(end))return now<=end;
    if(!event.date || !Number.isFinite(new Date(event.date).getTime()))return true;
    const day=/^\d{4}-\d{2}-\d{2}$/.test(event.date)?event.date:mexicoDay(event.date);
    return day>=today;
  });
}
export function percentage(sessions, member, userId) {
  const counted=sessions.filter(s=>s.status==='closed' && (eligibleForSession(s,member)||s.records?.[userId]?.source==='manual'));
  const confirmed=counted.filter(s=>s.records?.[userId]?.status==='confirmed').length;
  return {confirmed,total:counted.length,percentage:counted.length?Math.round(confirmed/counted.length*100):null};
}
export async function handleAttendance(req,res,store=kv) {
  res.setHeader('Cache-Control','no-store');
  const b=req.body||{}, action=b.action, eventId=String(b.eventId||'');
  const admin=action.startsWith('attendance-admin-');
  let session;
  if(admin){if(!process.env.ADMIN_PASSWORD || b.password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:'Contraseña incorrecta'});}
  else {session=await getSessionUser(req,null,store);if(!session?.user?.approved)return res.status(403).json({error:'Inicia sesión con una cuenta autorizada.'});}
  if(action==='attendance-catalog'||action==='attendance-admin-catalog')return res.status(200).json({ok:true,events:activeAttendanceEvents(await getEvents(),Date.now(),admin).map(e=>({id:e.id,title:e.title})),generalId:GENERAL_ATTENDANCE_ID});
  if(!/^[\w-]{1,90}$/.test(eventId))return res.status(400).json({error:'Selecciona un evento.'});
  const general=eventId===GENERAL_ATTENDANCE_ID;
  if(!general && !await getEvent(eventId))return res.status(404).json({error:'Evento no encontrado.'});
  const key=`attendance:v1:${eventId}`, lock=key+':lock', owner=crypto.randomUUID();
  if(!await store.set(lock,owner,{nx:true,ex:30}))return res.status(409).json({error:'Se está guardando otro registro. Intenta nuevamente.'});
  try {
    const data=await store.get(key)||{members:{},sessions:[]};
    const resolveMember=id=>{const seen=new Set();while(data.aliases?.[id]&&!seen.has(id)){seen.add(id);id=data.aliases[id];}return id;};
    const memberId=resolveMember(session?.userId);
    const now=new Date().toISOString();
    if(general){
      // La lista general incluye las cuentas autorizadas; la de cada viaje permanece independiente.
      const ids=await store.smembers('users:all');
      const users=await Promise.all(ids.map(async id=>({id,user:await store.get(`user:${id}`)})));
      for(const {id,user} of users){
        if(!user||resolveMember(id)!==id)continue;
        if(user.approved && user.emailVerified!==false){
          if(!data.members[id])data.members[id]={mote:user.mote||'Integrante',joinedAt:now,active:true};
          else {data.members[id].active=true;data.members[id].mote=user.mote||data.members[id].mote;}
        }else if(data.members[id])data.members[id].active=false;
      }
      for(const date of upcomingSaturdays()){
        const id='sabado-'+date.slice(0,10);
        if(!data.excludedDates?.includes(date.slice(0,10)) && !data.sessions.some(s=>mexicoDay(s.date)===date.slice(0,10)))data.sessions.push({id,date:new Date(date).toISOString(),status:'scheduled',records:{}});
      }
    }
    const fail=message=>{throw Object.assign(new Error(message),{status:400});};
    const rehearsal=data.sessions.find(s=>s.id===b.sessionId);
    if(action==='attendance-admin-member'){
      if(general)fail('La lista de sábados incluye automáticamente a todos los integrantes autorizados.');
      const userId=resolveMember(String(b.userId||''));const user=await store.get(`user:${userId}`);
      if(!user?.approved)fail('Selecciona una cuenta autorizada.');
      if(!data.members[userId])data.members[userId]={mote:user.mote||'Integrante',joinedAt:now,active:true};
      else data.members[userId].active=b.active!==false;
    }else if(action==='attendance-admin-merge'){
      const sourceId=String(b.sourceId||''),targetId=String(b.targetId||'');
      if(!sourceId||sourceId===targetId||!data.members[sourceId]||!data.members[targetId])fail('Selecciona dos registros diferentes de esta lista.');
      const original=data.members[sourceId],target=data.members[targetId];
      data.mergedMembers={...(data.mergedMembers||{}),[sourceId]:{...original,mergedInto:targetId,mergedAt:now}};
      target.joinedAt=[original.joinedAt,target.joinedAt].sort()[0];target.active=target.active||original.active;
      const priority={confirmed:3,pending:2,absent:1};
      for(const rehearsal of data.sessions){
        const old=rehearsal.records?.[sourceId],current=rehearsal.records?.[targetId];
        // Keep original entries for the audit history; only the canonical member is counted.
        if(old&&(!current||(priority[old.status]||0)>(priority[current.status]||0)))rehearsal.records[targetId]={...old,mergedFrom:sourceId};
      }
      data.aliases={...(data.aliases||{}),[sourceId]:targetId};
      for(const id of Object.keys(data.aliases))data.aliases[id]=resolveMember(id);
      delete data.members[sourceId];
    }else if(action==='attendance-admin-create'){
      const date=new Date(b.date);if(!Number.isFinite(date.getTime()))fail('Indica la fecha y hora del ensayo.');
      if(general && new Date(mexicoDay(date)+'T12:00:00Z').getUTCDay()!==6)fail('Los ensayos generales son los sábados.');
      if(general && data.sessions.some(s=>mexicoDay(s.date)===mexicoDay(date)))fail('Ya existe el ensayo de ese sábado.');
      if(general)data.excludedDates=(data.excludedDates||[]).filter(day=>day!==mexicoDay(date));
      data.sessions.push({id:crypto.randomUUID(),date:date.toISOString(),status:'scheduled',records:{}});
    }else if(action==='attendance-admin-delete'){
      if(!rehearsal)fail('Ensayo no encontrado.');
      if(!['scheduled','cancelled'].includes(rehearsal.status))fail('Solo puedes eliminar ensayos programados o cancelados. Si no se realizó, cancélalo primero.');
      if(Object.values(rehearsal.records||{}).some(r=>r.status==='confirmed'))fail('Este ensayo tiene asistencias confirmadas y no se puede eliminar.');
      data.sessions=data.sessions.filter(s=>s.id!==rehearsal.id);
      if(general)data.excludedDates=[...new Set([...(data.excludedDates||[]),mexicoDay(rehearsal.date)])];
    }else if(action==='attendance-admin-manual'){
      if(!rehearsal || rehearsal.status==='cancelled')fail('Ensayo no disponible.');
      if(mexicoDay(rehearsal.date)>mexicoDay(now))fail('El registro manual está disponible el día del ensayo o después.');
      if(rehearsal.status!=='closed')rehearsal.status='open';
      rehearsal.manualOnly=true;delete rehearsal.code;delete rehearsal.expiresAt;
    }else if(action==='attendance-admin-open'){
      if(!rehearsal || !['scheduled','open'].includes(rehearsal.status))fail('Solo se puede abrir un ensayo programado o renovar uno abierto.');
      if(mexicoDay(rehearsal.date)!==mexicoDay(now))fail('Abre la lista el día del ensayo.');
      rehearsal.manualOnly=false;rehearsal.status='open';rehearsal.code=String(crypto.randomInt(100000,1000000));rehearsal.expiresAt=Date.now()+15*60000;
    }else if(action==='attendance-checkin'){
      if(!data.members[memberId]?.active)fail('El administrador debe agregarte a la lista del viaje.');
      const attemptsKey=`attendance:attempts:${eventId}:${b.sessionId}:${memberId}`;
      const attempts=await store.incr(attemptsKey);if(attempts===1)await store.expire(attemptsKey,900);if(attempts>10)fail('Demasiados intentos. Espera 15 minutos.');
      if(!rehearsal || rehearsal.manualOnly || rehearsal.status!=='open' || Date.now()>rehearsal.expiresAt || String(b.code)!==rehearsal.code)fail('Clave incorrecta, caducada o lista cerrada.');
      if(!rehearsal.records[memberId])rehearsal.records[memberId]={status:'pending',requestedAt:now};
    }else if(action==='attendance-admin-confirm'){
      if(!rehearsal || rehearsal.status==='cancelled' || !data.members[b.userId])fail('Registro no válido.');
      if(mexicoDay(rehearsal.date)>mexicoDay(now))fail('No se puede registrar asistencia a un ensayo futuro.');
      if(!['confirmed','absent'].includes(b.status))fail('Estado no válido.');
      rehearsal.records[b.userId]={...rehearsal.records[b.userId],status:b.status,source:rehearsal.records[b.userId]?.requestedAt?'code':'manual',reviewedAt:now};
    }else if(action==='attendance-admin-close' || action==='attendance-admin-cancel'){
      if(!rehearsal)fail('Ensayo no encontrado.');
      if(action.endsWith('close') && rehearsal.status!=='open')fail('Primero abre el ensayo.');
      rehearsal.status=action.endsWith('cancel')?'cancelled':'closed';delete rehearsal.code;delete rehearsal.expiresAt;
      if(rehearsal.status==='closed')for(const record of Object.values(rehearsal.records))if(record.status==='pending')record.status='absent';
    }else if(!['attendance-admin-list','attendance-list'].includes(action))fail('Acción no válida.');
    await store.set(key,data);
    const members=await Promise.all(Object.entries(data.members).map(async ([id,m])=>({id,...m,...percentage(data.sessions,m,id),...(admin?{email:(await store.get(`user:${id}`))?.email||''}:{})})));
    return res.status(200).json({ok:true,mode:general?'weekly':'fixed',serverNow:Date.now(),account:admin?undefined:{mote:session.user.mote,email:session.user.email},members:admin?members:members.filter(m=>m.id===memberId),sessions:data.sessions.filter(s=>admin||s.status!=='cancelled').map(s=>admin?s:({id:s.id,date:s.date,status:s.status,manualOnly:s.manualOnly===true,counted:s.status==='closed'&&!!data.members[memberId]&&(eligibleForSession(s,data.members[memberId])||s.records[memberId]?.source==='manual'),expiresAt:s.expiresAt,eligible:!!data.members[memberId]&&eligibleForSession(s,data.members[memberId]),myStatus:s.records[memberId]?.status||null}))});
  }catch(err){if(err.status)return res.status(err.status).json({error:err.message});throw err;}
  finally{await store.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",[lock],[owner]);}
}
