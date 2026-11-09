import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { createCommunityProjectStore } from '@chanh-dien/community-project';
import {
  RPS_STALE_MS, rpsPrize,
  BOT_PLOT_LIMIT, botAccountId, CHORE_REWARD_COINS, cleanGraveName, GRAVE_COUNT, GRAVE_PRICE, GRAVE_TTL_MS, CHORE_REWARD_DAILY_LIMIT, createGardenStore, FRUITS_PER_CROP,
  gardenDay, PLANTS, PLOT_COUNT, STARTING_COINS, WATER_INTERVAL_MS, WILT_AFTER_MS,
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
  assert.equal(act(binh, 'plant', { plotId: 51, plantType: 'apple' }).code, 'INVALID');
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

test('Tài Xỉu: trả thưởng theo bảng (tài/xỉu thua khi ra bộ ba, tổng điểm, mặt xúc xắc)', async () => {
  const { settleTaiXiu, TAI_XIU_SPOTS } = await import('../src/index.mjs');
  assert.equal(TAI_XIU_SPOTS.length, 22);
  // 1 + 2 + 4 = 7: Xỉu ăn 1:1, tổng 7 ăn 1:12, mặt 4 ra 1 con.
  assert.deepEqual(settleTaiXiu({ xiu: 10, tai: 10, t7: 2, t8: 5, f4: 3, f6: 4 }, [1, 2, 4]), {
    staked: 34, payout: 20 + 26 + 6, net: 52 - 34, sum: 7, triple: false,
  });
  // Bộ ba 6-6-6 (18 điểm): Tài vẫn thua; mặt 6 ăn 1:3.
  assert.deepEqual(settleTaiXiu({ tai: 10, f6: 2 }, [6, 6, 6]), { staked: 12, payout: 8, net: -4, sum: 18, triple: true });
  // Bộ ba 2-2-2 = 6 điểm: Xỉu thua nhưng tổng 6 vẫn ăn 1:14.
  assert.equal(settleTaiXiu({ xiu: 10, t6: 1 }, [2, 2, 2]).payout, 15);
  assert.equal(settleTaiXiu({ t17: 1 }, [6, 6, 5]).payout, 51, '17 điểm ăn 1:50');
  assert.equal(settleTaiXiu({ tai: 5 }, [3, 4, 4]).payout, 10, '11 điểm là Tài');
});

test('Tài Xỉu chung bảng cược với Bầu Cua: ô cược theo mã ván, chốt ván ghi sổ tai_xiu', () => {
  const { garden, user, accounts } = setup();
  const an = user('an_tai_xiu');
  const coins = (id) => garden.me(id).coins;
  const round = 'tx-taixiu-1-1-1-abcd';
  const stake = (spot, amount, key) => garden.stakeBauCua({ accountId: an, roundId: round, animal: spot, amount, key });
  assert.equal(stake('cua', 5, 'tx-stake-0001').code, 'INVALID', 'linh vật Bầu Cua không phải ô Tài Xỉu');
  assert.equal(garden.stakeBauCua({ accountId: an, roundId: 'bc-game-1-1-1-abcd', animal: 'tai', amount: 5, key: 'tx-stake-0002' }).code, 'INVALID', 'ô Tài Xỉu không cược vào ván Bầu Cua');
  assert.deepEqual(stake('tai', 10, 'tx-stake-0003').mine, { tai: 10 });
  assert.deepEqual(stake('t12', 2, 'tx-stake-0004').mine, { tai: 10, t12: 2 });
  assert.equal(coins(an), STARTING_COINS - 12);
  assert.equal(garden.settleBauCuaRound({ roundId: round, dice: ['nai', 'nai', 'nai'] }).code, 'INVALID', 'xúc xắc Tài Xỉu là số 1–6');
  const settled = garden.settleBauCuaRound({ roundId: round, dice: [3, 4, 5] });
  // 12 điểm: Tài ăn 1:1 (20), tổng 12 ăn 1:6 (14).
  assert.deepEqual(settled.results.map(({ staked, payout, net }) => [staked, payout, net]), [[12, 34, 22]]);
  assert.equal(coins(an), STARTING_COINS + 22);
  assert.equal(accounts.database.prepare('SELECT game FROM game_rounds WHERE account_id = ?').get(an).game, 'tai_xiu');
});

test('Lô Tô: vé 3 × 9 đúng luật — mỗi hàng 5 số, cột nào cũng có số, số đúng khoảng của cột và tăng dần, không trùng', async () => {
  const { createLottoTicket, lottoRowComplete } = await import('../src/index.mjs');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = createLottoTicket();
    assert.equal(rows.length, 3);
    for (const row of rows) assert.equal(row.filter(Boolean).length, 5);
    const all = rows.flat().filter(Boolean);
    assert.equal(new Set(all).size, 15);
    for (let column = 0; column < 9; column += 1) {
      const values = rows.map((row) => row[column]).filter(Boolean);
      assert.ok(values.length >= 1, `cột ${column} có số`);
      const [low, high] = [column === 0 ? 1 : column * 10, column === 8 ? 90 : column * 10 + 9];
      assert.ok(values.every((value) => value >= low && value <= high));
      assert.deepEqual(values, [...values].sort((a, b) => a - b));
    }
  }
  const rows = [[1, 0, 21, 0, 45, 0, 63, 0, 88], [0, 14, 0, 37, 0, 52, 0, 71, 80], [7, 0, 29, 0, 0, 58, 66, 0, 85]];
  assert.equal(lottoRowComplete(rows, 0, [1, 21, 45, 63]), false, 'mới 4 số: đợi');
  assert.equal(lottoRowComplete(rows, 0, [1, 21, 45, 63, 88, 5]), true);
  assert.equal(lottoRowComplete(rows, 3, [1, 21, 45, 63, 88]), false, 'hàng không có');
});

test('Lô Tô: mua tối đa 2 vé (10 xu/vé) + tự đánh dấu 5 xu; kinh hợp lệ chia quỹ sau phế 10%; không ai kinh thì hoàn tiền', async () => {
  const { LOTTO_STALE_MS, lottoRowComplete } = await import('../src/index.mjs');
  const { garden, user, tick, accounts } = setup();
  const an = user('an_loto');
  const binh = user('binh_loto');
  const cuc = user('cuc_loto');
  const coins = (id) => garden.me(id).coins;
  const round = 'lt-loto-1-1-1-abcd';
  const buy = (accountId, count, autoMark, key) => garden.buyLotto({ accountId, roundId: round, count, autoMark, key });

  assert.equal(buy(an, 3, false, 'lt-buy-an-01').code, 'INVALID', 'tối đa 2 vé mỗi lần');
  assert.equal(buy(an, -1, false, 'lt-buy-an-02').code, 'INVALID');
  assert.equal(buy(an, 0, false, 'lt-buy-an-03').code, 'INVALID', 'không mua gì');
  const first = buy(an, 1, true, 'lt-buy-an-04');
  assert.equal(first.tickets.length, 1);
  assert.equal(first.autoMark, true);
  assert.equal(coins(an), STARTING_COINS - 15);
  assert.equal(buy(an, 1, true, 'lt-buy-an-04').replayed, true, 'gửi lại cùng khóa không trừ hai lần');
  assert.equal(coins(an), STARTING_COINS - 15);
  const second = buy(an, 1, true, 'lt-buy-an-05');
  assert.equal(second.tickets.length, 2);
  assert.equal(coins(an), STARTING_COINS - 25, 'đã có tự đánh dấu thì không trả lần hai');
  assert.equal(buy(an, 1, false, 'lt-buy-an-06').code, 'TICKET_LIMIT');
  buy(binh, 2, false, 'lt-buy-binh-1');
  buy(cuc, 1, false, 'lt-buy-cuc-01');
  accounts.database.prepare('UPDATE coin_wallets SET balance = 3 WHERE account_id = ?').run(cuc);
  assert.equal(buy(cuc, 1, false, 'lt-buy-cuc-02').code, 'INSUFFICIENT_COINS');

  // An và Bình cùng kinh một nhịp (vé 1 hàng 0); Cúc kinh sai (vé chưa đủ số) — bị loại.
  const ticketOf = (accountId, no) => JSON.parse(accounts.database.prepare('SELECT numbers FROM lotto_tickets WHERE round_id = ? AND account_id = ? AND ticket_no = ?').get(round, accountId, no).numbers);
  const called = [...new Set([...ticketOf(an, 1)[0], ...ticketOf(binh, 1)[0]].filter(Boolean))];
  assert.ok(lottoRowComplete(ticketOf(an, 1), 0, called));
  const before = { an: coins(an), binh: coins(binh), cuc: coins(cuc) };
  const settled = garden.settleLottoRound({
    roundId: round, called,
    claims: [{ accountId: an, ticket: 1, row: 0 }, { accountId: binh, ticket: 1, row: 0 }, { accountId: an, ticket: 1, row: 0 }, { accountId: cuc, ticket: 1, row: 2 }],
  });
  // Quỹ = 5 vé × 10 = 50; sau phế 10% = 45; 2 vé kinh → mỗi vé 22 (lẻ 1 xu vào phế).
  assert.deepEqual([settled.pool, settled.prize, settled.share, settled.winners.length], [50, 45, 22, 2]);
  assert.equal(coins(an), before.an + 22);
  assert.equal(coins(binh), before.binh + 22);
  assert.equal(coins(cuc), before.cuc, 'kinh sai không được gì');
  assert.equal(settled.results.reduce((sum, item) => sum + item.payout, 0) <= 50, true, 'hệ thống không trả quá quỹ');
  assert.equal(garden.settleLottoRound({ roundId: round, called, claims: [] }).replayed, true);
  assert.equal(buy(binh, 0, true, 'lt-buy-binh-2').code, 'ROUND_CLOSED');

  // Ván không ai kinh: hoàn đủ tiền vé + tự đánh dấu.
  const empty = 'lt-loto-1-1-2-abcd';
  const startAn = coins(an);
  garden.buyLotto({ accountId: an, roundId: empty, count: 2, autoMark: true, key: 'lt-buy-an-20' });
  const refunded = garden.settleLottoRound({ roundId: empty, called: [1, 2, 3], claims: [] });
  assert.equal(refunded.void, true);
  assert.equal(coins(an), startAn);

  // Bot kinh cùng nhịp được chia quỹ như người thắng (phần bot không vào ví ai); chỉ bot kinh thì người chơi thua vé.
  const withBot = 'lt-loto-1-1-4-abcd';
  garden.buyLotto({ accountId: an, roundId: withBot, count: 1, autoMark: false, key: 'lt-buy-an-40' });
  garden.buyLotto({ accountId: binh, roundId: withBot, count: 1, autoMark: false, key: 'lt-buy-binh-40' });
  const anRow = accounts.database.prepare('SELECT numbers FROM lotto_tickets WHERE round_id = ? AND account_id = ?').get(withBot, an).numbers;
  const startBoth = { an: coins(an), binh: coins(binh) };
  const shared = garden.settleLottoRound({ roundId: withBot, called: JSON.parse(anRow)[0].filter(Boolean), claims: [{ accountId: an, ticket: 1, row: 0 }], botWinners: 1 });
  // Quỹ 20, sau phế 18, hai người kinh (An + 1 bot) → mỗi phần 9.
  assert.deepEqual([shared.void, shared.share, shared.botWinners], [undefined, 9, 1]);
  assert.deepEqual([coins(an) - startBoth.an, coins(binh) - startBoth.binh], [9, 0]);
  const botOnly = 'lt-loto-1-1-5-abcd';
  garden.buyLotto({ accountId: an, roundId: botOnly, count: 1, autoMark: false, key: 'lt-buy-an-50' });
  const beforeBotOnly = coins(an);
  const lost = garden.settleLottoRound({ roundId: botOnly, called: [1, 2, 3], claims: [], botWinners: 2 });
  assert.equal(lost.void, undefined, 'chỉ bot kinh: ván vẫn chốt, không hoàn');
  assert.equal(coins(an), beforeBotOnly);
  assert.equal(garden.settleLottoRound({ roundId: 'lt-loto-1-1-6-abcd', called: [], claims: [], botWinners: 21 }).code, 'INVALID');
  // Vé bot góp quỹ: 1 vé thật + 54 vé bot = quỹ 550, sau phế 495; An kinh một mình ăn trọn 495.
  const fullPool = 'lt-loto-1-1-7-abcd';
  garden.buyLotto({ accountId: an, roundId: fullPool, count: 1, autoMark: false, key: 'lt-buy-an-70' });
  const anTicket = JSON.parse(accounts.database.prepare('SELECT numbers FROM lotto_tickets WHERE round_id = ? AND account_id = ?').get(fullPool, an).numbers);
  const beforeFull = coins(an);
  const big = garden.settleLottoRound({ roundId: fullPool, called: anTicket[0].filter(Boolean), claims: [{ accountId: an, ticket: 1, row: 0 }], botTickets: 54 });
  assert.deepEqual([big.pool, big.prize, big.share], [550, 495, 495]);
  assert.equal(coins(an) - beforeFull, 495);
  assert.equal(garden.settleLottoRound({ roundId: 'lt-loto-1-1-8-abcd', called: [], claims: [], botTickets: 1_001 }).code, 'INVALID');

  // Ván treo (máy realtime chết): quá hạn thì tự hoàn.
  const stale = 'lt-loto-1-1-3-abcd';
  garden.buyLotto({ accountId: binh, roundId: stale, count: 1, autoMark: false, key: 'lt-buy-binh-30' });
  const startBinh = coins(binh);
  tick(LOTTO_STALE_MS + 1);
  assert.equal(garden.refundStaleLotto(), 1);
  assert.equal(coins(binh), startBinh + 10);
});

test('vườn 50 luống; bot giữ tối đa 30% luống, tự tưới rồi hái luống của bot, không đụng luống người chơi', () => {
  const { garden, user, act, tick } = setup();
  assert.equal(PLOT_COUNT, 50);
  assert.equal(BOT_PLOT_LIMIT, 15);
  assert.equal(garden.snapshot().plots.length, 50);
  const an = user('an_lac');
  act(an, 'buy', { plantType: 'apple', quantity: 1 });
  assert.equal(act(an, 'plant', { plotId: 50, plantType: 'apple' }).ok, true);
  // Gieo tới trần: task trả plant cho tới khi bot giữ đủ BOT_PLOT_LIMIT luống, sau đó không còn việc gieo.
  const names = ['Minh Tâm', 'Huệ An', 'Diệu Hạnh'];
  // Hạt vừa gieo tưới được ngay nên task xen kẽ gieo / tưới; tưới trước khi gieo luống mới.
  for (let index = 0; garden.botPlots().length < BOT_PLOT_LIMIT; index += 1) {
    assert.ok(index < BOT_PLOT_LIMIT * 2, 'phải đủ trần sau ít lượt');
    const name = names[index % names.length];
    const task = garden.botTask(name);
    assert.equal(task.action, index % 2 ? 'water' : 'plant');
    assert.notEqual(task.plotId, 50, 'không gieo / tưới luống đã có người');
    assert.equal(garden.botAct(name, task).ok, true);
  }
  assert.equal(garden.botPlots().length, BOT_PLOT_LIMIT);
  assert.equal(garden.botTask('Minh Tâm')?.action, 'water', 'luống cuối vừa gieo cần tưới');
  assert.equal(garden.botAct('Minh Tâm', garden.botTask('Minh Tâm')).ok, true);
  assert.equal(garden.botTask('Minh Tâm'), null, 'đủ trần, tưới xong: chưa có việc tới mốc tưới sau');
  const empty = garden.snapshot().plots.find((plot) => !plot.crop).id;
  assert.equal(garden.botAct('Minh Tâm', { action: 'plant', plotId: empty, plantType: 'apple' }).code, 'BOT_LIMIT');
  // Bot không tưới / hái luống của người chơi.
  assert.equal(garden.botAct('Minh Tâm', { action: 'water', plotId: 50 }).code, 'NOT_BOT_PLOT');
  // Tưới thêm 2 lần (cách 8 giờ) cho mọi luống bot là đủ 3 lần, rồi hái.
  tick(WATER_INTERVAL_MS);
  for (let round = 0; round < 2; round += 1) {
    for (;;) {
      const task = garden.botTask('Huệ An');
      if (task?.action !== 'water') break;
      assert.equal(garden.botAct('Huệ An', task).ok, true);
    }
    tick(WATER_INTERVAL_MS);
  }
  const ripe = garden.botTask('Huệ An');
  assert.equal(ripe.action, 'harvest');
  const harvested = garden.botAct('Huệ An', ripe);
  assert.equal(harvested.harvested, FRUITS_PER_CROP, 'bot hái thay chủ luống là bot: hái hết');
  assert.equal(harvested.plots[0].crop, null);
  assert.equal(garden.botPlots().length, BOT_PLOT_LIMIT - 1);
  // Luống người chơi vẫn còn nguyên của người chơi.
  assert.equal(garden.plot(50).crop.ownerName, 'an_lac');
  assert.match(botAccountId('Minh Tâm'), /^gbot-[0-9a-f]{20}$/);
  assert.equal(garden.botTask(''), null);
  assert.equal(garden.botAct('Minh Tâm', { action: 'plant', plotId: 51, plantType: 'apple' }).code, 'INVALID');
});

test('nâng cấp từ vườn 10 luống: giữ vụ cũ, mở thêm luống 11–50, khóa ngoại vẫn bật', () => {
  const { accounts, garden, user, act, now } = setup();
  const an = user('an_lac');
  act(an, 'buy', { plantType: 'peach', quantity: 2 });
  act(an, 'plant', { plotId: 3, plantType: 'peach' });
  const db = accounts.database;
  // Dựng lại đúng lược đồ cũ: bảng luống giới hạn 1–10, phiên bản lược đồ trước bản mở rộng.
  db.exec(`PRAGMA foreign_keys = OFF;
    CREATE TABLE garden_plots_old (id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 10), created_at INTEGER NOT NULL);
    INSERT INTO garden_plots_old SELECT id, created_at FROM garden_plots WHERE id <= 10;
    DROP TABLE garden_plots;
    ALTER TABLE garden_plots_old RENAME TO garden_plots;
    PRAGMA foreign_keys = ON;`);
  // Lùi về phiên bản ngay trước bản mở rộng 50 luống (sau nó còn bản thêm Khu tưởng niệm, hai bản Linh thú, bản Oẳn Tù Tì và bản tiêu xu trong phòng).
  db.prepare("UPDATE garden_meta SET value = CAST(value - 6 AS TEXT) WHERE key = 'schema_version'").run();
  assert.throws(() => db.prepare('INSERT INTO garden_plots (id, created_at) VALUES (11, 1)').run());
  const upgraded = createGardenStore({ db, now, timeZone: 'America/Los_Angeles' });
  assert.equal(upgraded.plot(3).crop.ownerName, 'an_lac');
  assert.equal(upgraded.snapshot().plots.length, 50);
  assert.equal(upgraded.perform(an, 'plant', { plotId: 42, plantType: 'peach' }, 'key-upgrade-1').ok, true);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(garden.plot(42).crop.ownerName, 'an_lac');
});

test('khu tưởng niệm: đắp mộ trừ 100 xu, giữ 24 giờ rồi ô trống lại; ô đang có mộ, thiếu xu, gửi lại cùng khóa', () => {
  const { garden, user, tick } = setup();
  const an = user('an_lac');
  const binh = user('binh_an');
  garden.adjustCoins({ accountId: an, amount: 200, key: 'grant-memorial-1' });
  const coins = garden.me(an).coins;
  assert.equal(garden.buildGrave(an, { slot: 5, name: 'Ông Ba' }, 'short').code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(garden.buildGrave(an, { slot: GRAVE_COUNT + 1, name: 'Ông Ba' }, 'grave-key-0001').code, 'INVALID');
  assert.equal(garden.buildGrave(an, { slot: 5, name: '   ' }, 'grave-key-0001').code, 'INVALID');
  const built = garden.buildGrave(an, { slot: 5, name: '  Ông   Ba\u200b ' }, 'grave-key-0001');
  assert.equal(built.ok, true);
  assert.equal(built.coins, coins - GRAVE_PRICE);
  assert.deepEqual(built.graves.map(({ slot, grave }) => [slot, grave.name, grave.builderName, grave.expiresAt - grave.builtAt]), [[5, 'Ông Ba', 'an_lac', GRAVE_TTL_MS]]);
  assert.deepEqual(garden.buildGrave(an, { slot: 5, name: 'Ông Ba' }, 'grave-key-0001'), { ...built, replayed: true }, 'gửi lại không trừ hai lần');
  assert.equal(garden.me(an).coins, coins - GRAVE_PRICE);
  assert.equal(garden.history(an)[0].kind, 'memorial');
  // Ô đã có mộ: không trừ xu. Thiếu xu: từ chối.
  garden.adjustCoins({ accountId: binh, amount: 100, key: 'grant-memorial-2' });
  const taken = garden.buildGrave(binh, { slot: 5, name: 'Bà Tư' }, 'grave-key-0002');
  assert.equal(taken.code, 'GRAVE_TAKEN');
  assert.equal(taken.graves[0].grave.name, 'Ông Ba');
  const poor = user('chi_kha');
  assert.equal(garden.buildGrave(poor, { slot: 6, name: 'Bà Tư' }, 'grave-key-0003').code, 'INSUFFICIENT_COINS');
  assert.deepEqual(garden.graves().map((item) => item.slot), [5]);
  // Hết 24 giờ: mộ biến mất, ô đắp lại được.
  tick(GRAVE_TTL_MS);
  assert.deepEqual(garden.graves(), []);
  assert.equal(garden.buildGrave(binh, { slot: 5, name: 'Bà Tư' }, 'grave-key-0004').ok, true);
  // Quản trị gỡ: ô trống, không hoàn xu.
  const before = garden.me(binh).coins;
  assert.deepEqual(garden.removeGrave(5, 'telegram'), { ok: true, slot: 5, name: 'Bà Tư', builderName: 'binh_an' });
  assert.deepEqual(garden.graves(), []);
  assert.equal(garden.me(binh).coins, before);
  assert.equal(garden.removeGrave(5).code, 'NOT_FOUND');
  assert.equal(cleanGraveName('x'.repeat(25)), '');
  assert.equal(cleanGraveName('🌸'.repeat(24)), '🌸'.repeat(24), 'đếm theo ký tự, không theo đơn vị UTF-16');
});

test('oẳn tù tì: hai người cùng cọc, người thắng nhận cả cọc trừ 5% phế; gửi lại cùng khóa / chốt lại không trừ, trả hai lần', () => {
  const { garden, user } = setup();
  const an = user('an_lac');
  const binh = user('binh_an');
  const coins = garden.me(an).coins;
  const match = 'rp-oantuti-1-1-1-abcd';
  assert.equal(rpsPrize(50), 95);
  assert.equal(rpsPrize(10), 19);
  assert.equal(garden.stakeRps({ accountId: an, matchId: match, amount: 30, key: 'rps-key-0001' }).code, 'INVALID', 'mức cược không có');
  const staked = garden.stakeRps({ accountId: an, matchId: match, amount: 50, key: 'rps-key-0001' });
  assert.deepEqual(staked, { ok: true, coins: coins - 50 });
  assert.equal(garden.stakeRps({ accountId: an, matchId: match, amount: 50, key: 'rps-key-0001' }).replayed, true);
  assert.equal(garden.me(an).coins, coins - 50, 'gửi lại không trừ hai lần');
  assert.equal(garden.stakeRps({ accountId: an, matchId: match, amount: 50, key: 'rps-key-0002' }).code, 'STAKE_LIMIT', 'một cọc / người / trận');
  assert.equal(garden.stakeRps({ accountId: binh, matchId: match, amount: 20, key: 'rps-key-0003' }).code, 'INVALID', 'hai cọc phải bằng nhau');
  assert.equal(garden.stakeRps({ accountId: binh, matchId: match, amount: 50, key: 'rps-key-0004' }).ok, true);
  const third = user('chi_mai');
  assert.equal(garden.stakeRps({ accountId: third, matchId: match, amount: 50, key: 'rps-key-0005' }).code, 'INVALID', 'tối đa hai người');
  assert.equal(garden.settleRps({ matchId: match, winner: third, bot: false }).code, 'INVALID', 'người thắng phải có cọc');
  assert.equal(garden.settleRps({ matchId: match, winner: binh, bot: true }).code, 'INVALID', 'trận hai người không phải trận bot');
  const settled = garden.settleRps({ matchId: match, winner: binh, bot: false });
  assert.equal(settled.ok, true);
  assert.deepEqual(settled.results.map(({ accountId, net }) => [accountId, net]), [[an, -50], [binh, 45]]);
  assert.equal(garden.settleRps({ matchId: match, winner: binh, bot: false }).replayed, true);
  assert.equal(garden.me(binh).coins, coins + 45);
  assert.equal(garden.stakeRps({ accountId: third, matchId: match, amount: 50, key: 'rps-key-0006' }).code, 'ROUND_CLOSED');
});

test('oẳn tù tì với bot: thắng nhận cọc + phần của bot trừ phế, thua mất cọc; hòa / hủy và trận treo thì hoàn cọc', () => {
  const { garden, user, tick } = setup();
  const an = user('an_lac');
  const coins = garden.me(an).coins;
  garden.stakeRps({ accountId: an, matchId: 'rp-bot-win-1', amount: 20, key: 'rps-bot-0001' });
  assert.equal(garden.settleRps({ matchId: 'rp-bot-win-1', winner: an, bot: false }).code, 'INVALID', 'một cọc mà không phải trận bot');
  assert.equal(garden.settleRps({ matchId: 'rp-bot-win-1', winner: an, bot: true }).results[0].net, 18);
  garden.stakeRps({ accountId: an, matchId: 'rp-bot-lose-1', amount: 20, key: 'rps-bot-0002' });
  assert.equal(garden.settleRps({ matchId: 'rp-bot-lose-1', winner: 'bot', bot: true }).results[0].net, -20);
  garden.stakeRps({ accountId: an, matchId: 'rp-bot-draw-1', amount: 20, key: 'rps-bot-0003' });
  const refund = garden.settleRps({ matchId: 'rp-bot-draw-1', winner: null, bot: true });
  assert.equal(refund.void, true);
  assert.equal(refund.results[0].net, 0);
  assert.equal(garden.me(an).coins, coins - 2);
  garden.stakeRps({ accountId: an, matchId: 'rp-stale-1', amount: 10, key: 'rps-bot-0004' });
  tick(RPS_STALE_MS + 1);
  assert.equal(garden.refundStaleRps(), 1);
  assert.equal(garden.me(an).coins, coins - 2);
  assert.equal(garden.settleRps({ matchId: 'rp-stale-1', winner: an, bot: true }).void, true, 'trận đã hoàn không trả thưởng nữa');
  assert.equal(garden.me(an).coins, coins - 2);
  assert.deepEqual(garden.history(an).slice(0, 2).map((row) => row.kind), ['game_refund', 'game_bet']);
});

test('dọn ván treo theo từng khoảng thời gian: ván còn cược mới chưa bị hoàn, quá hạn kể từ lần cược cuối thì hoàn', () => {
  const { garden, user, tick } = setup();
  const an = user('an_lac');
  const coins = garden.me(an).coins;
  const round = 'bc-stale-window-1';
  garden.stakeBauCua({ accountId: an, roundId: round, animal: 'ca', amount: 5, key: 'stale-win-0001' });
  tick(2 * 60_000);
  garden.stakeBauCua({ accountId: an, roundId: round, animal: 'tom', amount: 5, key: 'stale-win-0002' });
  tick(2 * 60_000);
  // Cược đầu đã quá 3 phút nhưng cược cuối mới 2 phút: ván chưa treo.
  assert.equal(garden.refundStaleBauCua(), 0);
  tick(2 * 60_000);
  assert.equal(garden.refundStaleBauCua(), 1, 'cược cuối đã quá hạn: hoàn cả ván');
  assert.equal(garden.me(an).coins, coins);
  assert.equal(garden.refundStaleBauCua(), 0, 'không hoàn hai lần');
});

test('tiêu xu trong phòng (mở phim): trừ một lần theo khóa, thiếu xu không ghi gì, hoàn tối đa một lần', () => {
  const { garden, user } = setup();
  const an = user('an_lac');
  const coins = garden.me(an).coins;
  const pay = (key, amount = 20) => garden.spendCoins({ accountId: an, amount, reason: 'cinema_video', ref: 'dQw4w9WgXcQ', key });
  assert.equal(garden.spendCoins({ accountId: an, amount: 20, reason: 'other', ref: 'x', key: 'video-key-0001' }).code, 'INVALID');
  assert.deepEqual(pay('video-key-0001'), { ok: true, amount: 20, coins: coins - 20 });
  assert.equal(pay('video-key-0001').replayed, true);
  assert.equal(garden.me(an).coins, coins - 20, 'gửi lại không trừ hai lần');
  assert.equal(pay('video-key-0002', coins).code, 'INSUFFICIENT_COINS');
  assert.equal(garden.me(an).coins, coins - 20);
  assert.equal(garden.refundCoins({ accountId: an, key: 'video-key-9999' }).code, 'UNKNOWN_SPEND');
  assert.deepEqual(garden.refundCoins({ accountId: an, key: 'video-key-0001' }), { ok: true, amount: 20, coins });
  assert.equal(garden.refundCoins({ accountId: an, key: 'video-key-0001' }).replayed, true);
  assert.equal(garden.me(an).coins, coins, 'hoàn đúng một lần');
  assert.equal(pay('video-key-0001').code, 'REFUNDED', 'khóa đã hoàn không trừ lại');
  assert.deepEqual(garden.history(an).slice(0, 2).map((row) => row.kind), ['room_refund', 'room_spend']);
});

test('thưởng trốn tìm: 10 xu mỗi lần thắng, tối đa 5 lần một ngày, gửi lại cùng khóa không trả hai lần', () => {
  const { garden, user, tick } = setup();
  const an = user('an_lac');
  const coins = garden.me(an).coins;
  const first = garden.rewardHideSeek({ accountId: an, key: 'hs-round-0001' });
  assert.deepEqual([first.reward, first.coins, first.count, first.limit], [10, coins + 10, 1, 5]);
  assert.equal(garden.rewardHideSeek({ accountId: an, key: 'hs-round-0001' }).replayed, true);
  assert.equal(garden.me(an).coins, coins + 10);
  for (let round = 2; round <= 5; round += 1) garden.rewardHideSeek({ accountId: an, key: `hs-round-000${round}` });
  const capped = garden.rewardHideSeek({ accountId: an, key: 'hs-round-0006' });
  assert.deepEqual([capped.reward, capped.limited, capped.coins], [0, true, coins + 50], 'đủ 5 lần: không cộng thêm');
  tick(24 * 60 * 60 * 1_000);
  assert.equal(garden.rewardHideSeek({ accountId: an, key: 'hs-round-0007' }).reward, 10, 'ngày mới nhận lại được');
  assert.equal(garden.rewardHideSeek({ accountId: an, key: 'short' }).code, 'IDEMPOTENCY_KEY_REQUIRED');
});
