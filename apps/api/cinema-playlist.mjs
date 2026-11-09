import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { cinemaRoomId, parseCinemaRoomId } from '@chanh-dien/room-rules';
import { json, readJson } from './http.mjs';
import { youtubeVideoId } from './thien-event.mjs';

export const CINEMA_PLAYLIST_LIMIT = 50;
export const DEFAULT_CINEMA_ROOM_ID = 'cinema-vn';

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

function canonicalCinemaRoomId(value) {
  const info = parseCinemaRoomId(value);
  return info ? cinemaRoomId(info.state) : null;
}

function normalizeCinemaPlaylists(initial) {
  const values = {};
  if (initial?.rooms && typeof initial.rooms === 'object' && !Array.isArray(initial.rooms)) {
    for (const [roomId, input] of Object.entries(initial.rooms)) {
      const id = canonicalCinemaRoomId(roomId);
      const playlist = normalizeCinemaPlaylist(input);
      if (id && playlist) values[id] = playlist;
    }
    return values;
  }
  const legacy = normalizeCinemaPlaylist(initial);
  if (legacy) values[DEFAULT_CINEMA_ROOM_ID] = legacy;
  return values;
}

export function createMemoryCinemaPlaylistStore(initial = { videos: [] }) {
  const values = normalizeCinemaPlaylists(initial);
  return {
    get: (roomId = DEFAULT_CINEMA_ROOM_ID) => clone(values[canonicalCinemaRoomId(roomId)] || { videos: [] }),
    all: () => clone(values),
    update(roomId, input) {
      if (input === undefined) {
        input = roomId;
        roomId = DEFAULT_CINEMA_ROOM_ID;
      }
      const id = canonicalCinemaRoomId(roomId);
      const next = normalizeCinemaPlaylist(input);
      if (!id || !next) return null;
      values[id] = next;
      return clone(next);
    },
    updateMany(roomIds, input) {
      if (!Array.isArray(roomIds) || roomIds.length < 1 || roomIds.length > 52) return null;
      const ids = [...new Set(roomIds.map(canonicalCinemaRoomId))];
      const next = normalizeCinemaPlaylist(input);
      if (!next || ids.length < 1 || ids.some((id) => !id)) return null;
      for (const id of ids) values[id] = clone(next);
      return { roomIds: ids, ...clone(next) };
    },
    reset(roomId = DEFAULT_CINEMA_ROOM_ID) {
      const id = canonicalCinemaRoomId(roomId);
      if (!id) return null;
      values[id] = { videos: [] };
      return clone(values[id]);
    },
  };
}

export function openCinemaPlaylistStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'cinema-playlist.json');
  let initial = { videos: [] };
  try {
    initial = JSON.parse(readFileSync(file, 'utf8'));
  } catch {}
  const memory = createMemoryCinemaPlaylistStore(initial);

  function persist(value) {
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 2, rooms: value }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, file);
  }

  return {
    get: memory.get,
    all: memory.all,
    update(roomId, input) {
      if (input === undefined) {
        input = roomId;
        roomId = DEFAULT_CINEMA_ROOM_ID;
      }
      const value = memory.update(roomId, input);
      if (value) persist(memory.all());
      return value;
    },
    updateMany(roomIds, input) {
      const value = memory.updateMany(roomIds, input);
      if (value) persist(memory.all());
      return value;
    },
    reset(roomId = DEFAULT_CINEMA_ROOM_ID) {
      const value = memory.reset(roomId);
      if (value) persist(memory.all());
      return value;
    },
  };
}

function store(options) {
  return options.cinemaPlaylistStore || (options.cinemaPlaylistStore = createMemoryCinemaPlaylistStore());
}

export async function handleCinemaPlaylistRequest(req, res, pathname, options) {
  const roomId = new URL(req.url, 'http://local').searchParams.get('roomId') || DEFAULT_CINEMA_ROOM_ID;
  if (req.method === 'GET' && pathname === '/internal/cinema/playlist') {
    if (!safeEqual(req.headers?.['x-internal-key'], internalKey(options.secret || DEFAULT_LOCAL_SECRET))) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    if (!canonicalCinemaRoomId(roomId)) {
      json(req, res, 400, { error: 'invalid_cinema_room' });
      return true;
    }
    json(req, res, 200, store(options).get(roomId));
    return true;
  }

  if (!pathname.startsWith('/api/v1/admin/cinema/playlist')) return false;
  if (!safeEqual(req.headers?.['x-admin-key'], options.adminSecret)) {
    json(req, res, 403, { error: 'forbidden' });
    return true;
  }
  if (!canonicalCinemaRoomId(roomId)) {
    json(req, res, 400, { error: 'invalid_cinema_room' });
    return true;
  }
  if (req.method === 'GET') {
    json(req, res, 200, store(options).get(roomId));
    return true;
  }
  if (req.method === 'DELETE') {
    json(req, res, 200, store(options).reset(roomId));
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
  const saved = Array.isArray(input?.roomIds)
    ? store(options).updateMany(input.roomIds, { videos: input.videos })
    : store(options).update(roomId, input);
  json(req, res, saved ? 200 : 400, saved || { error: 'invalid_cinema_playlist' });
  return true;
}
