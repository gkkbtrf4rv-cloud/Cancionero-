import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Inject the storage and auth boundaries; exercise the real handler without live credentials.
const source=fs.readFileSync(new URL('../lib/attendance.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const {handleAttendance,percentage}=new Function('crypto','kv','getSessionUser','getEvent',source+';return {handleAttendance,percentage};')(await import('node:crypto'),{},async req=>req.session,async()=>({id:'colombia'}));
function memory(){const m=new Map();return {m,async get(k){return structuredClone(m.get(k));},async set(k,v,o){if(o?.nx&&m.has(k))return null;m.set(k,structuredClone(v));return 'OK';},async incr(k){const n=(m.get(k)||0)+1;m.set(k,n);return n;},async expire(){},async eval(_,keys){m.delete(keys[0]);}};}
process.env.ADMIN_PASSWORD='test-admin';
async function request(store,action,body={},user=null){let status=200,result;const req={body:{action,eventId:'colombia',password:'test-admin',...body},session:user?{userId:user,user:{approved:true}}:null};const res={setHeader(){},status(n){status=n;return this;},json(d){result=d;return this;}};await handleAttendance(req,res,store);return {status,...result};}
test('clave temporal, confirmación, duplicados, porcentajes y cancelación',async()=>{const s=memory();s.m.set('user:u',{approved:true,mote:'Tuno'});await request(s,'attendance-admin-member',{userId:'u'});let d=await request(s,'attendance-admin-create',{date:new Date(Date.now()+1000).toISOString()});const id=d.sessions[0].id;d=await request(s,'attendance-admin-open',{sessionId:id});const code=d.sessions[0].code;
assert.equal((await request(s,'attendance-checkin',{sessionId:id,code:'000000'},'u')).status,400);
d=await request(s,'attendance-checkin',{sessionId:id,code},'u');assert.equal(d.sessions[0].myStatus,'pending');assert.equal(d.sessions[0].code,undefined);assert.equal(d.members[0].confirmed,0);
await request(s,'attendance-admin-confirm',{sessionId:id,userId:'u',status:'confirmed'});d=await request(s,'attendance-checkin',{sessionId:id,code},'u');assert.equal(d.sessions[0].myStatus,'confirmed');
d=await request(s,'attendance-admin-close',{sessionId:id});assert.equal(d.members[0].percentage,100);
assert.equal((await request(s,'attendance-checkin',{sessionId:id,code},'u')).status,400);
d=await request(s,'attendance-admin-cancel',{sessionId:id});assert.equal(d.members[0].total,0);assert.equal(d.members[0].percentage,null);
assert.equal((await request(s,'attendance-admin-list',{password:'wrong'})).status,401);
assert.equal((await request(s,'attendance-list')).status,403);
});
test('solo ensayos cerrados desde incorporación; pendiente no suma',()=>{const sessions=[{date:'2026-01-01',status:'closed',records:{u:{status:'confirmed'}}},{date:'2026-03-01',status:'closed',records:{u:{status:'pending'}}},{date:'2026-04-01',status:'closed',records:{u:{status:'confirmed'}}},{date:'2026-05-01',status:'cancelled',records:{}}];assert.deepEqual(percentage(sessions,{joinedAt:'2026-02-01'},'u'),{confirmed:1,total:2,percentage:50});});
