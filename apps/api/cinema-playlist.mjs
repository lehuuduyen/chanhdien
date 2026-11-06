import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { json, readJson } from './http.mjs';
import { youtubeVideoId } from './thien-event.mjs';

export const CINEMA_PLAYLIST_LIMIT = 50;

const clone = (value) => JSON.parse(JSON.stringify(value));

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeCinemaPlaylist(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.videos)
    || input.videos.length > CINEMA_PLAYLIST_LIMIT) return null;
  const videos = [];
  const seen = new Set();
  for (const item of input.videos) {
    const source = typeof item === 'string' ? item : item?.videoId || item?.url;
    const videoId = youtubeVideoId(source);
    if (!videoId) return null;
    if (seen.has(videoId)) continue;
    const title = typeof item?.title === 'string' ? item.title.replace(/\s+/g, ' ').trim() : '';
    if (title.length > 200) return null;
    seen.add(videoId);
    videos.push({ videoId, ...(title ? { title } : {}) });
  }
  return { videos };
}

export function createMemoryCinemaPlaylistStore(initial = { videos: [] }) {
  let value = normalizeCinemaPlaylist(initial) || { videos: [] };
  return {
    get: () => clone(value),
    update(input) {
      const next = normalizeCinemaPlaylist(input);
      if (!next) return null;
      value = next;
      return clone(value);
    },
    reset() {
      value = { videos: [] };
      return clone(value);
    },
  };
}

export function openCinemaPlaylistStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'cinema-playlist.json');
  let initial = { videos: [] };
  try {
    initial = normalizeCinemaPlaylist(JSON.parse(readFileSync(file, 'utf8'))) || initial;
  } catch {}
  const memory = createMemoryCinemaPlaylistStore(initial);

  function persist(value) {
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, file);
    return value;
  }

  return {
    get: memory.get,
    update(input) {
      const value = memory.update(input);
      return value && persist(value);
    },
    reset: () => persist(memory.reset()),
  };
}

function store(options) {
  return options.cinemaPlaylistStore || (options.cinemaPlaylistStore = createMemoryCinemaPlaylistStore());
}

export async function handleCinemaPlaylistRequest(req, res, pathname, options) {
  if (req.method === 'GET' && pathname === '/internal/cinema/playlist') {
    if (!safeEqual(req.headers?.['x-internal-key'], internalKey(options.secret || DEFAULT_LOCAL_SECRET))) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    json(req, res, 200, store(options).get());
    return true;
  }

  if (!pathname.startsWith('/api/v1/admin/cinema/playlist')) return false;
  if (!safeEqual(req.headers?.['x-admin-key'], options.adminSecret)) {
    json(req, res, 403, { error: 'forbidden' });
    return true;
  }
  if (req.method === 'GET') {
    json(req, res, 200, store(options).get());
    return true;
  }
  if (req.method === 'DELETE') {
    json(req, res, 200, store(options).reset());
    return true;
  }
  if (req.method !== 'PUT') {
    json(req, res, 405, { error: 'method_not_allowed' });
    return true;
  }
  let input;
  try {
    input = await readJson(req);
  } catch {
    json(req, res, 400, { error: 'invalid_json' });
    return true;
  }
  const saved = store(options).update(input);
  json(req, res, saved ? 200 : 400, saved || { error: 'invalid_cinema_playlist' });
  return true;
}
