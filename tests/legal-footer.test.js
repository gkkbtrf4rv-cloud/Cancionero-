import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('legal links have real static destinations accessible before login',()=>{
 for(const file of ['index.html','admin.html','ia.html','terminos.html','privacidad.html']){
  const html=read(file);assert.match(html,/<footer\b[^>]*site-footer/);assert.match(html,/aria-label="Información legal"/);
  for(const path of ['terminos.html','privacidad.html']){assert.ok(existsSync(new URL('../'+path,import.meta.url)));assert.ok(html.includes('href="/'+path+'"'));}
 }
 assert.match(read('index.html'),/Antes de registrarte, consulta/);
 assert.match(read('privacidad.html'),/Marlon García Rojas<\/strong> es el responsable/);
 assert.doesNotMatch(read('privacidad.html'),/Alcanfores|<strong>Tuna de Derecho/);
});
test('footer year changes without altering navigation or requiring an API',()=>{
 const spans=[{textContent:'2026'},{textContent:'2026'}];
 vm.runInNewContext(read('site-footer.js'),{Date:class{getFullYear(){return 2030;}},document:{querySelectorAll:()=>spans}});
 assert.deepEqual(spans.map(s=>s.textContent),['2030','2030']);
});
test('offline navigation serves each legal page instead of the app shell',async()=>{
 const handlers={},context=vm.createContext({URL,self:{addEventListener:(type,fn)=>handlers[type]=fn,location:{origin:'https://app.test'}}});
 vm.runInContext(read('sw.js'),context);
 vm.runInContext("cacheFirst=async request=>({path:new URL(request.url).pathname});cacheFirstPage=async()=>({path:'APP_SHELL'});",context);
 for(const path of ['/terminos.html','/privacidad.html']){
  let result;handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://app.test'+path},respondWith:r=>result=r});assert.equal((await result).path,path);
 }
});
