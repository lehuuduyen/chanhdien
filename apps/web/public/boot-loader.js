// Màn hình tải lúc mở trang (chánh điện, rạp phim): che giao diện trong lúc kiểm tra đăng nhập, nối lại phòng và
// dựng cảnh, để người đã có tên vào thẳng mà không thấy cổng chọn nhân vật chớp lên. Khung có sẵn trong HTML
// (hiện ngay khi tải trang); module này chỉ cập nhật chữ, thanh tiến độ và ẩn đi khi xong.
//
//   <div class="boot" id="boot"><div class="boot-card">… <p class="boot-step"></p><div class="boot-bar"><i></i></div>
//   <small class="boot-pct"></small></div></div>
export function createBootLoader(element) {
  const step = element.querySelector('.boot-step');
  const bar = element.querySelector('.boot-bar i');
  const pct = element.querySelector('.boot-pct');
  let shown = 0;
  let target = 0;
  let timer = null;
  let finished = false;

  // Thanh chạy mượt tới mốc mới (không nhảy cóc), và tự nhích chậm khi đang chờ mạng để không trông như đứng hình.
  function tick() {
    if (shown < target) shown = Math.min(target, shown + Math.max(0.6, (target - shown) * 0.18));
    else if (!finished && shown < 96) shown += 0.04;
    bar.style.width = `${shown}%`;
    pct.textContent = `${Math.floor(shown)}%`;
  }
  timer = setInterval(tick, 40);

  return {
    get active() { return !finished; },
    step(text, percent) {
      if (finished) return;
      if (text) step.textContent = text;
      target = Math.max(target, Math.min(100, percent));
    },
    // Xong: chạy nốt tới 100% rồi mờ dần.
    done() {
      if (finished) return Promise.resolve();
      finished = true;
      target = 100;
      return new Promise((resolve) => {
        const wait = setInterval(() => {
          if (shown < 100) return;
          clearInterval(wait);
          clearInterval(timer);
          element.classList.add('boot-out');
          setTimeout(() => {
            element.hidden = true;
            resolve();
          }, 320);
        }, 40);
      });
    },
  };
}

// Chờ tới khi check() đúng (thăm dò mỗi 120 ms), tối đa timeoutMs; trả về true nếu kịp.
export function waitFor(check, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (check()) resolve(true);
      else if (Date.now() - started > timeoutMs) resolve(false);
      else setTimeout(poll, 120);
    };
    poll();
  });
}
