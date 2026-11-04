// Bài giảng hằng ngày theo giờ tiểu bang: đúng THIEN_EVENT.hour:minute giờ địa phương, cả phòng cùng nghe một
// video YouTube của ngôn ngữ phòng. Lịch suy ra từ múi giờ + giờ server nên mọi máy trong phòng phát cùng đoạn,
// không cần server gửi gì thêm; ai vào trễ nghe tiếp đúng đoạn đang giảng.
// Điều khoản YouTube: khung phát luôn hiện (tối thiểu 200×200), không che, không phát ngầm khi ẩn.
const DEFAULT_WINDOW_MS = 2 * 60 * 60_000;
const DRIFT_S = 6;

let apiReady = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiReady) {
    apiReady = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiReady = null;
        reject(new Error('youtube'));
      };
      document.head.append(script);
    });
  }
  return apiReady;
}

// Lệch giờ của múi giờ tại một thời điểm (ms), dùng để đổi "18:00 giờ Arizona" ra mốc thời gian tuyệt đối.
function zoneOffset(timeZone, at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(at)).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(at / 1_000) * 1_000;
}

// Mốc bắt đầu bài giảng của ngày (theo múi giờ) chứa thời điểm `at`, cộng thêm `dayShift` ngày.
export function eventStartOn(at, timeZone, hour, minute, dayShift = 0) {
  const local = new Date(at + zoneOffset(timeZone, at));
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayShift, hour, minute);
  return guess - zoneOffset(timeZone, guess - zoneOffset(timeZone, guess));
}

function formatLeft(ms) {
  const total = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function createLecture({ elements, serverNow, t, locale, onActive, onStart }) {
  let room = null;
  let player = null;
  let playerVideo = null;
  let durationMs = null;
  let dismissedStart = null;
  let active = false;
  let visible = true;
  let testStart = null;

  const timeFormat = () => new Intl.DateTimeFormat(locale(), { timeZone: room.timeZone, hour: 'numeric', minute: '2-digit' });

  function schedule(now) {
    if (testStart) return { start: testStart, next: testStart + 86_400_000 };
    const today = eventStartOn(now, room.timeZone, room.hour, room.minute);
    const window = durationMs || DEFAULT_WINDOW_MS;
    if (now < today + window) return { start: today, next: today };
    return { start: today, next: eventStartOn(now, room.timeZone, room.hour, room.minute, 1) };
  }

  function setActive(next) {
    if (next === active) return;
    active = next;
    onActive?.(active);
  }

  function destroyPlayer() {
    player?.destroy?.();
    player = null;
    playerVideo = null;
    elements.player.replaceChildren();
  }

  async function ensurePlayer(offsetS) {
    if (playerVideo === room.videoId) return;
    playerVideo = room.videoId;
    try {
      await loadYouTubeApi();
    } catch {
      elements.note.textContent = t('event.tapToListen');
      return;
    }
    if (playerVideo !== room.videoId) return;
    const mount = document.createElement('div');
    elements.player.replaceChildren(mount);
    player = new window.YT.Player(mount, {
      width: 200,
      height: 200,
      videoId: room.videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, start: Math.floor(offsetS), hl: room.lang },
      events: {
        onReady: (event) => {
          const seconds = event.target.getDuration?.();
          if (seconds > 0) durationMs = seconds * 1_000;
          event.target.seekTo((serverNow() - schedule(serverNow()).start) / 1_000, true);
          event.target.playVideo();
        },
        onStateChange: (event) => {
          // Trình duyệt chặn tự phát có tiếng: nhắc người dùng bấm ▶ trên khung phát.
          elements.note.textContent = event.data === window.YT.PlayerState.PLAYING ? '' : t('event.tapToListen');
        },
      },
    });
  }

  function tick() {
    if (!room) return;
    // Bài giảng chỉ có trong Chánh điện. Khi ra sân/vườn phải hủy player thay vì chỉ dùng CSS giấu iframe:
    // như vậy video không tiếp tục phát ngầm và khi quay lại sẽ đồng bộ đúng đoạn hiện tại.
    if (!visible) {
      elements.card.hidden = true;
      if (player) destroyPlayer();
      setActive(false);
      return;
    }
    const now = serverNow();
    const { start, next } = schedule(now);
    const live = now >= start && now < start + (durationMs || DEFAULT_WINDOW_MS);
    const clock = t('event.clock', { time: timeFormat().format(now), state: room.stateName });
    if (!live) {
      elements.chip.textContent = `${clock} · ${t('event.next', { time: timeFormat().format(next), left: formatLeft(next - now) })}`;
      elements.card.hidden = true;
      if (player) destroyPlayer();
      setActive(false);
      return;
    }
    if (!active && dismissedStart !== start) onStart?.(room.title);
    const dismissed = dismissedStart === start;
    elements.chip.textContent = dismissed ? `${clock} · ${t('event.show')} ›` : `${clock} · ${t('event.live', { title: room.title })}`;
    elements.card.hidden = dismissed;
    setActive(!dismissed);
    if (dismissed) {
      if (player) destroyPlayer();
      return;
    }
    elements.title.textContent = room.title;
    const offsetS = (now - start) / 1_000;
    if (!player) ensurePlayer(offsetS);
    else if (player.getCurrentTime && player.getPlayerState?.() === window.YT.PlayerState.PLAYING
      && Math.abs(player.getCurrentTime() - offsetS) > DRIFT_S) {
      player.seekTo(offsetS, true);
    }
    if (durationMs && offsetS * 1_000 >= durationMs) {
      elements.note.textContent = t('event.ended', { time: timeFormat().format(next) });
    }
  }

  elements.close.addEventListener('click', () => {
    dismissedStart = schedule(serverNow()).start;
    tick();
  });
  elements.chip.addEventListener('click', () => {
    if (dismissedStart === null) return;
    dismissedStart = null;
    tick();
  });
  setInterval(tick, 1_000);

  return {
    // room: { timeZone, stateName, lang, hour, minute, videoId, title }
    setRoom(next, options = {}) {
      if (room?.videoId !== next?.videoId || room?.timeZone !== next?.timeZone) {
        destroyPlayer();
        durationMs = null;
        dismissedStart = null;
      }
      room = next;
      // ?event=now: thử ngay, bài giảng coi như bắt đầu lúc mở trang (chỉ để kiểm tra, không ảnh hưởng người khác).
      testStart = options.testNow ? (testStart || serverNow()) : null;
      tick();
    },
    clear() {
      room = null;
      destroyPlayer();
      setActive(false);
      elements.card.hidden = true;
    },
    setVisible(next) {
      visible = Boolean(next);
      tick();
    },
    get active() { return active; },
    refresh: tick,
  };
}
