import { kv } from '@vercel/kv';

const EVENTS_KEY = 'app:events-v1';
const commentsKey = id => `event:${id}:comments`;
const photoIndexKey = id => `event:${id}:photos-index`;
const photoDataKey = (id, photoId) => `event:${id}:photo:${photoId}`;

function cleanText(v='', max=500){ return String(v ?? '').trim().slice(0,max); }
function toBool(v, fallback=true){ return typeof v === 'boolean' ? v : fallback; }

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
    const [comments, photos]=await Promise.all([kv.get(commentsKey(e.id)), kv.get(photoIndexKey(e.id))]);
    return {...e, commentCount:Array.isArray(comments)?comments.length:0, photoCount:Array.isArray(photos)?photos.length:0};
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
export async function addPhoto(eventId, meta, imageData){
  const index=await getPhotoIndex(eventId);
  index.push(meta);
  await Promise.all([kv.set(photoIndexKey(eventId), index.slice(-400)), kv.set(photoDataKey(eventId,meta.id), imageData)]);
  return meta;
}
export async function getPhotoPage(eventId, offset=0, limit=12){
  const index=await getPhotoIndex(eventId);
  const sorted=[...index].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const slice=sorted.slice(offset, offset+limit);
  const items=await Promise.all(slice.map(async meta=>({...meta,imageData:await kv.get(photoDataKey(eventId,meta.id))})));
  return {items,total:sorted.length,nextOffset:offset+slice.length<sorted.length?offset+slice.length:null};
}
export async function deleteOwnPhoto(eventId, photoId, userId){
  const index=await getPhotoIndex(eventId);
  const found=index.find(p=>p.id===photoId);
  if(!found || found.userId!==userId) return false;
  await Promise.all([kv.set(photoIndexKey(eventId),index.filter(p=>p.id!==photoId)),kv.del(photoDataKey(eventId,photoId))]);
  return true;
}
export async function deleteEventData(eventId){
  const index=await getPhotoIndex(eventId);
  await Promise.all([
    kv.del(commentsKey(eventId)),
    kv.del(photoIndexKey(eventId)),
    ...index.map(p=>kv.del(photoDataKey(eventId,p.id)))
  ]);
}

export { EVENTS_KEY };
