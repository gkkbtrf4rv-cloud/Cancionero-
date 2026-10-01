import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, createSession, getSessionUser, userIdFromEmail } from '../lib/auth.js';
import { requestPasswordReset, confirmPasswordReset, RESET_SCRIPT, LIMIT_SCRIPT, tokenKey } from '../lib/password-reset.js';
import { passwordResetPage } from '../lib/password-reset-page.js';

// El doble simula expiración y operaciones atómicas; no sustituye una prueba
// del Lua contra el Redis de staging, descrita en docs/password-recovery.md.
class Store {
  data = new Map(); now = 0;
  async set(k,v,options={}) { this.data.set(k,{v:structuredClone(v),until:options.ex?this.now+options.ex:Infinity}); }
  async get(k) { const row=this.data.get(k); return row && row.until>this.now ? structuredClone(row.v) : null; }
  async del(k) { this.data.delete(k); }
  async eval(script,keys,args) {
    if(script===LIMIT_SCRIPT){const n=(await this.get(keys[0])||0)+1;await this.set(keys[0],n,{ex:3600});return n;}
    assert.equal(script,RESET_SCRIPT);
    // Sin await entre comprobación y escritura: modela la operación Redis.
    const get=k=>{const row=this.data.get(k);return row&&row.until>this.now?row.v:null;};
    const reset=get(keys[0]),user=get(keys[1]);
    if(!reset||!user||reset.userId!==user.id||reset.passwordHash!==user.passwordHash)return 0;
    this.data.set(keys[1],{v:{...user,passwordSalt:args[0],passwordHash:args[1],sessionsInvalidated:true,passwordChangedAt:args[2]},until:Infinity});
    this.data.delete(keys[0]);return 1;
  }
}
async function fixture() {
  process.env.APP_URL='https://cancionero.example';
  const store=new Store(), email='integrante@example.com', id=userIdFromEmail(email);
  const old=await hashPassword('clave-anterior');
  await store.set(`user:${id}`,{id,email,mote:'Tuno',approved:true,emailVerified:true,passwordSalt:old.salt,passwordHash:old.hash});
  const mail=[];const deps={kv:store,sendEmail:async m=>{mail.push(m);return {ok:true};}};
  return {store,email,id,mail,deps};
}
function tokenFrom(mail){return new URL(mail.text.match(/https:\/\/\S+/)[0].replace(/\.$/, '')).hash.slice('#token='.length);}

test('solicita, conserva aprobación, invalida otros enlaces y rechaza reutilización',async()=>{
  const f=await fixture();
  await requestPasswordReset(f.email,'ip',f.deps);
  await requestPasswordReset(f.email,'ip',f.deps);
  const token=tokenFrom(f.mail[0]),other=tokenFrom(f.mail[1]);
  assert.equal((await f.store.get(tokenKey(token))).userId,f.id);
  assert.equal(await confirmPasswordReset(token,'clave-nueva',f.deps),true);
  const user=await f.store.get(`user:${f.id}`);
  assert.equal(user.approved,true);assert.equal(user.emailVerified,true);
  assert.equal(await verifyPassword('clave-nueva',user.passwordSalt,user.passwordHash),true);
  assert.equal(await verifyPassword('clave-anterior',user.passwordSalt,user.passwordHash),false);
  assert.equal(await confirmPasswordReset(token,'otra-clave',f.deps),false);
  assert.equal(await confirmPasswordReset(other,'otra-clave',f.deps),false);
});
test('enlace caducado, falso, contraseña corta y dos confirmaciones simultáneas',async()=>{
  const f=await fixture();await requestPasswordReset(f.email,'ip',f.deps);const token=tokenFrom(f.mail[0]);
  await assert.rejects(confirmPasswordReset(token,'corta',f.deps));
  assert.equal(await confirmPasswordReset('invalido','clave-nueva',f.deps),false);
  f.store.now=1801;assert.equal(await confirmPasswordReset(token,'clave-nueva',f.deps),false);
  await requestPasswordReset(f.email,'ip',f.deps);const fresh=tokenFrom(f.mail[1]);
  const outcomes=await Promise.all([confirmPasswordReset(fresh,'clave-nueva',f.deps),confirmPasswordReset(fresh,'otra-nueva',f.deps)]);
  assert.deepEqual(outcomes.sort(),[false,true]);
});
test('cuenta inexistente y límites por cuenta/IP no envían correo adicional',async()=>{
  const f=await fixture();await requestPasswordReset('nadie@example.com','ip',f.deps);assert.equal(f.mail.length,0);
  for(let i=0;i<5;i++)await requestPasswordReset(f.email,'ip',f.deps);assert.equal(f.mail.length,3);
  for(let i=0;i<25;i++)await requestPasswordReset(`nadie${i}@example.com`,'otra-ip',f.deps);
  await requestPasswordReset(f.email,'otra-ip',f.deps);assert.equal(f.mail.length,3);
});
test('fallo de correo borra el enlace y URL no confiable se rechaza',async()=>{
  const f=await fixture();f.deps.sendEmail=async()=>({ok:false,code:'test_failure'});
  await requestPasswordReset(f.email,'ip',f.deps);
  assert.equal([...f.store.data.keys()].filter(k=>k.startsWith('password-reset:')).length,0);
  process.env.APP_URL='http://unsafe.example';await assert.rejects(requestPasswordReset(f.email,'ip',f.deps));
});
test('sesiones nuevas y heredadas se invalidan tras reset; nuevas funcionan',async()=>{
  const f=await fixture();
  {
    const user=await f.store.get(`user:${f.id}`),token=await createSession(f.id,user.passwordHash,f.store);
    await f.store.set('session:legacy',f.id);const req=t=>({headers:{authorization:`Bearer ${t}`}});
    assert.ok(await getSessionUser(req(token),null,f.store));assert.ok(await getSessionUser(req('legacy'),null,f.store));
    await requestPasswordReset(f.email,'ip',f.deps);await confirmPasswordReset(tokenFrom(f.mail[0]),'clave-nueva',f.deps);
    assert.equal(await getSessionUser(req(token),null,f.store),null);assert.equal(await getSessionUser(req('legacy'),null,f.store),null);
    const updated=await f.store.get(`user:${f.id}`),fresh=await createSession(f.id,updated.passwordHash,f.store);
    assert.ok(await getSessionUser(req(fresh),null,f.store));
  }
});
test('página aislada no filtra el token en referer y solicita confirmación',()=>{
  assert.match(passwordResetPage,/no-referrer/);assert.match(passwordResetPage,/history.replaceState/);
  assert.match(passwordResetPage,/confirmation/);assert.doesNotMatch(passwordResetPage,/https:\/\/fonts/);
});
