// Bảng các công trình chung. Snapshot công khai dùng chung mọi phòng; đóng góp chỉ gửi mã công trình và
// tên hành động, điểm cùng tiến độ luôn lấy từ server. Mọi chữ người dùng đều đi qua textContent.
import { onLangChange, t } from '/thien-i18n.js';

const POLL_MS = 20_000;
const ACTIONS = ['dig', 'water', 'tend'];
const STAGES = ['ground', 'sprout', 'young', 'mature', 'complete'];
const PROJECT_META = {
  bodhi: { icon: '🌳', stageIcons: ['🟤', '🌱', '🌿', '🌳', '🎊'] },
  lotus: { icon: '🪷', stageIcons: ['🟫', '💧', '🪨', '🪷', '🐟'] },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createCommunityProjectUI({ stage, chip, account, openSignIn, showToast, applyProject, onContribution }) {
  const projects = new Map();
  let meByProject = {};
  let selectedId = null;
  let actions = {};
  let busy = false;
  let timer = null;

  const overlay = el('section', 'community-project-sheet');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  stage.append(overlay);

  const selected = () => projects.get(selectedId) || projects.values().next().value || null;
  const textKey = (project, suffix) => project?.kind === 'lotus' ? `project.lotus.${suffix}` : `project.${suffix}`;
  const projectText = (project, suffix, values) => t(textKey(project, suffix), values);

  function close() {
    overlay.hidden = true;
  }

  function updateChip() {
    const list = [...projects.values()];
    const done = list.filter((project) => project.completed).length;
    chip.textContent = list.length ? `🏗 ${done}/${list.length}` : `🏗 ${t('project.kicker')}`;
    chip.title = t('project.open');
    chip.setAttribute('aria-label', t('project.open'));
  }

  function projectTabs() {
    const tabs = el('div', 'community-project-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const project of projects.values()) {
      const meta = PROJECT_META[project.kind] || PROJECT_META.bodhi;
      const button = el('button', project.id === selectedId ? 'active' : '');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(project.id === selectedId));
      button.append(el('b', '', `${meta.icon} ${projectText(project, 'title')}`), el('small', '', `${project.percent}%`));
      button.addEventListener('click', () => {
        selectedId = project.id;
        try { localStorage.setItem('community-project-selected', selectedId); } catch {}
        render();
      });
      tabs.append(button);
    }
    return tabs;
  }

  function stepper(project) {
    const current = Math.max(0, STAGES.indexOf(project?.stage));
    const icons = (PROJECT_META[project?.kind] || PROJECT_META.bodhi).stageIcons;
    const list = el('ol', 'community-project-steps');
    STAGES.forEach((name, index) => {
      const item = el('li', index < current ? 'done' : index === current ? 'now' : '');
      item.append(el('span', 'community-project-stage-icon', icons[index]), el('span', '', projectText(project, `stage.${name}`)));
      list.append(item);
    });
    return list;
  }

  function render() {
    updateChip();
    if (overlay.hidden) return;
    const project = selected();
    const me = project ? meByProject[project.id] : null;
    const closeButton = el('button', 'social-close', '✕');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', t('close'));
    closeButton.addEventListener('click', close);
    const header = el('header', 'community-project-head');
    header.append(el('div', '', ''), closeButton);
    header.firstChild.append(el('small', '', t('project.kicker')), el('h2', '', project ? projectText(project, 'title') : t('project.kicker')));
    if (!project) {
      overlay.replaceChildren(header, el('p', 'community-project-note', t('project.loading')));
      return;
    }
    const bar = el('div', 'community-project-bar');
    const fill = el('i');
    fill.style.width = `${project.percent}%`;
    bar.append(fill);
    const progress = el('div', 'community-project-progress');
    progress.append(el('b', '', `${project.progress.toLocaleString()} / ${project.target.toLocaleString()}`), el('span', '', `${project.percent}%`));
    const stats = el('div', 'community-project-stats');
    stats.append(
      el('span', '', t('project.contributors', { n: project.contributors })),
      el('span', '', t('project.contributions', { n: project.contributions })),
    );
    const content = [header, projectTabs(), el('p', 'community-project-note', projectText(project, 'description')), stepper(project), progress, bar, stats];
    if (project.completed) {
      content.push(el('div', 'community-project-complete', `🎊 ${projectText(project, 'completed')}`));
    } else if (!account()) {
      const signIn = el('button', 'community-project-signin', t('project.signIn'));
      signIn.type = 'button';
      signIn.addEventListener('click', () => { close(); openSignIn?.(); });
      content.push(el('p', 'community-project-note', projectText(project, 'signInNote')), signIn);
    } else {
      const buttons = el('div', 'community-project-actions');
      for (const action of ACTIONS) {
        const done = me?.today?.includes(action);
        const button = el('button', done ? 'done' : '');
        button.type = 'button';
        button.disabled = busy || done;
        const label = projectText(project, `action.${action}`);
        button.append(
          el('b', '', done ? `✓ ${label}` : label),
          el('small', '', done ? t('project.doneToday') : `+${actions[action]?.points || 0}`),
        );
        button.addEventListener('click', () => contribute(project.id, action));
        buttons.append(button);
      }
      content.push(el('h3', '', t('project.helpToday')), buttons);
      if (me?.contributions) content.push(el('p', 'community-project-mine', `🏅 ${projectText(project, 'mine', { n: me.total })}`));
    }
    overlay.replaceChildren(...content);
  }

  function apply(data) {
    const incoming = Array.isArray(data?.projects) ? data.projects : data?.project ? [data.project] : [];
    for (const project of incoming) {
      projects.set(project.id, project);
      applyProject(project);
    }
    if (!selectedId || !projects.has(selectedId)) {
      try { selectedId = localStorage.getItem('community-project-selected'); } catch {}
      if (!projects.has(selectedId)) selectedId = projects.values().next().value?.id || null;
    }
    if (data?.meByProject) meByProject = data.meByProject;
    else if ('me' in (data || {}) && data.project) meByProject[data.project.id] = data.me;
    if (data?.actions) actions = data.actions;
    render();
  }

  async function load() {
    try {
      const response = await fetch('/api/v1/community-project', { credentials: 'same-origin' });
      if (response.ok) apply(await response.json());
    } catch {}
  }

  async function contribute(projectId, action) {
    if (busy || !account()) return;
    busy = true;
    render();
    const key = crypto.randomUUID();
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
      try {
        const response = await fetch('/api/v1/community-project/contribute', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify({ projectId, action }),
        });
        result = await response.json();
      } catch {}
    }
    busy = false;
    if (!result) showToast(t('project.err.NETWORK'));
    else if (!result.ok) showToast(t(`project.err.${result.code}`));
    else {
      apply(result);
      onContribution?.(result.project);
      showToast(t('project.thanks', { n: result.points }));
    }
    render();
  }

  chip.addEventListener('click', () => {
    overlay.hidden = false;
    render();
    load();
  });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  onLangChange(render);
  updateChip();

  return {
    start() {
      load();
      clearInterval(timer);
      timer = setInterval(load, POLL_MS);
    },
    accountChanged() {
      meByProject = {};
      load();
    },
    onMessage(message) {
      if (message.type !== 'community.project') return false;
      apply({ project: message.project });
      return true;
    },
    state() { return selected(); },
    states() { return [...projects.values()]; },
  };
}
