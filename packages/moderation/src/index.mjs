// Kiểm duyệt chữ người dùng gõ (chat, lời nguyện, tên hiển thị, sớ): lọc chửi thề tiếng Việt/Anh/Tây Ban Nha,
// nhận từ cố tình viết lách (teen-code, chấm giữa chữ, chữ cách rời, lặp chữ), che từ chỉ hiện chữ đầu, và phát hiện
// nick clone nhắn trùng. Chỉ hàm thuần — API giữ danh sách từ/sổ khóa, máy realtime gọi các hàm này cho từng tin.
//
// Quy ước mục từ:
//   - Có dấu tiếng Việt (vd "lồn", "đồ chó") → chỉ so với chữ có dấu, tránh chặn nhầm chữ lành khi bỏ dấu
//     ("cặc" bỏ dấu trùng "các", "đĩ" trùng "đi", "đéo" trùng "đeo").
//   - Không dấu (vd "dm", "vcl", "dit me") → so với bản đã bỏ dấu; chỉ dùng cho từ không trùng chữ lành.
//   - Đuôi `*` → khớp tiền tố ("fuck*" chặn cả "fucking").
//   - Nhiều chữ cách nhau bằng dấu cách → cụm từ liền nhau.
// Chữ bị viết lách (c4c, đ.m, l-ồ-n, "đ m") thì so cả bản bỏ dấu với mọi mục từ: viết lách là cố ý.
import { createHash } from 'node:crypto';

export const DEFAULT_BLOCK_WORDS = Object.freeze([
  // Viết tắt (không dấu, không trùng chữ lành)
  'dm', 'dmm', 'dcm', 'dcmm', 'dkm', 'dkmm', 'dmml', 'cmm', 'cmnr', 'clgt', 'clmm', 'vcl', 'vkl', 'vcc', 'vl', 'vloz', 'vlz', 'cc',
  'ditme', 'dit me', 'dit cu', 'ditmemay', 'dit con me', 'dit', 'duma', 'du ma', 'dume', 'du me', 'dumemay', 'occho', 'oc cho',
  // Có dấu
  'địt', 'đụ', 'đù má', 'đéo', 'lồn', 'cặc', 'buồi', 'đĩ', 'điếm', 'cứt', 'dái', 'nứng', 'đồ chó', 'chó chết', 'chó đẻ', 'óc chó',
  'con đĩ', 'thằng chó', 'đụ má', 'đụ mẹ', 'địt mẹ', 'mả mẹ', 'bú cu', 'bú cặc', 'bú lồn', 'vãi lồn', 'vãi cặc', 'óc lồn',
  // Tiếng Anh
  'fuck*', 'motherfuck*', 'fck', 'fuk', 'shit', 'bullshit', 'bitch*', 'cunt', 'dick', 'pussy', 'asshole', 'nigg*', 'whore', 'slut',
  // Tiếng Tây Ban Nha
  'puta', 'puto', 'mierda', 'pendej*', 'cabron', 'cabrón', 'joder', 'verga', 'chinga*', 'coño',
]);

// Không chặn, chỉ báo về Telegram để quản trị quyết định (/blockchattu <từ>).
export const DEFAULT_SUSPECT_WORDS = Object.freeze([
  'ngu', 'óc lợn', 'mẹ mày', 'bố mày', 'thằng điên', 'con điên', 'khốn nạn', 'mất dạy', 'súc vật', 'cút', 'câm mồm',
  'câm miệng', 'lol', 'vãi', 'chó má', 'thằng ngu', 'con ngu', 'đần', 'damn', 'stupid', 'idiot',
]);

// Cụm chữ lành chứa từ khả nghi (giáo lý nhà Phật): không báo.
const SUSPECT_ALLOW = Object.freeze(['ngu si', 'ngu muội', 'tham sân si', 'súc sanh']);

// Chữ thường gặp trong chánh điện / chào hỏi: tin chỉ gồm các chữ này không bị coi là clone dù nhiều người gõ giống nhau.
const COMMON_WORDS = new Set(`nam mo a di da phat adida adidaphat namo quan the am bo tat thich ca mau ni duoc su luu ly quang vuong
  dia tang van thu pho hien tam bao di lac chuan de dai the chi xin chao moi nguoi ca nha cam on tat ca chuc binh an hanh phuc
  suc khoe ban lanh nhe a oi hi hello hay qua hihi haha hehe ok vang da de con me cha ong ba anh chi em minh chung ta cung niem
  tung kinh lay nghe giang hoi huong cong duc thanh tinh tam an lanh mot ngay`.split(/\s+/).filter(Boolean));

// Từ khả nghi viết lách nhưng là chữ viết tắt lành: không báo.
const OBFUSCATION_IGNORE = new Set(['vv', 'tphcm', 'hcm', 'aka', 'eg', 'ie', 'ok', 'tp', 'usa', 'us', 'vn']);

// Link / số điện thoại / mời sang app khác: nick mới chưa được gửi.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|vn|io|me|xyz|top|club|info|link|ly|gg|tk|cc|co)\b|t\.me\/|zalo\.me)/i;
const PHONE = /(?:\+?\d[\s.-]?){9,}/;
const INVITE = /\b(zalo|za lo|telegram|tele|inbox|ib|kết bạn zalo|nạp thẻ|nap the|sdt|sđt)\b/i;
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 9: 'g', '@': 'a', $: 's', '!': 'i' };
// Ký tự chen giữa chữ để lách lọc: đ.ị.t, l-ồ-n, d_m, đ*t.
const INNER_MARKS = /[.\-_*+~^'`|,:;/\\]+/g;
const EDGE_MARKS = /^[^\p{L}\p{N}@$!]+|[^\p{L}\p{N}]+$/gu;

export const fold = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const lower = (text) => String(text).normalize('NFC').toLowerCase();
const hasAccent = (word) => /[^\x00-\x7f]/.test(word);
// "dmmmm" → "dm" và "dmm": so cả bản gộp hết chữ lặp lẫn bản giữ tối đa hai chữ.
const squeeze = (word, keep) => word.replace(/(\p{L})\1+/gu, (run, letter) => letter.repeat(Math.min(keep, run.length)));

// Tách tin thành chữ đã chuẩn hóa. Mỗi chữ: accented (chữ thường có dấu), folded (bỏ dấu), obfuscated (có viết lách),
// raw (chữ gốc để che lại khi báo), index (vị trí chữ gốc).
export function tokenize(text) {
  const raw = lower(text).replace(/[​-‏⁠﻿]/g, '').split(/\s+/).filter(Boolean);
  const tokens = [];
  raw.forEach((word, index) => {
    const edged = word.replace(EDGE_MARKS, '');
    if (!edged) return;
    // obfuscated: 'leet' (c4c), 'marks' (đ.m, l-ồ-n), 'spaced' (đ m) hoặc false.
    let obfuscated = false;
    let core = edged;
    if (/\p{L}/u.test(core) && /[0-9@$!]/.test(core)) {
      const swapped = core.replace(/[0-9@$!]/g, (char) => LEET[char] ?? char);
      if (/^\p{L}+$/u.test(swapped.replace(INNER_MARKS, ''))) {
        obfuscated = 'leet';
        core = swapped;
      }
    }
    const stripped = core.replace(INNER_MARKS, '');
    if (!obfuscated && stripped !== core && /^\p{L}+$/u.test(stripped) && /\p{L}[.\-_*+~^'`|,:;/\\]+\p{L}/u.test(core) && !LINK.test(word)) obfuscated = 'marks';
    if (!stripped || !/\p{L}/u.test(stripped)) return;
    tokens.push({ accented: stripped, folded: fold(stripped), obfuscated, raw: [index], index });
  });
  // Chữ cách rời "đ m", "d i t": gộp chuỗi ≥ 2 chữ một ký tự thành một chữ viết lách.
  const merged = [];
  for (let at = 0; at < tokens.length;) {
    let end = at;
    while (end < tokens.length && [...tokens[end].accented].length === 1 && (end === at || tokens[end].index === tokens[end - 1].index + 1)) end += 1;
    if (end - at >= 2) {
      const run = tokens.slice(at, end);
      const accented = run.map((token) => token.accented).join('');
      merged.push({ accented, folded: fold(accented), obfuscated: 'spaced', raw: run.map((token) => token.index), index: run[0].index });
      at = end;
    } else {
      merged.push(tokens[at]);
      at += 1;
    }
  }
  return { words: raw, tokens: merged };
}

function compileEntry(entry) {
  const text = lower(entry).trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const accented = hasAccent(text);
  const parts = text.split(' ').map((part) => {
    const prefix = part.endsWith('*');
    const word = prefix ? part.slice(0, -1) : part;
    return { word, folded: fold(word), prefix };
  });
  if (parts.some((part) => !part.word)) return null;
  return { text, accented, parts };
}

const sameWord = (value, part) => (part.prefix ? value.startsWith(part.word) : value === part.word);

// Chữ có khớp một phần mục từ không: thử cả bản gộp chữ lặp. Mục không dấu chỉ khớp chữ gõ không dấu (đ coi như d),
// để "ngu" không bắt nhầm "ngủ" / "ngũ giới"; chữ viết lách thì so bản bỏ dấu với mọi mục (cố ý lách lọc).
function tokenMatches(token, part, entryAccented) {
  const forms = (value) => [value, squeeze(value, 2), squeeze(value, 1)];
  const folded = { word: part.folded, prefix: part.prefix };
  if (token.obfuscated && forms(token.folded).some((value) => sameWord(value, folded))) return true;
  if (entryAccented) return forms(token.accented).some((value) => sameWord(value, part));
  const plain = token.accented.replace(/đ/g, 'd');
  return /^[\x00-\x7f]+$/.test(plain) && forms(plain).some((value) => sameWord(value, part));
}

function findEntry(tokens, entry) {
  const hits = [];
  const size = entry.parts.length;
  for (let at = 0; at + size <= tokens.length; at += 1) {
    if (entry.parts.every((part, offset) => tokenMatches(tokens[at + offset], part, entry.accented))) hits.push(tokens.slice(at, at + size));
  }
  return hits;
}

// Danh sách từ hiệu lực = mặc định + từ quản trị thêm − từ quản trị bỏ. Biên dịch một lần, dùng cho mọi tin.
export function createWordList({ block = [], allow = [], suspect = [] } = {}) {
  const removed = new Set(allow.map((word) => lower(word).trim()));
  const unique = (list) => [...new Set(list.map((word) => lower(word).trim().replace(/\s+/g, ' ')).filter((word) => word && !removed.has(word)))];
  const blockWords = unique([...DEFAULT_BLOCK_WORDS, ...block]);
  const suspectWords = unique([...DEFAULT_SUSPECT_WORDS, ...suspect]).filter((word) => !blockWords.includes(word));
  return {
    block: blockWords.map(compileEntry).filter(Boolean),
    suspect: suspectWords.map(compileEntry).filter(Boolean),
    allowSuspect: SUSPECT_ALLOW.map(compileEntry),
    words: { block: blockWords, suspect: suspectWords },
  };
}

const DEFAULT_LIST = createWordList();

// Kết quả: action 'block' (có từ cấm) | 'suspect' (có từ khả nghi, vẫn cho gửi) | 'ok'.
// words: mục từ đã khớp; suspects: chữ khả nghi (gợi ý lệnh /blockchattu); masked: tin đã che (chỉ hiện chữ đầu).
export function checkText(text, list = DEFAULT_LIST) {
  if (typeof text !== 'string' || !text.trim()) return { action: 'ok', words: [], suspects: [], masked: '' };
  const { words, tokens } = tokenize(text);
  const flagged = new Set();
  const blocked = [];
  for (const entry of list.block) {
    for (const hit of findEntry(tokens, entry)) {
      blocked.push(entry.text);
      for (const token of hit) for (const index of token.raw) flagged.add(index);
    }
  }
  const suspects = [];
  if (!blocked.length) {
    const spared = new Set();
    for (const entry of list.allowSuspect) for (const hit of findEntry(tokens, entry)) for (const token of hit) spared.add(token.index);
    for (const entry of list.suspect) {
      for (const hit of findEntry(tokens, entry)) {
        if (hit.every((token) => spared.has(token.index))) continue;
        suspects.push(entry.text);
        for (const token of hit) for (const index of token.raw) flagged.add(index);
      }
    }
    // Chữ chen dấu lạ (đ.ụ.c, l-o-l…) không có trong danh sách: báo để quản trị xem, không chặn.
    for (const token of tokens) {
      if (token.obfuscated !== 'marks' || OBFUSCATION_IGNORE.has(token.folded) || token.folded.length < 2 || token.folded.length > 12) continue;
      suspects.push(token.accented);
      for (const index of token.raw) flagged.add(index);
    }
  }
  const masked = words.map((word, index) => (flagged.has(index) ? maskWord(word) : word)).join(' ');
  return {
    action: blocked.length ? 'block' : suspects.length ? 'suspect' : 'ok',
    words: [...new Set(blocked)],
    suspects: [...new Set(suspects)],
    masked,
  };
}

// Che một chữ: giữ ký tự chữ đầu tiên, các chữ cái/số còn lại thành *. "đụ" → "đ*", "c4c" → "c**".
export function maskWord(word) {
  const chars = [...String(word).normalize('NFC')];
  const first = chars.findIndex((char) => /[\p{L}\p{N}]/u.test(char));
  return chars.map((char, index) => (index > first && /[\p{L}\p{N}@$]/u.test(char) ? '*' : char)).join('');
}

// Tin đã che cho báo cáo (Telegram / trang admin): chỉ che từ cấm và từ khả nghi, cắt độ dài.
export const maskText = (text, list = DEFAULT_LIST, max = 160) => checkText(String(text).slice(0, 500), list).masked.slice(0, max);

export function hasPromo(text) {
  const value = String(text);
  return LINK.test(value) || PHONE.test(value) || INVITE.test(value);
}

// Khóa so trùng của tin: chỉ giữ chữ cái/số đã bỏ dấu và gộp chữ lặp ("Mua acc rẻ!!!" ≡ "mua   ACC re").
export function cloneKey(text) {
  return squeeze(fold(text).replace(/[^a-z0-9]/g, ''), 1).slice(0, 200);
}

const onlyCommon = (text) => {
  const words = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  return words.length > 0 && words.every((word) => COMMON_WORDS.has(word));
};

// Phát hiện nick clone nhắn trùng (giống tin "TỰ KHÓA CLONE"): trong `windowMs`, ≥ `minSenders` người gửi cùng một
// nội dung, trong đó ≥ 2 người "mới" (khách hoặc tài khoản tạo dưới 24 giờ) không phải người gửi đầu tiên → trả về
// những người mới đó để khóa. Người gửi đầu tiên luôn được chừa (có thể là người thật bị nhại lại). Câu niệm Phật /
// chào hỏi quen thuộc và tin ngắn (trừ khi có link / từ cấm) không tính.
export function createCloneWatch({ windowMs = 120_000, minSenders = 3, minLetters = 16, maxKeys = 2_000 } = {}) {
  const seen = new Map();
  function prune(now) {
    for (const [key, entry] of seen) {
      if (now - entry.lastAt > windowMs) seen.delete(key);
    }
    while (seen.size > maxKeys) seen.delete(seen.keys().next().value);
  }
  return {
    add({ text, sender, fresh = false, spammy = false, info = {}, at = Date.now() }) {
      const key = cloneKey(text);
      if (!key || onlyCommon(text) || (key.length < minLetters && !spammy)) return null;
      prune(at);
      let entry = seen.get(key);
      if (!entry || at - entry.firstAt > windowMs) {
        entry = { key, firstAt: at, lastAt: at, first: { sender, info }, senders: new Map(), flagged: new Set(), triggered: false };
        seen.set(key, entry);
      }
      entry.lastAt = at;
      if (!entry.senders.has(sender)) entry.senders.set(sender, { fresh, info });
      const suspects = [...entry.senders].filter(([id, value]) => id !== entry.first.sender && value.fresh);
      if (!entry.triggered && (entry.senders.size < minSenders || suspects.length < 2)) return null;
      entry.triggered = true;
      const fresh_ = suspects.filter(([id]) => !entry.flagged.has(id));
      if (!fresh_.length) return null;
      for (const [id] of fresh_) entry.flagged.add(id);
      return { key, first: entry.first, offenders: fresh_.map(([id, value]) => ({ sender: id, ...value.info })) };
    },
    get size() {
      return seen.size;
    },
  };
}

// IP người gửi: X-Real-IP (nginx đặt từ $remote_addr) trước, rồi phần tử cuối của X-Forwarded-For (phần tử đầu do
// trình duyệt tự khai được), cuối cùng là địa chỉ socket.
export function requestIp(headers = {}, remoteAddress = '') {
  const real = typeof headers['x-real-ip'] === 'string' ? headers['x-real-ip'].trim() : '';
  if (real) return real;
  const forwarded = String(headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean);
  return forwarded.at(-1) || String(remoteAddress || '');
}

// IP nội bộ / loopback (chạy local, sau tunnel chưa chuyển IP thật): không khóa theo IP vì mọi người chung một địa chỉ.
export function isPublicIp(ip) {
  const value = String(ip || '').replace(/^::ffff:/, '');
  if (!value || value === 'local' || value === '::1' || value === 'localhost') return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(value)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value)) return false;
  if (/^f[cd][0-9a-f]{2}:/i.test(value) || /^fe80:/i.test(value)) return false;
  return /^[0-9a-f:.]+$/i.test(value);
}

// Băm IP (không lưu IP gốc). API và máy realtime dùng cùng SESSION_SECRET nên ra cùng mã. IP nội bộ → null.
export function ipHash(ip, secret) {
  if (!isPublicIp(ip) || typeof secret !== 'string') return null;
  return createHash('sha256').update(`moderation-ip:${secret}:${String(ip).replace(/^::ffff:/, '')}`).digest('base64url').slice(0, 22);
}

// Chuẩn hóa từ quản trị gõ trong lệnh /blockchattu: 1–40 ký tự, chỉ chữ / số / dấu cách / * cuối.
export function cleanWord(input) {
  const word = lower(input).trim().replace(/\s+/g, ' ');
  if (!word || [...word].length > 40) return null;
  if (!/^[\p{L}\p{N} ]+\*?$/u.test(word)) return null;
  return word;
}
