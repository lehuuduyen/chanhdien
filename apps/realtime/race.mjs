// Đua xe (phòng duaxe, luật RACE_RULES.interaction). Máy giữ phòng làm trọng tài; không có xu, chỉ báo vòng / kết quả của
// thành viên cho API làm Bảng vàng.
//   idle ─(có người bấm Vào đua)→ lobby (đếm ngược, ai cũng chạy thử được) → grid (xếp lưới, 5 đèn đỏ) → racing → result
//   → lobby (còn người chờ / người vừa đua) | idle
// - Xe người lái do trình duyệt tự tính (vật lý @chanh-dien/race), gửi race.car ≤ sendHz lần/giây. Máy này chỉ kiểm tra
//   thô: tốc độ ≤ SPEED_LIMIT, không nhảy xa hơn tốc độ cho phép, không ra ngoài rào; đặt lại xe (r) phải về giữa đường
//   gần chỗ cũ. Gói sai bị bỏ, người lái nhận race.me.reset về vị trí hợp lệ cuối và vòng đó không tính kỷ lục.
// - Vòng tính bằng createLapTracker theo giờ máy này nhận gói (qua đủ mốc theo thứ tự rồi qua vạch).
// - Xe bot do máy này lái (driveBot) cùng vật lý, va nhau và va xe người (chỉ bot bị đẩy; xe người do máy người đó tự đẩy).
// - Gom broadcastMs phát race.cars cho cả phòng (người xem cũng thấy). Không lưu gì vào snapshot: rút máy / máy chết thì
//   cuộc đua dở bị bỏ (không đụng tới xu).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';
import {
  buildTrack, collideCars, createCar, createDriver, createLapTracker, driveBot, gridSlot, idealLapMs, placeCar, rescuePoint,
  roundCar, spawnPoint, SPEED_LIMIT, STEP, stepCar,
} from '@chanh-dien/race';

const SCENES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scenes');
const TICK_MS = 50;
const STATE_RACING_MS = 500;
const RESET_GAP_MS = 1_000;
const STUCK_MS = 3_000;
const tracks = new Map();

// Đường đua theo id cảnh (scenes/<id>/track.json), dựng một lần.
export function loadTrack(id) {
  if (!tracks.has(id)) tracks.set(id, buildTrack(JSON.parse(readFileSync(path.join(SCENES_DIR, id, 'track.json'), 'utf8'))));
  return tracks.get(id);
}

const between = (random, [low, high]) => low + random() * (high - low);
const betweenInt = (random, [low, high]) => Math.floor(low + random() * (high - low + 1));
const signedGap = (track, a, b) => {
  let gap = b - a;
  if (gap < -track.length / 2) gap += track.length;
  if (gap > track.length / 2) gap -= track.length;
  return gap;
};

// Giờ phân hạng của bot: vòng bay (đã chạy đà) theo trình độ, đo bằng driveBot trên race-circuit (0,78 → ~37,6 s,
// 0,93 → ~34,6 s ≈ 1,057 → 0,973 lần idealLapMs) cộng sai số ±0,3 s; đường khác tính theo cùng tỉ lệ.
function botQualiMs(track, skill = 0.85, random = Math.random) {
  const ratio = 1.057 - (skill - 0.78) * 0.56;
  return Math.round(idealLapMs(track) * ratio + (random() - 0.5) * 600);
}

export class RaceGame {
  // onLap({ key, accountId, lapMs, mode }) / onResult({ raceId, results }) báo API (Bảng vàng); lỗi mạng bỏ qua.
  constructor({ room, rules, track = null, onLap = null, onResult = null, now = Date.now, random = Math.random, autoTick = true }) {
    this.kind = 'race';
    this.room = room;
    this.rules = rules;
    this.track = track || loadTrack(rules.track);
    this.onLap = onLap;
    this.onResult = onResult;
    this.now = now;
    this.random = random;
    this.autoTick = autoTick;
    this.phase = 'idle';
    // id người / bot → xe đang trên đường.
    this.cars = new Map();
    // id người chờ cuộc đua tới → màu xe muốn.
    this.queue = new Map();
    this.colors = new Map();
    this.raceId = null;
    this.lightsAt = 0;
    this.startAt = 0;
    this.endAt = 0;
    this.finishAt = 0;
    this.result = null;
    this.raceBest = null;
    // Xe bỏ cuộc trong cuộc đua đang chạy (vẫn có tên trong bảng kết quả).
    this.retired = new Map();
    this.serial = 0;
    this.revision = 0;
    this.running = false;
    this.timer = null;
    this.lastTick = 0;
    this.carry = 0;
    this.stateAt = 0;
    this.stateDirty = false;
    this.practiceBotAt = 0;
    // id người → vòng nhanh nhất gần đây ở phòng này { ms, at } (xếp lưới).
    this.quali = new Map();
  }

  // ---- Vòng đời (phòng gọi) ----
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTick = this.now();
    if (this.autoTick) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.timer.unref?.();
    }
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    this.cars.clear();
    this.queue.clear();
    this.phase = 'idle';
    this.raceId = null;
    this.result = null;
  }

  async quiesce() {
    this.stop();
  }

  stateMessage() {
    const message = {
      v: PROTOCOL_VERSION,
      type: 'race.state',
      epoch: this.room.epoch,
      phase: this.phase,
      laps: this.rules.laps,
      drivers: this.driverList(),
      queued: this.queue.size,
    };
    if (this.raceId) message.raceId = this.raceId;
    if (this.phase === 'grid' || this.phase === 'racing') {
      message.lightsAt = this.lightsAt;
      message.startAt = this.startAt;
    }
    if (this.endAt && this.phase !== 'idle') message.endAt = Math.round(this.endAt);
    if (this.phase === 'result' && this.result) message.result = this.result;
    return message;
  }

  // Trạng thái riêng gửi lúc vào phòng: người mới chưa lái, chưa chờ.
  mineMessage() {
    return null;
  }

  hasBotBet(participantId) {
    return this.cars.has(participantId);
  }

  participantAway(participantId) {
    this.leave({ id: participantId }, { quiet: true });
    this.colors.delete(participantId);
  }

  // ---- Thao tác người chơi ----
  join(participant, { color } = {}) {
    if (!participant || participant.bot) return { ok: false, code: 'NOT_IN_ROOM' };
    if (color !== undefined) this.colors.set(participant.id, color);
    const car = this.cars.get(participant.id);
    if (car?.mode === 'race') return { ok: true };
    this.queue.set(participant.id, this.colorOf(participant.id));
    if (this.phase === 'idle') this.openLobby();
    else if (this.phase === 'lobby') this.shortenLobby();
    this.sendMe(participant.id);
    this.markState();
    return { ok: true };
  }

  practice(participant, { color } = {}) {
    if (!participant || participant.bot) return { ok: false, code: 'NOT_IN_ROOM' };
    if (!['idle', 'lobby', 'result'].includes(this.phase)) return { ok: false, code: 'RACE_RUNNING', message: 'Đang đua, chạy thử sau khi cuộc đua xong nhé' };
    if (color !== undefined) this.colors.set(participant.id, color);
    let car = this.cars.get(participant.id);
    if (!car) {
      if (this.cars.size >= this.rules.maxCars) {
        // Nhường chỗ cho người: bớt một bot chạy thử.
        const bot = [...this.cars.values()].find((item) => item.bot && item.mode === 'practice');
        if (!bot) return { ok: false, code: 'TRACK_FULL', message: 'Đường đua đang đủ xe, chờ một chút' };
        this.cars.delete(bot.id);
      }
      car = this.addCar(participant, 'practice', this.freeSpawn());
    } else car.color = this.colorOf(participant.id);
    this.sendMe(participant.id, { spawn: true });
    this.markState();
    return { ok: true };
  }

  leave(participant, { quiet = false } = {}) {
    const id = participant?.id;
    if (!id) return { ok: false, code: 'NOT_IN_ROOM' };
    const queued = this.queue.delete(id);
    const car = this.cars.get(id);
    if (car) {
      if (car.mode === 'race' && (this.phase === 'grid' || this.phase === 'racing')) {
        // Bỏ cuộc: cất xe, giữ tên trong bảng kết quả.
        car.dnf = true;
        this.retired.set(id, car);
      }
      this.cars.delete(id);
    }
    if (queued && this.phase === 'lobby' && !this.queue.size) this.closeLobby();
    if (!quiet) this.sendMe(id);
    if (queued || car) this.markState();
    if (this.phase === 'racing') this.checkFinish();
    return { ok: true };
  }

  // Gói trạng thái xe của người lái.
  carState(participant, message) {
    const car = this.cars.get(participant?.id);
    if (!car || car.bot) return { ok: false, code: 'NOT_DRIVING' };
    if (!this.room.allow(`${participant.id}:race-car`, this.rules.sendHz + 6, 1_000)) return { ok: false, code: 'RATE_LIMITED' };
    const now = this.now();
    // Trên lưới chờ đèn: xe đứng yên.
    if (car.mode === 'race' && now < this.startAt) return { ok: true };
    const track = this.track;
    const projected = track.project(message.x, message.z, car.index);
    const walls = track.wallsAt(projected.index, projected.t);
    let ok = Math.abs(message.speed) <= SPEED_LIMIT
      && projected.d < walls.left + 1.5 && projected.d > -walls.right - 1.5;
    if (ok && message.r) {
      const back = signedGap(track, car.s, projected.s);
      ok = Math.abs(projected.d) < 2.5 && back > -90 && back < 15;
    } else if (ok) {
      const elapsed = Math.max(TICK_MS, now - car.at);
      ok = Math.hypot(message.x - car.x, message.z - car.z) <= (SPEED_LIMIT * (elapsed + 300)) / 1_000 + 2;
    }
    if (!ok) {
      car.tracker.taint();
      if (now - (car.resetAt || 0) > RESET_GAP_MS) {
        car.resetAt = now;
        this.sendMe(participant.id, { reset: true });
      }
      return { ok: false, code: 'BAD_STATE' };
    }
    if (message.r) car.tracker.taint();
    Object.assign(car, { x: message.x, z: message.z, h: message.h, v: message.speed, at: now, index: projected.index, s: projected.s, d: projected.d });
    if (!car.done) for (const event of car.tracker.update(car.x, car.z, now)) this.lapEvent(car, event);
    return { ok: true };
  }

  // ---- Nhịp máy ----
  tick() {
    if (!this.running) return;
    const now = this.now();
    const elapsed = Math.min(250, Math.max(0, now - this.lastTick));
    this.lastTick = now;
    this.phaseStep(now);
    this.carry += elapsed / 1_000;
    const steps = Math.min(15, Math.floor(this.carry / STEP));
    this.carry -= steps * STEP;
    if (steps > 0) this.driveBots(now, steps);
    this.dropIdleCars(now);
    this.keepPracticeBots(now);
    if (this.cars.size) this.room.broadcast(this.carsMessage(now));
    if (this.stateDirty || (this.phase === 'racing' && now - this.stateAt >= STATE_RACING_MS)) this.broadcastState(now);
  }

  phaseStep(now) {
    if (this.phase === 'lobby' && now >= this.endAt) this.startGrid(now);
    else if (this.phase === 'grid' && now >= this.startAt) {
      this.phase = 'racing';
      this.markState();
    } else if (this.phase === 'racing' && now >= this.endAt) this.endRace(now);
    else if (this.phase === 'result' && now >= this.endAt) {
      this.result = null;
      this.raceId = null;
      if (this.queue.size) this.openLobby(now);
      else {
        this.phase = 'idle';
        this.endAt = 0;
        this.markState();
      }
    }
  }

  driveBots(now, steps) {
    const track = this.track;
    const bots = [];
    const others = [];
    for (const car of this.cars.values()) {
      if (car.bot) bots.push(car);
      else {
        // Xe người: đoán vị trí hiện tại theo gói cuối (đi thẳng theo tốc độ).
        const ahead = Math.min(0.3, Math.max(0, (now - car.at) / 1_000));
        const ghost = { x: car.x + Math.sin(car.h) * car.v * ahead, z: car.z + Math.cos(car.h) * car.v * ahead, h: car.h, v: car.v, vl: 0, s: car.s, d: car.d, impact: 0 };
        others.push(ghost);
      }
    }
    if (!bots.length) return;
    const field = [...bots.map((car) => car.body), ...others];
    const locked = this.phase === 'grid' || (this.phase === 'racing' && now < this.startAt);
    for (let step = 0; step < steps; step += 1) {
      for (const car of bots) {
        if (locked && car.mode === 'race') continue;
        const input = driveBot(car.driver, car.body, track, field);
        // Về đích rồi: chạy chậm hết vòng (không đứng chắn đường).
        if (car.done) Object.assign(input, { throttle: Math.min(input.throttle, 0.25), brake: car.body.v > 30 ? 0.3 : 0 });
        stepCar(car.body, input, STEP, track);
      }
      for (let a = 0; a < bots.length; a += 1) {
        for (let b = a + 1; b < bots.length; b += 1) collideCars(bots[a].body, bots[b].body, { moveOther: true });
        for (const ghost of others) collideCars(bots[a].body, ghost);
      }
    }
    for (const car of bots) {
      Object.assign(car, { x: car.body.x, z: car.body.z, h: car.body.h, v: car.body.v, s: car.body.s, d: car.body.d, index: car.body.index, at: now });
      if (locked && car.mode === 'race') continue;
      if (!car.done) for (const event of car.tracker.update(car.x, car.z, now)) this.lapEvent(car, event);
      // Kẹt (đâm rào đứng yên): đặt lại giữa đường.
      if (Math.abs(car.body.v) < 1.5) car.stuck += steps * STEP * 1_000;
      else car.stuck = 0;
      if (car.stuck > STUCK_MS) {
        const spot = rescuePoint(track, car.s);
        Object.assign(car.body, { x: spot.x, z: spot.z, h: spot.h, v: 0, vl: 0 });
        placeCar(car.body, track);
        car.tracker.taint();
        car.stuck = 0;
      }
    }
  }

  // Người lái mất mạng / thôi gửi: chạy thử thì cất xe; đang đua thì bỏ cuộc.
  dropIdleCars(now) {
    for (const car of [...this.cars.values()]) {
      // Xe trên lưới không gửi gì tới lúc đèn tắt: tính thời gian im lặng từ lúc xuất phát.
      const since = car.mode === 'race' ? Math.max(car.at, this.startAt) : car.at;
      if (car.bot || now - since < this.rules.idleCarMs) continue;
      this.leave({ id: car.id });
    }
  }

  // Có người xem mà đường vắng (ngoài lúc đua): vài bot chạy thử cho có không khí.
  keepPracticeBots(now) {
    if (!['idle', 'lobby', 'result'].includes(this.phase) || now < this.practiceBotAt) return;
    this.practiceBotAt = now + 4_000;
    const people = [...this.room.participants.values()].some((participant) => !participant.bot && participant.connected !== false);
    const practicing = [...this.cars.values()].filter((car) => car.bot && car.mode === 'practice');
    if (!people) {
      for (const car of practicing) this.cars.delete(car.id);
      if (practicing.length) this.markState();
      return;
    }
    // Bot chạy thử đủ lâu thì về nghỉ, bot khác ra thay.
    for (const car of practicing) {
      if (now > car.until) {
        this.cars.delete(car.id);
        this.markState();
      }
    }
    const target = this.practiceTarget ?? (this.practiceTarget = betweenInt(this.random, this.rules.practiceBots));
    const count = [...this.cars.values()].filter((car) => car.bot && car.mode === 'practice').length;
    if (count >= target || this.cars.size >= Math.min(this.rules.maxCars, 4 + count)) return;
    const bot = this.idleBots()[0];
    if (!bot) return;
    const car = this.addCar(bot, 'practice', this.freeSpawn());
    car.until = now + between(this.random, [60_000, 150_000]);
    this.practiceTarget = betweenInt(this.random, this.rules.practiceBots);
    this.markState();
  }

  // ---- Các pha ----
  openLobby(now = this.now()) {
    this.phase = 'lobby';
    this.serial += 1;
    this.raceId = `rc-${String(this.room.id).toLowerCase().replace(/[^a-z0-9-]/g, '')}-${now.toString(36)}-${this.serial}`.slice(0, 79);
    this.endAt = now + this.rules.lobbyMs;
    this.shortenLobby(now);
    this.markState();
  }

  shortenLobby(now = this.now()) {
    if (this.queue.size >= this.rules.gridSize) this.endAt = Math.min(this.endAt, now + this.rules.fullLobbyMs);
  }

  closeLobby() {
    this.phase = 'idle';
    this.raceId = null;
    this.endAt = 0;
  }

  startGrid(now) {
    const people = [...this.queue.keys()].filter((id) => this.room.participants.get(id)?.connected !== false).slice(0, this.rules.gridSize);
    if (!people.length) {
      this.queue.clear();
      this.closeLobby();
      this.markState();
      return;
    }
    // Xe chạy thử (người không vào đua, bot chạy thử) rời đường; người đang chạy thử mà vào đua thì xếp lưới.
    for (const car of [...this.cars.values()]) {
      this.cars.delete(car.id);
      if (!car.bot && !people.includes(car.id)) this.sendMe(car.id);
    }
    const total = Math.min(this.rules.gridSize, Math.max(people.length, betweenInt(this.random, this.rules.botFill.cars)));
    const bots = this.idleBots().slice(0, total - people.length);
    const skills = new Map(bots.map((bot) => [bot.id, between(this.random, this.rules.botFill.skill)]));
    const field = this.gridOrder([...people.map((id) => this.room.participants.get(id)), ...bots], skills, now);
    this.lightsAt = now + this.rules.gridMs;
    this.startAt = this.lightsAt + 5 * this.rules.lightMs + Math.round(between(this.random, this.rules.lightsOutMs));
    this.endAt = this.startAt + this.rules.raceMs;
    this.finishAt = 0;
    this.raceBest = null;
    this.retired = new Map();
    this.phase = 'grid';
    // Màu của người chơi giữ nguyên; bot lấy màu còn trống sau khi trừ màu của mọi người trong lưới.
    const reserved = new Set(people.map((id) => this.colorOf(id)));
    field.forEach(({ participant, quali }, slot) => {
      const car = this.addCar(participant, 'race', gridSlot(this.track, slot), reserved, skills.get(participant.id));
      car.slot = slot;
      if (quali !== null) car.quali = quali;
      car.tracker.startRace(this.startAt);
      car.tracker.update(car.x, car.z, now);
      if (participant.bot) car.at = now;
      this.queue.delete(participant.id);
    });
    for (const id of people) this.sendMe(id, { spawn: true });
    this.markState();
  }

  // Thứ tự lưới: ai có vòng trong qualifyMs gần đây (bot: giờ ước theo trình độ) xếp theo giờ, nhanh trước; người chưa có
  // vòng bốc thăm chỗ (chen vào giữa như lưới ngẫu nhiên cũ) nên chạy thử chỉ có lợi khi chạy nhanh.
  gridOrder(field, skills, now) {
    const since = now - (this.rules.qualifyMs ?? 30 * 60_000);
    for (const [id, entry] of this.quali) if (entry.at < since) this.quali.delete(id);
    const timed = [];
    const open = [];
    for (const participant of field) {
      const quali = participant.bot ? botQualiMs(this.track, skills.get(participant.id), this.random) : this.quali.get(participant.id)?.ms ?? null;
      (quali === null ? open : timed).push({ participant, quali });
    }
    timed.sort((a, b) => a.quali - b.quali);
    const slots = Array.from({ length: field.length }, (_, index) => index);
    const order = new Array(field.length);
    for (const entry of open) order[slots.splice(Math.floor(this.random() * slots.length), 1)[0]] = entry;
    slots.forEach((slot, index) => { order[slot] = timed[index]; });
    return order;
  }

  endRace(now) {
    const finishers = this.standings();
    this.result = finishers.map((car, index) => this.driverEntry(car, { pos: index + 1, result: true }));
    const results = finishers
      .map((car, index) => ({ car, pos: index + 1 }))
      .filter(({ car }) => !car.bot && car.accountId)
      .map(({ car, pos }) => ({
        accountId: car.accountId,
        displayName: car.name,
        pos,
        ...(car.done ? { totalMs: car.total } : {}),
        ...(car.best !== null ? { bestMs: car.best } : {}),
        laps: car.lap,
        dnf: !car.done,
      }));
    if (results.length && this.onResult) {
      Promise.resolve(this.onResult({ raceId: this.raceId, cars: finishers.length, results })).catch(() => {});
    }
    // Người vừa đua (còn kết nối) tự xếp vào cuộc đua sau; bấm Rời là thôi.
    for (const car of finishers) {
      if (car.bot || car.dnf) continue;
      if (this.room.participants.get(car.id)?.connected === false) continue;
      this.queue.set(car.id, car.color);
    }
    this.cars.clear();
    this.retired = new Map();
    this.phase = 'result';
    this.endAt = now + this.rules.resultMs;
    for (const car of finishers) if (!car.bot) this.sendMe(car.id);
    this.markState();
  }

  checkFinish(now = this.now()) {
    if (this.phase !== 'racing') return;
    const racers = [...this.cars.values()].filter((car) => car.mode === 'race');
    const humans = racers.some((car) => !car.bot);
    // Hết người thật trên đường (bỏ cuộc / mất mạng) hoặc mọi xe đã về: kết thúc.
    if (!racers.length || !humans || racers.every((car) => car.done)) this.endAt = Math.min(this.endAt, now);
  }

  // ---- Vòng / về đích ----
  lapEvent(car, event) {
    if (event.type !== 'lap') return;
    car.lap = event.lap;
    car.last = event.ms;
    const best = event.valid && (car.best === null || event.ms < car.best);
    if (best) car.best = event.ms;
    if (!car.bot && event.valid) {
      const known = this.quali.get(car.id);
      const now = this.now();
      if (!known || event.ms < known.ms || known.at < now - (this.rules.qualifyMs ?? 30 * 60_000)) this.quali.set(car.id, { ms: event.ms, at: now });
    }
    const record = car.mode === 'race' && event.valid && (this.raceBest === null || event.ms < this.raceBest);
    if (record) this.raceBest = event.ms;
    this.room.broadcast({
      v: PROTOCOL_VERSION, type: 'race.lap', epoch: this.room.epoch, id: car.id, lap: Math.min(999, event.lap), ms: event.ms,
      ...(best ? { best: true } : {}), ...(record ? { record: true } : {}), ...(event.valid ? {} : { invalid: true }),
    });
    if (!car.bot && car.accountId && event.valid && this.onLap) {
      const key = `${car.mode === 'race' ? this.raceId : `pr-${car.since.toString(36)}`}-${car.id}-${event.lap}`.slice(0, 120);
      Promise.resolve(this.onLap({ key, accountId: car.accountId, displayName: car.name, lapMs: event.ms, mode: car.mode })).catch(() => {});
    }
    if (car.mode === 'race' && this.phase === 'racing' && event.lap >= this.rules.laps && !car.done) {
      car.done = true;
      car.total = car.tracker.state.laps.reduce((sum, lap) => sum + lap.ms, 0);
      const now = this.now();
      if (!this.finishAt) {
        this.finishAt = now;
        this.endAt = Math.min(this.endAt, now + this.rules.finishMs);
      }
      this.checkFinish(now);
    }
    this.markState();
  }

  standings() {
    const racers = [...this.cars.values(), ...(this.retired?.values() || [])].filter((car) => car.mode === 'race');
    return racers.sort((a, b) => {
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      if (a.done !== b.done) return a.done ? -1 : 1;
      if (a.done) return a.total - b.total;
      return b.tracker.progress() - a.tracker.progress();
    });
  }

  // ---- Tiện ích ----
  // Màu xe của người chơi: màu đã chọn, chưa chọn thì một màu còn trống (giữ luôn cho các lần sau).
  colorOf(id) {
    if (!this.colors.has(id)) this.colors.set(id, this.botColor());
    return this.colors.get(id);
  }

  idleBots() {
    return [...this.room.participants.values()].filter((participant) => participant.bot && !this.cars.has(participant.id));
  }

  // Chỗ ra đường chạy thử xa các xe đang ở gần vạch nhất.
  freeSpawn() {
    let best = null;
    for (let index = 0; index < 6; index += 1) {
      const spot = spawnPoint(this.track, index);
      const nearest = Math.min(Infinity, ...[...this.cars.values()].map((car) => Math.hypot(car.x - spot.x, car.z - spot.z)));
      if (!best || nearest > best.nearest) best = { spot, nearest };
    }
    return best.spot;
  }

  addCar(participant, mode, spot, reserved = null, skill = null) {
    const now = this.now();
    const bot = Boolean(participant.bot);
    const color = bot ? this.botColor(reserved) : this.colorOf(participant.id);
    const tracker = createLapTracker(this.track);
    const car = {
      id: participant.id,
      bot,
      accountId: bot ? null : participant.accountId || null,
      name: participant.displayName,
      skin: participant.skin,
      color,
      mode,
      slot: undefined,
      x: spot.x, z: spot.z, h: spot.h, v: 0, s: spot.s, d: spot.d ?? 0, index: -1,
      at: now,
      since: now,
      tracker,
      lap: 0,
      best: null,
      last: null,
      done: false,
      dnf: false,
      total: null,
      stuck: 0,
      spawn: { x: spot.x, z: spot.z, h: spot.h },
    };
    if (bot) {
      car.body = placeCar(createCar(spot), this.track);
      car.driver = createDriver({ skill: skill ?? between(this.random, this.rules.botFill.skill), lane: (this.random() - 0.5) * 1.2, random: this.random });
    }
    if (mode === 'practice') tracker.update(spot.x, spot.z, now);
    this.cars.set(participant.id, car);
    return car;
  }

  botColor(reserved = null) {
    const used = new Set([...this.cars.values()].map((car) => car.color));
    for (const color of reserved || []) used.add(color);
    const free = [0, 1, 2, 3, 4, 5, 6, 7].filter((color) => !used.has(color));
    return free.length ? free[Math.floor(this.random() * free.length)] : Math.floor(this.random() * 8);
  }

  // Đổi pha / có người vào ra: gửi race.state ở nhịp kế (≤ 50 ms).
  markState() {
    this.stateDirty = true;
  }

  broadcastState(now = this.now()) {
    this.stateDirty = false;
    this.stateAt = now;
    this.room.broadcast(this.stateMessage());
  }

  driverEntry(car, { pos, result = false } = {}) {
    return {
      id: car.id,
      displayName: car.name,
      color: car.color,
      mode: car.mode,
      ...(car.skin ? { skin: car.skin } : {}),
      ...(car.slot !== undefined && !result ? { slot: car.slot } : {}),
      lap: Math.min(99, car.lap),
      ...(pos ? { pos } : {}),
      ...(car.best !== null ? { best: car.best } : {}),
      ...(car.last !== null && !result ? { last: car.last } : {}),
      ...(car.quali !== undefined ? { quali: car.quali } : {}),
      ...(car.done ? { done: true, total: car.total } : {}),
      ...(car.dnf ? { dnf: true } : {}),
    };
  }

  driverList() {
    const positions = new Map();
    if (this.phase === 'grid' || this.phase === 'racing') this.standings().forEach((car, index) => positions.set(car.id, index + 1));
    return [...this.cars.values()].slice(0, 16).map((car) => this.driverEntry(car, { pos: positions.get(car.id) }));
  }

  carsMessage(now) {
    return {
      v: PROTOCOL_VERSION,
      type: 'race.cars',
      epoch: this.room.epoch,
      t: now,
      cars: [...this.cars.values()].slice(0, 16).map((car) => ({ id: car.id, ...roundCar(car), t: Math.round(car.at) })),
    };
  }

  // Gửi riêng: chế độ hiện tại; spawn = vừa được đặt xe (chạy thử / lưới); reset = gói vừa gửi bị bác.
  sendMe(id, { spawn = false, reset = false } = {}) {
    const car = this.cars.get(id);
    const mode = car?.mode === 'race' ? 'race' : this.queue.has(id) ? 'queued' : car ? 'practice' : 'none';
    const message = { v: PROTOCOL_VERSION, type: 'race.me', epoch: this.room.epoch, mode, color: car?.color ?? this.colorOf(id) };
    if (car?.slot !== undefined) message.slot = car.slot;
    if (spawn && car) message.spawn = { ...car.spawn };
    if (reset && car) message.reset = { x: car.x, z: car.z, h: car.h };
    this.room.sendTo(id, message);
  }
}

// Báo API vòng / kết quả của thành viên (Bảng vàng). Lỗi mạng chỉ ghi cảnh báo: đua vẫn tiếp tục.
export function raceRecorder(apiInternalUrl, key) {
  const call = (path) => (body) => fetch(new URL(path, apiInternalUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => (response.ok ? response.json() : null)).catch((error) => {
    console.warn(`Đua xe: không gọi được API (${path}): ${error.message}`);
    return null;
  });
  return { onLap: call('/internal/race/lap'), onResult: call('/internal/race/result') };
}
