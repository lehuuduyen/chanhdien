// Thống kê người chơi thật (không tính bot) gửi nhóm Telegram quản trị mỗi VISITOR_REPORT_HOURS giờ (mặc định 2, 0 = tắt)
// vào giờ chẵn theo GARDEN_TIMEZONE, và trả lời lệnh /thongke trong nhóm. Hai nguồn số liệu:
// - Người vào: mỗi lần xin vé vào phòng (POST /api/v1/rooms/join; bot không xin vé) ghi một dòng theo (ngày, người, khu):
//   thành viên theo mã tài khoản, khách theo địa chỉ mạng băm kèm khóa bí mật (không lưu IP; nhiều khách chung một mạng chỉ
//   tính một). Giữ KEEP_DAYS ngày rồi xóa. Mỗi dòng mang `first_day`: ngày đầu tiên thấy người đó còn trong sổ (chép từ
//   dòng cũ nhất lúc ghi), để biết người mới và tỉ lệ quay lại mà không phải giữ sổ lâu hơn.
// - Mở trang: mỗi trang vào (trang chủ, chánh điện, rạp, các phòng game, shop) gửi POST /api/v1/visit { page, src } một lần
//   mỗi lần tải; ghi một dòng (ngày, người) với trang mở đầu tiên và nguồn (`src` của link quảng cáo, hoặc trang giới thiệu
//   / app mà trình duyệt tự nhận ra; '' = vào thẳng). Dùng để biết clip / mạng nào đưa người tới và bao nhiêu người mở trang
//   rồi vào phòng. Không lưu đường dẫn hay trang giới thiệu đầy đủ.
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
// Trang ghi lượt mở (khóa gửi từ trình duyệt) và nguồn: chữ thường / số / gạch, ≤ 32 ký tự; sai dạng coi như vào thẳng.
export const VISIT_PAGES = Object.freeze(['home', 'temple', 'cinema', 'race', 'tienlen', 'loto', 'baucua', 'taixiu', 'rps', 'shop']);
const SOURCE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const visitSource = (value) => {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SOURCE.test(text) ? text : '';
};
const SOURCE_NAME = (src) => src || 'vào thẳng';
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
// Cộng / trừ ngày trên chuỗi 'YYYY-MM-DD' (ngày theo lịch, không phụ thuộc múi giờ).
export function shiftDay(day, days) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

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
    CREATE TABLE IF NOT EXISTS visitor_opens (
      day TEXT NOT NULL,
      visitor TEXT NOT NULL,
      member INTEGER NOT NULL,
      page TEXT NOT NULL,
      src TEXT NOT NULL,
      first_at INTEGER NOT NULL,
      PRIMARY KEY (day, visitor)
    );
    CREATE TABLE IF NOT EXISTS visitor_reports (
      slot TEXT PRIMARY KEY,
      sent_at INTEGER NOT NULL
    );
  `);
  // Sổ cũ chưa có first_day: thêm cột (dòng cũ để trống, không tính là người mới).
  if (!db.prepare('PRAGMA table_info(visitor_days)').all().some((column) => column.name === 'first_day')) {
    db.exec('ALTER TABLE visitor_days ADD COLUMN first_day TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS visitor_days_visitor ON visitor_days (visitor)');
  const q = {
    seen: db.prepare(`INSERT INTO visitor_days (day, visitor, member, area, first_at, last_at, first_day) VALUES (?, ?, ?, ?, ?, ?,
        COALESCE((SELECT MIN(COALESCE(first_day, day)) FROM visitor_days WHERE visitor = ?), ?))
      ON CONFLICT(day, visitor, area) DO UPDATE SET last_at = excluded.last_at`),
    open: db.prepare(`INSERT INTO visitor_opens (day, visitor, member, page, src, first_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, visitor) DO UPDATE SET src = CASE WHEN visitor_opens.src = '' THEN excluded.src ELSE visitor_opens.src END`),
    active: db.prepare('SELECT DISTINCT day, visitor, first_day FROM visitor_days WHERE day >= ?'),
    opens: db.prepare('SELECT day, visitor, src FROM visitor_opens WHERE day >= ?'),
    pruneOpens: db.prepare('DELETE FROM visitor_opens WHERE day < ?'),
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

  // Người mới và quay lại, tính trên sổ KEEP_DAYS ngày. Người mới ngày X = có vào phòng ngày X và first_day = X.
  // Hôm sau: người mới hôm kia có vào lại hôm qua. Trong 7 ngày: người mới ngày X = hôm nay − 8 có vào lại ngày nào trong
  // X + 1 … X + 7. Nguồn của người mới = nguồn lượt mở trang cùng ngày (không có thì vào thẳng).
  function journey(today) {
    const from = shiftDay(today, -KEEP_DAYS);
    const days = new Map();
    const fresh = new Map();
    for (const row of q.active.all(from)) {
      if (!days.has(row.visitor)) days.set(row.visitor, new Set());
      days.get(row.visitor).add(row.day);
      if (row.first_day === row.day) fresh.set(`${row.day}|${row.visitor}`, true);
    }
    const sources = new Map();
    for (const row of q.opens.all(from)) sources.set(`${row.day}|${row.visitor}`, row.src);
    const cohort = (day, back) => {
      const result = { cohort: 0, back: 0 };
      for (const [visitor, seen] of days) {
        if (!fresh.has(`${day}|${visitor}`)) continue;
        result.cohort += 1;
        if (back.some((later) => seen.has(later))) result.back += 1;
      }
      return result;
    };
    const yesterday = shiftDay(today, -1);
    const weekStart = shiftDay(today, -KEEP_DAYS);
    const week = Array.from({ length: 7 }, (_, index) => shiftDay(weekStart, index + 1));
    // Theo nguồn 7 ngày qua (hôm qua về trước 7 ngày + hôm nay): người mở trang, trong đó vào phòng cùng ngày; người mới
    // của nguồn (ngày X ≤ hôm kia) và số quay lại hôm sau.
    const bySource = new Map();
    const source = (src) => {
      if (!bySource.has(src)) bySource.set(src, { src, opens: 0, joined: 0, cohort: 0, back: 0 });
      return bySource.get(src);
    };
    const sourceFrom = shiftDay(today, -6);
    for (const [key, src] of sources) {
      const [day, visitor] = key.split('|');
      if (day < sourceFrom) continue;
      const entry = source(src);
      entry.opens += 1;
      if (days.get(visitor)?.has(day)) entry.joined += 1;
    }
    for (const [key] of fresh) {
      const [day, visitor] = key.split('|');
      if (day < shiftDay(today, -7) || day > shiftDay(today, -2)) continue;
      const entry = source(sources.get(key) ?? '');
      entry.cohort += 1;
      if (days.get(visitor)?.has(shiftDay(day, 1))) entry.back += 1;
    }
    const todayOpens = new Map();
    for (const [key, src] of sources) {
      const [day, visitor] = key.split('|');
      if (day !== today) continue;
      const entry = todayOpens.get(src) || { src, opens: 0, joined: 0 };
      entry.opens += 1;
      if (days.get(visitor)?.has(day)) entry.joined += 1;
      todayOpens.set(src, entry);
    }
    const order = (a, b) => b.opens - a.opens || b.cohort - a.cohort || a.src.localeCompare(b.src);
    const opens = [...todayOpens.values()].sort(order);
    return {
      opens: {
        total: opens.reduce((sum, item) => sum + item.opens, 0),
        joined: opens.reduce((sum, item) => sum + item.joined, 0),
        sources: opens,
      },
      nextDay: cohort(shiftDay(today, -2), [yesterday]),
      week: cohort(weekStart, week),
      sources: [...bySource.values()].sort(order),
    };
  }

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
      const day = visitorDay(at, timeZone);
      q.seen.run(day, visitor, accountId ? 1 : 0, visitorAreaOf(roomTypeOf(roomId)), at, at, visitor, day);
    },
    // Một lần mở trang (POST /api/v1/visit): trang lạ thì bỏ qua; mỗi người một dòng mỗi ngày (trang đầu tiên, nguồn đầu
    // tiên khác vào thẳng).
    recordOpen({ accountId = null, ip = '', page = '', src = '' } = {}) {
      if (!VISIT_PAGES.includes(page)) return false;
      const at = now();
      q.open.run(visitorDay(at, timeZone), accountId ? `a:${accountId}` : guestKey(ip), accountId ? 1 : 0, page, visitSource(src), at);
      return true;
    },
    // Nguồn 7 ngày qua + người mới quay lại (lệnh /nguon).
    journey(at = now()) {
      return { timeZone, end: at, ...journey(visitorDay(at, timeZone)) };
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
        ...journey(visitorDay(end, timeZone)),
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
      const cutoff = visitorDay(now() - KEEP_DAYS * DAY, timeZone);
      q.prune.run(cutoff);
      q.pruneOpens.run(cutoff);
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
    ...(report.opens ? openLines(report.opens) : []),
    ...(report.nextDay ? [returnLine(report)] : []),
    'Không tính bot. Khách đếm theo mạng internet (nhiều khách chung một wifi tính một người); một người vào nhiều khu được tính ở mỗi khu.',
  ];
  return lines.join('\n');
}

// Mở trang hôm nay → vào phòng, kèm 4 nguồn nhiều người nhất.
function openLines(opens) {
  if (!opens.total) return ['🔗 Mở trang từ 0h: 0 người'];
  const top = opens.sources.slice(0, 4).map((item) => `${SOURCE_NAME(item.src)} ${item.opens}→${item.joined}`);
  const more = opens.sources.length > 4 ? ' · …' : '';
  return [
    `🔗 Mở trang từ 0h: ${opens.total} người · vào phòng ${opens.joined} (${percent(opens.joined, opens.total)})`,
    `    ${top.join(' · ')}${more}`,
  ];
}
const returnLine = ({ nextDay, week }) => `🔁 Người mới quay lại: hôm sau ${nextDay.back}/${nextDay.cohort} (${percent(nextDay.back, nextDay.cohort)})`
  + ` · trong 7 ngày ${week.back}/${week.cohort} (${percent(week.back, week.cohort)})`;

// Lệnh /nguon: mỗi nguồn 7 ngày qua một dòng (mở trang → vào phòng; người mới → quay lại hôm sau).
export function visitorSourcesText(journey) {
  const { day, month } = localParts(journey.end, journey.timeZone);
  const lines = [`🔗 Nguồn người tới · 7 ngày tới ${day}/${month}`];
  if (!journey.sources.length) lines.push('Chưa có lượt mở trang nào.');
  for (const item of journey.sources.slice(0, 20)) {
    lines.push(`${SOURCE_NAME(item.src)}: mở ${item.opens} → vào ${item.joined} (${percent(item.joined, item.opens)})`
      + ` · người mới ${item.cohort}, quay lại hôm sau ${item.back} (${percent(item.back, item.cohort)})`);
  }
  if (journey.sources.length > 20) lines.push(`… và ${journey.sources.length - 20} nguồn khác`);
  lines.push(returnLine(journey));
  lines.push('Nguồn = ?src= trên link (vd. lotusgather.online/dua-xe.html?src=tt-duaxe), trang / app dẫn tới, hoặc "vào thẳng". Không tính bot.');
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
// của kỳ báo cáo định kỳ). /nguon: người tới theo nguồn 7 ngày qua.
export function visitorStatsTelegramCommand(text, stats, { hours = 2, now = Date.now } = {}) {
  if (!stats || typeof text !== 'string') return null;
  if (/^\/nguon(?:@[A-Za-z0-9_]+)?$/i.test(text.trim())) return visitorSourcesText(stats.journey(now()));
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
