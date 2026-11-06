import { createSceneRenderer } from '/engine/renderer.mjs';
// Bộ vẽ 3D (Three.js) chỉ tải khi dùng chế độ 3D.
import { createRoomSession } from '/realtime-session.js';
import { parseThienRoomId, THIEN_EVENT, THIEN_LANGS, THIEN_RULES, thienRoomName, US_STATES } from '/shared/room-rules.mjs';
import { BELL_PERIOD_MS, createTempleAudio, MO_PERIOD_MS } from '/temple-audio.js';
import { createAccountUI } from '/account-ui.js';
import { createGemUI } from '/gem-ui.js';
import { loadShopCharacters } from '/shop-models.js';
import { avatarNode, levelBadge, levelName, nameWithBadge, rankBadge } from '/badges.js';
import { applyDom, guessLang, lang, locale, onLangChange, setLang, t } from '/thien-i18n.js';
import { createLecture } from '/lecture.js';
import { createExploreUI } from '/explore-ui.js';
import { createSettingsMenu } from '/settings-menu.js';
import { buildRecitation } from '/prayer-recite.js';
import { sutraById, sutraLines } from '/sutras.js';
import { createMala } from '/mala.js';
import { createPlayerSocial } from '/player-social.js';
import { createGardenUI } from '/garden-ui.js';
import { createCommunityProjectUI } from '/community-project-ui.js';
import { createZoneGuide } from '/zone-guide.js';
import { limitThienScene } from '/thien-scene.js';
import { createBootLoader, waitFor } from '/boot-loader.js';
import { renderChibiPortraits } from '/chibi-preview.js';
import { ageForBirthYear, starKeyForAge } from '/shared/prayer-slip.mjs';

const PARAMS = new URLSearchParams(location.search);
// URL chỉ mang mã mời được mã hóa; roomId thật được API giải mã và không xuất hiện trên thanh địa chỉ.
let currentInviteCode = PARAMS.get('invite') || null;
let URL_ROOM = null;
const TEST_EVENT_NOW = PARAMS.get('event') === 'now';
// Quay về từ map khác (rạp phim gửi ?go=…): vào thẳng bằng tên đã nhập, không hỏi lại, không chào lại.
const ARRIVED_FROM_MAP = ['hall', 'courtyard', 'garden'].includes(PARAMS.get('go'));
const OFFERINGS = THIEN_RULES.interaction.offerings;
// Câu hiển thị/đọc lên: "Diệu Hạnh dâng hương", "… thỉnh chuông" theo ngôn ngữ phòng (act.*).
const action = (kind) => t(`act.${kind}`);

const $ = (id) => document.getElementById(id);
const elements = {
  board: $('board'),
  boardEmpty: $('boardEmpty'),
  boardMe: $('boardMe'),
  boardPanel: $('boardPanel'),
  ledger: $('ledger'),
  ledgerClose: $('ledgerClose'),
  ledgerList: $('ledgerList'),
  chatForm: $('chatForm'),
  chatInput: $('chatInput'),
  controls: $('controls'),
  count: $('count'),
  dharma: $('dharma'),
  feed: $('feed'),
  gate: $('gate'),
  gateError: $('gateError'),
  sceneLoading: $('sceneLoading'),
  gateForm: $('gateForm'),
  stateSelect: $('stateSelect'),
  langSelect: $('langSelect'),
  eventInfo: $('eventInfo'),
  openRooms: $('openRooms'),
  roomBar: $('roomBar'),
  roomName: $('roomName'),
  copyRoom: $('copyRoom'),
  shareDialog: $('shareDialog'),
  shareClose: $('shareClose'),
  shareCopy: $('shareCopy'),
  shareLink: $('shareLink'),
  guestName: $('guestName'),
  leave: $('leave'),
  mute: $('mute'),
  nextTrack: $('nextTrack'),
  nowPlaying: $('nowPlaying'),
  offerings: $('offerings'),
  presence: $('presence'),
  prayerAdd: $('prayerAdd'),
  prayerClose: $('prayerClose'),
  prayerDialog: $('prayerDialog'),
  prayerError: $('prayerError'),
  prayerForm: $('prayerForm'),
  prayerIntro: $('prayerIntro'),
  prayerNote: $('prayerNote'),
  prayerOpen: $('prayerOpen'),
  prayerPeople: $('prayerPeople'),
  prayerRequester: $('prayerRequester'),
  prayerSubmit: $('prayerSubmit'),
  prayerTabs: $('prayerTabs'),
  scene: $('scene'),
  scene3d: $('scene3d'),
  viewMode: $('viewMode'),
  viewReset: $('viewReset'),
  hint3d: $('hint3d'),
  stage: $('stage'),
  topBar: document.querySelector('.hud.top'),
  skins: $('skins'),
  statusText: $('statusText'),
  toast: $('toast'),
  tools: $('tools'),
  voiceInfo: $('voiceInfo'),
};

let renderer = null;
let participants = new Map();
// Phòng đông: room.state chỉ có người máy này thấy; số người cả phòng và bảng công đức đến qua room.count.
let roomCount = null;
// Tương thích tiến trình realtime cũ: API vẫn biết số người thật của từng shard qua /internal/rooms.
let fallbackRoomTotal = null;
let countPollTimer = null;
let countPollBusy = false;
// Nhân vật chọn Nam/Nữ, hoặc hình cao cấp đã mua/được tặng (chibigirl, swordsman và nhân vật admin tải lên
// "shop-…"; server kiểm tra quyền sở hữu). Người đã chọn hình cũ được quy về nữ/nam.
const isShopSkin = (skin) => ['chibigirl', 'swordsman'].includes(skin) || /^shop-[a-z0-9-]{2,30}$/.test(skin || '');
let mySkin = (() => {
  let saved = null;
  try { saved = localStorage.getItem('thien-skin'); } catch {}
  if (isShopSkin(saved)) return saved;
  return ['woman', 'nun', 'granny'].includes(saved) ? 'woman' : 'man';
})();
// Hình thay thế khi ảnh 2D chưa có sprite riêng. Bot mới vẫn khác nhau ở 2D (hình sư thầy/sư cô), còn 3D dùng
// đúng áo xanh/hồng của pilgrim/lotusgirl. Hình Shop lấy base do danh mục API trả về.
const shopBase = new Map([['chibigirl', 'woman'], ['swordsman', 'man'], ['pilgrim', 'monk'], ['lotusgirl', 'nun']]);
const baseSkin = (skin) => shopBase.get(skin) || (isShopSkin(skin) ? 'man' : skin);
const spriteSkin = baseSkin;
let seatAttempts = 0;
const seenOfferings = new Set();
let lastBellAt = 0;

let statusKey = 'hud.notIn';
const session = createRoomSession({
  roomId: 'thien-1',
  onMessage: handleMessage,
  onStatus: (state, label, key) => {
    elements.presence.className = `chip ${state}`;
    statusKey = key;
    elements.statusText.textContent = key ? t(key) : label;
  },
});

// Chế độ nhập vai (3D): nhân vật đi lại, cần điều khiển ảo, quỳ/lạy; 2D giữ cách ngồi bồ đoàn như cũ.
// Nút "📿 Tràng hạt" trên thanh động tác mở bảng lần chuỗi hạt.
const malaButton = document.createElement('button');
malaButton.type = 'button';
malaButton.className = 'chip';
const labelMala = () => { malaButton.textContent = `📿 ${t('emote.mala')}`; };
labelMala();
onLangChange(labelMala);
// Viết sớ cũng chuyển vào menu ▾ của thanh động tác (giữ nguyên nút và sự kiện).
const zoneGuide = createZoneGuide({ stage: elements.stage });
const explore = createExploreUI({
  stage: elements.stage, session, showToast, extraButtons: [malaButton, $('prayerOpen')], onWalkerTap: (id) => social?.open(id),
  onGardenTap: (target) => garden?.onTap(target), gardenLabel: (plot) => garden?.labelFor(plot) || '',
  onGuideTap: (place) => zoneGuide.open(place),
  onMeritBoardTap: openMeritLedger,
  onPlaceChange: (place) => setCurrentPlace(place), travelHost: elements.roomBar,
  exits: [{ id: 'cinema', icon: '🎬', go: goToCinema }, { id: 'games', icon: '🎲', go: goToGames }],
});
// Quay về từ map khác (rạp phim gửi ?go=courtyard…): vào phòng xong thì tới thẳng khu đã chọn.
explore.arriveAt(PARAMS.get('go'));

// Sang phòng game (trang riêng, chơi một mình bằng tiền ảo). Nhớ link phòng chùa để nút Đi nhanh quay về đúng phòng.
// game: phòng bot mời sang (game.invite); không có thì vào Bầu Cua như nút 🎲.
const GAME_PAGES = { 'bau-cua': '/game.html', 'tai-xiu': '/tai-xiu.html', loto: '/loto.html' };
function goToGames(game) {
  try { sessionStorage.setItem('thien-return', `${location.pathname}${location.search}`); } catch {}
  location.href = GAME_PAGES[game] || '/game.html';
}

// Sang map rạp phim (phòng cinema-1, trang riêng). Nhớ link phòng chùa đang ở để rạp có nút quay về đúng phòng.
function goToCinema() {
  try {
    sessionStorage.setItem('thien-return', `${location.pathname}${location.search}`);
    // Tên dùng chung với rạp (cả tài khoản Google): sang rạp không phải nhập lại.
    if (session.displayName) localStorage.setItem('displayName', session.displayName);
  } catch {}
  location.href = '/room.html?room=cinema-1&from=thien';
}
// Vườn Công Đức (luống trồng chung, xu ảo). Tạo sau khi có tài khoản (bên dưới).
let garden = null;
let communityProject = null;
// Bấm vào người khác: thẻ thông tin, kết bạn, khiêu chiến kéo búa bao. Tạo sau khi có âm thanh (bên dưới).
let social = null;

let voiceName = null;
let mala = null;
malaButton.addEventListener('click', () => mala?.open(true));
const touchDevice = matchMedia('(pointer: coarse)').matches;
const audio = createTempleAudio({
  serverNow: session.serverNow,
  // Điện thoại: đang đọc thì cảnh 3D vẽ chậm lại một chút cho giọng đọc mượt.
  onSpeaking: (on) => { if (touchDevice) renderer?.setLowPower?.(on); },
  onTrack: (name) => { elements.nowPlaying.textContent = name; },
  onVoice: (name) => {
    voiceName = name;
    elements.voiceInfo.textContent = name ? t('voice.name', { name }) : t('voice.default');
  },
});

// ---- Tiểu bang, ngôn ngữ, bài giảng ----
const stateOf = (code) => US_STATES.find((state) => state.code === code);
function guessState() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return US_STATES.find((state) => state.timeZone === zone)?.code || 'ca';
}
const remembered = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
let urlInfo = null;
let selectedState = urlInfo?.state || (stateOf(remembered('thien-state')) ? remembered('thien-state') : guessState());
let selectedLang = urlInfo?.lang || (THIEN_LANGS[remembered('thien-lang')] ? remembered('thien-lang') : guessLang());
let eventConfig = THIEN_EVENT;

const lecture = createLecture({
  elements: { chip: $('eventChip'), card: $('lecture'), player: $('lecturePlayer'), title: $('lectureTitle'), note: $('lectureNote'), close: $('lectureClose') },
  serverNow: session.serverNow,
  t,
  locale,
  onActive: (on) => {
    audio.setLecture(on);
    renderer?.setCeremonyActive?.(!on);
    elements.stage.classList.toggle('has-lecture', on);
  },
  onStart: (title) => showToast(t('event.started', { title })),
});

let currentPlace = null;
function setCurrentPlace(place) {
  currentPlace = place;
  if (!place) return;
  const inHall = place === 'hall';
  elements.stage.classList.toggle('in-hall', inHall);
  lecture.setVisible(inHall);
  if (!inHall) elements.ledger.hidden = true;
  // Bộ vẽ có thể báo vị trí ngay khi còn ở màn tải/cổng vào; chỉ mở hướng dẫn sau khi đã thật sự vào phòng.
  if (session.participantId && elements.gate.hidden) zoneGuide.enter(place);
  requestAnimationFrame(updateInsets);
}

function ceremonySettings() {
  return {
    labels: {
      teacher: t('ceremony.teacher'),
      bell: t('ceremony.bell'),
      woodenFish: t('ceremony.woodenFish'),
    },
    serverNow: session.serverNow,
    moPeriodMs: MO_PERIOD_MS,
    bellPeriodMs: BELL_PERIOD_MS,
  };
}

// ---- Sớ Cầu an / Cầu siêu ----
let prayerType = 'peace';
const prayerYear = new Date(session.serverNow()).getFullYear();
const starName = (age, gender) => t(`star.${starKeyForAge(age, gender)}`);

function prayerPersonValue(card) {
  return {
    name: card.querySelector('[data-prayer-name]').value.trim(),
    dharmaName: card.querySelector('[data-prayer-dharma]').value.trim(),
    gender: card.querySelector('[data-prayer-gender]').value,
    birthYear: Number(card.querySelector('[data-prayer-birth-year]').value),
  };
}

function updatePrayerPerson(card) {
  const value = prayerPersonValue(card);
  const age = ageForBirthYear(value.birthYear, prayerYear);
  const ageLabel = card.querySelector('[data-age-label]');
  ageLabel.textContent = t('prayer.birthYear');
  const gender = value.gender === 'male' ? t('prayer.male') : t('prayer.female');
  card.querySelector('[data-prayer-star]').textContent = prayerType === 'peace'
    ? t('prayer.starInfo', { year: prayerYear, age, gender, star: starName(age, value.gender) })
    : t('prayer.memorialInfo', { year: prayerYear, age });
}

function renumberPrayerPeople() {
  const cards = [...elements.prayerPeople.children];
  cards.forEach((card, index) => {
    card.dataset.number = index + 1;
    card.querySelector('[data-prayer-remove]').hidden = cards.length === 1;
  });
  elements.prayerAdd.disabled = cards.length >= 10;
}

function addPrayerPerson(value = {}) {
  if (elements.prayerPeople.children.length >= 10) return;
  const card = document.createElement('section');
  card.className = 'prayer-person';
  card.innerHTML = `
    <button type="button" class="prayer-remove" data-prayer-remove data-i18n-aria="prayer.remove" aria-label="Xóa người này">✕</button>
    <label class="prayer-field full"><span data-i18n="prayer.personName">Họ và tên</span><input data-prayer-name maxlength="80" required></label>
    <label class="prayer-field"><span data-i18n="prayer.dharmaName">Pháp danh (nếu có)</span><input data-prayer-dharma maxlength="80"></label>
    <label class="prayer-field"><span data-i18n="prayer.gender">Giới tính</span><select data-prayer-gender><option value="male"></option><option value="female"></option></select></label>
    <label class="prayer-field full"><span data-age-label></span><select data-prayer-birth-year></select></label>
    <p class="prayer-star" data-prayer-star></p>`;
  applyDom(card);
  const birthYear = card.querySelector('[data-prayer-birth-year]');
  birthYear.replaceChildren(...Array.from({ length: 100 }, (_, index) => {
    const year = prayerYear - index;
    return new Option(String(year), String(year));
  }));
  card.querySelector('[data-prayer-name]').value = value.name || '';
  card.querySelector('[data-prayer-dharma]').value = value.dharmaName || '';
  card.querySelector('[data-prayer-gender]').value = value.gender || 'male';
  birthYear.value = String(value.birthYear || prayerYear - 29);
  card.querySelector('[data-prayer-gender] option[value="male"]').textContent = t('prayer.male');
  card.querySelector('[data-prayer-gender] option[value="female"]').textContent = t('prayer.female');
  card.addEventListener('input', () => updatePrayerPerson(card));
  card.addEventListener('change', () => updatePrayerPerson(card));
  card.querySelector('[data-prayer-remove]').addEventListener('click', () => {
    card.remove();
    renumberPrayerPeople();
  });
  elements.prayerPeople.append(card);
  updatePrayerPerson(card);
  renumberPrayerPeople();
}

function renderStarTable() {
  $('starYearNote').textContent = t('prayer.starYearNote', { year: prayerYear });
  $('starTableBody').replaceChildren(...Array.from({ length: 100 }, (_, index) => {
    const age = index + 1;
    const row = document.createElement('tr');
    for (const text of [t('prayer.ageOption', { age }), starName(age, 'male'), starName(age, 'female')]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    return row;
  }));
}

function refreshPrayerUi() {
  elements.prayerIntro.textContent = t(prayerType === 'peace' ? 'prayer.introPeace' : 'prayer.introMemorial');
  elements.prayerRequester.textContent = session.displayName || t('name.fallback');
  for (const button of elements.prayerTabs.querySelectorAll('button')) button.setAttribute('aria-selected', String(button.dataset.prayerType === prayerType));
  for (const card of elements.prayerPeople.children) {
    const gender = card.querySelector('[data-prayer-gender]');
    gender.options[0].textContent = t('prayer.male');
    gender.options[1].textContent = t('prayer.female');
    updatePrayerPerson(card);
  }
  renderStarTable();
}

function openPrayerDialog() {
  if (!elements.prayerPeople.children.length) addPrayerPerson({ name: session.displayName || '' });
  elements.prayerError.textContent = '';
  refreshPrayerUi();
  elements.prayerDialog.hidden = false;
  elements.prayerPeople.querySelector('input')?.focus();
}

function closePrayerDialog() {
  elements.prayerDialog.hidden = true;
}

async function refreshEventConfig() {
  try {
    const response = await fetch('/api/v1/thien/event-config');
    if (!response.ok) return;
    const next = await response.json();
    if (!Number.isInteger(next.hour) || !Number.isInteger(next.minute) || !next.lectures) return;
    eventConfig = next;
    if (URL_ROOM) lecture.setRoom(lectureFor(URL_ROOM), { testNow: TEST_EVENT_NOW });
    if (!elements.gate.hidden) updateGateInfo();
  } catch {}
}

function lectureFor(roomId) {
  const info = parseThienRoomId(roomId);
  if (!info) return null;
  const state = stateOf(info.state);
  const talk = eventConfig.lectures[info.lang];
  return { timeZone: state.timeZone, stateName: state.name, lang: info.lang, hour: eventConfig.hour, minute: eventConfig.minute, videoId: talk.videoId, title: talk.title };
}

function fillSelects() {
  elements.stateSelect.replaceChildren(...US_STATES.map((state) => new Option(state.name, state.code, false, state.code === selectedState)));
  elements.langSelect.replaceChildren(...Object.entries(THIEN_LANGS).map(([code, item]) => new Option(item.label, code, false, code === selectedLang)));
}

function eventTime() {
  const start = new Date(Date.UTC(2024, 0, 1, eventConfig.hour, eventConfig.minute));
  return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }).format(start);
}

// Cổng vào: giờ bài giảng theo tiểu bang đang chọn và các phòng đang mở của (tiểu bang, ngôn ngữ).
async function updateGateInfo() {
  const state = stateOf(selectedState);
  const now = new Intl.DateTimeFormat(locale(), { timeZone: state.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date());
  elements.eventInfo.textContent = `${t('gate.event', { time: eventTime(), state: state.name })} · ${t('event.clock', { time: now, state: state.name })}`;
  const asked = `${selectedState}-${selectedLang}`;
  try {
    const response = await fetch(`/api/v1/thien/rooms?state=${selectedState}&lang=${selectedLang}`);
    const { rooms } = await response.json();
    if (asked !== `${selectedState}-${selectedLang}`) return;
    elements.openRooms.hidden = !rooms?.length;
    elements.openRooms.textContent = rooms?.length ? t('gate.rooms', { rooms: rooms.map((room) => `${room.name.split(' · ')[1]} ${room.count}/${room.capacity ?? room.seats}`).join(' · ') }) : '';
  } catch {
    elements.openRooms.hidden = true;
  }
}

async function refreshRoomTotal() {
  if (!URL_ROOM || !urlInfo || countPollBusy) return;
  countPollBusy = true;
  try {
    const response = await fetch(`/api/v1/thien/rooms?state=${urlInfo.state}&lang=${urlInfo.lang}`, { cache: 'no-store' });
    if (!response.ok) return;
    const { rooms } = await response.json();
    const current = rooms?.find((room) => room.roomId === URL_ROOM);
    fallbackRoomTotal = current?.count ?? 0;
    // room.count mới có cả bot và bảng hạng nên luôn ưu tiên; poll chỉ sửa con số khi server cũ không gửi type này.
    if (!roomCount) renderBoard();
  } catch {} finally {
    countPollBusy = false;
  }
}

function startRoomCountPolling() {
  clearInterval(countPollTimer);
  fallbackRoomTotal = null;
  refreshRoomTotal();
  countPollTimer = setInterval(() => { if (!document.hidden) refreshRoomTotal(); }, 3_000);
}

function stopRoomCountPolling() {
  clearInterval(countPollTimer);
  countPollTimer = null;
  countPollBusy = false;
  fallbackRoomTotal = null;
}

elements.stateSelect.addEventListener('change', () => {
  selectedState = elements.stateSelect.value;
  try { localStorage.setItem('thien-state', selectedState); } catch {}
  updateGateInfo();
});
elements.langSelect.addEventListener('change', () => {
  selectedLang = elements.langSelect.value;
  try { localStorage.setItem('thien-lang', selectedLang); } catch {}
  setLang(selectedLang);
});

// Đổi ngôn ngữ: chữ tĩnh đã đổi trong applyDom; vẽ lại phần chữ sinh động.
onLangChange(() => {
  elements.statusText.textContent = t(statusKey);
  elements.voiceInfo.textContent = voiceName ? t('voice.name', { name: voiceName }) : t('voice.default');
  elements.viewMode.title = viewMode === '3d' ? t('view.to2d') : t('view.to3d');
  audio.setLang(THIEN_LANGS[lang()].tts);
  renderer?.setCeremony?.(ceremonySettings());
  renderBoard();
  updateGateInfo();
  lecture.refresh();
  if (!elements.prayerDialog.hidden) refreshPrayerUi();
});

// Link mời luôn trỏ tới đúng phòng đã chia sẻ. Người vào từ sảnh mới qua API xếp vào shard còn chỗ.
async function chooseRoom() {
  if (URL_ROOM && currentInviteCode && urlInfo?.state === selectedState && urlInfo?.lang === selectedLang) {
    return { roomId: URL_ROOM, inviteCode: currentInviteCode };
  }
  const response = await fetch('/api/v1/thien/assign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: selectedState, lang: selectedLang }),
  });
  if (!response.ok) throw new Error(t('toast.joinFailed'));
  return response.json();
}

function enterRoom({ roomId, inviteCode }) {
  explore.previewSpawn();
  if (session.roomId !== roomId) session.setRoom(roomId, inviteCode);
  URL_ROOM = roomId;
  currentInviteCode = inviteCode;
  urlInfo = parseThienRoomId(roomId);
  history.replaceState(null, '', `?invite=${encodeURIComponent(inviteCode)}${TEST_EVENT_NOW ? '&event=now' : ''}`);
  elements.roomName.textContent = thienRoomName(roomId) || '';
  elements.roomBar.hidden = false;
  lecture.setRoom(lectureFor(roomId), { testNow: TEST_EVENT_NOW });
  startRoomCountPolling();
}

// Đăng nhập thì vào phòng bằng tên tài khoản và công đức được lưu; đang ở trong phòng thì vào lại với vé mới.
const accountUI = createAccountUI({ onChange: accountChanged, showToast });

function showGuestName(account) {
  elements.guestName.hidden = Boolean(account);
  elements.dharma.required = !account;
}

function accountChanged(account) {
  showGuestName(account);
  // Đăng nhập ngay ở cổng: hỏi lại hình đã mua để hiện ô "Bé Mũ Đỏ" mà không phải tải lại trang.
  refreshOwnedSkins();
  garden?.accountChanged();
  communityProject?.accountChanged();
  if (!session.participantId) return;
  const name = account?.displayName || elements.dharma.value.trim() || session.displayName;
  // Đổi tài khoản là vào lại phòng: giữ nhân vật ở chỗ đang đứng (vd: trước quầy hạt giống).
  explore.keepPosition();
  session.leave();
  participants = new Map();
  roomCount = null;
  social?.reset();
  session.join(name).then(() => {
    showToast(account ? t('toast.memberNow', { name }) : t('toast.guestNow'));
  }).catch((error) => showToast(error?.serverMessage || t('toast.joinFailed')));
}

const me = () => participants.get(session.participantId);
const nameOf = (id, sentName) => participants.get(id)?.displayName || sentName || t('name.fallback');
// Huy hiệu cạnh tên kiểu TikTok LIVE: hạng TOP 1/2/3 theo công đức trong phòng, cấp công đức của tài khoản, ảnh đại diện.
const rankedByMerit = () => roomCount?.top || [...participants.values()].filter((person) => person.merit > 0).sort((a, b) => b.merit - a.merit);
let roomRanks = new Map();
function badgesOf(id) {
  const person = participants.get(id);
  return {
    level: person?.level, rank: roomRanks.get(id), avatarUrl: person?.avatarUrl,
    title: person?.title, frame: person?.frame, displayName: person?.displayName,
  };
}

// ---- Cảnh ----
function sceneParticipants() {
  return [...participants.values()].filter((person) => person.seatId).map((person) => ({
    id: person.id,
    name: person.displayName,
    seatId: person.seatId,
    skin: `c_${viewMode === '3d' ? person.skin || 'man' : spriteSkin(person.skin || 'man')}`,
    me: person.id === session.participantId,
  }));
}

// Chế độ xem: 3D (mặc định khi máy hỗ trợ WebGL) hoặc 2D (tranh vẽ, nhẹ hơn). Nhớ lựa chọn trên máy.
let sceneData = null;
let viewMode = null;
let capacityNeeds3D = false;

function supportsWebGL() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'));
  } catch {
    return false;
  }
}

// Cảnh 3D tải tượng (vài MB) sau khi hiện: báo tiến độ ở cổng vào để biết vì sao lúc đầu có thể hơi giật.
let sceneLoadingTimer = null;
function watchSceneLoading(current) {
  clearInterval(sceneLoadingTimer);
  const tick = () => {
    const progress = current === renderer ? current.loadProgress?.() : null;
    const done = !progress || !progress.total || progress.done >= progress.total;
    elements.sceneLoading.hidden = done;
    if (done) clearInterval(sceneLoadingTimer);
    else elements.sceneLoading.textContent = t('gate.loading', { n: Math.round((progress.done / progress.total) * 100) });
  };
  sceneLoadingTimer = setInterval(tick, 400);
  tick();
}

async function setupScene() {
  const sourceScene = await (await fetch('/scenes/thien-default/scene.json')).json();
  capacityNeeds3D = THIEN_RULES.seats < sourceScene.seats.length && supportsWebGL();
  sceneData = limitThienScene(sourceScene, THIEN_RULES.seats);
  let preferred = null;
  try { preferred = localStorage.getItem('thien-view'); } catch {}
  // Ảnh nền 2D cũ đã vẽ sẵn 16 bồ đoàn. Khi cấu hình ít hơn, dùng 3D để số bồ đoàn nhìn thấy đúng tuyệt đối.
  await setViewMode(capacityNeeds3D ? '3d' : (preferred === '2d' || !supportsWebGL() || !sceneData.world ? '2d' : '3d'));
  new ResizeObserver(updateInsets).observe(elements.stage);
  new ResizeObserver(updateInsets).observe(elements.controls);
}

async function setViewMode(mode) {
  if (mode === viewMode) return;
  explore.detach();
  renderer?.destroy();
  renderer = null;
  viewMode = mode;
  elements.scene.hidden = mode !== '2d';
  elements.scene3d.hidden = mode !== '3d';
  elements.viewMode.textContent = mode === '3d' ? '2D' : '3D';
  elements.viewMode.title = mode === '3d' ? t('view.to2d') : t('view.to3d');
  elements.viewMode.hidden = capacityNeeds3D || !supportsWebGL() || !sceneData.world;
  elements.viewReset.hidden = mode !== '3d';
  try { localStorage.setItem('thien-view', mode); } catch {}
  if (mode === '3d') {
    try {
      const { createTempleRenderer3D } = await import('/engine/renderer3d.mjs');
      // Mọi người (ngồi bồ đoàn, hành lễ, đi lại) là chú tiểu kiểu chibi.
      const { createChibiPersonFactory } = await import('/engine/chibi3d.mjs');
      // Hình mua trong shop (chibigirl) dùng mô hình .glb: tải xong mới dựng người, lỗi thì tự dùng hình khối.
      await loadShopCharacters();
      renderer = await createTempleRenderer3D({ canvas: elements.scene3d, scene: sceneData, onSeatClick: moveTo, plugin: explore.plugin, personFactory: createChibiPersonFactory });
      explore.attach(renderer);
      if (explore.active) elements.hint3d.textContent = t('explore.hint');
      showHint();
      watchSceneLoading(renderer);
    } catch {
      showToast(t('view.no3d'));
      viewMode = null;
      await setViewMode('2d');
      return;
    }
  } else {
    renderer = await createSceneRenderer({ canvas: elements.scene, scene: sceneData, baseUrl: '/scenes/thien-default/', onSeatClick: moveTo });
    setCurrentPlace('hall');
  }
  renderer.setParticipants(sceneParticipants());
  for (const project of communityProject?.states?.() || []) renderer.setCommunityProject?.(project);
  renderer.setCeremony?.(ceremonySettings());
  renderer.setCeremonyActive?.(!lecture.active);
  updateInsets();
}

function showHint() {
  elements.hint3d.hidden = false;
  elements.hint3d.classList.remove('fade');
  setTimeout(() => elements.hint3d.classList.add('fade'), 3_500);
  setTimeout(() => { elements.hint3d.hidden = true; }, 4_400);
}

// Cảnh nằm giữa thanh trên và dải nút dưới để không nút nào đè lên bồ đoàn (màn dài thì dùng luôn phần trống).
function updateInsets() {
  if (!renderer) return;
  const stage = elements.stage.getBoundingClientRect();
  const top = elements.topBar.getBoundingClientRect().bottom - stage.top + 4;
  const bottom = elements.controls.hidden ? 0 : stage.bottom - elements.controls.getBoundingClientRect().top + 4;
  renderer.setInsets({ top, bottom });
}

function moveTo(seat) {
  if (!session.online) return;
  const owner = [...participants.values()].find((person) => person.seatId === seat.id);
  if (owner && owner.id !== session.participantId) {
    // Bồ đoàn có người: chạm vào là xem thông tin người đó.
    if (social) social.open(owner.id);
    else showToast(t('toast.seatTaken', { name: owner.displayName }));
    return;
  }
  const sit = () => session.send({ type: 'seat.select', requestId: `seat-${crypto.randomUUID()}`, seatId: seat.id });
  // Nhập vai: đi bộ tới bồ đoàn rồi mới ngồi.
  if (explore.active) explore.sitAt(seat, sit);
  else sit();
}

// Mới vào thì tự ngồi bồ đoàn trống gần bàn thờ, gần lối giữa trước (hàng sát camera bị dải nút che);
// chạm bồ đoàn khác để đổi chỗ.
function templeSeatOrder(seats) {
  return [...seats].sort((a, b) => (a.y - b.y) || (Math.abs(a.x - 540) - Math.abs(b.x - 540)));
}

function takeSeatIfNeeded() {
  // Nhập vai: vào phòng là đứng ở cửa chánh điện, tự đi tới bồ đoàn; không tự xếp chỗ.
  if (explore.active) return;
  if (!renderer || !session.online || me()?.seatId || seatAttempts >= 3) return;
  const taken = new Set([...participants.values()].map((person) => person.seatId).filter(Boolean));
  const free = templeSeatOrder(renderer.scene.seats).find((seat) => !taken.has(seat.id));
  if (!free) {
    if (seatAttempts === 0) showToast(t('toast.full'));
    seatAttempts = 3;
    return;
  }
  seatAttempts += 1;
  session.send({ type: 'seat.select', requestId: `seat-${crypto.randomUUID()}`, seatId: free.id });
}

// ---- Bảng công đức, tin nhắn ----
function meritRow(person, index) {
  const item = document.createElement('li');
  if (person.id === session.participantId) item.className = 'me';
  const rank = document.createElement('i');
  rank.append(rankBadge(index + 1, { compact: true }) || document.createTextNode(String(index + 1)));
  const name = nameWithBadge(nameOf(person.id, person.displayName), { level: person.level, title: person.title }, 'span');
  const merit = document.createElement('b');
  merit.textContent = person.merit;
  item.append(rank, avatarNode(person, 'avatar small'), name, merit);
  return item;
}

// Bảng nhỏ: 5 người đứng đầu + hạng của mình; bấm vào mở sổ công đức đầy đủ.
function renderBoard() {
  const ranked = rankedByMerit();
  elements.board.replaceChildren(...ranked.slice(0, 5).map(meritRow));
  elements.boardEmpty.hidden = ranked.length > 0;
  const myRank = roomCount ? (roomCount.rank || 0) - 1 : ranked.findIndex((person) => person.id === session.participantId);
  elements.boardMe.hidden = !me();
  elements.boardMe.textContent = myRank >= 0 && me()?.merit > 0
    ? t('board.me', { rank: myRank + 1, merit: me().merit })
    : t('board.meNone');
  if (!elements.ledger.hidden) renderLedger(ranked);
  // Số "phật tử": cả phòng, có tính bot và ghi rõ số bot (room.count). Server cũ không gửi room.count thì lấy
  // số người thật của shard từ API; trong lúc API chưa trả lời không bao giờ hiển thấp hơn danh sách đang thấy.
  if (roomCount) {
    elements.count.textContent = String(roomCount.total);
    elements.presence.title = '';
  } else {
    const visible = [...participants.values()].filter((person) => !person.bot && person.connected !== false).length;
    elements.count.textContent = String(Math.max(fallbackRoomTotal || 0, visible));
    elements.presence.title = '';
  }
}

function renderLedger(ranked = rankedByMerit()) {
  if (!ranked.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = t('ledger.empty');
    elements.ledgerList.replaceChildren(empty);
    return;
  }
  elements.ledgerList.replaceChildren(...ranked.map(meritRow));
}

function say(name, text, gift = false, badges = {}) {
  const item = document.createElement('p');
  item.className = `msg${gift ? ' gift' : ''}`;
  const body = document.createElement('span');
  body.append(nameWithBadge(name, badges), document.createTextNode(` ${text}`));
  item.append(avatarNode({ displayName: name, avatarUrl: badges.avatarUrl, frame: badges.frame }, 'avatar small'), body);
  elements.feed.append(item);
  // Tối đa 3 tin, mỗi tin mờ dần sau 7 giây: khung tin luôn nằm gọn trên vùng tường, không che bồ đoàn.
  while (elements.feed.children.length > 3) elements.feed.firstElementChild.remove();
  setTimeout(() => {
    item.classList.add('fade');
    setTimeout(() => item.remove(), 700);
  }, 7_000);
}

let toastTimer = null;
function showToast(text, badges = {}) {
  const marks = [rankBadge(badges.rank), levelBadge(badges.level)].filter(Boolean);
  if (marks.length) elements.toast.replaceChildren(...marks, document.createTextNode(` ${text}`));
  else elements.toast.textContent = text;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 3_800);
}

// ---- Message từ server ----
function handleMessage(message) {
  if (social?.onMessage(message)) return;
  if (garden?.onMessage(message)) return;
  if (communityProject?.onMessage(message)) return;
  if (message.type === 'welcome') {
    // Kết nối mới thật sự: lệnh đổi hình gửi trước đó có thể đã rơi vào socket cũ — cho gửi lại ngay ở room.state.
    skinSentAt = 0;
    seatAttempts = 0;
    for (const button of elements.offerings.querySelectorAll('button')) button.disabled = false;
  } else if (message.type === 'room.state') {
    const firstState = !participants.has(session.participantId);
    const previous = participants;
    participants = new Map(message.participants.map((person) => [person.id, person]));
    if (!roomCount) roomRanks = new Map(rankedByMerit().slice(0, 3).map((person, index) => [person.id, index + 1]));
    // Lên cấp công đức: báo cho cả phòng như TikTok báo lên cấp.
    for (const person of participants.values()) {
      const before = previous.get(person.id)?.level;
      if (before && person.level > before) {
        say(person.displayName, t('feed.levelUp', { n: person.level, level: levelName(person.level) }), true, badgesOf(person.id));
        if (person.id === session.participantId) showToast(t('toast.levelUp', { level: levelName(person.level) }), badgesOf(person.id));
      }
    }
    renderer?.setParticipants(sceneParticipants());
    explore.onState(message.participants);
    if (followFriendId && walkToFriend(followFriendId)) followFriendId = null;
    // Đứng dậy đi (server bỏ động tác) thì thôi tụng.
    if (!['chant', 'woodfish'].includes(me()?.emote)) audio.stopChant();
    renderBoard();
    // Vào phòng, hoặc vừa đổi hình (vd: quay lại từ Shop): báo server hình đang chọn; chỉ thôi khi server xác nhận
    // (lệnh gửi lúc trang vừa khôi phục có thể rơi vào socket cũ đã chết), gửi lại tối đa mỗi 1,5 giây.
    if ((firstState || skinDirty) && me()) {
      if (me().skin === mySkin) skinDirty = false;
      else if (firstState || Date.now() - skinSentAt > 1_500) {
        skinSentAt = Date.now();
        skinDirty = true;
        session.send({ type: 'avatar.set', requestId: `skin-${crypto.randomUUID()}`, skin: mySkin });
      }
    }
    takeSeatIfNeeded();
  } else if (message.type === 'room.count') {
    roomCount = message;
    roomRanks = new Map(message.top.slice(0, 3).map((person, index) => [person.id, index + 1]));
    renderBoard();
  } else if (message.type === 'offering') {
    if (seenOfferings.has(message.offeringId)) return;
    seenOfferings.add(message.offeringId);
    // Lời nguyện kèm lễ của người mình đã chặn thì không hiện (lễ vẫn hiện).
    if (message.text && social?.isBlocked(message.participantId)) message = { ...message, text: undefined };
    const act = action(message.kind);
    const big = message.kind === 'bell';
    const mine = message.participantId === session.participantId;
    const name = nameOf(message.participantId, message.displayName);
    renderer?.offer(message.participantId, message.kind, { big });
    const badges = badgesOf(message.participantId);
    say(name, `${act}${message.text ? ` · "${message.text}"` : ''}`, true, badges);
    showToast(`${name} ${act}${message.text ? ` — ${message.text}` : ''}`, badges);
    // Chuông lớn của người khác: tối đa một tiếng mỗi 1,5 giây để nhiều người thỉnh liên tiếp không chồng tiếng.
    if (mine) audio.offering(message.kind, big);
    else if (big && Date.now() - lastBellAt > 1_500) {
      lastBellAt = Date.now();
      audio.offering(message.kind, big);
    }
    // Lễ của mình đã đọc lúc bấm; chỉ đọc lời dâng lễ của người khác.
    const spokenOwn = mine && spokenOwnOfferings.length && Date.now() - spokenOwnOfferings[0] < 10_000;
    if (spokenOwn) spokenOwnOfferings.shift();
    else if (mine || big) audio.speak(`${t('say.offer', { name, action: act })} ${message.text || ''}`, true);
    // Lễ của người khác: đọc ngắn (không đọc lời nguyện) và thưa, tối đa một câu mỗi 5 giây, để giọng đọc không
    // chạy liên tục làm máy giật.
    else if (Date.now() - lastOtherSpokenAt > 5_000 && audio.speak(t('say.offer', { name, action: act }))) lastOtherSpokenAt = Date.now();
  } else if (message.type === 'prayer.received') {
    prayerReceived(message);
  } else if (message.type === 'room.moves') {
    explore.onMoves(message);
  } else if (message.type === 'chore.state') {
    explore.onChores(message);
  } else if (message.type === 'chore.reward') {
    explore.onChoreReward(message);
    garden?.refreshCoins();
  } else if (message.type === 'emote') {
    explore.onEmote(message);
    if (message.participantId === session.participantId) myEmoteChanged(message.kind, message.sutra);
  } else if (message.type === 'chat.message') {
    // Người mình đã chặn: không hiện lời chat của họ.
    if (social?.isBlocked(message.participantId)) return;
    say(nameOf(message.participantId, message.displayName), message.text, false, badgesOf(message.participantId));
    if (!renderer?.say(message.participantId, message.text)) explore.say(message.participantId, message.text);
  } else if (message.type === 'protocol.error') {
    // Hình shop chưa mua (hoặc vé cũ chưa ghi): mặc lại hình Nữ thường.
    if (message.code === 'SKIN_LOCKED') {
      onSkinLocked();
      return;
    }
    if (social?.onError(message)) return;
    if (explore.onError(message)) return;
    // Phòng không báo được "đã nhận sớ" (server cũ, gửi sớ quá nhanh…): sớ đã lưu, thầy vẫn đọc cho mình, không báo lỗi.
    if (announceRequestId && message.requestId === announceRequestId) {
      announceRequestId = null;
      reciteSlip();
      return;
    }
    // Lỗi của tin gửi liên tục không có requestId (vị trí khi đi): bỏ qua, không hiện thông báo.
    if (message.code === 'INVALID_MESSAGE' && !message.requestId) return;
    // Tài khoản vừa vào phòng từ trình duyệt / máy khác, hoặc bị khóa (kiểm duyệt): tab này về cổng (giữ link phòng).
    if (message.code === 'SESSION_REPLACED' || message.code === 'BANNED') {
      session.leave();
      explore.leave();
      audio.stop();
      participants = new Map();
      roomCount = null;
      stopRoomCountPolling();
      social?.reset();
      renderer?.setParticipants([]);
      renderBoard();
      showHall(false);
      elements.presence.className = 'chip';
      statusKey = 'hud.notIn';
      elements.statusText.textContent = t(statusKey);
      elements.gateError.textContent = message.code === 'BANNED' ? errorText(message) : t('err.SESSION_REPLACED');
      return;
    }
    if (message.code === 'ROOM_FULL') {
      session.leave();
      participants = new Map();
      roomCount = null;
      social?.reset();
      renderer?.setParticipants([]);
      renderBoard();
      showHall(false);
      elements.roomBar.hidden = true;
      lecture.clear();
      currentInviteCode = null;
      URL_ROOM = null;
      urlInfo = null;
      stopRoomCountPolling();
      history.replaceState(null, '', '/chanh-dien.html');
      elements.presence.className = 'chip';
      statusKey = 'hud.notIn';
      elements.statusText.textContent = t(statusKey);
      elements.gateError.textContent = t('err.ROOM_FULL');
    } else if (message.code === 'SEAT_TAKEN') takeSeatIfNeeded();
    else showToast(errorText(message));
  }
}

// Câu báo lỗi theo ngôn ngữ đang chọn; mã chưa dịch (hoặc câu có số phút từ server) thì dùng câu server gửi.
function errorText(message) {
  const known = t(`err.${message.code}`);
  return known === `err.${message.code}` ? message.message : known;
}

// ---- Thao tác ----
elements.skins.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-skin]');
  if (!button) return;
  mySkin = button.dataset.skin;
  for (const item of elements.skins.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
  rememberSkin(mySkin);
});

// Nhớ hình đã chọn: trên máy (cả khách) và theo tài khoản (đổi máy / trình duyệt vẫn đúng hình).
function rememberSkin(skin) {
  try { localStorage.setItem('thien-skin', skin); } catch {}
  if (!accountUI.account) return;
  fetch('/api/v1/shop/skin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skin }) }).catch(() => {});
}

elements.gateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = accountUI.account?.displayName || elements.dharma.value.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return;
  const submit = elements.gateForm.querySelector('.primary');
  submit.disabled = true;
  explore.previewSpawn();
  elements.gateError.textContent = '';
  try {
    if (!accountUI.account) localStorage.setItem('phapdanh', name);
    localStorage.setItem('displayName', name);
    localStorage.setItem('thien-skin', mySkin);
  } catch {}
  audio.start();
  audio.setLang(THIEN_LANGS[selectedLang].tts);
  // Lời chào đọc ngay trong lúc bấm "Vào chánh điện" để mở khóa giọng đọc trên điện thoại. Quay về từ rạp phim thì
  // không chào lại (đã chào lúc vào lần đầu).
  if (!ARRIVED_FROM_MAP) {
    audio.speak(t('welcome', { name }), true, { now: true });
    greeted = true;
  }
  try {
    enterRoom(await chooseRoom());
    audio.setLecture(lecture.active);
    await session.join(name);
    enterHall(name);
    if (boot.active) finishBoot();
  } catch (error) {
    elements.gateError.textContent = error?.serverMessage || t('toast.joinFailed');
    boot.done();
  } finally {
    submit.disabled = false;
  }
});

function showHall(visible) {
  elements.gate.hidden = visible;
  elements.controls.hidden = !visible;
  elements.tools.hidden = !visible;
  updateInsets();
}

function enterHall(name) {
  showHall(true);
  zoneGuide.enter(currentPlace || 'hall');
  if (ARRIVED_FROM_MAP) {
    greeted = false;
    return;
  }
  showToast(t('welcome', { name }));
  if (!greeted) audio.speak(t('welcome', { name }), true);
  greeted = false;
}

// Lễ vật: dùng lời đang gõ làm lời nguyện, không có thì chọn một câu kinh. Nút tạm khóa theo thời gian chờ (nếu có).
elements.offerings.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const kind = button.dataset.kind;
  const sutra = t('sutra');
  const text = elements.chatInput.value.trim() || sutra[Math.floor(Math.random() * sutra.length)];
  if (!session.send({ type: 'offering.send', requestId: `offer-${crypto.randomUUID()}`, kind, text })) {
    showToast(t('toast.reconnecting'));
    return;
  }
  // Đọc lời dâng lễ của mình ngay trong lúc chạm: điện thoại (nhất là iPhone) chỉ chắc chắn cho đọc khi đang chạm.
  const myName = me()?.displayName || session.displayName;
  audio.speak(`${t('say.offer', { name: myName, action: action(kind) })} ${text}`, true, { now: true });
  spokenOwnOfferings.push(Date.now());
  elements.chatInput.value = '';
  const label = button.querySelector('small');
  const original = label.textContent;
  const until = Date.now() + OFFERINGS[kind].cooldownMs;
  button.disabled = true;
  const timer = setInterval(() => {
    const left = Math.ceil((until - Date.now()) / 1_000);
    if (left > 0) {
      label.textContent = `${left}s`;
      return;
    }
    clearInterval(timer);
    label.textContent = original;
    button.disabled = false;
  }, 250);
});

elements.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = elements.chatInput.value.trim();
  if (text && session.send({ type: 'chat.send', requestId: `chat-${crypto.randomUUID()}`, text })) elements.chatInput.value = '';
});

elements.prayerOpen.addEventListener('click', openPrayerDialog);
elements.prayerClose.addEventListener('click', closePrayerDialog);
elements.prayerDialog.addEventListener('click', (event) => { if (event.target === elements.prayerDialog) closePrayerDialog(); });
elements.prayerAdd.addEventListener('click', () => addPrayerPerson());
elements.prayerTabs.addEventListener('click', (event) => {
  const button = event.target.closest('[data-prayer-type]');
  if (!button) return;
  prayerType = button.dataset.prayerType;
  refreshPrayerUi();
});
// ---- Tụng kinh / gõ mõ của chính mình: giọng tụng và tiếng mõ chỉ phát trên máy mình ----
function myEmoteChanged(kind, sutraId) {
  if (kind === 'woodfish') {
    audio.woodfish();
    return;
  }
  const sutra = kind === 'chant' && sutraById(sutraId);
  if (!sutra) {
    audio.stopChant();
    return;
  }
  audio.setLang(THIEN_LANGS[lang()]?.tts || 'vi-VN');
  audio.chant(sutraLines(sutra, lang()), {
    repeat: Boolean(sutra.repeat),
    // Tụng xong cả bài thì về quỳ yên.
    onEnd: () => session.send({ type: 'emote', requestId: `emote-${crypto.randomUUID()}`, kind: 'kneel' }),
  });
}

// ---- Thầy nhận sớ và đọc sớ ----
let greeted = false;
let lastOtherSpokenAt = 0;
let pendingSlip = null;
const spokenOwnOfferings = [];
let announceRequestId = null;
const READING_MS = 30_000;

function reciteSlip() {
  const slip = pendingSlip;
  pendingSlip = null;
  if (!slip) return;
  showToast(t('prayer.readingForYou'));
  // Câu "Nam mô…" đầu tiên đã đọc lúc bấm gửi.
  audio.recite(buildRecitation({ ...slip, lang: lang() }).slice(1));
}

function prayerReceived(message) {
  const name = nameOf(message.participantId, message.displayName);
  const text = t(message.kind === 'memorial' ? 'prayer.receivedMemorial' : 'prayer.receivedPeace', { name });
  say(t('ceremony.teacher'), text, true);
  showToast(text, badgesOf(message.participantId));
  renderer?.teacherRead?.(READING_MS, t('prayer.reading'));
  if (message.participantId === session.participantId) reciteSlip();
}

elements.prayerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  // Câu mở đầu bài sớ đọc ngay trong lúc bấm gửi (mở khóa giọng đọc trên điện thoại); phần còn lại đọc khi nhà
  // chùa nhận sớ.
  audio.setLang(THIEN_LANGS[lang()]?.tts || 'vi-VN');
  audio.recite(buildRecitation({ kind: prayerType, lang: lang(), requester: '', people: [], note: '' }).slice(0, 1));
  if (!URL_ROOM || !urlInfo) return;
  const people = [...elements.prayerPeople.children].map(prayerPersonValue);
  if (people.some((person) => !person.name)) {
    elements.prayerError.textContent = t('prayer.nameRequired');
    return;
  }
  elements.prayerError.textContent = '';
  elements.prayerSubmit.disabled = true;
  elements.prayerSubmit.textContent = t('prayer.sending');
  try {
    const response = await fetch('/api/v1/thien/prayer-slips', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: prayerType,
        requesterName: session.displayName || t('name.fallback'),
        roomId: URL_ROOM,
        state: urlInfo.state,
        lang: urlInfo.lang,
        people,
        note: elements.prayerNote.value.trim(),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error();
    closePrayerDialog();
    elements.prayerPeople.replaceChildren();
    // Sớ vừa gửi: giữ trên máy này để thầy đọc tên từng người khi phòng báo đã nhận sớ (không gửi tên qua phòng).
    pendingSlip = { kind: prayerType, requester: session.displayName || t('name.fallback'), people, note: elements.prayerNote.value.trim() };
    elements.prayerNote.value = '';
    showToast(t('prayer.sent', { id: result.id }));
    announceRequestId = `prayer-${crypto.randomUUID()}`;
    if (!session.send({ type: 'prayer.announce', requestId: announceRequestId, kind: prayerType })) reciteSlip();
  } catch {
    elements.prayerError.textContent = t('prayer.sendFailed');
  } finally {
    elements.prayerSubmit.disabled = false;
    elements.prayerSubmit.textContent = t('prayer.submit');
  }
});

function openMeritLedger() {
  elements.ledger.hidden = false;
  renderLedger();
  elements.ledgerClose.focus();
}
elements.boardPanel.addEventListener('click', openMeritLedger);
elements.ledgerClose.addEventListener('click', () => { elements.ledger.hidden = true; });
elements.ledger.addEventListener('click', (event) => { if (event.target === elements.ledger) elements.ledger.hidden = true; });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') for (const dialog of document.querySelectorAll('.ledger')) dialog.hidden = true;
});
elements.viewMode.addEventListener('click', () => setViewMode(viewMode === '3d' ? '2d' : '3d'));
elements.viewReset.addEventListener('click', () => renderer?.setCamera('overview'));
elements.nextTrack.addEventListener('click', () => audio.nextTrack());
function roomInviteUrl() {
  const shared = new URL('/chanh-dien.html', location.origin);
  shared.searchParams.set('invite', currentInviteCode);
  return shared.href;
}

// Thử lệnh đồng bộ trước khi quyền thao tác do cú bấm hết hiệu lực. Một số trình duyệt từ chối
// navigator.clipboard trên HTTP hoặc trong WebView nhưng vẫn hỗ trợ execCommand('copy').
function legacyCopy(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.width = '2px';
  field.style.height = '2px';
  field.style.opacity = '0.01';
  document.body.append(field);
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, field.value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  field.remove();
  return copied;
}

function showManualCopy(text) {
  elements.shareLink.value = text;
  elements.shareDialog.hidden = false;
  elements.shareLink.focus({ preventScroll: true });
  elements.shareLink.select();
  elements.shareLink.setSelectionRange(0, text.length);
}

async function copyRoomInvite() {
  if (!currentInviteCode) return;
  const text = roomInviteUrl();
  let copied = legacyCopy(text);
  if (!copied && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
  }
  if (copied) {
    elements.shareDialog.hidden = true;
    showToast(t('room.copied'));
  } else showManualCopy(text);
}

elements.copyRoom.addEventListener('click', copyRoomInvite);
elements.shareCopy.addEventListener('click', copyRoomInvite);
elements.shareClose.addEventListener('click', () => { elements.shareDialog.hidden = true; });
elements.shareDialog.addEventListener('click', (event) => { if (event.target === elements.shareDialog) elements.shareDialog.hidden = true; });
elements.mute.addEventListener('click', () => {
  const muted = audio.toggleMute();
  elements.mute.textContent = muted ? '🔇' : '🔈';
  elements.mute.setAttribute('aria-pressed', String(muted));
});
elements.leave.addEventListener('click', () => {
  explore.leave();
  session.leave();
  audio.stop();
  participants = new Map();
  roomCount = null;
  stopRoomCountPolling();
  social?.reset();
  renderer?.setParticipants([]);
  renderBoard();
  showHall(false);
  elements.roomBar.hidden = true;
  lecture.clear();
  updateGateInfo();
});

// ---- Đổi phòng: bấm tên phòng (vd: Arizona · PV1) → chọn tiểu bang / ngôn ngữ, rồi phòng đang mở hoặc phòng còn chỗ ----
const roomSwitch = { panel: $('roomSwitch'), state: $('switchState'), lang: $('switchLang'), list: $('roomSwitchList'), auto: $('roomSwitchAuto') };
let switchingRoom = false;

async function listSwitchRooms() {
  const state = roomSwitch.state.value;
  const langCode = roomSwitch.lang.value;
  const note = (text) => Object.assign(document.createElement('p'), { textContent: text });
  roomSwitch.list.replaceChildren(note(t('room.loading')));
  let rooms = [];
  try {
    const response = await fetch(`/api/v1/thien/rooms?state=${state}&lang=${langCode}`, { cache: 'no-store' });
    if (response.ok) rooms = (await response.json()).rooms || [];
  } catch {}
  if (state !== roomSwitch.state.value || langCode !== roomSwitch.lang.value) return;
  if (!rooms.length) {
    roomSwitch.list.replaceChildren(note(t('room.none')));
    return;
  }
  roomSwitch.list.replaceChildren(...rooms.map((room) => {
    const here = room.roomId === URL_ROOM;
    const full = !here && room.count >= room.capacity;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = here ? 'here' : '';
    button.disabled = here || full || !room.inviteCode;
    const name = document.createElement('b');
    name.textContent = room.name;
    const info = document.createElement('small');
    info.textContent = here ? t('room.here') : full ? t('room.full') : t('room.people', { count: room.count, capacity: room.capacity });
    button.append(name, info);
    button.addEventListener('click', () => switchRoom({ roomId: room.roomId, inviteCode: room.inviteCode }));
    return button;
  }));
}

function openRoomSwitch() {
  const info = urlInfo || { state: selectedState, lang: selectedLang };
  roomSwitch.state.replaceChildren(...US_STATES.map((state) => new Option(state.name, state.code, false, state.code === info.state)));
  roomSwitch.lang.replaceChildren(...Object.entries(THIEN_LANGS).map(([code, item]) => new Option(item.label, code, false, code === info.lang)));
  $('roomSwitchCurrent').textContent = t('room.current', { room: thienRoomName(URL_ROOM) || '' });
  roomSwitch.panel.hidden = false;
  listSwitchRooms();
}
const closeRoomSwitch = () => { roomSwitch.panel.hidden = true; };

// Sang phòng khác: rời phòng cũ rồi vào phòng mới bằng vé mới (giữ tên, hình nhân vật, chỗ đang đứng trong cảnh).
// Phòng khác ngôn ngữ thì đổi luôn ngôn ngữ giao diện và giọng đọc theo phòng.
async function switchRoom(target) {
  if (switchingRoom || target.roomId === URL_ROOM) return;
  const info = parseThienRoomId(target.roomId);
  if (!info) return;
  switchingRoom = true;
  roomSwitch.auto.disabled = true;
  const name = me()?.displayName || accountUI.account?.displayName || session.displayName;
  try {
    explore.keepPosition();
    session.leave();
    participants = new Map();
    roomCount = null;
    social?.reset();
    renderer?.setParticipants([]);
    renderBoard();
    selectedState = info.state;
    elements.stateSelect.value = selectedState;
    if (info.lang !== selectedLang) {
      selectedLang = info.lang;
      elements.langSelect.value = selectedLang;
      setLang(selectedLang);
    }
    try {
      localStorage.setItem('thien-state', selectedState);
      localStorage.setItem('thien-lang', selectedLang);
    } catch {}
    audio.setLang(THIEN_LANGS[selectedLang].tts);
    enterRoom(target);
    audio.setLecture(lecture.active);
    await session.join(name);
    closeRoomSwitch();
    showToast(t('room.moved', { room: thienRoomName(target.roomId) }));
  } catch (error) {
    showToast(error?.serverMessage || t('toast.joinFailed'));
  } finally {
    switchingRoom = false;
    roomSwitch.auto.disabled = false;
  }
}

elements.roomName.addEventListener('click', openRoomSwitch);
$('roomSwitchClose').addEventListener('click', closeRoomSwitch);
roomSwitch.panel.addEventListener('click', (event) => { if (event.target === roomSwitch.panel) closeRoomSwitch(); });
roomSwitch.state.addEventListener('change', listSwitchRooms);
roomSwitch.lang.addEventListener('change', listSwitchRooms);
// Phòng còn chỗ của tiểu bang / ngôn ngữ đang chọn (mở phòng mới nếu chưa có ai).
roomSwitch.auto.addEventListener('click', async () => {
  roomSwitch.auto.disabled = true;
  try {
    const response = await fetch('/api/v1/thien/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: roomSwitch.state.value, lang: roomSwitch.lang.value }),
    });
    if (!response.ok) throw new Error();
    const target = await response.json();
    if (target.roomId === URL_ROOM) showToast(t('room.here'));
    else await switchRoom(target);
  } catch {
    showToast(t('toast.joinFailed'));
  } finally {
    roomSwitch.auto.disabled = false;
  }
});

// Giọng đọc: chọn giọng đúng ngôn ngữ phòng (máy có nhiều giọng) và thử ngay trên máy. Không có giọng của ngôn ngữ
// này thì báo để người dùng cài giọng (đọc bằng giọng khác ngôn ngữ nghe sai hết).
const voiceTest = document.createElement('div');
voiceTest.className = 'voice-pick';
const voiceSelect = document.createElement('select');
voiceSelect.setAttribute('aria-label', 'voice');
const voiceTry = document.createElement('button');
voiceTry.type = 'button';
voiceTry.className = 'chip';
voiceTest.append(voiceSelect, voiceTry);
function fillVoices() {
  audio.setLang(THIEN_LANGS[lang()]?.tts || 'vi-VN');
  const voices = audio.voices();
  voiceSelect.replaceChildren(...(voices.length
    ? voices.map((item) => new Option(`${item.name} (${item.lang})${item.online ? ` · ${t('voice.online')}` : ''}`, item.name, false, item.selected))
    : [new Option(t('voice.none'), '', true, true)]));
  voiceSelect.disabled = !voices.length;
  voiceTry.textContent = `🔊 ${t('voice.test')}`;
}
fillVoices();
onLangChange(fillVoices);
setTimeout(fillVoices, 1_500);
voiceSelect.addEventListener('pointerdown', fillVoices);
voiceSelect.addEventListener('change', () => {
  audio.setVoice(voiceSelect.value);
  audio.testVoice(t('voice.testLine'));
});
voiceTry.addEventListener('click', () => {
  fillVoices();
  const result = audio.testVoice(t('voice.testLine'));
  if (!result.ok) showToast(t(result.reason === 'muted' ? 'voice.muted' : 'voice.unsupported'));
  else showToast(result.voice ? t('voice.name', { name: result.voice }) : t('voice.none'));
});

mala = createMala({ stage: elements.stage, audio, showToast });
garden = createGardenUI({
  stage: elements.stage, showToast, explore, account: () => accountUI.account, openSignIn: () => $('meChip').click(),
  onCoins: (coins, ready, quests) => {
    $('coinCount').textContent = coins === null ? '—' : coins.toLocaleString(locale());
    $('coinChip').title = ready ? t('coins.quests') : t('coins.title');
    // Nút 📜: số nhiệm vụ đã nhận / tổng; chấm đỏ khi có nhiệm vụ đã xong mà chưa nhận xu.
    $('questCount').textContent = quests?.total ? `${quests.claimed}/${quests.total}` : '0/7';
    $('questChip').classList.toggle('has-quest', Boolean(ready));
  },
});
$('questChip').addEventListener('click', () => garden.openQuests());
// Ô xu trên header: đã đăng nhập thì mở ví ở quầy hạt giống; chưa thì nhắc đăng nhập.
$('coinChip').addEventListener('click', () => {
  if (accountUI.account) garden.openWallet();
  else showToast(t('coins.signIn'));
});
// Quay lại tab (vd: vừa chơi ở phòng game tab khác): đọc lại số xu.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  garden?.refreshCoins();
  // Vừa mua / chọn hình ở Shop (tab khác): mặc hình đó luôn.
  syncSkinChoice();
  if (accountUI.account) refreshOwnedSkins();
});
garden.start();
communityProject = createCommunityProjectUI({
  stage: elements.stage,
  chip: $('communityProjectChip'),
  account: () => accountUI.account,
  openSignIn: () => $('meChip').click(),
  showToast,
  applyProject: (project) => renderer?.setCommunityProject?.(project),
  onContribution: () => garden?.refreshCoins(),
});
communityProject.start();
try { if (localStorage.getItem('debug-explore') === '1') window.chanhDienGarden = garden; } catch {}
social = createPlayerSocial({
  stage: elements.stage,
  session,
  showToast,
  participant: (id) => participants.get(id),
  everyone: () => participants.values(),
  nameOf,
  audio,
  // Bảng oẳn tù xì phủ kín cảnh: ngừng WebGL phía sau để animation DOM không tranh CPU/GPU với ~250k tam giác.
  onGameActive: (active) => renderer?.setPaused?.(active),
  // Nhắn bot: tin bắt đầu bằng "@Tên bot" được server chuyển tới quản trị (Telegram) để trả lời thay bot.
  onMessageBot: (person) => {
    elements.chatInput.value = `@${person.displayName} `;
    elements.chatInput.focus();
  },
  onGoGame: (game) => goToGames(game),
  currentRoomId: () => URL_ROOM,
  onGoRoom: goToFriendRoom,
});

// "Tới chỗ bạn" / "Tới ngay" (lời mời của bạn): cùng phòng thì đi bộ tới cạnh bạn; chánh điện khác thì đổi phòng rồi
// đi tới bạn khi đã vào; rạp phim / phòng game thì sang trang đó.
let followFriendId = null;
function walkToFriend(participantId) {
  const friend = participantId && participants.get(participantId);
  if (!friend?.pos) return false;
  return explore.walkTo({ x: friend.pos.x + 0.8, z: friend.pos.z }) !== false;
}
function goToFriendRoom(room) {
  if (room.roomId === URL_ROOM) {
    if (!walkToFriend(room.participantId)) showToast(t('friends.sameRoom'));
    return;
  }
  if (room.type === 'thien' && room.inviteCode) {
    followFriendId = room.participantId || null;
    switchRoom({ roomId: room.roomId, inviteCode: room.inviteCode });
    return;
  }
  if (!room.href) return;
  try { sessionStorage.setItem('thien-return', `${location.pathname}${location.search}`); } catch {}
  location.href = room.href;
}
// Kiểm tra khi phát triển: localStorage 'debug-explore' = '1' thì window.chanhDienSocial là thẻ người chơi / khiêu chiến.
try { if (localStorage.getItem('debug-explore') === '1') window.chanhDienSocial = social; } catch {}

// ---- Nút cấu hình ⚙: đăng nhập, mã phòng, 2D/3D, âm nhạc, rời phòng gom vào một menu ----
// Trang Ủng hộ (quyên góp tự nguyện duy trì server). Nhớ link phòng để nút Đi nhanh ở đó quay về đúng phòng.
const donateButton = document.createElement('button');
donateButton.type = 'button';
donateButton.className = 'chip';
const labelDonate = () => { donateButton.textContent = `💝 ${t('donate.open')}`; };
labelDonate();
onLangChange(labelDonate);
donateButton.addEventListener('click', () => {
  try { sessionStorage.setItem('thien-return', `${location.pathname}${location.search}`); } catch {}
  location.href = '/ung-ho.html';
});

// Shop nhân vật (mua hình bằng kim cương). Nhớ link phòng để quay về đúng phòng.
const shopButton = document.createElement('button');
shopButton.type = 'button';
shopButton.className = 'chip';
const labelShop = () => { shopButton.textContent = `🛍 ${t('shop.open')}`; };
labelShop();
onLangChange(labelShop);
const openShop = () => {
  try { sessionStorage.setItem('thien-return', `${location.pathname}${location.search}`); } catch {}
  location.href = '/shop.html';
};
shopButton.addEventListener('click', openShop);
$('openShop').addEventListener('click', openShop);
$('shopChip').addEventListener('click', openShop);
// Ô 💎 trên header: số kim cương; bấm mở các gói nạp (admin đặt) → Stripe.
const gems = createGemUI({
  chip: $('gemChip'),
  count: $('gemCount'),
  showToast,
  beforeLeave: () => { try { sessionStorage.setItem('thien-return', `${location.pathname}${location.search}`); } catch {} },
  text: () => Object.fromEntries(['title', 'balance', 'signIn', 'off', 'empty', 'shop', 'close', 'failed', 'note'].map((name) => [name, t(`gem.${name}`)])),
});

// Hình đã mua: hiện ô chọn "Bé Mũ Đỏ" ở cổng. Chưa mua (hoặc chưa đăng nhập) thì tạm mặc Nữ nhưng vẫn nhớ lựa chọn
// trên máy, để đăng nhập xong là mặc lại đúng hình đã mua.
function pressSkin() {
  for (const item of elements.skins.querySelectorAll('button[data-skin]')) item.setAttribute('aria-pressed', String(item.dataset.skin === mySkin));
}
function useFreeSkin() {
  if (!isShopSkin(mySkin)) return;
  mySkin = baseSkin(mySkin);
  pressSkin();
}
// Ô chọn của một hình shop (chibigirl có sẵn trong HTML; nhân vật admin tải lên thì tạo khi tài khoản đã mua).
function shopSkinButton(skin, name, thumb) {
  let button = [...elements.skins.querySelectorAll('button[data-skin]')].find((item) => item.dataset.skin === skin);
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.skin = skin;
    button.setAttribute('aria-pressed', String(skin === mySkin));
    const looks = document.createElement('span');
    looks.className = 'skin-looks';
    const image = Object.assign(document.createElement('img'), { alt: '', src: `/thien/assets/c_${baseSkin(skin)}.png` });
    image.dataset.look = 'robe';
    looks.append(image);
    const label = document.createElement('span');
    label.className = 'skin-name';
    button.append(looks, label);
    elements.skins.querySelector('.skin-note').before(button);
    // Có ảnh chân dung dựng sẵn thì hiện ngay; chưa có thì dựng từ mô hình 3D.
    if (thumb) image.src = thumb;
    else renderChibiPortraits([{ skin }]).then((images) => { if (images[skin]) image.src = images[skin]; }).catch(() => {});
  }
  if (skin !== 'chibigirl') button.querySelector('.skin-name').textContent = name || skin;
  return button;
}
// Đọc lại hình đang chọn (vừa bấm "Mặc" ở Shop rồi vuốt quay lại: trình duyệt khôi phục trang từ bộ nhớ đệm, biến JS
// vẫn là hình cũ). Đổi ngay nếu đang kết nối; đang nối lại thì đổi ở room.state kế tiếp.
let skinDirty = false;
let skinSentAt = 0;
// immediate = false khi trang vừa khôi phục từ bộ nhớ đệm: socket cũ đã chết dù còn báo mở, chờ kết nối mới.
function syncSkinChoice(immediate = true) {
  let saved = null;
  try { saved = localStorage.getItem('thien-skin'); } catch {}
  if (!saved || saved === mySkin || !(['man', 'woman'].includes(saved) || isShopSkin(saved))) return;
  mySkin = saved;
  pressSkin();
  skinDirty = true;
  skinSentAt = 0;
  if (immediate && session.participantId && me()) {
    skinSentAt = Date.now();
    session.send({ type: 'avatar.set', requestId: `skin-${crypto.randomUUID()}`, skin: mySkin });
  }
}
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  syncSkinChoice(false);
  garden?.refreshCoins();
  if (accountUI.account) refreshOwnedSkins();
});
// Shop có thể mở ở tab khác: storage phát sang tab chánh điện đang mở, đổi hình ngay mà không cần tải lại.
addEventListener('storage', (event) => {
  if (event.key === 'thien-skin') syncSkinChoice();
});

// Server từ chối hình shop: nếu tài khoản đã mua hình đó (vé vào phòng cấp trước lúc mua — vd: mua xong quay lại
// trong 60 giây thì nối lại bằng resume token cũ) thì xin vé mới một lần để mặc được; chưa mua thì mặc hình thường.
let renewedSkinTicket = null;
async function onSkinLocked() {
  const wanted = mySkin;
  const owned = (await gems.refresh())?.me?.owned || [];
  if (isShopSkin(wanted) && owned.includes(wanted) && renewedSkinTicket !== wanted && session.participantId) {
    renewedSkinTicket = wanted;
    const name = me()?.displayName || accountUI.account?.displayName || session.displayName;
    explore.keepPosition();
    session.leave();
    participants = new Map();
    roomCount = null;
    social?.reset();
    session.join(name).catch(() => showToast(t('toast.joinFailed')));
    return;
  }
  useFreeSkin();
  if (me()?.skin !== mySkin) session.send({ type: 'avatar.set', requestId: `skin-${crypto.randomUUID()}`, skin: mySkin });
  showToast(t('skin.locked'));
}

async function refreshOwnedSkins() {
  // Cùng lần đọc với ô 💎 trên header (số kim cương + đồ đã mua).
  const shop = await gems.refresh();
  const owned = new Set(shop?.me?.owned || []);
  // Món đang bán + mô hình của món đã ẩn (người đã mua vẫn mặc được).
  const skins = new Map();
  for (const item of shop?.items || []) if (item.kind === 'skin') skins.set(item.skin, { name: item.name, thumb: item.thumb });
  for (const model of shop?.models || []) {
    shopBase.set(model.skin, model.base);
    if (!skins.has(model.skin)) skins.set(model.skin, { name: model.name, thumb: model.thumb });
  }
  for (const [skin, { name, thumb }] of skins) {
    if (owned.has(skin)) shopSkinButton(skin, name, thumb).hidden = false;
    else for (const button of elements.skins.querySelectorAll('button[data-skin]')) if (button.dataset.skin === skin) button.hidden = true;
  }
  let saved = null;
  try { saved = localStorage.getItem('thien-skin'); } catch {}
  // Hình chọn lần cuối lưu theo tài khoản được ưu tiên (chọn ở máy khác vẫn đúng); tài khoản chưa lưu thì đẩy lựa chọn
  // trên máy lên.
  const accountSkin = shop?.me?.skin;
  if (accountSkin) saved = accountSkin;
  else if (accountUI.account && shop?.me && (!isShopSkin(mySkin) || owned.has(mySkin))) rememberSkin(mySkin);
  if (!owned.has(mySkin) && isShopSkin(mySkin)) useFreeSkin();
  const usable = saved && (['man', 'woman'].includes(saved) || owned.has(saved));
  if (usable && mySkin !== saved) {
    mySkin = saved;
    try { localStorage.setItem('thien-skin', mySkin); } catch {}
    pressSkin();
    if (session.participantId && me()) session.send({ type: 'avatar.set', requestId: `skin-${crypto.randomUUID()}`, skin: mySkin });
  }
  // Danh mục mô hình vừa cho biết hình thay thế của bot shop-*; vẽ lại để 2D không giữ hình mặc định cũ.
  renderer?.setParticipants(sceneParticipants());
}

// Góp ý / Báo lỗi: kèm trang đang mở (cả mã phòng) để quay về đúng chỗ và biết lỗi xảy ra đâu.
const supportButton = document.createElement('button');
supportButton.type = 'button';
supportButton.className = 'chip';
const labelSupport = () => { supportButton.textContent = `🛟 ${t('support.open')}`; };
labelSupport();
onLangChange(labelSupport);
supportButton.addEventListener('click', () => {
  location.href = `/ho-tro.html?from=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
});

createSettingsMenu({
  topBar: elements.topBar,
  rows: [
    { element: $('meChip'), label: 'menu.account' },
    { element: social.friendsButton },
    { element: social.quietButton, keepOpen: true },
    { element: elements.copyRoom, container: elements.roomBar },
    { element: elements.viewMode, label: 'menu.view' },
    { element: elements.nextTrack, container: elements.tools, label: 'menu.music', keepOpen: true },
    { element: elements.mute, container: elements.tools, label: 'menu.sound', keepOpen: true },
    { element: voiceTest, label: 'menu.voice', keepOpen: true },
    { element: shopButton, label: 'menu.shop' },
    { element: donateButton, label: 'menu.donate' },
    { element: supportButton, label: 'menu.support' },
    { element: elements.leave, container: elements.tools },
  ],
});

// Bảng "Tấm lòng thành" thu gọn / mở ra; nhớ lựa chọn trên máy.
const boardToggle = document.createElement('button');
boardToggle.type = 'button';
boardToggle.className = 'chip board-toggle hall-only';
elements.stage.append(boardToggle);
function setBoardCollapsed(collapsed) {
  elements.boardPanel.hidden = collapsed;
  boardToggle.classList.toggle('collapsed', collapsed);
  boardToggle.textContent = collapsed ? `${t('board.title')} ▸` : '–';
  boardToggle.title = collapsed ? t('board.expand') : t('board.collapse');
  boardToggle.setAttribute('aria-expanded', String(!collapsed));
  try { localStorage.setItem('thien-board-collapsed', collapsed ? '1' : '0'); } catch {}
}
boardToggle.addEventListener('click', () => setBoardCollapsed(!elements.boardPanel.hidden));
onLangChange(() => setBoardCollapsed(elements.boardPanel.hidden));
setBoardCollapsed((() => { try { return localStorage.getItem('thien-board-collapsed') === '1'; } catch { return false; } })());

// ---- Khởi động ----
// Màn tải: người đã có tên (phiên trong tab, hoặc quay về từ rạp phim) vào thẳng, không thấy cổng; lần đầu thì tải
// xong mới hiện cổng nhập pháp danh.
const boot = createBootLoader($('boot'));
async function finishBoot() {
  boot.step(t('boot.joining'), 60);
  await waitFor(() => session.online, 8_000);
  boot.step(t('boot.scene'), 75);
  await waitFor(() => renderer, 8_000);
  // Tượng tải dần phía sau; chờ thêm tối đa 2,5 giây cho phần lớn tượng hiện ra, không bắt chờ hết.
  await waitFor(() => {
    const progress = renderer?.loadProgress?.();
    const share = progress?.total ? progress.done / progress.total : 1;
    boot.step(null, 75 + share * 20);
    return share >= 0.9;
  }, 2_500);
  await boot.done();
}

async function start() {
  // Đặt ngôn ngữ ngay để màn tải nói đúng tiếng của phòng (mã mời bên dưới có thể đổi lại).
  setLang(selectedLang);
  boot.step(t('boot.loading'), 12);
  let invalidInvite = false;
  if (currentInviteCode) {
    try {
      const response = await fetch(`/api/v1/thien/invite/${encodeURIComponent(currentInviteCode)}`);
      if (!response.ok) throw new Error('invalid invite');
      const resolved = await response.json();
      URL_ROOM = resolved.roomId;
      currentInviteCode = resolved.inviteCode;
      urlInfo = parseThienRoomId(URL_ROOM);
      selectedState = urlInfo.state;
      selectedLang = urlInfo.lang;
      session.setRoom(URL_ROOM, currentInviteCode);
    } catch {
      invalidInvite = true;
      currentInviteCode = null;
      history.replaceState(null, '', '/chanh-dien.html');
    }
  }

  await refreshEventConfig();
  setLang(selectedLang);
  applyDom();
  fillSelects();
  updateGateInfo();
  if (invalidInvite) elements.gateError.textContent = t('gate.invalidInvite');
  setInterval(refreshEventConfig, 60_000);
  try { elements.dharma.value = localStorage.getItem('phapdanh') || localStorage.getItem('displayName') || ''; } catch {}
  for (const item of elements.skins.querySelectorAll('button[data-skin]')) item.setAttribute('aria-pressed', String(item.dataset.skin === mySkin));
  // Ảnh Nam/Nữ dựng từ mô hình 3D (áo tràng ở chùa, đồ thường ngày ở rạp); không có WebGL thì giữ ảnh vẽ sẵn.
  renderChibiPortraits([
    { skin: 'man' }, { skin: 'woman' },
    { skin: 'man', look: { outfit: 'casual', top: '#4cc9f0', bottom: '#2b4c7e', accent: '#ffffff' } },
    { skin: 'woman', look: { outfit: 'casual', top: '#f15bb5', bottom: '#ffd166', accent: '#ffffff' } },
  ]).then((images) => {
    // Chỉ ô Nam/Nữ; hình shop dùng ảnh chân dung dựng sẵn (thumb).
    for (const button of elements.skins.querySelectorAll('[data-skin]')) {
      if (!images[button.dataset.skin]) continue;
      button.querySelector('[data-look="robe"]').src = images[button.dataset.skin];
      const casual = button.querySelector('[data-look="casual"]');
      if (!casual) continue;
      casual.src = images[`${button.dataset.skin}:casual`];
      casual.hidden = false;
    }
  }).catch(() => {});
  setupScene().then(takeSeatIfNeeded).catch(() => showToast(t('toast.loadFailed')));
  setLang(selectedLang);
  boot.step(t('boot.account'), 35);
  const accountReady = accountUI.start().then(showGuestName).catch(() => {});
  // Biết đã đăng nhập hay chưa rồi mới đọc ví (ô xu trên header).
  accountReady.then(() => garden?.refreshCoins());
  accountReady.then(refreshOwnedSkins);

  // Tải lại trang: nối lại ngay, nhưng trình duyệt chỉ cho phát tiếng sau một lần chạm.
  const restored = Boolean(URL_ROOM) && session.restore();
  // Từ rạp phim về mà tab chưa có phiên chùa (vd: vào rạp trước): tự vào bằng tên đã nhập (đợi biết có đăng nhập không).
  if (restored) finishBoot();
  else {
    accountReady.then(() => {
      if (ARRIVED_FROM_MAP && (accountUI.account || elements.dharma.value.trim())) {
        boot.step(t('boot.joining'), 50);
        elements.gateForm.requestSubmit();
      } else boot.done();
    });
  }
  if (ARRIVED_FROM_MAP && !restored) {
    for (const type of ['touchend', 'click']) {
      document.addEventListener(type, () => {
        audio.start();
        audio.setLecture(lecture.active);
      }, { once: true });
    }
  }
  if (restored) {
    enterRoom({ roomId: URL_ROOM, inviteCode: currentInviteCode });
    showHall(true);
    showToast(t('toast.tapSound'));
    audio.setLang(THIEN_LANGS[selectedLang].tts);
    for (const type of ['touchend', 'click']) {
      document.addEventListener(type, () => {
        audio.start();
        audio.setLecture(lecture.active);
      }, { once: true });
    }
  }
}

start();
