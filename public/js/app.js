'use strict';
/* App shell: auth, layout, chat list, settings, calls tab, modals */

const App = {
  async boot() {
    applyTheme();
    try { S.config = await API.get('/api/config'); } catch { S.config = {}; }
    if (!API.token) return this.showAuth();
    try {
      const { user } = await API.get('/api/me');
      S.me = putUser(user);
      if (!user.name) return this.showProfileSetup(true);
      this.start();
    } catch (e) {
      if (e.code === 'NETWORK') { this.start(true); return; }
      this.showAuth();
    }
  },

  onUnauthorized() {
    if (!API.token) return;
    API.setToken(null); RT.close(); S.me = null; S.chats.clear(); S.msgs.clear();
    this.showAuth();
  },

  // ---------------- auth ----------------
  showAuth() {
    const root = $('#root');
    root.innerHTML = `
      <div class="auth-top">
        <button class="chip ${LANG === 'fa' ? 'on' : ''}" data-l="fa">فارسی</button>
        <button class="chip ${LANG === 'en' ? 'on' : ''}" data-l="en">English</button>
      </div>
      <div class="auth"><form class="auth-card glass" id="authForm" novalidate>
        <div class="brand"><div class="logo">S</div><div><h1>S-Chat</h1><p>${t('app_tag')}</p></div></div>
        <div id="authStep"></div>
      </form></div>`;
    $$('.auth-top .chip').forEach((b) => b.onclick = () => { setLang(b.dataset.l); this.showAuth(); });
    this.authTarget(this._lastTarget || '');
  },

  authTarget(prefill) {
    const box = $('#authStep');
    box.innerHTML = `
      <div style="display:grid;gap:14px">
        <div><h2 style="margin:0 0 4px;font-size:19px">${t('login_title')}</h2><div class="mut small">${t('login_hint')}</div></div>
        <input class="input" id="tgt" type="text" inputmode="email" autocomplete="username" dir="ltr" placeholder="${t('login_ph')}" value="${esc(prefill)}" required>
        <div class="err" id="aerr"></div>
        <button class="btn block" id="go">${t('send_code')}</button>
      </div>`;
    const inp = $('#tgt'); inp.focus();
    $('#authForm').onsubmit = async (e) => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v) return;
      const btn = $('#go'); btn.disabled = true; $('#aerr').textContent = '';
      try {
        const r = await API.post('/api/auth/start', { target: v });
        this._lastTarget = v;
        this.authCode(r);
      } catch (err) { $('#aerr').textContent = errText(err.code); btn.disabled = false; }
    };
  },

  authCode(r) {
    const box = $('#authStep');
    box.innerHTML = `
      <div style="display:grid;gap:14px">
        <div class="small">${esc(t(r.channel === 'email' ? 'code_sent_email' : 'code_sent_sms', { t: r.target }))}
          <button type="button" class="chip" id="chg" style="margin-inline-start:6px">${t('change')}</button></div>
        ${r.dev_code ? `<div class="banner">${t('dev_code', { c: r.dev_code })}</div>` : ''}
        <input class="input code-in" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${t('code_ph')}">
        <div class="err" id="aerr"></div>
        <button class="btn block" id="go">${t('verify')}</button>
        <button type="button" class="btn ghost block" id="resend" disabled></button>
      </div>`;
    const code = $('#code'); code.focus();
    $('#chg').onclick = () => this.authTarget(r.target);
    let left = 60; const rs = $('#resend');
    const tick = () => {
      if (!document.body.contains(rs)) return clearInterval(iv);
      if (left > 0) { rs.textContent = t('resend_in', { s: fmt.num(left--) }); rs.disabled = true; }
      else { rs.textContent = t('resend'); rs.disabled = false; clearInterval(iv); }
    };
    const iv = setInterval(tick, 1000); tick();
    rs.onclick = async () => {
      try { const r2 = await API.post('/api/auth/start', { target: r.target }); this.authCode(r2); } catch (err) { $('#aerr').textContent = errText(err.code); }
    };
    const submit = async () => {
      const c = code.value.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '');
      if (c.length !== 6) return;
      $('#go').disabled = true; $('#aerr').textContent = '';
      try {
        const res = await API.post('/api/auth/verify', { target: r.target, code: c, device: deviceName() });
        API.setToken(res.token);
        S.me = putUser(res.user);
        if (res.is_new) this.showProfileSetup(true); else this.start();
      } catch (err) { $('#aerr').textContent = errText(err.code); $('#go').disabled = false; code.select(); }
    };
    code.oninput = () => { if (code.value.replace(/\D/g, '').length + (code.value.match(/[۰-۹]/g) || []).length >= 6) submit(); };
    $('#authForm').onsubmit = (e) => { e.preventDefault(); submit(); };
  },

  showProfileSetup(first) {
    const root = $('#root');
    const me = S.me;
    root.innerHTML = `
      <div class="auth"><form class="auth-card glass" id="pf" novalidate>
        <div style="text-align:center;display:grid;gap:6px;justify-items:center">
          <label style="cursor:pointer;position:relative" title="${t('change_photo')}">
            <div id="pfAv">${avatar(me, 'xl')}</div>
            <span class="ibtn solid" style="position:absolute;bottom:0;inset-inline-end:0;width:38px;height:38px">${icon('cam')}</span>
            <input type="file" accept="image/*" id="pfFile" hidden>
          </label>
          <h2 style="margin:6px 0 0;font-size:20px">${t('profile_title')}</h2>
          <div class="mut small">${t('profile_hint')}</div>
        </div>
        <label class="f">${t('name')}<input class="input" id="pfName" maxlength="64" placeholder="${t('name_ph')}" value="${esc(me.name)}" autocomplete="name"></label>
        <label class="f">${t('username')}<input class="input" id="pfUser" dir="ltr" maxlength="32" placeholder="@username" value="${esc(me.username || '')}" autocapitalize="off" spellcheck="false"><span class="mut small" style="font-weight:400">${t('username_hint')}</span></label>
        <div class="err" id="perr"></div>
        <button class="btn block">${t(first ? 'continue' : 'save')}</button>
      </form></div>`;
    let avatarId;
    $('#pfFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const blob = await Media.squareAvatar(f);
        const up = await API.upload(blob, 'avatar.jpg');
        avatarId = up.id;
        $('#pfAv').innerHTML = avatar({ ...me, avatar: up.url }, 'xl');
      } catch (err) { $('#perr').textContent = errText(err.code); }
    };
    $('#pfName').focus();
    $('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const body = { name: $('#pfName').value, username: $('#pfUser').value };
      if (avatarId) body.avatar_file = avatarId;
      try {
        const { user } = await API.patch('/api/me', body);
        S.me = putUser(user);
        this.start();
      } catch (err) { $('#perr').textContent = errText(err.code); }
    };
  },

  // ---------------- main shell ----------------
  start(offline) {
    const root = $('#root');
    root.innerHTML = `
      <div class="app" id="app">
        <nav class="rail glass" aria-label="S-Chat">
          <div class="logo">S</div>
          <button class="ibtn" data-tab="chats" title="${t('chats')}">${icon('chat')}<span class="badge" id="railBadge" hidden></span></button>
          <button class="ibtn" data-tab="calls" title="${t('calls')}">${icon('phone')}</button>
          <button class="ibtn" data-tab="settings" title="${t('settings')}">${icon('settings')}</button>
          <div class="sp"></div>
          <button class="ibtn" id="railMe" title="${t('profile')}"></button>
        </nav>
        <section class="panel list-panel glass" id="listPanel"></section>
        <section class="panel chat-panel glass" id="chatPanel"></section>
        <nav class="bnav glass">
          <button data-tab="chats">${icon('chat')}<span>${t('chats')}</span><span class="badge" id="bnavBadge" hidden></span></button>
          <button data-tab="calls">${icon('phone')}<span>${t('calls')}</span></button>
          <button data-tab="settings">${icon('settings')}<span>${t('settings')}</span></button>
        </nav>
      </div>`;
    $$('[data-tab]').forEach((b) => b.onclick = () => this.setTab(b.dataset.tab));
    $('#railMe').onclick = () => this.setTab('settings');
    this.renderRailMe();
    Chat.renderEmpty();
    this.setTab(S.tab);
    this.loadChats();
    RT.connect();
    Push.init();
    this.handleDeepLink();
  },

  renderRailMe() { const b = $('#railMe'); if (b && S.me) b.innerHTML = avatar(S.me, 'sm'); },

  setTab(tab) {
    S.tab = tab;
    $$('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'chats') this.renderList();
    else if (tab === 'calls') Calls.renderTab();
    else Settings.render();
  },

  async loadChats() {
    try {
      const { chats } = await API.get('/api/chats');
      const ids = new Set(chats.map((c) => c.id));
      for (const id of [...S.chats.keys()]) if (!ids.has(id) && !(S.chats.get(id).pinned)) S.chats.delete(id);
      chats.forEach(putChat);
      if (S.tab === 'chats') this.renderList();
      this.updateBadges();
      if (S.cur && S.chats.has(S.cur)) Chat.renderHeader();
    } catch (e) { if (e.code === 'NETWORK') setTimeout(() => this.loadChats(), 4000); }
  },

  async handleDeepLink() {
    const p = location.pathname;
    const params = new URLSearchParams(location.search);
    const join = p.match(/^\/join\/([A-Za-z0-9_-]+)/);
    if (join) { history.replaceState(null, '', '/'); Modals.joinGroup(join[1]); }
    const u = p.match(/^\/u\/([a-z0-9_]+)/i);
    if (u) {
      history.replaceState(null, '', '/');
      try { const { users } = await API.get('/api/users/search?q=' + encodeURIComponent(u[1])); const x = users.find((y) => y.username === u[1].toLowerCase()); if (x) this.openDirect(x); } catch {}
    }
    if (params.get('chat')) { history.replaceState(null, '', '/'); const id = Number(params.get('chat')); setTimeout(() => Chat.open(id), 300); }
  },

  updateBadges() {
    let n = 0;
    for (const c of S.chats.values()) if (!c.muted && !c.archived) n += c.unread || 0;
    for (const id of ['railBadge', 'bnavBadge']) {
      const el = $('#' + id); if (!el) continue;
      el.hidden = !n; el.textContent = n > 99 ? '99+' : fmt.num(n);
    }
    document.title = (n ? `(${n}) ` : '') + 'S-Chat';
    if (navigator.setAppBadge) { try { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch {} }
  },

  connState() {
    const panel = $('#chatPanel'); if (!panel) return;
    let el = $('.conn', document);
    const bad = !S.wsUp && API.token;
    if (bad) {
      if (!el) { el = h(`<div class="conn"><span class="spinner" style="width:14px;height:14px;border-width:2px"></span><span></span></div>`); $('#app') && $('#app').appendChild(el); }
      el.lastChild.textContent = navigator.onLine ? t('conn_lost') : t('offline');
    } else if (el) el.remove();
    if (S.wsUp) { this.loadChats(); Chat.syncOpen(); }
  },

  // ---------------- chat list ----------------
  sortedChats() {
    const q = S.query.trim().toLowerCase();
    let list = [...S.chats.values()];
    if (S.filter === 'archived') list = list.filter((c) => c.archived);
    else list = list.filter((c) => !c.archived || q);
    if (S.filter === 'unread') list = list.filter((c) => c.unread > 0);
    if (S.filter === 'groups') list = list.filter((c) => c.type === 'group');
    if (q) list = list.filter((c) => chatTitle(c).toLowerCase().includes(q) || (c.peer && c.peer.username && c.peer.username.includes(q.replace(/^@/, ''))));
    list.sort((a, b) => (b.pinned - a.pinned) || (((b.last_message || {}).id || b.created_at / 1e9) - ((a.last_message || {}).id || a.created_at / 1e9)));
    return list;
  },

  renderList() {
    if (S.tab !== 'chats') return;
    const panel = $('#listPanel'); if (!panel) return;
    if (!$('#chatList', panel)) {
      const hasArchived = [...S.chats.values()].some((c) => c.archived);
      panel.innerHTML = `
        <div class="ph"><h2>${t('chats')}</h2>
          <button class="ibtn" id="newBtnTop" title="${t('new_chat')}">${icon('edit')}</button></div>
        <div class="search">${icon('search')}<input class="input" id="q" type="search" placeholder="${t('search_ph')}" value="${esc(S.query)}" autocomplete="off"></div>
        <div class="filters" id="filters">
          ${['all', 'unread', 'groups'].concat(hasArchived ? ['archived'] : []).map((f) => `<button class="chip ${S.filter === f ? 'on' : ''}" data-f="${f}">${t(f)}</button>`).join('')}
        </div>
        <div id="notifBanner"></div>
        <div class="scroll" id="chatList"></div>
        <button class="fab" id="fab" title="${t('new_chat')}">${icon('plus')}</button>`;
      $('#q').oninput = (e) => { S.query = e.target.value; this.renderRows(); this.searchPeople(); };
      $$('#filters .chip').forEach((b) => b.onclick = () => { S.filter = b.dataset.f; $$('#filters .chip').forEach((x) => x.classList.toggle('on', x === b)); this.renderRows(); });
      $('#fab').onclick = (e) => Modals.newMenu(e.currentTarget);
      $('#newBtnTop').onclick = (e) => Modals.newMenu(e.currentTarget);
      Push.renderBanner();
    }
    this.renderRows();
  },

  rowHtml(c) {
    const m = c.last_message;
    const typing = Chat.typingText(c.id, true);
    let prev = '';
    if (typing) prev = `<span class="prev typing">${esc(typing)}</span>`;
    else if (m) {
      const who = c.type === 'group' && m.kind !== 'system' && m.sender_id ? `<b>${esc(userName(m.sender_id))}: </b>` : '';
      prev = `<span class="prev">${who}${esc(msgPreview(m))}</span>`;
    } else prev = `<span class="prev">${c.type === 'group' ? fmt.num(c.member_count) + ' ' + t('members') : ''}</span>`;
    let tick = '';
    if (m && S.me && m.sender_id === S.me.id && m.kind !== 'system' && m.kind !== 'call' && !isSaved(c)) {
      tick = m.id <= (c.peer_last_read || 0) ? TICK2(true) : m.id <= (c.peer_last_delivered || 0) ? TICK2(false) : TICK1;
    }
    const peer = c.type === 'direct' ? S.users.get(c.peer.id) : null;
    const dot = peer && peer.online && !isSaved(c);
    return `<div class="row ${S.cur === c.id ? 'on' : ''}" data-id="${c.id}" role="button" tabindex="0">
      ${avatar(chatAvatarObj(c), '', dot)}
      <div class="mid">
        <div class="t1"><span class="name">${c.type === 'group' ? icon('users', 'i ic') : ''}${esc(chatTitle(c))}</span>${c.muted ? icon('bellOff', 'i ic') : ''}${tick}<span class="time">${m ? fmt.listTime(m.created_at) : ''}</span></div>
        <div class="t2">${prev}${c.pinned && !c.unread ? icon('pinT', 'i ic') : ''}${c.unread ? `<span class="badge ${c.muted ? 'muted' : ''}">${c.unread > 99 ? '99+' : fmt.num(c.unread)}</span>` : ''}</div>
      </div></div>`;
  },

  renderRows() {
    const box = $('#chatList'); if (!box) return;
    const list = this.sortedChats();
    let html = list.map((c) => this.rowHtml(c)).join('');
    if (!list.length && !S.query) {
      html = `<div class="empty"><div class="big">${icon('chat')}</div><b>${t('no_chats')}</b><span class="small">${t('no_chats_hint')}</span>
        <button class="btn" id="emptyNew">${icon('plus')} ${t('new_chat')}</button></div>`;
    }
    if (S.query.trim().length >= 2) html += `<div id="peopleRes"></div>`;
    box.innerHTML = html;
    if ($('#emptyNew')) $('#emptyNew').onclick = () => Modals.findPeople();
    box.onclick = (e) => { const r = e.target.closest('.row[data-id]'); if (r) Chat.open(Number(r.dataset.id)); };
    box.oncontextmenu = (e) => { const r = e.target.closest('.row[data-id]'); if (r) { e.preventDefault(); this.rowMenu(Number(r.dataset.id), e); } };
    longPress(box, '.row[data-id]', (r, ev) => this.rowMenu(Number(r.dataset.id), ev));
    if (this._people) this.renderPeople(this._people);
  },

  _ps: 0,
  searchPeople() {
    clearTimeout(this._pt);
    const q = S.query.trim();
    this._people = null;
    if (q.length < 2) return;
    this._pt = setTimeout(async () => {
      const seq = ++this._ps;
      try {
        const { users } = await API.get('/api/users/search?q=' + encodeURIComponent(q));
        if (seq !== this._ps) return;
        users.forEach(putUser);
        const directIds = new Set([...S.chats.values()].filter((c) => c.type === 'direct').map((c) => c.peer.id));
        this._people = users.filter((u) => !directIds.has(u.id) || !chatTitle([...S.chats.values()].find((c) => c.type === 'direct' && c.peer.id === u.id)).toLowerCase().includes(q.toLowerCase()));
        this.renderPeople(this._people);
      } catch {}
    }, 300);
  },
  renderPeople(users) {
    const box = $('#peopleRes'); if (!box) return;
    box.innerHTML = users.length ? `<div class="sec" style="background:none;border:0"><h4>${t('people')}</h4></div>` + users.map((u) => `
      <div class="row" data-uid="${u.id}">${avatar(u, '', u.online)}<div class="mid"><div class="t1"><span class="name">${esc(u.name)}</span></div>
      <div class="t2"><span class="prev">${u.username ? '@' + esc(u.username) : esc(fmt.lastSeen(u))}</span></div></div></div>`).join('')
      : (this.sortedChats().length ? '' : `<div class="empty" style="height:auto">${t('no_results')}</div>`);
    box.onclick = (e) => { const r = e.target.closest('[data-uid]'); if (r) { e.stopPropagation(); this.openDirect(S.users.get(Number(r.dataset.uid))); } };
  },

  async openDirect(user) {
    try {
      const { chat } = await API.post('/api/chats/direct', { user_id: user.id });
      putChat(chat);
      if (S.query) { S.query = ''; const q = $('#q'); if (q) q.value = ''; }
      this.renderList();
      Chat.open(chat.id);
    } catch (e) { toast(errText(e.code)); }
  },

  rowMenu(id, ev) {
    const c = S.chats.get(id); if (!c) return;
    const items = [
      { icon: c.pinned ? 'pinT' : 'pinT', label: t(c.pinned ? 'unpin' : 'pin'), fn: () => Chat.setSetting(id, { pinned: !c.pinned }) },
      { icon: c.muted ? 'bell' : 'bellOff', label: t(c.muted ? 'unmute_chat' : 'mute_chat'), fn: () => Chat.setSetting(id, { muted: !c.muted }) },
      { icon: 'archive', label: t(c.archived ? 'unarchive' : 'archive'), fn: () => Chat.setSetting(id, { archived: !c.archived }).then(() => { const p = $('#listPanel'); if (p) p.innerHTML = ''; this.renderList(); }) },
      { icon: 'trash', label: t('clear_history'), danger: true, fn: () => Chat.clearHistory(id) },
    ];
    Menu.open(ev, items);
  },
};

function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /SChatAndroid/.test(ua) ? 'S-Chat app' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br}${os ? ' · ' + os : ''}`;
}

function applyTheme() {
  let th = 'auto'; try { th = localStorage.getItem('sc_theme') || 'auto'; } catch {}
  if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = $('meta[name=theme-color]'); if (meta) meta.content = dark ? '#0e1a22' : '#9cc9d8';
}

// long-press helper for touch devices
function longPress(root, sel, fn) {
  if (root._lp) return; root._lp = true;
  let timer, sx, sy, fired;
  root.addEventListener('touchstart', (e) => {
    const el = e.target.closest(sel); if (!el) return;
    fired = false; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => { fired = true; if (navigator.vibrate) { try { navigator.vibrate(15); } catch {} } fn(el, { clientX: sx, clientY: sy, target: e.target }); }, 480);
  }, { passive: true });
  root.addEventListener('touchmove', (e) => { if (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10) clearTimeout(timer); }, { passive: true });
  root.addEventListener('touchend', (e) => { clearTimeout(timer); if (fired) { e.preventDefault(); fired = false; } });
  root.addEventListener('touchcancel', () => clearTimeout(timer));
}

// ---------------- popover menu ----------------
const Menu = {
  open(ev, items, extraTop) {
    this.close();
    const el = h(`<div class="pop" role="menu"></div>`);
    if (extraTop) el.appendChild(extraTop);
    for (const it of items) {
      if (!it) continue;
      const b = h(`<button role="menuitem" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}<span>${esc(it.label)}</span></button>`);
      b.onclick = () => { this.close(); it.fn(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    let x = ev.clientX, y = ev.clientY;
    if (ev.currentTarget && ev.currentTarget.getBoundingClientRect && !ev.clientX) {
      const br = ev.currentTarget.getBoundingClientRect(); x = br.left; y = br.bottom + 6;
    }
    if (ev.anchor) { const br = ev.anchor.getBoundingClientRect(); x = LANG === 'fa' ? br.left : br.right - r.width; y = br.bottom + 6; if (y + r.height > innerHeight - 8) y = br.top - r.height - 6; }
    x = Math.max(8, Math.min(x, innerWidth - r.width - 8));
    y = Math.max(8, Math.min(y, innerHeight - r.height - 8));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    this.el = el;
    setTimeout(() => {
      this._off = (e) => { if (!el.contains(e.target)) this.close(); };
      document.addEventListener('pointerdown', this._off, true);
      this._key = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this._key);
    });
    return el;
  },
  close() {
    if (this.el) { this.el.remove(); this.el = null; }
    if (this._off) document.removeEventListener('pointerdown', this._off, true);
    if (this._key) document.removeEventListener('keydown', this._key);
  },
};

// ---------------- modals ----------------
const Modals = {
  open(html, { sheet = true, onClose } = {}) {
    const ov = h(`<div class="ov ${sheet ? 'sheet' : ''}"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`);
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); if (onClose) onClose(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', key);
    document.body.appendChild(ov);
    $$('[data-close]', ov).forEach((b) => b.onclick = close);
    return { el: ov, close };
  },

  confirm(text, okLabel, danger) {
    return new Promise((resolve) => {
      const m = this.open(`<div class="body" style="padding-top:22px"><div style="font-size:15.5px">${esc(text)}</div></div>
        <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn ${danger ? 'danger' : ''}" id="ok">${esc(okLabel || t('confirm'))}</button></footer>`,
        { sheet: false, onClose: () => resolve(false) });
      $('#ok', m.el).onclick = () => { m.el.remove(); resolve(true); };
    });
  },

  newMenu(anchor) {
    Menu.open({ anchor }, [
      { icon: 'user', label: t('new_chat'), fn: () => this.findPeople() },
      { icon: 'users', label: t('new_group'), fn: () => this.newGroup() },
      { icon: 'bookmark', label: t('saved_messages'), fn: () => App.openDirect(S.me) },
    ]);
  },

  peoplePicker(m, { multi, onPick, exclude = [] }) {
    const picked = new Map();
    const inp = $('.pp-q', m.el), res = $('.pp-res', m.el), chips = $('.picked', m.el);
    const known = () => {
      const ids = new Set();
      const out = [];
      for (const c of App.sortedChats()) {
        if (c.type === 'direct' && !isSaved(c) && !ids.has(c.peer.id)) { ids.add(c.peer.id); out.push(S.users.get(c.peer.id)); }
      }
      return out;
    };
    const render = (users) => {
      users = users.filter((u) => u && !exclude.includes(u.id) && (!S.me || u.id !== S.me.id));
      res.innerHTML = users.length ? users.map((u) => `<div class="row" data-uid="${u.id}">${avatar(u, 'sm', u.online)}
        <div class="mid"><div class="t1"><span class="name">${esc(u.name)}</span></div><div class="t2"><span class="prev">${u.username ? '@' + esc(u.username) : esc(fmt.lastSeen(u))}</span></div></div>
        ${multi ? `<span class="check ${picked.has(u.id) ? 'on' : ''}">${picked.has(u.id) ? icon('check') : ''}</span>` : ''}</div>`).join('')
        : `<div class="empty" style="height:auto;padding:24px">${inp.value.trim().length >= 2 ? t('no_results') : esc(t('find_hint'))}</div>`;
    };
    const renderChips = () => {
      if (!chips) return;
      chips.innerHTML = [...picked.values()].map((u) => `<span class="chip" data-rm="${u.id}">${avatar(u, 'sm')}${esc(u.name)} ✕</span>`).join('');
    };
    let seq = 0, timer;
    const search = () => {
      clearTimeout(timer);
      const q = inp.value.trim();
      if (q.length < 2) { render(known()); return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const { users } = await API.get('/api/users/search?q=' + encodeURIComponent(q));
          if (my !== seq) return;
          users.forEach(putUser);
          const local = known().filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
          const all = new Map([...local, ...users].map((u) => [u.id, u]));
          render([...all.values()]);
        } catch {}
      }, 250);
    };
    inp.oninput = search;
    res.onclick = (e) => {
      const r = e.target.closest('[data-uid]'); if (!r) return;
      const u = S.users.get(Number(r.dataset.uid));
      if (!multi) return onPick(u);
      if (picked.has(u.id)) picked.delete(u.id); else picked.set(u.id, u);
      renderChips(); search();
      if (m.onChange) m.onChange(picked);
    };
    if (chips) chips.onclick = (e) => { const c = e.target.closest('[data-rm]'); if (c) { picked.delete(Number(c.dataset.rm)); renderChips(); search(); if (m.onChange) m.onChange(picked); } };
    render(known());
    setTimeout(() => inp.focus(), 50);
    return picked;
  },

  findPeople() {
    const m = this.open(`<header><h3>${t('new_chat')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body"><input class="input pp-q" placeholder="@username · email · 0912…" dir="auto" autocomplete="off"><div class="mut small">${t('find_hint')}</div>
      <div class="pp-res" style="margin:0 -12px"></div></div>`);
    this.peoplePicker(m, { multi: false, onPick: (u) => { m.close(); App.openDirect(u); } });
  },

  newGroup() {
    const m = this.open(`<header><h3>${t('new_group')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body">
        <div style="display:flex;gap:12px;align-items:center">
          <label style="cursor:pointer"><div id="gAv">${avatar({ id: 1, name: '+' }, 'lg')}</div><input type="file" accept="image/*" id="gFile" hidden></label>
          <input class="input" id="gName" maxlength="80" placeholder="${t('group_name')}">
        </div>
        <b style="font-size:14px">${t('add_members')}</b>
        <div class="picked"></div>
        <input class="input pp-q" placeholder="${t('search')}…" autocomplete="off">
        <div class="pp-res" style="margin:0 -12px"></div>
        <div class="err" id="gErr"></div>
      </div>
      <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="gGo">${t('create')}</button></footer>`);
    const picked = this.peoplePicker(m, { multi: true });
    let avatarId = null;
    $('#gFile', m.el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const up = await API.upload(await Media.squareAvatar(f), 'group.jpg'); avatarId = up.id; $('#gAv', m.el).innerHTML = avatar({ avatar: up.url }, 'lg'); } catch (err) { toast(errText(err.code)); }
    };
    $('#gGo', m.el).onclick = async () => {
      const title = $('#gName', m.el).value.trim();
      if (!title) { $('#gName', m.el).focus(); return; }
      try {
        const { chat } = await API.post('/api/chats/group', { title, member_ids: [...picked.keys()], avatar_file: avatarId });
        putChat(chat); m.close(); App.renderList(); Chat.open(chat.id);
      } catch (err) { $('#gErr', m.el).textContent = errText(err.code); }
    };
  },

  addMembers(chatId, exclude) {
    const m = this.open(`<header><h3>${t('add_members')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body"><div class="picked"></div><input class="input pp-q" placeholder="${t('search')}…" autocomplete="off"><div class="pp-res" style="margin:0 -12px"></div></div>
      <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="aGo">${t('add_members')}</button></footer>`);
    const picked = this.peoplePicker(m, { multi: true, exclude });
    $('#aGo', m.el).onclick = async () => {
      if (!picked.size) return;
      try { await API.post(`/api/chats/${chatId}/members`, { user_ids: [...picked.keys()] }); m.close(); Info.refresh(); } catch (err) { toast(errText(err.code)); }
    };
  },

  forward(msgs) {
    const m = this.open(`<header><h3>${t('forward_to')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body"><input class="input" id="fq" placeholder="${t('search')}…" autocomplete="off"><div id="fres" style="margin:0 -12px"></div></div>`);
    const render = () => {
      const q = $('#fq', m.el).value.trim().toLowerCase();
      const list = App.sortedChats().filter((c) => !q || chatTitle(c).toLowerCase().includes(q));
      $('#fres', m.el).innerHTML = list.map((c) => `<div class="row" data-id="${c.id}">${avatar(chatAvatarObj(c), 'sm')}<div class="mid"><div class="t1"><span class="name">${esc(chatTitle(c))}</span></div></div></div>`).join('');
    };
    $('#fq', m.el).oninput = render; render();
    $('#fres', m.el).onclick = async (e) => {
      const r = e.target.closest('[data-id]'); if (!r) return;
      const id = Number(r.dataset.id);
      m.close();
      for (const msg of msgs) {
        try { await API.post(`/api/chats/${id}/messages`, { forward_of: msg.id, client_id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6) }); } catch (err) { toast(errText(err.code)); return; }
      }
      toast(t('forwarded'));
      Chat.open(id);
    };
  },

  async joinGroup(code) {
    try {
      const { group } = await API.get('/api/join/' + code);
      if (group.is_member) { Chat.open(group.id); return; }
      const m = this.open(`<div class="body" style="padding-top:26px;justify-items:center;text-align:center">
        ${avatar({ id: group.id, name: group.title, avatar: group.avatar }, 'xl')}
        <h3 style="margin:4px 0 0;font-size:21px">${esc(group.title)}</h3>
        <div class="mut">${fmt.num(group.member_count)} ${t('members')}</div>
        ${group.description ? `<div>${esc(group.description)}</div>` : ''}</div>
        <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="jGo">${t('join')}</button></footer>`);
      $('#jGo', m.el).onclick = async () => {
        try { const { chat } = await API.post('/api/join/' + code); putChat(chat); m.close(); App.renderList(); Chat.open(chat.id); } catch (err) { toast(errText(err.code)); }
      };
    } catch (err) { toast(errText(err.code)); }
  },

  linkTarget(kind) {
    const m = this.open(`<header><h3>${t(kind === 'email' ? 'add_email' : 'add_phone')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body"><input class="input" id="lt" dir="ltr" inputmode="${kind === 'email' ? 'email' : 'tel'}" placeholder="${kind === 'email' ? 'name@example.com' : '+1 416… / 0912…'}">
      <input class="input code-in" id="lc" inputmode="numeric" maxlength="6" placeholder="------" hidden>
      <div class="err" id="le"></div></div>
      <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="lgo">${t('send_code')}</button></footer>`);
    let target = null;
    $('#lgo', m.el).onclick = async () => {
      $('#le', m.el).textContent = '';
      try {
        if (!target) {
          const r = await API.post('/api/me/link/start', { target: $('#lt', m.el).value });
          target = r.target;
          $('#lc', m.el).hidden = false; $('#lc', m.el).focus();
          $('#lgo', m.el).textContent = t('verify');
          if (r.dev_code) $('#le', m.el).textContent = t('dev_code', { c: r.dev_code });
        } else {
          const { user } = await API.post('/api/me/link/verify', { target, code: $('#lc', m.el).value });
          S.me = putUser(user); m.close(); Settings.render();
        }
      } catch (err) { $('#le', m.el).textContent = errText(err.code); }
    };
  },
};

// ---------------- settings ----------------
const Settings = {
  async render() {
    const panel = $('#listPanel'); if (!panel || S.tab !== 'settings') return;
    const me = S.me;
    let th = 'auto'; try { th = localStorage.getItem('sc_theme') || 'auto'; } catch {}
    panel.innerHTML = `
      <div class="ph"><h2>${t('settings')}</h2></div>
      <div class="scroll" style="padding-bottom:20px">
        <div class="info" style="position:static;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;animation:none">
          <div class="hero">
            <label style="cursor:pointer;position:relative">${avatar(me, 'xl')}
              <span class="ibtn solid" style="position:absolute;bottom:0;inset-inline-end:0;width:36px;height:36px">${icon('cam')}</span>
              <input type="file" accept="image/*" id="sAv" hidden></label>
            <h3>${esc(me.name)}</h3>
            <div class="mut small" dir="ltr">${me.username ? '@' + esc(me.username) : ''}</div>
          </div>
        </div>
        <div class="sec">
          <button class="li" id="sEdit">${icon('edit')}<span class="k">${t('edit_profile')}<small>${esc(me.bio || t('bio'))}</small></span></button>
          <button class="li" id="sSaved">${icon('bookmark')}<span class="k">${t('saved_messages')}</span></button>
        </div>
        <div class="sec"><h4>${t('account')}</h4>
          <button class="li" id="sPhone">${icon('phone')}<span class="k">${t('phone')}<small dir="ltr" style="text-align:start">${esc(me.phone || t('not_set'))}</small></span>${me.phone ? '' : icon('plus')}</button>
          <button class="li" id="sEmail">${icon('mail')}<span class="k">${t('email')}<small dir="ltr" style="text-align:start">${esc(me.email || t('not_set'))}</small></span>${me.email ? '' : icon('plus')}</button>
        </div>
        <div class="sec"><h4>${t('privacy')}</h4>
          <div class="li">${icon('clock')}<span class="k">${t('show_last_seen')}</span><button class="switch ${me.show_last_seen ? 'on' : ''}" id="sSeen" aria-label="${t('show_last_seen')}"></button></div>
        </div>
        <div class="sec"><h4>${t('notifications')}</h4>
          <div class="li">${icon('bell')}<span class="k" id="sNotifTxt">${Push.statusText()}</span><button class="btn ghost" id="sNotif" style="min-height:36px;padding:6px 14px;font-size:13px">${t('enable_notif')}</button></div>
          <div class="li">${icon('speaker')}<span class="k">${t('sounds')}</span><button class="switch ${S.sounds ? 'on' : ''}" id="sSnd"></button></div>
        </div>
        <div class="sec"><h4>${t('appearance')}</h4>
          <div class="li">${icon('moon')}<span class="k">${t('theme')}</span>
            <span style="display:flex;gap:4px">${['auto', 'light', 'dark'].map((x) => `<button class="chip ${th === x ? 'on' : ''}" data-th="${x}">${t('theme_' + x)}</button>`).join('')}</span></div>
          <div class="li">${icon('globe')}<span class="k">${t('language')}</span>
            <span style="display:flex;gap:4px"><button class="chip ${LANG === 'fa' ? 'on' : ''}" data-lg="fa">فارسی</button><button class="chip ${LANG === 'en' ? 'on' : ''}" data-lg="en">English</button></span></div>
        </div>
        <div class="sec"><h4>${t('install_app')}</h4>
          <button class="li" id="sInstall">${icon('app')}<span class="k">${t('install_app')}<small>${/iPhone|iPad/.test(navigator.userAgent) ? t('ios_install') : t('install_hint')}</small></span></button>
          <a class="li" href="/download/s-chat.apk" download style="text-decoration:none">${icon('download')}<span class="k">${t('android_apk')}</span></a>
        </div>
        <div class="sec"><h4>${t('devices')}</h4><div id="sSess"><div class="li"><span class="spinner"></span></div></div></div>
        <div class="sec"><button class="li danger" id="sOut">${icon('logout')}<span class="k">${t('logout')}</span></button></div>
        <div class="mut small" style="text-align:center;padding:10px">S-Chat · ${t('version')} 1.0</div>
      </div>`;
    $('#sAv').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const up = await API.upload(await Media.squareAvatar(f), 'avatar.jpg'); const { user } = await API.patch('/api/me', { avatar_file: up.id }); S.me = putUser(user); App.renderRailMe(); this.render(); } catch (err) { toast(errText(err.code)); }
    };
    $('#sEdit').onclick = () => this.editProfile();
    $('#sSaved').onclick = () => App.openDirect(S.me);
    $('#sPhone').onclick = () => { if (!me.phone) Modals.linkTarget('phone'); };
    $('#sEmail').onclick = () => { if (!me.email) Modals.linkTarget('email'); };
    $('#sSeen').onclick = async () => { try { const { user } = await API.patch('/api/me', { show_last_seen: !me.show_last_seen }); S.me = putUser(user); this.render(); } catch (err) { toast(errText(err.code)); } };
    $('#sSnd').onclick = (e) => { S.sounds = !S.sounds; try { localStorage.setItem('sc_sounds', S.sounds ? '1' : '0'); } catch {} e.currentTarget.classList.toggle('on', S.sounds); };
    const nb = $('#sNotif');
    nb.hidden = Push.state() === 'granted' || Push.state() === 'unsupported';
    nb.onclick = async () => { await Push.request(); $('#sNotifTxt').textContent = Push.statusText(); nb.hidden = Push.state() === 'granted'; };
    if (Push.state() === 'granted') {
      const tb = h(`<button class="btn ghost" style="min-height:36px;padding:6px 14px;font-size:13px">${t('test_notif')}</button>`);
      tb.onclick = async () => { await Push.subscribe(); API.post('/api/push/test').catch(() => {}); };
      nb.after(tb);
    }
    $$('[data-th]').forEach((b) => b.onclick = () => { try { localStorage.setItem('sc_theme', b.dataset.th); } catch {} applyTheme(); this.render(); });
    $$('[data-lg]').forEach((b) => b.onclick = () => { setLang(b.dataset.lg); App.start(); App.setTab('settings'); });
    $('#sInstall').onclick = () => Install.prompt();
    $('#sOut').onclick = async () => {
      if (!(await Modals.confirm(t('logout_confirm'), t('logout'), true))) return;
      try { await Push.unsubscribe(); await API.post('/api/auth/logout'); } catch {}
      API.setToken(null); RT.close(); S.chats.clear(); S.msgs.clear(); S.cur = null; App.showAuth();
    };
    this.loadSessions();
  },

  async loadSessions() {
    try {
      const { sessions } = await API.get('/api/sessions');
      const box = $('#sSess'); if (!box) return;
      box.innerHTML = sessions.map((s) => `<div class="li">${icon('devices')}<span class="k">${esc(s.device || '—')}<small>${s.current ? t('this_device') : fmt.listTime(s.last_used)}</small></span>
        ${s.current ? '' : `<button class="btn ghost" data-sid="${s.id}" style="min-height:34px;padding:4px 12px;font-size:12.5px">${t('terminate')}</button>`}</div>`).join('');
      box.onclick = async (e) => { const b = e.target.closest('[data-sid]'); if (!b) return; await API.del('/api/sessions/' + b.dataset.sid).catch(() => {}); this.loadSessions(); };
    } catch {}
  },

  editProfile() {
    const me = S.me;
    const m = Modals.open(`<header><h3>${t('edit_profile')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body">
        <label class="f">${t('name')}<input class="input" id="eN" maxlength="64" value="${esc(me.name)}"></label>
        <label class="f">${t('username')}<input class="input" id="eU" dir="ltr" maxlength="32" placeholder="@username" value="${esc(me.username || '')}" autocapitalize="off"><span class="mut small" style="font-weight:400">${t('username_hint')}</span></label>
        <label class="f">${t('bio')}<textarea class="input" id="eB" maxlength="200" rows="3">${esc(me.bio || '')}</textarea></label>
        ${me.avatar ? `<button class="btn ghost" id="eRm">${icon('trash')} ${t('remove_photo')}</button>` : ''}
        <div class="err" id="eE"></div></div>
      <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="eGo">${t('save')}</button></footer>`);
    if ($('#eRm', m.el)) $('#eRm', m.el).onclick = async () => { const { user } = await API.patch('/api/me', { avatar_file: null }); S.me = putUser(user); m.close(); App.renderRailMe(); this.render(); };
    $('#eGo', m.el).onclick = async () => {
      try {
        const { user } = await API.patch('/api/me', { name: $('#eN', m.el).value, username: $('#eU', m.el).value, bio: $('#eB', m.el).value });
        S.me = putUser(user); m.close(); App.renderRailMe(); this.render();
      } catch (err) { $('#eE', m.el).textContent = errText(err.code); }
    };
  },
};

// ---------------- calls tab ----------------
const Calls = {
  async renderTab() {
    const panel = $('#listPanel'); if (!panel || S.tab !== 'calls') return;
    panel.innerHTML = `<div class="ph"><h2>${t('calls')}</h2></div><div class="scroll" id="callList"><div class="empty"><span class="spinner"></span></div></div>`;
    try {
      const { calls } = await API.get('/api/calls');
      const box = $('#callList'); if (!box) return;
      calls.forEach((c) => { if (c.peer) putUser(c.peer); });
      if (!calls.length) { box.innerHTML = `<div class="empty"><div class="big">${icon('phone')}</div><b>${t('no_calls')}</b></div>`; return; }
      box.innerHTML = calls.map((c) => {
        const m = c.message; const meta = m.meta || {};
        const out = m.sender_id === S.me.id;
        const missed = !out && meta.status !== 'ended';
        return `<div class="row" data-chat="${m.chat_id}">${avatar(c.peer, '', false)}
          <div class="mid"><div class="t1"><span class="name" style="${missed ? 'color:var(--danger)' : ''}">${esc(c.peer ? c.peer.name : '')}</span><span class="time">${fmt.listTime(m.created_at)}</span></div>
          <div class="t2"><span class="prev">${icon(out ? 'phoneOut' : missed ? 'phoneMiss' : 'phoneIn', 'i ic')} ${esc(callLabel(m).replace(/^\S+\s/, ''))}</span></div></div>
          <button class="ibtn" data-call="${m.chat_id}" data-video="${meta.video ? 1 : 0}" title="${t('call')}">${icon(meta.video ? 'video' : 'phone')}</button></div>`;
      }).join('');
      box.onclick = (e) => {
        const cb = e.target.closest('[data-call]');
        if (cb) { e.stopPropagation(); Call.start(Number(cb.dataset.call), cb.dataset.video === '1'); return; }
        const r = e.target.closest('[data-chat]'); if (r) { App.setTab('chats'); Chat.open(Number(r.dataset.chat)); }
      };
    } catch { const box = $('#callList'); if (box) box.innerHTML = `<div class="empty">${t('load_failed')}</div>`; }
  },
};

// ---------------- install (PWA) ----------------
const Install = {
  evt: null,
  prompt() {
    if (this.evt) { this.evt.prompt(); this.evt.userChoice.finally(() => { this.evt = null; }); return; }
    if (matchMedia('(display-mode: standalone)').matches) { toast('✓'); return; }
    toast(/iPhone|iPad/.test(navigator.userAgent) ? t('ios_install') : t('install_hint') + ' — ⋮ → Install app');
  },
};
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); Install.evt = e; });
