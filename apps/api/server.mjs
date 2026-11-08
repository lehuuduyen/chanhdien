import http from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROTOCOL_VERSION } from '@chanh-dien/protocol';
import { createDirectoryFromEnv } from '@chanh-dien/room-directory';
import { getRoomRules, isPrivateRoomId, parseThienRoomId, ROOM_CATALOG, thienRoomName } from '@chanh-dien/room-rules';
import { createJoinTicket, DEFAULT_LOCAL_SECRET, verifyRoomInvite } from '@chanh-dien/session-token';
import { corsHeaders, json, readJson } from './http.mjs';
import { currentAccount, handleAuthRequest, loginRewardView, openAccountStore } from './auth.mjs';
import { handleThienRequest } from './thien.mjs';
import { handleGardenBotRequest, handleGardenRequest, openGardenStore } from './garden.mjs';
import { handleCommunityProjectRequest, openCommunityProjectStore } from './community-project.mjs';
import { handleGameRequest } from './games.mjs';
import { handleChoreRewardRequest } from './chores.mjs';
import { donateConfig, handleDonateRequest, handleTelegramDonateRequest, openDonateStore, realtimeBotController } from './donate.mjs';
import { handleSupportRequest, openSupportStore } from './support.mjs';
import { handleShopRequest, openShopStore, shopConfig } from './shop.mjs';
import { handleBotChatRequest, openBotChatStore, realtimeBotSpeaker } from './bot-chat.mjs';
import { handleFriendLinksRequest, openFriendLinks, realtimeInboxNotifier } from './friend-links.mjs';
import { handleMemorialRequest } from './memorial.mjs';
import { handlePetsRequest } from './pets.mjs';
import { createPrivateRooms, handlePrivateRoomRequest, realtimePrivateRoomNotifier } from './private-rooms.mjs';
import { batchNotifier, banMessage, handleModerationRequest, openModerationStore, requestIpHash } from './moderation.mjs';
import { createTelegramNotifier, createTelegramSender } from './notify.mjs';
import { openThienEventStore } from './thien-event.mjs';
import { openPrayerSlipStore } from './prayer-slips.mjs';
import { handleCinemaPlaylistRequest, openCinemaPlaylistStore } from './cinema-playlist.mjs';


export const ROOMS = Object.freeze(ROOM_CATALOG.map((room) => Object.freeze({ ...room, status: 'open', participantCount: 0 })));

export function listPublicRooms(counts = {}) {
  return ROOMS.map((room) => {
    const rules = getRoomRules(room.type);
    return {
      ...room,
      participantCount: counts[room.id] ?? room.participantCount,
      maxParticipants: rules.maxParticipants,
      seats: rules.seats,
      lang: rules.lang,
    };
  });
}

// Số người đang kết nối theo phòng, gộp từ nhịp đăng ký của các máy realtime còn sống (trễ tối đa một nhịp).
async function aggregateRoomCounts(directory, field, fallbackField) {
  if (!directory) return {};
  const counts = {};
  for (const node of await directory.listNodes()) {
    const source = node[field] || (fallbackField ? node[fallbackField] : null) || {};
    for (const [roomId, count] of Object.entries(source)) {
      if (Number.isSafeInteger(count) && count >= 0) counts[roomId] = (counts[roomId] || 0) + count;
    }
  }
  return counts;
}

// Sảnh chỉ hiện người đang online. Bộ xếp phòng dùng số chỗ người thật đang giữ, gồm cả chỗ giữ 60 giây
// khi rớt mạng, để không đưa người vượt sức chứa vào phòng đã đủ bồ đoàn.
export const roomCounts = (directory) => aggregateRoomCounts(directory, 'roomCounts');
export const roomSeatCounts = (directory) => aggregateRoomCounts(directory, 'roomSeatCounts', 'roomCounts');

// Phòng đang có máy giữ thì trả máy đó; chưa có thì chọn máy realtime còn sống ít kết nối nhất.
// Không có danh bạ (chạy một máy) thì dùng URL cấu hình sẵn.
export async function locateRoom(roomId, options = {}) {
  if (!options.directory) return { nodeId: null, realtimeUrl: options.realtimeUrl || '/ws' };
  const [owner, nodes] = await Promise.all([options.directory.getRoomOwner(roomId), options.directory.listNodes()]);
  const live = nodes.filter((node) => typeof node.url === 'string');
  const current = owner && live.find((node) => node.nodeId === owner.nodeId);
  if (current) return { nodeId: current.nodeId, realtimeUrl: current.url };
  if (!live.length) return null;
  const target = live.reduce((best, node) => ((node.connections ?? 0) < (best.connections ?? 0) ? node : best));
  return { nodeId: target.nodeId, realtimeUrl: target.url };
}

// Phòng cố định trong danh mục, hoặc chánh điện theo tiểu bang/ngôn ngữ (thien-az-vi-2) mở theo nhu cầu.
// Tài khoản tạo chưa tới 24 giờ là "nick mới" (dò clone nhắn trùng).
const FRESH_ACCOUNT_MS = 24 * 60 * 60_000;
const findOpenRoom = (roomId) => ROOMS.find((candidate) => candidate.id === roomId && candidate.status === 'open')
  || (parseThienRoomId(roomId) ? { id: roomId, type: 'thien', name: thienRoomName(roomId), status: 'open' } : null)
  || (isPrivateRoomId(roomId) ? { id: roomId, type: 'loto-private', name: 'Lô Tô riêng', status: 'open' } : null);

export function createJoinResponse(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 400, body: { error: 'invalid_body' } };
  if (typeof input.roomId !== 'string') return { status: 400, body: { error: 'invalid_room_id' } };
  const room = findOpenRoom(input.roomId);
  if (!room) return { status: 404, body: { error: 'room_not_found' } };
  if (parseThienRoomId(room.id)) {
    const invite = verifyRoomInvite(input.inviteCode, options.secret || DEFAULT_LOCAL_SECRET, { now: options.now });
    if (!invite.ok || invite.value.roomId !== room.id) return { status: 403, body: { error: 'invalid_room_invite' } };
  }
  // Phòng Lô Tô riêng: chủ phòng, người được mời hoặc thành viên mở link (tự thành khách); người bị đuổi / phòng đầy / đã đóng thì từ chối.
  if (isPrivateRoomId(room.id)) {
    const allowed = options.privateRooms?.canJoin(room.id, options.account?.id) || { ok: false, error: 'not_found' };
    if (!allowed.ok) return { status: allowed.error === 'closed' ? 410 : allowed.error === 'not_found' ? 404 : 403, body: { error: allowed.error === 'closed' ? 'private_room_closed' : allowed.error === 'not_found' ? 'room_not_found' : allowed.error === 'kicked' ? 'private_room_kicked' : allowed.error === 'full' ? 'private_room_full' : 'private_room_not_invited' } };
  }
  // Thành viên đã đăng nhập vào phòng bằng tên tài khoản; vé mang accountId để công đức được ghi sổ.
  const account = options.account || null;
  const displayName = account ? account.displayName : typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (!displayName || displayName.length > 40) return { status: 400, body: { error: 'invalid_display_name' } };
  if (!account && options.moderation?.check(displayName).action === 'block') {
    return { status: 400, body: { error: 'display_name_not_allowed', message: 'Tên hiển thị có từ không phù hợp, xin chọn tên khác.' } };
  }

  const participantId = `u-${randomUUID()}`;
  const secret = options.secret || DEFAULT_LOCAL_SECRET;
  const claims = {
    participantId, roomId: room.id, displayName,
    ...(account ? {
      accountId: account.id, level: options.accountLevel || 1,
      ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
      ...(options.accountTitle ? { title: options.accountTitle } : {}),
      ...(options.accountFrame ? { frame: options.accountFrame } : {}),
      // Hình nhân vật đã mua trong shop: máy realtime chỉ cho mặc hình có trong vé.
      ...(options.ownedSkins?.length ? { skins: options.ownedSkins } : {}),
      // Hình chọn lần cuối của tài khoản: máy realtime dựng đúng nhân vật ngay khi vào phòng.
      ...(options.preferredSkin ? { skin: options.preferredSkin } : {}),
      // Linh thú đang dẫn theo ({ species, level }): người trong phòng thấy đi theo chủ ngoài sân.
      ...(options.accountPet ? { pet: options.accountPet } : {}),
      // Tài khoản tạo dưới 24 giờ: máy realtime coi như "nick mới" khi dò clone nhắn trùng.
      ...(Number.isSafeInteger(account.createdAt) && (options.now ?? Date.now()) - account.createdAt < FRESH_ACCOUNT_MS ? { fresh: true } : {}),
    } : {}),
  };
  const ticket = createJoinTicket(claims, secret, { now: options.now });
  return {
    status: 200,
    body: {
      participantId,
      roomId: room.id,
      displayName,
      ticket,
      member: Boolean(account),
      realtimeUrl: options.realtimeUrl || '/ws',
      protocolVersion: PROTOCOL_VERSION,
    },
  };
}

export async function handleApiRequest(req, res, options = {}) {
  const pathname = new URL(req.url, 'http://local').pathname;
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    res.writeHead(204, {
      ...corsHeaders(req),
      'Access-Control-Allow-Headers': 'content-type, x-admin-key, idempotency-key',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Max-Age': '600',
    }).end();
    return;
  }
  if (req.method === 'GET' && pathname === '/health') {
    json(req, res, 200, { status: 'ok', service: 'api', protocolVersion: PROTOCOL_VERSION });
    return;
  }
  if (req.method === 'GET' && pathname === '/api/v1/meta') {
    json(req, res, 200, { name: 'Chánh Điện Online', protocolVersion: PROTOCOL_VERSION });
    return;
  }
  if (req.method === 'GET' && pathname === '/api/v1/rooms') {
    json(req, res, 200, { rooms: listPublicRooms(await roomCounts(options.directory)) });
    return;
  }
  const locateMatch = req.method === 'GET' && pathname.match(/^\/api\/v1\/rooms\/([a-z0-9-]{1,64})\/locate$/);
  if (locateMatch) {
    if (!findOpenRoom(locateMatch[1])) {
      json(req, res, 404, { error: 'room_not_found' });
      return;
    }
    const located = await locateRoom(locateMatch[1], options);
    if (!located) json(req, res, 503, { error: 'no_realtime_node' });
    else json(req, res, 200, { roomId: locateMatch[1], ...located });
    return;
  }
  if (req.method === 'POST' && pathname === '/api/v1/rooms/join') {
    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      const tooLarge = error.message === 'BODY_TOO_LARGE';
      json(req, res, tooLarge ? 413 : 400, { error: tooLarge ? 'body_too_large' : 'invalid_json' });
      return;
    }
    const account = currentAccount(req, options);
    // Nick đang bị khóa (hoặc khách bị chặn IP) không được cấp vé vào phòng nào.
    const ban = options.moderation?.restriction({ accountId: account?.id || null, ipHash: requestIpHash(req, options) });
    if (ban?.kind === 'ban') {
      json(req, res, 403, { error: 'banned', message: banMessage(ban), until: ban.expiresAt || ban.ipUntil || null });
      return;
    }
    const accountLevel = account ? options.accounts.profile(account.id).stats.level.level : undefined;
    const ownedSkins = account ? options.shopStore?.ownedSkins(account.id) : undefined;
    const preferredSkin = account ? options.shopStore?.preferredSkin(account.id) : undefined;
    const accountPet = account ? options.garden?.companion(account.id) || undefined : undefined;
    const achievement = account ? loginRewardView(options, account.id)?.achievement : null;
    const accountTitle = achievement?.unlocked ? achievement.id : undefined;
    const accountFrame = achievement?.unlocked ? achievement.frame : undefined;
    const result = createJoinResponse(input, {
      ...options, account, accountLevel, ownedSkins, preferredSkin, accountTitle, accountFrame, accountPet,
    });
    if (result.status === 200) {
      const located = await locateRoom(result.body.roomId, options);
      if (!located) {
        json(req, res, 503, { error: 'no_realtime_node' });
        return;
      }
      result.body.realtimeUrl = located.realtimeUrl;
    }
    json(req, res, result.status, result.body);
    return;
  }
  if (await handleFriendLinksRequest(req, res, pathname, options)) return;
  if (await handlePrivateRoomRequest(req, res, pathname, options)) return;
  if (await handleAuthRequest(req, res, pathname, options)) return;
  if (await handleCommunityProjectRequest(req, res, pathname, options)) return;
  if (await handleGardenRequest(req, res, pathname, options)) return;
  if (await handleGardenBotRequest(req, res, pathname, options)) return;
  if (await handleMemorialRequest(req, res, pathname, options)) return;
  if (await handlePetsRequest(req, res, pathname, options)) return;
  if (await handleChoreRewardRequest(req, res, pathname, options)) return;
  if (await handleGameRequest(req, res, pathname, options)) return;
  if (await handleTelegramDonateRequest(req, res, pathname, options)) return;
  if (handleDonateRequest(req, res, pathname, options)) return;
  if (await handleSupportRequest(req, res, pathname, options)) return;
  if (await handleShopRequest(req, res, pathname, options)) return;
  if (await handleCinemaPlaylistRequest(req, res, pathname, options)) return;
  if (await handleThienRequest(req, res, pathname, options, roomSeatCounts)) return;
  if (await handleModerationRequest(req, res, pathname, options)) return;
  if (await handleBotChatRequest(req, res, pathname, options)) return;
  json(req, res, 404, { error: 'not_found' });
}

export function createApiServer(options = {}) {
  return http.createServer((req, res) => {
    handleApiRequest(req, res, options).catch(() => json(req, res, 500, { error: 'internal_error' }));
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const host = process.env.API_HOST || '127.0.0.1';
  const port = Number(process.env.API_PORT) || 4000;
  const secret = process.env.SESSION_SECRET || DEFAULT_LOCAL_SECRET;
  const realtimeUrl = process.env.REALTIME_PUBLIC_URL || '/ws';
  const { directory, shared } = await createDirectoryFromEnv();
  // Tài khoản và sổ công đức: SQLite ở DATA_DIR (mặc định .data/). GOOGLE_CLIENT_ID bật nút đăng nhập Google.
  const accounts = openAccountStore(process.env.DATA_DIR || '.data');
  const thienEventStore = openThienEventStore(process.env.DATA_DIR || '.data');
  const prayerSlipStore = openPrayerSlipStore(process.env.DATA_DIR || '.data');
  const cinemaPlaylistStore = openCinemaPlaylistStore(process.env.DATA_DIR || '.data');
  // Vườn Công Đức: chung file SQLite với tài khoản; mốc tưới 8/24 giờ do đồng hồ server quyết định.
  const garden = openGardenStore(accounts);
  // Một cây Bồ Đề chung cho toàn hệ thống, không nhân bản dữ liệu theo tiểu bang / ngôn ngữ / phòng.
  const communityProject = openCommunityProjectStore(accounts);
  const googleClientId = process.env.GOOGLE_CLIENT_ID || null;
  // Một máy realtime (không Redis): API hỏi thẳng máy realtime số người từng phòng để tự mở phòng kế tiếp.
  const realtimeInternalUrl = process.env.REALTIME_INTERNAL_URL || 'http://127.0.0.1:4001';
  // Cụm nhiều node: gửi lệnh quản trị bot tới tất cả node; lease quyết định node nào thực sự giữ từng phòng.
  const realtimeInternalUrls = process.env.REALTIME_INTERNAL_URLS
    || (shared ? `${realtimeInternalUrl},http://127.0.0.1:4002` : realtimeInternalUrl);
  // Bạn bè: online ở phòng nào, mời vào phòng, lời nhắn (báo trang người nhận qua máy realtime).
  const notifyInbox = realtimeInboxNotifier(realtimeInternalUrls, secret);
  const friendLinks = openFriendLinks(accounts, { secret, notify: notifyInbox });
  // ADMIN_SECRET riêng nếu có; local mặc định dùng SESSION_SECRET. Trang admin không lưu khóa này trên server.
  const adminSecret = process.env.ADMIN_SECRET || secret;
  // Trang Ủng hộ: thông tin Zelle từ biến môi trường DONATE_* (xem donate.mjs), không ghi trong repo.
  const donate = donateConfig();
  const donateStore = openDonateStore(accounts, donate);
  // Phiếu hỗ trợ (báo lỗi / góp ý): file support.json ở DATA_DIR.
  const supportStore = openSupportStore(process.env.DATA_DIR || '.data');
  // Shop nhân vật: ví kim cương chung file SQLite; nạp qua Stripe khi có STRIPE_SECRET_KEY (xem shop.mjs).
  const shopStore = openShopStore(accounts);
  // Nhân vật admin tải lên: file .glb đã nén lưu cạnh database.
  const shopModelDir = path.join(process.env.DATA_DIR || '.data', 'models');
  const shop = shopConfig();
  if (shop.secretKey) console.log(`Shop: nạp kim cương qua Stripe${shop.webhookSecret ? ' (có webhook)' : ' (chưa có STRIPE_WEBHOOK_SECRET)'}`);
  // Báo phiếu hỗ trợ mới qua Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (tùy chọn SUPPORT_ADMIN_URL để kèm link).
  const notifySupport = createTelegramNotifier({
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    adminUrl: process.env.SUPPORT_ADMIN_URL || null,
  });
  if (notifySupport) console.log('Phiếu hỗ trợ mới sẽ báo qua Telegram');
  // Kiểm duyệt: khóa / tắt chat / từ khả nghi báo cùng nhóm Telegram (gom tin vài giây một lần).
  const moderation = openModerationStore(accounts, batchNotifier(createTelegramSender({
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  })));
  const server = createApiServer({
    secret, adminSecret, realtimeUrl, directory: shared ? directory : null, accounts, garden, communityProject,
    googleClientId, realtimeInternalUrl, thienEventStore, prayerSlipStore, cinemaPlaylistStore, donate, donateStore,
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
    configureBots: realtimeBotController(realtimeInternalUrls, secret),
    // Chat với bot: tin người chơi nhắn bot báo về Telegram ngay (không gom), /tl trả lời thay bot.
    botChats: openBotChatStore(accounts, createTelegramSender({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID })),
    botSpeaker: realtimeBotSpeaker(realtimeInternalUrls, secret),
    // Nhắn riêng bạn bot: quản trị trả lời bằng /tl thì báo trang người nhận có tin mới.
    notifyInbox,
    // Khu tưởng niệm: mỗi mộ mới báo nhóm Telegram để quản trị gỡ được (/xoamo) nếu tên xúc phạm.
    memorialNotify: createTelegramSender({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }),
    supportStore, notifySupport, shopStore, shop, shopModelDir, moderation,
    friendLinks,
    // Vườn / khu tưởng niệm / công trình chung báo tới mọi máy realtime (mỗi máy phát cho phòng nó đang giữ).
    realtimeBroadcastUrls: realtimeInternalUrls,
    // Phòng Lô Tô riêng cho nhóm bạn: trừ xu ở ví vườn, danh sách mời ở SQLite, báo máy realtime thêm bot / đuổi người.
    privateRooms: accounts ? createPrivateRooms({ db: accounts.database, accounts, garden, friendLinks, notifyRealtime: realtimePrivateRoomNotifier(realtimeInternalUrls, secret) }) : null,
  });
  server.listen(port, host, () => console.log(`API: http://${host}:${port} (${shared ? 'danh bạ Redis' : 'một máy realtime'})`));
}
