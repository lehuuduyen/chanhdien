// API Vườn Công Đức. Xem vườn: mọi người (kể cả khách). Mua hạt, gieo, tưới, hái, bán, dâng quả, nhận xu nhiệm vụ: phải đăng nhập,
// cùng origin, kèm header Idempotency-Key. Server quyết định số dư, kho, chủ luống và mốc tưới 8 giờ,
// không tin số liệu client gửi lên. Luống thay đổi thì báo realtime để phát `garden.plot` cho các phòng chánh điện.
//
// Bot làm vườn (chỉ máy realtime, khóa x-internal-key):
//   POST /internal/garden/bot { op: 'task', name }                              → { ok, task: { action, plotId, plantType? } | null }
//   POST /internal/garden/bot { op: 'act', name, action, plotId, plantType? }   → { ok, code?, plots }
import { timingSafeEqual } from 'node:crypto';
import { DEFAULT_LOCAL_SECRET, internalKey } from '@chanh-dien/session-token';
import { postToRealtime } from './realtime-broadcast.mjs';
import { createGardenStore } from '@chanh-dien/garden';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';

const ACTIONS = new Set(['buy', 'plant', 'water', 'harvest', 'sell', 'offer', 'claim']);
const ACTION_LIMIT = [30, 60_000];
const STATUS = {
  INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, IDEMPOTENCY_KEY_REUSED: 409, NOT_SIGNED_IN: 401,
  PLOT_TAKEN: 409, NO_SEED: 409, NOT_GROWING: 409, ALREADY_WATERED: 409, WATER_TOO_SOON: 409, NOT_FRUITING: 409, NO_FRUIT_LEFT: 409,
  HARVEST_LIMIT: 409, INSUFFICIENT_COINS: 409, INSUFFICIENT_FRUIT: 409, QUEST_CLAIMED: 409, QUEST_NOT_DONE: 409,
};

export function openGardenStore(accounts, timeZone = process.env.GARDEN_TIMEZONE || 'America/Los_Angeles') {
  return accounts ? createGardenStore({ db: accounts.database, timeZone }) : null;
}

// Mốc thứ tự cho mỗi lần đọc / đổi vườn (ms, tăng dần trong máy API). Nhiều người thao tác cùng lúc thì tin báo
// realtime có thể tới trình duyệt lệch thứ tự, và lần tải lại định kỳ có thể trả về trạng thái cũ hơn tin vừa nhận:
// client giữ mốc mới nhất của từng luống và bỏ qua dữ liệu có mốc cũ hơn.
let lastStamp = 0;
export const gardenStamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

// Báo mọi máy realtime để phát cho mọi phòng chánh điện. Lỗi mạng không làm hỏng thao tác (client tự tải lại định kỳ).
export function notifyGarden(options, event) {
  if (!event.plots?.length) return Promise.resolve();
  return postToRealtime(options, '/internal/garden', { ...event, at: event.at ?? gardenStamp() }, 'vườn');
}

export async function handleGardenRequest(req, res, pathname, options) {
  if (!pathname.startsWith('/api/v1/garden')) return false;
  const garden = options.garden;
  if (!garden) {
    json(req, res, 503, { error: 'garden_disabled' });
    return true;
  }
  if (req.method === 'GET' && pathname === '/api/v1/garden') {
    const snapshot = garden.snapshot();
    const at = gardenStamp();
    if (snapshot.expired.length) notifyGarden(options, { plots: snapshot.expired.map((id) => garden.plot(id)), at });
    json(req, res, 200, { day: snapshot.day, timeZone: snapshot.timeZone, plots: snapshot.plots, plants: garden.plants, at });
    return true;
  }
  const account = currentAccount(req, options);
  if (req.method === 'GET' && pathname === '/api/v1/garden/me') {
    if (!account) {
      json(req, res, 401, { error: 'not_signed_in' });
      return true;
    }
    json(req, res, 200, { me: garden.me(account.id), history: garden.history(account.id) });
    return true;
  }
  const match = req.method === 'POST' && pathname.match(/^\/api\/v1\/garden\/([a-z]+)$/);
  if (!match || !ACTIONS.has(match[1])) {
    json(req, res, 404, { error: 'not_found' });
    return true;
  }
  if (!sameOrigin(req)) {
    json(req, res, 403, { error: 'forbidden_origin' });
    return true;
  }
  if (!account) {
    json(req, res, 401, { ok: false, code: 'NOT_SIGNED_IN' });
    return true;
  }
  if (!allow(options, `garden:${account.id}`, ACTION_LIMIT)) {
    json(req, res, 429, { ok: false, code: 'RATE_LIMITED' });
    return true;
  }
  const input = await body(req, res);
  if (!input) return true;
  // Chỉ nhận đúng các trường cần, đúng kiểu (không ép kiểu).
  const clean = {};
  for (const key of ['plotId', 'quantity']) if (input[key] !== undefined) clean[key] = input[key];
  if (input.plantType !== undefined) clean.plantType = input.plantType;
  if (input.quest !== undefined) clean.quest = input.quest;
  const action = match[1];
  const result = garden.perform(account.id, action, clean, req.headers?.['idempotency-key']);
  // Lần gửi lại (replayed) trả kết quả cũ: không kèm mốc để client không đè trạng thái mới hơn bằng nó.
  const at = result.replayed ? undefined : gardenStamp();
  if (result.ok && !result.replayed) {
    notifyGarden(options, { plots: result.plots, at, effect: result.plots.length ? { plotId: result.plots.at(-1).id, kind: action, by: account.displayName } : undefined });
  } else if (result.plots?.length && !result.replayed) notifyGarden(options, { plots: result.plots, at });
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, at === undefined ? result : { ...result, at });
  return true;
}

function internalAllowed(req, options) {
  const given = Buffer.from(String(req.headers?.['x-internal-key'] || ''));
  const expected = Buffer.from(internalKey(options.secret || DEFAULT_LOCAL_SECRET));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleGardenBotRequest(req, res, pathname, options) {
  if (pathname !== '/internal/garden/bot') return false;
  if (req.method !== 'POST') {
    json(req, res, 404, { error: 'not_found' });
    return true;
  }
  if (!internalAllowed(req, options)) {
    json(req, res, 403, { error: 'forbidden' });
    return true;
  }
  const garden = options.garden;
  if (!garden) {
    json(req, res, 503, { error: 'garden_disabled' });
    return true;
  }
  const input = await body(req, res);
  if (!input) return true;
  const name = typeof input.name === 'string' ? input.name : '';
  if (input.op === 'task') {
    json(req, res, 200, { ok: true, task: garden.botTask(name) });
    return true;
  }
  if (input.op !== 'act') {
    json(req, res, 400, { ok: false, code: 'INVALID' });
    return true;
  }
  const result = garden.botAct(name, { action: input.action, plotId: input.plotId, plantType: input.plantType });
  if (result.plots?.length) {
    notifyGarden(options, {
      plots: result.plots,
      ...(result.ok ? { effect: { plotId: input.plotId, kind: input.action, by: name } } : {}),
    });
  }
  json(req, res, result.ok ? 200 : result.code === 'INVALID' ? 400 : 409, result);
  return true;
}
