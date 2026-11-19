// Trang pháp lý (/dieu-khoan.html, /quyen-rieng-tu.html): chọn bản tiếng Việt hoặc tiếng Anh theo ?lang=, ngôn ngữ đã chọn
// ở chánh điện (localStorage thien-lang) hoặc trình duyệt; zh / es xem bản tiếng Anh. Link #mục dùng id tiếng Việt; bản
// tiếng Anh khai báo cùng tên ở data-alias để link vẫn tới đúng mục.
const docs = { vi: document.getElementById('doc-vi'), en: document.getElementById('doc-en') };
const buttons = [...document.querySelectorAll('[data-lang]')];

function initialLang() {
  const asked = new URLSearchParams(location.search).get('lang');
  let remembered = null;
  try { remembered = localStorage.getItem('thien-lang'); } catch {}
  const browser = (navigator.languages || [navigator.language])[0];
  return String(asked || remembered || browser || 'vi').slice(0, 2).toLowerCase() === 'vi' ? 'vi' : 'en';
}

function goToHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!/^[\w-]{1,40}$/.test(id)) return;
  const visible = Object.values(docs).find((doc) => !doc.hidden);
  visible.querySelector(`[id="${id}"], [data-alias="${id}"]`)?.scrollIntoView();
}

function show(lang) {
  for (const [key, doc] of Object.entries(docs)) doc.hidden = key !== lang;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  for (const node of document.querySelectorAll('[data-text-vi]')) node.textContent = lang === 'vi' ? node.dataset.textVi : node.dataset.textEn;
  document.documentElement.lang = lang;
  document.title = docs[lang].dataset.title;
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
}

for (const button of buttons) button.addEventListener('click', () => show(button.dataset.lang));

// Quay lại trang trước nếu đến từ trang cùng site (chánh điện mở trang này ở tab mới thì về trang chủ).
document.getElementById('back').addEventListener('click', (event) => {
  let sameSite = false;
  try { sameSite = new URL(document.referrer).origin === location.origin; } catch {}
  if (sameSite && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});

show(initialLang());
goToHash();
