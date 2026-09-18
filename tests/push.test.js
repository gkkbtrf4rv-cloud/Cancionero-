import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import webpush from 'web-push';
import { kv, values } from './fake-kv.js';
registerHooks({ resolve(specifier, context, next) { return specifier === '@vercel/kv' ? { url: new URL('./fake-kv.js', import.meta.url).href, shortCircuit: true } : next(specifier, context); } });
const { default: subscribe } = await import('../api/subscribe.js');
const { default: notify } = await import('../api/notify-update.js');
const { default: send } = await import('../api/send-notification.js');
const { deliveryScope } = await import('../lib/push.js');
const keys = webpush.generateVAPIDKeys();
const host = 'private-preview.vercel.app';
const base = { method: 'POST', headers: { host, origin: `https://${host}`, authorization: 'Bearer test-session' } };
const sub = suffix => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/' + suffix, keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 2).toString('base64url') } });
async function call(handler, body = {}, extra = {}) {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(d) { this.data = d; return this; } };
  await handler({ ...base, body, ...extra }, res); return res;
}
function reset() {
  values.clear();
  process.env.ADMIN_PASSWORD = 'local-test-only';
  process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey; process.env.VAPID_SUBJECT = 'mailto:qa@example.com';
  values.set('user:test-user', { approved: true, mote: 'Prueba', email: 'qa@example.com' });
  values.set('session:test-session', 'test-user');
  values.set('app:songs-v2', { initialized: true, songs: [{ id: 'qa-song', titulo: 'Canción de prueba', estrofas: [] }] });
  values.set('app:events-v1', []);
}
async function add(suffix, changes = {}) {
  const subscription = sub(suffix), id = Buffer.from(subscription.endpoint).toString('base64url');
  const r = await call(subscribe, { subscription, publicKey: keys.publicKey, device: { installed: true } }); assert.equal(r.code, 200);
  await kv.set(`submeta:${id}`, { ...await kv.get(`submeta:${id}`), ...changes }); return id;
}

test('missing VAPID configuration returns a controlled error; status still loads', async () => {
  reset(); delete process.env.VAPID_PRIVATE_KEY;
  assert.equal((await call(subscribe, {}, { method: 'GET' })).code, 503);
  const status = await call(notify, { password: process.env.ADMIN_PASSWORD, action: 'status' });
  assert.equal(status.code, 200); assert.equal(status.data.configured, false);
});
test('subscription requires authenticated approval and matching current server key', async () => {
  reset(); const body = { subscription: sub('auth'), publicKey: keys.publicKey };
  assert.equal((await call(subscribe, body, { headers: { host } })).code, 401);
  values.set('user:test-user', { approved: false }); assert.equal((await call(subscribe, body)).code, 403);
  reset(); assert.equal((await call(subscribe, { ...body, publicKey: 'stale-key' })).code, 409);
  assert.equal((await call(subscribe, { ...body, subscription: { endpoint: 'https://localhost/' } })).code, 400);
});
test('reopening a device is idempotent and two devices are retained separately', async () => {
  reset(); await add('one'); await add('one'); await add('two');
  assert.equal((await kv.smembers('subs:all')).length, 2); assert.equal((await kv.smembers('user:test-user:subs')).length, 2);
});
test('switching accounts removes the old ownership index', async () => {
  reset(); const id = await add('shared-device');
  values.set('user:other', { approved: true, mote: 'Otro' }); values.set('session:test-session', 'other');
  await add('shared-device'); assert.equal((await kv.smembers('user:test-user:subs')).length, 0); assert.deepEqual(await kv.smembers('user:other:subs'), [id]);
});
test('partial failure can be retried without repeating accepted deliveries; expired and unauthorized endpoints are excluded', async () => {
  reset(); await add('ok'); await add('retry'); const gone = await add('gone');
  await add('production', { origin: 'https://cancionero-ten.vercel.app' });
  await add('legacy', { origin: undefined });
  values.set('user:revoked', { approved: false }); await add('revoked', { userId: 'revoked' });
  let fail = true; const calls = [];
  webpush.sendNotification = async (s, payload) => {
    const suffix = s.endpoint.split('/').at(-1); calls.push(suffix);
    assert.equal(JSON.parse(payload).kind, 'content-update');
    if (suffix === 'gone') throw Object.assign(new Error('gone'), { statusCode: 410 });
    if (suffix === 'retry' && fail) throw Object.assign(new Error('temporary'), { statusCode: 503 });
    return { statusCode: 201 };
  };
  const body = { password: process.env.ADMIN_PASSWORD, action: 'notify' };
  const first = await call(notify, body);
  assert.equal(first.code, 200); assert.equal(first.data.enviados, 1); assert.equal(first.data.fallidos, 1); assert.equal(first.data.eliminados, 1); assert.equal(first.data.omitidos, 3); assert.equal(first.data.retryable, true);
  assert.equal(await kv.get(`sub:${gone}`), null); assert.ok(!(await kv.smembers('user:test-user:subs')).includes(gone));
  const status = await call(notify, { ...body, action: 'status' }); assert.equal(status.data.pending, 1);
  fail = false; const second = await call(notify, body); assert.equal(second.data.enviados, 1); assert.equal(second.data.yaEnviados, 1); assert.equal(second.data.fallidos, 0);
  assert.deepEqual(calls.sort(), ['gone', 'ok', 'retry', 'retry']);
  const third = await call(notify, body); assert.equal(third.data.sent, false); assert.equal(third.data.reason, 'same-version');
});
test('an existing lock blocks concurrent sends', async () => {
  reset(); await add('lock');
  const status = await call(notify, { password: process.env.ADMIN_PASSWORD, action: 'status' });
  values.set(`push:lock:${deliveryScope(base)}:${status.data.version}`, 'sending');
  assert.equal((await call(notify, { password: process.env.ADMIN_PASSWORD, action: 'notify' })).code, 409);
});
test('no subscribers does not mark a version sent', async () => {
  reset(); const r = await call(notify, { password: process.env.ADMIN_PASSWORD, action: 'notify' });
  assert.equal(r.data.sent, false); assert.equal(r.data.reason, 'no-subscribers');
});
test('logout removal is scoped to the current account', async () => {
  reset(); const id = await add('logout');
  values.set('session:test-session', 'other'); values.set('user:other', { approved: true });
  await call(subscribe, { subscription: sub('logout') }, { method: 'DELETE' }); assert.ok(await kv.get(`sub:${id}`));
  values.set('session:test-session', 'test-user'); await call(subscribe, { subscription: sub('logout') }, { method: 'DELETE' }); assert.equal(await kv.get(`sub:${id}`), null);
});
test('manual sends keep notification URLs inside the site', async () => {
  reset(); await add('manual'); let target;
  webpush.sendNotification = async (_, payload) => { target = JSON.parse(payload).url; return { statusCode: 201 }; };
  assert.equal((await call(send, { password: process.env.ADMIN_PASSWORD, title: 'Prueba', body: 'Prueba', url: 'https://outside.example/' })).code, 200); assert.equal(target, '/');
});
