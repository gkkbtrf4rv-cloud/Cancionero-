import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLibraryUpload, validateIndex, MAX_BOOK_BYTES} from '../lib/library-upload.js';

function fixture() {
  const store = new Map(), tokens = [], removed = [], saved = [];
  let chunkData = JSON.stringify([{page:1,part:1,text:'Historia y tradiciones de la Tuna de Derecho.'}]);
  const deps = {
    kv:{get:async k=>store.get(k),set:async(k,v,opts)=>{if(opts?.nx&&store.has(k))return null;store.set(k,v);return 'OK';},del:async k=>store.delete(k)},
    token:async options=>{tokens.push(options);return 'scoped-client-token';},
    head:async path=>{const session=[...store.values()].find(v=>v.originalPath);return {size:path.endsWith('indice.json')?Buffer.byteLength(chunkData):session.size,contentType:path.endsWith('indice.json')?'application/json':session.mimeType};},
    get:async()=>({statusCode:200,stream:new ReadableStream({start(c){c.enqueue(Buffer.from(chunkData));c.close();}})}),
    del:async path=>removed.push(path),
    saveBook:async book=>{saved.push(book);return {...book,createdAt:new Date().toISOString(),chunks:book.chunks.length,pages:1};}
  };
  async function call(body) {
    const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};
    await handleLibraryUpload({body},res,deps);return res;
  }
  return {call,deps,tokens,removed,saved,setIndex:v=>{chunkData=v;}};
}
const metadata={title:'Libro de prueba',filename:'tuna.pdf',mimeType:'application/pdf',size:Math.ceil(46.9*1024*1024)};

test('46.9 MB usa tokens privados de rutas exactas y no envía el archivo a la función',async()=>{
  const f=fixture(), start=await f.call({action:'library-upload-start',...metadata});
  assert.equal(start.code,200); assert.equal(f.tokens.length,2);
  assert.equal(f.tokens[0].maximumSizeInBytes,metadata.size);assert.deepEqual(f.tokens[0].allowedContentTypes,['application/pdf']);
  assert.equal(f.tokens[0].pathname,start.body.originalPath);assert.equal(f.tokens[0].allowOverwrite,false);
  assert.equal(f.tokens[1].maximumSizeInBytes,16*1024*1024);
  const done=await f.call({action:'library-upload-finish',id:start.body.id});
  assert.equal(done.code,200);assert.equal(done.body.book.size,metadata.size);assert.equal(done.body.book.originalPath,undefined);
  assert.equal(f.saved[0].originalBuffer,undefined);assert.equal(f.saved[0].chunks[0].page,1);
  await f.call({action:'library-upload-finish',id:start.body.id});assert.equal(f.saved.length,1);
});

test('rechaza exceso de tamaño, tipos y sesiones desconocidas antes de emitir tokens',async()=>{
  const f=fixture();
  for (const override of [{size:MAX_BOOK_BYTES+1},{size:0},{mimeType:'image/svg+xml'},{title:''}]) {
    assert.ok((await f.call({action:'library-upload-start',...metadata,...override})).code>=400);
  }
  assert.equal(f.tokens.length,0);
  assert.equal((await f.call({action:'library-upload-finish',id:'../otro'})).code,400);
  assert.equal((await f.call({action:'library-upload-finish',id:'00000000-0000-0000-0000-000000000000'})).code,410);
});

test('verifica tamaño real, índice y páginas; no registra archivos incompletos',async()=>{
  const f=fixture(), start=await f.call({action:'library-upload-start',...metadata});
  f.setIndex('[]');assert.equal((await f.call({action:'library-upload-finish',id:start.body.id})).code,400);
  f.setIndex('{');assert.equal((await f.call({action:'library-upload-finish',id:start.body.id})).code,400);
  f.deps.head=async()=>({size:1,contentType:'application/pdf'});
  assert.equal((await f.call({action:'library-upload-finish',id:start.body.id})).code,400);assert.equal(f.saved.length,0);
  for(const index of [[],[{text:'a'.repeat(2401)}],[{text:'Tuna',page:-1}],[{text:'Tuna',page:1.5}]])assert.throws(()=>validateIndex(index));
});

test('la cancelación limpia solo las rutas de su carga y conserva libros terminados',async()=>{
  const f=fixture(), start=await f.call({action:'library-upload-start',...metadata});
  await f.call({action:'library-upload-abort',id:start.body.id});assert.deepEqual(f.removed,[start.body.originalPath,start.body.chunksPath]);
  const other=await f.call({action:'library-upload-start',...metadata});await f.call({action:'library-upload-finish',id:other.body.id});
  await f.call({action:'library-upload-abort',id:other.body.id});assert.equal(f.removed.length,2);
});
