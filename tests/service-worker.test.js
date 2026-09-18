import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = {}, stores = new Map(), notices = [], messages = [], navigations = [], windows = [];
  const caches = {
    async open(name) { if (!stores.has(name)) stores.set(name, new Map()); const map = stores.get(name); return { async match(k) { return map.get(typeof k === 'string' ? k : k.url)?.clone(); }, async put(k,v) { map.set(typeof k === 'string' ? k : k.url, v.clone()); } }; },
    async keys() { return [...stores.keys()]; }, async delete(k) { return stores.delete(k); },
    async match(k) { for (const map of stores.values()) if (map.has(k)) return map.get(k).clone(); }
  };
  const clients = { async claim() {}, async matchAll() { return windows; }, async openWindow(url) { navigations.push(url); } };
  const context = { URL, Response, Request, console, caches, fetch: async req => new Response('network:' + (typeof req === 'string' ? req : req.url)), self: { location: { origin: 'https://private.example' }, clients, registration: { async showNotification(title, options) { notices.push({title,options}); } }, async skipWaiting() {}, addEventListener(type, fn) { handlers[type] = fn; } } };
  vm.runInNewContext(source, context);
  async function dispatch(type, extra = {}) { const tasks = []; let response; handlers[type]({ ...extra, waitUntil(p) { tasks.push(p); }, respondWith(p) { response = p; } }); await Promise.all(tasks); return response ? await response : undefined; }
  return { dispatch, context, caches, stores, notices, messages, navigations, windows };
}
test('admin and API requests are never replaced by the cached homepage', async () => {
  const w=worker(); for (const pathname of ['/admin.html','/api/cancionero']) {
    const response=await w.dispatch('fetch',{request:{url:'https://private.example'+pathname,mode:'navigate',method:'GET'}});assert.equal(response,undefined);
  }
});
test('offline navigation uses saved app shell', async () => {
  const w=worker(); const cache=await w.caches.open('cancionero-tuna-derecho-v52');await cache.put('/',new Response('offline shell'));
  w.context.fetch=async()=>{throw new Error('offline');};
  const r=await w.dispatch('fetch',{request:{url:'https://private.example/?actualizar=v2',mode:'navigate',method:'GET'}});assert.equal(await r.text(),'offline shell');
});
test('activation preserves private assets and pending update without forced navigation', async () => {
  const w=worker(); const old=await w.caches.open('cancionero-tuna-derecho-v51');await old.put('/__cancionero_update_marker__',new Response('{"version":"pending"}'));
  await w.caches.open('cancionero-private-assets-v2'); await w.caches.open('unrelated-cache');
  w.windows.push({url:'https://private.example/',navigate(){throw new Error('must not navigate');}});
  await w.dispatch('activate'); assert.ok(!w.stores.has('cancionero-tuna-derecho-v51')); assert.ok(w.stores.has('cancionero-private-assets-v2'));assert.ok(w.stores.has('unrelated-cache'));
  assert.equal((await (await w.caches.match('/__cancionero_update_marker__')).json()).version,'pending');
});
test('background push shows a notice, records update, and informs open windows', async () => {
  const w=worker(); w.windows.push({postMessage(m){w.messages.push(m);}});
  await w.dispatch('push',{data:{json:()=>({title:'Prueba',kind:'content-update',version:'new',url:'/?actualizar=new'})}});
  assert.equal(w.notices.length,1);assert.equal(w.messages[0].version,'new');assert.equal((await (await w.caches.match('/__cancionero_update_marker__')).json()).version,'new');
});
test('invalid push data still displays a generic notification', async () => {
  const w=worker(); await w.dispatch('push',{data:{json:()=>null}}); assert.equal(w.notices.length,1);
});
test('notification clicks cannot navigate outside the private origin', async () => {
  const w=worker();await w.dispatch('notificationclick',{notification:{close(){},data:{url:'https://outside.example/'}}});assert.deepEqual(w.navigations,['https://private.example/']);
});
test('notification click awaits navigation and focuses an existing window', async () => {
  const w=worker();let focused=false;w.windows.push({url:'https://private.example/',async navigate(url){w.navigations.push(url);return {async focus(){focused=true;}};}});
  await w.dispatch('notificationclick',{notification:{close(){},data:{url:'/?actualizar=v2'}}});assert.equal(focused,true);assert.deepEqual(w.navigations,['https://private.example/?actualizar=v2']);
});
