import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createCommunityProjectStore } from '@chanh-dien/community-project';
import {
  CHORE_REWARD_COINS, CHORE_REWARD_DAILY_LIMIT, createGardenStore, FRUITS_PER_CROP,
  gardenDay, PLANTS, STARTING_COINS, WATER_INTERVAL_MS, WILT_AFTER_MS,
} from '../src/index.mjs';

function setup() {
  let clock = Date.parse('2026-11-03T20:00:00Z');
  const accounts = createAccountStore({ now: () => clock });
  const garden = createGardenStore({ db: accounts.database, now: () => clock, timeZone: 'America/Los_Angeles' });
  const user = (name) => accounts.register({ username: name, password: 'matkhau123', displayName: name }).account.id;
  let serial = 0;
  const act = (accountId, action, input) => garden.perform(accountId, action, input, `key-${(serial += 1).toString().padStart(6, '0')}`);
  return { accounts, garden, user, act, now: () => clock, tick: (ms) => { clock += ms; } };
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

test('công việc trong chùa: +20 xu, tối đa 3 lần mỗi loại mỗi ngày và không cộng trùng', () => {
  const { garden, user, tick } = setup();
  const an = user('an_lac');
  const rewards = Array.from({ length: CHORE_REWARD_DAILY_LIMIT }, (_, index) => garden.rewardChore({
    accountId: an, chore: 'sweep', key: `chore-sweep-${index + 1}`,
  }));
  assert.deepEqual(rewards.map((item) => [item.reward, item.count]), [[20, 1], [20, 2], [20, 3]]);
  assert.equal(garden.me(an).coins, STARTING_COINS + CHORE_REWARD_COINS * CHORE_REWARD_DAILY_LIMIT);

  const capped = garden.rewardChore({ accountId: an, chore: 'sweep', key: 'chore-sweep-4' });
  assert.deepEqual([capped.reward, capped.count, capped.limit, capped.limited], [0, 3, 3, true]);
  const replay = garden.rewardChore({ accountId: an, chore: 'sweep', key: 'chore-sweep-1' });
  assert.equal(replay.replayed, true);
  assert.equal(garden.me(an).coins, STARTING_COINS + 60);

  const other = garden.rewardChore({ accountId: an, chore: 'water', key: 'chore-water-1' });
  assert.deepEqual([other.reward, other.count], [20, 1], 'mỗi loại việc có giới hạn riêng');
  tick(24 * 60 * 60 * 1_000);
  const tomorrow = garden.rewardChore({ accountId: an, chore: 'sweep', key: 'chore-sweep-next-day' });
  assert.deepEqual([tomorrow.reward, tomorrow.count], [20, 1], 'sang ngày mới được tính lại');
  assert.equal(garden.history(an).filter((row) => row.kind === 'chore').length, 5);
  assert.equal(garden.rewardChore({ accountId: an, chore: 'gamble', key: 'chore-invalid-1' }).code, 'INVALID');
});

test('quản trị điều chỉnh xu: có lịch sử, không âm và cùng khóa không cộng hai lần', () => {
  const { garden, user } = setup();
  const an = user('an_lac');
  const added = garden.adjustCoins({ accountId: an, amount: 100, key: 'telegram-1001' });
  assert.deepEqual([added.ok, added.coins], [true, 150]);
  const replay = garden.adjustCoins({ accountId: an, amount: 100, key: 'telegram-1001' });
  assert.deepEqual([replay.replayed, replay.coins], [true, 150]);
  const removed = garden.adjustCoins({ accountId: an, amount: -20, key: 'telegram-1002' });
  assert.equal(removed.coins, 130);
  const tooMuch = garden.adjustCoins({ accountId: an, amount: -131, key: 'telegram-1003' });
  assert.deepEqual([tooMuch.ok, tooMuch.code, tooMuch.coins], [false, 'INSUFFICIENT_COINS', 130]);
  assert.deepEqual(garden.history(an).slice(0, 2).map((row) => [row.kind, row.amount]), [
    ['admin_adjustment', -20], ['admin_adjustment', 100],
  ]);
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

test('Bầu Cua chơi chung: cược trừ xu ngay, cộng dồn theo ván; chốt ván trả thưởng cả bàn một lần; ván treo thì hoàn cược', async () => {
  const { BAU_CUA_STALE_MS, settleBauCua } = await import('../src/index.mjs');
  const { garden, user, tick } = setup();
  const an = user('an_ban_chung');
  const binh = user('binh_ban_chung');
  const coins = (id) => garden.me(id).coins;
  const round = 'bc-game-1-1-1-abcd';
  const stake = (accountId, animal, amount, key) => garden.stakeBauCua({ accountId, roundId: round, animal, amount, key });
  // An: Cua 10 rồi thêm Cua 5 (cộng dồn), Tôm 5. Bình: Gà 20.
  assert.deepEqual(stake(an, 'cua', 10, 'stake-an-0001').mine, { cua: 10 });
  assert.equal(coins(an), STARTING_COINS - 10, 'trừ xu ngay khi đặt');
  const again = stake(an, 'cua', 10, 'stake-an-0001');
  assert.equal(again.replayed, true);
  assert.equal(coins(an), STARTING_COINS - 10, 'gửi lại cùng khóa không trừ hai lần');
  stake(an, 'cua', 5, 'stake-an-0002');
  assert.deepEqual(stake(an, 'tom', 5, 'stake-an-0003').mine, { cua: 15, tom: 5 });
  stake(binh, 'ga', 20, 'stake-binh-001');
  assert.equal(stake(binh, 'ga', 999, 'stake-binh-002').code, 'STAKE_LIMIT');
  assert.equal(stake(binh, 'ga', 40, 'stake-binh-003').code, 'INSUFFICIENT_COINS');
  assert.equal(stake(binh, 'rong', 5, 'stake-binh-004').code, 'INVALID');
  assert.equal(garden.stakeBauCua({ accountId: an, roundId: 'khong-hop-le', animal: 'ga', amount: 5, key: 'stake-an-0009' }).code, 'INVALID');
  // Hủy cược trong pha đặt: hoàn đủ xu, gửi lại cùng khóa không hoàn hai lần; đặt lại được.
  const cancelled = garden.unstakeBauCua({ accountId: an, roundId: round, key: 'unstake-an-01' });
  assert.deepEqual([cancelled.refunded, cancelled.removed], [20, { cua: 15, tom: 5 }]);
  assert.equal(coins(an), STARTING_COINS);
  assert.equal(garden.unstakeBauCua({ accountId: an, roundId: round, key: 'unstake-an-01' }).replayed, true);
  assert.equal(coins(an), STARTING_COINS, 'không hoàn hai lần');
  stake(an, 'cua', 15, 'stake-an-0004');
  stake(an, 'tom', 5, 'stake-an-0005');
  // Lắc ra Cua, Cua, Gà: An Cua 15 → nhận 15 + 30, Tôm mất; Bình Gà 20 → nhận 20 + 20.
  const settled = garden.settleBauCuaRound({ roundId: round, dice: ['cua', 'cua', 'ga'] });
  assert.equal(settled.ok, true);
  const byId = Object.fromEntries(settled.results.map((item) => [item.accountId, item]));
  assert.deepEqual([byId[an].staked, byId[an].payout, byId[an].net], [20, 45, 25]);
  assert.deepEqual([byId[binh].staked, byId[binh].payout, byId[binh].net], [20, 40, 20]);
  assert.equal(coins(an), STARTING_COINS + 25);
  assert.equal(coins(binh), STARTING_COINS + 20);
  assert.equal(garden.settleBauCuaRound({ roundId: round, dice: ['nai', 'nai', 'nai'] }).replayed, true, 'chốt lại không trả hai lần');
  assert.equal(coins(an), STARTING_COINS + 25);
  assert.equal(stake(an, 'ca', 5, 'stake-an-0010').code, 'ROUND_CLOSED', 'ván đã chốt không nhận cược');
  assert.equal(garden.unstakeBauCua({ accountId: binh, roundId: round, key: 'unstake-binh-1' }).code, 'ROUND_CLOSED', 'ván đã chốt không hủy được');
  // Ván treo (máy realtime chết, không ai chốt): quá hạn thì hoàn cược, chốt muộn bị từ chối.
  const lost = 'bc-game-1-1-2-efgh';
  garden.stakeBauCua({ accountId: an, roundId: lost, animal: 'nai', amount: 7, key: 'stake-an-0011' });
  assert.equal(coins(an), STARTING_COINS + 18);
  tick(BAU_CUA_STALE_MS + 1_000);
  assert.equal(garden.refundStaleBauCua(), 1);
  assert.equal(coins(an), STARTING_COINS + 25, 'hoàn đủ cược');
  assert.equal(garden.settleBauCuaRound({ roundId: lost, dice: ['nai', 'ga', 'ca'] }).code, 'ROUND_VOID');
  assert.ok(garden.history(an).some((item) => item.kind === 'game_refund' && item.amount === 7));
  // Luật trả thưởng: trúng 1/2/3 lần, không trúng.
  assert.equal(settleBauCua({ nai: 10 }, ['nai', 'ga', 'ca']).payout, 20);
  assert.equal(settleBauCua({ ga: 10 }, ['ga', 'ga', 'ga']).payout, 40);
  assert.equal(settleBauCua({ bau: 10 }, ['ga', 'ga', 'ca']).payout, 0);
});

test('nhiệm vụ hằng ngày: làm xong mới nhận được, mỗi nhiệm vụ một lần mỗi ngày; sang ngày mới làm lại', async () => {
  const { DAILY_QUESTS } = await import('../src/index.mjs');
  const { accounts, garden, user, act, now, tick } = setup();
  const an = user('an_nhiem_vu');
  const community = createCommunityProjectStore({ db: accounts.database, now });
  const status = () => Object.fromEntries(garden.me(an).quests.map((item) => [item.id, `${item.done ? 'xong' : 'chưa'}/${item.claimed ? 'đã nhận' : 'chưa nhận'}`]));
  assert.deepEqual(status(), {
    checkin: 'xong/chưa nhận', plant: 'chưa/chưa nhận', water: 'chưa/chưa nhận', harvest: 'chưa/chưa nhận',
    offer: 'chưa/chưa nhận', bodhi: 'chưa/chưa nhận', lotus: 'chưa/chưa nhận',
  });
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
  assert.equal(act(an, 'claim', { quest: 'plant' }).ok, true);
  for (let watering = 0; watering < 3; watering += 1) {
    act(an, 'water', { plotId: 3 });
    if (watering < 2) tick(WATER_INTERVAL_MS);
  }
  act(an, 'harvest', { plotId: 3 });
  act(an, 'offer', { plantType: 'apple', quantity: 1 });
  // Đến đây đã sang ngày mới: gieo lại và góp vào hai công trình để server ghi nhận đúng ngày hiện tại.
  act(an, 'buy', { plantType: 'apple', quantity: 1 });
  act(an, 'plant', { plotId: 3, plantType: 'apple' });
  assert.equal(community.contribute(an, 'bodhi-global-1', 'dig', 'quest-bodhi-01').ok, true);
  assert.equal(community.contribute(an, 'lotus-global-1', 'dig', 'quest-lotus-01').ok, true);
  for (const quest of ['plant', 'water', 'harvest', 'offer', 'bodhi', 'lotus']) assert.equal(act(an, 'claim', { quest }).ok, true, quest);
  // Hai lần chờ tưới 8 giờ đã sang ngày mới theo giờ California: điểm danh của ngày mới lại nhận được.
  assert.deepEqual(Object.values(status()), ['xong/chưa nhận', 'xong/đã nhận', 'xong/đã nhận', 'xong/đã nhận', 'xong/đã nhận', 'xong/đã nhận', 'xong/đã nhận']);
  assert.equal(act(an, 'claim', { quest: 'checkin' }).ok, true);
  const history = garden.history(an).filter((item) => item.kind === 'quest');
  assert.ok(history.length >= 1, 'nhận xu nhiệm vụ được ghi sổ');
  // Sang ngày mới (theo múi giờ vườn): điểm danh lại được, tưới/hái/dâng phải làm lại.
  tick(24 * 60 * 60 * 1_000);
  assert.deepEqual(status(), {
    checkin: 'xong/chưa nhận', plant: 'chưa/chưa nhận', water: 'chưa/chưa nhận', harvest: 'chưa/chưa nhận',
    offer: 'chưa/chưa nhận', bodhi: 'chưa/chưa nhận', lotus: 'chưa/chưa nhận',
  });
  assert.equal(act(an, 'claim', { quest: 'checkin' }).ok, true);
});
