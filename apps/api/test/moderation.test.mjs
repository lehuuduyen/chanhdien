import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey } from '@chanh-dien/session-token';
import { ipHash } from '../../../packages/moderation/src/index.mjs';
import { createModerationStore, moderationTelegramCommand } from '../moderation.mjs';
import { handleApiRequest } from '../server.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const ADMIN = 'admin-secret-for-moderation-tests';
const HOOK = 'telegram-hook-secret';

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

function setup({ now = () => Date.now() } = {}) {
  const accounts = createAccountStore();
  const sent = [];
  const moderation = createModerationStore({ db: accounts.database, accounts, notify: (text) => sent.push(text), now });
  return { sent, options: { secret: SECRET, adminSecret: ADMIN, accounts, moderation, telegramWebhookSecret: HOOK, telegramChatId: '-100' } };
}

const internal = { 'x-internal-key': internalKey(SECRET) };
const telegram = (options, text, updateId = 1) => request(options, 'POST', '/api/v1/telegram', {
  headers: { 'x-telegram-bot-api-secret-token': HOOK },
  body: { update_id: updateId, message: { chat: { id: -100 }, from: { username: 'quantri' }, text } },
});

test('chửi 3 lần trong phòng strict → tắt chat 10 phút, báo Telegram che chữ; tái phạm → khóa nick, không vào được phòng', async () => {
  const { options, sent } = setup();
  const registered = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'chui.the', password: 'matkhau123', displayName: 'Chửi Thề' } });
  const accountId = registered.json.account.id;
  const cookie = registered.headers['set-cookie'].split(';')[0];
  const event = { accountId, name: 'Chửi Thề', roomId: 'thien-us-ca-vi-1', strict: true, evidence: 'đ* m* mày', words: ['dm'] };
  assert.equal((await request(options, 'POST', '/internal/moderation/violation', { body: event })).status, 403, 'thiếu khóa nội bộ');
  assert.equal((await request(options, 'POST', '/internal/moderation/violation', { body: event, headers: internal })).json.action, 'warn');
  assert.equal((await request(options, 'POST', '/internal/moderation/violation', { body: event, headers: internal })).json.action, 'warn');
  const muted = await request(options, 'POST', '/internal/moderation/violation', { body: event, headers: internal });
  assert.equal(muted.json.action, 'mute');
  assert.match(sent.at(-1), /TẮT CHAT 10 PHÚT · thien-us-ca-vi-1/);
  assert.match(sent.at(-1), /Chửi Thề \(@chui\.the\)/);
  assert.match(sent.at(-1), /Tin: "đ\* m\* mày"/);
  assert.match(sent.at(-1), new RegExp(`/unban ${muted.json.ban.id}`));
  // Tắt chat vẫn vào phòng được.
  assert.equal((await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } })).status, 200);

  const state = (await request(options, 'GET', '/internal/moderation/state', { headers: internal })).json;
  assert.deepEqual(state.restrictions.map(({ kind, accountId: id }) => ({ kind, id })), [{ kind: 'mute', id: accountId }]);

  for (let index = 0; index < 2; index += 1) await request(options, 'POST', '/internal/moderation/violation', { body: event, headers: internal });
  const banned = await request(options, 'POST', '/internal/moderation/violation', { body: event, headers: internal });
  assert.equal(banned.json.action, 'ban');
  assert.match(sent.at(-1), /KHÓA NICK 1 NGÀY/);
  const refused = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } });
  assert.equal(refused.status, 403);
  assert.equal(refused.json.error, 'banned');
  assert.match(refused.json.message, /Tài khoản đang bị khóa \(còn (1 ngày|24 giờ)\) vì tái phạm: chửi thề/);

  // Mở khóa qua Telegram theo tên đăng nhập: mở cả lệnh tắt chat lẫn khóa nick, xóa điểm vi phạm.
  const reply = await telegram(options, '/unban chui.the');
  assert.match(reply.json.text, /Đã mở khóa Chửi Thề \(@chui\.the\) \(2 lệnh\) · Telegram @quantri/);
  assert.equal((await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } })).status, 200);
  assert.equal((await request(options, 'POST', '/internal/moderation/violation', { body: event, headers: internal })).json.action, 'warn');
});

test('khách chửi: tính theo IP (băm); phòng thường 4 lần mới tắt chat; IP nội bộ để realtime tự xử', () => {
  const { options } = setup();
  const store = options.moderation;
  const ip = ipHash('8.8.8.8', SECRET);
  for (let index = 0; index < 3; index += 1) assert.equal(store.violation({ ipHash: ip, name: 'Khách', roomId: 'cinema-1' }).action, 'warn');
  const muted = store.violation({ ipHash: ip, name: 'Khách', roomId: 'cinema-1' });
  assert.equal(muted.action, 'mute');
  assert.equal(muted.ban.ipBlocked, true);
  assert.equal(store.restriction({ ipHash: ip }).kind, 'mute');
  assert.equal(store.violation({ name: 'Khách local', roomId: 'cinema-1' }).action, 'local');
});

test('khách bị chặn IP không xin được vé; IP lấy từ X-Real-IP, không tin X-Forwarded-For đầu tiên', async () => {
  const { options } = setup();
  const ip = ipHash('8.8.8.8', SECRET);
  const [ban] = options.moderation.clones({ roomId: 'cinema-1', evidence: 'mua acc re', first: { name: 'Người thật' }, offenders: [{ ipHash: ip, name: 'Clone 1' }] });
  assert.equal(ban.kind, 'ban');
  const join = (headers) => request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1', displayName: 'Khách' }, headers });
  assert.equal((await join({ 'x-real-ip': '8.8.8.8' })).status, 403);
  assert.equal((await join({ 'x-forwarded-for': '1.1.1.1, 8.8.8.8' })).status, 403, 'tự khai IP khác ở đầu chuỗi không lách được');
  assert.equal((await join({ 'x-real-ip': '9.9.9.9' })).status, 200);
});

test('clone: khóa từng nick mới 7 ngày + chặn IP, chừa người nhắn đầu; một tin Telegram có lệnh mở từng nick', async () => {
  const { options, sent } = setup();
  const one = options.accounts.register({ username: 'clone.mot', password: 'matkhau123', displayName: 'Clone Một' }).account;
  const two = options.accounts.register({ username: 'clone.hai', password: 'matkhau123', displayName: 'Clone Hai' }).account;
  const result = await request(options, 'POST', '/internal/moderation/clone', {
    headers: internal,
    body: { roomId: 'cinema-1', evidence: 'vào nhóm kiếm tiền', first: { name: 'vboi07' }, offenders: [
      { accountId: one.id, ipHash: ipHash('8.8.8.8', SECRET), name: 'Clone Một' },
      { accountId: two.id, name: 'Clone Hai' },
    ] },
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.bans.length, 2);
  assert.ok(result.json.bans[0].ipBlocked);
  assert.equal(result.json.bans[1].ipBlocked, false);
  assert.equal(result.json.bans[0].expiresAt - result.json.bans[0].createdAt, 7 * 24 * 60 * 60_000);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /TỰ KHÓA CLONE · cinema-1/);
  assert.match(sent[0], /2 nick mới nhắn trùng: "vào nhóm kiếm tiền"/);
  assert.match(sent[0], /Chừa người nhắn đầu tiên: vboi07/);
  assert.match(sent[0], new RegExp(`/unban ${result.json.bans[0].id} · /unban ${result.json.bans[1].id}`));
});

test('/blockchattu thêm từ (realtime nhận qua state), /boblockchattu bỏ; từ mặc định thì tắt bằng allow', async () => {
  const { options } = setup();
  assert.equal(options.moderation.check('đồ ăn hại').action, 'ok');
  const added = await telegram(options, '/blockchattu ăn hại', 10);
  assert.match(added.json.text, /Đã chặn từ «ăn hại»/);
  assert.equal(options.moderation.check('đồ ăn hại').action, 'block');
  assert.match((await telegram(options, 'blockchattu dm', 11)).json.text, /đã có trong danh sách chặn mặc định/);
  assert.match((await telegram(options, 'blockchattu ngoc', 12)).json.text, /từ không dấu chỉ chặn khi người dùng gõ không dấu/);
  assert.match((await telegram(options, '/boblockchattu vl', 13)).json.text, /Đã bỏ chặn từ «vl»/);
  assert.equal(options.moderation.check('vl').action, 'ok');
  const state = (await request(options, 'GET', '/internal/moderation/state', { headers: internal })).json;
  assert.deepEqual(state.words, { block: ['ngoc', 'ăn hại'], allow: ['vl'] });
  assert.match((await telegram(options, '/dschattu', 14)).json.text, /Chặn thêm \(2\): ngoc, ăn hại/);
  assert.match((await telegram(options, '/blockchattu <script>', 15)).json.text, /Từ không hợp lệ/);
  // Lệnh ví cũ vẫn chạy; tin lạ trả hướng dẫn có cả lệnh kiểm duyệt.
  assert.match((await telegram(options, 'xin chào', 16)).json.text, /\/blockchattu <từ>/);
});

test('/ban, /dsban qua Telegram; mã khóa lạ báo không tìm thấy', () => {
  const { options } = setup();
  options.accounts.register({ username: 'quay.pha', password: 'matkhau123', displayName: 'Quậy Phá' });
  const reply = moderationTelegramCommand('/ban quay.pha 2', options.moderation, 'Telegram @qt');
  assert.match(reply, /Đã khóa Quậy Phá \(@quay\.pha\) 2 giờ\. Mở khóa: \/unban k-[a-z0-9]{8}/);
  assert.match(moderationTelegramCommand('/dsban', options.moderation), /⛔ Quậy Phá · quản trị khóa/);
  assert.match(moderationTelegramCommand('/unban k-zzzzzzzz', options.moderation), /Không tìm thấy/);
  assert.equal(moderationTelegramCommand('donate 5', options.moderation), null);
});

test('từ khả nghi: báo Telegram kèm lệnh gợi ý, cùng từ không báo lại trong 6 giờ', () => {
  let at = 1_000_000;
  const { options, sent } = setup({ now: () => at });
  options.moderation.suspect({ name: 'An', roomId: 'cinema-1', evidence: 'mày n** quá', words: ['ngu'] });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Từ khả nghi · cinema-1\nAn: "mày n\*\* quá"\nChặn từ này: \/blockchattu ngu/);
  at += 60_000;
  options.moderation.suspect({ name: 'Bình', roomId: 'cinema-1', words: ['ngu'] });
  assert.equal(sent.length, 1);
  at += 6 * 60 * 60_000;
  options.moderation.suspect({ name: 'Bình', roomId: 'cinema-1', words: ['ngu'] });
  assert.equal(sent.length, 2);
});

test('tên có từ cấm: không đăng ký, không vào phòng bằng tên khách; sớ có từ cấm bị từ chối', async () => {
  const { options } = setup();
  const register = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'ten.dep', password: 'matkhau123', displayName: 'Thằng Đ.M' } });
  assert.equal(register.status, 400);
  assert.equal(register.json.error, 'display_name_not_allowed');
  const join = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1', displayName: 'vcl 123' } });
  assert.equal(join.status, 400);
  assert.equal(join.json.error, 'display_name_not_allowed');
  const slip = await request(options, 'POST', '/api/v1/thien/prayer-slips', { body: {
    type: 'peace', requesterName: 'An', roomId: 'thien-us-ca-vi-1', state: 'ca', lang: 'vi', note: 'đồ chó',
    people: [{ name: 'Bình', gender: 'male', birthYear: 1990 }],
  } });
  assert.equal(slip.status, 400);
  assert.equal(slip.json.error, 'text_not_allowed');
});

test('trang admin: xem sổ khóa, mở khóa theo mã, thêm/bỏ từ; cần khóa quản trị', async () => {
  const { options } = setup();
  const admin = { 'x-admin-key': ADMIN };
  assert.equal((await request(options, 'GET', '/api/v1/admin/moderation')).status, 403);
  const [ban] = options.moderation.clones({ roomId: 'cinema-1', offenders: [{ ipHash: ipHash('8.8.4.4', SECRET), name: 'Clone' }] });
  const list = await request(options, 'GET', '/api/v1/admin/moderation', { headers: admin });
  assert.equal(list.json.bans[0].id, ban.id);
  assert.equal(list.json.bans[0].active, true);
  assert.ok(list.json.defaults.block.includes('dm'));
  assert.equal((await request(options, 'POST', '/api/v1/admin/moderation/unban', { headers: admin, body: { target: ban.id } })).json.lifted, 1);
  assert.equal((await request(options, 'GET', '/api/v1/admin/moderation', { headers: admin })).json.bans[0].active, false);
  assert.equal((await request(options, 'POST', '/api/v1/admin/moderation/words', { headers: admin, body: { word: 'ăn hại', action: 'block' } })).status, 200);
  assert.equal((await request(options, 'POST', '/api/v1/admin/moderation/words', { headers: admin, body: { word: 'chưa có', action: 'remove' } })).status, 400);
});
