import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey, verifyJoinTicket } from '@chanh-dien/session-token';
import { botAllocation, realtimeBotController } from '../donate.mjs';
import { createShopStore } from '../shop.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

const cookieOf = (response) => response.headers['set-cookie'].split(';')[0];
const setup = (extra = {}) => ({ secret: SECRET, accounts: createAccountStore(), ...extra });

test('đăng ký đặt cookie HttpOnly; /me trả hồ sơ và thống kê; đăng xuất xóa cookie', async () => {
  const options = setup();
  const registered = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'tam.an', password: 'matkhau123', displayName: 'Tâm An' } });
  assert.equal(registered.status, 200);
  assert.equal(registered.json.account.displayName, 'Tâm An');
  assert.equal(registered.json.account.sessionVersion, undefined);
  assert.match(registered.headers['set-cookie'], /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(registered.headers['set-cookie'], /Secure/);
  const cookie = cookieOf(registered);

  const me = await request(options, 'GET', '/api/v1/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal(me.json.stats.merit, 0);
  assert.equal(me.json.stats.level.name, 'Sơ tâm');
  assert.equal((await request(options, 'GET', '/api/v1/me')).status, 401);

  const out = await request(options, 'POST', '/api/v1/auth/logout', { body: { everywhere: true }, headers: { cookie } });
  assert.match(out.headers['set-cookie'], /Max-Age=0/);
  assert.equal((await request(options, 'GET', '/api/v1/me', { headers: { cookie } })).status, 401, 'đăng xuất mọi nơi làm cookie cũ hết hiệu lực');
});

test('đăng nhập sai báo lỗi tiếng Việt; thử quá nhiều lần bị chặn; trang lạ không gửi hộ được', async () => {
  const options = setup();
  await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'sai.mat.khau', password: 'matkhau123' } });
  const wrong = await request(options, 'POST', '/api/v1/auth/login', { body: { username: 'sai.mat.khau', password: 'khong-dung' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.message, 'Sai tên đăng nhập hoặc mật khẩu');
  const https = await request(options, 'POST', '/api/v1/auth/login', { body: { username: 'sai.mat.khau', password: 'matkhau123' }, headers: { 'x-forwarded-proto': 'https' } });
  assert.match(https.headers['set-cookie'], /; Secure$/);
  for (let index = 0; index < 8; index += 1) await request(options, 'POST', '/api/v1/auth/login', { body: { username: 'x', password: 'y' } });
  assert.equal((await request(options, 'POST', '/api/v1/auth/login', { body: { username: 'x', password: 'y' } })).status, 429);
  const foreign = await request(setup(), 'POST', '/api/v1/auth/register', { body: { username: 'bi.lua', password: 'matkhau123' }, headers: { origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
});

test('Google: ẩn khi chưa cấu hình; có client ID thì xác minh token rồi tạo tài khoản kèm ảnh', async () => {
  assert.deepEqual((await request(setup(), 'GET', '/api/v1/auth/config')).json, { accounts: true, googleClientId: null });
  assert.equal((await request(setup(), 'POST', '/api/v1/auth/google', { body: { credential: 'x' } })).status, 503);
  const options = setup({
    googleClientId: 'client-1.apps.googleusercontent.com',
    verifyGoogle: async (credential, clientId) => (credential === 'good' && clientId === 'client-1.apps.googleusercontent.com'
      ? { sub: 'g-42', email: 'an@gmail.com', name: 'An', picture: 'https://lh3.googleusercontent.com/x' } : null),
  });
  assert.equal((await request(options, 'POST', '/api/v1/auth/google', { body: { credential: 'bad' } })).status, 401);
  const signed = await request(options, 'POST', '/api/v1/auth/google', { body: { credential: 'good' } });
  assert.equal(signed.status, 200);
  assert.equal(signed.json.account.avatarUrl, 'https://lh3.googleusercontent.com/x');
  assert.equal(signed.json.account.provider, 'google');
  const joined = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'thien-1' }, headers: { cookie: cookieOf(signed) } });
  assert.equal(verifyJoinTicket(joined.json.ticket, SECRET).value.avatarUrl, 'https://lh3.googleusercontent.com/x', 'vé mang ảnh Google để cả phòng thấy');
});

test('sự kiện đăng nhập: ngày 3 tặng Bé Mũ Đỏ, ngày 7 tặng Kiếm Sĩ vĩnh viễn và không cấp trùng', async () => {
  let clock = Date.parse('2026-11-01T03:00:00Z');
  const accounts = createAccountStore({ now: () => clock });
  const shopStore = createShopStore({ db: accounts.database, now: () => clock });
  const options = setup({ accounts, shopStore });
  const registered = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'qua.login', password: 'matkhau123', displayName: 'Nhận Quà' } });
  const cookie = cookieOf(registered);
  assert.deepEqual([registered.json.loginReward.totalDays, registered.json.loginReward.newDay], [1, true]);
  assert.equal((await request(options, 'POST', '/api/v1/shop/skin', { body: { skin: 'swordsman' }, headers: { cookie } })).status, 409, 'chưa đủ ngày không thể tự mở skin');
  assert.equal((await request(options, 'GET', '/api/v1/me', { headers: { cookie } })).json.loginReward.totalDays, 1, 'tải lại không tăng ngày');

  for (let day = 2; day <= 7; day += 1) {
    clock += 86_400_000;
    const me = await request(options, 'GET', '/api/v1/me', { headers: { cookie } });
    assert.equal(me.json.loginReward.totalDays, day);
    if (day === 3) assert.deepEqual(me.json.loginReward.unlocked.map((item) => item.skin), ['chibigirl']);
    if (day === 7) {
      assert.deepEqual(me.json.loginReward.unlocked.map((item) => item.skin), ['swordsman']);
      assert.equal(me.json.loginReward.achievement.newlyUnlocked, true);
      assert.deepEqual([me.json.account.title, me.json.account.frame], ['steadfast-practitioner', 'seven-day-lotus']);
    }
  }
  assert.deepEqual(shopStore.ownedSkins(registered.json.account.id), ['chibigirl', 'swordsman']);
  assert.equal((await request(options, 'GET', '/api/v1/me', { headers: { cookie } })).json.loginReward.unlocked.length, 0, 'không cấp trùng cùng ngày');
  assert.equal((await request(options, 'POST', '/api/v1/shop/skin', { body: { skin: 'swordsman' }, headers: { cookie } })).status, 200);
  const join = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'thien-1' }, headers: { cookie } });
  const ticket = verifyJoinTicket(join.json.ticket, SECRET).value;
  assert.deepEqual([ticket.skin, ticket.skins], ['swordsman', ['chibigirl', 'swordsman']]);
  assert.deepEqual([ticket.title, ticket.frame], ['steadfast-practitioner', 'seven-day-lotus']);
});

test('thành viên vào phòng bằng tên tài khoản; lễ vật nội bộ cần khóa; lịch sử và bảng xếp hạng', async () => {
  const options = setup();
  const registered = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'dieu.thien', password: 'matkhau123', displayName: 'Diệu Thiện' } });
  const cookie = cookieOf(registered);
  const accountId = registered.json.account.id;

  const joined = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'thien-1', displayName: 'Tên khác' }, headers: { cookie } });
  assert.equal(joined.json.displayName, 'Diệu Thiện');
  assert.equal(joined.json.member, true);
  const ticket = verifyJoinTicket(joined.json.ticket, SECRET).value;
  assert.equal(ticket.role, 'member');
  assert.equal(ticket.accountId, accountId);
  const guest = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'thien-1', displayName: 'Khách' } });
  assert.equal(verifyJoinTicket(guest.json.ticket, SECRET).value.role, 'guest');

  const offering = { accountId, kind: 'incense', text: 'Cầu an', roomId: 'thien-1' };
  assert.equal((await request(options, 'POST', '/internal/offerings', { body: offering })).status, 403);
  assert.equal((await request(options, 'POST', '/internal/offerings', { body: offering, headers: { 'x-internal-key': 'sai' } })).status, 403);
  const recorded = await request(options, 'POST', '/internal/offerings', { body: offering, headers: { 'x-internal-key': internalKey(SECRET) } });
  assert.deepEqual(recorded.json, { ok: true, counted: true, merit: 5, level: 1 });
  assert.equal(verifyJoinTicket((await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'thien-1' }, headers: { cookie } })).json.ticket, SECRET).value.level, 1);

  const history = await request(options, 'GET', '/api/v1/me/history', { headers: { cookie } });
  assert.deepEqual(history.json.items.map(({ kind, merit, text }) => ({ kind, merit, text })), [{ kind: 'incense', merit: 5, text: 'Cầu an' }]);
  const board = await request(options, 'GET', '/api/v1/leaderboard?metric=incense&period=week', { headers: { cookie } });
  assert.equal(board.json.me, 1);
  assert.deepEqual(board.json.rows.map((row) => [row.displayName, row.value, row.level]), [['Diệu Thiện', 1, 1]]);
});

test('phòng game: chỉ máy realtime (khóa nội bộ) được đặt cược / chốt ván Bầu Cua; xu của ví đổi đúng', async () => {
  const { createGardenStore } = await import('@chanh-dien/garden');
  const accounts = createAccountStore();
  const garden = createGardenStore({ db: accounts.database });
  const options = setup({ accounts, garden });
  const registered = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'choi_ban_chung', password: 'matkhau123', displayName: 'Bé Na' } });
  const accountId = registered.json.account.id;
  const start = garden.me(accountId).coins;
  const key = { 'x-internal-key': internalKey(SECRET) };
  const bet = { accountId, roundId: 'bc-game-1-1-1-wxyz', animal: 'ca', amount: 5, key: 'stake-key-0001' };
  assert.equal((await request(options, 'POST', '/internal/games/bau-cua/stake', { body: bet })).status, 403, 'không có khóa nội bộ');
  assert.equal((await request(options, 'POST', '/internal/games/bau-cua/stake', { body: bet, headers: { cookie: cookieOf(registered) } })).status, 403, 'cookie người dùng không đủ');
  assert.equal((await request(options, 'POST', '/api/v1/games/bau-cua/roll', { body: { bets: { ca: 5 } }, headers: { cookie: cookieOf(registered) } })).status, 404, 'không còn lắc riêng một mình');
  const staked = await request(options, 'POST', '/internal/games/bau-cua/stake', { body: bet, headers: key });
  assert.equal(staked.status, 200);
  assert.equal(staked.json.coins, start - 5);
  assert.equal((await request(options, 'POST', '/internal/games/bau-cua/stake', { body: { ...bet, amount: '5', key: 'stake-key-0002' }, headers: key })).status, 400, 'không ép kiểu');
  // Hủy rồi đặt lại: hoàn đủ xu.
  const unstaked = await request(options, 'POST', '/internal/games/bau-cua/unstake', { body: { accountId, roundId: bet.roundId, key: 'unstake-key-01' }, headers: key });
  assert.deepEqual([unstaked.status, unstaked.json.refunded, unstaked.json.coins], [200, 5, start]);
  assert.equal((await request(options, 'POST', '/internal/games/bau-cua/unstake', { body: { accountId, roundId: bet.roundId, key: 'unstake-key-02' } })).status, 403);
  await request(options, 'POST', '/internal/games/bau-cua/stake', { body: { ...bet, key: 'stake-key-0004' }, headers: key });
  const settled = await request(options, 'POST', '/internal/games/bau-cua/settle', { body: { roundId: bet.roundId, dice: ['ca', 'ca', 'ca'] }, headers: key });
  assert.equal(settled.status, 200);
  assert.deepEqual(settled.json.results.map((item) => [item.accountId, item.payout, item.coins]), [[accountId, 20, start + 15]]);
  assert.equal((await request(options, 'POST', '/internal/games/bau-cua/stake', { body: { ...bet, key: 'stake-key-0003' }, headers: key })).status, 409, 'ván đã chốt');
});

test('trang Ủng hộ: thông tin Zelle lấy từ biến môi trường, thiếu thì báo chưa có; số tiền chỉ nhận số nguyên', async () => {
  const { donateConfig } = await import('../donate.mjs');
  const empty = await request(setup({ donate: donateConfig({}) }), 'GET', '/api/v1/donate');
  assert.equal(empty.status, 200);
  assert.equal(empty.json.zelle, null);
  assert.equal(empty.json.memo, 'Ung ho Chanh Dien Online');
  const config = donateConfig({ DONATE_ZELLE_NAME: ' Chanh Dien Online ', DONATE_ZELLE_HANDLE: 'ungho@example.com', DONATE_MONTHLY_GOAL: '40', DONATE_MONTH_RAISED: '12.5x' });
  const filled = await request(setup({ donate: config }), 'GET', '/api/v1/donate');
  assert.deepEqual(filled.json.zelle, { name: 'Chanh Dien Online', handle: 'ungho@example.com' });
  assert.equal(filled.json.goal, 40);
  assert.equal(filled.json.raised, null, 'số tiền sai định dạng thì bỏ qua');
  assert.equal((await request(setup({ donate: config }), 'POST', '/api/v1/donate')).status, 405);
});

test('Telegram donate 1: chỉ chat và secret đã cấu hình được cộng USD, update gửi lại không cộng hai lần', async () => {
  const { createDonateStore, donateConfig } = await import('../donate.mjs');
  const accounts = createAccountStore();
  const donate = donateConfig({ DONATE_MONTHLY_GOAL: '40', DONATE_MONTH_RAISED: '12' });
  const options = setup({
    accounts,
    donate,
    donateStore: createDonateStore({ db: accounts.database, config: donate, now: () => Date.parse('2026-11-04T12:00:00Z') }),
    telegramWebhookSecret: 'telegram-secret-123',
    telegramChatId: '-100123',
  });
  const update = { update_id: 9001, message: { chat: { id: -100123 }, text: 'donate 1' } };
  const denied = await request(options, 'POST', '/api/v1/telegram/donate', { body: update, headers: { 'x-telegram-bot-api-secret-token': 'wrong' } });
  assert.equal(denied.status, 403);
  const added = await request(options, 'POST', '/api/v1/telegram/donate', { body: update, headers: { 'x-telegram-bot-api-secret-token': 'telegram-secret-123' } });
  assert.equal(added.status, 200);
  assert.match(added.json.text, /Đã cộng \$1/);
  assert.match(added.json.text, /\$13/);
  const replay = await request(options, 'POST', '/api/v1/telegram/donate', { body: update, headers: { 'x-telegram-bot-api-secret-token': 'telegram-secret-123' } });
  assert.match(replay.json.text, /đã được tính trước đó/i);
  assert.equal((await request(options, 'GET', '/api/v1/donate')).json.raised, 13);
  const otherChat = await request(options, 'POST', '/api/v1/telegram/donate', {
    body: { update_id: 9002, message: { chat: { id: 777 }, text: 'donate 100' } },
    headers: { 'x-telegram-bot-api-secret-token': 'telegram-secret-123' },
  });
  assert.deepEqual(otherChat.json, { ok: true });
  assert.equal((await request(options, 'GET', '/api/v1/donate')).json.raised, 13);
});

test('Telegram addbot đặt tổng bot realtime, báo phân bổ và nhận 0 để tắt', async () => {
  const calls = [];
  const options = setup({
    telegramWebhookSecret: 'telegram-secret-123',
    telegramChatId: '-100123',
    configureBots: async (total, roomId = null) => {
      calls.push([total, roomId]);
      if (roomId) {
        return { requested: total, assigned: total, rooms: [{ roomId, name: 'Phòng riêng', bots: total }] };
      }
      return {
        requested: total,
        assigned: total,
        rooms: total ? [
          { roomId: 'game-1', name: 'Bầu Cua', bots: 34 },
          { roomId: 'taixiu-1', name: 'Tài Xỉu', bots: 33 },
          { roomId: 'loto-1', name: 'Lô Tô', bots: 33 },
        ] : [],
      };
    },
  });
  const headers = { 'x-telegram-bot-api-secret-token': 'telegram-secret-123' };
  const send = (updateId, text) => request(options, 'POST', '/api/v1/telegram', {
    body: { update_id: updateId, message: { chat: { id: -100123 }, text } }, headers,
  });

  const added = await send(9050, '/addbot 100');
  assert.deepEqual(calls, [[100, null]]);
  assert.match(added.json.text, /Đã chia 100 bot/);
  assert.match(added.json.text, /Bầu Cua: 34/);
  assert.match(added.json.text, /Lô Tô: 33/);
  const stopped = await send(9051, 'addbot 0');
  assert.deepEqual(calls, [[100, null], [0, null]]);
  assert.match(stopped.json.text, /Đã tắt toàn bộ bot/);
  const invalid = await send(9052, 'addbot 1001');
  assert.deepEqual(calls, [[100, null], [0, null]]);
  assert.match(invalid.json.text, /0 đến 1000/);
  const oneRoom = await send(9053, 'addbot baucua 12');
  assert.deepEqual(calls.at(-1), [12, 'game-1']);
  assert.match(oneRoom.json.text, /Bầu Cua: 12 bot/);
  assert.match(oneRoom.json.text, /Các phòng khác giữ nguyên/);
  const stopLoto = await send(9054, 'addbot 0 loto');
  assert.deepEqual(calls.at(-1), [0, 'loto-1']);
  assert.match(stopLoto.json.text, /Đã tắt bot riêng phòng Lô Tô/);
  const unknown = await send(9055, 'addbot unknown 5');
  assert.match(unknown.json.text, /Không nhận ra phòng/);
});

test('addbot lập một kế hoạch cho ba game và gửi tới mọi node realtime', async () => {
  let serial = 0;
  const plan = botAllocation(100, () => ((serial += 17) % 101) / 101);
  assert.equal(Object.values(plan.allocations).reduce((sum, count) => sum + count, 0), 100);
  for (const roomId of ['game-1', 'taixiu-1', 'loto-1']) assert.ok(plan.allocations[roomId] >= 2);

  const calls = [];
  const controller = realtimeBotController('http://rt1:4001, http://rt2:4002', SECRET, async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), body });
    const targeted = body.replace === false;
    const room = targeted
      ? { roomId: 'taixiu-1', type: 'taixiu', name: 'Tài Xỉu', bots: 6 }
      : String(url).includes('rt1')
        ? { roomId: 'game-1', type: 'game', name: 'Bầu Cua', bots: 12 }
        : { roomId: 'loto-1', type: 'loto', name: 'Lô Tô', bots: 7 };
    return { ok: true, json: async () => ({ rooms: targeted && String(url).includes('rt2') ? [] : [room] }) };
  });
  const result = await controller(20);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, calls[1].body, 'hai node nhận cùng một kế hoạch, không tự chia lệch nhau');
  assert.equal(result.assigned, 19);
  assert.deepEqual(result.rooms.map((room) => room.roomId), ['game-1', 'loto-1']);
  calls.length = 0;
  const targeted = await controller(6, 'taixiu');
  assert.equal(targeted.assigned, 6);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, { allocations: { 'taixiu-1': 6 }, replace: false });
});

test('Telegram quản trị cộng/trừ xu và kim cương theo tên tài khoản, chống xử lý trùng', async () => {
  const [{ createDonateStore, donateConfig }, { openGardenStore }, { openShopStore }] = await Promise.all([
    import('../donate.mjs'), import('../garden.mjs'), import('../shop.mjs'),
  ]);
  const accounts = createAccountStore();
  const account = accounts.register({ username: 'tam.an', password: 'matkhau123', displayName: 'Tâm An' }).account;
  const donate = donateConfig({});
  const options = setup({
    accounts,
    garden: openGardenStore(accounts),
    shopStore: openShopStore(accounts),
    donate,
    donateStore: createDonateStore({ db: accounts.database, config: donate }),
    telegramWebhookSecret: 'telegram-secret-123',
    telegramChatId: '-100123',
  });
  const headers = { 'x-telegram-bot-api-secret-token': 'telegram-secret-123' };
  const send = (updateId, text) => request(options, 'POST', '/api/v1/telegram', {
    body: { update_id: updateId, message: { chat: { id: -100123 }, text } }, headers,
  });

  const coins = await send(9101, 'xu tam.an +100');
  assert.match(coins.json.text, /\+100 xu.*150/);
  const replay = await send(9101, 'xu tam.an +100');
  assert.match(replay.json.text, /đã được xử lý trước đó/i);
  assert.equal(options.garden.me(account.id).coins, 150);
  const removed = await send(9102, 'xu tam.an -20');
  assert.match(removed.json.text, /-20 xu.*130/);

  const diamonds = await send(9103, 'kimcuong tam.an +50');
  assert.match(diamonds.json.text, /\+50 kim cương.*50/);
  assert.equal(options.shopStore.me(account.id).diamonds, 50);
  const insufficient = await send(9104, 'kimcuong tam.an -51');
  assert.match(insufficient.json.text, /Số dư không đủ/);
  assert.equal(options.shopStore.me(account.id).diamonds, 50);

  const unknown = await send(9105, 'xu khong.co +10');
  assert.match(unknown.json.text, /Không tìm thấy tài khoản/);
  const help = await send(9106, 'wallet tam.an 10');
  assert.match(help.json.text, /kimcuong/);
});

test('hỗ trợ: gửi báo lỗi/góp ý (kiểm tra kiểu, cắt độ dài, giới hạn), quản trị xem và đổi trạng thái', async () => {
  const { createMemorySupportStore } = await import('../support.mjs');
  const options = setup({ adminSecret: 'khoa-quan-tri', supportStore: createMemorySupportStore() });
  const sent = await request(options, 'POST', '/api/v1/support', { body: { kind: 'bug', message: 'Rạp phim bị giật khi xoay ngang', contact: 'an@example.com', page: '/room.html' }, headers: { 'user-agent': 'iPhone Safari' } });
  assert.equal(sent.status, 201);
  assert.match(sent.json.id, /^ht-/);
  assert.equal((await request(options, 'POST', '/api/v1/support', { body: { kind: 'hack', message: 'xin chào bạn' } })).status, 400, 'loại lạ');
  assert.equal((await request(options, 'POST', '/api/v1/support', { body: { kind: 'idea', message: 'ngắn' } })).status, 400, 'quá ngắn');
  assert.equal((await request(options, 'POST', '/api/v1/support', { body: { kind: 'idea', message: 12345 } })).status, 400, 'không ép kiểu');
  assert.equal((await request(options, 'POST', '/api/v1/support', { body: { kind: 'idea', message: 'Thêm phòng karaoke' }, headers: { origin: 'https://evil.example' } })).status, 403);
  const long = await request(options, 'POST', '/api/v1/support', { body: { kind: 'idea', message: 'x'.repeat(5_000), page: 'javascript:alert(1)' } });
  assert.equal(long.status, 201);
  // Quá 5 phiếu / 10 phút từ một nơi thì chặn.
  for (let index = 0; index < 4; index += 1) await request(options, 'POST', '/api/v1/support', { body: { kind: 'other', message: `phiếu số ${index}` } });
  assert.equal((await request(options, 'POST', '/api/v1/support', { body: { kind: 'other', message: 'thêm một phiếu' } })).status, 429);
  assert.equal((await request(options, 'GET', '/api/v1/admin/support')).status, 403);
  const listed = await request(options, 'GET', '/api/v1/admin/support', { headers: { 'x-admin-key': 'khoa-quan-tri' } });
  const tickets = listed.json.tickets;
  const bug = tickets.find((item) => item.kind === 'bug');
  assert.equal(bug.message, 'Rạp phim bị giật khi xoay ngang');
  assert.equal(bug.userAgent, 'iPhone Safari');
  assert.equal(bug.status, 'new');
  const cut = tickets.find((item) => item.message.startsWith('xxx'));
  assert.equal(cut.message.length, 1_000);
  assert.equal(cut.page, undefined, 'chỉ nhận đường dẫn trong trang');
  const done = await request(options, 'PATCH', `/api/v1/admin/support/${bug.id}`, { body: { status: 'done' }, headers: { 'x-admin-key': 'khoa-quan-tri' } });
  assert.equal(done.json.status, 'done');
  assert.equal((await request(options, 'PATCH', `/api/v1/admin/support/${bug.id}`, { body: { status: 'xoa' }, headers: { 'x-admin-key': 'khoa-quan-tri' } })).status, 400);
});

test('hỗ trợ: nhận phiếu hỗ trợ xu và hiện đúng loại cho quản trị', async () => {
  const { createMemorySupportStore } = await import('../support.mjs');
  const options = setup({ adminSecret: 'khoa-quan-tri', supportStore: createMemorySupportStore() });
  const registered = await request(options, 'POST', '/api/v1/auth/register', {
    body: { username: 'tho.iu.ca.rot', password: 'matkhau123', displayName: 'Thỏ iu cà rốt' },
  });
  const sent = await request(options, 'POST', '/api/v1/support', {
    body: { kind: 'coins', message: 'Cho tôi 500 xu để chơi', page: '/chanh-dien.html?invite=ma-bi-mat&go=garden' },
    headers: { cookie: cookieOf(registered) },
  });
  assert.equal(sent.status, 201);
  const listed = await request(options, 'GET', '/api/v1/admin/support', { headers: { 'x-admin-key': 'khoa-quan-tri' } });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.tickets[0].kind, 'coins');
  assert.equal(listed.json.tickets[0].message, 'Cho tôi 500 xu để chơi');
  assert.deepEqual(listed.json.tickets[0].account, {
    id: registered.json.account.id, username: 'tho.iu.ca.rot', displayName: 'Thỏ iu cà rốt',
  });
  assert.equal(listed.json.tickets[0].page, '/chanh-dien.html?go=garden', 'không lưu mã mời phòng vào phiếu');
});

test('hỗ trợ: có phiếu mới thì báo Telegram (chữ thường, không parse_mode); thiếu cấu hình thì không báo', async () => {
  const { createTelegramNotifier, supportMessage } = await import('../notify.mjs');
  const { createMemorySupportStore } = await import('../support.mjs');
  assert.equal(createTelegramNotifier({ token: '', chatId: '1' }), null);
  const calls = [];
  const notifySupport = createTelegramNotifier({
    token: '123:ABC', chatId: '987', adminUrl: 'https://vi-du.example/admin-thien.html',
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
  });
  const options = setup({ supportStore: createMemorySupportStore(), notifySupport });
  const sent = await request(options, 'POST', '/api/v1/support', { body: { kind: 'bug', message: 'Không nghe được tiếng chuông <b>to</b>', contact: 'an@example.com', page: '/chanh-dien.html' } });
  assert.equal(sent.status, 201);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  assert.equal(calls[0].body.chat_id, '987');
  assert.equal(calls[0].body.parse_mode, undefined, 'không bật HTML/Markdown');
  assert.match(calls[0].body.text, /🐞 Báo lỗi/);
  assert.match(calls[0].body.text, /Không nghe được tiếng chuông <b>to<\/b>/);
  assert.match(calls[0].body.text, /Liên hệ: an@example\.com/);
  assert.match(calls[0].body.text, /Xem & xử lý: https:\/\/vi-du\.example\/admin-thien\.html/);
  const coinMessage = supportMessage({
    id: 'ht-xu', kind: 'coins', message: 'Cho tôi 500 xu',
    account: { id: 'a-12345678', username: 'tho.iu.ca.rot', displayName: 'Thỏ iu cà rốt' },
  });
  assert.match(coinMessage, /🪙 Hỗ trợ xu/);
  assert.match(coinMessage, /Tên đăng nhập: @tho\.iu\.ca\.rot/);
  assert.match(coinMessage, /xu tho\.iu\.ca\.rot \+500/);
  assert.ok(supportMessage({ id: 'ht-1', kind: 'idea', message: 'x'.repeat(9_000) }).length <= 4_000);
  // Telegram lỗi: phiếu vẫn lưu, API vẫn trả 201.
  const failing = createTelegramNotifier({ token: '1:A', chatId: '2', fetchImpl: async () => { throw new Error('offline'); } });
  const warn = console.warn;
  console.warn = () => {};
  const still = await request(setup({ supportStore: createMemorySupportStore(), notifySupport: failing }), 'POST', '/api/v1/support', { body: { kind: 'idea', message: 'Thêm phòng karaoke' } });
  await new Promise((resolve) => setImmediate(resolve));
  console.warn = warn;
  assert.equal(still.status, 201);
});
