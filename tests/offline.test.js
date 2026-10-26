import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('service worker instala shell y lo devuelve al navegar sin conexión',async()=>{
 const listeners={},entries=new Map();let offline=false;
 const cache={async put(k,v){entries.set(typeof k==='string'?k:k.url,v);},async add(r){await this.put(new URL(r.url).pathname+new URL(r.url).search,new Response('asset'));}};
 const context={URL,Response,Request:class extends Request{constructor(url,opts){super(new URL(url,'http://localhost'),opts);}},console,caches:{async open(){return cache;},async keys(){return ['cancionero-tuna-derecho-v67','cancionero-private-assets-v2'];},async match(k){return entries.get(typeof k==='string'?k:k.url);},async delete(){}},fetch:async()=>{if(offline)throw Error('offline');return new Response('<html>Cancionero</html>');},self:{location:{origin:'http://localhost'},addEventListener(n,f){listeners[n]=f;},skipWaiting(){},clients:{async claim(){}}}};
 vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);let work;listeners.install({waitUntil(p){work=p;}});await work;assert(entries.has('/'));assert(entries.has('/attendance.js'));assert(entries.has('/responsive.css?v=63'));
 offline=true;let result;listeners.fetch({request:{method:'GET',url:'http://localhost/?desde=pwa',mode:'navigate'},respondWith(p){result=p;}});assert.equal(await (await result).text(),'<html>Cancionero</html>');
});
test('el inicio offline usa la cuenta guardada sin consultar servidor',async()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');const fn=html.slice(html.indexOf('async function restoreSession()'),html.indexOf('function mostrarPopupSiNuevo'));
 const ctx={navigator:{onLine:false},token:()=>true,currentUser:null,leerUsuarioOffline:()=>({approved:true,mote:'Tuno'}),renderCuenta(){},statusSync(){},fetch(){throw Error('No debe consultar red');}};vm.runInNewContext(fn,ctx);await ctx.restoreSession();assert.equal(ctx.currentUser.mote,'Tuno');
 assert(html.includes('currentUser=d.user; guardarUsuarioOffline(currentUser)'));
});
