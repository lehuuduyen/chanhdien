// Máy realtime cần đo, chạy trong tiến trình riêng (để CPU của client giả không lẫn vào số đo của server).
// Giống `npm run dev:realtime` nhưng: không bot, danh bạ trong bộ nhớ, và nâng sức chứa phòng lên LOADTEST_ROOM_CAP
// để tìm giới hạn thật thay vì dừng ở số bồ đoàn cấu hình. maxWalkers giữ nguyên theo room rules.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createRealtimeServer } from '../../apps/realtime/server.mjs';

const port = Number(process.env.LOADTEST_PORT) || 4511;
const cap = Number(process.env.LOADTEST_ROOM_CAP) || 5_000;

const server = createRealtimeServer({ nodeId: 'rt-loadtest', publicUrl: `ws://127.0.0.1:${port}/ws`, botCounts: { thien: 0, cinema: 0 } });
const registry = server.roomRegistry;
const open = registry.open.bind(registry);
registry.open = async (roomId) => {
  const opened = await open(roomId);
  if (opened.ok) opened.room.maxParticipants = cap;
  return opened;
};

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
let lastCpu = process.cpuUsage();
let lastAt = process.hrtime.bigint();
let lastBytes = 0;
let closedBytes = 0;

server.webSocketServer.on('connection', (socket) => {
  const raw = socket._socket;
  raw.once('close', () => { closedBytes += raw.bytesWritten; });
});

// Số đo từ lần hỏi trước tới giờ: CPU (% một nhân), RAM, độ trễ event loop, băng thông ra.
function sample() {
  const cpu = process.cpuUsage(lastCpu);
  const now = process.hrtime.bigint();
  const wallMs = Number(now - lastAt) / 1e6;
  let bytes = closedBytes;
  for (const client of server.webSocketServer.clients) bytes += client._socket?.bytesWritten || 0;
  const result = {
    cpuPercent: ((cpu.user + cpu.system) / 1000 / wallMs) * 100,
    rssMb: process.memoryUsage().rss / 1048576,
    loopP50Ms: loopDelay.percentile(50) / 1e6,
    loopP99Ms: loopDelay.percentile(99) / 1e6,
    loopMaxMs: loopDelay.max / 1e6,
    outMbps: ((bytes - lastBytes) * 8) / 1e6 / (wallMs / 1000),
    connections: server.webSocketServer.clients.size,
    rooms: [...registry.rooms.values()].map((room) => ({ id: room.id, people: room.realCount, walkers: room.walkers })),
  };
  lastCpu = process.cpuUsage();
  lastAt = now;
  lastBytes = bytes;
  loopDelay.reset();
  return result;
}

process.on('message', (message) => {
  if (message === 'sample') process.send({ type: 'sample', value: sample() });
});

server.listen(port, '127.0.0.1', () => process.send?.({ type: 'ready', port }));
process.once('SIGTERM', async () => {
  await registry.shutdown();
  for (const client of server.webSocketServer.clients) client.terminate();
  server.close();
  process.exit(0);
});
