import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { put, get, del } from '@vercel/blob';

export const PERMISSION_KEY = 'app:rehearsal-permission:v1';
export const MAX_PERMISSION_BYTES = 3000000;
const defaults = { kv, put, get, del };

export function decodePermission(fileData) {
  const match = String(fileData || '').match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) throw new Error('Selecciona un PDF o una imagen JPEG, PNG o WebP válida.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_PERMISSION_BYTES) throw new Error('El archivo debe pesar entre 1 byte y 3 MB.');
  const mimeType = match[1];
  const valid = mimeType === 'application/pdf' ? buffer.subarray(0,5).toString() === '%PDF-'
    : mimeType === 'image/jpeg' ? buffer.subarray(0,3).equals(Buffer.from([255,216,255]))
    : mimeType === 'image/png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP';
  if (!valid) throw new Error('El contenido no corresponde al tipo de archivo seleccionado.');
  return { buffer, mimeType };
}
export async function getPermission(deps = defaults) { return (await deps.kv.get(PERMISSION_KEY)) || null; }
export function permissionMetadata(doc) {
  if (!doc) return null;
  const { pathname, ...metadata } = doc;
  return { ...metadata, url: `/api/cancionero?asset=permission&v=${encodeURIComponent(doc.version)}` };
}
export async function savePermission({ fileData, filename }, deps = defaults) {
  const { buffer, mimeType } = decodePermission(fileData);
  const version = crypto.randomUUID();
  const ext = { 'application/pdf':'pdf', 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[mimeType];
  const old = await getPermission(deps);
  const blob = await deps.put(`permisos/ensayo-${version}.${ext}`, buffer, { access:'private', contentType:mimeType, addRandomSuffix:false });
  const doc = { pathname:blob.pathname, version, mimeType, size:buffer.length, filename:String(filename || `permiso.${ext}`).replace(/[\r\n]/g,'').slice(0,180), updatedAt:new Date().toISOString() };
  try { await deps.kv.set(PERMISSION_KEY, doc); }
  catch (err) { await deps.del(blob.pathname).catch(() => {}); throw err; }
  // Publicar la referencia nueva antes de retirar la anterior conserva el permiso si falla la subida.
  if (old?.pathname) await deps.del(old.pathname).catch(() => {});
  return permissionMetadata(doc);
}
export async function getPermissionBlob(doc, deps = defaults) {
  return deps.get(doc.pathname, { access:'private', useCache:false });
}
export async function handlePermissionAdmin(req, res) {
  if (req.body.action === 'permission-admin') return res.status(200).json({ ok:true, permission:permissionMetadata(await getPermission()) });
  try { decodePermission(req.body.fileData); }
  catch (err) { return res.status(400).json({ error:err.message }); }
  return res.status(200).json({ ok:true, permission:await savePermission(req.body) });
}
