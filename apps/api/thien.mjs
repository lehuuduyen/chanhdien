import { createRoomInvite, DEFAULT_LOCAL_SECRET, internalKey, verifyRoomInvite } from '@chanh-dien/session-token';
import {
  parseThienRoomId,
  THIEN_LANGS,
  THIEN_MAX_SHARDS,
  THIEN_RULES,
  thienRoomId,
  thienRoomName,
  US_STATES,
} from '@chanh-dien/room-rules';
import { json, readJson } from './http.mjs';
import { allow, clientIp, currentAccount, sameOrigin } from './auth.mjs';
import { createMemoryThienEventStore } from './thien-event.mjs';
import { createMemoryPrayerSlipStore } from './prayer-slips.mjs';
import { timingSafeEqual } from 'node:crypto';

// Người vừa được xếp vào phòng nhưng máy realtime chưa kịp báo số mới: giữ chỗ 15 giây để nhiều người bấm
// cùng lúc không dồn hết vào một phòng.
const HOLD_MS = 15_000;
// Khớp giới hạn thông báo sớ ở realtime; API cũng tự chặn để không thể bỏ qua bằng cách POST trực tiếp.
const PRAYER_SUBMIT_LIMIT = [3, 10 * 60_000];

// Số người thật đang kết nối theo phòng: từ danh bạ Redis (nhiều máy) hoặc hỏi thẳng máy realtime (một máy).
export async function liveRoomCounts(options, roomCounts) {
  if (options.directory) return roomCounts(options.directory);
  if (!options.realtimeInternalUrl) return {};
  try {
    const response = await fetch(new URL('/internal/rooms', options.realtimeInternalUrl), {
      headers: { 'x-internal-key': internalKey(options.secret || DEFAULT_LOCAL_SECRET) },
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok ? (await response.json()).counts || {} : {};
  } catch {
    return {};
  }
}

function held(options, roomId, liveCount) {
  const holds = options.thienHolds || (options.thienHolds = new Map());
  const now = Date.now();
  const state = holds.get(roomId) || { count: liveCount, reservations: [] };
  state.reservations = state.reservations.filter((at) => now - at < HOLD_MS);
  // Khi realtime đã báo thêm người, bỏ đúng số giữ chỗ tương ứng để không đếm một người hai lần.
  const arrived = Math.max(0, liveCount - state.count);
  if (arrived) state.reservations.splice(0, arrived);
  state.count = liveCount;
  holds.set(roomId, state);
  return state.reservations;
}

// Phòng đầu tiên của (tiểu bang, ngôn ngữ) còn chỗ (sức chứa phòng); đầy thì mở phòng số kế tiếp.
export function assignThienRoom(state, lang, counts, options = {}) {
  const capacity = THIEN_RULES.maxParticipants;
  for (let shard = 1; shard <= THIEN_MAX_SHARDS; shard += 1) {
    const roomId = thienRoomId(state, lang, shard);
    const liveCount = counts[roomId] || 0;
    const recent = held(options, roomId, liveCount);
    if (liveCount + recent.length < capacity) {
      recent.push(Date.now());
      return { roomId, shard, name: thienRoomName(roomId) };
    }
  }
  return null;
}

// Các phòng đang có người của một (tiểu bang, ngôn ngữ), để cổng vào hiện "PV1 · 12/20".
function activeRooms(state, lang, counts) {
  return Object.entries(counts)
    .map(([roomId, count]) => ({ info: parseThienRoomId(roomId), roomId, count }))
    .filter(({ info, count }) => info && info.state === state && info.lang === lang && count > 0)
    .sort((a, b) => a.info.shard - b.info.shard)
    .map(({ roomId, count, info }) => ({ roomId, shard: info.shard, name: thienRoomName(roomId), count, capacity: THIEN_RULES.maxParticipants }));
}

const validState = (value) => typeof value === 'string' && US_STATES.some((state) => state.code === value);
const validLang = (value) => typeof value === 'string' && Object.hasOwn(THIEN_LANGS, value);

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || right.length < 16) return false;
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function eventStore(options) {
  return options.thienEventStore || (options.thienEventStore = createMemoryThienEventStore());
}

function prayerStore(options) {
  return options.prayerSlipStore || (options.prayerSlipStore = createMemoryPrayerSlipStore());
}

export async function handleThienRequest(req, res, pathname, options, roomCounts) {
  if (req.method === 'GET' && pathname === '/api/v1/thien/event-config') {
    json(req, res, 200, eventStore(options).get());
    return true;
  }
  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname === '/api/v1/admin/thien/event-config') {
    if (!safeEqual(req.headers?.['x-admin-key'], options.adminSecret)) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    if (req.method === 'DELETE') {
      json(req, res, 200, eventStore(options).reset());
      return true;
    }
    let input;
    try {
      input = await readJson(req);
    } catch {
      json(req, res, 400, { error: 'invalid_json' });
      return true;
    }
    const saved = eventStore(options).update(input);
    json(req, res, saved ? 200 : 400, saved || { error: 'invalid_event_config' });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/v1/thien/prayer-slips') {
    if (!sameOrigin(req)) {
      json(req, res, 403, { error: 'forbidden_origin' });
      return true;
    }
    const account = currentAccount(req, options);
    if (!allow(options, `prayer-slip:${account?.id || clientIp(req)}`, PRAYER_SUBMIT_LIMIT)) {
      json(req, res, 429, { error: 'rate_limited' });
      return true;
    }
    let input;
    try { input = await readJson(req); } catch {
      json(req, res, 400, { error: 'invalid_json' });
      return true;
    }
    const saved = prayerStore(options).create(input);
    json(req, res, saved ? 201 : 400, saved ? { id: saved.id, status: saved.status, submittedAt: saved.submittedAt } : { error: 'invalid_prayer_slip' });
    return true;
  }
  if (req.method === 'GET' && pathname === '/api/v1/admin/thien/prayer-slips') {
    if (!safeEqual(req.headers?.['x-admin-key'], options.adminSecret)) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    const limit = Number(new URL(req.url, 'http://local').searchParams.get('limit')) || 100;
    json(req, res, 200, { prayerSlips: prayerStore(options).list(limit) });
    return true;
  }
  const prayerStatus = req.method === 'PATCH' && pathname.match(/^\/api\/v1\/admin\/thien\/prayer-slips\/(so-[a-zA-Z0-9-]{1,80})$/);
  if (prayerStatus) {
    if (!safeEqual(req.headers?.['x-admin-key'], options.adminSecret)) {
      json(req, res, 403, { error: 'forbidden' });
      return true;
    }
    let input;
    try { input = await readJson(req); } catch {
      json(req, res, 400, { error: 'invalid_json' });
      return true;
    }
    const saved = prayerStore(options).setStatus(prayerStatus[1], input?.status);
    json(req, res, saved ? 200 : 400, saved || { error: 'invalid_prayer_status' });
    return true;
  }
  const inviteMatch = req.method === 'GET' && pathname.match(/^\/api\/v1\/thien\/invite\/([A-Za-z0-9_-]{40,512})$/);
  if (inviteMatch) {
    const checked = verifyRoomInvite(inviteMatch[1], options.secret || DEFAULT_LOCAL_SECRET);
    const info = checked.ok && parseThienRoomId(checked.value.roomId);
    if (!info) json(req, res, 404, { error: 'invalid_invite' });
    else json(req, res, 200, {
      inviteCode: inviteMatch[1],
      roomId: checked.value.roomId,
      name: thienRoomName(checked.value.roomId),
      ...info,
    });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/v1/thien/assign') {
    let input;
    try {
      input = await readJson(req);
    } catch {
      json(req, res, 400, { error: 'invalid_json' });
      return true;
    }
    if (!validState(input?.state) || !validLang(input?.lang)) {
      json(req, res, 400, { error: 'invalid_state_or_lang' });
      return true;
    }
    const assigned = assignThienRoom(input.state, input.lang, await liveRoomCounts(options, roomCounts), options);
    if (!assigned) json(req, res, 503, { error: 'no_room' });
    else json(req, res, 200, {
      ...assigned,
      inviteCode: createRoomInvite(assigned.roomId, options.secret || DEFAULT_LOCAL_SECRET),
    });
    return true;
  }
  if (req.method === 'GET' && pathname === '/api/v1/thien/rooms') {
    const params = new URL(req.url, 'http://local').searchParams;
    const state = params.get('state');
    const lang = params.get('lang');
    if (!validState(state) || !validLang(lang)) {
      json(req, res, 400, { error: 'invalid_state_or_lang' });
      return true;
    }
    json(req, res, 200, { rooms: activeRooms(state, lang, await liveRoomCounts(options, roomCounts)) });
    return true;
  }
  return false;
}
