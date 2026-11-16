import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { FARM_CROPS, STARTING_COINS } from '@chanh-dien/garden';
import { ROOM_TYPES } from '@chanh-dien/room-rules';
import { handleApiRequest } from '../server.mjs';
import { openGardenStore } from '../garden.mjs';
import { openFriendLinks } from '../friend-links.mjs';
import { openBotChatStore } from '../bot-chat.mjs';

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

function setup() {
  const accounts = createAccountStore();
  return { secret: SECRET, accounts, garden: openGardenStore(accounts, 'America/Los_Angeles') };
}

async function signUp(options, username) {
  const response = await request(options, 'POST', '/api/v1/auth/register', { body: { username, password: 'matkhau123', displayName: username } });
  return response.headers['set-cookie'].split(';')[0];
}

let serial = 0;
const key = () => `farm-key-${(serial += 1).toString().padStart(6, '0')}`;

test('Phước Điền qua API: khách bị từ chối; thành viên gieo được, cần khóa idempotency và cùng origin', async () => {
  const options = setup();
  assert.equal((await request(options, 'GET', '/api/v1/farm')).status, 401);
  const cookie = await signUp(options, 'nong_dan');
  const headers = (extra = {}) => ({ cookie, origin: 'http://chanh-dien.test', 'content-type': 'application/json', ...extra });
  const view = await request(options, 'GET', '/api/v1/farm', { headers: headers() });
  assert.equal(view.status, 200);
  assert.equal(view.json.farm.level, 1);
  assert.equal(view.json.farm.coins, STARTING_COINS);
  assert.ok(view.json.farm.catalog.crops.some((crop) => crop.id === 'tomato' && crop.unlocked));
  assert.equal((await request(options, 'POST', '/api/v1/farm/plant', { headers: headers(), body: { slot: 1, crop: 'tomato' } })).json.code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal((await request(options, 'POST', '/api/v1/farm/plant', { headers: headers({ origin: 'https://evil.example', 'idempotency-key': key() }), body: { slot: 1, crop: 'tomato' } })).status, 403);
  assert.equal((await request(options, 'POST', '/api/v1/farm/steal', { headers: headers({ 'idempotency-key': key() }), body: {} })).status, 404);
  // Trường lạ / sai kiểu bị bỏ: crop có chữ hoa hay ký tự lạ thì không nhận.
  assert.equal((await request(options, 'POST', '/api/v1/farm/plant', { headers: headers({ 'idempotency-key': key() }), body: { slot: '1', crop: 'tomato' } })).json.code, 'INVALID');
  assert.equal((await request(options, 'POST', '/api/v1/farm/plant', { headers: headers({ 'idempotency-key': key() }), body: { slot: 1, crop: 'Tomato<script>' } })).json.code, 'INVALID');
  const planted = await request(options, 'POST', '/api/v1/farm/plant', { headers: headers({ 'idempotency-key': key() }), body: { slots: [1, 2], crop: 'tomato' } });
  assert.equal(planted.status, 200);
  assert.equal(planted.json.farm.plots.length, 2);
  assert.equal(planted.json.farm.coins, STARTING_COINS - 2 * FARM_CROPS.tomato.seed);
  const locked = await request(options, 'POST', '/api/v1/farm/buyAnimal', { headers: headers({ 'idempotency-key': key() }), body: { kind: 'cow' } });
  assert.equal(locked.status, 409);
  assert.equal(locked.json.code, 'LOCKED');
});

test('Phước Điền hàng xóm qua API: chỉ bạn mới thăm / giúp / lấy / tặng được; danh sách không lộ phòng hay online; quà vào hộp thư', async () => {
  const options = setup();
  options.friendLinks = openFriendLinks(options.accounts, { secret: SECRET });
  const telegram = [];
  options.botChats = openBotChatStore(options.accounts, (text) => telegram.push(text));
  const anCookie = await signUp(options, 'an_lac');
  const binhCookie = await signUp(options, 'binh_an');
  const an = options.accounts.findByUsername('an_lac').id;
  const binh = options.accounts.findByUsername('binh_an').id;
  const headers = (cookie, extra = {}) => ({ cookie, origin: 'http://chanh-dien.test', 'content-type': 'application/json', ...extra });
  // Bình mở nông trại và để 5 quả cà chua vào rổ.
  await request(options, 'GET', '/api/v1/farm', { headers: headers(binhCookie) });
  options.accounts.database.prepare("INSERT INTO farm_items (account_id, item, quantity) VALUES (?, 'tomato', 8)").run(binh);
  const shared = await request(options, 'POST', '/api/v1/farm/share', { headers: headers(binhCookie, { 'idempotency-key': key() }), body: { item: 'tomato', quantity: 5 } });
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.json.farm.basket.items, { tomato: 5 });

  // Chưa là bạn: không thăm, không lấy được.
  assert.equal((await request(options, 'GET', `/api/v1/farm/visit?friend=${binh}`, { headers: headers(anCookie) })).status, 403);
  const stranger = await request(options, 'POST', '/api/v1/farm/take', { headers: headers(anCookie, { 'idempotency-key': key() }), body: { friend: binh, item: 'tomato' } });
  assert.equal(stranger.json.code, 'NOT_NEIGHBOR');
  assert.equal((await request(options, 'GET', '/api/v1/farm/neighbors')).status, 401);

  options.accounts.addFriend(an, binh);
  const list = await request(options, 'GET', '/api/v1/farm/neighbors', { headers: headers(anCookie) });
  assert.equal(list.status, 200);
  assert.equal(list.json.neighbors.length, 1);
  const [row] = list.json.neighbors;
  assert.equal(row.accountId, binh);
  assert.equal(row.basket, 2, 'rổ có 5 nhưng mỗi ngày lấy được 2');
  for (const hidden of ['roomId', 'online', 'participantId', 'inviteCode', 'coins', 'items']) assert.equal(row[hidden], undefined, hidden);
  const visit = await request(options, 'GET', `/api/v1/farm/visit?friend=${binh}`, { headers: headers(anCookie) });
  assert.equal(visit.status, 200);
  assert.equal(visit.json.owner.name, 'binh_an');
  assert.deepEqual(visit.json.visit.farm.basket, { tomato: 5 });
  assert.equal(visit.json.visit.farm.coins, undefined);
  const took = await request(options, 'POST', '/api/v1/farm/take', { headers: headers(anCookie, { 'idempotency-key': key() }), body: { friend: binh, item: 'tomato', quantity: 2 } });
  assert.equal(took.status, 200);
  assert.equal(took.json.farm.items.tomato, 2);
  assert.equal((await request(options, 'POST', '/api/v1/farm/take', { headers: headers(anCookie, { 'idempotency-key': key() }), body: { friend: binh, item: 'tomato' } })).status, 429);

  // Tặng: vào kho bạn + một tin trong hộp thư của bạn.
  const gift = await request(options, 'POST', '/api/v1/farm/gift', { headers: headers(anCookie, { 'idempotency-key': key() }), body: { friend: binh, item: 'tomato', quantity: 1 } });
  assert.equal(gift.status, 200);
  const inbox = options.friendLinks.inbox(binh);
  assert.match(inbox.items[0].text, /🎁/);
  assert.equal(inbox.items[0].from.accountId, an);

  // Bạn bot: thăm được sau khi lưu bạn bot, ruộng không mang dấu hiệu bot; tặng như bạn người, lời tặng vào cuộc trò
  // chuyện với bạn ấy + báo Telegram (quản trị cảm ơn thay); tên bot lạ bị từ chối.
  const botName = Object.values(ROOM_TYPES).flatMap((rules) => rules.bots?.names || [])[0];
  assert.equal((await request(options, 'GET', `/api/v1/farm/visit?bot=${encodeURIComponent(botName)}`, { headers: headers(anCookie) })).status, 403);
  assert.equal(options.friendLinks.addBotFriend(an, botName).ok, true);
  const botVisit = await request(options, 'GET', `/api/v1/farm/visit?bot=${encodeURIComponent(botName)}`, { headers: headers(anCookie) });
  assert.equal(botVisit.status, 200);
  assert.equal(botVisit.json.visit.farm.bot, undefined, 'ruộng bạn bot không ghi là bot');
  assert.deepEqual(Object.keys(botVisit.json.visit.farm).sort(), Object.keys(visit.json.visit.farm).sort(), 'cùng dạng với ruộng bạn người');
  const botGift = await request(options, 'POST', '/api/v1/farm/gift', { headers: headers(anCookie, { 'idempotency-key': key() }), body: { bot: botName, item: 'tomato', quantity: 1 } });
  assert.equal(botGift.status, 200);
  assert.equal(botGift.json.farm.items.tomato, undefined, 'quà rời kho người tặng');
  assert.equal(options.friendLinks.inbox(binh).items.length, 1, 'tặng bot không gửi tin cho người khác');
  assert.deepEqual(options.botChats.thread(an, botName).map((item) => [item.mine, item.text]), [[true, '🎁 🌾 🍅 ×1']], 'lời tặng trong cuộc trò chuyện');
  assert.match(telegram.at(-1), /🎁 🌾 🍅 ×1/);
  assert.equal((await request(options, 'GET', '/api/v1/farm/visit?bot=Kh%C3%B4ng%20C%C3%B3', { headers: headers(anCookie) })).status, 403);
  const rows = (await request(options, 'GET', '/api/v1/farm/neighbors', { headers: headers(anCookie) })).json.neighbors;
  assert.deepEqual(rows.map((item) => item.name).sort(), ['binh_an', botName].sort(), 'người và bot chung một danh sách');
  const shape = (item) => Object.keys(item).filter((name) => name !== 'accountId' && name !== 'bot' && name !== 'avatarUrl').sort();
  assert.deepEqual(shape(rows[0]), shape(rows[1]), 'cùng dạng dòng');
});
