import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { put, get, del } from '@vercel/blob';

const INDEX_KEY='library:books:v1';

function safe(v='',max=160){return String(v??'').trim().slice(0,max);}
function safePath(v=''){return safe(v,100).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-')||'libro';}

export function chunkText(text='', page=null, target=2200, overlap=220){
  const src=String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n').trim();
  if(!src)return[];
  const chunks=[];let start=0,part=1;
  while(start<src.length){
    let end=Math.min(src.length,start+target);
    if(end<src.length){
      const para=src.lastIndexOf('\n\n',end), sentence=src.lastIndexOf('. ',end);
      const best=Math.max(para,sentence);
      if(best>start+900)end=best+1;
    }
    const body=src.slice(start,end).trim();
    if(body)chunks.push({page,part:part++,text:body});
    if(end>=src.length)break;
    start=Math.max(start+1,end-overlap);
  }
  return chunks;
}

async function readPrivateJson(pathname=''){
  if(!pathname)return[];
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result||result.statusCode!==200||!result.stream)return[];
  const chunks=[];
  for await(const part of result.stream)chunks.push(Buffer.from(part));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function listBooks(){
  const data=await kv.get(INDEX_KEY);
  return Array.isArray(data)?data:[];
}

export async function saveBook({title,author='',filename,mimeType,size,originalBuffer,chunks}){
  const id='book-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');
  const stamp=Date.now(), stem=safePath(title||filename);
  const ext=(String(filename||'').split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase()||'bin';
  const originalPath=`biblioteca/${id}/${stem}-${stamp}.${ext}`;
  const chunksPath=`biblioteca/${id}/indice-${stamp}.json`;

  const [originalBlob,chunksBlob]=await Promise.all([
    put(originalPath,originalBuffer,{access:'private',contentType:mimeType||'application/octet-stream',addRandomSuffix:false}),
    put(chunksPath,Buffer.from(JSON.stringify(chunks)),{access:'private',contentType:'application/json',addRandomSuffix:false})
  ]);

  const book={
    id,title:safe(title||filename,160),author:safe(author,120),filename:safe(filename,180),
    mimeType:safe(mimeType,100),size:Number(size)||originalBuffer.length,
    pages:Math.max(0,...chunks.map(c=>Number(c.page)||0)),
    chunks:chunks.length,originalPath:originalBlob.pathname||originalPath,chunksPath:chunksBlob.pathname||chunksPath,
    createdAt:new Date().toISOString()
  };
  const books=await listBooks(); books.unshift(book); await kv.set(INDEX_KEY,books);
  return book;
}

export async function deleteBook(id=''){
  const books=await listBooks(); const book=books.find(b=>b.id===id);
  if(!book)return false;
  await kv.set(INDEX_KEY,books.filter(b=>b.id!==id));
  await Promise.allSettled([book.originalPath?del(book.originalPath):null,book.chunksPath?del(book.chunksPath):null].filter(Boolean));
  return true;
}

export async function getKnowledgeChunks(){
  const books=await listBooks();
  const all=[];
  for(const book of books){
    try{
      const chunks=await readPrivateJson(book.chunksPath);
      for(const chunk of chunks){
        all.push({
          id:`${book.id}-${chunk.page||0}-${chunk.part||1}`,
          title:book.title,source:book.author?`${book.title} · ${book.author}`:book.title,
          page:chunk.page||null,tags:['biblioteca','tuna','historia'],text:String(chunk.text||'')
        });
      }
    }catch(err){console.warn('No se pudo leer índice de libro',book.id,err?.message||err);}
  }
  return all;
}

export { INDEX_KEY };
