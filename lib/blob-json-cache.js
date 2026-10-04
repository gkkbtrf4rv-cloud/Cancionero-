// Immutable upload pathnames are cache keys. The catalog is always read live,
// so removed books cannot be returned just because their index is cached.
export function createJsonCache({ ttl = 300000, maxBytes = 8 * 1024 * 1024, now = Date.now } = {}) {
  const values = new Map(), pending = new Map();
  let bytes = 0;
  function remove(key) {
    const entry = values.get(key);
    if (entry) bytes -= entry.bytes;
    values.delete(key);
  }
  return async function read(key, load) {
    const entry = values.get(key);
    if (entry && entry.expires > now()) return entry.value;
    remove(key);
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(load).then(value => {
      if (!Array.isArray(value)) throw new Error('BOOK_INDEX_INVALID');
      const size = Buffer.byteLength(JSON.stringify(value));
      for (const [path, cached] of values) if (cached.expires <= now()) remove(path);
      if (size <= maxBytes) {
        while (bytes + size > maxBytes && values.size) remove(values.keys().next().value);
        values.set(key, { value, bytes: size, expires: now() + ttl });
        bytes += size;
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
