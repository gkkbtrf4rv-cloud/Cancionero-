import { kv } from '@vercel/kv';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
  if(!process.env.ADMIN_PASSWORD||req.body?.password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:'Contraseña incorrecta'});
  try{
    const ids=await kv.smembers('subs:all'); const rows=[];
    for(const id of ids){const [sub,meta]=await Promise.all([kv.get(`sub:${id}`),kv.get(`submeta:${id}`)]);if(!sub)continue;rows.push({id,mote:meta?.mote||'Sin identificar',email:meta?.email||meta?.username||'—',platform:meta?.platform||'—',installed:Boolean(meta?.installed),lastSeenAt:meta?.lastSeenAt||null,lastDelivery:meta?.lastDelivery||null});}
    rows.sort((a,b)=>String(a.mote).localeCompare(String(b.mote),'es'));
    return res.status(200).json({ok:true,total:rows.length,subscribers:rows});
  }catch(err){console.error('Error listando suscriptores:',err);return res.status(500).json({error:'No se pudieron cargar los suscriptores.'});}
}
