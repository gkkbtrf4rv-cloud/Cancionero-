import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../themes.js', import.meta.url), 'utf8');
function screen(saved, blocked = false) {
 const stored = new Map([['cancionero_theme_v1', saved]]), listeners = {}, classes = new Set(['theme-light','theme-dark']);
 const meta={setAttribute(k,v){this[k]=v;}};
 const document={documentElement:{dataset:{},style:{}},body:{dataset:{},classList:{remove(...names){names.forEach(n=>classes.delete(n));}}},querySelector(){return meta;}};
 vm.runInNewContext(source,{document,window:{addEventListener(k,f){listeners[k]=f;}},localStorage:{setItem(k,v){if(blocked)throw Error('denied');stored.set(k,v);}}});
 return {document,stored,classes,meta,listeners};
}
test('Vino vibrante sustituye todas las preferencias anteriores al abrir',()=>{
 for(const saved of [null,'default','light','dark','luz','noche','vino','invalido']) {
  const s=screen(saved);assert.equal(s.document.body.dataset.theme,'vino');assert.equal(s.stored.get('cancionero_theme_v1'),'vino');assert.equal(s.classes.size,0);assert.equal(s.meta.content,'#09090c');assert.equal(s.document.documentElement.style.colorScheme,'dark');
 }
});
test('una pestaña antigua no reactiva temas retirados',()=>{
 const s=screen('vino');s.listeners.storage({key:'cancionero_theme_v1',newValue:'noche'});assert.equal(s.document.body.dataset.theme,'vino');
});
test('el almacenamiento restringido no impide abrir el diseño',()=>{
 assert.equal(screen('luz',true).document.body.dataset.theme,'vino');
});
test('lector autónomo conserva el diseño y ya no ofrece temas retirados',()=>{
 const offline=fs.readFileSync(new URL('../offline.html',import.meta.url),'utf8'), online=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert(offline.includes(source));assert(offline.includes(fs.readFileSync(new URL('../redesign.css',import.meta.url),'utf8')));
 for(const html of [offline,online]){assert(!html.includes('data-theme-choice='));assert(!html.includes('data-theme-select'));}
 assert(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8').includes("'/themes.js?v=81'"));
});
