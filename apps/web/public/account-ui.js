// Tài khoản ở chánh điện: đăng nhập tên/mật khẩu hoặc Google, hồ sơ công đức, lịch sử, bảng xếp hạng cộng đồng.
// Phiên đăng nhập là cookie HttpOnly do API đặt; trang chỉ biết tài khoản qua /api/v1/me.
import { avatarNode, levelName, nameWithBadge, rankBadge } from '/badges.js';
import { lang, locale, onLangChange, t } from '/thien-i18n.js';
// Giờ trong lịch sử theo múi giờ của máy người xem; số theo ngôn ngữ đang dùng.
const formatTime = (at) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(at);
const formatNumber = (value) => new Intl.NumberFormat(locale()).format(value);

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const known = data.error && t(`apiErr.${data.error}`);
    const error = new Error(known && known !== `apiErr.${data.error}` ? known : data.message || t('acct.network'));
    error.status = response.status;
    throw error;
  }
  return data;
}

function openDialog(dialog, focus) {
  for (const other of document.querySelectorAll('.ledger')) if (other !== dialog) other.hidden = true;
  dialog.hidden = false;
  focus?.focus();
}

export function createAccountUI({ onChange, showToast }) {
  const ui = {
    meChip: $('meChip'),
    gateSignedOut: $('gateSignedOut'),
    gateSignedIn: $('gateSignedIn'),
    gateAvatar: $('gateAvatar'),
    gateName: $('gateName'),
    gateLevel: $('gateLevel'),
    auth: $('authDialog'),
    authForm: $('authForm'),
    authTitle: $('authTitle'),
    authTabs: $('authTabs'),
    authName: $('authName'),
    authNameRow: $('authNameRow'),
    authUser: $('authUser'),
    authPass: $('authPass'),
    authError: $('authError'),
    authSubmit: $('authSubmit'),
    google: $('googleBox'),
    googleButton: $('googleButton'),
    profile: $('profileDialog'),
    profileHead: $('profileHead'),
    levelName: $('levelName'),
    levelBar: $('levelBar'),
    levelNext: $('levelNext'),
    stats: $('profileStats'),
    history: $('historyList'),
    historyMore: $('historyMore'),
    logout: $('logout'),
    rank: $('rankDialog'),
    rankTabs: $('rankTabs'),
    rankPeriod: $('rankPeriod'),
    rankList: $('rankList'),
    rankMe: $('rankMe'),
  };
  let account = null;
  let mode = 'login';
  let board = { metric: 'merit', period: 'all' };
  let historyBefore = null;
  let config = { accounts: false, googleClientId: null };

  function showLoginReward(reward) {
    const unlocked = reward?.unlocked?.[0];
    const next = reward?.rewards?.find((item) => !item.claimed);
    if (reward?.achievement?.newlyUnlocked) showToast(t('login.achievement', {
      title: t(`title.${reward.achievement.id === 'steadfast-practitioner' ? 'steadfastPractitioner' : reward.achievement.id}`),
      frame: t(`frame.${reward.achievement.frame === 'seven-day-lotus' ? 'sevenDayLotus' : reward.achievement.frame}`),
    }));
    else if (unlocked) showToast(t('login.unlocked', { day: reward.totalDays, skin: t(`skin.${unlocked.skin}`) }));
    else if (reward?.newDay && next) showToast(t('login.checked', { day: reward.totalDays, left: Math.max(0, next.days - reward.totalDays), skin: t(`skin.${next.skin}`) }));
    else if (reward?.newDay) showToast(t('login.complete', { day: reward.totalDays }));
    else return false;
    return true;
  }

  function setAccount(next, notify = true) {
    const changed = (next?.id || null) !== (account?.id || null);
    account = next;
    if (account) ui.meChip.replaceChildren(avatarNode(account, 'avatar small'));
    else ui.meChip.textContent = t('acct.signIn');
    ui.meChip.classList.toggle('signed-in', Boolean(account));
    ui.meChip.title = account ? t('acct.chipTitle', { name: account.displayName }) : t('acct.chipGuest');
    ui.meChip.hidden = !config.accounts;
    ui.gateSignedOut.hidden = Boolean(account) || !config.accounts;
    ui.gateSignedIn.hidden = !account;
    if (account) {
      ui.gateAvatar.replaceChildren(avatarNode(account));
      ui.gateName.textContent = account.displayName;
    }
    if (changed && notify) onChange(account);
  }

  async function refresh() {
    try {
      const data = await api('/api/v1/me');
      setAccount(data.account, false);
      ui.gateName.replaceChildren(nameWithBadge(data.account.displayName, { level: data.stats.level.level, title: data.account.title }, 'span'));
      ui.gateLevel.textContent = t('acct.gateLevel', { level: levelName(data.stats.level.level), merit: formatNumber(data.stats.merit), streak: data.stats.streak });
      showLoginReward(data.loginReward);
      return data;
    } catch (error) {
      if (error.status === 401) setAccount(null, false);
      return null;
    }
  }

  // ---- Đăng nhập / đăng ký ----
  function showAuth(next = 'login') {
    mode = next;
    for (const tab of ui.authTabs.querySelectorAll('button')) tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    ui.authTitle.textContent = mode === 'login' ? t('acct.signIn') : t('acct.createTitle');
    ui.authNameRow.hidden = mode !== 'register';
    ui.authPass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    ui.authSubmit.textContent = mode === 'login' ? t('acct.signIn') : t('acct.register');
    ui.authError.textContent = '';
    openDialog(ui.auth, ui.authUser);
  }

  async function signedIn(data, message) {
    ui.auth.hidden = true;
    ui.authPass.value = '';
    setAccount(data.account);
    if (!showLoginReward(data.loginReward)) showToast(message);
    await refresh();
  }

  ui.authTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('button[data-mode]');
    if (tab) showAuth(tab.dataset.mode);
  });
  ui.authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    ui.authSubmit.disabled = true;
    ui.authError.textContent = '';
    try {
      const body = { username: ui.authUser.value.trim(), password: ui.authPass.value };
      if (mode === 'register') body.displayName = ui.authName.value.trim();
      const data = await api(`/api/v1/auth/${mode}`, { method: 'POST', body });
      await signedIn(data, mode === 'login' ? t('acct.welcomeBack', { name: data.account.displayName }) : t('acct.created', { name: data.account.displayName }));
    } catch (error) {
      ui.authError.textContent = error.message;
    } finally {
      ui.authSubmit.disabled = false;
    }
  });

  // Nút Google chỉ hiện khi máy chủ có GOOGLE_CLIENT_ID; script của Google chỉ tải lúc đó.
  function setupGoogle(clientId) {
    ui.google.hidden = false;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.addEventListener('load', () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: async ({ credential }) => {
          try {
            const data = await api('/api/v1/auth/google', { method: 'POST', body: { credential } });
            await signedIn(data, t('acct.welcome', { name: data.account.displayName }));
          } catch (error) {
            ui.authError.textContent = error.message;
          }
        },
      });
      window.google.accounts.id.renderButton(ui.googleButton, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: lang(), width: 260 });
    });
    script.addEventListener('error', () => { ui.google.hidden = true; });
    document.head.append(script);
  }

  // ---- Hồ sơ ----
  function stat(value, label, note) {
    const item = document.createElement('div');
    const number = document.createElement('b');
    number.textContent = value;
    const caption = document.createElement('span');
    caption.textContent = label;
    item.append(number, caption);
    if (note) {
      const small = document.createElement('small');
      small.textContent = note;
      item.append(small);
    }
    return item;
  }

  function historyRow(entry) {
    const item = document.createElement('li');
    const what = document.createElement('span');
    what.textContent = t(`hist.${entry.kind}`);
    if (entry.text) {
      const prayer = document.createElement('small');
      prayer.textContent = entry.text;
      what.append(prayer);
    }
    const when = document.createElement('time');
    when.dateTime = new Date(entry.at).toISOString();
    when.textContent = formatTime(entry.at);
    const merit = document.createElement('b');
    merit.textContent = entry.counted ? `+${entry.merit}` : '+0';
    if (!entry.counted) merit.title = t('acct.overCap');
    item.append(what, when, merit);
    return item;
  }

  async function loadHistory(reset) {
    if (reset) {
      historyBefore = null;
      ui.history.replaceChildren();
    }
    const data = await api(`/api/v1/me/history${historyBefore ? `?before=${historyBefore}` : ''}`);
    ui.history.append(...data.items.map(historyRow));
    if (!ui.history.children.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = t('acct.historyEmpty');
      ui.history.append(empty);
    }
    historyBefore = data.items.at(-1)?.id || null;
    ui.historyMore.hidden = data.items.length < 30;
  }

  async function showProfile() {
    openDialog(ui.profile, $('profileClose'));
    const data = await refresh();
    if (!data) {
      ui.profile.hidden = true;
      showAuth('login');
      return;
    }
    const { stats } = data;
    const name = document.createElement('div');
    const title = nameWithBadge(account.displayName, { level: stats.level.level, title: account.title }, 'h2');
    const sub = document.createElement('small');
    sub.textContent = account.provider === 'google' ? (account.email || t('acct.googleAccount')) : `@${account.username}`;
    name.append(title, sub);
    ui.profileHead.replaceChildren(avatarNode(account, 'avatar large'), name);
    ui.levelName.textContent = t('acct.level', { n: stats.level.level, name: levelName(stats.level.level) });
    ui.levelBar.style.width = `${Math.round(stats.level.progress * 100)}%`;
    ui.levelNext.textContent = stats.level.next
      ? t('acct.toNext', { points: formatNumber(stats.level.next.min - stats.merit), name: levelName(stats.level.next.level) })
      : t('acct.maxLevel');
    ui.stats.replaceChildren(
      stat(formatNumber(stats.merit), t('acct.totalMerit')),
      stat(formatNumber(stats.incense), t('acct.incense')),
      stat(`${stats.streak}`, t('acct.streak'), t('acct.best', { n: stats.bestStreak })),
      stat(`${stats.activeDays}`, t('acct.activeDays')),
    );
    await loadHistory(true).catch(() => {});
  }

  // ---- Bảng xếp hạng cộng đồng ----
  async function showRanking() {
    openDialog(ui.rank, $('rankClose'));
    for (const tab of ui.rankTabs.querySelectorAll('button')) tab.setAttribute('aria-selected', String(tab.dataset.metric === board.metric));
    for (const tab of ui.rankPeriod.querySelectorAll('button')) tab.setAttribute('aria-selected', String(tab.dataset.period === board.period));
    ui.rankPeriod.hidden = board.metric === 'streak';
    ui.rankList.replaceChildren();
    try {
      const data = await api(`/api/v1/leaderboard?metric=${board.metric}&period=${board.period}`);
      ui.rankList.replaceChildren(...data.rows.map((row) => {
        const item = document.createElement('li');
        if (row.accountId === account?.id) item.className = 'me';
        const rank = document.createElement('i');
        rank.append(rankBadge(row.rank, { compact: true }) || document.createTextNode(String(row.rank)));
        const name = nameWithBadge(row.displayName, { level: row.level }, 'span');
        const value = document.createElement('b');
        value.textContent = `${formatNumber(row.value)} ${t(`unit.${data.metric}`)}`;
        item.append(rank, avatarNode(row, 'avatar small'), name, value);
        return item;
      }));
      if (!data.rows.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = t('rank.empty');
        ui.rankList.append(empty);
      }
      ui.rankMe.textContent = !account ? t('rank.guest')
        : data.me ? t('rank.me', { n: data.me }) : t('rank.notTop');
    } catch (error) {
      ui.rankMe.textContent = error.message;
    }
  }

  ui.rankTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('button[data-metric]');
    if (!tab) return;
    board = { ...board, metric: tab.dataset.metric };
    showRanking();
  });
  ui.rankPeriod.addEventListener('click', (event) => {
    const tab = event.target.closest('button[data-period]');
    if (!tab) return;
    board = { ...board, period: tab.dataset.period };
    showRanking();
  });

  // ---- Nút chung ----
  ui.meChip.addEventListener('click', () => (account ? showProfile() : showAuth('login')));
  ui.gateSignedOut.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-auth]');
    if (button) showAuth(button.dataset.auth);
  });
  for (const button of document.querySelectorAll('[data-open-ranking]')) button.addEventListener('click', showRanking);
  ui.historyMore.addEventListener('click', () => loadHistory(false).catch(() => {}));
  ui.logout.addEventListener('click', async () => {
    await api('/api/v1/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    ui.profile.hidden = true;
    setAccount(null);
    showToast(t('acct.signedOut'));
  });
  $('gateLogout').addEventListener('click', ui.logout.click.bind(ui.logout));
  for (const dialog of [ui.auth, ui.profile, ui.rank]) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.hidden = true;
    });
  }

  // Đổi ngôn ngữ ở cổng vào: viết lại chữ của nút tài khoản và dòng cấp độ.
  onLangChange(() => {
    setAccount(account, false);
    if (account) refresh();
  });

  return {
    get account() { return account; },
    async start() {
      try {
        config = await api('/api/v1/auth/config');
      } catch {}
      if (config.googleClientId) setupGoogle(config.googleClientId);
      setAccount(null, false);
      if (config.accounts) await refresh();
      return account;
    },
    refresh,
  };
}
