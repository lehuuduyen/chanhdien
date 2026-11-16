import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import {
  createGardenStore, FARM_ANIMALS, FARM_CROPS, FARM_HAY_PRICE, FARM_MOIST_MS, FARM_PLOTS_START, FARM_UPGRADES, farmBotFarm, farmLevel,
  farmMarketCap, farmPlotLevel, farmPlotPrice, farmPrice, farmXpFor, gardenDay, STARTING_COINS,
} from '../src/index.mjs';

const HOUR = 3_600_000;
const TZ = 'America/Los_Angeles';

function setup(start = '2026-11-03T16:00:00Z') {
  let clock = Date.parse(start);
  const accounts = createAccountStore({ now: () => clock });
  const garden = createGardenStore({ db: accounts.database, now: () => clock, timeZone: TZ });
  const user = (name) => accounts.register({ username: name, password: 'matkhau123', displayName: name }).account.id;
  let serial = 0;
  const act = (accountId, action, input) => garden.farmAction(accountId, action, input, `farm-${(serial += 1).toString().padStart(6, '0')}`);
  const db = accounts.database;
  // Đặt thẳng kinh nghiệm / xu để thử phần mở ở cấp cao.
  const setXp = (accountId, xp) => {
    garden.farm(accountId);
    db.prepare('UPDATE farm_profiles SET xp = ? WHERE account_id = ?').run(xp, accountId);
  };
  const setCoins = (accountId, coins) => {
    garden.farm(accountId);
    db.prepare('UPDATE coin_wallets SET balance = ? WHERE account_id = ?').run(coins, accountId);
  };
  const giveItem = (accountId, item, quantity) => db.prepare(`INSERT INTO farm_items (account_id, item, quantity) VALUES (?, ?, ?)
    ON CONFLICT(account_id, item) DO UPDATE SET quantity = quantity + excluded.quantity`).run(accountId, item, quantity);
  return { garden, user, act, setXp, setCoins, giveItem, db, now: () => clock, tick: (ms) => { clock += ms; } };
}

test('cấp độ, hạn mức chợ, giá mở đất: số mốc đúng như thiết kế', () => {
  assert.equal(farmXpFor(2), 20);
  assert.equal(farmXpFor(10), 900);
  assert.equal(farmLevel(0), 1);
  assert.equal(farmLevel(19), 1);
  assert.equal(farmLevel(20), 2);
  assert.equal(farmLevel(farmXpFor(30) + 99_999), 30);
  assert.equal(farmMarketCap(1), 30);
  assert.equal(farmMarketCap(30), 90);
  assert.equal(farmPlotLevel(FARM_PLOTS_START), 1);
  assert.equal(farmPlotLevel(FARM_PLOTS_START + 1), 2);
  assert.equal(farmPlotLevel(36), 30);
  assert.equal(farmPlotPrice(7), 8);
  // Giá trong ngày lệch tối đa ±15 % (làm tròn) và giống nhau cho mọi người cùng ngày.
  for (const item of ['tomato', 'watermelon', 'egg', 'milk']) {
    const base = item === 'egg' ? 3 : item === 'milk' ? 12 : FARM_CROPS[item].price;
    const price = farmPrice('2026-11-03', item);
    assert.ok(price >= Math.round(base * 0.85) && price <= Math.round(base * 1.15), `${item}: ${price}`);
    assert.equal(farmPrice('2026-11-03', item), price);
  }
  assert.equal(farmPrice('2026-11-03', 'grass'), 0, 'cỏ voi không bán');
});

test('gieo trả tiền hạt, chín đúng giờ server, thu vào kho, bán lấy xu; cùng khóa gửi lại không trừ hai lần', () => {
  const { garden, user, act, tick } = setup();
  const an = user('an_lac');
  const fresh = garden.farm(an);
  assert.equal(fresh.level, 1);
  assert.equal(fresh.plotsOpen, FARM_PLOTS_START);
  assert.equal(fresh.coins, STARTING_COINS);
  assert.equal(act(an, 'plant', { slot: 7, crop: 'tomato' }).code, 'INVALID', 'ô chưa mở');
  assert.equal(act(an, 'plant', { slot: 1, crop: 'corn' }).code, 'LOCKED', 'ngô mở ở cấp 2');
  const planted = act(an, 'plant', { slots: [1, 2, 3], crop: 'tomato' });
  assert.equal(planted.ok, true);
  assert.equal(planted.farm.coins, STARTING_COINS - 3 * FARM_CROPS.tomato.seed);
  assert.equal(planted.farm.plots.length, 3);
  assert.equal(planted.farm.plots[0].stage, 'seed');
  assert.equal(act(an, 'plant', { slot: 1, crop: 'tomato' }).code, 'PLOT_TAKEN');
  assert.equal(act(an, 'harvest', { slot: 1 }).code, 'NOT_RIPE');
  tick(FARM_CROPS.tomato.growMs);
  const view = garden.farm(an);
  assert.ok(view.plots.every((plot) => plot.stage === 'ripe'));
  const harvested = act(an, 'harvest', { slots: [1, 2, 3] });
  assert.equal(harvested.ok, true);
  assert.equal(harvested.items.tomato, 3 * FARM_CROPS.tomato.yield);
  assert.equal(harvested.farm.plots.length, 0, 'thu xong ô trống');
  assert.equal(harvested.farm.items.tomato, 3 * FARM_CROPS.tomato.yield);
  assert.ok(harvested.xpGained >= 3 * FARM_CROPS.tomato.xp);
  const price = farmPrice(gardenDay(harvested.farm.at, TZ), 'tomato');
  const before = harvested.farm.coins;
  const sold = garden.farmAction(an, 'sell', { item: 'tomato', quantity: 4 }, 'sell-tomato-1');
  assert.equal(sold.ok, true);
  assert.equal(sold.sold.paid, 4 * price);
  assert.equal(sold.farm.coins, before + 4 * price);
  const again = garden.farmAction(an, 'sell', { item: 'tomato', quantity: 4 }, 'sell-tomato-1');
  assert.equal(again.replayed, true);
  assert.equal(garden.farm(an).coins, before + 4 * price, 'gửi lại không cộng hai lần');
  const left = 3 * FARM_CROPS.tomato.yield - 4;
  assert.equal(garden.farm(an).items.tomato, left);
  assert.equal(act(an, 'sell', { item: 'tomato', quantity: left + 1 }).code, 'NOT_ENOUGH');
  assert.equal(garden.farm(an).items.tomato, left, 'lỗi thì không trừ kho');
});

test('đất khô thì cây ngừng lớn (không chết); tưới thì lớn tiếp', () => {
  const { garden, user, act, setXp, setCoins, tick } = setup();
  const an = user('an_lac');
  setXp(an, farmXpFor(9));
  setCoins(an, 500);
  act(an, 'plant', { slot: 1, crop: 'watermelon' });
  assert.equal(act(an, 'water', { slot: 1 }).code, 'NOT_DRY', 'vừa gieo đất còn ẩm');
  tick(FARM_CROPS.watermelon.growMs + 5 * HOUR);
  const dry = garden.farm(an).plots[0];
  assert.equal(dry.stage, 'growing');
  assert.equal(dry.dry, true);
  assert.equal(dry.progress, FARM_MOIST_MS / FARM_CROPS.watermelon.growMs, 'chỉ lớn trong lúc đất ẩm');
  assert.equal(act(an, 'water', { slot: 1 }).ok, true);
  tick(FARM_MOIST_MS);
  assert.equal(garden.farm(an).plots[0].stage, 'ripe', 'đủ 12 giờ ẩm thì chín');
});

test('cỏ / sâu: để nguyên thì bớt sản lượng, nhổ / bắt thì đủ; cây lâu năm thu nhiều lứa', () => {
  const { garden, user, act, setXp, setCoins, db, tick } = setup();
  const an = user('an_lac');
  setXp(an, farmXpFor(12));
  setCoins(an, 500);
  act(an, 'plant', { slots: [1, 2], crop: 'dragonfruit' });
  // Định sẵn ô 1 có cả cỏ lẫn sâu (hạt ngẫu nhiên thỏa điều kiện), ô 2 không có gì.
  db.prepare('UPDATE farm_plots SET seed = ? WHERE account_id = ? AND slot = 1').run(0, an);
  db.prepare('UPDATE farm_plots SET seed = ? WHERE account_id = ? AND slot = 2').run(50 + (99 << 13), an);
  for (let hours = 0; hours < 24; hours += 5) {
    tick(5 * HOUR);
    act(an, 'water', { slots: [1, 2] });
  }
  const ripe = garden.farm(an).plots;
  assert.deepEqual(ripe.map((plot) => plot.stage), ['ripe', 'ripe']);
  assert.deepEqual(ripe[0].issues, ['weed', 'pest']);
  assert.deepEqual(ripe[1].issues, []);
  assert.equal(ripe[0].harvestsLeft, 5);
  const harvested = act(an, 'harvest', { slots: [1, 2] });
  assert.equal(harvested.items.dragonfruit, Math.round(3 * 0.8) + 3, 'ô có cỏ + sâu bớt 20 %');
  // Cây lâu năm: còn lứa nên ô vẫn trồng, lớn lại từ đầu lứa sau (12 giờ).
  const after = harvested.farm.plots;
  assert.equal(after.length, 2);
  assert.equal(after[0].harvestsLeft, 4);
  assert.equal(after[0].stage, 'seed');
  db.prepare('UPDATE farm_plots SET seed = 0 WHERE account_id = ? AND slot = 1').run(an);
  tick(HOUR);
  act(an, 'water', { slot: 1 });
  tick(5 * HOUR);
  const tended = act(an, 'tend', { slot: 1 });
  assert.equal(tended.ok, true);
  assert.deepEqual(tended.farm.plots[0].issues, []);
  assert.equal(act(an, 'tend', { slot: 1 }).code, 'NOTHING_TO_TEND');
});

test('gà: mở ở cấp 3, gà con được nuôi no 12 giờ thì đẻ trứng, ổ đầy 4 quả thì ngừng, đói thì ngừng (không chết)', () => {
  const { garden, user, act, setXp, setCoins, giveItem, tick } = setup();
  const an = user('an_lac');
  setCoins(an, 500);
  assert.equal(act(an, 'buyAnimal', { kind: 'chicken' }).code, 'LOCKED');
  setXp(an, farmXpFor(3));
  const bought = act(an, 'buyAnimal', { kind: 'chicken' });
  assert.equal(bought.ok, true);
  assert.equal(bought.farm.coins, 500 - FARM_ANIMALS.chicken.price);
  assert.equal(bought.farm.animals[0].adult, false);
  assert.equal(bought.farm.animals[0].hungry, false, 'vừa mua đã được ăn một bữa');
  assert.equal(act(an, 'feed', { kind: 'chicken' }).code, 'NOT_HUNGRY');
  tick(8 * HOUR);
  assert.equal(act(an, 'feed', { kind: 'chicken' }).code, 'NO_FOOD');
  giveItem(an, 'corn', 2);
  tick(10 * HOUR);
  const chick = garden.farm(an).animals[0];
  assert.equal(chick.adult, false, 'đói thì không lớn');
  assert.equal(chick.growLeftMs, 4 * HOUR);
  assert.equal(act(an, 'feed', { kind: 'chicken' }).ok, true);
  tick(8 * HOUR);
  const hen = garden.farm(an).animals[0];
  assert.equal(hen.adult, true);
  assert.equal(hen.stored, 0, 'lớn sau 4 giờ, còn 4 giờ no: chưa đủ 6 giờ đẻ');
  act(an, 'feed', { kind: 'chicken' });
  tick(2 * HOUR);
  assert.equal(garden.farm(an).animals[0].stored, 1);
  giveItem(an, 'rice', 10);
  for (let index = 0; index < 6; index += 1) {
    tick(8 * HOUR);
    act(an, 'feed', { kind: 'chicken' });
  }
  assert.equal(garden.farm(an).animals[0].stored, FARM_ANIMALS.chicken.cap, 'ổ đầy thì ngừng');
  const collected = act(an, 'collect', { kind: 'chicken' });
  assert.equal(collected.items.egg, 4);
  assert.equal(collected.farm.items.egg, 4);
  assert.equal(act(an, 'collect', { kind: 'chicken' }).code, 'NOTHING_TO_COLLECT');
  // Đói lâu: không đẻ thêm, không chết.
  tick(10 * 24 * HOUR);
  const hungry = garden.farm(an).animals[0];
  assert.equal(hungry.hungry, true);
  assert.ok(hungry.stored <= 2);
  assert.equal(garden.farm(an).animals.length, 1);
  // Chuồng 3 chỗ.
  act(an, 'buyAnimal', { kind: 'chicken' });
  act(an, 'buyAnimal', { kind: 'chicken' });
  assert.equal(act(an, 'buyAnimal', { kind: 'chicken' }).code, 'PEN_FULL');
  assert.equal(garden.farm(an).coop.slots, FARM_UPGRADES.coop[0].slots);
});

test('bò: ăn 2 bó cỏ voi hoặc cỏ khô mua ở chợ, lớn sau 2 ngày no, mỗi 12 giờ một xô sữa; dâng sữa tính nhiệm vụ', () => {
  const { garden, user, act, setXp, setCoins, giveItem, tick } = setup();
  const an = user('an_lac');
  setXp(an, farmXpFor(5));
  setCoins(an, 500);
  act(an, 'buyAnimal', { kind: 'cow' });
  assert.equal(act(an, 'buyAnimal', { kind: 'cow' }).code, 'PEN_FULL', 'chuồng bò ban đầu 1 chỗ');
  const hay = act(an, 'buy', { item: 'hay', quantity: 6 });
  assert.equal(hay.farm.coins, 500 - FARM_ANIMALS.cow.price - 6 * FARM_HAY_PRICE);
  giveItem(an, 'grass', 10);
  // 48 giờ no: 4 bữa × 12 giờ (bữa đầu có sẵn lúc mua).
  for (let index = 0; index < 3; index += 1) {
    tick(12 * HOUR);
    assert.equal(act(an, 'feed', { kind: 'cow' }).ok, true);
  }
  tick(12 * HOUR);
  assert.equal(garden.farm(an).animals[0].adult, true);
  act(an, 'feed', { kind: 'cow' });
  tick(12 * HOUR);
  assert.equal(garden.farm(an).animals[0].stored, 1);
  const milked = act(an, 'collect', { kind: 'cow' });
  assert.equal(milked.items.milk, 1);
  assert.equal(garden.me(an).quests.find((quest) => quest.id === 'offer').done, false);
  assert.equal(act(an, 'offer', { item: 'egg', quantity: 1 }).code, 'INVALID', 'không dâng trứng');
  assert.equal(act(an, 'offer', { item: 'milk', quantity: 1 }).ok, true);
  assert.equal(garden.me(an).quests.find((quest) => quest.id === 'offer').done, true, 'dâng sữa tính nhiệm vụ Dâng quả');
});

test('chợ: đủ giá tới hạn mức của cấp, phần vượt chỉ 20 %; kho đầy thì không thu thêm', () => {
  const { garden, user, act, giveItem, setXp, setCoins, tick } = setup();
  const an = user('an_lac');
  giveItem(an, 'milk', 10);
  const price = farmPrice(gardenDay(garden.farm(an).at, TZ), 'milk');
  const sold = act(an, 'sell', { item: 'milk', quantity: 10 });
  const total = 10 * price;
  assert.equal(sold.sold.full, 30);
  assert.equal(sold.sold.paid, 30 + Math.floor(((total - 30) * 20) / 100));
  assert.equal(sold.farm.market.full, 30);
  // Qua ngày mới: hạn mức tính lại.
  tick(24 * HOUR);
  giveItem(an, 'milk', 1);
  assert.equal(act(an, 'sell', { item: 'milk', quantity: 1 }).sold.over, 0);
  // Kho 50 món.
  setXp(an, farmXpFor(2));
  setCoins(an, 500);
  giveItem(an, 'hay', 48);
  act(an, 'plant', { slots: [1, 2, 3, 4, 5, 6], crop: 'spinach' });
  tick(FARM_CROPS.spinach.growMs);
  const partial = act(an, 'harvest', { slots: [1, 2, 3, 4, 5, 6] });
  assert.equal(partial.ok, false);
  assert.equal(partial.code, 'STORAGE_FULL');
  assert.equal(garden.farm(an).plots.length, 6, 'kho đầy thì cây vẫn chờ trên ô');
});

test('mở đất, nâng chuồng / kho: đúng cấp và giá, trừ xu', () => {
  const { garden, user, act, setXp, setCoins } = setup();
  const an = user('an_lac');
  setCoins(an, 5_000);
  assert.equal(act(an, 'expand').code, 'LOCKED');
  setXp(an, farmXpFor(8));
  const before = garden.farm(an).coins;
  const expanded = act(an, 'expand');
  assert.equal(expanded.farm.plotsOpen, 7);
  assert.equal(expanded.farm.coins, before - farmPlotPrice(7));
  assert.equal(act(an, 'upgrade', { target: 'coop' }).farm.coop.slots, 6);
  assert.equal(act(an, 'upgrade', { target: 'coop' }).code, 'LOCKED');
  assert.equal(act(an, 'upgrade', { target: 'barn' }).code, 'LOCKED');
  assert.equal(act(an, 'upgrade', { target: 'storage' }).farm.storage.capacity, 75);
  assert.equal(act(an, 'upgrade', { target: 'nope' }).code, 'INVALID');
  assert.equal(garden.history(an).filter((row) => row.kind === 'farm_buy').length, 3);
});

// ---- Mô phỏng kinh tế: người chơi giả chạy code thật theo đồng hồ giả trong 30 ngày ----
// Mỗi lượt vào: thu, nhặt / vắt, cho ăn, nhổ cỏ / bắt sâu, tưới, bán (tới hạn mức; kho gần đầy mới bán vượt), gieo cây
// lãi nhất chín kịp lượt sau (giữ đủ thức ăn cho gà / bò), mua thêm gà / bò khi đủ cấp và dư xu. Không mua đồ mở rộng
// để đo đúng xu "kiếm thêm" mỗi ngày.
function simulate(visitHours, { days = 30, every = 1 } = {}) {
  const { garden, user, now, tick } = setup('2026-11-03T08:00:00Z');
  const an = user(`sim_${visitHours.join('_')}`);
  let serial = 0;
  const act = (action, input) => garden.farmAction(an, action, input, `sim-${(serial += 1).toString().padStart(7, '0')}`);
  const daily = [];
  let lastCoins = garden.farm(an).coins;
  const visits = [];
  for (let day = 0; day < days; day += every) for (const hour of visitHours) visits.push(day * 24 + hour);
  const start = now();
  let gap = 24;
  for (let index = 0; index < visits.length; index += 1) {
    const target = start + visits[index] * HOUR;
    if (target > now()) tick(target - now());
    gap = (visits[index + 1] ?? visits[index] + 24) - visits[index];
    let farm = garden.farm(an);
    const ripe = farm.plots.filter((plot) => plot.stage === 'ripe').map((plot) => plot.slot);
    if (ripe.length) farm = act('harvest', { slots: ripe }).farm;
    for (const kind of ['chicken', 'cow']) {
      if (farm.animals.some((item) => item.kind === kind && item.stored)) farm = act('collect', { kind }).farm;
      if (farm.animals.some((item) => item.kind === kind && item.hungry)) farm = act('feed', { kind }).farm;
    }
    const weedy = farm.plots.filter((plot) => plot.issues.length).map((plot) => plot.slot);
    if (weedy.length) farm = act('tend', { slots: weedy }).farm;
    const dry = farm.plots.filter((plot) => plot.dry || (plot.dryAt && plot.dryAt - farm.at < FARM_MOIST_MS / 2)).map((plot) => plot.slot);
    if (dry.length) farm = act('water', { slots: dry }).farm;
    const hens = farm.animals.filter((item) => item.kind === 'chicken').length;
    const cows = farm.animals.filter((item) => item.kind === 'cow').length;
    const keep = { corn: hens * 4, rice: hens * 4, grass: cows * 6 };
    for (const [item, price] of Object.entries(farm.market.prices)) {
      const stock = (farm.items[item] || 0) - (keep[item] || 0);
      if (stock <= 0 || !price) continue;
      const left = farm.market.cap - farm.market.full;
      const nearlyFull = farm.storage.used > farm.storage.capacity * 0.8;
      const quantity = nearlyFull ? stock : Math.min(stock, Math.ceil(left / price));
      if (quantity > 0) farm = act('sell', { item, quantity }).farm;
    }
    const empty = Array.from({ length: farm.plotsOpen }, (_, slot) => slot + 1).filter((slot) => !farm.plots.some((plot) => plot.slot === slot));
    if (empty.length) {
      const unlocked = farm.catalog.crops.filter((crop) => crop.unlocked);
      const needFeed = (crop) => (crop === 'corn' || crop === 'rice' ? (farm.items.corn || 0) + (farm.items.rice || 0) < hens * 8 : crop === 'grass' && (farm.items.grass || 0) < cows * 12);
      const feedCrop = unlocked.find((crop) => crop.feed && needFeed(crop.id) && crop.growMs <= gap * HOUR);
      const best = unlocked.filter((crop) => crop.price > 0 && crop.growMs <= gap * HOUR)
        .sort((a, b) => (b.yield * b.price - b.seed) / b.growMs - (a.yield * a.price - a.seed) / a.growMs)[0] || unlocked[0];
      const split = feedCrop ? Math.ceil(empty.length / 2) : 0;
      if (split) act('plant', { slots: empty.slice(0, split), crop: feedCrop.id });
      if (empty.length > split) act('plant', { slots: empty.slice(split), crop: best.id });
      farm = garden.farm(an);
    }
    for (const kind of ['chicken', 'cow']) {
      const def = FARM_ANIMALS[kind];
      const owned = farm.animals.filter((item) => item.kind === kind).length;
      const slots = kind === 'chicken' ? farm.coop.slots : farm.barn.slots;
      if (farm.level >= def.level && owned < slots && farm.coins > def.price * 4) farm = act('buyAnimal', { kind }).farm;
    }
    // Cuối ngày (lượt cuối trong ngày): ghi xu thay đổi trong ngày.
    if (Math.floor(visits[index] / 24) !== Math.floor((visits[index + 1] ?? Infinity) / 24)) {
      daily.push({ day: Math.floor(visits[index] / 24), net: farm.coins - lastCoins, level: farm.level, cap: farm.market.cap });
      lastCoins = farm.coins;
    }
  }
  return { daily, farm: garden.farm(an) };
}

test('kinh tế: chăm 3 lần/ngày chạm gần hạn mức; 1 lần/ngày vẫn lãi; 3 ngày/lần không âm; nick mới không vượt ~30 xu/ngày', () => {
  const active = simulate([8, 13, 21]);
  const daily = simulate([20]);
  const rare = simulate([20], { every: 3 });
  const avg = (rows) => rows.reduce((sum, row) => sum + row.net, 0) / rows.length;
  const settled = (run) => run.daily.slice(7);
  const activeAvg = avg(settled(active));
  const dailyAvg = avg(settled(daily));
  const lastCap = active.daily.at(-1).cap;
  // In để chỉnh số khi đổi bảng giá (node --test in ra ở chế độ chi tiết).
  console.log('farm economy', JSON.stringify({
    active: { avg: Math.round(activeAvg), level: active.farm.level, cap: lastCap, first: active.daily.slice(0, 4).map((row) => row.net) },
    daily: { avg: Math.round(dailyAvg), level: daily.farm.level },
    rare: { avg: Math.round(avg(settled(rare)) / 3), level: rare.farm.level, nets: rare.daily.map((row) => row.net) },
  }));
  assert.ok(active.daily[0].net <= 35, `ngày đầu không vượt hạn mức nick mới: ${active.daily[0].net}`);
  assert.ok(activeAvg >= 0.55 * lastCap && activeAvg <= lastCap + 25, `chăm 3 lần/ngày: ${Math.round(activeAvg)} xu/ngày, hạn mức ${lastCap}`);
  assert.ok(dailyAvg > 0 && dailyAvg < activeAvg, `1 lần/ngày lãi ít hơn: ${Math.round(dailyAvg)}`);
  assert.ok(active.daily.every((row) => row.net >= -FARM_ANIMALS.cow.price - 10), 'không ngày nào lỗ quá tiền mua một con');
  assert.ok(settled(daily).every((row) => row.net >= -FARM_ANIMALS.cow.price), '1 lần/ngày không lỗ (trừ ngày mua con)');
  // 3 ngày một lần: mỗi lượt vẫn có lời (trừ lượt mua con), cả tháng không âm.
  assert.ok(rare.daily.reduce((sum, row) => sum + row.net, 0) > 0, '3 ngày/lần cả tháng có lời');
  assert.ok(rare.daily.slice(1).every((row) => row.net >= -FARM_ANIMALS.cow.price), '3 ngày/lần không lỗ (trừ lượt mua con)');
});

// ---- Hàng xóm (giai đoạn 4) ----
function neighbors() {
  const env = setup();
  const an = env.user('an_lac');
  const binh = env.user('binh_an');
  let serial = 0;
  const social = (actorId, name, owner, action, input, options = {}) => env.garden.farmSocial({ accountId: actorId, name }, owner, action, input, `social-${(serial += 1).toString().padStart(6, '0')}`, options);
  return { ...env, an, binh, social };
}

test('hàng xóm giúp: tưới ô khô / nhổ cỏ / cho ăn trên nông trại chủ, tối đa 5 việc mỗi nông trại, xu có trần và chỉ khi đủ 24 giờ bạn', () => {
  const { garden, act, setXp, giveItem, tick, an, binh, social, user } = neighbors();
  setXp(an, farmXpFor(7));
  assert.equal(act(an, 'plant', { slots: [1, 2, 3, 4, 5, 6], crop: 'pumpkin' }).ok, true);
  tick(FARM_MOIST_MS + HOUR);
  const before = garden.farmVisit(binh, { accountId: an });
  assert.deepEqual(before.needs.water, [1, 2, 3, 4, 5, 6]);
  assert.equal(before.farm.coins, undefined, 'khách không thấy ví chủ');
  assert.equal(before.farm.items, undefined, 'khách không thấy kho chủ');
  assert.equal(social(binh, 'binh_an', { accountId: an }, 'help', { task: 'water', slots: [1] }).helped.count, 1);
  assert.equal(social(binh, 'binh_an', { accountId: an }, 'help', { task: 'water', slots: [1] }).code, 'NOT_DRY', 'ô vừa tưới');
  const watered = social(binh, 'binh_an', { accountId: an }, 'help', { task: 'water', slots: [2, 3, 4, 5, 6] }, { paid: false });
  assert.equal(watered.helped.count, 4, 'ô 1 đã tưới, còn 4 việc trong hạn 5');
  assert.equal(watered.helped.coins, 0, 'chưa đủ 24 giờ bạn: không xu');
  assert.equal(watered.xpGained, 4);
  assert.equal(watered.visit.helps.done, 5);
  assert.equal(social(binh, 'binh_an', { accountId: an }, 'help', { task: 'water', slots: [6] }).code, 'HELP_LIMIT');
  const owner = garden.farm(an);
  assert.equal(owner.plots.filter((plot) => plot.dry).length, 1, 'còn đúng ô 6 khô');
  assert.deepEqual(owner.visitors.map((row) => [row.name, row.kind, row.count]), [['binh_an', 'water', 4], ['binh_an', 'water', 1]]);
  // Cho ăn giúp lấy thức ăn trong kho chủ; chủ hết thức ăn thì báo NO_FOOD.
  setXp(an, farmXpFor(7));
  const chi = user('chi_an');
  assert.equal(act(an, 'buyAnimal', { kind: 'chicken' }).ok, true);
  tick(FARM_ANIMALS.chicken.fullMs + 1);
  assert.equal(social(chi, 'chi_an', { accountId: an }, 'help', { task: 'feed', kind: 'chicken' }).code, 'NO_FOOD');
  giveItem(an, 'corn', 1);
  const fed = social(chi, 'chi_an', { accountId: an }, 'help', { task: 'feed', kind: 'chicken' }, { paid: true });
  assert.equal(fed.helped.count, 1);
  assert.equal(fed.helped.coins, 1, 'đã là bạn đủ lâu: 1 xu / việc');
  assert.equal(garden.farm(an).items.corn, undefined, 'thức ăn lấy ở kho chủ');
  assert.equal(garden.farm(an).animals[0].hungry, false);
  assert.equal(social(an, 'an_lac', { accountId: an }, 'help', { task: 'water', slots: [6] }).code, 'INVALID', 'không tự giúp mình');
});

test('xu từ giúp đỡ tối đa 10 / ngày dù giúp nhiều nông trại; sang ngày mới tính lại', () => {
  const { garden, act, setXp, tick, social, user, binh } = neighbors();
  const owners = ['o_mot', 'o_hai', 'o_ba'].map((name) => user(name));
  for (const owner of owners) {
    setXp(owner, farmXpFor(7));
    assert.equal(act(owner, 'plant', { slots: [1, 2, 3, 4, 5, 6], crop: 'pumpkin' }).ok, true);
  }
  tick(FARM_MOIST_MS + HOUR);
  const coins = owners.map((owner) => social(binh, 'binh_an', { accountId: owner }, 'help', { task: 'water', slots: [1, 2, 3, 4, 5, 6] }, { paid: true }).helped.coins);
  assert.deepEqual(coins, [5, 5, 0]);
  assert.equal(garden.farmVisit(binh, { accountId: owners[2] }).coins.today, 10);
});

test('rổ chia sẻ: chủ bỏ vào / lấy lại, khách lấy tối đa 2 món mỗi nông trại mỗi ngày, chủ được điểm phước', () => {
  const { garden, act, giveItem, tick, an, binh, social, user } = neighbors();
  giveItem(an, 'tomato', 30);
  assert.equal(act(an, 'share', { item: 'grass', quantity: 1 }).code, 'INVALID', 'cỏ voi không chia');
  assert.equal(act(an, 'share', { item: 'tomato', quantity: 21 }).code, 'BASKET_FULL');
  const shared = act(an, 'share', { item: 'tomato', quantity: 6 });
  assert.deepEqual(shared.farm.basket.items, { tomato: 6 });
  assert.equal(shared.farm.items.tomato, 24);
  assert.equal(social(binh, 'binh_an', { accountId: an }, 'take', { item: 'egg' }).code, 'NOT_ENOUGH');
  assert.equal(social(binh, 'binh_an', { accountId: an }, 'take', { item: 'tomato', quantity: 3 }).code, 'TAKE_LIMIT');
  const took = social(binh, 'binh_an', { accountId: an }, 'take', { item: 'tomato', quantity: 2 });
  assert.equal(took.ok, true);
  assert.equal(took.farm.items.tomato, 2, 'vào kho người lấy');
  assert.equal(took.visit.takes.left, 0);
  assert.equal(social(binh, 'binh_an', { accountId: an }, 'take', { item: 'tomato' }).code, 'TAKE_LIMIT');
  const chi = user('chi_an');
  assert.equal(social(chi, 'chi_an', { accountId: an }, 'take', { item: 'tomato' }).ok, true, 'người khác vẫn lấy được');
  const owner = garden.farm(an);
  assert.equal(owner.blessings, 3);
  assert.deepEqual(owner.basket.items, { tomato: 3 });
  assert.deepEqual(owner.visitors.map((row) => [row.name, row.kind, row.item, row.count]), [['chi_an', 'take', 'tomato', 1], ['binh_an', 'take', 'tomato', 2]]);
  assert.equal(act(an, 'unshare', { item: 'tomato', quantity: 3 }).farm.items.tomato, 27);
  tick(24 * HOUR);
  assert.equal(garden.farmVisit(binh, { accountId: an }).takes.left, 2, 'ngày mới lấy lại được');
});

test('tặng quà: từ kho mình vào kho bạn, 3 lần / ngày, tối đa 10 món, kho bạn đầy thì không trừ', () => {
  const { garden, giveItem, an, binh, social, user } = neighbors();
  giveItem(an, 'egg', 40);
  assert.equal(social(an, 'an_lac', { accountId: binh }, 'gift', { item: 'egg', quantity: 11 }).code, 'INVALID');
  assert.equal(social(an, 'an_lac', { accountId: binh }, 'gift', { item: 'hay', quantity: 1 }).code, 'INVALID', 'không tặng cỏ khô');
  for (let index = 0; index < 3; index += 1) assert.equal(social(an, 'an_lac', { accountId: binh }, 'gift', { item: 'egg', quantity: 2 }).ok, true);
  assert.equal(social(an, 'an_lac', { accountId: binh }, 'gift', { item: 'egg', quantity: 1 }).code, 'GIFT_LIMIT');
  assert.equal(garden.farm(an).items.egg, 34);
  assert.equal(garden.farm(binh).items.egg, 6);
  assert.deepEqual(garden.farm(binh).visitors[0], { ...garden.farm(binh).visitors[0], name: 'an_lac', kind: 'gift', item: 'egg', count: 2 });
  // Kho người nhận đầy: báo RECEIVER_FULL, người tặng không mất gì.
  giveItem(binh, 'tomato', 44);
  const chi = user('chi_an');
  giveItem(chi, 'milk', 3);
  assert.equal(social(chi, 'chi_an', { accountId: binh }, 'gift', { item: 'milk', quantity: 1 }).code, 'RECEIVER_FULL');
  assert.equal(garden.farm(chi).items.milk, 3);
});

test('nông trại bạn bot như ruộng người thật: ổn định, lên cấp dần, ai ghé cũng thấy cùng trạng thái; rổ vơi cho mọi người, trần 4 món / ngày ẩn trong rổ', () => {
  const { garden, now, tick, binh, social, user } = neighbors();
  const day = gardenDay(now(), TZ);
  // Tìm vài tên bot có ô khô và rổ có đồ (bảng sinh theo băm nên tên nào cũng ổn định).
  const names = Array.from({ length: 60 }, (_, index) => `Bot ${index}`)
    .filter((name) => {
      const farm = farmBotFarm(name, day, now());
      return farm.plots.some((plot) => plot.dry) && Object.values(farm.basket).reduce((sum, value) => sum + value, 0) >= 4;
    });
  assert.ok(names.length >= 3, `đủ bot có việc: ${names.length}`);
  assert.deepEqual(farmBotFarm(names[0], day, now()), farmBotFarm(names[0], day, now()));
  // Liền mạch: một giờ sau phần lớn ô vẫn cùng loài cây (không đổi cả ruộng theo ngày); cấp không giảm, lên dần.
  const later = new Date(now() + 30 * 24 * HOUR);
  for (const name of names) {
    const a = farmBotFarm(name, day, now());
    const b = farmBotFarm(name, gardenDay(now() + HOUR, TZ), now() + HOUR);
    const same = a.plots.filter((plot) => b.plots.some((other) => other.slot === plot.slot && other.crop === plot.crop)).length;
    assert.ok(same >= a.plots.length * 0.6, `${name}: ${same}/${a.plots.length} ô giữ loài cây`);
    const levels = Array.from({ length: 31 }, (_, offset) => farmBotFarm(name, gardenDay(now() + offset * 24 * HOUR, TZ), now() + offset * 24 * HOUR).level);
    assert.ok(levels.every((level, index) => !index || level >= levels[index - 1]), `${name}: cấp không giảm`);
    assert.ok(levels[30] > levels[0] || levels[0] >= 12, `${name}: lên cấp sau một tháng`);
    assert.ok(farmBotFarm(name, gardenDay(later.getTime(), TZ), later.getTime()).level <= 21);
  }
  const owner = { bot: names[0] };
  const seen = garden.farmVisit(binh, owner);
  assert.equal(seen.farm.bot, undefined, 'không có dấu hiệu bot');
  const slot = seen.needs.water[0];
  const helped = social(binh, 'binh_an', owner, 'help', { task: 'water', slots: [slot] }, { paid: true });
  assert.equal(helped.ok, true);
  assert.equal(helped.helped.coins, 1);
  assert.equal(helped.visit.farm.plots.find((plot) => plot.slot === slot).dry, false);
  assert.equal(social(binh, 'binh_an', owner, 'help', { task: 'water', slots: [slot] }).code, 'NOT_DRY');
  // Người khác ghé thấy ô đó đã được tưới; 6 giờ sau đất khô lại thì mới cần tưới tiếp (nếu chủ chưa tưới).
  const chi = user('chi_an');
  assert.equal(garden.farmVisit(chi, owner).farm.plots.find((plot) => plot.slot === slot)?.dry, false, 'cùng một ruộng cho mọi người');
  // Rổ: người này lấy thì rổ vơi với người khác.
  const basketBefore = garden.farmVisit(chi, owner).farm.basket;
  const [item] = Object.keys(basketBefore);
  assert.equal(social(binh, 'binh_an', owner, 'take', { item }).ok, true);
  assert.equal(garden.farmVisit(chi, owner).farm.basket[item] || 0, Math.min(basketBefore[item] - 1, 4));
  // Trần 4 món / ngày từ rổ các bạn bot: phần vượt không hiện trong rổ, lấy thêm thì NOT_ENOUGH như rổ đã hết.
  let taken = 1;
  for (const name of names.slice(0, 3)) {
    for (const [thing, quantity] of Object.entries(garden.farmVisit(binh, { bot: name }).farm.basket)) {
      for (let index = 0; index < quantity; index += 1) if (social(binh, 'binh_an', { bot: name }, 'take', { item: thing }).ok) taken += 1;
    }
  }
  assert.equal(taken, 4);
  const third = garden.farmVisit(binh, { bot: names[2] });
  assert.deepEqual(third.farm.basket, {}, 'rổ trống với người đã lấy đủ');
  assert.equal(third.takes.left, 2, 'không lộ trần riêng: lượt lấy vẫn như ruộng người');
  assert.equal(social(binh, 'binh_an', { bot: names[2] }, 'take', { item }).code, 'NOT_ENOUGH');
  assert.equal(garden.farm(binh).visitors.length, 0, 'giúp bạn không ghi vào sổ nông trại mình');
  tick(24 * HOUR);
  assert.ok(Object.keys(garden.farmVisit(binh, owner).farm.basket).length > 0, 'ngày mới rổ bày lại');
});

test('bạn bot ghé như hàng xóm: tưới ≤ 3 ô khô, cho con đói ăn bằng thức ăn của chủ, giờ ghé trước lúc mở, tối đa 2 bạn / ngày', () => {
  const { garden, act, setXp, giveItem, tick, now, an } = neighbors();
  setXp(an, farmXpFor(7));
  // Ruộng trống: bạn ghé (nếu có) chỉ có thể tặng quà, không có việc để giúp.
  const idle = garden.farmBotVisit(an, ['Minh An']);
  assert.ok(!idle || (!idle.water.length && !idle.tend.length && !idle.feed.length), 'chưa có gì để giúp');
  const giftedCorn = (...visits) => visits.filter((row) => row?.gift?.item === 'corn').reduce((sum, row) => sum + row.gift.quantity, 0);
  assert.equal(act(an, 'plant', { slots: [1, 2, 3, 4], crop: 'pumpkin' }).ok, true);
  assert.equal(act(an, 'buyAnimal', { kind: 'chicken' }).ok, true);
  giveItem(an, 'corn', 1);
  // Giờ ghé lùi tới 90 phút: chờ quá bữa của gà hơn thế để lúc ghé gà đã đói.
  tick(FARM_ANIMALS.chicken.fullMs + 2 * HOUR);
  // Khoảng 60 % số ngày có bạn ghé: thử qua nhiều ngày (ô bí khô vẫn khô vì cây ngừng lớn, gà vẫn đói).
  let visit = null;
  for (let day = 0; day < 20 && !visit; day += 1) {
    visit = garden.farmBotVisit(an, ['Minh An', 'Bé Na']);
    if (!visit) tick(24 * HOUR);
  }
  assert.ok(visit, 'có ngày bạn ghé');
  assert.equal(visit.water.length, 3, 'tưới tối đa 3 ô');
  assert.deepEqual(visit.feed, ['chicken'], 'cho gà ăn');
  assert.ok(visit.at < now() && visit.at >= now() - 90 * 60_000, 'giờ ghé trước lúc mở');
  assert.equal(garden.farmBotVisit(an, ['Minh An', 'Bé Na']), null, 'lượt sau cách ít nhất 3 giờ');
  const farm = garden.farm(an);
  assert.equal(farm.plots.filter((plot) => plot.dry).length, 1);
  assert.equal(farm.items.corn || 0, giftedCorn(idle, visit), 'thức ăn lấy ở kho chủ');
  assert.equal(farm.animals[0].hungry, false);
  assert.ok(farm.plots.filter((plot) => !plot.dry).every((plot) => plot.progress > 0.75), 'ô được tưới lớn tiếp từ giờ ghé');
  assert.equal(farm.visitors[0].name, visit.name);
  assert.ok(farm.visitors.every((row) => row.bot === undefined), 'sổ ghé không ghi bot');
});

test('bạn bot đôi khi lấy 1 món ở rổ (chủ được điểm phước) hoặc tặng nông sản; mỗi ngày tối đa 2 bạn khác nhau', () => {
  const { garden, giveItem, act, tick, an, db } = neighbors();
  giveItem(an, 'tomato', 20);
  assert.equal(act(an, 'share', { item: 'tomato', quantity: 20 }).ok, true);
  const friends = ['Minh An', 'Bé Na', 'Tâm Hiền'];
  let gifts = 0;
  let takes = 0;
  for (let day = 0; day < 80; day += 1) {
    for (let turn = 0; turn < 3; turn += 1) {
      const visit = garden.farmBotVisit(an, friends);
      if (visit?.gift) gifts += visit.gift.quantity;
      if (visit?.took) takes += 1;
      tick(4 * HOUR);
    }
    tick(12 * HOUR);
  }
  assert.ok(gifts > 0, 'có quà');
  assert.ok(takes > 0, 'có lấy ở rổ');
  const farm = garden.farm(an);
  assert.equal(farm.blessings, takes);
  assert.equal(farm.basket.items.tomato || 0, 20 - takes);
  assert.equal(Object.values(farm.items).reduce((sum, value) => sum + value, 0), gifts, 'quà vào kho chủ');
  const perDay = db.prepare("SELECT day, COUNT(DISTINCT actor) AS n, COUNT(DISTINCT actor) = COUNT(DISTINCT actor || at) AS once FROM farm_log WHERE owner = ? GROUP BY day").all(an);
  assert.ok(perDay.every((row) => row.n <= 2 && row.once), 'mỗi bạn một lượt, tối đa 2 bạn / ngày');
  assert.ok(perDay.some((row) => row.n === 2), 'có ngày 2 bạn ghé');
});
