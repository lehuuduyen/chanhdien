// Đo một phòng chịu được bao nhiêu người trên MỘT máy realtime (chạy trên máy local, không gọi dịch vụ ngoài).
// Tăng dần số người trong cùng một phòng Thiền theo từng mốc; mỗi mốc giữ HOLD giây rồi đo cả hai phía.
//
//   node loadtest/room-capacity.mjs                       # mốc mặc định 20 → 2000
//   node loadtest/room-capacity.mjs 50,100,200 --hold 20  # mốc tự chọn
//   LOADTEST_WALKING=0.5 node loadtest/room-capacity.mjs  # đổi tỉ lệ người đang đi
//
// Đạt một mốc khi: chat p95 < 300 ms, ping p95 < 300 ms, vào phòng thành công ≥ 99,9 %, CPU máy realtime < 70 %
// (một nhân, vì Node chạy một luồng) và event loop p99 < 100 ms.
import { fork } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const steps = (args[0] && !args[0].startsWith('--') ? args[0] : '20,50,100,200,300,500,750,1000,1500,2000').split(',').map(Number);
const holdMs = Number(option('--hold', 30)) * 1000;
const joinsPerSecond = Number(option('--join-rate', 25));
const workerCount = Number(option('--workers', Math.max(2, Math.min(6, cpus().length - 3))));
const output = option('--out', join(here, 'results', `room-capacity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
const port = Number(process.env.LOADTEST_PORT) || 4511;
const roomId = 'thien-ca-vi-1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const once = (child, type) => new Promise((resolve) => {
  const listener = (message) => {
    if (message?.type !== type) return;
    child.off('message', listener);
    resolve(message.value);
  };
  child.on('message', listener);
});

const server = fork(join(here, 'lib/target-realtime.mjs'), { env: { ...process.env, LOADTEST_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
await once(server, 'ready');
const workers = [];
for (let index = 0; index < workerCount; index += 1) {
  const worker = fork(join(here, 'lib/fake-clients.mjs'), {
    env: { ...process.env, LOADTEST_URL: `ws://127.0.0.1:${port}/ws`, LOADTEST_ROOM: roomId, LOADTEST_WORKER: String(index + 1) },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  await once(worker, 'ready');
  workers.push(worker);
}

const sampleServer = () => {
  const reply = once(server, 'sample');
  server.send('sample');
  return reply;
};
async function collect() {
  const replies = await Promise.all(workers.map((worker) => {
    const reply = once(worker, 'stats');
    worker.send({ type: 'collect' });
    return reply;
  }));
  const merged = { chat: new Array(30_001).fill(0), ping: new Array(30_001).fill(0), join: new Array(30_001).fill(0), messages: 0, bytes: 0, chatSent: 0, chatRejected: 0, walkersFull: 0, closed: 0, failedJoins: 0, open: 0, errors: {} };
  for (const value of replies) {
    for (const key of ['chat', 'ping', 'join']) value[key].forEach((count, ms) => { merged[key][ms] += count; });
    for (const key of ['messages', 'bytes', 'chatSent', 'chatRejected', 'walkersFull', 'closed', 'failedJoins', 'open']) merged[key] += value[key];
    for (const [code, count] of Object.entries(value.errors)) merged.errors[code] = (merged.errors[code] || 0) + count;
  }
  return merged;
}
function percentile(bins, p) {
  const total = bins.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  let seen = 0;
  for (let ms = 0; ms < bins.length; ms += 1) {
    seen += bins[ms];
    if (seen >= total * p) return ms;
  }
  return bins.length - 1;
}
const total = (bins) => bins.reduce((sum, count) => sum + count, 0);

let people = 0;
let joinedTotal = { attempts: 0, failed: 0, join: new Array(30_001).fill(0) };
const results = [];
console.log(`Phòng ${roomId}, ${workerCount} tiến trình client giả, giữ ${holdMs / 1000}s mỗi mốc, vào ${joinsPerSecond} người/giây\n`);
console.log('người | đang đi | chat p50/p95/p99 ms | ping p95 | vào phòng p95 | CPU rt | loop p99 | ra Mbps | mỗi máy kbps | tin/giây/máy | đạt');

for (const target of steps) {
  const adding = target - people;
  if (adding > 0) {
    const overMs = (adding / joinsPerSecond) * 1000;
    const base = Math.floor(adding / workers.length);
    workers.forEach((worker, index) => worker.send({ type: 'add', count: base + (index < adding % workers.length ? 1 : 0), overMs }));
    joinedTotal.attempts += adding;
    people = target;
    await sleep(overMs + 5_000);
  }
  // Bỏ số đo lúc đang vào (để riêng thời gian vào phòng), rồi đo trạng thái ổn định.
  const ramp = await collect();
  ramp.join.forEach((count, ms) => { joinedTotal.join[ms] += count; });
  joinedTotal.failed += ramp.failedJoins;
  await sampleServer();
  await sleep(holdMs);
  const steady = await collect();
  const rt = await sampleServer();
  const seconds = holdMs / 1000;
  const room = rt.rooms.find((item) => item.id === roomId) || { people: 0, walkers: 0 };
  const failed = joinedTotal.failed + steady.failedJoins;
  const row = {
    target,
    inRoom: room.people,
    walkers: room.walkers,
    open: steady.open,
    joinSuccess: 1 - failed / Math.max(1, joinedTotal.attempts),
    joinP95: percentile(ramp.join, 0.95),
    chatP50: percentile(steady.chat, 0.5),
    chatP95: percentile(steady.chat, 0.95),
    chatP99: percentile(steady.chat, 0.99),
    chatDeliveries: total(steady.chat),
    chatSent: steady.chatSent,
    chatRejected: steady.chatRejected,
    pingP95: percentile(steady.ping, 0.95),
    pingP99: percentile(steady.ping, 0.99),
    perClientKbps: steady.open ? (steady.bytes * 8) / 1000 / seconds / steady.open : 0,
    perClientMsgs: steady.open ? steady.messages / seconds / steady.open : 0,
    droppedConnections: steady.closed + ramp.closed,
    errors: { ...ramp.errors, ...steady.errors },
    server: rt,
  };
  row.pass = row.chatP95 !== null && row.chatP95 < 300 && row.pingP95 < 300 && row.joinSuccess >= 0.999
    && rt.cpuPercent < 70 && rt.loopP99Ms < 100 && row.droppedConnections === 0;
  results.push(row);
  console.log([
    String(row.inRoom).padStart(5),
    String(row.walkers).padStart(7),
    `${row.chatP50}/${row.chatP95}/${row.chatP99}`.padStart(19),
    String(row.pingP95).padStart(8),
    String(row.joinP95 ?? '-').padStart(13),
    `${rt.cpuPercent.toFixed(0)}%`.padStart(6),
    `${rt.loopP99Ms.toFixed(0)}ms`.padStart(8),
    rt.outMbps.toFixed(1).padStart(7),
    row.perClientKbps.toFixed(0).padStart(12),
    row.perClientMsgs.toFixed(1).padStart(12),
    row.pass ? ' đạt' : ' KHÔNG',
  ].join(' | '));
  // Hỏng nặng thì dừng, không cần đẩy tiếp.
  if (row.chatP95 === null || row.chatP95 > 5_000 || row.joinSuccess < 0.95 || rt.loopP99Ms > 2_000) {
    console.log('\nDừng: phòng đã quá tải nặng ở mốc này.');
    break;
  }
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ roomId, holdMs, joinsPerSecond, workerCount, cpu: cpus()[0]?.model, results }, null, 2));
console.log(`\nKết quả chi tiết: ${output}`);
for (const worker of workers) worker.send({ type: 'stop' });
await sleep(500);
server.kill('SIGTERM');
await sleep(300);
process.exit(0);
