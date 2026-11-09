import { cinemaRoomId, US_STATES } from '/shared/room-rules.mjs';

export function currentCinemaHref(storage = localStorage) {
  let state = 'vn';
  try {
    const saved = storage.getItem('thien-state');
    if (US_STATES.some((item) => item.code === saved)) state = saved;
  } catch {}
  return `/room.html?room=${encodeURIComponent(cinemaRoomId(state))}`;
}
