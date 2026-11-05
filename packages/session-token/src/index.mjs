import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_LOCAL_SECRET = 'local-development-secret-change-before-deploy';
export const JOIN_TICKET_TTL_MS = 5 * 60_000;
export const RESUME_TOKEN_TTL_MS = 6 * 60 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
export const ROOM_INVITE_TTL_MS = 30 * 24 * 60 * 60_000;
const ACCOUNT_ID = /^a-[a-zA-Z0-9-]{8,64}$/;
const SKIN_ID = /^[a-z][a-z0-9-]{1,40}$/;
// Ảnh đại diện chỉ nhận ảnh Google (đăng nhập Gmail); tài khoản tên/mật khẩu dùng chữ cái đầu.
export const AVATAR_URL = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[A-Za-z0-9._~\/=+-]{1,180}$/;

const ROOM_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
const PARTICIPANT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function validClaims(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every((key) => ['participantId', 'roomId', 'displayName', 'role', 'accountId', 'level', 'avatarUrl', 'skins', 'iat', 'exp'].includes(key))
    && typeof value.participantId === 'string'
    && PARTICIPANT_ID.test(value.participantId)
    && typeof value.roomId === 'string'
    && ROOM_ID.test(value.roomId)
    && typeof value.displayName === 'string'
    && value.displayName.length > 0
    && value.displayName.length <= 40
    // Khách (guest) không có tài khoản; thành viên (member) mang accountId để công đức được lưu.
    && (value.role === 'guest' ? value.accountId === undefined : value.role === 'member' && typeof value.accountId === 'string' && ACCOUNT_ID.test(value.accountId))
    && (value.level === undefined || (value.role === 'member' && Number.isSafeInteger(value.level) && value.level >= 1 && value.level <= 99))
    && (value.avatarUrl === undefined || (value.role === 'member' && typeof value.avatarUrl === 'string' && AVATAR_URL.test(value.avatarUrl)))
    // Hình nhân vật đã mua trong shop (máy realtime chỉ cho mặc hình có trong danh sách này).
    && (value.skins === undefined || (value.role === 'member' && Array.isArray(value.skins) && value.skins.length <= 16
      && value.skins.every((skin) => typeof skin === 'string' && SKIN_ID.test(skin))))
    && Number.isSafeInteger(value.iat)
    && Number.isSafeInteger(value.exp)
    && value.exp > value.iat;
}

function checkSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('SESSION_SECRET phải có ít nhất 32 ký tự');
  }
}

const inviteKey = (secret) => createHash('sha256').update(`room-invite:${secret}`).digest();

// Mã mời phòng được mã hóa AES-GCM: URL không lộ roomId và sửa dù chỉ một ký tự cũng làm xác thực thất bại.
export function createRoomInvite(roomId, secret, options = {}) {
  checkSecret(secret);
  if (typeof roomId !== 'string' || !ROOM_ID.test(roomId)) throw new TypeError('Mã phòng không hợp lệ');
  const now = options.now ?? Date.now();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', inviteKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify({ k: 'room-invite', r: roomId, exp: now + (options.ttlMs ?? ROOM_INVITE_TTL_MS) }));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function verifyRoomInvite(token, secret, options = {}) {
  checkSecret(secret);
  if (typeof token !== 'string' || token.length < 40 || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, error: 'INVALID_INVITE' };
  }
  try {
    const packed = Buffer.from(token, 'base64url');
    if (packed.length < 29) return { ok: false, error: 'INVALID_INVITE' };
    const decipher = createDecipheriv('aes-256-gcm', inviteKey(secret), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'));
    const valid = value && value.k === 'room-invite' && typeof value.r === 'string' && ROOM_ID.test(value.r) && Number.isSafeInteger(value.exp);
    if (!valid) return { ok: false, error: 'INVALID_INVITE' };
    if (value.exp <= (options.now ?? Date.now())) return { ok: false, error: 'EXPIRED_INVITE' };
    return { ok: true, value: { roomId: value.r } };
  } catch {
    return { ok: false, error: 'INVALID_INVITE' };
  }
}

export function createJoinTicket(claims, secret, options = {}) {
  checkSecret(secret);
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? JOIN_TICKET_TTL_MS;
  const payload = {
    participantId: claims.participantId,
    roomId: claims.roomId,
    displayName: claims.displayName,
    role: claims.accountId ? 'member' : 'guest',
    ...(claims.accountId ? { accountId: claims.accountId } : {}),
    ...(claims.accountId && claims.level ? { level: claims.level } : {}),
    ...(claims.accountId && AVATAR_URL.test(claims.avatarUrl || '') ? { avatarUrl: claims.avatarUrl } : {}),
    ...(claims.accountId && claims.skins?.length ? { skins: [...claims.skins] } : {}),
    iat: now,
    exp: now + ttlMs,
  };
  if (!validClaims(payload)) throw new TypeError('Thông tin vé vào phòng không hợp lệ');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

function openSigned(token, secret, maxLength) {
  if (typeof token !== 'string' || token.length > maxLength) return { ok: false, error: 'INVALID_TICKET' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'INVALID_TICKET' };

  const expected = Buffer.from(signature(parts[0], secret));
  const received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, error: 'INVALID_SIGNATURE' };
  }

  try {
    return { ok: true, value: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) };
  } catch {
    return { ok: false, error: 'INVALID_TICKET' };
  }
}

export function verifyJoinTicket(ticket, secret, options = {}) {
  checkSecret(secret);
  const opened = openSigned(ticket, secret, 1_024);
  if (!opened.ok) return opened;
  const claims = opened.value;
  if (!validClaims(claims)) return { ok: false, error: 'INVALID_CLAIMS' };
  const now = options.now ?? Date.now();
  if (claims.exp <= now) return { ok: false, error: 'EXPIRED_TICKET' };
  return { ok: true, value: claims };
}

// Resume token có chữ ký để máy realtime nào cũng xác minh được sau khi phòng chuyển máy.
// Giữ payload ngắn: protocol giới hạn resumeToken 512 ký tự; tên hiển thị lấy từ snapshot phòng.
export function createResumeToken(claims, secret, options = {}) {
  checkSecret(secret);
  const now = options.now ?? Date.now();
  const payload = {
    k: 'resume',
    p: claims.participantId,
    r: claims.roomId,
    n: randomBytes(9).toString('base64url'),
    exp: now + (options.ttlMs ?? RESUME_TOKEN_TTL_MS),
  };
  if (!PARTICIPANT_ID.test(payload.p) || !ROOM_ID.test(payload.r)) throw new TypeError('Thông tin resume token không hợp lệ');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyResumeToken(token, secret, options = {}) {
  checkSecret(secret);
  const opened = openSigned(token, secret, 512);
  if (!opened.ok) return opened;
  const value = opened.value;
  const valid = value !== null && typeof value === 'object' && !Array.isArray(value)
    && value.k === 'resume'
    && typeof value.p === 'string' && PARTICIPANT_ID.test(value.p)
    && typeof value.r === 'string' && ROOM_ID.test(value.r)
    && Number.isSafeInteger(value.exp);
  if (!valid) return { ok: false, error: 'INVALID_CLAIMS' };
  if (value.exp <= (options.now ?? Date.now())) return { ok: false, error: 'EXPIRED_TICKET' };
  return { ok: true, value: { participantId: value.p, roomId: value.r } };
}

// Phiên đăng nhập (cookie HttpOnly): tài khoản + phiên bản phiên (đổi phiên bản để đăng xuất mọi nơi).
export function createSessionToken({ accountId, version }, secret, options = {}) {
  checkSecret(secret);
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId) || !Number.isSafeInteger(version)) throw new TypeError('Phiên đăng nhập không hợp lệ');
  const now = options.now ?? Date.now();
  const encoded = Buffer.from(JSON.stringify({ k: 'session', a: accountId, v: version, exp: now + (options.ttlMs ?? SESSION_TTL_MS) })).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifySessionToken(token, secret, options = {}) {
  checkSecret(secret);
  const opened = openSigned(token, secret, 512);
  if (!opened.ok) return opened;
  const value = opened.value;
  if (!value || value.k !== 'session' || typeof value.a !== 'string' || !ACCOUNT_ID.test(value.a) || !Number.isSafeInteger(value.v) || !Number.isSafeInteger(value.exp)) {
    return { ok: false, error: 'INVALID_CLAIMS' };
  }
  if (value.exp <= (options.now ?? Date.now())) return { ok: false, error: 'EXPIRED_TICKET' };
  return { ok: true, value: { accountId: value.a, version: value.v } };
}

// Khóa cho đường nội bộ realtime → API (ghi lễ vật của thành viên), suy ra từ khóa phiên chung.
export function internalKey(secret) {
  checkSecret(secret);
  return signature('internal:offerings', secret);
}
