import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { head, get, del } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { saveBook } from './library-store.js';

export const MAX_BOOK_BYTES = 100 * 1024 * 1024;
export const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const key = id => 'library:upload:' + id;
const clean = (v, max) => String(v || '').trim().slice(0, max);
const publicBook = ({ originalPath, chunksPath, ...book }) => book;

export function validateIndex(chunks) {
  if (!Array.isArray(chunks) || !chunks.length || chunks.length > 15000) throw new Error('El libro no contiene texto consultable o es demasiado extenso. Si es un escaneo, necesita OCR.');
  let characters = 0;
  return chunks.map(chunk => {
    if (!chunk || typeof chunk.text !== 'string' || !chunk.text.trim() || chunk.text.length > 2400) throw new Error('Índice del libro inválido.');
    characters += chunk.text.length;
    if (characters > 10000000) throw new Error('El texto supera 10 millones de caracteres. Divide el libro en volúmenes.');
    const page = chunk.page == null ? null : Number(chunk.page);
    if (page !== null && (!Number.isInteger(page) || page < 1 || page > 10000)) throw new Error('Página inválida.');
    return {text:chunk.text, page, part:Math.max(1, Math.floor(Number(chunk.part) || 1))};
  });
}

export async function handleLibraryUpload(req, res, deps = {kv, head, get, del, token:generateClientTokenFromReadWriteToken, saveBook}) {
  res.setHeader('Cache-Control', 'no-store');
  const body = req.body || {};
  if (body.action === 'library-upload-start') {
    const title = clean(body.title, 160), filename = clean(body.filename, 180);
    const size = Number(body.size), mimeType = clean(body.mimeType, 100);
    if (!title || !filename || !Number.isInteger(size) || size < 1) return res.status(400).json({error:'Escribe el título y selecciona un archivo válido.'});
    if (size > MAX_BOOK_BYTES) return res.status(413).json({error:'El archivo supera 100 MB.'});
    if (!['application/pdf','text/plain','text/markdown'].includes(mimeType)) return res.status(400).json({error:'Solo PDF, TXT o MD.'});
    const id = crypto.randomUUID();
    const originalPath = `biblioteca/${id}/original.${mimeType === 'application/pdf' ? 'pdf' : 'txt'}`;
    const chunksPath = `biblioteca/${id}/indice.json`;
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const pending = {id, title, filename, author:clean(body.author,120), mimeType, size, originalPath, chunksPath, expiresAt};
    await deps.kv.set(key(id), pending, {ex:7200});
    const constraints = {validUntil:expiresAt, addRandomSuffix:false, allowOverwrite:false};
    const [originalToken, indexToken] = await Promise.all([
      deps.token({...constraints, pathname:originalPath, maximumSizeInBytes:size, allowedContentTypes:[mimeType]}),
      deps.token({...constraints, pathname:chunksPath, maximumSizeInBytes:MAX_INDEX_BYTES, allowedContentTypes:['application/json']})
    ]);
    return res.status(200).json({ok:true,id,originalPath,chunksPath,originalToken,indexToken});
  }
  const id = clean(body.id, 100);
  if (!/^[a-f0-9-]{36}$/.test(id)) return res.status(400).json({error:'Carga inválida.'});
  const pending = await deps.kv.get(key(id));
  if (!pending) return res.status(410).json({error:'La carga venció. Vuelve a seleccionar el libro.'});
  if (pending.book) return res.status(200).json({ok:true,book:pending.book});
  if (body.action === 'library-upload-abort') {
    await Promise.allSettled([deps.del(pending.originalPath),deps.del(pending.chunksPath)]);
    await deps.kv.del(key(id));
    return res.status(200).json({ok:true});
  }
  if (body.action !== 'library-upload-finish') return res.status(400).json({error:'Acción inválida.'});
  const [original, index] = await Promise.all([deps.head(pending.originalPath), deps.head(pending.chunksPath)]);
  if (original.size !== pending.size || original.contentType !== pending.mimeType || index.size > MAX_INDEX_BYTES || index.contentType !== 'application/json') return res.status(400).json({error:'La carga quedó incompleta o no corresponde al archivo seleccionado.'});
  const result = await deps.get(pending.chunksPath, {access:'private',useCache:false});
  if (!result || result.statusCode !== 200 || !result.stream) return res.status(409).json({error:'No se pudo leer el índice. Reintenta la carga.'});
  const parts = []; let bytes = 0;
  for await (const part of result.stream) {
    bytes += part.byteLength;
    if (bytes > MAX_INDEX_BYTES) return res.status(413).json({error:'El índice es demasiado extenso.'});
    parts.push(Buffer.from(part));
  }
  let chunks;
  try { chunks = validateIndex(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
  catch (error) { return res.status(400).json({error:error.message}); }
  // Prevent duplicate entries when the browser retries or two finish requests overlap.
  const lockKey = key(id) + ':lock';
  if (!await deps.kv.set(lockKey, '1', {nx:true,ex:120})) return res.status(409).json({error:'El libro se está registrando. Espera unos segundos y actualiza la lista.'});
  try {
    const current = await deps.kv.get(key(id));
    if (current?.book) return res.status(200).json({ok:true,book:current.book});
    const saved = await deps.saveBook({...pending, chunks});
    const book = publicBook(saved);
    await deps.kv.set(key(id), {...pending, book}, {ex:7200});
    return res.status(200).json({ok:true,book});
  } finally { await deps.kv.del(lockKey); }
}
