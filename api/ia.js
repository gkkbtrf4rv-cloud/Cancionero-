import { kv } from '@vercel/kv';
import { getSessionUser } from '../lib/auth.js';
import { getAllSongs } from '../lib/song-store.js';
import { getKnowledgeChunks } from '../lib/library-store.js';
import { searchKnowledge, searchSongs } from '../lib/ai-knowledge.js';
const LIMIT=Math.max(1,Number(process.env.AI_DAILY_LIMIT||20)),MODEL=process.env.OPENAI_MODEL||'gpt-6-luna';
const safe=(v='',m=800)=>String(v??'').trim().slice(0,m);
async function session(req,res){const s=await getSessionUser(req);if(!s){res.status(401).json({error:'Inicia sesión.'});return null}if(s.user.approved!==true){res.status(403).json({error:'Cuenta no autorizada.'});return null}return s}
async function quota(id){const d=new Date().toISOString().slice(0,10),k='ai:usage:'+d+':'+id,n=Number(await kv.get(k)||0);if(n>=LIMIT)return{ok:false,remaining:0};await kv.set(k,n+1,{ex:172800});return{ok:true,remaining:Math.max(0,LIMIT-n-1)}}
function textOut(d){if(typeof d?.output_text==='string')return d.output_text.trim();const a=[];for(const i of d?.output||[])for(const c of i?.content||[])if(c?.type==='output_text'&&c?.text)a.push(c.text);return a.join('\n').trim()}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 try{
  const s=await session(req,res);if(!s)return;if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'Falta configurar OPENAI_API_KEY.'});
  const question=safe(req.body?.question,700);if(!question)return res.status(400).json({error:'Escribe una pregunta.'});
  const q=await quota(s.userId);if(!q.ok)return res.status(429).json({error:'Límite diario alcanzado.',remaining:0});
  const [knowledge,songs]=await Promise.all([getKnowledgeChunks(),getAllSongs().catch(()=>[])]);
  const b=searchKnowledge(question,knowledge,7),c=searchSongs(question,songs,3);
  const context=[...b.map((x,i)=>'[B'+(i+1)+'] '+x.source+(x.page?', p. '+x.page:'')+'\n'+x.text),...c.map((x,i)=>'[C'+(i+1)+'] '+x.title+(x.music?' — '+x.music:'')+'\n'+x.text)].join('\n\n');
  if(!context)return res.status(200).json({ok:true,answer:'No encontré esa información en la biblioteca cargada.',sources:[],remaining:q.remaining});
  const instructions='Eres el asistente de estudio de la Tuna de Derecho FES Acatlán. Responde solo con el contexto. No inventes datos. Cita [B1], [B2] o [C1]. Si no basta, dilo. Resume y responde en español, especialmente claro para pardillos.';
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,instructions,input:'PREGUNTA:\n'+question+'\n\nCONTEXTO:\n'+context,reasoning:{effort:'low'},max_output_tokens:700})});
  const d=await r.json().catch(()=>({}));if(!r.ok)return res.status(502).json({error:'No se pudo consultar la IA.',remaining:q.remaining});
  const sources=[...b.map((x,i)=>({id:'B'+(i+1),type:'book',title:x.title,source:x.source,page:x.page||null})),...c.map((x,i)=>({id:'C'+(i+1),type:'song',title:x.title,source:'Cancionero',page:null}))];
  return res.status(200).json({ok:true,answer:textOut(d)||'Sin respuesta.',sources,remaining:q.remaining,limit:LIMIT,model:MODEL});
 }catch(err){console.error('IA:',err);return res.status(500).json({error:'No se pudo procesar la consulta.'})}
}