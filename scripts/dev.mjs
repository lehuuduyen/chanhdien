import { spawn } from 'node:child_process';

// `npm run dev`: một máy realtime, danh bạ trong bộ nhớ.
// `npm run dev:cluster`: hai máy realtime dùng chung Redis (cần Redis ở REDIS_URL, mặc định cổng 6379 local).
const cluster = process.argv.includes('--cluster');
const WEB_PORT = process.env.WEB_PORT || '3000';
const API_PORT = process.env.API_PORT || '4000';
const REALTIME_PORT = process.env.REALTIME_PORT || '4001';
const REALTIME_PORT_2 = process.env.REALTIME_PORT_2 || String(Number(REALTIME_PORT) + 1);
const shared = { API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`, ...(cluster ? { REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379' } : {}) };

const services = [
  ['web', 'apps/web/server.mjs', { WEB_PORT, API_UPSTREAM: `http://127.0.0.1:${API_PORT}`, REALTIME_UPSTREAM: `http://127.0.0.1:${REALTIME_PORT}` }],
  ['api', 'apps/api/server.mjs', { ...shared, API_PORT, REALTIME_INTERNAL_URL: `http://127.0.0.1:${REALTIME_PORT}` }],
  ['realtime', 'apps/realtime/server.mjs', { ...shared, REALTIME_PORT, NODE_ID: 'rt-1' }],
];
if (cluster) services.push(['realtime-2', 'apps/realtime/server.mjs', { ...shared, REALTIME_PORT: REALTIME_PORT_2, NODE_ID: 'rt-2' }]);

const children = services.map(([name, file, env]) => {
  const child = spawn(process.execPath, [file], {
    env: { ...process.env, ...env, SERVICE_NAME: name },
    stdio: 'inherit',
  });
  child.once('exit', (code, signal) => {
    // Ở chế độ cluster, một máy realtime chết là tình huống cần thử (failover): không tắt cả cụm.
    if (cluster && name.startsWith('realtime') && !stopping) {
      console.error(`${name} đã dừng (${signal || code}); phòng sẽ chuyển sang máy còn lại.`);
      return;
    }
    if (!stopping && (code !== 0 || signal)) {
      console.error(`${name} đã dừng ngoài dự kiến (${signal || code}).`);
      stop(code || 1);
    }
  });
  return child;
});

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 1_000).unref();
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
