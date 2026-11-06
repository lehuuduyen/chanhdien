import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey, verifyJoinTicket } from '@chanh-dien/session-token';
import { handleApiRequest } from '../server.mjs';
import { createShopStore, DIAMOND_PACKS, inspectGlb, shopIdFor, verifyStripeSignature } from '../shop.mjs';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const WEBHOOK_SECRET = 'whsec_testsecret1234567890';

async function request(options, method, url, { body, raw, headers = {} } = {}) {
  const payload = raw ?? (body === undefined ? null : JSON.stringify(body));
  const req = Readable.from(payload === null ? [] : [Buffer.from(payload)]);
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
  const type = Object.entries(res.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
  const isJson = String(type || '').includes('json');
  return { status: res.status, headers: res.headers, json: res.body && isJson ? JSON.parse(res.body) : null };
}

// Stripe giả: tạo phiên Checkout theo tham số gửi lên, trả lại phiên khi hỏi (paid tùy theo `paid`).
function fakeStripe() {
  const sessions = new Map();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') {
      const params = new URLSearchParams(init.body);
      const id = `cs_test_${'a'.repeat(10)}${sessions.size}`;
      const session = {
        object: 'checkout.session', id, url: `https://checkout.stripe.com/c/pay/${id}`,
        client_reference_id: params.get('client_reference_id'), metadata: { accountId: params.get('metadata[accountId]'), packId: params.get('metadata[packId]') },
        amount_total: Number(params.get('line_items[0][price_data][unit_amount]')), currency: 'usd', payment_status: 'unpaid',
      };
      sessions.set(id, session);
      return Response.json(session);
    }
    const id = decodeURIComponent(url.split('/').pop());
    return sessions.has(id) ? Response.json(sessions.get(id)) : Response.json({ error: {} }, { status: 404 });
  };
  return { sessions, calls, fetchImpl };
}

function setup(extra = {}) {
  const accounts = createAccountStore();
  const stripe = fakeStripe();
  return {
    stripe,
    options: {
      secret: SECRET, accounts, shopStore: createShopStore({ db: accounts.database }),
      shop: { secretKey: 'sk_test_abcdefghijkl', webhookSecret: WEBHOOK_SECRET, publicUrl: null },
      fetchImpl: stripe.fetchImpl, adminSecret: 'admin-secret-for-tests', ...extra,
    },
  };
}

async function signUp(options, username) {
  const response = await request(options, 'POST', '/api/v1/auth/register', { body: { username, password: 'matkhau123', displayName: username } });
  return { cookie: response.headers['set-cookie'].split(';')[0], accountId: response.json.account.id };
}

const signed = (raw, at = Math.floor(Date.now() / 1_000)) => `t=${at},v1=${createHmac('sha256', WEBHOOK_SECRET).update(`${at}.${raw}`).digest('hex')}`;

test('shop: khách xem được danh mục; mua/nạp cần đăng nhập', async () => {
  const { options } = setup();
  const view = await request(options, 'GET', '/api/v1/shop');
  assert.equal(view.status, 200);
  assert.equal(view.json.items[0].id, 'chibigirl');
  assert.deepEqual(view.json.items.find((item) => item.id === 'swordsman'), {
    id: 'swordsman', kind: 'skin', skin: 'swordsman', base: 'man', price: 0, rewardOnly: true, rewardDays: 7,
    name: 'Kiếm Sĩ', thumb: '/models/characters/swordsman.svg', active: true, originalPrice: null,
  });
  assert.equal(view.json.payments, true);
  assert.equal(view.json.me, null);
  assert.equal((await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'chibigirl' } })).status, 401);
  assert.equal((await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'd100' } })).status, 401);
});

test('shop: database cũ được nâng cấp để Telegram điều chỉnh kim cương có ghi sổ', () => {
  const accounts = createAccountStore();
  accounts.database.exec(`CREATE TABLE shop_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    amount INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('topup', 'purchase')),
    ref TEXT NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    at INTEGER NOT NULL
  );`);
  const account = accounts.register({ username: 'kim.cuong', password: 'matkhau123', displayName: 'Kim Cương' }).account;
  const store = createShopStore({ db: accounts.database });
  const added = store.adjustDiamonds({ accountId: account.id, amount: 80, key: 'telegram-2001' });
  assert.deepEqual([added.ok, added.diamonds], [true, 80]);
  const replay = store.adjustDiamonds({ accountId: account.id, amount: 80, key: 'telegram-2001' });
  assert.deepEqual([replay.replayed, replay.diamonds], [true, 80]);
  assert.deepEqual(store.me(account.id).history[0], {
    amount: 80, kind: 'admin_adjustment', ref: 'telegram-2001', at: store.me(account.id).history[0].at,
  });
});

test('mở phim tốn kim cương: máy realtime trừ qua đường nội bộ, gửi lại cùng khóa không trừ hai lần, hoàn đúng một lần', async () => {
  const { options } = setup();
  const an = await signUp(options, 'an.phim');
  options.shopStore.adjustDiamonds({ accountId: an.accountId, amount: 30, key: 'telegram-3001' });
  const internal = { 'x-internal-key': internalKey(SECRET) };
  const spend = (key, extra = {}) => request(options, 'POST', '/internal/shop/spend', {
    body: { accountId: an.accountId, amount: 20, reason: 'cinema_video', ref: 'dQw4w9WgXcQ', key, ...extra }, headers: internal,
  }).then((result) => result.json);
  assert.equal((await request(options, 'POST', '/internal/shop/spend', { body: { accountId: an.accountId, amount: 20, reason: 'cinema_video', ref: 'x', key: 'video-key-1' } })).status, 403, 'trình duyệt không gọi được');
  assert.deepEqual(await spend('video-key-1'), { ok: true, diamonds: 10 });
  assert.deepEqual(await spend('video-key-1'), { ok: true, replayed: true, diamonds: 10 }, 'gửi lại không trừ hai lần');
  assert.deepEqual(await spend('video-key-2'), { ok: false, error: 'INSUFFICIENT_DIAMONDS', diamonds: 10 });
  assert.equal((await spend('video-key-3', { reason: 'free_money' })).error, 'INVALID');
  const refund = (key) => request(options, 'POST', '/internal/shop/refund', { body: { accountId: an.accountId, key }, headers: internal }).then((result) => result.json);
  assert.deepEqual(await refund('video-key-1'), { ok: true, diamonds: 30 });
  assert.deepEqual(await refund('video-key-1'), { ok: true, replayed: true, diamonds: 30 }, 'hoàn tối đa một lần');
  assert.equal((await refund('video-key-2')).error, 'UNKNOWN_SPEND', 'chỉ hoàn lần tiêu có thật');
  assert.deepEqual(options.shopStore.me(an.accountId).history.slice(0, 2).map(({ amount, kind, ref }) => [amount, kind, ref]),
    [[20, 'refund', 'cinema_video:dQw4w9WgXcQ'], [-20, 'spend', 'cinema_video:dQw4w9WgXcQ']]);
});

test('shop: nạp qua Stripe Checkout, trang quay về cộng kim cương đúng một lần, rồi mua hình', async () => {
  const { options, stripe } = setup();
  const { cookie, accountId } = await signUp(options, 'an.lac');
  const poor = await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'chibigirl' }, headers: { cookie } });
  assert.equal(poor.json.error, 'INSUFFICIENT_DIAMONDS');

  const foreign = await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'd550' }, headers: { cookie, origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  const checkout = await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'd550' }, headers: { cookie, origin: 'http://chanh-dien.test' } });
  assert.equal(checkout.status, 200);
  assert.match(checkout.json.url, /^https:\/\/checkout\.stripe\.com\//);
  const sent = new URLSearchParams(stripe.calls[0].init.body);
  assert.equal(sent.get('line_items[0][price_data][unit_amount]'), '499', 'giá do server quyết định');
  assert.equal(sent.get('success_url'), 'http://chanh-dien.test/shop.html?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  const [session] = stripe.sessions.values();

  // Chưa trả: không cộng.
  const pending = await request(options, 'POST', '/api/v1/shop/checkout/confirm', { body: { sessionId: session.id }, headers: { cookie } });
  assert.equal(pending.status, 202);
  assert.equal(pending.json.me.diamonds, 0);

  session.payment_status = 'paid';
  const paid = await request(options, 'POST', '/api/v1/shop/checkout/confirm', { body: { sessionId: session.id }, headers: { cookie } });
  assert.equal(paid.json.credited, true);
  assert.equal(paid.json.me.diamonds, 550);
  const again = await request(options, 'POST', '/api/v1/shop/checkout/confirm', { body: { sessionId: session.id }, headers: { cookie } });
  assert.equal(again.json.credited, false);
  assert.equal(again.json.me.diamonds, 550, 'hỏi lại không cộng lần hai');

  // Webhook của cùng phiên đến sau: cũng không cộng thêm.
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
  const hook = await request(options, 'POST', '/api/v1/stripe/webhook', { raw, headers: { 'stripe-signature': signed(raw) } });
  assert.equal(hook.status, 200);

  // Người khác không xác nhận hộ được phiên của mình.
  const other = await signUp(options, 'binh.an');
  assert.equal((await request(options, 'POST', '/api/v1/shop/checkout/confirm', { body: { sessionId: session.id }, headers: { cookie: other.cookie } })).status, 403);

  const bought = await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'chibigirl' }, headers: { cookie } });
  assert.equal(bought.status, 200);
  assert.equal(bought.json.me.diamonds, 250);
  assert.deepEqual(bought.json.me.owned, ['chibigirl']);
  const twice = await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'chibigirl' }, headers: { cookie } });
  assert.equal(twice.json.already, true);
  assert.equal(twice.json.me.diamonds, 250, 'mua lại món đã có không trừ tiền');
  assert.deepEqual(twice.json.me.history.map((row) => [row.kind, row.amount]), [['purchase', -300], ['topup', 550]]);

  // Vé vào phòng ghi hình đã mua để máy realtime cho mặc; người chưa mua thì không có.
  const join = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } });
  assert.deepEqual(verifyJoinTicket(join.json.ticket, SECRET).value.skins, ['chibigirl']);
  const otherJoin = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie: other.cookie } });
  assert.equal(verifyJoinTicket(otherJoin.json.ticket, SECRET).value.skins, undefined);
  assert.ok(accountId);
});

test('shop: webhook phải có chữ ký Stripe đúng; cộng theo phiên đã ghi, lệch số tiền thì bỏ qua', async () => {
  const { options, stripe } = setup();
  const { cookie } = await signUp(options, 'cuc.hoa');
  await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'd100' }, headers: { cookie, origin: 'http://chanh-dien.test' } });
  const [session] = stripe.sessions.values();
  const event = (object) => JSON.stringify({ type: 'checkout.session.completed', data: { object } });

  const forged = event({ ...session, payment_status: 'paid' });
  assert.equal((await request(options, 'POST', '/api/v1/stripe/webhook', { raw: forged, headers: { 'stripe-signature': 't=1,v1=00' } })).status, 400);
  const old = signed(forged, Math.floor(Date.now() / 1_000) - 3_600);
  assert.equal((await request(options, 'POST', '/api/v1/stripe/webhook', { raw: forged, headers: { 'stripe-signature': old } })).status, 400, 'chữ ký quá cũ');

  // Số tiền trên phiên khác với gói đã ghi: không cộng.
  const cheap = event({ ...session, payment_status: 'paid', amount_total: 1 });
  await request(options, 'POST', '/api/v1/stripe/webhook', { raw: cheap, headers: { 'stripe-signature': signed(cheap) } });
  assert.equal((await request(options, 'GET', '/api/v1/shop', { headers: { cookie } })).json.me.diamonds, 0);

  const raw = event({ ...session, payment_status: 'paid' });
  assert.equal((await request(options, 'POST', '/api/v1/stripe/webhook', { raw, headers: { 'stripe-signature': signed(raw) } })).status, 200);
  await request(options, 'POST', '/api/v1/stripe/webhook', { raw, headers: { 'stripe-signature': signed(raw) } });
  assert.equal((await request(options, 'GET', '/api/v1/shop', { headers: { cookie } })).json.me.diamonds, 100, 'Stripe gửi lại cùng sự kiện không cộng lần hai');
});

test('shop: chưa cấu hình Stripe thì shop vẫn mở, tắt nạp', async () => {
  const { options } = setup({ shop: { secretKey: null, webhookSecret: null, publicUrl: null } });
  const { cookie } = await signUp(options, 'dao.tam');
  assert.equal((await request(options, 'GET', '/api/v1/shop', { headers: { cookie } })).json.payments, false);
  assert.equal((await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'd100' }, headers: { cookie } })).status, 503);
  assert.equal((await request(options, 'POST', '/api/v1/stripe/webhook', { raw: '{}' })).status, 503);
});

test('shop: gói nạp và chữ ký webhook', () => {
  assert.deepEqual(DIAMOND_PACKS.map((pack) => [pack.diamonds, pack.cents]), [[100, 99], [550, 499], [1200, 999]]);
  const raw = '{"a":1}';
  assert.equal(verifyStripeSignature(raw, signed(raw), WEBHOOK_SECRET), true);
  assert.equal(verifyStripeSignature(`${raw} `, signed(raw), WEBHOOK_SECRET), false);
  assert.equal(verifyStripeSignature(raw, signed(raw), 'whsec_other0000000000'), false);
});

test('shop: admin chỉnh gói nạp; gói tắt không hiện và không mua được; sai khóa / sai dữ liệu bị từ chối', async () => {
  const { options, stripe } = setup();
  const admin = { 'x-admin-key': 'admin-secret-for-tests' };
  assert.equal((await request(options, 'GET', '/api/v1/admin/shop/packs', { headers: { 'x-admin-key': 'sai' } })).status, 403);
  const current = await request(options, 'GET', '/api/v1/admin/shop/packs', { headers: admin });
  assert.deepEqual(current.json.packs.map((pack) => pack.id), ['d100', 'd550', 'd1200']);

  const packs = [
    { id: 'tet', diamonds: 888, cents: 688, active: true },
    { id: 'd100', diamonds: 120, cents: 99, active: true },
    { id: 'd1200', diamonds: 1200, cents: 999, active: false },
  ];
  for (const bad of [[{ ...packs[0], cents: 10 }], [{ ...packs[0], id: 'Có dấu' }], [packs[0], packs[0]], [{ ...packs[0], diamonds: 1.5 }], 'x']) {
    assert.equal((await request(options, 'PUT', '/api/v1/admin/shop/packs', { body: { packs: bad }, headers: admin })).status, 400);
  }
  const saved = await request(options, 'PUT', '/api/v1/admin/shop/packs', { body: { packs }, headers: admin });
  assert.deepEqual(saved.json.packs, packs);
  assert.equal((await request(options, 'PUT', '/api/v1/admin/shop/packs', { body: { packs } })).status, 403);

  const view = await request(options, 'GET', '/api/v1/shop');
  assert.deepEqual(view.json.packs, [{ id: 'tet', diamonds: 888, cents: 688 }, { id: 'd100', diamonds: 120, cents: 99 }]);
  const { cookie } = await signUp(options, 'gia.han');
  assert.equal((await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'd1200' }, headers: { cookie } })).status, 404, 'gói đang tắt');
  const checkout = await request(options, 'POST', '/api/v1/shop/checkout', { body: { packId: 'tet' }, headers: { cookie, origin: 'http://chanh-dien.test' } });
  assert.equal(checkout.status, 200);
  assert.equal(new URLSearchParams(stripe.calls[0].init.body).get('line_items[0][price_data][unit_amount]'), '688');

  // Đổi giá sau khi đã tạo phiên: người đang trả vẫn được cộng đúng số của phiên đó.
  await request(options, 'PUT', '/api/v1/admin/shop/packs', { body: { packs: [{ id: 'tet', diamonds: 1, cents: 688, active: true }] }, headers: admin });
  const [session] = stripe.sessions.values();
  session.payment_status = 'paid';
  const paid = await request(options, 'POST', '/api/v1/shop/checkout/confirm', { body: { sessionId: session.id }, headers: { cookie } });
  assert.equal(paid.json.me.diamonds, 888);
});

// File .glb nhỏ có khung xương kiểu Mixamo (đủ xương chính) và động tác Walking, như Meshy "Rig & Animate" xuất ra.
const RIG_BONES = ['Hips', 'Spine', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftArm', 'RightArm'];
async function rigGlb({ bones = RIG_BONES, walk = true, skinned = true } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute('POSITION', accessor('VEC3', new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 1, 0])));
  if (skinned) {
    primitive.setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(12))).setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
  }
  const body = doc.createNode('Body').setMesh(doc.createMesh().addPrimitive(primitive));
  const scene = doc.createScene().addChild(body);
  if (skinned) {
    const nodes = bones.map((name, index) => doc.createNode(`mixamorig:${name}`).setTranslation([0, index * 0.1, 0]));
    nodes.slice(1).forEach((node) => nodes[0].addChild(node));
    const identity = new Float32Array(16 * nodes.length).map((_, index) => (index % 16 % 5 === 0 ? 1 : 0));
    const skin = doc.createSkin().setSkeleton(nodes[0]).setInverseBindMatrices(accessor('MAT4', identity));
    nodes.forEach((node) => skin.addJoint(node));
    body.setSkin(skin);
    scene.addChild(nodes[0]);
    if (walk) {
      const sampler = doc.createAnimationSampler().setInput(accessor('SCALAR', new Float32Array([0, 1]))).setOutput(accessor('VEC4', new Float32Array([0, 0, 0, 1, 0, 0.38, 0, 0.92])));
      doc.createAnimation('Walking').addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[0]).setTargetPath('rotation').setSampler(sampler));
    }
  }
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

test('shop: kiểm tra file nhân vật trước khi nén', async () => {
  assert.equal(inspectGlb(Buffer.from('không phải glb')).error, 'NOT_GLB');
  assert.equal(inspectGlb(await rigGlb({ skinned: false })).error, 'NO_SKELETON');
  assert.deepEqual(inspectGlb(await rigGlb({ bones: ['Hips', 'Spine'] })).missing, ['leftupleg', 'leftleg', 'rightupleg', 'rightleg', 'leftarm', 'rightarm']);
  assert.equal(inspectGlb(await rigGlb({ walk: false })).error, 'NO_WALK');
  assert.deepEqual(inspectGlb(await rigGlb()).clips, ['Walking']);
  assert.equal(shopIdFor('Kiếm Sĩ Đạo'), 'shop-kiem-si-dao');
});

test('shop: admin tải nhân vật .glb → nén, hiện trong shop, mua được, vé vào phòng cho mặc; ẩn thì không bán', async () => {
  const modelDir = mkdtempSync(join(tmpdir(), 'shop-models-'));
  try {
    const { options } = setup({ shopModelDir: modelDir });
    const admin = { 'x-admin-key': 'admin-secret-for-tests' };
    const upload = (query, raw, headers = admin) => request(options, 'POST', `/api/v1/admin/shop/models?${query}`, { raw, headers });
    assert.equal((await upload('name=Kiếm%20Sĩ&price=200&base=man', await rigGlb(), {})).status, 403);
    const stat = await upload('name=Tượng&price=10&base=man', await rigGlb({ skinned: false }));
    assert.equal(stat.status, 422);
    assert.equal(stat.json.error, 'NO_SKELETON');
    assert.equal((await upload('name=&price=10&base=man', await rigGlb())).status, 400);

    const saved = await upload('name=Kiếm%20Sĩ&price=200&base=man', await rigGlb());
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.item.id, 'shop-kiem-si');
    assert.equal(saved.json.item.model, '/api/v1/shop/models/shop-kiem-si.glb?v=1');
    const listed = await request(options, 'GET', '/api/v1/shop');
    assert.deepEqual(listed.json.items.map((item) => item.id), ['chibigirl', 'swordsman', 'shop-kiem-si']);
    const file = await request(options, 'GET', '/api/v1/shop/models/shop-kiem-si.glb');
    assert.equal(file.status, 200);
    assert.equal(file.headers['Content-Type'], 'model/gltf-binary');
    assert.equal((await request(options, 'GET', '/api/v1/shop/models/shop-khong-co.glb')).status, 404);
    // Ảnh chân dung admin dựng: chỉ nhận PNG; có ảnh thì danh mục kèm link (shop hiện ngay, không cần dựng 3D).
    assert.equal(saved.json.item.thumb, null);
    const thumb = (raw, headers = admin) => request(options, 'PUT', '/api/v1/admin/shop/items/shop-kiem-si/thumb', { raw, headers });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    assert.equal((await thumb(png, {})).status, 403);
    assert.equal((await thumb(Buffer.from('<svg></svg>'))).status, 400);
    assert.equal((await thumb(Buffer.alloc(700 * 1024, 1))).status, 413);
    assert.equal((await thumb(png)).json.item.thumb, '/api/v1/shop/models/shop-kiem-si.png?v=1');
    const image = await request(options, 'GET', '/api/v1/shop/models/shop-kiem-si.png');
    assert.equal(image.headers['Content-Type'], 'image/png');
    assert.equal((await request(options, 'GET', '/api/v1/shop')).json.models[0].thumb, '/api/v1/shop/models/shop-kiem-si.png?v=1');
    assert.equal((await request(options, 'GET', '/api/v1/shop')).json.items[0].thumb, '/models/characters/chibi-girl.png');

    // Mua bằng kim cương rồi vào phòng: vé ghi hình đã mua.
    const { cookie, accountId } = await signUp(options, 'hung.dung');
    options.accounts.database.prepare('INSERT INTO shop_wallets (account_id, diamonds, updated_at) VALUES (?, 500, 0)').run(accountId);
    const bought = await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'shop-kiem-si' }, headers: { cookie } });
    assert.equal(bought.json.me.diamonds, 300);
    const join = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } });
    assert.deepEqual(verifyJoinTicket(join.json.ticket, SECRET).value.skins, ['shop-kiem-si']);

    // Thay file: giữ tên/giá, tăng version. Ẩn món: không bán nữa nhưng người đã mua vẫn mặc được.
    const replaced = await upload('id=shop-kiem-si', await rigGlb());
    assert.equal(replaced.json.item.model, '/api/v1/shop/models/shop-kiem-si.glb?v=2');
    assert.equal(replaced.json.item.price, 200);
    const hidden = await request(options, 'PATCH', '/api/v1/admin/shop/items/shop-kiem-si', { body: { active: false, price: 250, name: ' Kiếm Sĩ Lam ' }, headers: admin });
    assert.deepEqual([hidden.json.item.active, hidden.json.item.price, hidden.json.item.name], [false, 250, 'Kiếm Sĩ Lam']);
    assert.deepEqual((await request(options, 'GET', '/api/v1/shop')).json.items.map((item) => item.id), ['chibigirl', 'swordsman']);
    const other = await signUp(options, 'an.vui');
    options.accounts.database.prepare('INSERT INTO shop_wallets (account_id, diamonds, updated_at) VALUES (?, 500, 0)').run(other.accountId);
    assert.equal((await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'shop-kiem-si' }, headers: { cookie: other.cookie } })).status, 404);
    const again = await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } });
    assert.deepEqual(verifyJoinTicket(again.json.ticket, SECRET).value.skins, ['shop-kiem-si']);
    assert.equal((await request(options, 'PATCH', '/api/v1/admin/shop/items/shop-kiem-si', { body: { price: -1 }, headers: admin })).status, 400);
    assert.equal((await request(options, 'GET', '/api/v1/admin/shop/items', { headers: admin })).json.items.length, 2);
    // Nhún nhảy: file chưa có điệu nhảy → dùng kiểu admin chọn (mặc định nhún lên xuống); danh mục mô hình kèm kiểu.
    const shopModel = () => request(options, 'GET', '/api/v1/shop').then((result) => result.json.models[0]);
    assert.deepEqual([(await shopModel()).dance, hidden.json.item.danceClip], ['bounce', false]);
    assert.deepEqual(hidden.json.item.actClips, [], 'chỉ có Walking: chưa có động tác tương tác (✨ nhún nhảy mặc định)');
    const { BASE_CLIP } = await import('../shop.mjs');
    assert.deepEqual(['Walking', 'Running', 'Idle_Breathing', 'T-Pose', 'Wave_Hello', 'Bow', 'Hip_Hop_Dance'].filter((name) => !BASE_CLIP.test(name)), ['Wave_Hello', 'Bow', 'Hip_Hop_Dance']);
    assert.equal((await request(options, 'PATCH', '/api/v1/admin/shop/items/shop-kiem-si', { body: { dance: 'spin' }, headers: admin })).json.item.dance, 'spin');
    assert.equal((await shopModel()).dance, 'spin');
    assert.equal((await request(options, 'PATCH', '/api/v1/admin/shop/items/shop-kiem-si', { body: { dance: 'twerk' }, headers: admin })).status, 400);
  } finally {
    rmSync(modelDir, { recursive: true, force: true });
  }
});

test('shop: admin đặt giá gốc và giá bán (giảm giá) cho cả hình có sẵn; mua theo giá bán', async () => {
  const { options } = setup();
  const admin = { 'x-admin-key': 'admin-secret-for-tests' };
  const patch = (id, body, headers = admin) => request(options, 'PATCH', `/api/v1/admin/shop/items/${id}`, { body, headers });
  assert.equal((await patch('chibigirl', { price: 199, originalPrice: 300 }, {})).status, 403);
  const sale = await patch('chibigirl', { price: 199, originalPrice: 300 });
  assert.deepEqual([sale.json.item.price, sale.json.item.originalPrice, sale.json.item.active], [199, 300, true]);
  const listed = (await request(options, 'GET', '/api/v1/shop')).json.items.find((item) => item.id === 'chibigirl');
  assert.deepEqual([listed.price, listed.originalPrice], [199, 300]);

  const { cookie, accountId } = await signUp(options, 'giam.gia');
  options.accounts.database.prepare('INSERT INTO shop_wallets (account_id, diamonds, updated_at) VALUES (?, 250, 0)').run(accountId);
  const bought = await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'chibigirl' }, headers: { cookie } });
  assert.equal(bought.json.me.diamonds, 51, 'trừ theo giá bán, không theo giá gốc');

  // Giá gốc không lớn hơn giá bán thì coi như không giảm; null là bỏ giảm giá.
  assert.equal((await patch('chibigirl', { price: 300, originalPrice: 250 })).json.item.originalPrice, null);
  assert.equal((await patch('chibigirl', { originalPrice: null })).json.item.originalPrice, null);
  assert.equal((await patch('chibigirl', { originalPrice: -5 })).status, 400);
  assert.equal((await patch('chibigirl', { originalPrice: '400' })).status, 400);
  // Tắt hình có sẵn: không bán nữa.
  await patch('chibigirl', { active: false });
  assert.equal((await request(options, 'GET', '/api/v1/shop')).json.items.some((item) => item.id === 'chibigirl'), false);
  assert.equal((await patch('khong-co', { price: 1 })).status, 405);
});

test('shop: lưu hình chọn lần cuối theo tài khoản; mua xong tự chọn hình đó; vé vào phòng mang hình đã lưu', async () => {
  const { options } = setup();
  const { cookie, accountId } = await signUp(options, 'chon.hinh');
  const save = (skin) => request(options, 'POST', '/api/v1/shop/skin', { body: { skin }, headers: { cookie } });
  const me = async () => (await request(options, 'GET', '/api/v1/shop', { headers: { cookie } })).json.me;
  assert.equal((await me()).skin, null, 'chưa chọn');
  assert.equal((await save('woman')).status, 200);
  assert.equal((await me()).skin, 'woman');
  assert.equal((await save('chibigirl')).status, 409, 'chưa mua thì không lưu');
  assert.equal((await save('rong-than')).status, 400);
  assert.equal((await request(options, 'POST', '/api/v1/shop/skin', { body: { skin: 'man' } })).status, 401, 'khách không lưu lên server');
  const join = async () => verifyJoinTicket((await request(options, 'POST', '/api/v1/rooms/join', { body: { roomId: 'cinema-1' }, headers: { cookie } })).json.ticket, SECRET).value;
  assert.equal((await join()).skin, 'woman');
  options.accounts.database.prepare('INSERT INTO shop_wallets (account_id, diamonds, updated_at) VALUES (?, 500, 0)').run(accountId);
  await request(options, 'POST', '/api/v1/shop/buy', { body: { itemId: 'chibigirl' }, headers: { cookie } });
  assert.equal((await me()).skin, 'chibigirl', 'mua xong là mặc');
  const ticket = await join();
  assert.deepEqual([ticket.skin, ticket.skins], ['chibigirl', ['chibigirl']]);
  assert.equal((await save('man')).status, 200);
  assert.equal((await join()).skin, 'man');
});
