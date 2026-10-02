import { kv } from '@vercel/kv';
import { getSessionUser } from '../lib/auth.js';
import { getAllSongs } from '../lib/song-store.js';
import { getKnowledgeChunks } from '../lib/library-store.js';
import { searchKnowledge, searchSongs } from '../lib/ai-knowledge.js';

const DAILY_LIMIT = Math.max(1, Number(process.env.AI_DAILY_LIMIT || 20));
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';

function safe(value = '', max = 800) {
  return String(value ?? '').trim().slice(0, max);
}

async function requireApproved(req, res) {
  const session = await getSessionUser(req);

  if (!session) {
    res.status(401).json({ error: 'Inicia sesión para usar el asistente.' });
    return null;
  }

  if (session.user.approved !== true) {
    res.status(403).json({ error: 'Tu cuenta todavía no tiene acceso autorizado.' });
    return null;
  }

  return session;
}

async function consumeQuota(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai:usage:${day}:${userId}`;
  const current = Number(await kv.get(key) || 0);

  if (current >= DAILY_LIMIT) return { ok: false, remaining: 0 };

  await kv.set(key, current + 1, { ex: 60 * 60 * 48 });
  return {
    ok: true,
    remaining: Math.max(0, DAILY_LIMIT - current - 1)
  };
}

function outputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const pieces = [];

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content?.text) pieces.push(content.text);
    }
  }

  return pieces.join('\n').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const session = await requireApproved(req, res);
    if (!session) return;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: 'La IA todavía no está configurada en Vercel.'
      });
    }

    const question = safe(req.body?.question, 700);
    if (!question) {
      return res.status(400).json({ error: 'Escribe una pregunta.' });
    }

    const quota = await consumeQuota(session.userId);
    if (!quota.ok) {
      return res.status(429).json({
        error: `Llegaste al límite de ${DAILY_LIMIT} consultas de IA de hoy.`,
        remaining: 0
      });
    }

    const [knowledge, songs] = await Promise.all([
      getKnowledgeChunks(),
      getAllSongs().catch(() => [])
    ]);

    const bookHits = searchKnowledge(question, knowledge, 7);
    const songHits = searchSongs(question, songs, 3);

    const context = [
      ...bookHits.map((hit, index) =>
        `[B${index + 1}] ${hit.source}${hit.page ? `, p. ${hit.page}` : ''}\n${hit.text}`
      ),
      ...songHits.map((hit, index) =>
        `[C${index + 1}] ${hit.title}${hit.music ? ` — ${hit.music}` : ''}\n${hit.text}`
      )
    ].join('\n\n');

    if (!context) {
      return res.status(200).json({
        ok: true,
        answer: 'No encontré esa información en la biblioteca cargada.',
        sources: [],
        remaining: quota.remaining
      });
    }

    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .slice(-6)
          .map(item => `${item?.role === 'assistant' ? 'Asistente' : 'Usuario'}: ${safe(item?.content, 900)}`)
          .join('\n')
      : '';

    const instructions = `Eres el asistente de estudio del Cancionero de la Tuna de Derecho FES Acatlán.
Responde únicamente usando el contexto proporcionado.
No inventes datos.
Si el contexto no basta, di: "No encontré esa información en la biblioteca cargada."
Cita [B1], [B2], etc. cuando uses libros y [C1], [C2], etc. cuando uses canciones.
Si dos fuentes discrepan, explica la diferencia.
Resume y no reproduzcas páginas ni letras completas.
Para pardillos explica con claridad y tono didáctico.
Responde en español.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input: `${history ? `${history}\n\n` : ''}PREGUNTA:\n${question}\n\nCONTEXTO:\n${context}`,
        reasoning: { effort: 'low' },
        max_output_tokens: 700
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return res.status(502).json({
        error: 'No se pudo consultar la IA.',
        remaining: quota.remaining
      });
    }

    const sources = [
      ...bookHits.map((hit, index) => ({
        id: `B${index + 1}`,
        type: 'book',
        title: hit.title,
        source: hit.source,
        page: hit.page || null
      })),
      ...songHits.map((hit, index) => ({
        id: `C${index + 1}`,
        type: 'song',
        title: hit.title,
        source: 'Cancionero',
        page: null
      }))
    ];

    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      ok: true,
      answer: outputText(data) || 'No pude generar una respuesta.',
      sources,
      remaining: quota.remaining,
      limit: DAILY_LIMIT,
      model: MODEL
    });
  } catch (err) {
    console.error('Error en /api/ia:', err);
    return res.status(500).json({ error: 'No se pudo procesar la consulta.' });
  }
}
