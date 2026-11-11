import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITS,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
  TAI_XIU_SPOTS,
  TIENLEN_INSTANT_WINS,
  TIENLEN_MODES,
  TIENLEN_STAKES,
} from '../src/index.mjs';
import { INSTANT_WINS, TIENLEN_MODES as RULE_MODES, TIENLEN_STAKES as RULE_STAKES } from '../../tien-len/src/index.mjs';

test('protocol danh hiệu, khung và tương tác thú cưng ở version 3', () => {
  assert.equal(PROTOCOL_VERSION, 3);
});

test('nhận hello hợp lệ và giữ nguyên dữ liệu', () => {
  const message = { v: PROTOCOL_VERSION, type: 'hello', roomId: 'cinema-1', displayName: 'Minh An' };
  assert.deepEqual(parseClientMessage(message), { ok: true, value: message });
});

test('từ chối sai version, thiếu trường và trường lạ', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION - 1, type: 'ping', sentAt: 1 }).error, 'INVALID_ENVELOPE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'chat.send', requestId: 'r1' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'ping', sentAt: 1, extra: true }).error, 'INVALID_MESSAGE');
});

test('từ chối text quá giới hạn và không ép kiểu', () => {
  assert.equal(parseClientMessage({
    v: PROTOCOL_VERSION,
    type: 'chat.send',
    requestId: 'r1',
    text: 'a'.repeat(LIMITS.chatText + 1),
  }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'ping', sentAt: '1' }).error, 'INVALID_MESSAGE');
});

test('kiểm tra quyền room.command', () => {
  const message = { v: PROTOCOL_VERSION, type: 'room.command', requestId: 'r1', command: 'skip' };
  assert.equal(parseClientMessage(message, { role: 'guest' }).error, 'FORBIDDEN');
  assert.equal(parseClientMessage(message, { role: 'moderator' }).ok, true);
});

test('server message bắt buộc có epoch', () => {
  const message = { v: PROTOCOL_VERSION, type: 'pong', sentAt: 10, serverTime: 12 };
  assert.equal(parseServerMessage(message).error, 'INVALID_EPOCH');
  assert.equal(parseServerMessage({ ...message, epoch: 3 }).ok, true);
});

test('client có thể bỏ qua an toàn server message chưa biết', () => {
  const result = parseServerMessage({ v: PROTOCOL_VERSION, type: 'future.message', epoch: 1 });
  assert.deepEqual(result, { ok: false, error: 'UNKNOWN_MESSAGE_TYPE' });
});

test('snapshot giới hạn 500 người và validate từng người', () => {
  const valid = {
    v: PROTOCOL_VERSION,
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
    v: PROTOCOL_VERSION,
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
    v: PROTOCOL_VERSION,
    type: 'room.state',
    epoch: 1,
    roomId: 'cinema-1',
    revision: 2,
    participants: [{ id: 'u-1', displayName: 'An', seatId: 'S-1', connected: false }],
  };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, participants: [{ ...state.participants[0], connected: 'false' }] }).error, 'INVALID_MESSAGE');
});

test('snapshot chỉ nhận danh hiệu và khung sự kiện đã định nghĩa', () => {
  const state = {
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 2,
    participants: [{
      id: 'u-1', displayName: 'An', title: 'steadfast-practitioner', frame: 'seven-day-lotus',
    }],
  };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, participants: [{ ...state.participants[0], title: '<b>' }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...state, participants: [{ ...state.participants[0], frame: 'vip-paid' }] }).error, 'INVALID_MESSAGE');
});

test('snapshot: linh thú đi theo chỉ nhận loài đã định nghĩa và cấp 1–10, không có trường lạ', () => {
  const state = {
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 2,
    participants: [{ id: 'u-1', displayName: 'An', pet: { species: 'carp', level: 4 } }],
  };
  const withPet = (pet) => parseServerMessage({ ...state, participants: [{ ...state.participants[0], pet }] });
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(withPet({ species: 'lion', level: 10 }).ok, true);
  assert.equal(withPet({ species: 'dragon', level: 1 }).error, 'INVALID_MESSAGE');
  assert.equal(withPet({ species: 'crane', level: 11 }).error, 'INVALID_MESSAGE');
  assert.equal(withPet({ species: 'crane', level: 2, name: 'Bạch Hạc' }).error, 'INVALID_MESSAGE', 'tên linh thú không đi qua phòng');
});

test('queue.add chỉ nhận id video YouTube 11 ký tự; playback.report kiểm tra giá trị', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'r1', videoId: 'dQw4w9WgXcQ' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'queue.add', requestId: 'r1', videoId: 'https://youtu.be/x' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'vote.skip', requestId: 'r1', itemId: 'q-1' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'playback.report', itemId: 'q-1', event: 'duration', value: 212.4 }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'playback.report', itemId: 'q-1', event: 'duration' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'playback.report', itemId: 'q-1', event: 'ended' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'playback.report', itemId: 'q-1', event: 'seek', value: 1 }).error, 'INVALID_MESSAGE');
});

test('playback.state hợp lệ khi chưa có bài và khi đang chiếu', () => {
  const empty = { v: PROTOCOL_VERSION, type: 'playback.state', epoch: 1, current: null, queue: [], votes: 0, votesNeeded: 1 };
  assert.equal(parseServerMessage(empty).ok, true);
  const item = { itemId: 'q-1', videoId: 'dQw4w9WgXcQ', title: 'Bài hát', addedBy: 'An' };
  assert.equal(parseServerMessage({ ...empty, current: { ...item, startedAt: 1_000, duration: 212 }, queue: [item] }).ok, true);
  assert.equal(parseServerMessage({ ...empty, current: { ...item, startedAt: '1' } }).error, 'INVALID_MESSAGE');
});

test('chánh điện: avatar.set, offering.send và offering; người trong phòng có thể kèm skin và công đức', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'avatar.set', requestId: 'r1', skin: 'monk' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'avatar.set', requestId: 'r1', skin: 'swordsman' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'avatar.set', requestId: 'r1', skin: 'pilgrim' }).ok, true, 'protocol nhận hình bot để room.state dùng chung schema');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'avatar.set', requestId: 'r1', skin: 'robot' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'offering.send', requestId: 'r1', kind: 'incense', text: 'Cầu bình an' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'offering.send', requestId: 'r1', kind: 'gold' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'offering.send', requestId: 'r1', kind: 'bell', text: 'a'.repeat(121) }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'offering', epoch: 1, offeringId: 'o-1', participantId: 'u-1', kind: 'lotus', at: 5 }).ok, true);
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [
      { id: 'u-1', displayName: 'An', seatId: 'S-1', connected: true, skin: 'nun', merit: 25, level: 2 },
      { id: 'bot-1', displayName: 'An Nhiên 🤖', connected: true, skin: 'pilgrim', bot: true },
      { id: 'bot-2', displayName: 'Sen Nhỏ 🤖', connected: true, skin: 'lotusgirl', bot: true },
    ],
  }).ok, true);
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', level: 0 }],
  }).ok, false, 'cấp phải từ 1');
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', avatarUrl: 'https://lh3.googleusercontent.com/a/x' }],
  }).ok, true);
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', avatarUrl: 'https://evil.example/a.png' }],
  }).ok, false, 'chỉ nhận ảnh Google');
});

test('nhập vai: tin di chuyển và động tác', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'move', x: 1.25, z: -3, ry: 3.1, moving: true }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'move', x: 1e9, z: 0, ry: 0, moving: true }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'move', x: '1', z: 0, ry: 0, moving: true }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'bow108' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'dance' }).ok, true, 'nhún nhảy');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'act' }).ok, true, '✨ tương tác');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'twerk' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'bench.select', requestId: 'b1', benchId: 'B-2' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'bench.select', requestId: 'b1', benchId: 2 }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'travel.go', requestId: 't1', destination: 'garden' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'travel.go', requestId: 't1', destination: 'pond' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'travel.go', requestId: 't1', destination: 'hall', x: 0 }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'chore.start', requestId: 'c1', choreId: 'sweep-yard' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'chore.stop', requestId: 'c2', choreId: 'sweep-yard' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'chore.start', requestId: 'c1', choreId: '<script>' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'pet.interact', requestId: 'p1', petId: 'pet-cat-miu', action: 'pet' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'pet.interact', requestId: 'p1', petId: 'pet-cat-miu', action: 'ride' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'pet.interact', requestId: 'p1', petId: '<cat>', action: 'feed' }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'room.moves', epoch: 1, moves: [{ id: 'u-1', x: 0, z: 1, ry: 0, m: true }] }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'emote', epoch: 1, participantId: 'u-1', kind: 'kneel', at: 5 }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'pet.interaction', epoch: 1, participantId: 'u-1', petId: 'pet-dog-moc', action: 'play', at: 5 }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'pet.interaction', epoch: 1, participantId: 'u-1', petId: 'pet-dog-moc', action: 'sleep', at: 5 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-2', displayName: 'Bình', benchId: 'B-2', benchSpot: 2 }],
  }).ok, true);
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-2', displayName: 'Bình', benchId: 'B-2' }],
  }).error, 'INVALID_MESSAGE', 'benchId và benchSpot luôn đi cùng nhau');
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'room.state', epoch: 1, roomId: 'thien-1', revision: 1,
    participants: [{ id: 'u-1', displayName: 'An', pos: { x: 0, z: 12, ry: 0 }, emote: 'kneel' }],
  }).ok, true);
});

test('công việc chung: tiến độ và người phối hợp có schema chặt chẽ', () => {
  const message = {
    v: PROTOCOL_VERSION, type: 'chore.state', epoch: 2,
    chores: [{ id: 'sweep-yard', kind: 'sweep', progress: 420, workers: ['u-1', 'u-2'] }],
  };
  assert.equal(parseServerMessage(message).ok, true);
  assert.equal(parseServerMessage({ ...message, chores: [{ ...message.chores[0], progress: 1001 }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...message, chores: [{ ...message.chores[0], kind: 'gamble' }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...message, chores: [{ ...message.chores[0], text: 'x' }] }).error, 'INVALID_MESSAGE');
  const reward = {
    v: PROTOCOL_VERSION, type: 'chore.reward', epoch: 2, choreId: 'sweep-yard', kind: 'sweep',
    reward: 20, coins: 90, count: 2, limit: 3,
  };
  assert.equal(parseServerMessage(reward).ok, true);
  assert.equal(parseServerMessage({ ...reward, reward: 10 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...reward, count: 4 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...reward, coins: -1 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...reward, note: 'x' }).error, 'INVALID_MESSAGE');
});

test('sớ: báo đã gửi sớ và thông báo thầy nhận sớ', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'prayer.announce', requestId: 'p1', kind: 'peace' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'prayer.announce', requestId: 'p1', kind: 'peace', names: ['A'] }).error, 'INVALID_MESSAGE', 'không mang tên người trong sớ');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'prayer.received', epoch: 1, participantId: 'u-1', kind: 'memorial', at: 1 }).ok, true);
});

test('tụng kinh: mã bài kinh chỉ đi kèm động tác chant', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'chant', sutra: 'a-di-da' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'woodfish' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'kneel', sutra: 'a-di-da' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'emote', requestId: 'e1', kind: 'chant', sutra: '<script>' }).error, 'INVALID_MESSAGE');
});

test('kết bạn: nhận lời mời và trả lời hợp lệ, từ chối sai kiểu', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'friend.request', requestId: 'r1', targetId: 'p-2' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'friend.respond', requestId: 'r1', fromId: 'p-1', accept: true }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'friend.respond', requestId: 'r1', fromId: 'p-1', accept: 'yes' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'friend.request', requestId: 'r1' }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'friend.state', epoch: 1, fromId: 'p-1', toId: 'p-2', status: 'accepted', saved: true }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'friend.state', epoch: 1, fromId: 'p-1', toId: 'p-2', status: 'best' }).error, 'INVALID_MESSAGE');
});

test('khiêu chiến kéo búa bao: chỉ nhận trò và nước đi đã định nghĩa', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'challenge.send', requestId: 'r1', targetId: 'p-2', game: 'rps' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'challenge.send', requestId: 'r1', targetId: 'p-2', game: 'chess' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'challenge.respond', requestId: 'r1', challengeId: 'g-1', accept: false }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'challenge.move', requestId: 'r1', challengeId: 'g-1', choice: 'paper' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'challenge.move', requestId: 'r1', challengeId: 'g-1', choice: 'lizard' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'challenge.cancel', requestId: 'r1', challengeId: 'g-1' }).ok, true);
  const state = {
    v: PROTOCOL_VERSION, type: 'challenge.state', epoch: 1, challengeId: 'g-1', game: 'rps', fromId: 'p-1', toId: 'p-2', status: 'playing',
    round: 2, fromScore: 1, toScore: 0, target: 2, deadline: 1000, moved: { from: true, to: false },
    last: { from: 'rock', to: 'scissors', winner: 'from' },
  };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, last: { from: 'rock', to: 'gun', winner: 'from' } }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...state, status: 'won' }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...state, extra: 1 }).error, 'INVALID_MESSAGE');
});

test('chặn và báo cáo người chơi: lý do cố định, ghi chú có giới hạn độ dài', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'player.block', requestId: 'r1', targetId: 'p-2', blocked: true }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'player.block', requestId: 'r1', targetId: 'p-2' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'spam' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'harassment', note: 'nói lời khó nghe' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'boring' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'player.report', requestId: 'r1', targetId: 'p-2', reason: 'other', note: 'x'.repeat(201) }).error, 'INVALID_MESSAGE');
});

test('garden.plot: luống trống hoặc có vụ hợp lệ; từ chối luống ngoài 1–50 và trường lạ', () => {
  const crop = {
    id: 1, plantType: 'peach', ownerName: 'An', stage: 'fruiting', waterDays: 3, waterNeeded: 3,
    wateredToday: false, canWater: true, wilted: false, lastWateredAt: 5, nextWaterAt: 10, wiltsAt: 20,
    fruitsLeft: 8, fruitsTotal: 10, plantedAt: 5,
  };
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop }, { id: 2, crop: null }] }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 51, crop: null }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 50, crop: null }] }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop: { ...crop, coins: 9 } }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop }], effect: { plotId: 1, kind: 'harvest', by: 'An' } }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop }], at: 1_762_000_000_000 }).ok, true, 'mốc thứ tự at');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'garden.plot', epoch: 1, plots: [{ id: 1, crop }], at: '1' }).error, 'INVALID_MESSAGE');
});

test('community.project chỉ nhận snapshot công trình chung hợp lệ', () => {
  const project = {
    id: 'bodhi-global-1', kind: 'bodhi', stage: 'young', stageIndex: 2,
    progress: 520, target: 1_000, percent: 52, completed: false,
    contributors: 18, contributions: 74, updatedAt: 1_000,
  };
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'community.project', epoch: 3, project }).ok, true);
  assert.equal(parseServerMessage({
    v: PROTOCOL_VERSION, type: 'community.project', epoch: 3,
    project: { ...project, id: 'lotus-global-1', kind: 'lotus' },
  }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'community.project', epoch: 3, project: { ...project, id: 'lotus-global-1' } }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'community.project', epoch: 3, project: { ...project, stageIndex: 4 } }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'community.project', epoch: 3, project: { ...project, progress: 1_200 } }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'community.project', epoch: 3, project: { ...project, state: 'AZ' } }).error, 'INVALID_MESSAGE');
});

test('phòng đông: room.count (tổng có bot, bảng công đức, hạng) và tên người gửi tùy chọn', () => {
  const count = { v: PROTOCOL_VERSION, type: 'room.count', epoch: 1, total: 523, bots: 8, top: [{ id: 'p-1', displayName: 'An', merit: 40, level: 2 }], rank: 1 };
  assert.equal(parseServerMessage(count).ok, true);
  assert.equal(parseServerMessage({ ...count, rank: undefined, top: [] }).ok, true);
  assert.equal(parseServerMessage({ ...count, bots: 600 }).error, 'INVALID_MESSAGE', 'số bot không vượt tổng');
  assert.equal(parseServerMessage({ ...count, total: -1 }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...count, top: [{ id: 'p-1', displayName: 'An', merit: 0 }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...count, top: [{ id: 'p-1', displayName: 'An', merit: 5, avatarUrl: 'https://evil.example/a.png' }] }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ ...count, extra: 1 }).error, 'INVALID_MESSAGE');
  const chat = { v: PROTOCOL_VERSION, type: 'chat.message', epoch: 1, messageId: 'm-1', participantId: 'p-1', text: 'Nam mô', sentAt: 1 };
  assert.equal(parseServerMessage(chat).ok, true, 'client/server cũ không có displayName vẫn hợp lệ');
  assert.equal(parseServerMessage({ ...chat, displayName: 'An' }).ok, true);
  assert.equal(parseServerMessage({ ...chat, displayName: 'x'.repeat(41) }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'offering', epoch: 1, offeringId: 'o-1', participantId: 'p-1', displayName: 'An', kind: 'incense', at: 1 }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'prayer.received', epoch: 1, participantId: 'p-1', displayName: 'An', kind: 'peace', at: 1 }).ok, true);
});

test('thả cảm xúc: chỉ nhận loại cố định, không trường lạ', () => {
  const send = { v: PROTOCOL_VERSION, type: 'reaction.send', requestId: 'r-1', kind: 'laugh' };
  assert.equal(parseClientMessage(send).ok, true);
  assert.equal(parseClientMessage({ ...send, kind: 'poop' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...send, text: 'x' }).error, 'INVALID_MESSAGE');
  const event = { v: PROTOCOL_VERSION, type: 'reaction', epoch: 1, participantId: 'p-1', kind: 'fire', at: 1 };
  assert.equal(parseServerMessage(event).ok, true);
  assert.equal(parseServerMessage({ ...event, kind: 'x' }).error, 'INVALID_MESSAGE');
});

test('Bầu Cua chơi chung: bet.place chỉ cho thành viên, đúng linh vật / số xu / mã ván; game.state, game.mine, game.payout đúng dạng', () => {
  const bet = { v: PROTOCOL_VERSION, type: 'bet.place', requestId: 'bet-1', roundId: 'bc-game-1-1-3-ab12', animal: 'cua', amount: 5 };
  assert.equal(parseClientMessage(bet, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage(bet, { role: 'guest' }).ok, false, 'khách không cược');
  assert.equal(parseClientMessage({ ...bet, animal: 'rong' }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage({ ...bet, amount: 0 }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage({ ...bet, amount: 1_001 }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage({ ...bet, amount: '5' }, { role: 'member' }).ok, false, 'không ép kiểu');
  assert.equal(parseClientMessage({ ...bet, roundId: 'x' }, { role: 'member' }).ok, false);
  const cancel = { v: PROTOCOL_VERSION, type: 'bet.cancel', requestId: 'cancel-1', roundId: 'bc-game-1-1-3-ab12' };
  assert.equal(parseClientMessage(cancel, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage(cancel, { role: 'guest' }).ok, false);
  assert.equal(parseClientMessage({ ...cancel, animal: 'cua' }, { role: 'member' }).ok, false, 'không trường lạ');
  const totals = { nai: 0, bau: 0, ga: 10, ca: 0, cua: 15, tom: 0 };
  const state = { v: PROTOCOL_VERSION, type: 'game.state', epoch: 1, game: 'bau-cua', roundId: 'bc-game-1-1-3-ab12', phase: 'betting', endsAt: 1_000, totals, bettors: 2 };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, phase: 'result', dice: ['cua', 'cua', 'ga'], winners: [{ displayName: 'An', net: 25 }] }).ok, true);
  assert.equal(parseServerMessage({ ...state, phase: 'result', dice: ['cua', 'ga'] }).ok, false, 'đủ 3 xúc xắc');
  assert.equal(parseServerMessage({ ...state, totals: { cua: 15 } }).ok, false, 'tổng cả bàn đủ 6 linh vật');
  assert.equal(parseServerMessage({ ...state, phase: 'result', void: true }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'game.mine', epoch: 1, roundId: 'bc-game-1-1-3-ab12', mine: { cua: 15 }, coins: 35, requestId: 'bet-1' }).ok, true);
  const payout = { v: PROTOCOL_VERSION, type: 'game.payout', epoch: 1, roundId: 'bc-game-1-1-3-ab12', staked: 20, payout: 45, net: 25, coins: 75 };
  assert.equal(parseServerMessage(payout).ok, true);
  assert.equal(parseServerMessage({ ...payout, net: 30 }).ok, false, 'net = payout − staked');
});

test('Tài Xỉu: bet.place gửi spot (không phải animal), game.state xúc xắc 1–6 và lịch sử tối đa 10 ván', () => {
  const bet = { v: PROTOCOL_VERSION, type: 'bet.place', requestId: 'tx-bet-1', roundId: 'tx-taixiu-1-1-3-ab12', spot: 'tai', amount: 5 };
  assert.equal(parseClientMessage(bet, { role: 'member' }).ok, true);
  for (const spot of ['xiu', 't4', 't17', 'f1', 'f6']) assert.equal(parseClientMessage({ ...bet, spot }, { role: 'member' }).ok, true, spot);
  for (const spot of ['t3', 't18', 'f0', 'f7', 'cua', 'TAI']) assert.equal(parseClientMessage({ ...bet, spot }, { role: 'member' }).ok, false, spot);
  assert.equal(parseClientMessage({ ...bet, animal: 'cua' }, { role: 'member' }).ok, false, 'chỉ một trong animal / spot');
  const { spot, ...noSpot } = bet;
  assert.equal(parseClientMessage(noSpot, { role: 'member' }).ok, false, 'phải có ô cược');
  assert.equal(parseClientMessage({ ...bet, amount: -1000 }, { role: 'member' }).ok, false);
  assert.equal(parseClientMessage(bet, { role: 'guest' }).ok, false, 'khách không cược');

  const totals = Object.fromEntries(TAI_XIU_SPOTS.map((key) => [key, 0]));
  const state = { v: PROTOCOL_VERSION, type: 'game.state', epoch: 1, game: 'tai-xiu', roundId: 'tx-taixiu-1-1-3-ab12', phase: 'result', endsAt: 1_000, totals, bettors: 0, dice: [1, 2, 4], history: [[1, 2, 4], [6, 6, 6]] };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, dice: [0, 2, 4] }).ok, false, 'mặt 1–6');
  assert.equal(parseServerMessage({ ...state, dice: ['cua', 'ga', 'tom'] }).ok, false, 'không phải linh vật');
  assert.equal(parseServerMessage({ ...state, history: Array.from({ length: 11 }, () => [1, 1, 1]) }).ok, false, 'tối đa 10 ván');
  assert.equal(parseServerMessage({ ...state, totals: { tai: 5 } }).ok, false, 'tổng đủ mọi ô');
  assert.equal(parseServerMessage({ ...state, game: 'bau-cua' }).ok, false, 'Bầu Cua không có lịch sử số / ô Tài Xỉu');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'game.mine', epoch: 1, roundId: 'tx-taixiu-1-1-3-ab12', mine: { tai: 5, t11: 2 } }).ok, true);
});

test('Lô Tô: lotto.buy / lotto.claim cho thành viên; lotto.state, lotto.tickets đúng dạng', () => {
  const buy = { v: PROTOCOL_VERSION, type: 'lotto.buy', requestId: 'lt-buy-1', roundId: 'lt-loto-1-1-3-ab12', count: 2, autoMark: true };
  assert.equal(parseClientMessage(buy, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage(buy, { role: 'guest' }).ok, false, 'khách không mua vé');
  for (const count of [3, -1, 1.5, '1']) assert.equal(parseClientMessage({ ...buy, count }, { role: 'member' }).ok, false, String(count));
  assert.equal(parseClientMessage({ ...buy, count: 0, autoMark: false }, { role: 'member' }).ok, false, 'không mua gì');
  assert.equal(parseClientMessage({ ...buy, roundId: 'bc-game-1-1-3-ab12' }, { role: 'member' }).ok, false, 'mã ván Lô Tô');
  const claim = { v: PROTOCOL_VERSION, type: 'lotto.claim', requestId: 'lt-claim-1', roundId: 'lt-loto-1-1-3-ab12', ticket: 1, row: 2 };
  assert.equal(parseClientMessage(claim, { role: 'member' }).ok, true);
  for (const [field, value] of [['ticket', 3], ['ticket', 0], ['row', 3], ['row', -1]]) assert.equal(parseClientMessage({ ...claim, [field]: value }, { role: 'member' }).ok, false, `${field}=${value}`);

  const state = { v: PROTOCOL_VERSION, type: 'lotto.state', epoch: 1, roundId: 'lt-loto-1-1-3-ab12', phase: 'calling', endsAt: 1_000, called: [5, 37, 88], pool: 40, tickets: 4, players: 3, nextCallAt: 1_000, waiting: [{ displayName: 'An', number: 12 }] };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, called: [5, 5] }).ok, false, 'không lặp số');
  assert.equal(parseServerMessage({ ...state, called: [91] }).ok, false, 'số 1–90');
  assert.equal(parseServerMessage({ ...state, phase: 'betting' }).ok, false);
  assert.equal(parseServerMessage({ ...state, phase: 'result', winners: [{ displayName: 'An', share: 36 }] }).ok, true);
  const rows = [[1, 0, 21, 0, 45, 0, 63, 0, 88], [0, 14, 0, 37, 0, 52, 0, 71, 80], [7, 0, 29, 0, 0, 58, 66, 0, 85]];
  const tickets = { v: PROTOCOL_VERSION, type: 'lotto.tickets', epoch: 1, roundId: 'lt-loto-1-1-3-ab12', tickets: [{ no: 1, rows }], autoMark: false, coins: 90 };
  assert.equal(parseServerMessage(tickets).ok, true);
  assert.equal(parseServerMessage({ ...tickets, tickets: [{ no: 1, rows: [rows[0], rows[1], [7, 0, 29, 0, 0, 58, 66, 0, 0]] }] }).ok, false, 'mỗi hàng 5 số');
});

test('bot.quiet (tắt bot bắt chuyện) và game.invite (bot mời sang phòng game)', () => {
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'bot.quiet', requestId: 'r1', quiet: true }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'bot.quiet', requestId: 'r1', quiet: 'true' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'bot.quiet', requestId: 'r1' }).error, 'INVALID_MESSAGE');
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'game.invite', epoch: 1, fromId: 'bot-3', game: 'loto' }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'game.invite', epoch: 1, fromId: 'bot-3', game: 'poker' }).ok, false);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'game.invite', epoch: 1, fromId: 'bot-3', game: 'loto', url: 'https://x' }).ok, false);
});

test('chat.history: tối đa 100 tin, mỗi tin đúng trường', () => {
  const item = { participantId: 'p-1', displayName: 'An', text: 'Chào', sentAt: 1 };
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'chat.history', epoch: 1, messages: [item] }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'chat.history', epoch: 1, messages: Array(101).fill(item) }).ok, false);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'chat.history', epoch: 1, messages: [{ ...item, extra: 1 }] }).ok, false);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'chat.history', epoch: 1, messages: [{ ...item, text: 'x'.repeat(281) }] }).ok, false);
});

test('inbox.notify: chỉ báo loại thư, không mang nội dung', () => {
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'inbox.notify', epoch: 1, kind: 'invite' }).ok, true);
  assert.equal(parseServerMessage({ v: PROTOCOL_VERSION, type: 'inbox.notify', epoch: 1, kind: 'note', text: 'chào' }).ok, false);
});

test('memorial.grave: ô mộ trống hoặc có mộ hợp lệ; từ chối ô ngoài 1–36, tên rỗng, hạn trước lúc đắp, trường lạ', () => {
  const grave = { name: 'Ông Ba', builderName: 'An', builtAt: 10, expiresAt: 20 };
  const message = (graves) => parseServerMessage({ v: PROTOCOL_VERSION, type: 'memorial.grave', epoch: 1, graves });
  assert.equal(message([{ slot: 1, grave }, { slot: 36, grave: null }]).ok, true);
  assert.equal(message([{ slot: 37, grave: null }]).error, 'INVALID_MESSAGE');
  assert.equal(message([{ slot: 1, grave: { ...grave, name: '' } }]).error, 'INVALID_MESSAGE');
  assert.equal(message([{ slot: 1, grave: { ...grave, expiresAt: 10 } }]).error, 'INVALID_MESSAGE');
  assert.equal(message([{ slot: 1, grave: { ...grave, owner: 'a-1' } }]).error, 'INVALID_MESSAGE');
  assert.equal(message([]).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'travel.go', requestId: 'r1', destination: 'memorial' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'travel.go', requestId: 'r1', destination: 'park' }).ok, true);
  assert.equal(parseClientMessage({ v: PROTOCOL_VERSION, type: 'travel.go', requestId: 'r2', destination: 'flowers' }).ok, true);
});

test('oẳn tù tì cược: thao tác chỉ cho thành viên, mức cược cố định, trận chỉ lộ tay đối thủ qua last', () => {
  const base = { v: PROTOCOL_VERSION, requestId: 'r-1' };
  assert.equal(parseClientMessage({ ...base, type: 'rps.find', stake: 50 }, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage({ ...base, type: 'rps.find', stake: 50 }, { role: 'guest' }).error, 'FORBIDDEN');
  assert.equal(parseClientMessage({ ...base, type: 'rps.open', stake: 30 }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'rps.join', tableId: 'bc-not-rps' }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'rps.pick', matchId: 'rp-oantuti-1-1-1-abcd', choice: 'rock' }, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage({ ...base, type: 'rps.pick', matchId: 'rp-oantuti-1-1-1-abcd', choice: 'lizard' }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'rps.leave' }, { role: 'member' }).ok, true);
  const match = { v: PROTOCOL_VERSION, type: 'rps.match', epoch: 1, matchId: 'rp-oantuti-1-1-1-abcd', stake: 50, phase: 'pick', round: 1, prize: 95,
    opponent: { displayName: 'Bảo Ngọc', skin: 'woman' }, deadline: 10, picked: { me: false, opponent: true } };
  assert.equal(parseServerMessage(match).ok, true);
  assert.equal(parseServerMessage({ ...match, opponent: { displayName: 'Bảo Ngọc', bot: true } }).ok, false, 'trận không mang cờ bot');
  assert.equal(parseServerMessage({ ...match, phase: 'reveal', last: { mine: 'rock', opponent: null, result: 'win' } }).ok, true);
  assert.equal(parseServerMessage({ ...match, picked: { me: false, opponent: 'rock' } }).ok, false, 'picked không mang lựa chọn');
  const lobby = { v: PROTOCOL_VERSION, type: 'rps.lobby', epoch: 1, tables: [{ id: 'rp-oantuti-1-1-2-abcd', displayName: 'An', stake: 20 }], playing: 2,
    feed: [{ a: 'An', b: 'Bình', stake: 20, winner: 'b' }] };
  assert.equal(parseServerMessage(lobby).ok, true);
  assert.equal(parseServerMessage({ ...lobby, feed: [{ a: 'An', b: 'Bình', stake: 20, winner: 'an' }] }).ok, false);
});

test('tiến lên: chỉ thành viên chơi; bài là số 0–51 không trùng; bàn chỉ mang bài của mình và không mang cờ bot', () => {
  assert.deepEqual([...TIENLEN_STAKES], [...RULE_STAKES], 'mức cược khớp luật @chanh-dien/tien-len');
  assert.deepEqual([...TIENLEN_MODES], [...RULE_MODES]);
  assert.deepEqual([...TIENLEN_INSTANT_WINS], [...INSTANT_WINS]);
  const base = { v: PROTOCOL_VERSION, requestId: 'r-1' };
  const tableId = 'tl-tienlen-1-1-3-abcd';
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.find' }, { role: 'member' }).ok, true, 'vào nhanh không cần chọn mức');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.find', stake: 500, mode: 'count' }, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.find' }, { role: 'guest' }).error, 'FORBIDDEN');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.open', stake: 30, mode: 'rank' }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.open', stake: 50, mode: 'all' }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.join', tableId: 'rp-oantuti-1-1-1-abcd' }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.play', tableId, cards: [0, 4, 8] }, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.play', tableId, cards: [0, 0] }, { role: 'member' }).error, 'INVALID_MESSAGE', 'trùng lá');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.play', tableId, cards: [52] }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.play', tableId, cards: [] }, { role: 'member' }).error, 'INVALID_MESSAGE');
  assert.equal(parseClientMessage({ ...base, type: 'tienlen.pass', tableId }, { role: 'member' }).ok, true);
  const player = { displayName: 'Bảo Ngọc', cards: 13, skin: 'woman' };
  const table = { v: PROTOCOL_VERSION, type: 'tienlen.table', epoch: 1, tableId, stake: 50, mode: 'rank', phase: 'playing', game: 2, seat: 0,
    players: [{ displayName: 'An', cards: 12 }, player, null, { ...player, displayName: 'Chi', passed: true }], minCoins: 500,
    deadline: 10, turn: 1, top: { seat: 0, cards: [3] }, hand: [5, 9, 12], last: { seat: 0, action: 'play', cards: [3] }, coins: 900 };
  assert.equal(parseServerMessage(table).ok, true);
  assert.equal(parseServerMessage({ ...table, players: [{ displayName: 'An', cards: 12, bot: true }, null, null, null] }).ok, false, 'không mang cờ bot');
  assert.equal(parseServerMessage({ ...table, players: [null, null, null] }).ok, false, 'đủ 4 ghế');
  assert.equal(parseServerMessage({ ...table, hand: [5, 5] }).ok, false);
  const result = { ranks: [1, 2, null, 3], nets: [1_000, -500, null, -500], lines: [{ from: 3, to: 0, units: 2, coins: 100, reason: 'last' }], net: 950, cut: 50 };
  assert.equal(parseServerMessage({ ...table, phase: 'result', result }).ok, true);
  assert.equal(parseServerMessage({ ...table, phase: 'result', result: { ...result, lines: [{ from: 3, to: 3, units: 2, coins: 100, reason: 'last' }] } }).ok, false);
  assert.equal(parseServerMessage({ ...table, phase: 'result', result: { ...result, white: 'flush' } }).ok, false);
  assert.equal(parseServerMessage({ ...table, minCoins: undefined, deposit: 500 }).ok, false, 'không còn cọc');
  const lobby = { v: PROTOCOL_VERSION, type: 'tienlen.lobby', epoch: 1, playing: 1,
    tables: [{ id: tableId, stake: 100, mode: 'count', phase: 'waiting', players: [{ displayName: 'An' }, { displayName: 'Bình', skin: 'man' }] }] };
  assert.equal(parseServerMessage(lobby).ok, true);
  assert.equal(parseServerMessage({ ...lobby, tables: [{ ...lobby.tables[0], phase: 'closed' }] }).ok, false);
});

test('trốn tìm: xin chơi / rời / bắt; trạng thái không mang vị trí và vai hợp lệ', () => {
  const base = { v: PROTOCOL_VERSION, requestId: 'r-1' };
  assert.equal(parseClientMessage({ ...base, type: 'hideseek.join' }, { role: 'guest' }).ok, true, 'khách cũng chơi được');
  assert.equal(parseClientMessage({ ...base, type: 'hideseek.leave' }, { role: 'member' }).ok, true);
  assert.equal(parseClientMessage({ ...base, type: 'hideseek.catch', targetId: 'u-binh' }, { role: 'guest' }).ok, true);
  assert.equal(parseClientMessage({ ...base, type: 'hideseek.catch' }, { role: 'guest' }).error, 'INVALID_MESSAGE');
  const state = { v: PROTOCOL_VERSION, type: 'hideseek.state', epoch: 1, phase: 'seeking', round: 2, minPlayers: 2, endsAt: 100,
    lobby: [{ id: 'u-d', displayName: 'Dũng' }],
    players: [{ id: 'u-a', displayName: 'An', role: 'seeker', caught: false }, { id: 'u-b', displayName: 'Bình', role: 'hider', caught: true }],
    lastCatch: { seekerId: 'u-a', hiderId: 'u-b', at: 90 } };
  assert.equal(parseServerMessage(state).ok, true);
  assert.equal(parseServerMessage({ ...state, phase: 'playing' }).ok, false);
  assert.equal(parseServerMessage({ ...state, players: [{ id: 'u-a', displayName: 'An', role: 'seeker', caught: false, x: 1 }] }).ok, false, 'không mang vị trí');
  assert.equal(parseServerMessage({ ...state, winner: 'hiders', phase: 'result' }).ok, true);
});
