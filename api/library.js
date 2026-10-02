import pdfParse from 'pdf-parse';
import { listBooks, saveBook, deleteBook, chunkText } from '../lib/library-store.js';
const MAX=3000000;
const adminOk=p=>Boolean(process.env.ADMIN_PASSWORD)&&p===process.env.ADMIN_PASSWORD;
const safe=(v='',m=200)=>String(v??'').trim().slice(0,m);
function decode(v=''){const m=String(v).match(/^data:([^;]+);base64,(.+)$/s);if(!m)throw new Error('Archivo inválido.');return{mime:m[1],buffer:Buffer.from(m[2],'base64')}}
async function pdfChunks(buffer){
 let page=0,pages=[];
 const pagerender=async p=>{const n=++page,c=await p.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false}),text=c.items.map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim();pages.push({page:n,text});return text};
 await pdfParse(buffer,{pagerender});
 return pages.flatMap(p=>chunkText(p.text,p.page));
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 try{
  if(!adminOk(req.body?.password))return res.status(401).json({error:'Contraseña incorrecta'});
  const action=String(req.body?.action||'');
  if(action==='list'){const books=await listBooks();return res.status(200).json({ok:true,books:books.map(({originalPath,indexPath,...b})=>b)})}
  if(action==='delete'){const ok=await deleteBook(safe(req.body?.id,100));return ok?res.status(200).json({ok:true}):res.status(404).json({error:'Libro no encontrado.'})}
  if(action==='upload'){
    const title=safe(req.body?.title,160),author=safe(req.body?.author,120),filename=safe(req.body?.filename,180);
    if(!title)return res.status(400).json({error:'Escribe el título del libro.'});
    const {mime,buffer}=decode(req.body?.fileData||'');
    if(buffer.length>MAX)return res.status(413).json({error:'El archivo supera 3 MB.'});
    const isPdf=mime==='application/pdf'||/\.pdf$/i.test(filename),isText=/^text\//.test(mime)||/\.(txt|md)$/i.test(filename);
    if(!isPdf&&!isText)return res.status(400).json({error:'Solo PDF, TXT o MD.'});
    const chunks=isPdf?await pdfChunks(buffer):chunkText(buffer.toString('utf8'),null);
    if(!chunks.length)return res.status(400).json({error:'No pude extraer texto. Si es un PDF escaneado, necesitará OCR.'});
    const book=await saveBook({title,author,filename,mimeType:mime,buffer,chunks});
    const {originalPath,indexPath,...publicBook}=book;return res.status(200).json({ok:true,book:publicBook});
  }
  return res.status(400).json({error:'Acción no válida.'});
 }catch(err){console.error('Biblioteca:',err);return res.status(500).json({error:err?.message||'No se pudo procesar el libro.'})}
}