import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createGardenStore, FRUITS_PER_CROP, gardenDay, PLANTS, STARTING_COINS, WATER_INTERVAL_MS, WILT_AFTER_MS } from '../src/index.mjs';

function setup() {
  let clock = Date.parse('2026-11-03T20:00:00Z');
  const accounts = createAccountStore({ now: () => clock });
  const garden = createGardenStore({ db: accounts.database, now: () => clock, timeZone: 'America/Los_Angeles' });
  const user = (name) => accounts.register({ username: name, password: 'matkhau123', displayName: name }).account.id;
  let serial = 0;
  const act = (accountId, action, input) => garden.perform(accountId, action, input, `key-${(serial += 1).toString().padStart(6, '0')}`);
  return { accounts, garden, user, act, tick: (ms) => { clock += ms; } };
}

test('ngày tưới theo múi giờ server, không theo giờ UTC', () => {
  // 03:00 UTC ngày 4/11 vẫn là tối 3/11 ở California.
  assert.equal(gardenDay(Date.parse('2026-11-04T03:00:00Z'), 'America/Los_Angeles'), '2026-11-03');
  assert.equal(gardenDay(Date.parse('2026-11-04T03:00:00Z'), 'Asia/Ho_Chi_Minh'), '2026-11-04');
});

test('ví mới có xu khởi đầu; mua hạt trừ xu, không đủ xu thì từ chối và không đổi gì', () => {
  const { garden, user, act } = setup();
  const an = user('an_lac');
  assert.equal(garden.me(an).coins, STARTING_COINS);
  const bought = act(an, 'buy', { plantType: 'peach', quantity: 2 });
  assert.equal(bought.ok, true);
  assert.equal(bought.me.coins, STARTING_COINS - 2 * PLANTS.peach.seedPrice);
  assert.deepEqual(bought.me.seeds, { peach: 2 });
  const tooMuch = act(an, 'buy', { plantType: 'peach', quantity: 1 + Math.floor(bought.me.coins / PLANTS.peach.seedPrice) });
  assert.equal(tooMuch.code, 'INSUFFICIENT_COINS');
  assert.deepEqual(garden.me(an).seeds, { peach: 2 }, 'lỗi thì không cộng hạt');
  assert.equal(act(an, 'buy', { plantType: 'durian', quantity: 1 }).code, 'INVALID');
  assert.deepEqual(garden.history(an).map((row) => row.kind), ['buy_seed', 'grant']);
});

test('khóa idempotency: gửi lại cùng khóa không trừ xu lần hai', () => {
  const { garden, user } = setup();
  const an = user('an_lac');
  const first = garden.perform(an, 'buy', { plantType: 'apple', quantity: 1 }, 'same-key-123');
  const again = garden.perform(an, 'buy', { plantType: 'apple', quantity: 1 }, 'same-key-123');
  assert.equal(again.replayed, true);
  assert.equal(again.me.coins, first.me.coins);
  assert.equal(garden.me(an).coins, STARTING_COINS - PLANTS.apple.seedPrice);
  assert.equal(garden.perform(an, 'sell', { plantType: 'apple', quantity: 1 }, 'same-key-123').code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(garden.perform(an, 'buy', { plantType: 'apple', quantity: 1 }).code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('gieo: người đầu tiên chiếm luống, người sau bị từ chối và giữ nguyên hạt', () => {
  const { garden, user, act } = setup();
  const an = user('an_lac');
  const binh = user('binh_an');
  act(an, 'buy', { plantType: 'apple', quantity: 1 });
  act(binh, 'buy', { plantType: 'apple', quantity: 1 });
  const planted = act(an, 'plant', { plotId: 3, plantType: 'apple' });
  assert.equal(planted.ok, true);
  assert.equal(planted.plots[0].crop.ownerName, 'an_lac');
  assert.equal(planted.plots[0].crop.stage, 'seed');
  assert.equal(act(binh, 'plant', { plotId: 3, plantType: 'apple' }).code, 'PLOT_TAKEN');
  assert.deepEqual(garden.me(binh).seeds, { apple: 1 });
  assert.equal(act(binh, 'plant', { plotId: 4, plantType: 'orange' }).code, 'NO_SEED');
  assert.equal(act(binh, 'plant', { plotId: 11, plantType: 'apple' }).code, 'INVALID');
});

test('tưới: lần đầu ngay sau khi gieo, sau đó cách 8 giờ; đủ 3 lần ra đúng 10 quả', () => {
  const { garden, user, act, tick } = setup();
  const an = user('an_lac');
  const binh = user('binh_an');
  act(an, 'buy', { plantType: 'orange', quantity: 1 });
  act(an, 'plant', { plotId: 1, plantType: 'orange' });
  assert.equal(act(binh, 'water', { plotId: 1 }).counted, true, 'người khác tưới được');
  const second = act(an, 'water', { plotId: 1 });
  assert.equal(second.code, 'WATER_TOO_SOON');
  assert.equal(garden.plot(1).crop.stage, 'sprout');
  tick(WATER_INTERVAL_MS - 1);
  assert.equal(act(an, 'water', { plotId: 1 }).code, 'WATER_TOO_SOON');
  tick(1);
  act(an, 'water', { plotId: 1 });
  assert.equal(garden.plot(1).crop.stage, 'young');
  tick(WATER_INTERVAL_MS);
  const ripe = act(binh, 'water', { plotId: 1 });
  assert.equal(ripe.plots[0].crop.stage, 'fruiting');
  assert.equal(ripe.plots[0].crop.fruitsLeft, FRUITS_PER_CROP);
  assert.equal(act(an, 'water', { plotId: 1 }).code, 'WATER_TOO_SOON');
  tick(WATER_INTERVAL_MS);
  const fruitWater = act(an, 'water', { plotId: 1 });
  assert.equal(fruitWater.ok, true, 'cây đã ra quả vẫn cần nước');
  assert.equal(fruitWater.counted, false, 'tưới sau khi ra quả không tăng giai đoạn');
});

test('hái: khách hái tối đa 2 quả mỗi vụ, chủ hái phần còn lại; hết quả thì luống trống', () => {
  const { garden, user, act, tick } = setup();
  const [an, binh, chi] = [user('an_lac'), user('binh_an'), user('chi_tam')];
  act(an, 'buy', { plantType: 'peach', quantity: 1 });
  act(an, 'plant', { plotId: 5, plantType: 'peach' });
  for (let watering = 0; watering < 3; watering += 1) {
    act(an, 'water', { plotId: 5 });
    tick(WATER_INTERVAL_MS);
  }
  assert.equal(act(binh, 'harvest', { plotId: 5 }).harvested, 2);
  assert.equal(act(binh, 'harvest', { plotId: 5 }).code, 'HARVEST_LIMIT');
  assert.equal(act(chi, 'harvest', { plotId: 5, quantity: 1 }).harvested, 1);
  assert.equal(garden.plot(5).crop.fruitsLeft, 7);
  const owner = act(an, 'harvest', { plotId: 5 });
  assert.equal(owner.harvested, 7);
  assert.equal(owner.plots[0].crop, null, 'hái hết thì luống trống');
  assert.deepEqual(garden.me(an).fruits, { peach: 7 });
  assert.deepEqual(garden.me(binh).fruits, { peach: 2 });
  assert.equal(act(chi, 'harvest', { plotId: 5 }).code, 'NOT_FRUITING');
});

test('bán và dâng quả: không bán quá số quả đang có; xu cộng theo giá', () => {
  const { garden, user, act, tick } = setup();
  const an = user('an_lac');
  act(an, 'buy', { plantType: 'apple', quantity: 1 });
  act(an, 'plant', { plotId: 2, plantType: 'apple' });
  for (let watering = 0; watering < 3; watering += 1) {
    act(an, 'water', { plotId: 2 });
    tick(WATER_INTERVAL_MS);
  }
  act(an, 'harvest', { plotId: 2 });
  const coins = garden.me(an).coins;
  assert.equal(act(an, 'sell', { plantType: 'apple', quantity: 11 }).code, 'INSUFFICIENT_FRUIT');
  const sold = act(an, 'sell', { plantType: 'apple', quantity: 4 });
  assert.equal(sold.me.coins, coins + 4 * PLANTS.apple.fruitPrice);
  const offered = act(an, 'offer', { plantType: 'apple', quantity: 6 });
  assert.equal(offered.me.offered, 6);
  assert.deepEqual(offered.me.fruits, {});
  assert.equal(act(an, 'offer', { plantType: 'apple', quantity: 1 }).code, 'INSUFFICIENT_FRUIT');
});

test('quá 24 giờ không tưới thì cây héo nhưng không bị xóa; tưới lại thì hồi phục', () => {
  const { garden, user, act, tick } = setup();
  const an = user('an_lac');
  act(an, 'buy', { plantType: 'apple', quantity: 1 });
  act(an, 'plant', { plotId: 7, plantType: 'apple' });
  tick(WILT_AFTER_MS + 1);
  const snapshot = garden.snapshot();
  assert.deepEqual(snapshot.expired, []);
  assert.equal(snapshot.plots[6].crop.wilted, true);
  const revived = act(an, 'water', { plotId: 7 });
  assert.equal(revived.ok, true);
  assert.equal(revived.revived, true);
  assert.equal(revived.plots[0].crop.wilted, false);
});

test('ràng buộc cơ sở dữ liệu: không thể có hai vụ đang trồng trên một luống', () => {
  const { accounts, user, act } = setup();
  const an = user('an_lac');
  act(an, 'buy', { plantType: 'apple', quantity: 2 });
  act(an, 'plant', { plotId: 9, plantType: 'apple' });
  assert.throws(() => accounts.database.prepare(`INSERT INTO crop_cycles (plot_id, owner_account, plant_type, status, planted_day, planted_at)
    VALUES (9, ?, 'apple', 'growing', '2026-11-03', 1)`).run(an), /UNIQUE/);
});

test('Bầu Cua: cược bằng xu của ví, server lắc và trả thưởng, ghi sổ; gửi lại cùng khóa không trừ/cộng lần hai', async () => {
  const { BAU_CUA_ANIMALS, settleBauCua } = await import('../src/index.mjs');
  const { createAccountStore: accountsOf } = await import('@chanh-dien/accounts');
  const accounts = accountsOf({});
  // Xúc xắc cố định: Cua, Cua, Gà.
  const rolls = [4, 4, 2];
  let next = 0;
  const garden = createGardenStore({ db: accounts.database, random: () => rolls[next++ % rolls.length] });
  const an = accounts.register({ username: 'an_bc', password: 'matkhau123', displayName: 'An' }).account.id;
  assert.equal(garden.me(an).coins, STARTING_COINS);
  // Cua 10 (ra 2 lần: nhận lại 10 + 20), Tôm 5 (thua).
  const round = garden.playBauCua(an, { cua: 10, tom: 5, nai: 0 }, 'round-000001');
  assert.equal(round.ok, true);
  assert.deepEqual(round.dice, ['cua', 'cua', 'ga']);
  assert.equal(round.staked, 15);
  assert.equal(round.payout, 30);
  assert.equal(round.net, 15);
  assert.equal(round.coins, STARTING_COINS + 15);
  assert.equal(garden.me(an).coins, STARTING_COINS + 15);
  const again = garden.playBauCua(an, { cua: 10, tom: 5 }, 'round-000001');
  assert.equal(again.replayed, true);
  assert.deepEqual(again.dice, ['cua', 'cua', 'ga'], 'không lắc lại');
  assert.equal(garden.me(an).coins, STARTING_COINS + 15, 'không cộng lần hai');
  const kinds = garden.history(an).map((item) => [item.kind, item.amount]);
  assert.deepEqual(kinds.slice(0, 2), [['game_win', 30], ['game_bet', -15]]);
  // Không đủ xu / cược sai: từ chối, số dư không đổi.
  assert.equal(garden.playBauCua(an, { cua: 999 }, 'round-000002').code, 'INSUFFICIENT_COINS');
  assert.equal(garden.playBauCua(an, { rong: 5 }, 'round-000003').code, 'INVALID');
  assert.equal(garden.playBauCua(an, { cua: 1.5 }, 'round-000004').code, 'INVALID');
  assert.equal(garden.playBauCua(an, { cua: -5, tom: 10 }, 'round-000005').code, 'INVALID');
  assert.equal(garden.playBauCua(an, {}, 'round-000006').code, 'INVALID');
  assert.equal(garden.playBauCua(an, { cua: 5 }, 'x').code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(garden.me(an).coins, STARTING_COINS + 15);
  // Luật trả thưởng: trúng 1/2/3 lần, không trúng.
  assert.deepEqual(settleBauCua({ nai: 10 }, ['nai', 'ga', 'ca']).payout, 20);
  assert.deepEqual(settleBauCua({ ga: 10 }, ['ga', 'ga', 'ga']).payout, 40);
  assert.deepEqual(settleBauCua({ bau: 10 }, ['ga', 'ga', 'ca']).payout, 0);
  assert.equal(BAU_CUA_ANIMALS.length, 6);
});

test('nhiệm vụ hằng ngày: làm xong mới nhận được, mỗi nhiệm vụ một lần mỗi ngày; sang ngày mới làm lại', async () => {
  const { DAILY_QUESTS } = await import('../src/index.mjs');
  const { garden, user, act, tick } = setup();
  const an = user('an_nhiem_vu');
  const status = () => Object.fromEntries(garden.me(an).quests.map((item) => [item.id, `${item.done ? 'xong' : 'chưa'}/${item.claimed ? 'đã nhận' : 'chưa nhận'}`]));
  assert.deepEqual(status(), { checkin: 'xong/chưa nhận', water: 'chưa/chưa nhận', harvest: 'chưa/chưa nhận', offer: 'chưa/chưa nhận' });
  const start = garden.me(an).coins;
  const reward = (id) => DAILY_QUESTS.find((item) => item.id === id).reward;
  // Điểm danh: nhận ngay; nhận lần hai bị từ chối, xu không đổi.
  const checkin = act(an, 'claim', { quest: 'checkin' });
  assert.equal(checkin.ok, true);
  assert.equal(checkin.me.coins, start + reward('checkin'));
  assert.equal(act(an, 'claim', { quest: 'checkin' }).code, 'QUEST_CLAIMED');
  assert.equal(act(an, 'claim', { quest: 'water' }).code, 'QUEST_NOT_DONE');
  assert.equal(act(an, 'claim', { quest: 'bau_cua' }).code, 'INVALID');
  // Tưới, hái, dâng quả rồi nhận.
  act(an, 'buy', { plantType: 'apple', quantity: 1 });
  act(an, 'plant', { plotId: 3, plantType: 'apple' });
  for (let watering = 0; watering < 3; watering += 1) {
    act(an, 'water', { plotId: 3 });
    if (watering < 2) tick(WATER_INTERVAL_MS);
  }
  act(an, 'harvest', { plotId: 3 });
  act(an, 'offer', { plantType: 'apple', quantity: 1 });
  for (const quest of ['water', 'harvest', 'offer']) assert.equal(act(an, 'claim', { quest }).ok, true, quest);
  // Hai lần chờ tưới 8 giờ đã sang ngày mới theo giờ California: điểm danh của ngày mới lại nhận được.
  assert.deepEqual(Object.values(status()), ['xong/chưa nhận', 'xong/đã nhận', 'xong/đã nhận', 'xong/đã nhận']);
  assert.equal(act(an, 'claim', { quest: 'checkin' }).ok, true);
  const history = garden.history(an).filter((item) => item.kind === 'quest');
  assert.ok(history.length >= 1, 'nhận xu nhiệm vụ được ghi sổ');
  // Sang ngày mới (theo múi giờ vườn): điểm danh lại được, tưới/hái/dâng phải làm lại.
  tick(24 * 60 * 60 * 1_000);
  assert.deepEqual(status(), { checkin: 'xong/chưa nhận', water: 'chưa/chưa nhận', harvest: 'chưa/chưa nhận', offer: 'chưa/chưa nhận' });
  assert.equal(act(an, 'claim', { quest: 'checkin' }).ok, true);
});
