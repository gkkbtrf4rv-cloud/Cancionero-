// Static layout fixtures use the actual page styles, with no sessions, APIs or uploads.
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { passwordResetPage } from '../lib/password-reset-page.js';
const css=readFileSync('responsive.css','utf8');
const permission=readFileSync('permission.js','utf8');
const permissionMarkup=/modal.innerHTML = '([^']*)'/.exec(permission)[1];
const permissionStyle=/style.textContent = '([^']*)'/.exec(permission)[1];
const fixtures=['index.html','admin.html','ia.html','reader.html','terminos.html','privacidad.html','reset'];
const sizes=[[280,800],[320,800],[375,812],[768,1024],[1024,768],[1440,900],[667,375]];
mkdirSync('responsive-artifacts',{recursive:true});
const browser=await (process.env.LAYOUT_BROWSER==='webkit'?webkit:chromium).launch();
try{
 for(const file of fixtures){
  const raw=file==='reset'?passwordResetPage:readFileSync(file,'utf8');
  assert.doesNotMatch(raw,/user-scalable=no|maximum-scale=/);
  const html=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,match=>{
   const href=/href="([^"]+)"/.exec(match)?.[1];
   if(href?.startsWith('/safe-area.css'))return '<style>'+readFileSync('safe-area.css','utf8')+'</style>';
   if(href?.startsWith('/site-footer.css'))return '<style>'+readFileSync('site-footer.css','utf8')+'</style>';
   if(href?.startsWith('/admin-assets/')&&href.endsWith('.css'))return '<style>'+readFileSync(href.slice(1),'utf8')+'</style>';
   return '';
  }).replace('</head>',file==='reset'?'</head>':'<style>'+css+'</style></head>');
  for(const [width,height] of sizes){
   const page=await browser.newPage({viewport:{width,height}});
   await page.setContent(html);
   await page.evaluate(()=>document.documentElement.style.setProperty('--app-safe-top','59px'));
   const belowStatus=async(selector)=>{const box=await page.locator(selector).boundingBox();assert.ok(box&&box.y>=59,`${file}: ${selector} overlaps status bar at ${width}x${height}`);};
   if(file==='ia.html')await belowStatus('.back');
   if(file==='reader.html')await belowStatus('#prev');
   await page.evaluate(()=>{
    document.querySelectorAll('.splash-screen,.admin-splash').forEach(el=>el.remove());
    const name='Una canción o libro con nombre largo '+ 'Tradición'.repeat(8);
    const song='<article class="song-card"><div class="song-cover-thumb">♫</div><div class="info"><h3>'+name+'</h3><p>Autor del repertorio</p></div><button class="song-fav-btn">♡</button></article>';
    const list=document.querySelector('#lista-canciones');if(list)list.innerHTML=song.repeat(6);
    const books=document.querySelector('#books');if(books)books.innerHTML='<article class="card"><h3>'+name+'</h3><p>'+ 'Autor'.repeat(50)+'</p><button>Leer libro</button></article>'.repeat(3);
    const admin=document.querySelector('#eventList');if(admin)admin.innerHTML='<div class="event-item"><div><strong>'+name+'</strong></div><div class="actions"><button>Editar</button><button>Eliminar</button></div></div>';
   });
   const check=async state=>{
    const overflow=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));
    assert.ok(overflow.document<=overflow.width+1,`${file} ${state} ${width}x${height}: overflow ${overflow.document}`);
    await page.screenshot({path:`responsive-artifacts/${file.replace('.html','')}-${state}-${width}x${height}.png`,fullPage:true});
   };
   if(file==='reader.html')await page.evaluate(()=>{const canvas=document.querySelector('canvas');canvas.style.width='1400px';canvas.style.height='1800px';});
   await check('list');
   const footer=page.locator('.site-footer');if(await footer.count()){await footer.scrollIntoViewIfNeeded();const links=await footer.locator('nav a').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,bottom:el.getBoundingClientRect().bottom,href:el.getAttribute('href')})));assert.equal(links.length,2);for(const link of links)assert.ok(link.height>=44);const nav=page.locator('#premiumBottomNav');if(await nav.count()){const box=await nav.boundingBox();for(const link of links)assert.ok(link.bottom<=box.y+1,'Footer link is covered by bottom navigation');}}
   if(file==='index.html'&&width>=768){const columns=await page.locator('#lista-canciones').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(columns,2);}
   if(['terminos.html','privacidad.html'].includes(file)){
    const back=page.getByRole('link',{name:'Volver al Cancionero',exact:true});
    const verifyBack=async()=>{const box=await back.boundingBox();assert.ok(box&&box.y>=71&&box.height>=48&&box.y+box.height<=height,'Return link must be visible and touchable');assert.equal(await back.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===el;}),true,'Return link is covered');};
    await verifyBack();await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await verifyBack();await page.screenshot({path:`responsive-artifacts/${file}-return-scrolled-${width}x${height}.png`});
    await page.route('https://return-layout.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Cancionero</title><h1>Cancionero</h1>'}));
    await page.evaluate(()=>{const base=document.createElement('base');base.href='https://return-layout.test/';document.head.prepend(base);});
    await back.click();await page.waitForURL('https://return-layout.test/');assert.equal(await page.title(),'Cancionero');
   }
   const controls=await page.locator('button').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().width&&getComputedStyle(el).visibility!=='hidden').map(el=>({text:el.textContent,height:el.getBoundingClientRect().height})));
   for(const control of controls)assert.ok(control.height>=43,`${file}: small touch control ${control.text}`);
   if(file==='index.html'){
    await page.evaluate(()=>{document.querySelector('#vista-lista').style.display='none';const panel=document.querySelector('#vista-detalle');panel.style.display='block';document.querySelector('#detalle-titulo').textContent='Una canción con título muy largo';const sheet=document.querySelector('#detalle-letra');sheet.classList.remove('lyrics-only');sheet.innerHTML='<div class="estrofa"><div class="linea acordes">C          G                 Am                   F                G</div><div class="linea texto">Una línea de canción extensa mantiene los acordes en su lugar siempre</div></div>';});
    await check('chords');
    const fonts=await page.locator('#detalle-letra').evaluate(el=>{const a=getComputedStyle(el.querySelector('.acordes')),t=getComputedStyle(el.querySelector('.texto'));return[a.fontFamily,a.fontSize,t.fontFamily,t.fontSize];});
    assert.equal(fonts[0],fonts[2]);assert.equal(fonts[1],fonts[3]);
    await page.evaluate(()=>{document.querySelector('#vista-detalle').style.display='none';document.querySelector('#vista-evento').style.display='block';document.querySelector('#eventDetailTitle').textContent='Evento de la Tuna '+ 'Nombre'.repeat(30);document.querySelector('#eventDetailDescription').textContent='Información del evento '.repeat(30);});await check('event');
    await page.evaluate(()=>document.querySelector('#authModal').classList.add('open'));await check('login');
    await page.evaluate(({markup,styles})=>{document.querySelector('#authModal').classList.remove('open');const d=document.createElement('dialog');d.id='permissionViewer';d.innerHTML=markup;document.body.append(d);const style=document.createElement('style');style.textContent=styles;document.head.append(style);document.querySelector('#permissionTitle').textContent='Permiso de ensayo '+ 'Documento'.repeat(10);document.querySelector('#permissionMessage').textContent='Instrucciones '.repeat(15);d.showModal();},{markup:permissionMarkup,styles:permissionStyle});await check('permission');await belowStatus('#permissionTitle');const content=await page.locator('#permissionContent').boundingBox();assert.ok(content.height>40,`Permission content collapsed ${width}x${height}`);
   }
   if(file==='ia.html'){
    await page.evaluate(()=>{const d=document.querySelector('#reader');d.showModal();document.querySelector('#readerTitle').textContent='Libro de tradiciones '.repeat(5);document.querySelector('#readerStatus').textContent='Instrucciones de lectura '.repeat(8);document.querySelector('#readerContent').innerHTML='<pre>'+ 'TextoDeLibro'.repeat(150)+'</pre>';});await check('reader');await belowStatus('#closeReader');
    await page.locator('#closeReader').click({trial:true});
    const area=await page.locator('#readerContent').boundingBox();assert.ok(area.height>40,`Reader content collapsed ${width}x${height}`);
   }
   await page.close();
  }
 }
 console.log('Responsive layouts passed at seven phone/tablet/desktop/landscape sizes; screenshots saved.');
}finally{await browser.close();}
