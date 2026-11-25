import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createAccountStore } from '@chanh-dien/accounts';
import { internalKey } from '@chanh-dien/session-token';
import { handleApiRequest } from '../server.mjs';
import { openFriendLinks } from '../friend-links.mjs';
import {
  createVisitorStats, nextReportAt, shiftDay, startVisitorReports, visitorReportHours, visitorReportText, visitSource,
  visitorStatsTelegramCommand,
} from '../visitor-stats.mjs';

// Phần hỏi tuổi + đồng ý điều khoản bắt buộc khi đăng ký qua API.
const SIGNUP = { birthYear: 1990, birthMonth: 5, acceptTerms: true };

const SECRET = 'test-secret-with-at-least-thirty-two-characters';
const HOOK = 'telegram-hook-secret';
const TZ = 'America/Los_Angeles';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// 13:30 ngày 17/11/2026 giờ California (UTC−8).
const AT_1330 = Date.parse('2026-11-17T21:30:00Z');

function store(start = AT_1330) {
  let clock = start;
  const accounts = createAccountStore({ now: () => clock });
  const stats = createVisitorStats({ db: accounts.database, secret: SECRET, timeZone: TZ, now: () => clock });
  return { accounts, stats, advance: (ms) => { clock += ms; }, now: () => clock };
}

test('người vào: thành viên theo tài khoản, khách theo mạng; đếm trong kỳ, theo khu và cả ngày', () => {
  const { stats, advance, now } = store(AT_1330 - 3 * HOUR);
  // 10:30: một khách vào chánh điện (trước kỳ 2 giờ của báo cáo lúc 14:00).
  stats.recordJoin({ ip: '9.9.9.9', roomId: 'thien-ca-vi-1' });
  advance(3 * HOUR);
  // 13:30: thành viên vào chánh điện rồi rạp (hai khu, vẫn một người), vào lại chánh điện; hai khách khác mạng, một khách
  // mở hai tab cùng mạng.
  stats.recordJoin({ accountId: 'a-member-0001', roomId: 'thien-ca-vi-1' });
  stats.recordJoin({ accountId: 'a-member-0001', roomId: 'cinema-vn' });
  stats.recordJoin({ accountId: 'a-member-0001', roomId: 'thien-ca-vi-1' });
  stats.recordJoin({ ip: '1.2.3.4', roomId: 'loto-1' });
  stats.recordJoin({ ip: '1.2.3.4', roomId: 'loto-1' });
  stats.recordJoin({ ip: '5.6.7.8', roomId: 'thien-vn-vi-1' });
  const report = stats.report({ start: now() - 2 * HOUR, end: now() });
  assert.deepEqual(report.visitors, { total: 3, members: 1, guests: 2, areas: { temple: 2, cinema: 1, games: 1 } });
  assert.deepEqual(report.today, { total: 4, members: 1, guests: 3 }, 'khách lúc 10:30 vẫn tính trong ngày');
});

test('đang online: cộng các máy realtime còn báo, bỏ máy im quá 60 giây; giữ mức đông nhất tới khi báo cáo xong', () => {
  const { stats, advance, now } = store();
  assert.equal(stats.reportOnline('rt-1', { members: 2, guests: 3, areas: { temple: 4, cinema: 1, games: 0 } }), true);
  stats.reportOnline('rt-2', { members: 1, guests: 0, areas: { temple: 0, cinema: 0, games: 1 } });
  assert.equal(stats.reportOnline('bad node!', { members: 1 }), false);
  assert.deepEqual(stats.online(), { members: 3, guests: 3, areas: { temple: 4, cinema: 1, games: 1 }, total: 6 });
  const peakAt = now();
  advance(30_000);
  stats.reportOnline('rt-1', { members: 1, guests: 1, areas: { temple: 2 } });
  advance(45_000);
  stats.reportOnline('rt-1', { members: 1, guests: -5, areas: { temple: 1 } });
  assert.equal(stats.online().total, 1, 'rt-2 im 75 giây bị bỏ; số âm coi như 0');
  const first = stats.report({ start: now() - 2 * HOUR, end: now(), resetPeak: true });
  assert.deepEqual(first.peak, { count: 6, at: peakAt });
  const second = stats.report({ start: now() - 2 * HOUR, end: now() });
  assert.equal(second.peak.count, 1, 'kỳ sau đếm lại từ số đang online');
});

test('mốc gửi rơi vào giờ chẵn theo múi giờ dự án; mỗi mốc chỉ gửi một lần', () => {
  assert.equal(nextReportAt(AT_1330, 2, TZ), Date.parse('2026-11-17T22:00:00Z'), '13:30 → 14:00');
  assert.equal(nextReportAt(Date.parse('2026-11-17T22:00:00Z'), 2, TZ), Date.parse('2026-11-18T00:00:00Z'), 'đúng 14:00 → 16:00');
  assert.equal(nextReportAt(Date.parse('2026-11-18T07:10:00Z'), 2, TZ), Date.parse('2026-11-18T08:00:00Z'), '23:10 → 0:00 hôm sau');
  assert.equal(nextReportAt(Date.parse('2026-11-17T22:59:00Z'), 1, TZ), Date.parse('2026-11-17T23:00:00Z'));
  const { stats } = store();
  const slot = Date.parse('2026-11-17T22:00:00Z');
  assert.equal(stats.claimSlot(slot), true);
  assert.equal(stats.claimSlot(slot), false, 'khởi động lại / máy API thứ hai không gửi trùng');
  assert.deepEqual(['', undefined, '2', '0', '5', '6', 'x'].map(visitorReportHours), [2, 2, 2, 0, 2, 6, 2]);
});

test('tin Telegram ghi đủ số liệu, khung giờ địa phương, không tính bot; /thongke trả cùng nội dung', () => {
  const { accounts, stats, now } = store();
  accounts.register({ username: 'nguoi.moi', password: 'matkhau123', displayName: 'Người Mới' });
  stats.recordJoin({ accountId: 'a-member-0001', roomId: 'thien-ca-vi-1' });
  stats.recordJoin({ ip: '1.2.3.4', roomId: 'cinema-vn' });
  stats.reportOnline('rt-1', { members: 1, guests: 1, areas: { temple: 1, cinema: 1, games: 0 } });
  const text = visitorReportText(stats.report({ start: now() - 2 * HOUR, end: now() }));
  assert.match(text, /Người chơi thật · 11:30–13:30 ngày 17\/11 \(giờ PST\)/);
  assert.match(text, /Đang online: 2 \(thành viên 1 · khách 1\)/);
  assert.match(text, /Chánh điện 1 · Rạp phim 1 · Phòng game 0/);
  assert.match(text, /Đã vào trong 2 giờ qua: 2 người \(thành viên 1 · khách 1\)/);
  assert.match(text, /Đăng ký mới: 1/);
  assert.match(text, /Từ 0h hôm nay: 2 người/);
  assert.match(text, /Không tính bot/);
  assert.equal(visitorStatsTelegramCommand('/thongke', stats, { now }), text);
  assert.equal(visitorStatsTelegramCommand('/thongke@ChanhDienBot', stats, { now }), text);
  assert.equal(visitorStatsTelegramCommand('/dsban', stats, { now }), null);
  assert.equal(visitorStatsTelegramCommand('/thongke', null, { now }), null);
});

test('mở trang theo nguồn → vào phòng; người mới quay lại hôm sau / trong 7 ngày; /nguon', () => {
  const { stats, advance, now } = store(AT_1330 - DAY);
  assert.equal(shiftDay('2026-11-30', 1), '2026-12-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(['TT-DuaXe', ' fb ', 'x y', '-a', 'a'.repeat(33), 42].map(visitSource), ['tt-duaxe', 'fb', '', '', '', '']);
  // Hôm trước (16/11): người cũ P đã vào.
  stats.recordJoin({ ip: '7.7.7.7', roomId: 'thien-ca-vi-1' });
  advance(DAY);
  // 17/11: A (khách) mở trang đua xe từ clip TikTok rồi vào; B mở trang chủ rồi bỏ đi; thành viên M mở từ cùng clip (chữ
  // hoa vẫn cùng nguồn) rồi vào; C vào mà trang không gửi lượt mở; P quay lại (không phải người mới).
  assert.equal(stats.recordOpen({ ip: '1.1.1.1', page: 'race', src: 'tt-duaxe' }), true);
  assert.equal(stats.recordOpen({ ip: '1.1.1.1', page: 'temple', src: '' }), true, 'cùng ngày: giữ trang + nguồn đầu tiên');
  stats.recordJoin({ ip: '1.1.1.1', roomId: 'duaxe-1' });
  stats.recordOpen({ ip: '2.2.2.2', page: 'home', src: '' });
  stats.recordOpen({ accountId: 'a-member-0001', page: 'home', src: 'TT-DuaXe' });
  stats.recordJoin({ accountId: 'a-member-0001', roomId: 'thien-ca-vi-1' });
  stats.recordJoin({ ip: '3.3.3.3', roomId: 'loto-1' });
  stats.recordJoin({ ip: '7.7.7.7', roomId: 'thien-ca-vi-1' });
  assert.equal(stats.recordOpen({ ip: '4.4.4.4', page: 'admin', src: 'x' }), false, 'trang lạ không ghi');
  const today = stats.report({ start: now() - 2 * HOUR, end: now() });
  assert.deepEqual(today.opens, {
    total: 3, joined: 2,
    sources: [{ src: 'tt-duaxe', opens: 2, joined: 2 }, { src: '', opens: 1, joined: 0 }],
  });
  const text = visitorReportText(today);
  assert.match(text, /Mở trang từ 0h: 3 người · vào phòng 2 \(67%\)/);
  assert.match(text, /tt-duaxe 2→2 · vào thẳng 1→0/);
  // 18/11: A quay lại; 24/11: C quay lại.
  advance(DAY);
  stats.recordJoin({ ip: '1.1.1.1', roomId: 'duaxe-1' });
  advance(DAY);
  const day3 = stats.journey(now());
  assert.deepEqual(day3.nextDay, { cohort: 3, back: 1 }, 'người mới 17/11: A, M, C; chỉ A vào lại 18/11');
  assert.deepEqual(day3.sources.find((item) => item.src === 'tt-duaxe'), { src: 'tt-duaxe', opens: 2, joined: 2, cohort: 2, back: 1 });
  assert.deepEqual(day3.sources.find((item) => item.src === ''), { src: '', opens: 1, joined: 0, cohort: 2, back: 1 }, 'không có lượt mở thì tính vào thẳng: P (mới 16/11, vào lại 17/11) và C');
  advance(4 * DAY);
  stats.recordJoin({ ip: '3.3.3.3', roomId: 'loto-1' });
  advance(2 * DAY);
  // 25/11 = 17/11 + 8: người mới 17/11 có vào lại trong 18–24/11.
  const week = stats.journey(now());
  assert.deepEqual(week.week, { cohort: 3, back: 2 });
  const sources = visitorStatsTelegramCommand('/nguon', stats, { now });
  assert.match(sources, /Nguồn người tới · 7 ngày tới 25\/11/);
  assert.match(sources, /trong 7 ngày 2\/3 \(67%\)/);
  assert.equal(visitorStatsTelegramCommand('/nguon@ChanhDienBot', stats, { now }), sources);
  // Dọn sổ: lượt mở cũ hơn KEEP_DAYS ngày bị xóa cùng lượt vào.
  advance(3 * DAY);
  stats.prune();
  assert.equal(stats.journey(now()).sources.length, 0);
});

test('báo định kỳ: hẹn tới giờ chẵn, gửi một tin mỗi mốc', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: AT_1330 });
  const accounts = createAccountStore();
  const stats = createVisitorStats({ db: accounts.database, secret: SECRET, timeZone: TZ });
  const sent = [];
  const stop = startVisitorReports({ stats, send: async (text) => { sent.push(text); }, hours: 2, timeZone: TZ });
  t.mock.timers.tick(29 * MINUTE);
  assert.equal(sent.length, 0);
  t.mock.timers.tick(MINUTE);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.match(sent[0], /12:00–14:00/);
  t.mock.timers.tick(2 * HOUR);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 2);
  assert.match(sent[1], /14:00–16:00/);
  stop();
});

async function request(options, method, url, { body, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url, headers: { host: 'chanh-dien.test', ...headers } });
  const res = {
    status: 0, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(chunk = '') { this.body += chunk; },
  };
  await handleApiRequest(req, res, options);
  return { status: res.status, headers: res.headers, json: res.body ? JSON.parse(res.body) : null };
}

test('qua API: vé vào phòng ghi người vào, presence realtime báo người đang online, nhóm Telegram gõ /thongke', async () => {
  const accounts = createAccountStore();
  const visitorStats = createVisitorStats({ db: accounts.database, secret: SECRET, timeZone: TZ });
  const options = {
    secret: SECRET, accounts, visitorStats, friendLinks: openFriendLinks(accounts, { secret: SECRET }),
    telegramWebhookSecret: HOOK, telegramChatId: '-100',
  };
  const join = (headers, body = { roomId: 'cinema-1', displayName: 'Khách' }) => request(options, 'POST', '/api/v1/rooms/join', { body, headers });
  assert.equal((await join({ 'x-real-ip': '8.8.8.8' })).status, 200);
  assert.equal((await join({ 'x-real-ip': '8.8.8.8' })).status, 200);
  assert.equal((await join({ 'x-real-ip': '9.9.9.9' })).status, 200);
  assert.equal((await join({ 'x-real-ip': '9.9.9.9' }, { roomId: 'khong-co', displayName: 'Khách' })).status, 404, 'vé hỏng không tính');
  // Thành viên vào từ cùng mạng với một khách vẫn là người riêng (đếm theo tài khoản).
  const registered = await request(options, 'POST', '/api/v1/auth/register', { body: { username: 'thanh.vien', password: 'matkhau123', ...SIGNUP, displayName: 'Thành Viên' } });
  const cookie = registered.headers['set-cookie'].split(';')[0];
  assert.equal((await join({ 'x-real-ip': '8.8.8.8', cookie }, { roomId: 'cinema-1' })).status, 200);
  const presence = await request(options, 'POST', '/internal/presence', {
    headers: { 'x-internal-key': internalKey(SECRET) },
    body: { nodeId: 'rt-1', entries: [], humans: { members: 1, guests: 2, areas: { temple: 1, cinema: 2, games: 0 } } },
  });
  assert.equal(presence.status, 200);
  const window = visitorStats.report({ start: Date.now() - HOUR });
  assert.deepEqual([window.visitors.total, window.visitors.members, window.visitors.guests], [3, 1, 2]);
  assert.equal(window.online.total, 3);
  const reply = await request(options, 'POST', '/api/v1/telegram', {
    headers: { 'x-telegram-bot-api-secret-token': HOOK },
    body: { update_id: 1, message: { chat: { id: -100 }, from: { username: 'quantri' }, text: '/thongke' } },
  });
  assert.match(reply.json.text, /Đang online: 3 \(thành viên 1 · khách 2\)/);
  assert.match(reply.json.text, /Đã vào trong 2 giờ qua: 3 người/);
  // Lượt mở trang: cùng origin, trang hợp lệ; trang lạ trả ok false; trang khác gửi hộ bị chặn.
  const visit = (body, headers = {}) => request(options, 'POST', '/api/v1/visit', { body, headers: { 'x-real-ip': '5.5.5.5', ...headers } });
  assert.deepEqual((await visit({ page: 'race', src: 'tt-duaxe' })).json, { ok: true });
  assert.deepEqual((await visit({ page: 'nope' })).json, { ok: false });
  assert.equal((await visit({ page: 'home' }, { origin: 'https://trang-la.example' })).status, 403);
  assert.equal(visitorStats.report({ start: Date.now() - HOUR }).opens.sources[0].src, 'tt-duaxe');
});
