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

// ---- Phiếu hỗ trợ (báo lỗi / hỗ trợ xu / góp ý). Nội dung người dùng chỉ đưa ra bằng textContent. ----
const supportTickets = $('#supportTickets');
const SUPPORT_KINDS = { bug: '🐞 Báo lỗi', coins: '🪙 Hỗ trợ xu', idea: '💡 Góp ý nâng cấp', other: '💬 Khác' };
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
    who.textContent = [
      value.account ? `Tài khoản: ${value.account.displayName}` : 'Khách',
      value.account?.username ? `@${value.account.username}` : value.account?.id || '',
      value.contact ? `Liên hệ: ${value.contact}` : '',
    ].filter(Boolean).join(' · ');
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

// ---- 05 · Gói nạp kim cương (Shop nhân vật) ----
const packRows = $('#packRows');
function packRow(pack = { id: '', diamonds: 100, cents: 99, active: true }) {
  const row = document.createElement('div');
  row.className = 'pack-row';
  const input = (type, value, attrs) => Object.assign(document.createElement('input'), { type, value, ...attrs });
  const id = input('text', pack.id, { placeholder: 'vd: d100', maxLength: 24, pattern: '[a-z0-9-]{2,24}' });
  id.dataset.field = 'id';
  const diamonds = input('number', pack.diamonds, { min: 1, max: 1_000_000, step: 1 });
  diamonds.dataset.field = 'diamonds';
  const price = input('number', (pack.cents / 100).toFixed(2), { min: 0.5, max: 999.99, step: 0.01 });
  price.dataset.field = 'price';
  const active = input('checkbox', '', { checked: pack.active, title: 'Bật / tắt gói' });
  active.dataset.field = 'active';
  const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '✕', title: 'Xóa gói' });
  remove.addEventListener('click', () => row.remove());
  row.append(id, diamonds, price, active, remove);
  return row;
}
function readPacks() {
  return [...packRows.children].map((row) => {
    const field = (name) => row.querySelector(`[data-field="${name}"]`);
    return {
      id: field('id').value.trim().toLowerCase(),
      diamonds: Number(field('diamonds').value),
      cents: Math.round(Number(field('price').value) * 100),
      active: field('active').checked,
    };
  });
}
function showPacks(packs, payments) {
  packRows.replaceChildren(...packs.map((pack) => packRow(pack)));
  $('#packAdmin').hidden = false;
  $('#packEmpty').hidden = true;
  if (payments !== undefined) {
    $('#packPayments').textContent = payments ? 'Stripe đã bật: người dùng nạp được.' : 'Chưa đặt STRIPE_SECRET_KEY trên server: người dùng thấy gói nhưng chưa nạp được.';
  }
}
async function packRequest(method, body) {
  if (!key.value) throw new Error('Nhập khóa quản trị trước khi tải gói nạp.');
  sessionStorage.setItem('thien-admin-key', key.value);
  const response = await fetch('/api/v1/admin/shop/packs', {
    method,
    headers: { 'x-admin-key': key.value, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 403) throw new Error('Khóa quản trị không đúng.');
  if (response.status === 400) throw new Error('Gói nạp không hợp lệ: mã 2–24 ký tự a-z 0-9 -, không trùng; kim cương là số nguyên ≥ 1; giá $0.50–$999.99; tối đa 8 gói.');
  if (!response.ok) throw new Error('Không tải / lưu được gói nạp.');
  return response.json();
}
$('#loadPacks').addEventListener('click', async () => {
  try {
    const result = await packRequest('GET');
    showPacks(result.packs, result.payments);
  } catch (error) { setMessage(error.message, true); }
});
$('#addPack').addEventListener('click', () => packRows.append(packRow({ id: `d${Date.now() % 100000}`, diamonds: 100, cents: 99, active: true })));
$('#savePacks').addEventListener('click', async () => {
  try {
    const result = await packRequest('PUT', { packs: readPacks() });
    showPacks(result.packs);
    setMessage('Đã lưu gói nạp kim cương.');
  } catch (error) { setMessage(error.message, true); }
});
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


// ---- 06 · Nhân vật trong Shop (file .glb có khung xương; server kiểm tra + nén) ----
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// Món vừa thay file: ảnh chân dung cũ không còn đúng, dựng lại khi tải danh sách.
const staleThumbs = new Set();
async function saveThumb(item) {
  try {
    const { renderChibiPortraits } = await import('/chibi-preview.js');
    const dataUrl = (await renderChibiPortraits([{ skin: item.skin }]))[item.skin];
    if (!dataUrl) return null;
    const response = await fetch(`/api/v1/admin/shop/items/${encodeURIComponent(item.id)}/thumb`, {
      method: 'PUT', headers: { 'x-admin-key': key.value, 'content-type': 'image/png' }, body: await (await fetch(dataUrl)).blob(),
    });
    return response.ok ? (await response.json()).item.thumb : dataUrl;
  } catch {
    return null;
  }
}
const modelStatus = $('#modelStatus');
const UPLOAD_ERRORS = {
  NOT_GLB: 'File không phải .glb.',
  NO_SKELETON: 'File chưa có khung xương: trên Meshy dùng Rig & Animate rồi xuất lại.',
  MISSING_BONES: 'Khung xương thiếu xương chính (cần kiểu Mixamo: Hips, Spine, chân, tay).',
  NO_WALK: 'File chưa có động tác Walking: trên Meshy chọn thêm động tác Walking.',
  TOO_MANY_TRIANGLES: 'Mô hình quá nhiều tam giác: hạ xuống ≤ 40.000 trên Meshy rồi xuất lại.',
  TOO_LARGE_AFTER_COMPRESS: 'Sau khi nén vẫn quá 6 MB.',
  COMPRESS_FAILED: 'Nén file bị lỗi.',
  busy: 'Đang xử lý một file khác, thử lại sau ít giây.',
  body_too_large: 'File quá 64 MB.',
  invalid_item: 'Thiếu tên hoặc giá không hợp lệ.',
};
function modelMessage(text, error = false) {
  modelStatus.textContent = text;
  modelStatus.classList.toggle('error', error);
}
function requireKey() {
  if (key.value) {
    sessionStorage.setItem('thien-admin-key', key.value);
    return true;
  }
  modelMessage('Nhập khóa quản trị (mục 08) trước.', true);
  key.focus();
  return false;
}
async function uploadModel(file, query) {
  modelMessage(`Đang tải lên và nén ${file.name} (${(file.size / 1e6).toFixed(1)} MB)…`);
  const response = await fetch(`/api/v1/admin/shop/models?${new URLSearchParams(query)}`, {
    method: 'POST', headers: { 'x-admin-key': key.value, 'content-type': 'model/gltf-binary' }, body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 403) throw new Error('Khóa quản trị không đúng.');
  if (!response.ok) {
    const extra = body.missing ? ` Thiếu: ${body.missing.join(', ')}.` : body.triangles ? ` (${body.triangles.toLocaleString('vi-VN')} tam giác)` : '';
    throw new Error((UPLOAD_ERRORS[body.error] || 'Không tải lên được.') + extra);
  }
  return body;
}
async function loadShopItems() {
  if (!requireKey()) return;
  const response = await fetch('/api/v1/admin/shop/items', { headers: { 'x-admin-key': key.value } });
  if (response.status === 403) return modelMessage('Khóa quản trị không đúng.', true);
  if (!response.ok) return modelMessage('Không tải được danh sách nhân vật.', true);
  renderShopItems((await response.json()).items || []);
}
function renderShopItems(items) {
  const list = $('#modelList');
  list.replaceChildren(...items.map((item) => {
    const row = document.createElement('div');
    row.className = 'model-row';
    const image = Object.assign(document.createElement('img'), { alt: '', src: item.thumb || BLANK_IMAGE });
    const name = Object.assign(document.createElement('input'), { type: 'text', value: item.name || 'Bé Mũ Đỏ', maxLength: 40 });
    // Giá bán (đang áp dụng) và giá gốc (để trống = không giảm giá; lớn hơn giá bán thì shop hiện gạch ngang + % giảm).
    const original = Object.assign(document.createElement('input'), { type: 'number', value: item.originalPrice ?? '', min: 0, max: 1_000_000, step: 1, placeholder: 'không giảm', title: 'Giá gốc' });
    const price = Object.assign(document.createElement('input'), { type: 'number', value: item.price, min: 0, max: 1_000_000, step: 1, title: 'Giá bán' });
    const active = Object.assign(document.createElement('input'), { type: 'checkbox', checked: item.active, title: 'Đang bán' });
    const clips = Object.assign(document.createElement('small'), { textContent: item.clips?.length ? item.clips.join(' · ') : 'có sẵn' });
    const actions = document.createElement('div');
    actions.className = 'model-actions';
    const save = Object.assign(document.createElement('button'), { type: 'button', className: 'secondary', textContent: 'Lưu' });
    save.addEventListener('click', async () => {
      if (!requireKey()) return;
      const body = {
        price: Number(price.value),
        originalPrice: original.value === '' ? null : Number(original.value),
        active: active.checked,
        // Bé Mũ Đỏ có sẵn trong code: tên cố định (dịch theo ngôn ngữ ở trang chùa).
        ...(item.model ? { name: name.value } : {}),
      };
      const response = await fetch(`/api/v1/admin/shop/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH', headers: { 'x-admin-key': key.value, 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return modelMessage('Không lưu được (tên trống hoặc giá sai).', true);
      original.value = result.item.originalPrice ?? '';
      const sale = result.item.originalPrice ? ` · giảm ${Math.round((1 - result.item.price / result.item.originalPrice) * 100)}% (từ ${result.item.originalPrice} 💎)` : '';
      modelMessage(`Đã lưu ${name.value}: ${result.item.price} 💎${sale}${result.item.active ? '' : ' · đang ẩn'}.`);
    });
    actions.append(save);
    if (!item.model) {
      name.disabled = true;
    } else {
      const replaceInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.glb,model/gltf-binary', hidden: true });
      const replace = Object.assign(document.createElement('button'), { type: 'button', className: 'secondary', textContent: 'Thay file' });
      replace.addEventListener('click', () => replaceInput.click());
      replaceInput.addEventListener('change', async () => {
        if (!replaceInput.files[0] || !requireKey()) return;
        try {
          await uploadModel(replaceInput.files[0], { id: item.id });
          staleThumbs.add(item.id);
          modelMessage(`Đã thay file của ${item.name}.`);
          await (await import('/shop-models.js')).loadShopCharacters({ refresh: true });
          loadShopItems();
        } catch (error) { modelMessage(error.message, true); }
      });
      actions.append(replace, replaceInput);
    }
    actions.append(clips);
    const label = (text, input) => {
      const wrap = document.createElement('label');
      wrap.className = 'model-field';
      wrap.append(Object.assign(document.createElement('span'), { textContent: text }), input);
      return wrap;
    };
    row.append(image, label('Tên', name), label('Giá gốc 💎', original), label('Giá bán 💎', price), label('Bán', active),
      Object.assign(document.createElement('small'), { textContent: item.id }), actions);
    // Nhân vật tải lên chưa có ảnh chân dung (vừa tải / vừa thay file): dựng từ mô hình 3D rồi lưu lên server để shop,
    // cổng chùa hiện ngay mà không phải dựng lại trên máy người xem.
    if (item.model && (!item.thumb || staleThumbs.has(item.id))) {
      staleThumbs.delete(item.id);
      saveThumb(item).then((src) => { if (src) image.src = src; });
    }
    return row;
  }));
}
$('#loadShopItems').addEventListener('click', loadShopItems);
$('#uploadModel').addEventListener('click', async () => {
  const file = $('#modelFile').files[0];
  if (!file) return modelMessage('Chọn file .glb trước.', true);
  if (!requireKey()) return;
  const button = $('#uploadModel');
  button.disabled = true;
  try {
    const result = await uploadModel(file, { name: $('#modelName').value, price: $('#modelPrice').value, base: $('#modelBase').value });
    modelMessage(`Đã thêm ${result.item.name} (${result.item.id}) · ${result.triangles.toLocaleString('vi-VN')} tam giác · động tác: ${(result.item.clips || []).join(', ')}. Đã hiện trong Shop.`);
    $('#modelFile').value = '';
    $('#modelName').value = '';
    // Nạp lại danh mục shop để ảnh xem trước có nhân vật mới.
    await (await import('/shop-models.js')).loadShopCharacters({ refresh: true });
    loadShopItems();
  } catch (error) {
    modelMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

// ---- 07 · Kiểm duyệt: sổ khóa (mở khóa) và từ cấm quản trị thêm/bỏ ----
const modBans = $('#modBans');
const modStatus = $('#modStatus');
const modWord = $('#modWord');
function modMessage(text, error = false) {
  modStatus.textContent = text;
  modStatus.classList.toggle('error', error);
}
function modEmpty(text) {
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = text;
  modBans.replaceChildren(empty);
}
async function moderationRequest(path, body) {
  const response = await fetch(`/api/v1/admin/moderation${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-admin-key': key.value, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 403) throw new Error('Khóa quản trị không đúng.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Không thực hiện được.'), { data });
  return data;
}
const when = (at) => (at ? new Date(at).toLocaleString('vi-VN') : 'khi mở khóa');
function renderModeration({ bans = [], words = [] }) {
  const blocked = words.filter((row) => row.action === 'block').map((row) => row.word);
  const allowed = words.filter((row) => row.action === 'allow').map((row) => row.word);
  $('#modWords').textContent = `Chặn thêm: ${blocked.join(', ') || '—'} · Bỏ chặn từ mặc định: ${allowed.join(', ') || '—'}`;
  if (!bans.length) {
    modEmpty('Chưa ai bị khóa hay tắt chat.');
    return;
  }
  modBans.replaceChildren(...bans.map((ban) => {
    const card = document.createElement('article');
    card.className = `prayer-admin-card support-card${ban.active ? ' is-new' : ''}`;
    const info = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = `${ban.kind === 'ban' ? '⛔ Khóa nick' : '🔇 Tắt chat'} · ${ban.name}${ban.ipBlocked ? ' · chặn IP' : ''}`;
    const meta = document.createElement('p');
    meta.textContent = [`${when(ban.createdAt)} → ${when(ban.expiresAt)}`, ban.roomId, ban.createdBy].filter(Boolean).join(' · ');
    const code = document.createElement('p');
    code.textContent = ban.liftedAt ? `${ban.id} · đã mở ${when(ban.liftedAt)} (${ban.liftedBy})` : ban.active ? ban.id : `${ban.id} · đã hết hạn`;
    info.append(heading, meta, code);
    const content = document.createElement('p');
    content.className = 'support-message';
    content.textContent = `${ban.reason}${ban.evidence ? `\nTin: "${ban.evidence}"` : ''}`;
    card.append(info, content);
    if (ban.active) {
      const lift = document.createElement('button');
      lift.type = 'button';
      lift.className = 'secondary';
      lift.textContent = 'Mở khóa';
      lift.addEventListener('click', async () => {
        lift.disabled = true;
        try {
          await moderationRequest('/unban', { target: ban.id });
          modMessage(`Đã mở khóa ${ban.name}.`);
          loadModeration();
        } catch (error) {
          modMessage(error.message, true);
          lift.disabled = false;
        }
      });
      card.append(lift);
    }
    return card;
  }));
}
async function loadModeration() {
  if (!key.value) {
    modMessage('Nhập khóa quản trị (mục 08) trước.', true);
    key.focus();
    return;
  }
  sessionStorage.setItem('thien-admin-key', key.value);
  try {
    renderModeration(await moderationRequest(''));
  } catch (error) {
    modEmpty(error.message);
    modMessage(error.message, true);
  }
}
async function changeWord(action) {
  const word = modWord.value.trim();
  if (!word) return modWord.focus();
  if (!key.value) return modMessage('Nhập khóa quản trị (mục 08) trước.', true);
  try {
    const result = await moderationRequest('/words', { word, action });
    modMessage(action === 'block' ? (result.already ? `«${result.word}» đã có trong danh sách mặc định.` : `Đã chặn «${result.word}» (hiệu lực trong ~15 giây).`) : `Đã bỏ chặn «${result.word}».`);
    modWord.value = '';
    loadModeration();
  } catch (error) {
    const code = error.data?.error;
    modMessage(code === 'INVALID_WORD' ? 'Từ không hợp lệ (1–40 ký tự chữ/số, * chỉ ở cuối).' : code === 'NOT_FOUND' ? 'Từ này chưa có trong danh sách quản trị thêm.' : error.message, true);
  }
}
$('#loadModeration').addEventListener('click', loadModeration);
$('#blockWord').addEventListener('click', () => changeWord('block'));
$('#unblockWord').addEventListener('click', () => changeWord('remove'));
