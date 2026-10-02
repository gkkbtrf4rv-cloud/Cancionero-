import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePermission, savePermission, permissionMetadata, PERMISSION_KEY } from '../lib/permission-store.js';
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
test('acepta PDF escaneado y rechaza formatos, firmas y tamaños inválidos',()=>{
  assert.equal(decodePermission(pdf).mimeType,'application/pdf');
  for(const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:application/pdf;base64,aG9sYQ==','data:image/png;base64,YWJj', 'data:application/pdf;base64,'+Buffer.alloc(3000001).toString('base64')]) assert.throws(()=>decodePermission(bad));
});
test('reemplaza documento privado y solo retira el anterior después de publicar',async()=>{
  let stored={pathname:'old.pdf'}, fail=false; const events=[];
  const deps={kv:{get:async key=>{assert.equal(key,PERMISSION_KEY);return stored;},set:async(key,v)=>{events.push('set');if(fail)throw new Error('storage failed');stored=v;}},put:async(path,buffer,opts)=>{assert.equal(opts.access,'private');events.push('put');return {pathname:path};},del:async path=>{events.push('del:'+path);}};
  const saved=await savePermission({fileData:pdf,filename:'permiso.pdf'},deps);
  assert.equal(saved.pathname,undefined); assert.match(saved.url,/asset=permission&v=/); assert.equal(events.at(-1),'del:old.pdf');
  const previous=stored;fail=true;await assert.rejects(savePermission({fileData:pdf,filename:'nuevo.pdf'},deps));assert.equal(stored,previous);assert.notEqual(events.at(-1),'del:'+previous.pathname);
  assert.equal(permissionMetadata(null),null);
});
