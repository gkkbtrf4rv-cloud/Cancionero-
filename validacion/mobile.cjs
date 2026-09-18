const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict');
const appRoot = process.env.CANCIONERO_ROOT || path.resolve(__dirname, '..');
const webpush = require(path.join(appRoot, 'node_modules/web-push'));
const publicKey = webpush.generateVAPIDKeys().publicKey;
const root = appRoot;
const songs = [{ id: 'test-1', titulo: 'Canción de ensayo', musica: 'G · D', estrofas: [[{ acordes: 'G', texto: 'Esta es una letra de prueba.' }]] }, { id: 'test-2', titulo: 'Prueba de serenata', musica: 'C · G', estrofas: [[{ acordes: 'C', texto: 'Texto de validación de consulta.' }]] }];
const server = http.createServer((req, res) => {
 const p = new URL(req.url, 'http://localhost').pathname;
 const file = path.join(root, p === '/' ? 'index.html' : p);
 if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
 const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
 res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' }); fs.createReadStream(file).pipe(res);
});
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://localhost:${server.address().port}`;
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || chromium.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], headless: true });
 const results = [];
 async function scenario(name, config, check) {
  if (process.env.QA_FILTER && !new RegExp(process.env.QA_FILTER).test(name)) return;
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: config.width || 390, height: 844 } });
  let posts = 0;
  await context.addInitScript(({config, publicKey}) => {
   try { if (!config.loggedOut) localStorage.setItem('cancionero_token', 'test-session'); } catch {}
   window.qa = { permissionCalls: 0, subscribeCalls: 0, unsubscribes: 0, gesture: false };
   const bytes = k => Uint8Array.from(atob(k.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-k.length%4)%4)), c => c.charCodeAt(0));
   const makeSub = (bad = false) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/qa-browser', keys: { p256dh: publicKey, auth: btoa('abcdefghijklmnop') }, options: { applicationServerKey: bad ? new Uint8Array(65).buffer : bytes(publicKey).buffer }, unsubscribe: async () => { window.qa.unsubscribes++; subscription = null; return true; }, toJSON() { return { endpoint: this.endpoint, keys: this.keys }; } });
   let subscription = config.existing ? makeSub(config.changedKey) : null;
   const reg = { update: async () => {}, pushManager: { getSubscription: async () => subscription, subscribe: async () => { window.qa.subscribeCalls++; return subscription = makeSub(); } } };
   const sw = new EventTarget(); sw.ready = config.noWorker ? new Promise(() => {}) : Promise.resolve(reg); sw.register = async () => reg; sw.getRegistration = async () => reg;
   Object.defineProperty(navigator, 'serviceWorker', { value: sw });
   if (config.ios) { Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }); }
   if (config.ipad) { Object.defineProperty(navigator,'platform',{value:'MacIntel'}); Object.defineProperty(navigator,'maxTouchPoints',{value:5}); }
   const media = window.matchMedia.bind(window); window.matchMedia = query => query === '(display-mode: standalone)' ? { matches: Boolean(config.standalone), addEventListener() {}, removeEventListener() {} } : media(query);
   if (config.unsupported) { delete window.Notification; delete window.PushManager; }
   else {
    let permission = config.permission || 'default';
    Object.defineProperty(window, 'Notification', { configurable: true, value: { get permission() { return permission; }, requestPermission() { window.qa.permissionCalls++; window.qa.gesture = navigator.userActivation.isActive; permission = config.dismiss ? 'default' : 'granted'; return Promise.resolve(permission); } } });
    window.PushManager = function() {};
   }
  }, { config, publicKey });
  await context.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.origin !== origin) return route.abort();
   if (!url.pathname.startsWith('/api/')) return route.continue();
   let status = 200, data;
   if (url.pathname === '/api/me') data = { user: { id: 'qa', approved: !config.pending, mote: 'Prueba', email: 'qa@example.com' } };
   else if (url.pathname === '/api/cancionero') { if(config.contentFailure) {status=503;data={error:'Servicio temporalmente no disponible'};} else data = { ok: true, version: 'qa-v1', canciones: songs, eventos: [], popup: null }; }
   else if (url.pathname === '/api/subscribe') {
    if (route.request().method() === 'GET') data = { ok: true, publicKey: config.badConfig ? 'invalid' : publicKey };
    else { posts++; if (config.failFirst && posts === 1) { status = 503; data = { error: 'Servidor temporalmente no disponible' }; } else data = { ok: true, id: 'qa' }; }
   } else data = { ok: true };
   return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('notifStatus')?.textContent.length > 0);
  await page.evaluate(() => document.getElementById('settingsPanel').classList.add('open'));
  await check(page, () => posts);
  assert.deepEqual(errors, [], name + ': no JS errors');
  results.push({ test: name, status: 'passed' }); console.log('PASS: '+name); await context.close();
 }
 try {
  await scenario('Android activation requests permission from a tap; server confirms registration', {}, async (p, posts) => {
   await p.getByRole('button', { name: '🔔 Activar notificaciones', exact: true }).click();
   await p.waitForFunction(() => document.getElementById('notifStatus').textContent.includes('está registrado'));
   assert.equal(posts(), 1); const q = await p.evaluate(() => qa); assert.equal(q.permissionCalls, 1); assert.equal(q.gesture, true); assert.equal(q.subscribeCalls, 1);
  });
  await scenario('Server rejection does not show active; retry preserves browser subscription', { failFirst: true }, async (p, posts) => {
   await p.getByRole('button', { name: '🔔 Activar notificaciones', exact: true }).click();
   await p.getByRole('button', { name: '🔔 Reintentar activación' }).waitFor();
   assert.ok(!(await p.locator('#notifStatus').textContent()).includes('está registrado'));
   await p.getByRole('button', { name: '🔔 Reintentar activación' }).click();
   await p.waitForFunction(() => document.getElementById('notifStatus').textContent.includes('está registrado'));
   assert.equal(posts(), 2); assert.equal(await p.evaluate(() => qa.subscribeCalls), 1);
  });
  await scenario('iPhone Safari shows installation instructions before unsupported API check', { ios: true, unsupported: true }, async p => {
   assert.match(await p.locator('#notifStatus').textContent(), /Añadir a pantalla de inicio/);
  });
  await scenario('iPad with desktop user agent shows installation guidance', { ipad: true, unsupported: true }, async p => {
   assert.match(await p.locator('#notifStatus').textContent(), /Añadir a pantalla de inicio/);
  });
  await scenario('Installed iPhone flow enables registration', { ios: true, standalone: true }, async p => {
   await p.getByRole('button', { name: '🔔 Activar notificaciones', exact: true }).click();
   await p.waitForFunction(() => document.getElementById('notifStatus').textContent.includes('está registrado'));
  });
  await scenario('Blocked permission gives settings instructions and no prompt', { permission: 'denied' }, async p => {
   assert.match(await p.locator('#notifStatus').textContent(), /ajustes/); assert.equal(await p.evaluate(() => qa.permissionCalls), 0);
  });
  await scenario('Existing subscription resynchronizes without a permission prompt', { permission: 'granted', existing: true }, async (p, posts) => {
   await p.waitForFunction(() => document.getElementById('notifStatus').textContent.includes('está registrado')); assert.equal(posts(), 1); assert.equal(await p.evaluate(() => qa.permissionCalls), 0);
  });
  await scenario('Changed VAPID key renews only after a tap', { permission: 'granted', existing: true, changedKey: true }, async p => {
   await p.getByRole('button', { name: '🔔 Renovar avisos' }).waitFor(); assert.equal(await p.evaluate(() => qa.unsubscribes), 0);
   await p.getByRole('button', { name: '🔔 Renovar avisos' }).click();
   await p.waitForFunction(() => document.getElementById('notifStatus').textContent.includes('está registrado')); assert.equal(await p.evaluate(() => qa.unsubscribes), 1);
  });
  await scenario('Dismissed permission remains optional', { dismiss: true }, async p => {
   await p.getByRole('button', { name: '🔔 Activar notificaciones', exact: true }).click(); await p.waitForFunction(() => document.getElementById('notifStatus').textContent.includes('No se activaron')); assert.equal(await p.evaluate(() => qa.subscribeCalls), 0);
  });
  await scenario('Pending account cannot subscribe', { pending: true }, async (p, posts) => {
   assert.match(await p.locator('#notifStatus').textContent(), /autorizada/); assert.equal(posts(), 0);
  });
  await scenario('Unsupported browser can still use song consultation', { unsupported: true }, async p => {
   assert.match(await p.locator('#notifStatus').textContent(), /seguir consultando/);
  });
  await scenario('Invalid server key stays recoverable', { badConfig: true }, async p => {
   await p.getByRole('button', { name: '🔔 Reintentar activación' }).waitFor(); assert.match(await p.locator('#notifStatus').textContent(), /no es válida/);
  });
  await scenario('Failed content sync does not mark the daily update complete', {contentFailure:true}, async p => {
   await p.getByRole('button', {name:'🔔 Activar notificaciones',exact:true}).waitFor();
   assert.equal(await p.evaluate(()=>localStorage.getItem('cancionero_last_daily_update_v1')),null);
  });
  for (const width of [320, 390, 412]) await scenario(`Song search and reading at ${width}px`, { width }, async p => {
   await p.waitForSelector('#accessGate.hidden', {state: 'attached'});
   await p.evaluate(() => { document.getElementById('settingsPanel').classList.remove('open'); premiumNavigate('songs'); });
   await p.locator('#buscador').fill('ensayo');
   await p.getByText('Canción de ensayo', { exact: true }).first().click();
   await p.getByText('Esta es una letra de prueba.', { exact: true }).waitFor();
   const dims = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth })); assert.ok(dims.doc <= dims.win + 1, JSON.stringify(dims));
   if(width===390) { await p.waitForSelector('#splashScreen', {state: 'detached'}); await p.screenshot({ path: path.join(__dirname,'mobile-reading.png'), fullPage: true }); }
  });
  console.log(JSON.stringify(results, null, 2)); fs.writeFileSync(path.join(__dirname, process.env.QA_FILTER ? 'mobile-layout-results.json' : 'mobile-results.json'), JSON.stringify({ engine: 'Chromium', mode: 'mobile viewport and API simulation; not physical iOS/Android push delivery', results }, null, 2));
 } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
