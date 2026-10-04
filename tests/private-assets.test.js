import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('  const PRIVATE_ASSET_CACHE='),html.indexOf('  function eventDateText'));
function fixture(){
  let calls=0, fail=false;const observers=[];
  class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(el){this.el=el;}unobserve(){} }
  const context=vm.createContext({Map,URL:{createObjectURL:()=> 'blob:test'},window:{IntersectionObserver:Observer},IntersectionObserver:Observer,localStorage:{getItem:()=>null},token:()=> 'member',authHeaders:()=>({Authorization:'Bearer member'}),console,
    fetch:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return {ok:!fail,blob:async()=>({})};}});
  vm.runInContext(source,context);
  return {context,observers,calls:()=>calls,fail:v=>fail=v};
}
test('thumbnail and hero share a single in-flight fetch; failures allow retry',async()=>{
  const f=fixture();await vm.runInContext("Promise.all([privateAssetUrl('/cover'),privateAssetUrl('/cover')])",f.context);
  assert.equal(f.calls(),1);await vm.runInContext("privateAssetUrl('/cover')",f.context);assert.equal(f.calls(),1);
  f.fail(true);await assert.rejects(vm.runInContext("privateAssetUrl('/bad')",f.context));f.fail(false);
  await vm.runInContext("privateAssetUrl('/bad')",f.context);assert.equal(f.calls(),3);
});
test('gallery performs no fetch before intersection; viewer opens immediately',async()=>{
  const f=fixture();f.context.img={dataset:{},style:{}};
  vm.runInContext("setPrivateImg(img,'/photo')",f.context);assert.equal(f.calls(),0);
  f.observers[1].callback([{isIntersecting:true,target:f.context.img}],f.observers[1]);
  await vm.runInContext("privateAssetUrl('/photo')",f.context);assert.equal(f.calls(),1);assert.equal(f.context.img.src,'blob:test');
  await vm.runInContext("setPrivateImg(img,'/viewer',true)",f.context);assert.equal(f.calls(),2);
});
test('all inline scripts parse and service worker retains private image cache on upgrade',()=>{
  for(const file of ['index.html','admin.html']){
    const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/type="module"|src=/.test(match[1]))new vm.Script(match[2],{filename:file});
  }
  let activate;const deleted=[];
  const context=vm.createContext({URL,Response,console,fetch:()=>{},caches:{keys:async()=>['old-shell','cancionero-private-assets-v2','cancionero-permission-v1-member'],delete:async key=>deleted.push(key)},self:{addEventListener:(name,fn)=>{if(name==='activate')activate=fn;},clients:{claim:async()=>{},matchAll:async()=>[]}}});
  vm.runInContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
  let completion;activate({waitUntil:p=>completion=p});return completion.then(()=>assert.deepEqual(deleted,['old-shell']));
});
test('admin event list stays metadata-only until visible and reuses cover across rerenders',async()=>{
  const admin=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
  const code=admin.slice(admin.indexOf('const adminCoverCache='),admin.indexOf('async function loadEventsAdmin()'));
  let calls=0,observer;const img={dataset:{eventCover:'e'}};
  class Observer{constructor(fn){this.callback=fn;observer=this;}observe(){}unobserve(){}disconnect(){}}
  const list={querySelectorAll:()=>[img]};
  const context=vm.createContext({Map,window:{IntersectionObserver:Observer},IntersectionObserver:Observer,allEvents:[{id:'e',coverPathname:'unique.jpg',coverImageUrl:'/cover',title:'Evento'}],eventList:list,esc:String,fmt:String,$:()=>({value:'password'}),post:async(url,payload)=>{assert.equal(payload.action,'get-event-cover-admin');assert.equal(payload.password,'password');calls++;return{imageData:'data:image/jpeg;base64,a'};}});
  vm.runInContext(code,context);vm.runInContext('renderEventsAdmin()',context);assert.equal(calls,0);
  observer.callback([{isIntersecting:true,target:img}],observer);
  await vm.runInContext("loadAdminCover('e')",context);assert.equal(calls,1);assert.equal(img.src,'data:image/jpeg;base64,a');
  vm.runInContext('renderEventsAdmin()',context);await vm.runInContext("loadAdminCover('e')",context);assert.equal(calls,1);
  vm.runInContext("allEvents[0].coverPathname='new.jpg'",context);await vm.runInContext("loadAdminCover('e')",context);assert.equal(calls,2);
});
