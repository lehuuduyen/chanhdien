// Tràng hạt niệm Phật: vòng 108 hạt, mỗi lần chạm (hoặc phím Cách / Enter) là một hạt, một câu niệm. Hạt đang lần
// luôn nằm ở đáy vòng (vòng xoay theo), hạt mẫu đỏ có tua ở chỗ giáp vòng. Đủ 108 hạt là tròn một chuỗi (chuông).
// Số hạt, số chuỗi, câu niệm, niệm thành tiếng hay thầm được nhớ trên máy.
import { lang, onLangChange, t } from '/thien-i18n.js';

const BEADS = 108;
const SVG = 'http://www.w3.org/2000/svg';
const STORE = 'thien-mala';
const PHRASES = {
  vi: ['Nam mô A Di Đà Phật', 'A Di Đà Phật', 'Nam mô Quán Thế Âm Bồ Tát', 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật'],
  en: ['Namo Amitabha Buddha', 'Amitabha', 'Namo Avalokiteshvara', 'Namo Shakyamuni Buddha'],
  zh: ['南無阿彌陀佛', '阿彌陀佛', '南無觀世音菩薩', '南無本師釋迦牟尼佛'],
  es: ['Namo Buda Amitabha', 'Amitabha', 'Namo Avalokiteshvara', 'Namo Buda Shakyamuni'],
};

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE));
    if (value && Number.isInteger(value.count) && Number.isInteger(value.round)) return value;
  } catch {}
  return { count: 0, round: 1, phrase: 0, voice: false };
}

export function createMala({ stage, audio, showToast, onOpenChange }) {
  let state = load();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };

  const sheet = document.createElement('section');
  sheet.className = 'mala';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'mala-back';
  const title = document.createElement('h2');
  const description = document.createElement('p');
  description.className = 'mala-desc';

  // Vòng hạt (SVG 400×400): nhóm hạt xoay để hạt đang lần ở đáy.
  const ring = svg('svg', { viewBox: '0 0 400 400', class: 'mala-ring', role: 'button', tabindex: '0' });
  const glow = svg('circle', { cx: 200, cy: 352, r: 26, class: 'mala-glow' });
  const beadsGroup = svg('g', { class: 'mala-beads' });
  const beads = [];
  for (let index = 0; index < BEADS; index += 1) {
    const angle = Math.PI / 2 + (index * Math.PI * 2) / BEADS;
    const bead = svg('circle', { cx: 200 + Math.cos(angle) * 152, cy: 200 + Math.sin(angle) * 152, r: 5.6, class: 'mala-bead' });
    beads.push(bead);
    beadsGroup.append(bead);
  }
  // Hạt mẫu (đỏ, có tua) giữa hạt cuối và hạt đầu.
  const guruAngle = Math.PI / 2 - Math.PI / BEADS;
  const gx = 200 + Math.cos(guruAngle) * 152;
  const gy = 200 + Math.sin(guruAngle) * 152;
  const guru = svg('g', { class: 'mala-guru' });
  guru.append(
    svg('path', { d: `M${gx} ${gy + 10} l-6 22 l6 -4 l6 4 z`, class: 'mala-tassel' }),
    svg('circle', { cx: gx, cy: gy, r: 11, class: 'mala-guru-bead' }),
  );
  beadsGroup.append(guru);
  const roundText = svg('text', { x: 200, y: 150, class: 'mala-round' });
  const countText = svg('text', { x: 200, y: 214, class: 'mala-count' });
  const phraseText = svg('text', { x: 200, y: 258, class: 'mala-phrase' });
  ring.append(glow, beadsGroup, roundText, countText, phraseText);

  const hint = document.createElement('p');
  hint.className = 'mala-hint';
  const phrases = document.createElement('div');
  phrases.className = 'mala-phrases';
  const tools = document.createElement('div');
  tools.className = 'mala-tools';
  const voiceToggle = document.createElement('button');
  voiceToggle.type = 'button';
  voiceToggle.className = 'chip';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'chip';
  tools.append(voiceToggle, reset);
  sheet.append(back, title, description, ring, hint, phrases, tools);
  stage.append(sheet);

  const phraseList = () => PHRASES[lang()] || PHRASES.vi;
  function render() {
    back.textContent = `‹ ${t('mala.back')}`;
    title.textContent = t('mala.title');
    description.textContent = t('mala.desc');
    hint.textContent = t('mala.hint');
    roundText.textContent = t('mala.round', { n: state.round });
    countText.replaceChildren(document.createTextNode(String(state.count)));
    const total = svg('tspan', { class: 'mala-total', dx: 6 });
    total.textContent = `/ ${BEADS}`;
    countText.append(total);
    phraseText.textContent = phraseList()[state.phrase] || phraseList()[0];
    phrases.replaceChildren(...phraseList().map((text, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `mala-chip${index === state.phrase ? ' active' : ''}`;
      chip.textContent = text;
      chip.addEventListener('click', () => {
        state.phrase = index;
        save();
        render();
      });
      return chip;
    }));
    voiceToggle.textContent = state.voice ? `🔊 ${t('mala.voiceOn')}` : `🔈 ${t('mala.voiceOff')}`;
    voiceToggle.setAttribute('aria-pressed', String(state.voice));
    reset.textContent = t('mala.reset');
    // Hạt đã lần sáng hơn; vòng xoay để hạt kế tiếp nằm ở đáy.
    beads.forEach((bead, index) => bead.classList.toggle('done', index < state.count));
    beads.forEach((bead, index) => {
      const current = index === state.count % BEADS;
      bead.classList.toggle('current', current);
      bead.setAttribute('r', current ? 9 : 5.6);
    });
    // Hạt đang lần vẽ sau cùng (trên các hạt bên cạnh), hạt mẫu luôn trên cùng.
    beadsGroup.append(beads[state.count % BEADS], guru);
    beadsGroup.style.transform = `rotate(${(-state.count * 360) / BEADS}deg)`;
  }

  function step() {
    state.count += 1;
    audio.bead?.();
    if (state.voice) audio.speak(phraseList()[state.phrase], true, { now: true });
    if (state.count >= BEADS) {
      state.count = 0;
      state.round += 1;
      audio.offering?.('bell', true);
      showToast(t('mala.done', { n: state.round - 1 }));
    }
    save();
    render();
  }

  function open(next) {
    sheet.hidden = !next;
    if (next) {
      render();
      ring.focus();
    }
    onOpenChange?.(next);
  }

  ring.addEventListener('click', step);
  document.addEventListener('keydown', (event) => {
    if (sheet.hidden || !(event.code === 'Space' || event.code === 'Enter')) return;
    if (event.target.closest?.('button') && event.target !== ring) return;
    event.preventDefault();
    step();
  });
  back.addEventListener('click', () => open(false));
  voiceToggle.addEventListener('click', () => {
    state.voice = !state.voice;
    save();
    render();
  });
  reset.addEventListener('click', () => {
    state = { ...state, count: 0, round: 1 };
    save();
    render();
  });
  onLangChange(() => { if (!sheet.hidden) render(); });
  return { open, get isOpen() { return !sheet.hidden; } };
}
