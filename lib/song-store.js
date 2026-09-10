import { kv } from '@vercel/kv';
import { CANCIONES } from './canciones.js';
import { put, del, get } from '@vercel/blob';

const SONGS_STORE_KEY = 'app:songs-v2';
const LEGACY_CUSTOM_SONGS_KEY = 'app:custom-songs';

function safePathPart(v=''){ return String(v).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,90) || 'song'; }

function slugify(value='') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
    .slice(0,60) || 'cancion';
}

function baseSongs() {
  return CANCIONES.map((song, index) => ({
    ...song,
    id: `base-${String(index + 1).padStart(3,'0')}-${slugify(song.titulo)}`,
    origin: 'original'
  }));
}

export async function getAllSongs() {
  const store = await kv.get(SONGS_STORE_KEY);
  if (store && store.initialized === true && Array.isArray(store.songs)) return store.songs;

  // Migración única: pasa las canciones originales y las agregadas anteriormente a la base de datos.
  const legacyCustom = await kv.get(LEGACY_CUSTOM_SONGS_KEY);
  const originals = baseSongs();
  const used = new Set(originals.map(s => s.id));
  const extras = (Array.isArray(legacyCustom) ? legacyCustom : []).map((song, index) => {
    let id = String(song?.id || `admin-${Date.now()}-${index}`);
    while (used.has(id)) id = `${id}-${index + 1}`;
    used.add(id);
    return { ...song, id, origin: song?.origin || 'admin' };
  });
  const songs = [...originals, ...extras].sort((a,b)=>String(a.titulo).localeCompare(String(b.titulo),'es'));
  await kv.set(SONGS_STORE_KEY, { initialized:true, migratedAt:new Date().toISOString(), songs });
  return songs;
}

export async function saveAllSongs(songs) {
  const sorted = [...songs].sort((a,b)=>String(a.titulo).localeCompare(String(b.titulo),'es'));
  await kv.set(SONGS_STORE_KEY, { initialized:true, updatedAt:new Date().toISOString(), songs: sorted });
  return sorted;
}

export { SONGS_STORE_KEY };


function decodeJpegDataUri(imageData=''){
  const match=String(imageData).match(/^data:image\/jpeg;base64,(.+)$/);
  if(!match) throw new Error('JPEG_DATA_INVALID');
  return Buffer.from(match[1],'base64');
}

export async function saveSongCover(songId,imageData,previousPathname=''){
  const body=decodeJpegDataUri(imageData);
  const pathname=`canciones/${safePathPart(songId)}/portada-${Date.now()}.jpg`;
  let blob;
  try{blob=await put(pathname,body,{access:'private',contentType:'image/jpeg',addRandomSuffix:false});}
  catch(err){console.error('Error subiendo portada de canción:',err);const e=new Error('BLOB_UPLOAD_FAILED');e.cause=err;throw e;}
  if(previousPathname && previousPathname!==blob.pathname){try{await del(previousPathname);}catch{}}
  return {pathname:blob.pathname||pathname,updatedAt:new Date().toISOString()};
}

export async function deleteSongCover(pathname=''){
  if(!pathname)return;
  try{await del(pathname);}catch(err){console.error('No se pudo borrar portada de canción:',err);}
}

export async function getSongCoverBlob(pathname=''){
  if(!pathname)return null;
  return get(pathname,{access:'private',useCache:false});
}
