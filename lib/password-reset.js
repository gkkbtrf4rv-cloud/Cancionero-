import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { hashPassword, normalizeEmail, userIdFromEmail } from './auth.js';
import { sendEmail, passwordResetEmail } from './email.js';

export const RESET_TTL = 30 * 60;
export const GENERIC_MESSAGE = 'Si existe una cuenta con ese correo, recibirás un enlace. Revisa también Spam/No deseado. Puedes solicitar hasta 3 enlaces por hora.';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const tokenKey = token => `password-reset:${digest(token)}`;
export const LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;
// Consume el enlace y actualiza la contraseña en una sola operación. Conserva
// la aprobación y cualquier edición de la cuenta realizada mientras tanto.
export const RESET_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local userRaw = redis.call('GET', KEYS[2])
if not raw or not userRaw then return 0 end
local reset = cjson.decode(raw)
local user = cjson.decode(userRaw)
if reset.userId ~= user.id or reset.passwordHash ~= user.passwordHash then return 0 end
user.passwordSalt = ARGV[1]
user.passwordHash = ARGV[2]
user.sessionsInvalidated = true
user.passwordChangedAt = ARGV[3]
redis.call('SET', KEYS[2], cjson.encode(user))
redis.call('DEL', KEYS[1])
return 1
`;

export async function requestPasswordReset(email, ip, deps = { kv, sendEmail }) {
  const store = deps.kv;
  const normalized = normalizeEmail(email);
  const userId = userIdFromEmail(normalized);
  const ipCount = await store.eval(LIMIT_SCRIPT, [`reset-limit:ip:${digest(ip)}`], [3600]);
  if (Number(ipCount) > 20) return;
  const count = await store.eval(LIMIT_SCRIPT, [`reset-limit:user:${userId}`], [3600]);
  if (Number(count) > 3) return;
  // APP_URL es obligatorio: nunca construimos enlaces desde un Host enviado
  // por el cliente. Usar el dominio estable de producción.
  const app = new URL(process.env.APP_URL || '');
  if (app.protocol !== 'https:' || app.username || app.password) throw new Error('APP_URL debe ser una URL HTTPS de confianza.');
  const user = await store.get(`user:${userId}`);
  if (!user) return;
  const token = crypto.randomBytes(32).toString('base64url');
  const key = tokenKey(token);
  await store.set(key, { userId, passwordHash: user.passwordHash }, { ex: RESET_TTL });
  const resetUrl = `${app.origin}/api/login#token=${token}`;
  const sent = await deps.sendEmail({ to: user.email, ...passwordResetEmail({ mote: user.mote, resetUrl }) });
  if (!sent.ok) {
    await store.del(key);
    console.error('No se pudo enviar el enlace de recuperación:', sent.code || 'email_error');
  }
}

export async function confirmPasswordReset(token, password, deps = { kv }) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  if (password.length < 8 || password.length > 128) throw new Error('La contraseña debe tener entre 8 y 128 caracteres.');
  const reset = await deps.kv.get(tokenKey(token));
  if (!reset?.userId) return false;
  const { salt, hash } = await hashPassword(password);
  return Number(await deps.kv.eval(RESET_SCRIPT,
    [tokenKey(token), `user:${reset.userId}`], [salt, hash, new Date().toISOString()])) === 1;
}
