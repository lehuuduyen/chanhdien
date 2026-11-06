// Trình duyệt (nhất là điện thoại) có thể thu hồi WebGL khi thiếu bộ nhớ, chuyển app hoặc mở nhiều tab 3D: cảnh 3D
// thành màn đen, chạm vào cảnh không còn tác dụng và không tự hồi lại. three.js không dựng lại đủ mô hình / texture
// sau khi mất context, nên tải lại trang khi người chơi đang xem (phiên phòng giữ trong sessionStorage nên vào lại
// đúng chỗ). Mất liên tục (quá MAX_RELOADS lần trong WINDOW_MS) thì thôi tự tải, chỉ báo để tránh vòng lặp.
const KEY = 'webgl-lost-reloads';
const MAX_RELOADS = 3;
const WINDOW_MS = 5 * 60_000;
const RELOAD_DELAY_MS = 1_200;

function recentReloads(now) {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((at) => Number.isFinite(at) && now - at < WINDOW_MS) : [];
  } catch {
    return [];
  }
}

// onLost(willReload): báo người chơi (true: sắp tự tải lại; false: đã tải lại nhiều lần, cần bấm tải lại tay).
export function guardWebGL(canvas, { onLost } = {}) {
  if (!canvas) return;
  let handled = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    // preventDefault cho phép trình duyệt trả context lại; dù vậy vẫn tải lại trang vì cảnh không tự dựng lại được.
    event.preventDefault();
    if (handled) return;
    handled = true;
    const now = Date.now();
    const reloads = recentReloads(now);
    const willReload = reloads.length < MAX_RELOADS;
    try { onLost?.(willReload); } catch {}
    if (!willReload) return;
    const reload = () => {
      try { sessionStorage.setItem(KEY, JSON.stringify([...reloads, Date.now()])); } catch {}
      location.reload();
    };
    if (document.visibilityState === 'visible') {
      setTimeout(reload, RELOAD_DELAY_MS);
      return;
    }
    // Đang ở nền (chuyển app): đợi người chơi quay lại mới tải.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      setTimeout(reload, 300);
    };
    document.addEventListener('visibilitychange', onVisible);
  });
}
