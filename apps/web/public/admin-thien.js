const LANGS = ['vi', 'en', 'zh', 'es'];
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const $ = (selector) => document.querySelector(selector);
const form = $('#configForm');
const time = $('#eventTime');
const key = $('#adminKey');
const message = $('#message');
const state = $('#saveState');
const save = $('#save');
const prayerSlips = $('#prayerSlips');

function videoId(value) {
  const text = value.trim();
  if (VIDEO_ID.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, '');
    let id = null;
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0];
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') id = url.searchParams.get('v') || /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1];
    return VIDEO_ID.test(id || '') ? id : null;
  } catch { return null; }
}

function setMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle('error', error);
}

function updatePreviews() {
  for (const lang of LANGS) {
    const card = document.querySelector(`[data-lang="${lang}"]`);
    const id = videoId(card.querySelector(`[name="${lang}-video"]`).value);
    const preview = card.querySelector('.preview');
    preview.hidden = !id;
    if (id) preview.href = `https://www.youtube.com/watch?v=${id}`;
  }
}

function updateClocks() {
  const labels = [
    ['Arizona', 'America/Phoenix'],
    ['California', 'America/Los_Angeles'],
    ['Texas', 'America/Chicago'],
    ['New York', 'America/New_York'],
  ];
  const selected = time.value || '18:00';
  $('#clocks').replaceChildren(...labels.map(([name, zone]) => {
    const item = document.createElement('div');
    item.className = 'clock';
    const current = new Intl.DateTimeFormat('vi-VN', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(new Date());
    item.innerHTML = `<b>${name} · ${selected}</b><span>Hiện tại ${current}</span>`;
    return item;
  }));
}

function fill(config) {
  time.value = `${String(config.hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')}`;
  for (const lang of LANGS) {
    form.elements[`${lang}-title`].value = config.lectures[lang].title;
    form.elements[`${lang}-video`].value = `https://www.youtube.com/watch?v=${config.lectures[lang].videoId}`;
  }
  updatePreviews();
  updateClocks();
  state.textContent = 'Đã đồng bộ';
  state.className = 'save-state ok';
}

async function load() {
  setMessage('');
  state.textContent = 'Đang tải…';
  state.className = 'save-state';
  try {
    const response = await fetch('/api/v1/thien/event-config');
    if (!response.ok) throw new Error();
    fill(await response.json());
  } catch {
    state.textContent = 'Không kết nối được';
    setMessage('Không tải được cấu hình từ API.', true);
  }
}

function inputConfig() {
  const [hour, minute] = time.value.split(':').map(Number);
  const lectures = {};
  for (const lang of LANGS) {
    const id = videoId(form.elements[`${lang}-video`].value);
    if (!id) throw new Error(`Link YouTube của ${lang.toUpperCase()} không hợp lệ.`);
    lectures[lang] = { videoId: id, title: form.elements[`${lang}-title`].value.trim() };
  }
  return { hour, minute, lectures };
}

async function adminRequest(method, body) {
  const adminKey = key.value;
  if (!adminKey) throw new Error('Nhập khóa quản trị trước khi lưu.');
  sessionStorage.setItem('thien-admin-key', adminKey);
  const response = await fetch('/api/v1/admin/thien/event-config', {
    method,
    headers: { 'x-admin-key': adminKey, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 403) throw new Error('Khóa quản trị không đúng.');
  if (!response.ok) throw new Error('Cấu hình không hợp lệ hoặc chưa lưu được.');
  return result;
}

const STATUS_LABELS = { received: 'Đã nhận', scheduled: 'Đã xếp lịch lễ', completed: 'Đã hoàn lễ' };
const STAR_LABELS = { laHau: 'La Hầu', thoTu: 'Thổ Tú', thuyDieu: 'Thủy Diệu', thaiBach: 'Thái Bạch', thaiDuong: 'Thái Dương', vanHon: 'Vân Hớn', keDo: 'Kế Đô', thaiAm: 'Thái Âm', mocDuc: 'Mộc Đức' };

function renderPrayerSlips(values) {
  if (!values.length) {
    prayerSlips.innerHTML = '<p class="empty">Chưa có sớ nào được gửi.</p>';
    return;
  }
  prayerSlips.replaceChildren(...values.map((value) => {
    const card = document.createElement('article');
    card.className = 'prayer-admin-card';
    const info = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = value.type === 'peace' ? 'Sớ Cầu an' : 'Sớ Cầu siêu';
    const requester = document.createElement('p');
    requester.textContent = `Người gửi: ${value.requesterName}`;
    const meta = document.createElement('p');
    meta.textContent = `${new Date(value.submittedAt).toLocaleString('vi-VN')} · ${value.state.toUpperCase()} · ${value.lang.toUpperCase()}`;
    const code = document.createElement('p');
    code.textContent = value.id;
    info.append(heading, requester, meta, code);
    const content = document.createElement('div');
    const people = document.createElement('ol');
    for (const person of value.people) {
      const item = document.createElement('li');
      item.textContent = `${person.name}${person.dharmaName ? ` · ${person.dharmaName}` : ''}`;
      const detail = document.createElement('small');
      const gender = person.gender === 'male' ? 'Nam' : 'Nữ';
      detail.textContent = value.type === 'peace'
        ? `Sinh năm ${person.birthYear} · ${person.age} tuổi âm · ${gender} · sao ${STAR_LABELS[person.starKey] || person.starKey}`
        : `Sinh năm ${person.birthYear} · ${person.age} tuổi âm quy đổi · ${gender}`;
      item.append(detail);
      people.append(item);
    }
    content.append(people);
    if (value.note) {
      const note = document.createElement('p');
      note.textContent = `Ghi chú: ${value.note}`;
      content.append(note);
    }
    const status = document.createElement('select');
    for (const [keyName, label] of Object.entries(STATUS_LABELS)) status.add(new Option(label, keyName, false, keyName === value.status));
    status.addEventListener('change', async () => {
      status.disabled = true;
      try {
        const response = await fetch(`/api/v1/admin/thien/prayer-slips/${encodeURIComponent(value.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'x-admin-key': key.value },
          body: JSON.stringify({ status: status.value }),
        });
        if (!response.ok) throw new Error();
        value.status = status.value;
        setMessage(`Đã cập nhật ${value.id}.`);
      } catch {
        status.value = value.status;
        setMessage('Không cập nhật được trạng thái sớ.', true);
      } finally { status.disabled = false; }
    });
    card.append(info, content, status);
    return card;
  }));
}

async function loadPrayerSlips() {
  if (!key.value) {
    setMessage('Nhập khóa quản trị trước khi tải sớ.', true);
    key.focus();
    return;
  }
  sessionStorage.setItem('thien-admin-key', key.value);
  prayerSlips.innerHTML = '<p class="empty">Đang tải danh sách sớ…</p>';
  try {
    const response = await fetch('/api/v1/admin/thien/prayer-slips?limit=200', { headers: { 'x-admin-key': key.value } });
    if (response.status === 403) throw new Error('Khóa quản trị không đúng.');
    if (!response.ok) throw new Error('Không tải được danh sách sớ.');
    renderPrayerSlips((await response.json()).prayerSlips || []);
  } catch (error) {
    prayerSlips.innerHTML = `<p class="empty">${error.message}</p>`;
    setMessage(error.message, true);
  }
}

form.addEventListener('input', (event) => {
  if (event.target === key || event.target.closest('#prayerSlips') || event.target.closest('#supportTickets')) return;
  state.textContent = 'Chưa lưu';
  state.className = 'save-state dirty';
  updatePreviews();
  updateClocks();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  save.disabled = true;
  setMessage('Đang lưu…');
  try {
    fill(await adminRequest('PUT', inputConfig()));
    setMessage('Đã lưu. Chánh điện đang mở sẽ tự cập nhật trong tối đa 60 giây.');
  } catch (error) {
    setMessage(error.message, true);
  } finally { save.disabled = false; }
});

$('#reload').addEventListener('click', load);
$('#loadPrayers').addEventListener('click', loadPrayerSlips);

// ---- Phiếu hỗ trợ (báo lỗi / góp ý). Nội dung người dùng chỉ đưa ra bằng textContent. ----
const supportTickets = $('#supportTickets');
const SUPPORT_KINDS = { bug: '🐞 Báo lỗi', idea: '💡 Góp ý nâng cấp', other: '💬 Khác' };
const SUPPORT_STATUSES = { new: 'Mới', seen: 'Đã xem', done: 'Đã xử lý' };

function supportEmpty(text) {
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = text;
  supportTickets.replaceChildren(empty);
}

function renderSupport(values) {
  if (!values.length) {
    supportEmpty('Chưa có phiếu hỗ trợ nào.');
    return;
  }
  supportTickets.replaceChildren(...values.map((value) => {
    const card = document.createElement('article');
    card.className = `prayer-admin-card support-card${value.status === 'new' ? ' is-new' : ''}`;
    const info = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = SUPPORT_KINDS[value.kind] || value.kind;
    const meta = document.createElement('p');
    meta.textContent = new Date(value.submittedAt).toLocaleString('vi-VN');
    const who = document.createElement('p');
    who.textContent = [value.account ? `Tài khoản: ${value.account.displayName}` : 'Khách', value.contact ? `Liên hệ: ${value.contact}` : ''].filter(Boolean).join(' · ');
    const where = document.createElement('p');
    where.textContent = [value.page ? `Trang: ${value.page}` : '', value.userAgent || ''].filter(Boolean).join(' · ');
    where.className = 'support-where';
    const code = document.createElement('p');
    code.textContent = value.id;
    info.append(heading, meta, who, where, code);
    const content = document.createElement('p');
    content.className = 'support-message';
    content.textContent = value.message;
    const status = document.createElement('select');
    for (const [keyName, label] of Object.entries(SUPPORT_STATUSES)) status.add(new Option(label, keyName, false, keyName === value.status));
    status.addEventListener('change', async () => {
      status.disabled = true;
      try {
        const response = await fetch(`/api/v1/admin/support/${encodeURIComponent(value.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'x-admin-key': key.value },
          body: JSON.stringify({ status: status.value }),
        });
        if (!response.ok) throw new Error();
        value.status = status.value;
        card.classList.toggle('is-new', value.status === 'new');
        setMessage(`Đã cập nhật phiếu ${value.id.slice(0, 11)}.`);
      } catch {
        status.value = value.status;
        setMessage('Không cập nhật được trạng thái phiếu.', true);
      } finally { status.disabled = false; }
    });
    card.append(info, content, status);
    return card;
  }));
}

async function loadSupport() {
  if (!key.value) {
    setMessage('Nhập khóa quản trị trước khi tải phiếu hỗ trợ.', true);
    key.focus();
    return;
  }
  sessionStorage.setItem('thien-admin-key', key.value);
  supportEmpty('Đang tải phiếu hỗ trợ…');
  try {
    const response = await fetch('/api/v1/admin/support?limit=300', { headers: { 'x-admin-key': key.value } });
    if (response.status === 403) throw new Error('Khóa quản trị không đúng.');
    if (!response.ok) throw new Error('Không tải được phiếu hỗ trợ.');
    renderSupport((await response.json()).tickets || []);
  } catch (error) {
    supportEmpty(error.message);
    setMessage(error.message, true);
  }
}
$('#loadSupport').addEventListener('click', loadSupport);
$('#reset').addEventListener('click', async () => {
  if (!confirm('Khôi phục giờ và bốn video về cấu hình mặc định?')) return;
  try {
    fill(await adminRequest('DELETE'));
    setMessage('Đã khôi phục cấu hình mặc định.');
  } catch (error) { setMessage(error.message, true); }
});

key.value = sessionStorage.getItem('thien-admin-key') || '';
time.addEventListener('change', updateClocks);
load();
