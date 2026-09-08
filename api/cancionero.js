import crypto from 'crypto';
import { getSessionUser } from '../lib/auth.js';
import { kv } from '@vercel/kv';
import { getAllSongs, saveAllSongs } from '../lib/song-store.js';

function adminOk(password) {
  return Boolean(process.env.ADMIN_PASSWORD) && password === process.env.ADMIN_PASSWORD;
}

function keepSpacing(value='', max=500) {
  return String(value ?? '').replace(/\r/g,'').slice(0,max);
}

function cleanLine(line = {}) {
  return {
    acordes: keepSpacing(line.acordes, 180),
    texto: keepSpacing(line.texto, 500)
  };
}

function cleanSong(song = {}, id = '') {
  const titulo = String(song.titulo || '').trim().slice(0, 120);
  const musica = String(song.musica || '').trim().slice(0, 800);
  const estrofas = Array.isArray(song.estrofas)
    ? song.estrofas.slice(0, 80).map(st => Array.isArray(st)
      ? st.slice(0, 40).map(cleanLine).filter(x => x.acordes.trim() || x.texto.trim())
      : []).filter(st => st.length)
    : [];
  return {
    id: id || String(song.id || `admin-${Date.now()}`),
    titulo,
    musica,
    estrofas,
    origin: String(song.origin || 'admin') === 'original' ? 'original' : 'admin'
  };
}

function mergedVersion(songs) {
  return crypto.createHash('sha256').update(JSON.stringify(songs)).digest('hex').slice(0, 16);
}

export default async function handler(req, res) {
  try {
    // Reutilizamos esta función para no aumentar el número de Vercel Functions del plan Hobby.
    if (req.method === 'POST') {
      if (!adminOk(req.body?.password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
      const action = req.body?.action;

      if (action === 'set-popup') {
        const imageData = String(req.body?.imageData || '');
        const title = String(req.body?.title || '').trim().slice(0, 80);
        const body = String(req.body?.body || '').trim().slice(0, 300);
        if (!imageData.startsWith('data:image/')) return res.status(400).json({ error: 'Selecciona una imagen válida.' });
        if (imageData.length > 1_250_000) return res.status(413).json({ error: 'La imagen sigue siendo demasiado pesada. Usa una foto más pequeña.' });
        const popup = { id: `popup-${Date.now()}`, imageData, title, body, active: true, createdAt: new Date().toISOString() };
        await kv.set('app:popup', popup);
        return res.status(200).json({ ok: true, popup: { ...popup, imageData: undefined } });
      }

      if (action === 'clear-popup') {
        await kv.del('app:popup');
        return res.status(200).json({ ok: true });
      }

      if (action === 'get-popup-admin') {
        const popup = await kv.get('app:popup');
        return res.status(200).json({ ok: true, popup: popup || null });
      }

      if (action === 'list-songs' || action === 'list-custom-songs') {
        const songs = await getAllSongs();
        return res.status(200).json({ ok: true, songs, total:songs.length });
      }

      if (action === 'save-song' || action === 'save-custom-song') {
        const songs = await getAllSongs();
        const incomingId = String(req.body?.song?.id || '').trim();
        const existing = incomingId ? songs.find(s => s.id === incomingId) : null;
        const song = cleanSong({ ...req.body?.song, origin: existing?.origin || 'admin' }, incomingId || `admin-${Date.now()}`);
        if (!song.titulo) return res.status(400).json({ error: 'Escribe el título de la canción.' });
        if (!song.estrofas.length) return res.status(400).json({ error: 'Agrega al menos una línea de letra o acordes.' });
        const idx = songs.findIndex(s => s.id === song.id);
        if (idx >= 0) songs[idx] = song; else songs.push(song);
        const saved = await saveAllSongs(songs);
        return res.status(200).json({ ok: true, song, total: saved.length });
      }

      if (action === 'delete-song' || action === 'delete-custom-song') {
        const id = String(req.body?.id || '').trim();
        const songs = await getAllSongs();
        const next = songs.filter(s => s.id !== id);
        if (next.length === songs.length) return res.status(404).json({ error: 'Canción no encontrada.' });
        await saveAllSongs(next);
        return res.status(200).json({ ok: true, total: next.length });
      }

      return res.status(400).json({ error: 'Acción no válida.' });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para consultar el cancionero.' });
    if (session.user.approved !== true) return res.status(403).json({ error: 'Tu cuenta está pendiente de autorización.' });

    const [popup, canciones] = await Promise.all([kv.get('app:popup'), getAllSongs()]);
    const version = mergedVersion(canciones);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, version, canciones, popup: popup?.active ? popup : null });
  } catch (err) {
    console.error('Error en cancionero:', err);
    return res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  }
}
