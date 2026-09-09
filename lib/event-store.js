import { kv } from '@vercel/kv';
import { put, del, issueSignedToken, presignUrl } from '@vercel/blob';

const EVENTS_KEY = 'app:events-v1';
const commentsKey = id => `event:${id}:comments`;
const photoIndexKey = id => `event:${id}:photos-index`;
// Compatibilidad con fotos antiguas que estaban guardadas en KV.
const legacyPhotoDataKey = (id, photoId) => `event:${id}:photo:${photoId}`;

function cleanText(v='', max=500){ return String(v ?? '').trim().slice(0,max); }
function toBool(v, fallback=true){ return typeof v === 'boolean' ? v : fallback; }
function safePathPart(v=''){ return String(v).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,90) || 'item'; }

export function cleanEvent(input={}, existing=null){
  const id = cleanText(input.id || existing?.id || `event-${Date.now()}`, 90);
  const maxPhotosPerUser = Math.min(5, Math.max(3, Number(input.maxPhotosPerUser ?? existing?.maxPhotosPerUser ?? 5) || 5));
  return {
    id,
    title: cleanText(input.title, 120),
    kind: cleanText(input.kind || 'Evento', 40),
    date: cleanText(input.date, 40),
    endDate: cleanText(input.endDate, 40),
    location: cleanText(input.location, 160),
    description: cleanText(input.description, 1600),
    countdown: toBool(input.countdown, true),
    commentsEnabled: toBool(input.commentsEnabled, true),
    photosEnabled: toBool(input.photosEnabled, true),
    maxPhotosPerUser,
    visible: toBool(input.visible, true),
    coverPathname: existing?.coverPathname || cleanText(input.coverPathname, 240),
    coverUpdatedAt: existing?.coverUpdatedAt || cleanText(input.coverUpdatedAt, 40),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function getEvents(){
  const events = await kv.get(EVENTS_KEY);
  return Array.isArray(events) ? events : [];
}
export async function saveEvents(events){
  const sorted=[...events].sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')));
  await kv.set(EVENTS_KEY, sorted);
  return sorted;
}
export async function getEvent(id){ return (await getEvents()).find(e=>e.id===id) || null; }

export async function getEventSummaries({includeHidden=false}={}){
  const events=(await getEvents()).filter(e=>includeHidden || e.visible!==false);
  return Promise.all(events.map(async e=>{
    const [comments, photos, coverImageUrl]=await Promise.all([kv.get(commentsKey(e.id)), kv.get(photoIndexKey(e.id)), e.coverPathname?signedPhotoUrl({pathname:e.coverPathname}):Promise.resolve(null)]);
    return {...e, coverImageUrl, commentCount:Array.isArray(comments)?comments.length:0, photoCount:Array.isArray(photos)?photos.length:0};
  }));
}

export async function getComments(eventId){
  const v=await kv.get(commentsKey(eventId));
  return Array.isArray(v)?v:[];
}
export async function addComment(eventId, comment){
  const list=await getComments(eventId);
  list.push(comment);
  const trimmed=list.slice(-300);
  await kv.set(commentsKey(eventId), trimmed);
  return trimmed;
}

export async function getPhotoIndex(eventId){
  const v=await kv.get(photoIndexKey(eventId));
  return Array.isArray(v)?v:[];
}

function decodeJpegDataUri(imageData=''){
  const match=String(imageData).match(/^data:image\/jpeg;base64,(.+)$/);
  if(!match) throw new Error('JPEG_DATA_INVALID');
  return Buffer.from(match[1], 'base64');
}

export async function addPhoto(eventId, meta, imageData){
  const index=await getPhotoIndex(eventId);
  const body=decodeJpegDataUri(imageData);
  const pathname=`eventos/${safePathPart(eventId)}/${safePathPart(meta.id)}.jpg`;
  let blob;
  try {
    blob=await put(pathname, body, {
      access:'private',
      contentType:'image/jpeg',
      addRandomSuffix:false
    });
  } catch (err) {
    console.error('Error subiendo foto a Vercel Blob:', err);
    const e=new Error('BLOB_UPLOAD_FAILED');
    e.cause=err;
    throw e;
  }
  const stored={...meta, storage:'vercel-blob-private', pathname:blob.pathname||pathname, blobUrl:blob.url||null};
  index.push(stored);
  try {
    await kv.set(photoIndexKey(eventId), index.slice(-400));
  } catch (err) {
    try { await del(stored.pathname || stored.blobUrl); } catch {}
    throw err;
  }
  return stored;
}


export async function saveEventCover(eventId, imageData, previousPathname=''){
  const body=decodeJpegDataUri(imageData);
  const pathname=`eventos/${safePathPart(eventId)}/portada-${Date.now()}.jpg`;
  let blob;
  try{
    blob=await put(pathname, body, {access:'private',contentType:'image/jpeg',addRandomSuffix:false});
  }catch(err){
    console.error('Error subiendo portada a Vercel Blob:',err);
    const e=new Error('BLOB_UPLOAD_FAILED'); e.cause=err; throw e;
  }
  if(previousPathname && previousPathname!==blob.pathname){ try{ await del(previousPathname); }catch{} }
  return {pathname:blob.pathname||pathname,updatedAt:new Date().toISOString()};
}

export async function deleteEventCover(pathname=''){
  if(!pathname)return;
  try{await del(pathname);}catch(err){console.error('No se pudo borrar la portada del evento:',err);}
}

async function signedPhotoUrl(meta){
  if(!meta?.pathname) return null;
  try {
    // Forma recomendada por Vercel Blob: el token delega GET y la URL
    // queda limitada al pathname concreto y a 30 minutos.
    const token=await issueSignedToken({ operations:['get'] });
    const { presignedUrl }=await presignUrl(token, {
      pathname:meta.pathname,
      operation:'get',
      validUntil:Date.now()+30*60*1000
    });
    return presignedUrl || null;
  } catch (err) {
    console.error('No se pudo generar URL firmada para Blob privado:', err);
    return null;
  }
}

export async function getPhotoPage(eventId, offset=0, limit=12){
  const index=await getPhotoIndex(eventId);
  const sorted=[...index].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const slice=sorted.slice(offset, offset+limit);
  const items=await Promise.all(slice.map(async meta=>{
    // Fotos nuevas: URL privada temporal. Fotos antiguas: siguen leyendo su data URI desde KV.
    if(meta?.storage==='vercel-blob-private' && meta.pathname){
      return {...meta, imageUrl:await signedPhotoUrl(meta)};
    }
    const imageData=await kv.get(legacyPhotoDataKey(eventId,meta.id));
    return {...meta,imageData:imageData||null};
  }));
  return {items,total:sorted.length,nextOffset:offset+slice.length<sorted.length?offset+slice.length:null};
}

export async function deleteOwnPhoto(eventId, photoId, userId){
  const index=await getPhotoIndex(eventId);
  const found=index.find(p=>p.id===photoId);
  if(!found || found.userId!==userId) return false;
  await kv.set(photoIndexKey(eventId),index.filter(p=>p.id!==photoId));
  try {
    if(found.storage==='vercel-blob-private' && (found.pathname||found.blobUrl)) await del(found.pathname||found.blobUrl);
    else await kv.del(legacyPhotoDataKey(eventId,photoId));
  } catch(err){ console.error('No se pudo borrar el archivo de la foto:',err); }
  return true;
}

export async function deleteEventData(eventId, event=null){
  const index=await getPhotoIndex(eventId);
  await Promise.all([
    kv.del(commentsKey(eventId)),
    kv.del(photoIndexKey(eventId))
  ]);
  if(event?.coverPathname) await deleteEventCover(event.coverPathname);
  await Promise.all(index.map(async p=>{
    try {
      if(p.storage==='vercel-blob-private' && (p.pathname||p.blobUrl)) await del(p.pathname||p.blobUrl);
      else await kv.del(legacyPhotoDataKey(eventId,p.id));
    } catch(err){ console.error('No se pudo borrar una foto del evento:',err); }
  }));
}

export { EVENTS_KEY };
