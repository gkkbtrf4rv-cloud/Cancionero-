import { listBooks, saveBook, deleteBook, chunkText } from './library-store.js';

const MAX_FILE_BYTES = 3000000;
const safe = (value='', max=200) => String(value ?? '').trim().slice(0,max);

function decodeDataUrl(value=''){
  const match=String(value).match(/^data:([^;]+);base64,(.+)$/s);
  if(!match) throw new Error('Archivo inválido.');
  return { mimeType:match[1], buffer:Buffer.from(match[2],'base64') };
}

export async function handleLibraryAction(req,res){
  const action=String(req.body?.action||'');

  if(action==='library-list'){
    const books=await listBooks();
    return res.status(200).json({ok:true,books:books.map(({originalPath,chunksPath,...book})=>book)});
  }

  if(action==='library-delete'){
    const ok=await deleteBook(safe(req.body?.id,100));
    return ok ? res.status(200).json({ok:true}) : res.status(404).json({error:'Libro no encontrado.'});
  }

  if(action==='library-upload'){
    const title=safe(req.body?.title,160);
    const author=safe(req.body?.author,120);
    const filename=safe(req.body?.filename,180);
    if(!title)return res.status(400).json({error:'Escribe el título del libro.'});

    const {mimeType,buffer}=decodeDataUrl(req.body?.fileData||'');
    if(buffer.length>MAX_FILE_BYTES)return res.status(413).json({error:'El archivo supera 3 MB.'});

    const isPdf=mimeType==='application/pdf'||/\.pdf$/i.test(filename);
    const isText=/^text\//.test(mimeType)||/\.(txt|md)$/i.test(filename);
    if(!isPdf&&!isText)return res.status(400).json({error:'Solo PDF, TXT o MD.'});

    let chunks=[];
    if(isPdf){
      const pages=Array.isArray(req.body?.pages)?req.body.pages.slice(0,1200):[];
      chunks=pages.flatMap((page,index)=>chunkText(String(page?.text||''),Number(page?.page)||index+1));
    }else{
      const text=String(req.body?.text||'').slice(0,2500000);
      chunks=chunkText(text||buffer.toString('utf8'),null);
    }

    if(!chunks.length)return res.status(400).json({error:'No pude extraer texto. Si el PDF es un escaneo, necesitará OCR.'});

    const book=await saveBook({
      title,author,filename,mimeType,
      size:buffer.length,
      originalBuffer:buffer,
      chunks
    });
    const {originalPath,chunksPath,...publicBook}=book;
    return res.status(200).json({ok:true,book:publicBook});
  }

  return res.status(400).json({error:'Acción de biblioteca no válida.'});
}
