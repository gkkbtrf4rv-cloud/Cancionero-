import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../themes.js', import.meta.url), 'utf8');
function screen(saved, blocked = false) {
  const listeners = {}, stored = new Map(saved ? [['cancionero_theme_v1', saved]] : []);
  const choices = ['vino', 'luz', 'noche'].map(name => ({dataset: {themeChoice: name}, attrs: {}, setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,fn){this[k]=fn;}}));
  const select = {value: '', addEventListener(k,fn){this[k]=fn;}}, status = {}, meta = {setAttribute(k,v){this[k]=v;}};
  const classes = new Set();
  const document = {documentElement: {dataset: {}, style: {}}, body: {dataset: {}, classList: {remove(...names){names.forEach(n=>classes.delete(n));},add(n){classes.add(n);}}}, querySelector(){return meta;},querySelectorAll(s){return s==='[data-theme-select]'?[select]:s==='[data-theme-choice]'?choices:[status];}};
  const context = {document, window: {addEventListener(k,f){listeners[k]=f;}},localStorage: {getItem(k){if(blocked)throw Error('denied');return stored.get(k)||null;},setItem(k,v){if(blocked)throw Error('denied');stored.set(k,v);}}};
  vm.runInNewContext(source, context);
  return {document, choices, select, stored, listeners, meta, classes};
}
test('restaura y migra preferencias anteriores, con Vino vibrante por defecto',()=>{
  for(const [saved,expected] of [[null,'vino'],['default','vino'],['light','luz'],['dark','noche'],['noche','noche'],['invalido','vino']]) {
    const s=screen(saved);assert.equal(s.document.body.dataset.theme,expected);assert.equal(s.select.value,expected);
    assert.equal(s.choices.filter(c=>c.attrs['aria-pressed']==='true').length,1);
  }
});
test('cambiar tema persiste, restaura al reabrir y sincroniza pestañas',()=>{
  const s=screen();s.choices[1].click();assert.equal(s.stored.get('cancionero_theme_v1'),'luz');assert(s.classes.has('theme-light'));assert.equal(s.meta.content,'#faf7f2');
  assert.equal(screen(s.stored.get('cancionero_theme_v1')).document.body.dataset.theme,'luz');
  s.listeners.storage({key:'cancionero_theme_v1',newValue:'noche'});assert.equal(s.select.value,'noche');assert(!s.classes.has('theme-light'));assert.equal(s.document.documentElement.style.colorScheme,'dark');
  s.select.value='vino';s.select.change();assert.equal(s.stored.get('cancionero_theme_v1'),'vino');
});
test('restricción de almacenamiento no impide abrir ni cambiar apariencia',()=>{
  const s=screen(null,true);s.choices[2].click();assert.equal(s.document.body.dataset.theme,'noche');
});
test('lector autónomo incluye idénticos temas y controles, sin depender de red',()=>{
  const offline=fs.readFileSync(new URL('../offline.html',import.meta.url),'utf8');
  assert(offline.includes(source));assert(offline.includes(fs.readFileSync(new URL('../redesign.css',import.meta.url),'utf8')));
  for(const value of ['vino','luz','noche'])assert(offline.includes('data-theme-choice="'+value+'"'));
  const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');assert(sw.includes("'/themes.js?v=80'"));
});
