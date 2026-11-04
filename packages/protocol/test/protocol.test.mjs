import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITS,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
} from '../src/index.mjs';

test('protocol bắt đầu ở version 1', () => {
  assert.equal(PROTOCOL_VERSION, 1);
});

test('nhận hello hợp lệ và giữ nguyên dữ liệu', () => {
  const message = { v: 1, type: 'hello', roomId: 'cinema-1', displayName: 'Minh An' };
  assert.deepEqual(parseClientMessage(message), { ok: true, value: message });
});

test('từ chối sai version, thiếu trường và trường lạ', () => {
  assert.equal(parseClientMessage({ v: 2, type: 'ping', sentAt: 1 }).error, 'INVALID_ENVELOPE');
  assert.equal(parseClientMessage({ v: 1, type: 'chat.send', requestId: 'r1' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'ping', sentAt: 1, extra: true }).error, 'INVALID_MESSAGE');
});

test('từ chối text quá giới hạn và không ép kiểu', () => {
  assert.equal(parseClientMessage({
    v: 1,
    type: 'chat.send',
    requestId: 'r1',
    text: 'a'.repeat(LIMITS.chatText + 1),
  }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'ping', sentAt: '1' }).error, 'INVALID_MESSAGE');
});

test('kiểm tra quyền room.command', () => {
  const message = { v: 1, type: 'room.command', requestId: 'r1', command: 'skip' };
  assert.equal(parseClientMessage(message, { role: 'guest' }).error, 'FORBIDDEN');
  assert.equal(parseClientMessage(message, { role: 'moderator' }).ok, true);
});

test('server message bắt buộc có epoch', () => {
  const message = { v: 1, type: 'pong', sentAt: 10, serverTime: 12 };
  assert.equal(parseServerMessage(message).error, 'INVALID_EPOCH');
  assert.equal(parseServerMessage({ ...message, epoch: 3 }).ok, true);
});

test('client có thể bỏ qua an toàn server message chưa biết', () => {
  const result = parseServerMessage({ v: 1, type: 'future.message', epoch: 1 });
  assert.deepEqual(result, { ok: false, error: 'UNKNOWN_MESSAGE_TYPE' });
});

test('snapshot giới hạn 500 người và validate từng người', () => {
  const valid = {
    v: 1,
    type: 'room.state',
    epoch: 2,
    roomId: 'cinema-1',
    revision: 8,
    participants: [{ id: 'u1', displayName: 'An', seatId: 'A-1' }],
  };
  assert.equal(parseServerMessage(valid).ok, true);
  assert.equal(parseServerMessage({ ...valid, participants: Array(501).fill(valid.participants[0]) }).error, 'INVALID_MESSAGE');
});

test('welcome hỗ trợ resume token nhưng vẫn nhận message cũ', () => {
  const welcome = {
    v: 1,
    type: 'welcome',
    epoch: 1,
    connectionId: 'c-1',
    serverTime: 1_000,
    heartbeatMs: 15_000,
  };
  assert.equal(parseServerMessage(welcome).ok, true);
  assert.equal(parseServerMessage({ ...welcome, resumeToken: 'resume-abc' }).ok, true);
  assert.equal(parseServerMessage({ ...welcome, resumeToken: 'x'.repeat(LIMITS.resumeToken + 1) }).error, 'INVALID_MESSAGE');
});

test('snapshot có thể đánh dấu người đang mất kết nối', () => {
  const state = {
    v: 1,
    type: 'room.state',
    epoch: 1,
    roomId: 'cinema-1',
    revision: 2,
    participants: [{ id: 'u-1', displayName: 'An', seatId: 'S-1', connected: false }],
  };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, participants: [{ ...state.participants[0], connected: 'false' }] }).error, 'INVALID_MESSAGE');
});

test('queue.add chỉ nhận id video YouTube 11 ký tự; playback.report kiểm tra giá trị', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'queue.add', requestId: 'r1', videoId: 'dQw4w9WgXcQ' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'queue.add', requestId: 'r1', videoId: 'https://youtu.be/x' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'vote.skip', requestId: 'r1', itemId: 'q-1' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'playback.report', itemId: 'q-1', event: 'duration', value: 212.4 }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'playback.report', itemId: 'q-1', event: 'duration' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'playback.report', itemId: 'q-1', event: 'ended' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'playback.report', itemId: 'q-1', event: 'seek', value: 1 }).error, 'INVALID_MESSAGE');
});

test('playback.state hợp lệ khi chưa có bài và khi đang chiếu', () => {
  const empty = { v: 1, type: 'playback.state', epoch: 1, current: null, queue: [], votes: 0, votesNeeded: 1 };
  assert.equal(parseServerMessage(empty).ok, true);
  const item = { itemId: 'q-1', videoId: 'dQw4w9WgXcQ', title: 'Bài hát', addedBy: 'An' };
  assert.equal(parseServerMessage({ ...empty, current: { ...item, startedAt: 1_000, duration: 212 }, queue: [item] }).ok, true);
  assert.equal(parseServerMessage({ ...empty, current: { ...item, startedAt: '1' } }).error, 'INVALID_MESSAGE');
});

test('chánh điện: avatar.set, offering.send và offering; người trong phòng có thể kèm skin và công đức', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'avatar.set', requestId: 'r1', skin: 'monk' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'avatar.set', requestId: 'r1', skin: 'robot' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'offering.send', requestId: 'r1', kind: 'incense', text: 'Cầu bình an' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'offering.send', requestId: 'r1', kind: 'gold' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'offering.send', requestId: 'r1', kind: 'bell', text: 'a'.repeat(121) }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: 1, type: 'offering', epoch: 1, offeringId: 'o-1', participantId: 'u-1', kind: 'lotus', at: 5 }).ok, true);
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', seatId: 'S-1', connected: true, skin: 'nun', merit: 25, level: 2 }],
  }).ok, true);
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', level: 0 }],
  }).ok, false, 'cấp phải từ 1');
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', avatarUrl: 'https://lh3.googleusercontent.com/a/x' }],
  }).ok, true);
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', avatarUrl: 'https://evil.example/a.png' }],
  }).ok, false, 'chỉ nhận ảnh Google');
});

test('nhập vai: tin di chuyển và động tác', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'move', x: 1.25, z: -3, ry: 3.1, moving: true }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'move', x: 1e9, z: 0, ry: 0, moving: true }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'move', x: '1', z: 0, ry: 0, moving: true }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'emote', requestId: 'e1', kind: 'bow108' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'emote', requestId: 'e1', kind: 'dance' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'bench.select', requestId: 'b1', benchId: 'B-2' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'bench.select', requestId: 'b1', benchId: 2 }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'travel.go', requestId: 't1', destination: 'garden' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'travel.go', requestId: 't1', destination: 'pond' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'travel.go', requestId: 't1', destination: 'hall', x: 0 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: 1, type: 'room.moves', epoch: 1, moves: [{ id: 'u-1', x: 0, z: 1, ry: 0, m: true }] }).ok, true);
  assert.equal(parseServerMessage({ v: 1, type: 'emote', epoch: 1, participantId: 'u-1', kind: 'kneel', at: 5 }).ok, true);
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-2', displayName: 'Bình', benchId: 'B-2', benchSpot: 2 }],
  }).ok, true);
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-2', displayName: 'Bình', benchId: 'B-2' }],
  }).error, 'INVALID_MESSAGE', 'benchId và benchSpot luôn đi cùng nhau');
  assert.equal(parseServerMessage({
    v: 1, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', pos: { x: 0, z: 12, ry: 0 }, emote: 'kneel' }],
  }).ok, true);
});

test('sớ: báo đã gửi sớ và thông báo thầy nhận sớ', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'prayer.announce', requestId: 'p1', kind: 'peace' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'prayer.announce', requestId: 'p1', kind: 'peace', names: ['A'] }).error, 'INVALID_MESSAGE', 'không mang tên người trong sớ');
  assert.equal(parseServerMessage({ v: 1, type: 'prayer.received', epoch: 1, participantId: 'u-1', kind: 'memorial', at: 1 }).ok, true);
});

test('tụng kinh: mã bài kinh chỉ đi kèm động tác chant', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'emote', requestId: 'e1', kind: 'chant', sutra: 'a-di-da' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'emote', requestId: 'e1', kind: 'woodfish' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'emote', requestId: 'e1', kind: 'kneel', sutra: 'a-di-da' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'emote', requestId: 'e1', kind: 'chant', sutra: '<script>' }).error, 'INVALID_MESSAGE');
});

test('kết bạn: nhận lời mời và trả lời hợp lệ, từ chối sai kiểu', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'friend.request', requestId: 'r1', targetId: 'p-2' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'friend.respond', requestId: 'r1', fromId: 'p-1', accept: true }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'friend.respond', requestId: 'r1', fromId: 'p-1', accept: 'yes' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'friend.request', requestId: 'r1' }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: 1, type: 'friend.state', epoch: 1, fromId: 'p-1', toId: 'p-2', status: 'accepted', saved: true }).ok, true);
  assert.equal(parseServerMessage({ v: 1, type: 'friend.state', epoch: 1, fromId: 'p-1', toId: 'p-2', status: 'best' }).error, 'INVALID_MESSAGE');
});

test('khiêu chiến kéo búa bao: chỉ nhận trò và nước đi đã định nghĩa', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'challenge.send', requestId: 'r1', targetId: 'p-2', game: 'rps' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'challenge.send', requestId: 'r1', targetId: 'p-2', game: 'chess' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'challenge.respond', requestId: 'r1', challengeId: 'g-1', accept: false }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'challenge.move', requestId: 'r1', challengeId: 'g-1', choice: 'paper' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'challenge.move', requestId: 'r1', challengeId: 'g-1', choice: 'lizard' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'challenge.cancel', requestId: 'r1', challengeId: 'g-1' }).ok, true);
  const state = {
    v: 1, type: 'challenge.state', epoch: 1, challengeId: 'g-1', game: 'rps', fromId: 'p-1', toId: 'p-2', status: 'playing',
    round: 2, fromScore: 1, toScore: 0, target: 2, deadline: 1000, moved: { from: true, to: false },
    last: { from: 'rock', to: 'scissors', winner: 'from' },
  };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, last: { from: 'rock', to: 'gun', winner: 'from' } }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...state, status: 'won' }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...state, extra: 1 }).error, 'INVALID_MESSAGE');
});

test('chặn và báo cáo người chơi: lý do cố định, ghi chú có giới hạn độ dài', () => {
  assert.equal(parseClientMessage({ v: 1, type: 'player.block', requestId: 'r1', targetId: 'p-2', blocked: true }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'player.block', requestId: 'r1', targetId: 'p-2' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'spam' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'harassment', note: 'nói lời khó nghe' }).ok, true);
  assert.equal(parseClientMessage({ v: 1, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'boring' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: 1, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'other', note: 'x'.repeat(201) }).error, 'INVALID_MESSAGE');
});

test('garden.plot: luống trống hoặc có vụ hợp lệ; từ chối luống ngoài 1–10 và trường lạ', () => {
  const crop = {
    id: 1, plantType: 'peach', ownerName: 'An', stage: 'fruiting', waterDays: 3, waterNeeded: 3,
    wateredToday: false, canWater: true, wilted: false, lastWateredAt: 5, nextWaterAt: 10, wiltsAt: 20,
    fruitsLeft: 8, fruitsTotal: 10, plantedAt: 5,
  };
  assert.equal(parseServerMessage({ v: 1, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop }, { id: 2, crop: null }] }).ok, true);
  assert.equal(parseServerMessage({ v: 1, type: 'garden.plot', epoch: 1, plots: [{ id: 11, crop: null }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: 1, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop: { ...crop, coins: 9 } }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: 1, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop }], effect: { plotId: 1, kind: 'harvest', by: 'An' } }).ok, true);
});

test('phòng đông: room.count (tổng có bot, bảng công đức, hạng) và tên người gửi tùy chọn', () => {
  const count = { v: 1, type: 'room.count', epoch: 1, total: 523, bots: 8, top: [{ id: 'p-1', displayName: 'An', merit: 40, level: 2 }], rank: 1 };
  assert.equal(parseServerMessage(count).ok, true);
  assert.equal(parseServerMessage({ ...count, rank: undefined, top: [] }).ok, true);
  assert.equal(parseServerMessage({ ...count, bots: 600 }).error, 'INVALID_MESSAGE', 'số bot không vượt tổng');
  assert.equal(parseServerMessage({ ...count, total: -1 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...count, top: [{ id: 'p-1', displayName: 'An', merit: 0 }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...count, top: [{ id: 'p-1', displayName: 'An', merit: 5, avatarUrl: 'https://evil.example/a.png' }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...count, extra: 1 }).error, 'INVALID_MESSAGE');
  const chat = { v: 1, type: 'chat.message', epoch: 1, messageId: 'm-1', participantId: 'p-1', text: 'Nam mô', sentAt: 1 };
  assert.equal(parseServerMessage(chat).ok, true, 'client/server cũ không có displayName vẫn hợp lệ');
  assert.equal(parseServerMessage({ ...chat, displayName: 'An' }).ok, true);
  assert.equal(parseServerMessage({ ...chat, displayName: 'x'.repeat(41) }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: 1, type: 'offering', epoch: 1, offeringId: 'o-1', participantId: 'p-1', displayName: 'An', kind: 'incense', at: 1 }).ok, true);
  assert.equal(parseServerMessage({ v: 1, type: 'prayer.received', epoch: 1, participantId: 'p-1', displayName: 'An', kind: 'peace', at: 1 }).ok, true);
});

test('thả cảm xúc: chỉ nhận loại cố định, không trường lạ', () => {
  const send = { v: 1, type: 'reaction.send', requestId: 'r-1', kind: 'laugh' };
  assert.equal(parseClientMessage(send).ok, true);
  assert.equal(parseClientMessage({ ...send, kind: 'poop' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...send, text: 'x' }).error, 'INVALID_MESSAGE');
  const event = { v: 1, type: 'reaction', epoch: 1, participantId: 'p-1', kind: 'fire', at: 1 };
  assert.equal(parseServerMessage(event).ok, true);
  assert.equal(parseServerMessage({ ...event, kind: 'x' }).error, 'INVALID_MESSAGE');
});

test('Bầu Cua chơi chung: bet.place chỉ cho thành viên, đúng linh vật / số xu / mã ván; game.state, game.mine, game.payout đúng dạng', () => {
  const bet = { v: 1, type: 'bet.place', requestId: 'bet-1', roundId: 'bc-game-1-1-3-ab12', animal: 'cua', amount: 5 };
  assert.equal(parseClientMessage(bet, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage(bet, { role: 'guest' }).ok, false, 'khách không cược');
  assert.equal(parseClientMessage({ ...bet, animal: 'rong' }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage({ ...bet, amount: 0 }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage({ ...bet, amount: 1_001 }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage({ ...bet, amount: '5' }, { role: 'member' }).ok, false, 'không ép kiểu');
  assert.equal(parseClientMessage({ ...bet, roundId: 'x' }, { role: 'member' }).ok, false);
  const cancel = { v: 1, type: 'bet.cancel', requestId: 'cancel-1', roundId: 'bc-game-1-1-3-ab12' };
  assert.equal(parseClientMessage(cancel, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage(cancel, { role: 'guest' }).ok, false);
  assert.equal(parseClientMessage({ ...cancel, animal: 'cua' }, { role: 'member' }).ok, false, 'không trường lạ');
  const totals = { nai: 0, bau: 0, ga: 10, ca: 0, cua: 15, tom: 0 };
  const state = { v: 1, type: 'game.state', epoch: 1, game: 'bau-cua', roundId: 'bc-game-1-1-3-ab12', phase: 'betting', endsAt: 1_000, totals, bettors: 2 };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, phase: 'result', dice: ['cua', 'cua', 'ga'], winners: [{ displayName: 'An', net: 25 }] }).ok, true);
  assert.equal(parseServerMessage({ ...state, phase: 'result', dice: ['cua', 'ga'] }).ok, false, 'đủ 3 xúc xắc');
  assert.equal(parseServerMessage({ ...state, totals: { cua: 15 } }).ok, false, 'tổng cả bàn đủ 6 linh vật');
  assert.equal(parseServerMessage({ ...state, phase: 'result', void: true }).ok, true);
  assert.equal(parseServerMessage({ v: 1, type: 'game.mine', epoch: 1, roundId: 'bc-game-1-1-3-ab12', mine: { cua: 15 }, coins: 35, requestId: 'bet-1' }).ok, true);
  const payout = { v: 1, type: 'game.payout', epoch: 1, roundId: 'bc-game-1-1-3-ab12', staked: 20, payout: 45, net: 25, coins: 75 };
  assert.equal(parseServerMessage(payout).ok, true);
  assert.equal(parseServerMessage({ ...payout, net: 30 }).ok, false, 'net = payout − staked');
});
