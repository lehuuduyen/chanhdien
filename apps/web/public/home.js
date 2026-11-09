import { cinemaRoomId, THIEN_RULES, US_STATES } from '/shared/room-rules.mjs';
import { initHomeI18n } from '/home-i18n.js';

let stateCode = 'vn';
try {
  const saved = localStorage.getItem('thien-state');
  if (US_STATES.some((state) => state.code === saved)) stateCode = saved;
  else {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    stateCode = US_STATES.find((state) => state.timeZone === zone)?.code || 'vn';
  }
} catch {}
const state = US_STATES.find((item) => item.code === stateCode) || US_STATES[0];
document.getElementById('cinemaEntry').href = `/room.html?room=${encodeURIComponent(cinemaRoomId(state.code))}`;
initHomeI18n(document, localStorage, navigator.languages || [navigator.language], { count: THIEN_RULES.seats, state: state.name });
