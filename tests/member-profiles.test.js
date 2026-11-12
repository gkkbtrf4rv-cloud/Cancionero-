import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProfiles } from '../lib/member-profiles.js';

test('the administrator confirms a mote match and each account can only use its own ficha', async () => {
  let state = null;
  const users = {
    first: {id: 'first', mote: 'Póli', approved: true, emailVerified: true},
    other: {id: 'other', mote: 'POLI', approved: true, emailVerified: true},
    revoked: {id: 'revoked', mote: 'Poli', approved: false, emailVerified: true}
  };
  const store = {
    async get(key) { return key.startsWith('user:') ? users[key.slice(5)] : structuredClone(state); },
    async smembers() { return Object.keys(users); },
    async eval(_script, _keys, [version, next]) {
      if ((state?.version || 0) !== version) return 0;
      state = JSON.parse(next);
      return 1;
    }
  };
  async function call(action, body = {}, userId) {
    const result = {headers: {}};
    const res = {
      setHeader(name, value) { result.headers[name] = value; },
      status(status) { result.status = status; return this; },
      json(json) { result.json = json; }
    };
    await handleProfiles({body: {action, ...body}}, res, {
      store, adminPassword: 'admin-test',
      getSession: async () => users[userId] ? {userId, user: users[userId]} : null
    });
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
    return result;
  }
  const admin = {password: 'admin-test'};
  const batch = [{mote: 'Poli', details: {name: 'Integrante de prueba', bloodType: 'A+'}}];
  assert.equal((await call('profile-admin-import', {profiles: batch})).status, 401);
  assert.equal((await call('profile-admin-import', {...admin, profiles: batch})).json.added, 1);
  assert.equal((await call('profile-admin-import', {...admin, profiles: batch})).json.added, 0);
  assert.equal((await call('profile-read')).status, 401);
  assert.equal((await call('profile-read', {}, 'revoked')).status, 403);
  assert.deepEqual((await call('profile-read', {id: 'mote:poli'}, 'other')).json.details, {});
  assert.equal((await call('profile-status', {}, 'first')).json.submitted, false);
  assert.equal((await call('profile-admin-link', {...admin, id: 'mote:poli', userId: 'revoked'})).status, 400);
  assert.equal((await call('profile-admin-link', {...admin, id: 'mote:poli', userId: 'first'})).status, 200);
  assert.equal((await call('profile-read', {}, 'first')).json.details.bloodType, 'A+');
  assert.deepEqual((await call('profile-read', {id: 'mote:poli'}, 'other')).json.details, {});
  assert.equal((await call('profile-save', {details: {name: 'Prueba', birthDate: '2026-02-31'}}, 'first')).status, 400);
  assert.equal((await call('profile-save', {id: 'mote:poli', details: {name: 'Otro integrante'}}, 'other')).status, 200);
  assert.equal((await call('profile-read', {}, 'first')).json.details.name, 'Integrante de prueba');
  assert.equal((await call('profile-save', {details: {name: 'Integrante de prueba', bloodType: 'O+'}}, 'first')).status, 200);
  assert.equal((await call('profile-status', {}, 'first')).json.submitted, true);
  const list = await call('profile-admin-list', admin);
  assert.ok(list.json.profiles.every(profile => !Object.hasOwn(profile, 'details')));
  assert.equal((await call('profile-admin-view', {id: 'mote:poli'})).status, 401);
  assert.equal((await call('profile-admin-view', {...admin, id: 'mote:poli'})).json.details.bloodType, 'O+');
});
