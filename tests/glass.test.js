import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../glass.js',import.meta.url),'utf8');
test('la selección de cristal se ajusta y deja de programar cuadros al terminar',()=>{
 const frames=[],props={},classes=new Set(),events={};let mutation,resize,left=85,hidden=false;
 const active={offsetWidth:70,getBoundingClientRect(){return {left,width:70};}};
 const nav={get offsetWidth(){return hidden?0:350;},clientLeft:1,querySelector(){return active;},getBoundingClientRect(){return {left:10};},style:{setProperty(k,v){props[k]=v;}},classList:{contains(k){return classes.has(k);},add(k){classes.add(k);mutation();}}};
 const ctx={document:{querySelector(){return nav;}},window:{ResizeObserver:true,addEventListener(k,f){events[k]=f;}},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},ResizeObserver:class{constructor(fn){resize=fn;}observe(){}},requestAnimationFrame(fn){frames.push(fn);}};
 vm.runInNewContext(source,ctx);
 function flush(){let n=0;while(frames.length){assert(++n<5,'No debe continuar animándose en reposo');frames.shift()();}}
 flush();assert.equal(props['--glass-left'],'74px');assert.equal(props['--glass-width'],'70px');assert(classes.has('glass-ready'));
 left=155;mutation();resize();assert.equal(frames.length,1);flush();assert.equal(props['--glass-left'],'144px');assert.equal(frames.length,0);
 hidden=true;resize();flush();assert.equal(props['--glass-width'],'70px');hidden=false;events.pageshow();flush();
});
test('pantallas sin barra de navegación no añaden trabajo',()=>{
 vm.runInNewContext(source,{document:{querySelector(){return null;}}});
});
test('la copia autónoma y el service worker incluyen los controles locales de cristal',()=>{
 const offline=fs.readFileSync(new URL('../offline.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert(offline.includes(source));assert(sw.includes("'/glass.js?v=84'"));
});
