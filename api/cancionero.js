import crypto from 'crypto';
import { getSessionUser } from '../lib/auth.js';
import { kv } from '@vercel/kv';
import { getAllSongs, saveAllSongs } from '../lib/song-store.js';
import { cleanEvent, getEvents, saveEvents, getEvent, getEventSummaries, getComments, addComment, getPhotoIndex, addPhoto, getPhotoPage, deleteOwnPhoto, deleteEventData } from '../lib/event-store.js';

function adminOk(password) { return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD; }
function keepSpacing(value='', max=500) { return String(value ?? '').replace(/\r/g,'').slice(0,max); }
function cleanLine(line = {}) { return { acordes: keepSpacing(line.acordes, 180), texto: keepSpacing(line.texto, 500) }; }
function cleanSong(song = {}, id = '') {
  const titulo = String(song.titulo || '').trim().slice(0, 120);
  const musica = String(song.musica || '').trim().slice(0, 800);
  const estrofas = Array.isArray(song.estrofas) ? song.estrofas.slice(0,80).map(st=>Array.isArray(st)?st.slice(0,40).map(cleanLine).filter(x=>x.acordes.trim()||x.texto.trim()):[]).filter(st=>st.length) : [];
  return { id:id||String(song.id||`admin-${Date.now()}`), titulo, musica, estrofas, origin:String(song.origin||'admin')==='original'?'original':'admin' };
}
function mergedVersion(songs, events) { return crypto.createHash('sha256').update(JSON.stringify({songs,events})).digest('hex').slice(0,16); }
function safeText(v='',max=600){return String(v??'').trim().slice(0,max);}

async function requireApproved(req,res){
  const session=await getSessionUser(req);
  if(!session){res.status(401).json({error:'Inicia sesión para continuar.'});return null;}
  if(session.user.approved!==true){res.status(403).json({error:'Tu cuenta no tiene acceso autorizado.'});return null;}
  return session;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const action=req.body?.action;
      const adminActions=new Set(['set-popup','clear-popup','get-popup-admin','list-songs','list-custom-songs','save-song','save-custom-song','delete-song','delete-custom-song','list-events-admin','save-event','delete-event']);
      if(adminActions.has(action)){
        if(!adminOk(req.body?.password)) return res.status(401).json({error:'Contraseña incorrecta'});
        if(action==='set-popup'){
          const imageData=String(req.body?.imageData||''),title=safeText(req.body?.title,80),body=safeText(req.body?.body,300);
          if(!imageData.startsWith('data:image/')) return res.status(400).json({error:'Selecciona una imagen válida.'});
          if(imageData.length>1_250_000) return res.status(413).json({error:'La imagen sigue siendo demasiado pesada. Usa una foto más pequeña.'});
          const popup={id:`popup-${Date.now()}`,imageData,title,body,active:true,createdAt:new Date().toISOString()}; await kv.set('app:popup',popup); return res.status(200).json({ok:true,popup:{...popup,imageData:undefined}});
        }
        if(action==='clear-popup'){await kv.del('app:popup');return res.status(200).json({ok:true});}
        if(action==='get-popup-admin'){return res.status(200).json({ok:true,popup:(await kv.get('app:popup'))||null});}
        if(action==='list-songs'||action==='list-custom-songs'){const songs=await getAllSongs();return res.status(200).json({ok:true,songs,total:songs.length});}
        if(action==='save-song'||action==='save-custom-song'){
          const songs=await getAllSongs(),incomingId=String(req.body?.song?.id||'').trim(),existing=incomingId?songs.find(s=>s.id===incomingId):null;
          const song=cleanSong({...req.body?.song,origin:existing?.origin||'admin'},incomingId||`admin-${Date.now()}`);
          if(!song.titulo)return res.status(400).json({error:'Escribe el título de la canción.'}); if(!song.estrofas.length)return res.status(400).json({error:'Agrega al menos una línea de letra o acordes.'});
          const idx=songs.findIndex(s=>s.id===song.id);if(idx>=0)songs[idx]=song;else songs.push(song);const saved=await saveAllSongs(songs);return res.status(200).json({ok:true,song,total:saved.length});
        }
        if(action==='delete-song'||action==='delete-custom-song'){const id=String(req.body?.id||'').trim(),songs=await getAllSongs(),next=songs.filter(s=>s.id!==id);if(next.length===songs.length)return res.status(404).json({error:'Canción no encontrada.'});await saveAllSongs(next);return res.status(200).json({ok:true,total:next.length});}
        if(action==='list-events-admin'){const events=await getEventSummaries({includeHidden:true});return res.status(200).json({ok:true,events});}
        if(action==='save-event'){
          const events=await getEvents();const incomingId=safeText(req.body?.event?.id,90);const existing=incomingId?events.find(e=>e.id===incomingId):null;const event=cleanEvent(req.body?.event||{},existing);
          if(!event.title)return res.status(400).json({error:'Escribe el nombre del evento.'}); if(!event.date)return res.status(400).json({error:'Selecciona fecha y hora.'});
          const idx=events.findIndex(e=>e.id===event.id);if(idx>=0)events[idx]=event;else events.push(event);await saveEvents(events);return res.status(200).json({ok:true,event});
        }
        if(action==='delete-event'){const id=safeText(req.body?.id,90),events=await getEvents(),next=events.filter(e=>e.id!==id);if(next.length===events.length)return res.status(404).json({error:'Evento no encontrado.'});await saveEvents(next);await deleteEventData(id);return res.status(200).json({ok:true});}
      }

      // Acciones de integrantes autorizados para eventos.
      const session=await requireApproved(req,res); if(!session)return;
      const eventId=safeText(req.body?.eventId,90); const event=await getEvent(eventId);
      if(!event || event.visible===false)return res.status(404).json({error:'Evento no encontrado.'});
      if(action==='event-detail'){
        const [comments,index]=await Promise.all([getComments(eventId),getPhotoIndex(eventId)]);
        const mine=index.filter(p=>p.userId===session.userId).length;
        return res.status(200).json({ok:true,event,comments,photoCount:index.length,myPhotoCount:mine});
      }
      if(action==='event-photos'){
        const offset=Math.max(0,Number(req.body?.offset)||0);const page=await getPhotoPage(eventId,offset,12);return res.status(200).json({ok:true,...page});
      }
      if(action==='add-event-comment'){
        if(event.commentsEnabled===false)return res.status(403).json({error:'Los comentarios están desactivados para este evento.'});
        const text=safeText(req.body?.text,600);if(!text)return res.status(400).json({error:'Escribe un comentario.'});
        const comment={id:`comment-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,userId:session.userId,mote:safeText(session.user.mote,80),text,createdAt:new Date().toISOString()};await addComment(eventId,comment);return res.status(200).json({ok:true,comment});
      }
      if(action==='upload-event-photo'){
        if(event.photosEnabled===false)return res.status(403).json({error:'El álbum está desactivado para este evento.'});
        const index=await getPhotoIndex(eventId),mine=index.filter(p=>p.userId===session.userId);if(mine.length>=event.maxPhotosPerUser)return res.status(409).json({error:`Ya subiste el máximo de ${event.maxPhotosPerUser} fotos para este evento.`});
        const imageData=String(req.body?.imageData||'');if(!imageData.startsWith('data:image/jpeg'))return res.status(400).json({error:'La foto debe enviarse como JPEG.'});if(imageData.length>520000)return res.status(413).json({error:'La foto es demasiado pesada. Intenta con otra.'});
        const meta={id:`photo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,userId:session.userId,mote:safeText(session.user.mote,80),caption:safeText(req.body?.caption,160),createdAt:new Date().toISOString()};await addPhoto(eventId,meta,imageData);return res.status(200).json({ok:true,photo:meta,myPhotoCount:mine.length+1});
      }
      if(action==='delete-event-photo'){
        const photoId=safeText(req.body?.photoId,100);const ok=await deleteOwnPhoto(eventId,photoId,session.userId);if(!ok)return res.status(404).json({error:'No se encontró esa foto o no te pertenece.'});return res.status(200).json({ok:true});
      }
      return res.status(400).json({error:'Acción no válida.'});
    }

    if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});
    const session=await requireApproved(req,res);if(!session)return;
    const [popup,canciones,eventos]=await Promise.all([kv.get('app:popup'),getAllSongs(),getEventSummaries()]);
    const version=mergedVersion(canciones,eventos.map(({commentCount,photoCount,...e})=>e));
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ok:true,version,canciones,eventos,popup:popup?.active?popup:null});
  } catch(err){console.error('Error en cancionero:',err);return res.status(500).json({error:'No se pudo procesar la solicitud.'});}
}
