import test from 'node:test';
import assert from 'node:assert/strict';
import { createJsonCache } from '../lib/blob-json-cache.js';

test('concurrent and repeated searches reuse immutable indexes; new paths and TTL reload', async () => {
  let clock = 0, calls = 0;
  const read = createJsonCache({ ttl: 10, now: () => clock });
  const load = async () => { calls++; return [{ text: 'tuna' }]; };
  await Promise.all([read('a', load), read('a', load)]);
  await read('a', load);
  assert.equal(calls, 1);
  await read('b', load);
  assert.equal(calls, 2);
  clock = 11;
  await read('a', load);
  assert.equal(calls, 3);
});
test('failed or invalid indexes are retried, never cached as empty results', async () => {
  const read = createJsonCache();
  await assert.rejects(read('a', async () => { throw Error('offline'); }));
  await assert.rejects(read('a', async () => ({})), /BOOK_INDEX_INVALID/);
  assert.deepEqual(await read('a', async () => []), []);
});
test('memory budget evicts old entries and does not retain oversized indexes', async () => {
  let calls = 0;
  const read = createJsonCache({ maxBytes: 7 });
  const load = async () => { calls++; return ['abc']; };
  await read('a', load); await read('b', load); await read('a', load);
  assert.equal(calls, 3);
  const large = async () => { calls++; return ['too large']; };
  await read('big', large); await read('big', large);
  assert.equal(calls, 5);
});
