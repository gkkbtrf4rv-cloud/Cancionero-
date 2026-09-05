import crypto from 'crypto';
import { kv } from '@vercel/kv';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function normalizeUsername(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

export function normalizeMote(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

export function userIdFromUsername(username) {
  return crypto.createHash('sha256').update(normalizeUsername(username)).digest('hex').slice(0, 32);
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, salt, expectedHex) {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHex || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await kv.set(`session:${token}`, userId, { ex: SESSION_TTL_SECONDS });
  return token;
}

export function getBearerToken(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

export async function getSessionUser(req, explicitToken = null) {
  const token = explicitToken || getBearerToken(req);
  if (!token) return null;
  const userId = await kv.get(`session:${token}`);
  if (!userId) return null;
  const user = await kv.get(`user:${userId}`);
  if (!user) return null;
  return { token, userId, user };
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    mote: user.mote,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
}
