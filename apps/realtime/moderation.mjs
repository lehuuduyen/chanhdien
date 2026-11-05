// Kiểm duyệt trên máy realtime: lọc từng tin chat / lời nguyện theo danh sách từ (đồng bộ từ API ~15 giây một lần),
// tắt chat, đá người bị khóa, dò nick clone nhắn trùng. API là nơi duy nhất ghi sổ khóa và báo Telegram; không nối được
// API thì máy này tự tắt chat trong phòng theo điểm vi phạm (không khóa nick).
import { createHash } from 'node:crypto';
import {
  checkText,
  cloneKey,
  createCloneWatch,
  createWordList,
  hasPromo,
  ipHash,
  maskText,
  requestIp,
} from '../../packages/moderation/src/index.mjs';

export const MODERATION_SYNC_MS = 15_000;
const LOCAL_MUTE_MS = 10 * 60_000;
const LOCAL_WINDOW_MS = 60 * 60_000;
const STRIKE_LIMIT = { strict: 3, standard: 4 };

// Gọi API nội bộ (x-internal-key). Lỗi mạng trả null để phòng vẫn chạy.
export function moderationRemote(apiInternalUrl, key, fetchImpl = fetch) {
  const call = (path, body) => fetchImpl(new URL(path, apiInternalUrl), {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-internal-key': key },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5_000),
  }).then((response) => (response.ok ? response.json() : null)).catch((error) => {
    console.warn(`Kiểm duyệt: không gọi được API ${path}: ${error.message}`);
    return null;
  });
  return {
    state: () => call('/internal/moderation/state'),
    violation: (event) => call('/internal/moderation/violation', event),
    clones: (event) => call('/internal/moderation/clone', event),
    suspect: (event) => call('/internal/moderation/suspect', event),
  };
}

export function createModerationGuard({ secret, remote = null, now = Date.now, cloneWatch = createCloneWatch() } = {}) {
  let list = createWordList();
  let wordsKey = '';
  let accounts = new Map();
  let ips = new Map();
  // Tắt chat tức thời (trước nhịp đồng bộ kế) và tắt chat cục bộ khi không có API.
  const localMutes = new Map();
  const localStrikes = new Map();
  let timer = null;
  let lastSyncAt = 0;
  let onEnforce = () => {};

  const live = (entry, field = 'until') => entry && (entry[field] === null || entry[field] === undefined || entry[field] > now());

  // Một người có thể vừa bị tắt chat vừa bị khóa: giữ lệnh nặng hơn (khóa > tắt chat), cùng loại thì giữ lệnh lâu hơn.
  function stronger(next, current) {
    if (!current) return true;
    if (next.kind !== current.kind) return next.kind === 'ban';
    return (next.until ?? Infinity) > (current.until ?? Infinity);
  }
  function keep(map, key, entry) {
    if (stronger(entry, map.get(key))) map.set(key, entry);
  }
  function remember(restriction) {
    if (restriction.accountId) keep(accounts, restriction.accountId, { id: restriction.id, kind: restriction.kind, until: restriction.until ?? null });
    if (restriction.ipHash) keep(ips, restriction.ipHash, { id: restriction.id, kind: restriction.kind, until: restriction.ipUntil ?? restriction.until ?? null });
  }

  function apply(state) {
    if (!state || typeof state !== 'object') return false;
    const block = Array.isArray(state.words?.block) ? state.words.block.filter((word) => typeof word === 'string') : [];
    const allow = Array.isArray(state.words?.allow) ? state.words.allow.filter((word) => typeof word === 'string') : [];
    const key = JSON.stringify([block, allow]);
    if (key !== wordsKey) {
      list = createWordList({ block, allow });
      wordsKey = key;
    }
    accounts = new Map();
    ips = new Map();
    for (const restriction of Array.isArray(state.restrictions) ? state.restrictions : []) {
      if (restriction && ['mute', 'ban'].includes(restriction.kind)) remember(restriction);
    }
    onEnforce();
    return true;
  }

  const guard = {
    ipKey: (req) => ipHash(requestIp(req.headers || {}, req.socket?.remoteAddress), secret),
    check: (text) => checkText(text, list),
    get list() {
      return list;
    },
    set onEnforce(callback) {
      onEnforce = typeof callback === 'function' ? callback : () => {};
    },

    // Lệnh khóa vào phòng (kind 'ban') đang hiệu lực với tài khoản / IP này.
    banned({ accountId = null, ipHash: ip = null } = {}) {
      const byAccount = accountId && accounts.get(accountId);
      if (byAccount?.kind === 'ban' && live(byAccount)) return byAccount;
      const byIp = ip && ips.get(ip);
      if (byIp?.kind === 'ban' && live(byIp)) return byIp;
      return null;
    },

    // Thời điểm hết tắt chat (0 nếu không bị tắt). Bị khóa hẳn cũng coi như tắt chat.
    mutedUntil(participant) {
      const found = [
        participant.accountId && accounts.get(participant.accountId),
        participant.ipHash && ips.get(participant.ipHash),
        localMutes.get(participant.accountId || participant.id),
      ].filter((entry) => entry && live(entry));
      if (!found.length) return 0;
      return Math.max(...found.map((entry) => entry.until ?? Number.MAX_SAFE_INTEGER));
    },

    async sync() {
      if (!remote) return false;
      lastSyncAt = now();
      return apply(await remote.state());
    },
    // Hỏi lại API ngay (tối đa 2 giây một lần): người vừa được mở khóa vào lại được liền, không chờ nhịp đồng bộ.
    async refresh() {
      if (!remote || now() - lastSyncAt < 2_000) return false;
      return guard.sync();
    },
    apply,
    start(intervalMs = MODERATION_SYNC_MS) {
      if (!remote || timer) return;
      guard.sync();
      timer = setInterval(() => guard.sync(), intervalMs);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },

    // Một tin bị chặn: API chấm điểm (tắt chat / khóa nick + báo Telegram). Không có API thì tự tắt chat trong phòng.
    async violation(participant, room, result) {
      const strict = room.rules.moderation === 'strict';
      const event = {
        accountId: participant.accountId || null, ipHash: participant.ipHash || null, name: participant.displayName,
        roomId: room.id, strict, evidence: result.masked.slice(0, 160), words: result.words.slice(0, 5),
      };
      const answer = remote ? await remote.violation(event) : null;
      if (answer && answer.action !== 'local') {
        if (answer.ban) {
          remember({ ...answer.ban, until: answer.ban.expiresAt, ipHash: participant.ipHash && answer.ban.ipBlocked ? participant.ipHash : null, ipUntil: answer.ban.ipUntil });
          onEnforce();
        }
        return answer;
      }
      const key = participant.accountId || participant.id;
      const at = now();
      const strikes = (localStrikes.get(key) || []).filter((value) => at - value < LOCAL_WINDOW_MS);
      strikes.push(at);
      localStrikes.set(key, strikes);
      if (localStrikes.size > 5_000) localStrikes.delete(localStrikes.keys().next().value);
      if (strikes.length < (strict ? STRIKE_LIMIT.strict : STRIKE_LIMIT.standard)) return { action: 'warn', strikes: strikes.length };
      localStrikes.delete(key);
      const until = at + LOCAL_MUTE_MS;
      localMutes.set(key, { kind: 'mute', until });
      return { action: 'mute', ban: { kind: 'mute', expiresAt: until } };
    },

    // Nick clone: trả danh sách người cần khóa (đã gửi API khóa + báo Telegram) hoặc null.
    clones(participant, room, text, spammy) {
      const hit = cloneWatch.add({
        text, sender: participant.accountId || participant.ipHash || participant.id,
        fresh: participant.fresh === true, spammy,
        info: { participantId: participant.id, accountId: participant.accountId || null, ipHash: participant.ipHash || null, name: participant.displayName },
        at: now(),
      });
      if (!hit) return null;
      const evidence = maskText(text, list);
      if (remote) {
        remote.clones({ roomId: room.id, evidence, first: { name: hit.first.info?.name }, offenders: hit.offenders })
          .then((answer) => {
            for (const ban of answer?.bans || []) if (ban) remember({ ...ban, until: ban.expiresAt, ipUntil: ban.ipUntil });
            // Bản ghi API không trả ipHash: ghi lại theo người vi phạm để đá cả kết nối cùng IP.
            hit.offenders.forEach((offender, index) => {
              const ban = answer?.bans?.[index];
              if (ban && offender.ipHash && ban.ipBlocked) keep(ips, offender.ipHash, { id: ban.id, kind: 'ban', until: ban.ipUntil });
            });
            onEnforce();
          });
      }
      return hit;
    },

    suspect(participant, room, result) {
      if (!remote) return;
      remote.suspect({ name: participant.displayName, accountId: participant.accountId || null, roomId: room.id, evidence: result.masked.slice(0, 160), words: result.suspects.slice(0, 5) });
    },
  };
  return guard;
}

// Mã ngắn của nội dung tin để chặn gửi lặp (cùng người, cùng nội dung).
export const repeatKey = (text) => createHash('sha1').update(cloneKey(text) || String(text)).digest('base64url').slice(0, 12);
export { hasPromo };
