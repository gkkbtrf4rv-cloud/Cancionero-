const STOPWORDS = new Set([
  'a','al','algo','como','con','cual','cuando','de','del','donde','el','ella','en','es',
  'esa','ese','esto','hay','la','las','lo','los','me','mi','para','por','que','qué',
  'se','si','sin','sobre','su','sus','un','una','unos','unas','y','ya','tuna','tuno','tunos'
]);

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñüáéíóú\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function terms(value = '') {
  return normalize(value)
    .split(' ')
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

function scoreText(queryTerms, haystack, boosts = []) {
  const normalized = normalize(haystack);
  if (!normalized) return 0;

  let score = 0;

  for (const term of new Set(queryTerms)) {
    if (normalized.includes(term)) score += 2;
    score += Math.min(normalized.split(term).length - 1, 4) * 0.4;

    for (const boost of boosts) {
      if (normalize(boost).includes(term)) score += 2.5;
    }
  }

  return score;
}

export function searchKnowledge(query, chunks = [], limit = 7) {
  const q = terms(query);
  if (!q.length) return [];

  return chunks
    .map(chunk => ({
      ...chunk,
      _score: scoreText(
        q,
        `${chunk.text || ''} ${chunk.title || ''} ${(chunk.tags || []).join(' ')}`,
        [chunk.title || '', (chunk.tags || []).join(' ')]
      )
    }))
    .filter(item => item._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...chunk }) => chunk);
}

function songText(song) {
  const output = [];

  for (const stanza of song?.estrofas || []) {
    for (const line of stanza || []) {
      if (line?.texto) output.push(line.texto);
      if (line?.acordes) output.push(line.acordes);
    }
  }

  return output.join('\n').slice(0, 4500);
}

export function searchSongs(query, songs = [], limit = 3) {
  const q = terms(query);
  if (!q.length) return [];

  return songs
    .map(song => {
      const title = String(song?.titulo || '');
      const music = String(song?.musica || '');
      const text = songText(song);

      return {
        title,
        music,
        text,
        _score: scoreText(q, `${title} ${music} ${text}`, [title, music])
      };
    })
    .filter(item => item._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...song }) => song);
}
