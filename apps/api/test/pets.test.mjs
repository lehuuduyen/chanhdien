import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createGardenStore, PET_FOOD_PRICE, SPIRIT_PETS } from '@chanh-dien/garden';
import { createSessionToken, verifyJoinTicket } from '@chanh-dien/session-token';
import { handleApiRequest } from '../server.mjs';
import { createShopStore } from '../shop.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const HOUR = 3_600_000;

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

// Đồng hồ giả bắt đầu 9 giờ sáng giờ Los Angeles để "ngày của vườn" đổi đúng lúc tua.
function setup() {
  const clock = { now: Date.UTC(2026, 10, 10, 17, 0) };
  const accounts = createAccountStore();
  const garden = createGardenStore({ db: accounts.database, now: () => clock.now, timeZone: 'America/Los_Angeles' });
  const shopStore = createShopStore({ db: accounts.database, now: () => clock.now });
  const options = { secret: SECRET, accounts, garden, shopStore };
  const account = accounts.register({ username: 'an.nuoi', password: 'matkhau123', displayName: 'An' }).account;
  const cookie = `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}`;
  let serial = 0;
  const call = (action, body, key = `pet-key-${(serial += 1).toString().padStart(4, '0')}`) => request(options, 'POST', `/api/v1/pets/${action}`, { body, headers: { cookie, 'idempotency-key': key } });
  const view = async () => (await request(options, 'GET', '/api/v1/pets', { headers: { cookie } })).json;
  return { clock, options, account, call, view, shopStore, garden };
}

test('linh thú: khách xem danh mục; nhận nuôi phải trả kim cương, mỗi loài một con, thiếu kim cương thì không trừ gì', async () => {
  const { options, account, call, view, shopStore } = setup();
  const guest = (await request(options, 'GET', '/api/v1/pets')).json;
  assert.deepEqual(guest.species.map((item) => item.id), ['carp', 'turtle', 'crane', 'lion']);
  assert.equal(guest.signedIn, false);
  assert.equal((await request(options, 'POST', '/api/v1/pets/adopt', { body: { species: 'carp' }, headers: { 'idempotency-key': 'k-12345678' } })).status, 401);

  const poor = await call('adopt', { species: 'carp' });
  assert.equal(poor.status, 409);
  assert.equal(poor.json.code, 'INSUFFICIENT_DIAMONDS');
  assert.deepEqual((await view()).pets, []);

  shopStore.adjustDiamonds({ accountId: account.id, amount: 500, key: 'admin-grant-0001' });
  const key = 'adopt-carp-0001';
  const adopted = await call('adopt', { species: 'carp', name: 'Kim Long' }, key);
  assert.equal(adopted.status, 200);
  assert.equal(adopted.json.diamonds, 500 - SPIRIT_PETS.carp.price);
  assert.deepEqual([adopted.json.pet.name, adopted.json.pet.level, adopted.json.pet.mood, adopted.json.pet.canFeed], ['Kim Long', 1, 'happy', true]);
  // Gửi lại cùng khóa / nhận lại loài đã có: không trừ thêm.
  assert.equal((await call('adopt', { species: 'carp' }, key)).json.code, 'ALREADY_OWNED');
  assert.equal((await call('adopt', { species: 'carp' })).json.code, 'ALREADY_OWNED');
  assert.equal(shopStore.me(account.id).diamonds, 500 - SPIRIT_PETS.carp.price);
  assert.equal((await call('adopt', { species: 'lion' })).json.code, 'INSUFFICIENT_DIAMONDS', 'còn 300 < 400');
  assert.equal((await call('adopt', { species: 'dragon' })).json.code, 'INVALID');
  assert.equal((await call('adopt', { species: 'turtle', name: 'x'.repeat(21) })).json.code, 'INVALID', 'tên quá 20 ký tự');
  assert.equal(shopStore.me(account.id).diamonds, 500 - SPIRIT_PETS.carp.price, 'tên sai không trừ kim cương');
});

test('linh thú: đào xu vào rương (đầy thì ngừng), cho ăn mỗi ngày một bữa, vắng lâu chỉ ngủ — không mất gì, cho ăn là dậy', async () => {
  const { clock, account, call, view, shopStore } = setup();
  shopStore.adjustDiamonds({ accountId: account.id, amount: 300, key: 'admin-grant-0002' });
  await call('adopt', { species: 'turtle' });

  clock.now += 3 * HOUR;
  let pet = (await view()).pets[0];
  assert.deepEqual([pet.chest, pet.mood, pet.ratePerHour], [2, 'happy', 0.8], 'Rùa cấp 1 đào 0,8 xu/giờ khi no: 2,4 xu');
  const got = await call('collect', { species: 'turtle' });
  assert.deepEqual([got.json.gained, got.json.coins], [2, 50 + 2]);
  assert.equal((await call('collect', { species: 'turtle' })).json.code, 'CHEST_EMPTY');

  const fed = await call('feed', { species: 'turtle' });
  assert.equal(fed.json.coins, 52 - PET_FOOD_PRICE);
  assert.deepEqual([fed.json.pet.level, fed.json.pet.fedDays, fed.json.pet.streak, fed.json.pet.canFeed], [2, 1, 1, false]);
  assert.equal((await call('feed', { species: 'turtle' })).json.code, 'ALREADY_FED', 'mỗi ngày một bữa');

  // Vắng 5 ngày: cấp 2 (0,83 xu/giờ) no 24 giờ + hơi đói 24 giờ (nửa) = 29,9 xu, rương đầy ở 30 giờ đào = 24,9 → 24 xu.
  clock.now += 5 * 24 * HOUR;
  pet = (await view()).pets[0];
  assert.equal(pet.mood, 'sleeping');
  assert.deepEqual([pet.chest, pet.chestMax], [24, 24]);
  const wake = await call('feed', { species: 'turtle' });
  assert.equal(wake.json.woke, true, 'cho ăn bữa thường là dậy, không phí phạt');
  assert.equal(wake.json.coins, 47 - PET_FOOD_PRICE);
  assert.deepEqual([wake.json.pet.mood, wake.json.pet.streak, wake.json.pet.fedDays, wake.json.pet.chest], ['happy', 1, 2, 24], 'rương vẫn còn nguyên');

  // Hơi đói (24–48 giờ sau bữa cuối) đào một nửa.
  await call('collect', { species: 'turtle' });
  clock.now += 24 * HOUR;
  assert.equal((await view()).pets[0].chest, 20, 'no 24 giờ ở cấp 2: 19,9 xu + phần lẻ còn lại; rương 30 giờ chưa đầy');
  await call('collect', { species: 'turtle' });
  const before = (await view()).pets[0].chest;
  clock.now += 10 * HOUR;
  pet = (await view()).pets[0];
  assert.equal(pet.mood, 'hungry');
  assert.equal(pet.chest - before, Math.floor(10 * 0.83 / 2), 'hơi đói: đào một nửa');
});

test('linh thú: cho ăn ngày liền nhau thì lên cấp và chuỗi ngày tăng, cấp cao đào nhanh hơn; đổi tên qua bộ lọc chữ', async () => {
  const { clock, account, call, view, shopStore, options } = setup();
  shopStore.adjustDiamonds({ accountId: account.id, amount: 300, key: 'admin-grant-0003' });
  await call('adopt', { species: 'crane' });
  for (let day = 0; day < 6; day += 1) {
    const fed = await call('feed', { species: 'crane' });
    assert.equal(fed.json.ok, true, `ngày ${day + 1}`);
    clock.now += 24 * HOUR;
    await call('collect', { species: 'crane' });
  }
  const pet = (await view()).pets[0];
  assert.deepEqual([pet.fedDays, pet.streak, pet.level, pet.nextLevelDays, pet.ratePerHour], [6, 6, 4, 10, 1.12], 'Hạc cấp 4: 1 xu/giờ × 1,12');
  options.moderation = { restriction: () => null, check: (text) => ({ action: /bậy/.test(text) ? 'block' : 'allow' }) };
  assert.equal((await call('rename', { species: 'crane', name: 'bậy bạ' })).json.code, 'TEXT_NOT_ALLOWED');
  assert.equal((await call('rename', { species: 'crane', name: '  Bạch   Hạc ' })).json.pet.name, 'Bạch Hạc');
  assert.equal((await call('feed', { species: 'lion' })).json.code, 'NO_PET');
});

test('linh thú: giá kim cương do admin đặt (trang admin), tắt bán thì không nhận nuôi mới; cần khóa quản trị', async () => {
  const { account, call, view, shopStore, options } = setup();
  options.adminSecret = 'khoa-quan-tri-thu-nghiem-0123456789';
  const admin = (method, body) => request(options, method, '/api/v1/admin/shop/pets', { body, headers: { 'x-admin-key': options.adminSecret } });
  assert.equal((await request(options, 'GET', '/api/v1/admin/shop/pets')).status, 403);
  const listed = (await admin('GET')).json.pets;
  assert.deepEqual(listed.map(({ species, price, active }) => [species, price, active]), [['carp', 200, true], ['turtle', 200, true], ['crane', 300, true], ['lion', 400, true]]);
  assert.deepEqual(listed.find((pet) => pet.species === 'lion').rate, [1.2, 1.63], 'admin xem tốc độ đào cấp 1 → 10');
  assert.equal((await admin('PUT', { pets: [{ species: 'carp', price: 0, active: true }] })).status, 400);
  assert.equal((await admin('PUT', { pets: [{ species: 'rong', price: 50, active: true }] })).status, 400);
  const saved = await admin('PUT', { pets: [{ species: 'carp', price: 150, active: true }, { species: 'lion', price: 400, active: false }] });
  assert.equal(saved.status, 200);
  assert.deepEqual((await view()).species.map((item) => [item.id, item.price]), [['carp', 150], ['turtle', 200], ['crane', 300]], 'Sư Tử tắt bán thì ẩn');

  shopStore.adjustDiamonds({ accountId: account.id, amount: 600, key: 'admin-grant-0004' });
  assert.equal((await call('adopt', { species: 'lion' })).json.code, 'NOT_FOR_SALE');
  const carp = await call('adopt', { species: 'carp' });
  assert.equal(carp.json.diamonds, 600 - 150, 'trừ đúng giá admin đặt');
});

// Cân bằng kinh tế: chạy đúng code vườn với đồng hồ giả. Người chơi miễn phí chăm chỉ kiếm ~120 xu/ngày.
test('linh thú: cân bằng xu — chăm mỗi ngày tháng đầu lãi 14–32 xu/ngày tùy loài, vắng lâu lãi ít hơn nhưng không âm, 4 con cấp 10 không vượt thu nhập miễn phí', async () => {
  const simulate = (species, everyDays, days) => {
    const { clock, account, garden } = setup();
    garden.adoptPet(account.id, species, '');
    let key = 0;
    const act = (action) => garden.petAction(account.id, action, { species }, `sim-${(key += 1).toString().padStart(6, '0')}`);
    const start = garden.pets(account.id).coins;
    for (let day = 0; day < days; day += 1) {
      if (day % everyDays === 0) { act('collect'); act('feed'); }
      clock.now += 24 * HOUR;
    }
    act('collect');
    return { perDay: (garden.pets(account.id).coins - start) / days, level: garden.pets(account.id).pets[0].level };
  };
  // Tháng đầu, vào mỗi ngày: lãi ròng trung bình mỗi ngày theo loài (cấp tăng dần từ 1).
  const month = Object.fromEntries(['carp', 'turtle', 'crane', 'lion'].map((species) => [species, simulate(species, 1, 30).perDay]));
  for (const [species, perDay] of Object.entries(month)) assert.ok(perDay >= 14 && perDay <= 32, `${species}: ${perDay.toFixed(1)} xu/ngày`);
  assert.ok(month.carp < month.crane && month.crane < month.lion, 'con đắt hơn đào nhiều hơn');
  // Vào thưa hơn thì lãi ít hơn, nhưng không bao giờ âm (không phạt).
  const byGap = [1, 2, 3, 7].map((gap) => simulate('carp', gap, 28).perDay);
  assert.ok(byGap[0] > byGap[1] && byGap[1] > byGap[2] && byGap[2] > byGap[3] && byGap[3] > 0, byGap.map((value) => value.toFixed(1)).join(' / '));
  // Đủ 4 con, chăm mỗi ngày tới cấp 10: tổng lãi ròng mỗi ngày vẫn dưới thu nhập miễn phí (~120).
  const maxed = ['carp', 'turtle', 'crane', 'lion'].map((species) => {
    const run = simulate(species, 1, 60);
    assert.equal(run.level, 10);
    return run;
  });
  const top = ['carp', 'turtle', 'crane', 'lion'].reduce((sum, species) => sum + simulate(species, 1, 90).perDay, 0);
  assert.ok(top <= 110, `4 con chăm 90 ngày: ${top.toFixed(0)} xu/ngày`);
  if (process.env.PET_ECON) console.log({ month, byGap, top });
  assert.ok(maxed.length === 4);
});

test('linh thú dẫn theo: con đầu tự đi theo, đổi / cho ở nhà; vé vào phòng mang { species, level }; báo mọi máy realtime', async () => {
  const { account, call, view, shopStore, options } = setup();
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{}');
  };
  try {
    options.realtimeBroadcastUrls = 'http://rt-1.test,http://rt-2.test';
    const cookie = `cd_session=${createSessionToken({ accountId: account.id, version: account.sessionVersion ?? 0 }, SECRET)}`;
    const ticket = async () => verifyJoinTicket((await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'thien-1' }, headers: { cookie } })).json.ticket, SECRET).value;
    const choose = (species) => request(options, 'POST', '/api/v1/pets/companion', { body: { species }, headers: { cookie } });
    assert.equal((await ticket()).pet, undefined, 'chưa nuôi thì không có');

    shopStore.adjustDiamonds({ accountId: account.id, amount: 700, key: 'admin-grant-0005' });
    await call('adopt', { species: 'carp' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await view()).companion, 'carp', 'con đầu tiên tự đi theo');
    assert.deepEqual((await ticket()).pet, { species: 'carp', level: 1 });
    assert.deepEqual(sent.map((item) => [item.url, item.body.pet?.species]), [['http://rt-1.test/internal/account-pet', 'carp'], ['http://rt-2.test/internal/account-pet', 'carp']]);

    await call('adopt', { species: 'crane' });
    assert.equal((await view()).companion, 'carp', 'con thứ hai không tự đổi');
    assert.equal((await choose('lion')).json.code, 'NO_PET', 'chỉ dẫn con mình nuôi');
    assert.equal((await choose('dragon')).status, 400);
    sent.length = 0;
    assert.equal((await choose('crane')).json.companion, 'crane');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent.map((item) => item.body), [{ accountId: account.id, pet: { species: 'crane', level: 1 } }, { accountId: account.id, pet: { species: 'crane', level: 1 } }]);

    // Cho ăn lên cấp: phòng thấy cấp mới.
    sent.length = 0;
    await call('feed', { species: 'crane' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent[0].body.pet, { species: 'crane', level: 2 });
    assert.deepEqual((await ticket()).pet, { species: 'crane', level: 2 });

    assert.equal((await choose(null)).json.companion, null);
    assert.equal((await ticket()).pet, undefined, 'cho ở nhà thì không đi theo');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
