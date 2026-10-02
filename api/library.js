import pdfParse from 'pdf-parse';
import { listBooks, saveBook, deleteBook, chunkText } from '../lib/library-store.js';

const MAX_FILE_BYTES = 3_000_000;

function adminOk(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

function safe(value = '', max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function decodeDataUrl(value = '') {
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Archivo inválido.');
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function pdfToChunks(buffer) {
  let pageNumber = 0;
  const pages = [];

  const pagerender = async pageData => {
    const currentPage = ++pageNumber;
    const content = await pageData.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false
    });

    const text = content.items
      .map(item => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({ page: currentPage, text });
    return text;
  };

  await pdfParse(buffer, { pagerender });
  return pages.flatMap(page => chunkText(page.text, page.page));
}

function textToChunks(buffer) {
  return chunkText(buffer.toString('utf8'), null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    if (!adminOk(req.body?.password)) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const action = String(req.body?.action || '');

    if (action === 'list') {
      const books = await listBooks();
      return res.status(200).json({
        ok: true,
        books: books.map(({ originalPath, chunksPath, ...book }) => book)
      });
    }

    if (action === 'delete') {
      const ok = await deleteBook(safe(req.body?.id, 100));
      if (!ok) return res.status(404).json({ error: 'Libro no encontrado.' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'upload') {
      const title = safe(req.body?.title, 160);
      const author = safe(req.body?.author, 120);
      const filename = safe(req.body?.filename, 180);
      const { mimeType, buffer } = decodeDataUrl(req.body?.fileData || '');

      if (!title) {
        return res.status(400).json({ error: 'Escribe el título del libro.' });
      }

      if (buffer.length > MAX_FILE_BYTES) {
        return res.status(413).json({
          error: 'Este cargador inicial admite archivos de hasta 3 MB. Si tu PDF pesa más, conviene optimizarlo o implementar subida directa.'
        });
      }

      const looksPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(filename);
      const looksText = /^text\//.test(mimeType) || /\.(txt|md)$/i.test(filename);

      if (!looksPdf && !looksText) {
        return res.status(400).json({ error: 'Por ahora admite PDF, TXT y MD.' });
      }

      const chunks = looksPdf ? await pdfToChunks(buffer) : textToChunks(buffer);

      if (!chunks.length) {
        return res.status(400).json({
          error: 'No pude extraer texto. Si el PDF es un escaneo de imágenes, necesitará OCR.'
        });
      }

      const book = await saveBook({
        title,
        author,
        filename,
        mimeType,
        size: buffer.length,
        originalBuffer: buffer,
        chunks
      });

      const { originalPath, chunksPath, ...publicBook } = book;
      return res.status(200).json({ ok: true, book: publicBook });
    }

    return res.status(400).json({ error: 'Acción no válida.' });
  } catch (err) {
    console.error('Error en Biblioteca Tuna:', err);
    return res.status(500).json({
      error: err?.message || 'No se pudo procesar el libro.'
    });
  }
}
