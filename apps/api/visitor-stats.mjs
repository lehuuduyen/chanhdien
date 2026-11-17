// Thống kê người chơi thật (không tính bot) gửi nhóm Telegram quản trị mỗi VISITOR_REPORT_HOURS giờ (mặc định 2, 0 = tắt)
// vào giờ chẵn theo GARDEN_TIMEZONE, và trả lời lệnh /thongke trong nhóm. Hai nguồn số liệu:
// - Người vào: mỗi lần xin vé vào phòng (POST /api/v1/rooms/join; bot không xin vé) ghi một dòng theo (ngày, người, khu):
//   thành viên theo mã tài khoản, khách theo địa chỉ mạng băm kèm khóa bí mật (không lưu IP; nhiều khách chung một mạng chỉ
//   tính một). Giữ KEEP_DAYS ngày rồi xóa.
// - Đang online: máy realtime gửi kèm số người thật đang kết nối trong lần báo presence 15 giây (`humans`); API cộng các
//   máy còn báo trong ONLINE_TTL_MS gần nhất và giữ mức đông nhất của kỳ báo cáo (trong bộ nhớ, khởi động lại thì tính lại).
import { createHash } from 'node:crypto';
import { requestIp } from '../../packages/moderation/src/index.mjs';
import { roomTypeOf, VISITOR_AREAS, visitorAreaOf } from '@chanh-dien/room-rules';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ONLINE_TTL_MS = 60_000;
const KEEP_DAYS = 8;
const NODE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_COUNT = 1_000_000;
// Chu kỳ báo cáo hợp lệ: chia hết 24 giờ để mốc gửi luôn rơi vào cùng giờ mỗi ngày.
export const VISITOR_REPORT_HOURS = Object.freeze([1, 2, 3, 4, 6, 8, 12, 24]);
const AREA_NAMES = { temple: 'Chánh điện', cinema: 'Rạp phim', games: 'Phòng game' };

const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? Math.min(value, MAX_COUNT) : 0);
const emptyAreas = () => Object.fromEntries(VISITOR_AREAS.map((area) => [area, 0]));

function localParts(at, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(at)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}
export const visitorDay = (at, timeZone) => {
  const parts = localParts(at, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Mốc gửi kế tiếp sau `at`: giờ địa phương chia hết cho `hours`, phút 0 (vd. 2 giờ: 0h, 2h, 4h… theo GARDEN_TIMEZONE).
export function nextReportAt(at, hours, timeZone) {
  const parts = localParts(at, timeZone);
  const into = ((Number(parts.hour) % hours) * 60 + Number(parts.minute)) * MINUTE + Number(parts.second) * 1_000 + (at % 1_000);
  return at - into + hours * HOUR;
}

export function createVisitorStats({ db, secret = '', timeZone = 'America/Los_Angeles', now = Date.now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitor_days (
      day TEXT NOT NULL,
      visitor TEXT NOT NULL,
      member INTEGER NOT NULL,
      area TEXT NOT NULL,
      first_at INTEGER NOT NULL,
      last_at INTEGER NOT NULL,
      PRIMARY KEY (day, visitor, area)
    );
    CREATE INDEX IF NOT EXISTS visitor_days_last ON visitor_days (last_at);
    CREATE TABLE IF NOT EXISTS visitor_reports (
      slot TEXT PRIMARY KEY,
      sent_at INTEGER NOT NULL
    );
  `);
  const q = {
    seen: db.prepare(`INSERT INTO visitor_days (day, visitor, member, area, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, visitor, area) DO UPDATE SET last_at = excluded.last_at`),
    since: db.prepare(`SELECT COUNT(DISTINCT visitor) AS total, COUNT(DISTINCT CASE WHEN member = 1 THEN visitor END) AS members
      FROM visitor_days WHERE last_at >= ?`),
    sinceAreas: db.prepare('SELECT area, COUNT(DISTINCT visitor) AS n FROM visitor_days WHERE last_at >= ? GROUP BY area'),
    day: db.prepare(`SELECT COUNT(DISTINCT visitor) AS total, COUNT(DISTINCT CASE WHEN member = 1 THEN visitor END) AS members
      FROM visitor_days WHERE day = ?`),
    claim: db.prepare('INSERT OR IGNORE INTO visitor_reports (slot, sent_at) VALUES (?, ?)'),
    prune: db.prepare('DELETE FROM visitor_days WHERE day < ?'),
    pruneReports: db.prepare('DELETE FROM visitor_reports WHERE sent_at < ?'),
  };
  // Tài khoản mới đăng ký trong kỳ (bảng accounts của @chanh-dien/accounts; không có thì bỏ qua dòng này).
  let newAccounts = null;
  try { newAccounts = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE created_at > ? AND created_at <= ?'); } catch {}

  const nodes = new Map();
  let peak = { count: 0, at: now() };
  const guestKey = (ip) => `g:${createHash('sha256').update(`visitor-ip:${secret}:${String(ip || '').replace(/^::ffff:/, '')}`).digest('base64url').slice(0, 22)}`;

  function online() {
    const cutoff = now() - ONLINE_TTL_MS;
    const total = { members: 0, guests: 0, areas: emptyAreas() };
    for (const [nodeId, node] of nodes) {
      if (node.at < cutoff) {
        nodes.delete(nodeId);
        continue;
      }
      total.members += node.members;
      total.guests += node.guests;
      for (const area of VISITOR_AREAS) total.areas[area] += node.areas[area];
    }
    return { ...total, total: total.members + total.guests };
  }

  return {
    // Một lần xin vé vào phòng thành công: accountId (thành viên) hoặc ip (khách).
    recordJoin({ accountId = null, ip = '', roomId = '' } = {}) {
      const at = now();
      const visitor = accountId ? `a:${accountId}` : guestKey(ip);
      q.seen.run(visitorDay(at, timeZone), visitor, accountId ? 1 : 0, visitorAreaOf(roomTypeOf(roomId)), at, at);
    },
    // Máy realtime báo số người thật đang kết nối trên máy đó: { members, guests, areas: { temple, cinema, games } }.
    reportOnline(nodeId, humans) {
      if (!NODE_ID.test(String(nodeId || '')) || !humans || typeof humans !== 'object') return false;
      const areas = emptyAreas();
      for (const area of VISITOR_AREAS) areas[area] = count(humans.areas?.[area]);
      nodes.set(nodeId, { at: now(), members: count(humans.members), guests: count(humans.guests), areas });
      const current = online().total;
      if (current > peak.count) peak = { count: current, at: now() };
      return true;
    },
    online,
    // Số liệu của kỳ [start, end): người đã vào (theo lần cuối thấy), đông nhất, đăng ký mới, cả ngày hôm nay.
    // resetPeak: báo cáo định kỳ xong thì kỳ sau đếm mức đông nhất lại từ số đang online.
    report({ start, end = now(), resetPeak = false } = {}) {
      const current = online();
      const window = q.since.get(start);
      const areas = emptyAreas();
      for (const row of q.sinceAreas.all(start)) if (row.area in areas) areas[row.area] = row.n;
      const today = q.day.get(visitorDay(end, timeZone));
      const result = {
        start, end, timeZone,
        online: current,
        peak: peak.count >= current.total ? { ...peak } : { count: current.total, at: end },
        visitors: { total: window.total, members: window.members, guests: window.total - window.members, areas },
        today: { total: today.total, members: today.members, guests: today.total - today.members },
        newMembers: newAccounts ? newAccounts.get(start, end).n : null,
      };
      if (resetPeak) peak = { count: current.total, at: end };
      return result;
    },
    // Giành quyền gửi báo cáo của một mốc (chống gửi trùng khi khởi động lại hoặc chạy nhiều máy API chung database).
    claimSlot(slotAt) {
      q.pruneReports.run(now() - KEEP_DAYS * DAY);
      return q.claim.run(new Date(slotAt).toISOString(), now()).changes === 1;
    },
    prune() {
      q.prune.run(visitorDay(now() - KEEP_DAYS * DAY, timeZone));
    },
  };
}

// Chữ gửi Telegram (chữ thường, không định dạng).
export function visitorReportText(report) {
  const { timeZone } = report;
  const clock = (at) => new Intl.DateTimeFormat('vi-VN', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  const { day, month } = localParts(report.end, timeZone);
  const date = `${day}/${month}`;
  const zone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(report.end).find((part) => part.type === 'timeZoneName')?.value || timeZone;
  const hours = Math.max(1, Math.round((report.end - report.start) / HOUR));
  const split = ({ members, guests }) => `thành viên ${members} · khách ${guests}`;
  const areas = (values) => VISITOR_AREAS.map((area) => `${AREA_NAMES[area]} ${values[area]}`).join(' · ');
  const lines = [
    `📊 Người chơi thật · ${clock(report.start)}–${clock(report.end)} ngày ${date} (giờ ${zone})`,
    `👥 Đang online: ${report.online.total} (${split(report.online)})`,
    ...(report.online.total ? [`    ${areas(report.online.areas)}`] : []),
    `📈 Đông nhất ${hours} giờ qua: ${report.peak.count} người lúc ${clock(report.peak.at)}`,
    `🚶 Đã vào trong ${hours} giờ qua: ${report.visitors.total} người (${split(report.visitors)})`,
    ...(report.visitors.total ? [`    ${areas(report.visitors.areas)}`] : []),
    ...(report.newMembers === null ? [] : [`🆕 Đăng ký mới: ${report.newMembers}`]),
    `📅 Từ 0h hôm nay: ${report.today.total} người (${split(report.today)})`,
    'Không tính bot. Khách đếm theo mạng internet (nhiều khách chung một wifi tính một người); một người vào nhiều khu được tính ở mỗi khu.',
  ];
  return lines.join('\n');
}

// Báo định kỳ: hẹn tới mốc giờ chẵn kế tiếp, giành mốc trong database rồi gửi. Trả hàm dừng.
export function startVisitorReports({ stats, send, hours = 2, now = Date.now, timeZone = 'America/Los_Angeles' }) {
  if (!stats || !send || !VISITOR_REPORT_HOURS.includes(hours)) return () => {};
  let timer = null;
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    const at = now();
    const slot = nextReportAt(at, hours, timeZone);
    timer = setTimeout(async () => {
      try {
        if (stats.claimSlot(slot)) {
          stats.prune();
          await send(visitorReportText(stats.report({ start: slot - hours * HOUR, end: slot, resetPeak: true })));
        }
      } catch (error) {
        console.warn(`Không gửi được thống kê người chơi: ${error.message}`);
      }
      schedule();
    }, Math.max(1_000, slot - at));
    timer.unref?.();
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

// Lệnh /thongke trong nhóm Telegram quản trị: số liệu của `hours` giờ gần nhất tính tới lúc gõ (không đổi mức đông nhất
// của kỳ báo cáo định kỳ).
export function visitorStatsTelegramCommand(text, stats, { hours = 2, now = Date.now } = {}) {
  if (!stats || typeof text !== 'string') return null;
  if (!/^\/?thongke(?:@[A-Za-z0-9_]+)?$/i.test(text.trim())) return null;
  const end = now();
  return visitorReportText(stats.report({ start: end - hours * HOUR, end }));
}

// Đọc cấu hình chu kỳ từ biến môi trường: VISITOR_REPORT_HOURS (mặc định 2; 0 = tắt; số khác không chia hết 24 → 2).
export function visitorReportHours(value) {
  if (value === undefined || value === '') return 2;
  const hours = Number(value);
  if (hours === 0) return 0;
  return VISITOR_REPORT_HOURS.includes(hours) ? hours : 2;
}

// Địa chỉ mạng của request (dùng như requestIpHash của kiểm duyệt nhưng giữ được cả IP nội bộ để máy dev vẫn đếm khách).
export const visitorIp = (req) => requestIp(req.headers || {}, req.socket?.remoteAddress);
