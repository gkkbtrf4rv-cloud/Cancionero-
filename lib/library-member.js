import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { kv } from '@vercel/kv';
import { get } from '@vercel/blob';
import { getSessionUser } from './auth.js';
import { listBooks, getKnowledgeChunks } from './library-store.js';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stop = new Set('a al con de del el en es la las lo los para por que un una y'.split(' '));
export function searchLibrary(query, chunks, bookId = '') {
  const terms = [...new Set(normalize(query).match(/[a-z0-9]+/g) || [])].filter(t => t.length > 1 && !stop.has(t)).slice(0, 8);
  if (!terms.length) return [];
  const ranked = [];
  for (const chunk of chunks) {
    if (bookId && chunk.bookId !== bookId) continue;
    const body = normalize(chunk.text), title = normalize(chunk.source || chunk.title);
    if (!terms.every(term => (body + ' ' + title).includes(term))) continue;
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : 0) + Math.min(body.split(term).length - 1, 8), 0);
    const at = Math.min(...terms.map(t => body.indexOf(t)).filter(n => n >= 0));
    const start = Number.isFinite(at) ? Math.max(0, at - 100) : 0;
    ranked.push({bookId:chunk.bookId, title:chunk.title, source:chunk.source, page:chunk.page, text:(start ? '…' : '') + chunk.text.slice(start, start + 650) + (chunk.text.length > start + 650 ? '…' : ''), score});
  }
  const seen = new Set();
  return ranked.sort((a,b) => b.score - a.score).filter(hit => {const key=hit.bookId+':'+(hit.page || 'text'); if(seen.has(key))return false;seen.add(key);return true;}).slice(0,30).map(({score,...hit})=>hit);
}
export function memberBook(book) {
  return {id:book.id,title:book.title,author:book.author,filename:book.filename,mimeType:book.mimeType,size:book.size,pages:book.pages};
}
const defaults={kv,get,listBooks,getKnowledgeChunks,getSessionUser};
async function approved(req,res,deps,token=null) {
  const session=await deps.getSessionUser(req,token);
  if(!session){res.status(401).json({error:'Inicia sesión desde el Cancionero para entrar a la Biblioteca.'});return null;}
  if(session.user.approved!==true){res.status(403).json({error:'Tu cuenta todavía no tiene acceso autorizado.'});return null;}
  return session;
}
export async function handleMemberLibrary(req,res,deps=defaults) {
  res.setHeader('Cache-Control','private, no-store');
  const session=await approved(req,res,deps);if(!session)return;
  const action=req.method==='GET'?req.query?.action:req.body?.action;
  if(action==='library-catalog')return res.status(200).json({ok:true,books:(await deps.listBooks()).map(memberBook)});
  if(action==='library-search' || action==='ai-ask') {
    const query=String(req.body?.query || req.body?.question || '').trim().slice(0,160), bookId=String(req.body?.bookId || '').slice(0,100);
    if(!query)return res.status(400).json({error:'Escribe palabras para buscar.'});
    const hits=searchLibrary(query,await deps.getKnowledgeChunks(),bookId);
    return res.status(200).json({ok:true,query,results:hits});
  }
  if(action==='library-open') {
    const book=(await deps.listBooks()).find(b=>b.id===req.body?.bookId);
    if(!book)return res.status(404).json({error:'Este libro ya no está disponible.'});
    const ticket=crypto.randomBytes(32).toString('base64url');
    await deps.kv.set('library:reader:'+ticket,{bookId:book.id,token:session.token},{ex:3600});
    return res.status(200).json({ok:true,url:'/api/cancionero?asset=book&bookId='+encodeURIComponent(book.id)+'&ticket='+ticket,book:memberBook(book)});
  }
  return res.status(400).json({error:'Acción no válida.'});
}
export async function handleMemberBook(req,res,deps=defaults) {
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
  const ticket=String(req.query?.ticket || '');
  let explicitToken=null;
  if(ticket){
    if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))return res.status(401).json({error:'Vuelve a abrir el libro desde la Biblioteca.'});
    const grant=await deps.kv.get('library:reader:'+ticket);
    if(!grant || grant.bookId!==req.query?.bookId)return res.status(401).json({error:'El acceso de lectura venció. Vuelve a abrir el libro.'});
    explicitToken=grant.token;
  }
  if(!await approved(req,res,deps,explicitToken))return;
  const book=(await deps.listBooks()).find(b=>b.id===req.query?.bookId);
  if(!book)return res.status(404).json({error:'Este libro ya no está disponible.'});
  const range=req.headers?.range;
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    const start=match?.[1],end=match?.[2];
    if(!match || (!start&&!end) || (start && (Number(start)>=book.size || (end&&Number(end)<Number(start)))) || (!start&&Number(end)===0)){
      res.setHeader('Content-Range','bytes */'+book.size);return res.status(416).end();
    }
  }
  const result=await deps.get(book.originalPath,{access:'private',headers:range?{Range:range}:{}});
  if(!result?.stream)return res.status(404).json({error:'No se encontró el archivo del libro.'});
  const contentRange=result.headers?.get('content-range');
  res.status(contentRange?206:200);
  res.setHeader('Content-Type',book.mimeType==='application/pdf'?'application/pdf':'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(book.filename || 'libro.pdf'));
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Accept-Ranges','bytes');
  if(contentRange)res.setHeader('Content-Range',contentRange);
  const length=result.headers?.get('content-length');if(length)res.setHeader('Content-Length',length);
  await pipeline(Readable.fromWeb(result.stream),res);
}
