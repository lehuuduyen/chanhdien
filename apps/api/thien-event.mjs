import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { THIEN_EVENT, THIEN_LANGS } from '@chanh-dien/room-rules';

const LANGS = Object.keys(THIEN_LANGS);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const clone = (value) => JSON.parse(JSON.stringify(value));

export function youtubeVideoId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (VIDEO_ID.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, '');
    let candidate = null;
    if (host === 'youtu.be') candidate = url.pathname.split('/').filter(Boolean)[0];
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      candidate = url.searchParams.get('v') || (/^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1]);
    }
    return VIDEO_ID.test(candidate || '') ? candidate : null;
  } catch {
    return null;
  }
}

export function normalizeThienEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) return null;
  if (!Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59) return null;
  if (!input.lectures || typeof input.lectures !== 'object' || Array.isArray(input.lectures)) return null;
  const lectures = {};
  for (const lang of LANGS) {
    const lecture = input.lectures[lang];
    const videoId = youtubeVideoId(lecture?.videoId || lecture?.url);
    const title = typeof lecture?.title === 'string' ? lecture.title.replace(/\s+/g, ' ').trim() : '';
    if (!videoId || !title || title.length > 160) return null;
    lectures[lang] = { videoId, title };
  }
  return { hour: input.hour, minute: input.minute, lectures };
}

export function createMemoryThienEventStore(initial = THIEN_EVENT) {
  let value = normalizeThienEvent(initial) || clone(THIEN_EVENT);
  return {
    get: () => clone(value),
    update(input) {
      const next = normalizeThienEvent(input);
      if (!next) return null;
      value = next;
      return clone(value);
    },
    reset() {
      value = clone(THIEN_EVENT);
      return clone(value);
    },
  };
}

export function openThienEventStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'thien-event.json');
  let initial = THIEN_EVENT;
  try {
    initial = normalizeThienEvent(JSON.parse(readFileSync(file, 'utf8'))) || THIEN_EVENT;
  } catch {}
  const memory = createMemoryThienEventStore(initial);

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
