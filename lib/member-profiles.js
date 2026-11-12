import { timingSafeEqual } from 'node:crypto';

const STORE_KEY = 'member-profiles:v1';
const FIELDS = {
  name: 160, rank: 80, birthDate: 10, schoolId: 80, contactEmail: 254,
  emergencyContact: 500, allergies: 1000, conditions: 1000, medications: 1000,
  bloodType: 30, notes: 1500
};

const moteKey = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  .normalize('NFD').replace(/\p{M}/gu, '');

class ProfileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function details(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProfileError(400, 'La ficha no tiene el formato esperado.');
  }
  const result = {};
  for (const [field, limit] of Object.entries(FIELDS)) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    if (typeof value !== 'string' || value.length > limit) {
      throw new ProfileError(400, 'Revisa los campos y su longitud.');
    }
    result[field] = value.trim();
  }
  if (result.birthDate) {
    const date = new Date(result.birthDate + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.birthDate) || Number.isNaN(date.getTime())
        || date.toISOString().slice(0, 10) !== result.birthDate) {
      throw new ProfileError(400, 'Escribe una fecha de nacimiento válida.');
    }
  }
  return result;
}

function adminAuthorized(password, expected) {
  if (typeof password !== 'string' || !expected) return false;
  const supplied = Buffer.from(password);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

async function load(store) {
  return await store.get(STORE_KEY) || { version: 0, profiles: [] };
}

const compareAndSet = `
local current = redis.call('GET', KEYS[1])
local version = 0
if current then version = cjson.decode(current).version end
if version ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

async function change(store, update) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await load(store);
    const result = update(state.profiles);
    const next = JSON.stringify({version: state.version + 1, profiles: state.profiles});
    if (await store.eval(compareAndSet, [STORE_KEY], [state.version, next])) return result;
  }
  throw new ProfileError(409, 'La ficha cambió mientras guardabas. Vuelve a intentarlo.');
}

export async function handleProfiles(req, res, {store, getSession, adminPassword}) {
  res.setHeader('Cache-Control', 'private, no-store');
  const {action} = req.body;
  try {
    if (action.startsWith('profile-admin-')) {
      if (!adminAuthorized(req.body.password, adminPassword)) {
        throw new ProfileError(401, 'Contraseña de administrador incorrecta.');
      }
      if (action === 'profile-admin-import') {
        const incoming = req.body.profiles;
        if (!Array.isArray(incoming) || !incoming.length || incoming.length > 100) {
          throw new ProfileError(400, 'Importa entre 1 y 100 fichas.');
        }
        const batch = incoming.map(row => {
          const mote = row?.mote?.trim?.();
          if (!mote || !moteKey(mote) || mote.length > 80) throw new ProfileError(400, 'Cada ficha requiere un mote válido.');
          return {id: 'mote:' + moteKey(mote), mote, userId: null, submitted: false, details: details(row.details)};
        });
        if (new Set(batch.map(row => row.id)).size !== batch.length) {
          throw new ProfileError(400, 'El archivo contiene motes repetidos.');
        }
        const added = await change(store, profiles => {
          const existing = new Set(profiles.map(profile => profile.id));
          const pending = batch.filter(row => !existing.has(row.id));
          profiles.push(...pending);
          return pending.length;
        });
        return res.status(200).json({added, existing: batch.length - added});
      }
      if (action === 'profile-admin-list') {
        const [{profiles}, ids] = await Promise.all([load(store), store.smembers('users:all')]);
        const users = await Promise.all(ids.map(id => store.get('user:' + id)));
        const accounts = users.filter(user => user?.approved === true && user.emailVerified !== false)
          .map(({id, mote, email}) => ({id, mote, email, key: moteKey(mote)}));
        return res.status(200).json({
          profiles: profiles.map(({id, mote, userId, submitted, details}) => ({
            id, mote, userId, submitted, name: details.name || '',
            accounts: userId ? [] : accounts.filter(account => account.key === moteKey(mote))
          }))
        });
      }
      if (action === 'profile-admin-view') {
        const {profiles} = await load(store);
        const profile = profiles.find(item => item.id === req.body.id);
        if (!profile) throw new ProfileError(404, 'No se encontró la ficha.');
        return res.status(200).json({mote: profile.mote, details: profile.details});
      }
      if (action === 'profile-admin-link') {
        const {id, userId} = req.body;
        if (typeof userId !== 'string' || !/^[a-z\d-]{1,64}$/i.test(userId)) {
          throw new ProfileError(400, 'Selecciona una cuenta.');
        }
        const user = await store.get('user:' + userId);
        if (!user || user.approved !== true || user.emailVerified === false) {
          throw new ProfileError(400, 'La cuenta debe estar autorizada.');
        }
        await change(store, profiles => {
          const profile = profiles.find(item => item.id === id);
          if (!profile || moteKey(profile.mote) !== moteKey(user.mote)) {
            throw new ProfileError(400, 'El mote de la cuenta no coincide con la ficha.');
          }
          if (profile.userId && profile.userId !== userId) {
            throw new ProfileError(409, 'Esta ficha ya está vinculada a otra cuenta.');
          }
          const own = profiles.find(item => item.userId === userId && item.id !== id);
          if (own) {
            if (!own.id.startsWith('user:')) throw new ProfileError(409, 'La cuenta ya tiene otra ficha vinculada.');
            profile.details = {...profile.details, ...Object.fromEntries(
              Object.entries(own.details).filter(([, value]) => value !== '')
            )};
            profile.submitted = own.submitted;
            profiles.splice(profiles.indexOf(own), 1);
          }
          profile.userId = userId;
        });
        return res.status(200).json({ok: true});
      }
      throw new ProfileError(404, 'Acción desconocida.');
    }

    const session = await getSession(req);
    if (!session) throw new ProfileError(401, 'Inicia sesión para consultar tu ficha.');
    if (session.user.approved !== true || session.user.emailVerified === false) {
      throw new ProfileError(403, 'Tu cuenta necesita autorización.');
    }
    if (action === 'profile-save') {
      const values = details(req.body.details);
      if (!values.name) throw new ProfileError(400, 'Escribe tu nombre para guardar la ficha.');
      await change(store, profiles => {
        let own = profiles.find(profile => profile.userId === session.userId);
        if (!own) {
          own = {id: 'user:' + session.userId, userId: session.userId, mote: session.user.mote, details: {}};
          profiles.push(own);
        }
        own.details = {...own.details, ...values};
        own.submitted = true;
      });
      return res.status(200).json({ok: true});
    }

    const {profiles} = await load(store);
    const own = profiles.find(profile => profile.userId === session.userId);
    if (action === 'profile-status') return res.status(200).json({submitted: own?.submitted === true});
    if (action === 'profile-read') {
      return res.status(200).json({mote: session.user.mote, details: own?.details || {}});
    }
    throw new ProfileError(404, 'Acción desconocida.');
  } catch (error) {
    if (error instanceof ProfileError) return res.status(error.status).json({error: error.message});
    return res.status(503).json({error: 'Las fichas no están disponibles. Intenta de nuevo.'});
  }
}
