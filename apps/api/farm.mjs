// API Phước Điền (nông trại riêng của từng tài khoản, KE_HOACH_NONG_TRAI.md). Chỉ thành viên: xem nông trại của mình,
// gieo / tưới / nhổ cỏ / thu / mua con / cho ăn / nhặt trứng, vắt sữa / bán / dâng / mở đất / nâng cấp / bỏ vào, lấy lại
// rổ chia sẻ. Mọi lệnh POST cùng origin, có Idempotency-Key, giới hạn tần suất. Server quyết định giờ chín, số xu, kho;
// không tin số liệu client gửi. Nông trại là của riêng mỗi người nên không phát realtime: câu trả lời mang trạng thái mới
// để trang vẽ lại.
//
// Hàng xóm (giai đoạn 4): thăm nông trại bạn (người: đã kết bạn; bot: đã lưu bạn bot), giúp tưới / nhổ cỏ / cho ăn, lấy ở
// rổ chia sẻ, tặng nông sản. Bạn bot hiện và cư xử như bạn người: chung một danh sách xếp chung, quà tặng ghi vào cuộc
// trò chuyện (quản trị trả lời thay bằng /tl như tin nhắn riêng), bạn bot cũng ghé giúp / lấy rổ / tặng lại. Danh sách
// hàng xóm chỉ có cấp, việc cần giúp, rổ — không có phòng, vị trí hay online.
//
//   GET  /api/v1/farm                         → { farm }
//   POST /api/v1/farm/<thao tác>              → { ok, code?, farm, ...chi tiết }
//   GET  /api/v1/farm/neighbors               → { neighbors: [...], coins: { today, cap } }
//   GET  /api/v1/farm/visit?friend=<mã>|bot=<tên> → { owner, visit }
//   POST /api/v1/farm/<help|take|gift>        { friend | bot, ... } → { ok, code?, farm, visit?, ...chi tiết }
import { FARM_ACTIONS, FARM_FRIEND_MIN_MS, FARM_HELP_COIN_CAP, FARM_SOCIAL_ACTIONS } from '@chanh-dien/garden';
import { allow, body, currentAccount, sameOrigin } from './auth.mjs';
import { json } from './http.mjs';

const ACTION_LIMIT = [60, 60_000];
const STATUS = {
  INVALID: 400, IDEMPOTENCY_KEY_REQUIRED: 400, IDEMPOTENCY_KEY_REUSED: 409, NOT_SIGNED_IN: 401, LOCKED: 409, PLOT_TAKEN: 409,
  NOT_DRY: 409, NOTHING_TO_TEND: 409, NOT_RIPE: 409, STORAGE_FULL: 409, PEN_FULL: 409, NOT_HUNGRY: 409, NO_FOOD: 409,
  NOTHING_TO_COLLECT: 409, NOT_ENOUGH: 409, MAXED: 409, INSUFFICIENT_COINS: 409, BASKET_FULL: 409, HELP_LIMIT: 429,
  TAKE_LIMIT: 429, GIFT_LIMIT: 429, RECEIVER_FULL: 409, NOT_NEIGHBOR: 403,
};
const NAME = /^[a-z]{1,20}$/;
const ACCOUNT_ID = /^a-[a-zA-Z0-9-]{8,64}$/;
const BOT_NAME_MAX = 40;
const NEIGHBOR_MAX = 60;
// Biểu tượng món trong lời tặng gửi vào hộp thư (không phụ thuộc ngôn ngữ người nhận).
const ICONS = { spinach: '🥬', tomato: '🍅', corn: '🌽', rice: '🌾', carrot: '🥕', pumpkin: '🎃', watermelon: '🍉', dragonfruit: '🐉', egg: '🥚', milk: '🥛' };
const giftNote = (gift) => `🎁 🌾 ${ICONS[gift.item] || ''} ×${gift.quantity}`;

// Chỉ nhận đúng các trường cần, đúng kiểu (không ép kiểu); số ô / số lượng do lõi kiểm tra tiếp.
function cleanInput(input) {
  const clean = {};
  if (Number.isSafeInteger(input.slot)) clean.slot = input.slot;
  if (Array.isArray(input.slots) && input.slots.length <= 36 && input.slots.every(Number.isSafeInteger)) clean.slots = input.slots;
  for (const key of ['crop', 'kind', 'item', 'target', 'task']) if (typeof input[key] === 'string' && NAME.test(input[key])) clean[key] = input[key];
  if (Number.isSafeInteger(input.quantity)) clean.quantity = input.quantity;
  return clean;
}

// Hàng xóm của một người: bạn (người) + bạn bot, kèm mốc kết bạn. Chủ nông trại hợp lệ chỉ khi nằm trong danh sách này.
function neighborsOf(account, options) {
  const people = (options.accounts?.friends?.(account.id) || []).map((friend) => ({ accountId: friend.accountId, name: friend.displayName, since: friend.since, ...(friend.avatarUrl ? { avatarUrl: friend.avatarUrl } : {}) }));
  const bots = (options.friendLinks?.botFriends(account.id) || []).map((bot) => ({ bot: bot.name, name: bot.name, since: bot.since }));
  return { people, bots };
}
// Chủ nông trại từ truy vấn / thân lệnh: { friend: mã } hoặc { bot: tên }. Trả { owner, name, since } hoặc null.
function resolveOwner(account, source, options) {
  const { people, bots } = neighborsOf(account, options);
  if (typeof source.friend === 'string' && ACCOUNT_ID.test(source.friend)) {
    const found = people.find((friend) => friend.accountId === source.friend);
    return found ? { owner: { accountId: found.accountId }, name: found.name, since: found.since } : null;
  }
  if (typeof source.bot === 'string' && source.bot.length <= BOT_NAME_MAX) {
    const found = bots.find((bot) => bot.bot === source.bot);
    return found ? { owner: { bot: found.bot }, name: found.name, since: found.since, bot: true } : null;
  }
  return null;
}

async function handleNeighbors(req, res, pathname, options, account) {
  const garden = options.garden;
  if (req.method === 'GET' && pathname === '/api/v1/farm/neighbors') {
    const { people, bots } = neighborsOf(account, options);
    const neighbors = [];
    for (const item of [...people, ...bots]) {
      if (neighbors.length >= NEIGHBOR_MAX) break;
      const summary = garden.farmNeighbor(account.id, item.bot ? { bot: item.bot } : { accountId: item.accountId });
      if (!summary) continue;
      neighbors.push({ ...(item.bot ? { bot: item.bot } : { accountId: item.accountId }), name: item.name, ...(item.avatarUrl ? { avatarUrl: item.avatarUrl } : {}), ...summary });
    }
    // Người và bot xếp chung: ruộng đang cần giúp / rổ còn đồ lên trước, rồi như bảng xếp hạng nhỏ (điểm phước, cấp, tên).
    const busy = (row) => Number((row.needs.water + row.needs.tend + row.needs.feed > 0 && row.helped < row.helpMax) || row.basket > 0);
    neighbors.sort((a, b) => busy(b) - busy(a) || b.blessings - a.blessings || b.level - a.level || a.name.localeCompare(b.name));
    json(req, res, 200, { neighbors, coins: { cap: FARM_HELP_COIN_CAP } });
    return true;
  }
  if (req.method === 'GET' && pathname === '/api/v1/farm/visit') {
    const query = new URL(req.url, 'http://local').searchParams;
    const found = resolveOwner(account, { friend: query.get('friend') || undefined, bot: query.get('bot') || undefined }, options);
    if (!found) json(req, res, 403, { error: 'not_neighbor' });
    else json(req, res, 200, { owner: { name: found.name, ...(found.bot ? { bot: found.owner.bot } : { accountId: found.owner.accountId }) }, visit: garden.farmVisit(account.id, found.owner) });
    return true;
  }
  return false;
}

export async function handleFarmRequest(req, res, pathname, options) {
  if (pathname !== '/api/v1/farm' && !pathname.startsWith('/api/v1/farm/')) return false;
  const garden = options.garden;
  if (!garden) {
    json(req, res, 503, { error: 'farm_disabled' });
    return true;
  }
  const account = currentAccount(req, options);
  if (req.method === 'GET' && pathname === '/api/v1/farm') {
    if (!account) json(req, res, 401, { error: 'not_signed_in' });
    else {
      // Bạn bot ghé giúp như hàng xóm (tối đa 2 lượt / ngày), tính lúc chủ mở nông trại. Bạn bot tặng quà thì lời tặng
      // vào cuộc trò chuyện với bạn ấy như quà của bạn người.
      const botNames = (options.friendLinks?.botFriends(account.id) || []).map((bot) => bot.name);
      const visited = botNames.length ? garden.farmBotVisit(account.id, botNames) : null;
      if (visited?.gift && options.botChats?.talk(account.id, visited.name, true, giftNote(visited.gift))) options.notifyInbox?.(account.id, 'note');
      json(req, res, 200, { farm: garden.farm(account.id) });
    }
    return true;
  }
  if (req.method === 'GET' && (pathname === '/api/v1/farm/neighbors' || pathname === '/api/v1/farm/visit')) {
    if (!account) json(req, res, 401, { error: 'not_signed_in' });
    else await handleNeighbors(req, res, pathname, options, account);
    return true;
  }
  const match = req.method === 'POST' && pathname.match(/^\/api\/v1\/farm\/([A-Za-z]+)$/);
  const social = match && FARM_SOCIAL_ACTIONS.includes(match[1]);
  if (!match || (!FARM_ACTIONS.includes(match[1]) && !social)) {
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
  if (!allow(options, `farm:${account.id}`, ACTION_LIMIT)) {
    json(req, res, 429, { ok: false, code: 'RATE_LIMITED' });
    return true;
  }
  const input = await body(req, res);
  if (!input) return true;
  const key = req.headers?.['idempotency-key'];
  if (!social) {
    const result = garden.farmAction(account.id, match[1], cleanInput(input), key);
    json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
    return true;
  }
  const found = resolveOwner(account, input, options);
  if (!found) {
    json(req, res, 403, { ok: false, code: 'NOT_NEIGHBOR' });
    return true;
  }
  // Xu từ giúp đỡ chỉ khi đã là bạn từ 24 giờ (chống tạo nick phụ để cày xu).
  const paid = Number.isSafeInteger(found.since) && Date.now() - found.since >= FARM_FRIEND_MIN_MS;
  const result = garden.farmSocial({ accountId: account.id, name: account.displayName }, found.owner, match[1], cleanInput(input), key, { paid });
  // Quà tặng hiện trong cuộc trò chuyện hai người (hộp thư, báo inbox.notify), chữ bằng biểu tượng nên ai đọc cũng hiểu.
  // Bạn bot: lời tặng vào cuộc trò chuyện với bạn ấy và báo Telegram như tin nhắn riêng (quản trị cảm ơn thay bằng /tl).
  if (result.ok && match[1] === 'gift' && !result.replayed) {
    if (!found.bot) options.friendLinks?.note(account.id, found.owner.accountId, giftNote(result.gifted));
    else options.botChats?.record({ roomId: 'direct', botId: 'direct', botName: found.owner.bot, fromName: account.displayName, accountId: account.id, text: giftNote(result.gifted) });
  }
  json(req, res, result.ok ? 200 : STATUS[result.code] || 400, result);
  return true;
}
