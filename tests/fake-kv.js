export const values = new Map();
export const kv = {
  async get(key) { return structuredClone(values.get(key) ?? null); },
  async set(key, value, options = {}) { if (options.nx && values.has(key)) return null; values.set(key, structuredClone(value)); return 'OK'; },
  async del(...keys) { keys.forEach(key => values.delete(key)); },
  async smembers(key) { return [...(values.get(key) || [])]; },
  async sadd(key, ...members) { const set = new Set(values.get(key) || []); members.forEach(m => set.add(m)); values.set(key, set); },
  async srem(key, ...members) { const set = new Set(values.get(key) || []); members.forEach(m => set.delete(m)); values.set(key, set); }
};
