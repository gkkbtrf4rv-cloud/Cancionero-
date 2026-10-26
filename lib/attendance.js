import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { getSessionUser } from './auth.js';
import { getEvent } from './event-store.js';

export function percentage(sessions, member, userId) {
  const counted=sessions.filter(s=>s.status==='closed' && s.date>=member.joinedAt);
  const confirmed=counted.filter(s=>s.records?.[userId]?.status==='confirmed').length;
  return {confirmed,total:counted.length,percentage:counted.length?Math.round(confirmed/counted.length*100):null};
}
export async function handleAttendance(req,res,store=kv) {
  res.setHeader('Cache-Control','no-store');
  const b=req.body||{}, action=b.action, eventId=String(b.eventId||'');
  if(!/^[\w-]{1,90}$/.test(eventId))return res.status(400).json({error:'Selecciona un evento.'});
  const admin=action.startsWith('attendance-admin-');
  let session;
  if(admin){if(!process.env.ADMIN_PASSWORD || b.password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:'Contraseña incorrecta'});}
  else {session=await getSessionUser(req,null,store);if(!session?.user?.approved)return res.status(403).json({error:'Inicia sesión con una cuenta autorizada.'});}
  if(!await getEvent(eventId))return res.status(404).json({error:'Evento no encontrado.'});
  const key=`attendance:v1:${eventId}`, lock=key+':lock', owner=crypto.randomUUID();
  if(!await store.set(lock,owner,{nx:true,ex:30}))return res.status(409).json({error:'Se está guardando otro registro. Intenta nuevamente.'});
  try {
    const data=await store.get(key)||{members:{},sessions:[]};
    const now=new Date().toISOString();
    const fail=message=>{throw Object.assign(new Error(message),{status:400});};
    const rehearsal=data.sessions.find(s=>s.id===b.sessionId);
    if(action==='attendance-admin-member'){
      const userId=String(b.userId||'');const user=await store.get(`user:${userId}`);
      if(!user?.approved)fail('Selecciona una cuenta autorizada.');
      if(!data.members[userId])data.members[userId]={mote:user.mote||'Integrante',joinedAt:now,active:true};
      else data.members[userId].active=b.active!==false;
    }else if(action==='attendance-admin-create'){
      const date=new Date(b.date);if(!Number.isFinite(date.getTime()))fail('Indica la fecha y hora del ensayo.');
      data.sessions.push({id:crypto.randomUUID(),date:date.toISOString(),status:'scheduled',records:{}});
    }else if(action==='attendance-admin-open'){
      if(!rehearsal || !['scheduled','open'].includes(rehearsal.status))fail('Solo se puede abrir un ensayo programado o renovar uno abierto.');
      if(rehearsal.date.slice(0,10)!==now.slice(0,10) && Math.abs(Date.now()-Date.parse(rehearsal.date))>12*3600000)fail('Abre la lista el día del ensayo.');
      rehearsal.status='open';rehearsal.code=String(crypto.randomInt(100000,1000000));rehearsal.expiresAt=Date.now()+15*60000;
    }else if(action==='attendance-checkin'){
      if(!data.members[session.userId]?.active)fail('El administrador debe agregarte a la lista del viaje.');
      const attemptsKey=`attendance:attempts:${eventId}:${b.sessionId}:${session.userId}`;
      const attempts=await store.incr(attemptsKey);if(attempts===1)await store.expire(attemptsKey,900);if(attempts>10)fail('Demasiados intentos. Espera 15 minutos.');
      if(!rehearsal || rehearsal.status!=='open' || Date.now()>rehearsal.expiresAt || String(b.code)!==rehearsal.code)fail('Clave incorrecta, caducada o lista cerrada.');
      if(!rehearsal.records[session.userId])rehearsal.records[session.userId]={status:'pending',requestedAt:now};
    }else if(action==='attendance-admin-confirm'){
      if(!rehearsal || rehearsal.status==='cancelled' || !data.members[b.userId])fail('Registro no válido.');
      if(!['confirmed','absent'].includes(b.status))fail('Estado no válido.');
      rehearsal.records[b.userId]={...rehearsal.records[b.userId],status:b.status,reviewedAt:now};
    }else if(action==='attendance-admin-close' || action==='attendance-admin-cancel'){
      if(!rehearsal)fail('Ensayo no encontrado.');
      if(action.endsWith('close') && rehearsal.status!=='open')fail('Primero abre el ensayo.');
      rehearsal.status=action.endsWith('cancel')?'cancelled':'closed';delete rehearsal.code;delete rehearsal.expiresAt;
      if(rehearsal.status==='closed')for(const record of Object.values(rehearsal.records))if(record.status==='pending')record.status='absent';
    }else if(!['attendance-admin-list','attendance-list'].includes(action))fail('Acción no válida.');
    await store.set(key,data);
    const members=Object.entries(data.members).map(([id,m])=>({id,...m,...percentage(data.sessions,m,id)}));
    return res.status(200).json({ok:true,members:admin?members:members.filter(m=>m.id===session.userId),sessions:data.sessions.map(s=>admin?s:({id:s.id,date:s.date,status:s.status,expiresAt:s.expiresAt,myStatus:s.records[session.userId]?.status||null}))});
  }catch(err){if(err.status)return res.status(err.status).json({error:err.message});throw err;}
  finally{await store.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",[lock],[owner]);}
}
