import { kv } from '@vercel/kv';
import { getSessionUser } from './auth.js';
import { getAllSongs } from './song-store.js';
import { getKnowledgeChunks } from './library-store.js';
import { searchKnowledge, searchSongs } from './ai-knowledge.js';

const DAILY_LIMIT=Math.max(1,Number(process.env.AI_DAILY_LIMIT||20));
const MODEL=process.env.OPENAI_MODEL||'gpt-6-luna';
const safe=(value='',max=800)=>String(value??'').trim().slice(0,max);

async function consumeQuota(userId){
  const day=new Date().toISOString().slice(0,10);
  const key='ai:usage:'+day+':'+userId;
  const current=Number(await kv.get(key)||0);
  if(current>=DAILY_LIMIT)return{ok:false,remaining:0};
  await kv.set(key,current+1,{ex:172800});
  return{ok:true,remaining:Math.max(0,DAILY_LIMIT-current-1)};
}

function outputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of data?.output||[])for(const content of item?.content||[])if(content?.type==='output_text'&&content?.text)parts.push(content.text);
  return parts.join('\n').trim();
}

export async function handleAiAction(req,res){
  const session=await getSessionUser(req);
  if(!session)return res.status(401).json({error:'Inicia sesión para usar el asistente.'});
  if(session.user.approved!==true)return res.status(403).json({error:'Tu cuenta todavía no tiene acceso autorizado.'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'La IA todavía no está configurada en Vercel.'});

  const question=safe(req.body?.question,700);
  if(!question)return res.status(400).json({error:'Escribe una pregunta.'});

  const quota=await consumeQuota(session.userId);
  if(!quota.ok)return res.status(429).json({error:'Llegaste al límite diario de consultas de IA.',remaining:0});

  const [knowledge,songs]=await Promise.all([getKnowledgeChunks(),getAllSongs().catch(()=>[])]);
  const bookHits=searchKnowledge(question,knowledge,7);
  const songHits=searchSongs(question,songs,3);

  const context=[
    ...bookHits.map((hit,index)=>'[B'+(index+1)+'] '+hit.source+(hit.page?', p. '+hit.page:'')+'\n'+hit.text),
    ...songHits.map((hit,index)=>'[C'+(index+1)+'] '+hit.title+(hit.music?' — '+hit.music:'')+'\n'+hit.text)
  ].join('\n\n');

  if(!context)return res.status(200).json({ok:true,answer:'No encontré esa información en la biblioteca cargada.',sources:[],remaining:quota.remaining});

  const instructions='Eres el asistente de estudio del Cancionero de la Tuna de Derecho FES Acatlán. Responde únicamente usando el contexto proporcionado. No inventes datos. Cita [B1], [B2], etc. para libros y [C1], [C2], etc. para canciones. Si el contexto no basta, dilo. Resume y no reproduzcas páginas ni letras completas. Explica con claridad para pardillos. Responde en español.';

  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model:MODEL,instructions,input:'PREGUNTA:\n'+question+'\n\nCONTEXTO:\n'+context,reasoning:{effort:'low'},max_output_tokens:700})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){console.error('OpenAI API:',data);return res.status(502).json({error:'No se pudo consultar la IA.',remaining:quota.remaining});}

  const sources=[
    ...bookHits.map((hit,index)=>({id:'B'+(index+1),type:'book',title:hit.title,source:hit.source,page:hit.page||null})),
    ...songHits.map((hit,index)=>({id:'C'+(index+1),type:'song',title:hit.title,source:'Cancionero',page:null}))
  ];
  return res.status(200).json({ok:true,answer:outputText(data)||'No pude generar una respuesta.',sources,remaining:quota.remaining,limit:DAILY_LIMIT,model:MODEL});
}
