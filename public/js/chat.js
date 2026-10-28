'use strict';
/* Chat view: messages, composer, receipts, menus, info drawer */

const Chat = {
  els: null,
  cache: new Map(),      // msgKey -> {sig, el}
  drafts: new Map(),
  unreadMark: new Map(),
  reply: null,
  editing: null,
  pendSeq: 0,

  renderEmpty() {
    const p = $('#chatPanel'); if (!p) return;
    p.innerHTML = `<div class="empty"><div class="big">${icon('chat')}</div><div class="wm-empty">${WORDMARK}</div><span class="small">${t('no_chats_hint')}</span></div>`;
    this.els = null;
  },

  close() {
    this.saveDraft();
    S.cur = null; this.els = null; this.cache.clear();
    RT.send({ t: 'focus', chat_id: null });
    const app = $('#app'); if (app) app.classList.remove('in-chat');
    setTimeout(() => { if (!S.cur) this.renderEmpty(); }, 320);
    App.renderRows();
  },

  async open(id) {
    if (!S.chats.has(id)) {
      try { const r = await API.get('/api/chats/' + id); putChat(r.chat); } catch { toast(t('load_failed')); return; }
    }
    if (S.tab !== 'chats') App.setTab('chats');
    this.saveDraft();
    S.cur = id;
    this.reply = null; this.editing = null; this.cache.clear();
    const c = S.chats.get(id);
    this.unreadMark.set(id, c.unread ? c.last_read : null);
    RT.send({ t: 'focus', chat_id: id });
    const app = $('#app'); if (app) app.classList.add('in-chat');
    if (window.innerWidth <= 820) history.pushState({ chat: id }, '');
    this.build();
    App.renderRows();
    if (c.type === 'group') this.loadMembers(id);
    const store = S.msgs.get(id);
    if (!store || !store.loaded) await this.loadInitial(id);
    else { this.renderMsgs(); this.scrollInitial(); this.syncOpen(); }
    this.markRead();
  },

  build() {
    const c = S.chats.get(S.cur);
    const p = $('#chatPanel');
    p.innerHTML = `
      <div class="chat">
        <div class="ch">
          <button class="ibtn back" id="cBack">${icon(LANG === 'fa' ? 'fwd' : 'back')}</button>
          <div class="who" id="cWho"></div>
          ${c.type === 'direct' && !isSaved(c) ? `<button class="ibtn" id="cCall" title="${t('voice_call')}">${icon('phone')}</button>
          <button class="ibtn" id="cVideo" title="${t('video_call')}">${icon('video')}</button>` : ''}
          <button class="ibtn" id="cMore">${icon('more')}</button>
        </div>
        <div class="msgs" id="msgs" aria-live="polite"></div>
        <button class="tobottom glass" id="toBottom" hidden>${icon('down')}<span class="badge" hidden></span></button>
        <div class="composer" id="composer"></div>
      </div>`;
    this.els = { msgs: $('#msgs'), who: $('#cWho'), composer: $('#composer'), toBottom: $('#toBottom') };
    $('#cBack').onclick = () => { if (history.state && history.state.chat) history.back(); else this.close(); };
    this.els.who.onclick = () => Info.open(S.cur);
    if ($('#cCall')) $('#cCall').onclick = () => Call.start(S.cur, false);
    if ($('#cVideo')) $('#cVideo').onclick = () => Call.start(S.cur, true);
    $('#cMore').onclick = (e) => this.chatMenu(e.currentTarget);
    this.els.msgs.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.els.toBottom.onclick = () => this.jumpBottom();
    this.bindMsgEvents();
    this.bindDrop(p);
    this.renderHeader();
    Composer.render();
  },

  renderHeader() {
    if (!this.els) return;
    const c = S.chats.get(S.cur); if (!c) return;
    let status = '';
    let on = false;
    const typing = this.typingText(c.id);
    if (typing) { status = `<span class="typing-dots"><i></i><i></i><i></i></span>${esc(typing)}`; on = true; }
    else if (isSaved(c)) status = '';
    else if (c.type === 'direct') { const u = S.users.get(c.peer.id) || c.peer; status = esc(fmt.lastSeen(u)); on = u.online; }
    else status = `${fmt.num(c.member_count)} ${t('members')}`;
    const peer = c.type === 'direct' ? S.users.get(c.peer.id) : null;
    this.els.who.innerHTML = `${avatar(chatAvatarObj(c), 'sm', peer && peer.online && !isSaved(c))}<div style="min-width:0"><div class="n">${esc(chatTitle(c))}${c.muted ? ' ' + icon('bellOff', 'i ic') : ''}</div><div class="s ${on ? 'on' : ''}">${status}</div></div>`;
  },

  typingText(chatId, short) {
    const map = S.typing.get(chatId); if (!map) return '';
    const nowT = Date.now();
    const active = [...map.entries()].filter(([, v]) => v.until > nowT);
    if (!active.length) return '';
    const c = S.chats.get(chatId);
    const [uid, v] = active[0];
    const label = t(v.action === 'recording' ? 'recording' : v.action === 'uploading' ? 'uploading' : 'typing');
    if (c && c.type === 'group') return `${userName(uid)}: ${label}…`;
    return label + '…';
  },

  setTyping(chatId, uid, action) {
    let map = S.typing.get(chatId);
    if (!map) { map = new Map(); S.typing.set(chatId, map); }
    if (action === 'stop') map.delete(uid); else map.set(uid, { until: Date.now() + 5500, action });
    if (chatId === S.cur) { const nb = this.nearBottom(160); this.renderHeader(); this.renderMsgs(); if (nb) this.scrollBottom(); }
    App.renderRows();
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { if (S.cur) { this.renderHeader(); this.renderMsgs(); } App.renderRows(); }, 5600);
  },

  async loadMembers(id) {
    try {
      const r = await API.get('/api/chats/' + id);
      let changed = false;
      for (const u of r.members) { const prev = S.users.get(u.id); if (!prev || prev.name !== u.name || prev.avatar !== u.avatar) changed = true; putUser(u); }
      putChat(r.chat);
      if (changed && S.cur === id) { this.cache.clear(); this.renderMsgs(); this.renderHeader(); }
    } catch {}
  },

  // ---------------- loading ----------------
  async loadInitial(id) {
    this.els.msgs.innerHTML = '<div class="loader"><span class="spinner"></span></div>';
    try {
      const { messages } = await API.get(`/api/chats/${id}/messages?limit=50`);
      messages.forEach(learn);
      const store = { list: messages, hasMore: messages.length >= 50, loaded: true };
      S.msgs.set(id, store);
      if (S.cur !== id) return;
      this.renderMsgs();
      this.scrollInitial();
      this.ackDelivered(id, messages);
    } catch { if (S.cur === id) this.els.msgs.innerHTML = `<div class="empty">${t('load_failed')} <button class="btn ghost" onclick="Chat.loadInitial(${id})">${t('retry')}</button></div>`; }
  },

  async loadOlder() {
    const id = S.cur; const store = S.msgs.get(id);
    if (!store || !store.hasMore || this._loadingOlder) return;
    const first = store.list.find((m) => typeof m.id === 'number');
    if (!first) return;
    this._loadingOlder = true;
    try {
      const { messages } = await API.get(`/api/chats/${id}/messages?before=${first.id}&limit=50`);
      if (S.cur !== id) return;
      store.hasMore = messages.length >= 50;
      messages.forEach(learn);
      const ids = new Set(store.list.map((m) => m.id));
      store.list = messages.filter((m) => !ids.has(m.id)).concat(store.list);
      const box = this.els.msgs;
      const prevH = box.scrollHeight, prevTop = box.scrollTop;
      this.renderMsgs();
      box.scrollTop = prevTop + (box.scrollHeight - prevH);
    } catch {} finally { this._loadingOlder = false; }
  },

  async syncOpen() {
    const id = S.cur; if (!id) return;
    const store = S.msgs.get(id); if (!store || !store.loaded) return;
    const last = [...store.list].reverse().find((m) => typeof m.id === 'number');
    try {
      const { messages } = await API.get(`/api/chats/${id}/messages?after=${last ? last.id : 0}&limit=100`);
      if (S.cur !== id) return;
      for (const m of messages) this.upsert(m);
      if (messages.length) { this.renderMsgs(); if (this.nearBottom(400)) this.scrollBottom(); this.markRead(); }
    } catch {}
  },

  ackDelivered(chatId, messages) {
    const others = messages.filter((m) => S.me && m.sender_id !== S.me.id && typeof m.id === 'number');
    if (others.length) RT.send({ t: 'delivered', chat_id: chatId, upto: others[others.length - 1].id });
  },

  upsert(m) {
    learn(m);
    const store = S.msgs.get(m.chat_id); if (!store || !store.loaded) return false;
    let i = store.list.findIndex((x) => x.id === m.id || (m.client_id && x.client_id === m.client_id && x._pending));
    if (i >= 0) {
      const old = store.list[i];
      if (old._local && m.file) m._local = old._local;
      m._v = (old._v || 0) + 1;
      store.list[i] = m;
    } else {
      m._v = 1;
      // keep order by id (pending ones stay at the end)
      let j = store.list.length;
      while (j > 0 && (store.list[j - 1]._pending || store.list[j - 1].id > m.id)) j--;
      store.list.splice(j, 0, m);
    }
    return true;
  },

  // ---------------- rendering ----------------
  key: (m) => (m._pending ? 'c' + m.client_id : 'm' + m.id),

  renderMsgs() {
    if (!this.els) return;
    const c = S.chats.get(S.cur);
    const store = S.msgs.get(S.cur);
    if (!store) return;
    const box = this.els.msgs;
    const list = store.list;
    const nodes = [];
    if (store.hasMore) nodes.push(h('<div class="loader"><span class="spinner"></span></div>'));
    if (!list.length) nodes.push(h(`<div class="empty"><div class="big">${icon(isSaved(c) ? 'bookmark' : 'chat')}</div><span class="small">${isSaved(c) ? t('saved_messages') : '👋'}</span></div>`));
    const mark = this.unreadMark.get(S.cur);
    let prev = null; let markPlaced = false;
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!prev || !fmt.sameDay(prev.created_at, m.created_at)) nodes.push(h(`<div class="day">${esc(fmt.day(m.created_at))}</div>`));
      if (mark != null && !markPlaced && typeof m.id === 'number' && m.id > mark && m.sender_id !== S.me.id) {
        nodes.push(h(`<div class="unread-sep" id="unreadSep">${t('new_messages')}</div>`)); markPlaced = true;
      }
      const next = list[i + 1];
      const groupStart = !prev || prev.sender_id !== m.sender_id || prev.kind === 'system' || m.created_at - prev.created_at > 300000 || !fmt.sameDay(prev.created_at, m.created_at);
      const tail = !next || next.sender_id !== m.sender_id || next.kind === 'system' || next.created_at - m.created_at > 300000 || !fmt.sameDay(next.created_at, m.created_at);
      const showName = c.type === 'group' && groupStart && m.sender_id !== S.me.id;
      const k = this.key(m); used.add(k);
      const sig = `${m._v}|${showName}|${LANG}|${m._failed ? 1 : 0}`;
      let ent = this.cache.get(k);
      if (!ent || ent.sig !== sig) { ent = { sig, el: this.msgEl(m, c, showName) }; this.cache.set(k, ent); }
      ent.el.classList.toggle('tail', tail);
      this.updateTicks(ent.el, m, c);
      nodes.push(ent.el);
      prev = m;
    }
    for (const k of [...this.cache.keys()]) if (!used.has(k)) this.cache.delete(k);
    const tmap = S.typing.get(S.cur);
    const typer = tmap && [...tmap.entries()].find(([, v]) => v.until > Date.now());
    if (typer) {
      const tu = S.users.get(typer[0]) || { id: typer[0], name: '' };
      nodes.push(h(`<div class="typing-bubble">${avatar(tu, 'sm')}<div class="b"><span class="typing-dots"><i></i><i></i><i></i></span></div></div>`));
    }
    box.replaceChildren(...nodes);
  },

  updateTicks(el, m, c) {
    const tk = el.querySelector('.tk'); if (!tk) return;
    let html = '';
    if (m._failed) html = `<span style="color:var(--danger)">${icon('alert', 'ticks')}</span>`;
    else if (m._pending) html = TICK0;
    else if (isSaved(c)) html = '';
    else html = m.id <= (c.peer_last_read || 0) ? TICK2(true) : m.id <= (c.peer_last_delivered || 0) ? TICK2(false) : TICK1;
    if (tk._h !== html) { tk.innerHTML = html; tk._h = html; }
  },

  refreshTicks() {
    if (!this.els) return;
    const c = S.chats.get(S.cur); const store = S.msgs.get(S.cur); if (!store) return;
    for (const m of store.list) { const ent = this.cache.get(this.key(m)); if (ent) this.updateTicks(ent.el, m, c); }
  },

  msgEl(m, c, showName) {
    const mine = S.me && m.sender_id === S.me.id;
    if (m.kind === 'system') return h(`<div class="sys" data-id="${m.id}">${esc(sysText(m))}</div>`);
    const sender = S.users.get(m.sender_id) || { id: m.sender_id, name: '…' };
    let inner = '';
    let bubbleCls = '';
    if (m.deleted) {
      inner = `<div class="txt mut" style="font-style:italic">🚫 ${t('deleted_msg')}</div>`;
    } else {
      if (m.forwarded_from) inner += `<div class="fwd">${icon('share', 'i ic')}${esc(t('forwarded_from', { n: m.forwarded_from }))}</div>`;
      if (m.reply) {
        const rn = m.reply.sender_id ? userName(m.reply.sender_id) : '';
        const rt = m.reply.deleted ? t('deleted_msg') : msgPreview(m.reply) || '';
        inner += `<a class="reply" data-jump="${m.reply.id}"><b>${esc(rn)}</b><span>${esc(rt)}</span></a>`;
      }
      const url = m._local || (m.file && m.file.url);
      const meta = m.meta || {};
      const ratio = meta.width && meta.height ? `aspect-ratio:${meta.width}/${meta.height};` : '';
      const bg = meta.thumb ? `background:url(${meta.thumb}) center/cover;` : '';
      const prog = m._pending && m.file ? `<div class="upl"><svg class="ring" viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="22"/><circle class="fg" cx="26" cy="26" r="22" stroke-dasharray="138.2" stroke-dashoffset="${138.2 * (1 - (m._progress || 0))}"/></svg></div>` : '';
      switch (m.kind) {
        case 'image':
          inner += `<div class="media" data-view="${this.key(m)}" style="${ratio}${bg}"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" style="${ratio}">${prog}</div>`;
          if (!m.text) bubbleCls = 'media-only';
          break;
        case 'video':
          inner += `<div class="media" data-view="${this.key(m)}" style="${ratio}${bg}"><video src="${esc(url)}#t=0.1" preload="metadata" muted playsinline style="${ratio}" ${meta.thumb ? `poster="${meta.thumb}"` : ''}></video>
            ${prog || `<span class="play">${icon('play')}</span>`}${meta.duration ? `<span class="dur">${fmt.dur(meta.duration)}</span>` : ''}</div>`;
          if (!m.text) bubbleCls = 'media-only';
          break;
        case 'voice':
        case 'audio':
          inner += Voice.html(m, url);
          break;
        case 'file': {
          const ext = (m.file && m.file.name.split('.').pop() || '').slice(0, 4).toUpperCase();
          inner += `<a class="file" ${m._pending ? '' : `href="${esc(url)}" download="${esc(m.file ? m.file.name : 'file')}"`}><span class="fi" style="position:relative">${m._pending ? prog.replace('class="upl"', 'class="upl" style="border-radius:12px"') : ext || icon('doc')}</span>
            <span style="min-width:0"><span class="fn" style="display:block">${esc(m.file ? m.file.name : '')}</span><span class="fs">${m.file ? fmt.size(m.file.size) : ''}</span></span></a>`;
          break;
        }
        case 'location':
          inner += `<a class="file" href="https://www.google.com/maps?q=${Number(meta.lat)},${Number(meta.lng)}" target="_blank" rel="noopener"><span class="fi">${icon('pin')}</span><span><span class="fn" style="display:block">${t('location')}</span><span class="fs" dir="ltr">${Number(meta.lat).toFixed(5)}, ${Number(meta.lng).toFixed(5)}</span><span class="fs" style="display:block;text-decoration:underline">${t('open_map')}</span></span></a>`;
          break;
        case 'call': {
          const missed = !mine && meta.status !== 'ended';
          inner += `<div class="call"><span class="ci ${missed ? 'miss' : ''}">${icon(meta.video ? 'video' : 'phone')}</span><span><b style="display:block;font-size:14px">${esc(callLabel(m).replace(/^\S+\s/, '').split(' · ')[0])}</b><span class="small" style="opacity:.8">${meta.status === 'ended' ? fmt.dur(meta.duration) : ''}</span></span></div>`;
          break;
        }
        default: break;
      }
      if (m.text) {
        const big = m.kind === 'text' && isEmojiOnly(m.text);
        if (big) bubbleCls = 'bare';
        inner += `<div class="txt ${big ? 'emoji' : ''}" dir="auto">${linkify(m.text)}</div>`;
      }
    }
    const meta = `<span class="meta">${m.edited_at && !m.deleted ? `<span>${t('edited')}</span>` : ''}<span>${fmt.time(m.created_at)}</span>${mine ? '<span class="tk"></span>' : ''}</span>`;
    const reacts = (m.reactions || []).length ? this.reactsHtml(m) : '';
    const name = showName ? `<div class="sender" style="color:${AV_COLORS[(m.sender_id || 0) % AV_COLORS.length] === '#122029' ? 'var(--link)' : AV_COLORS[(m.sender_id || 0) % AV_COLORS.length]}">${esc(sender.name)}</div>` : '';
    const el = h(`<div class="m ${mine ? 'mine' : ''} ${m._pending ? 'pending' : ''} ${m._failed ? 'failed' : ''}" data-k="${this.key(m)}">
      ${c.type === 'group' && !mine ? avatar(sender, 'sm') : ''}
      <div class="b ${bubbleCls}">${name}${inner}${meta}<div class="clear"></div>${reacts}</div></div>`);
    return el;
  },

  reactsHtml(m) {
    const groups = new Map();
    for (const r of m.reactions) { const g = groups.get(r.emoji) || []; g.push(r.user_id); groups.set(r.emoji, g); }
    return `<div class="reacts">${[...groups.entries()].map(([e, us]) => `<button data-react="${esc(e)}" class="${us.includes(S.me.id) ? 'me' : ''}" title="${esc(us.map(userName).join(', '))}">${e}<span>${us.length > 1 ? fmt.num(us.length) : ''}</span></button>`).join('')}</div>`;
  },

  findMsg(key) {
    const store = S.msgs.get(S.cur); if (!store) return null;
    return store.list.find((m) => this.key(m) === key);
  },

  bindMsgEvents() {
    const box = this.els.msgs;
    box.addEventListener('click', (e) => {
      const mEl = e.target.closest('.m');
      const jump = e.target.closest('[data-jump]');
      if (jump) { e.preventDefault(); this.jumpTo(Number(jump.dataset.jump)); return; }
      const view = e.target.closest('[data-view]');
      if (view) { const m = this.findMsg(view.dataset.view); if (m && !m._pending) Viewer.open(m); return; }
      const react = e.target.closest('[data-react]');
      if (react && mEl) { const m = this.findMsg(mEl.dataset.k); if (m) this.react(m, react.dataset.react); return; }
      const vp = e.target.closest('[data-voice]');
      if (vp) { Voice.toggle(vp.dataset.voice); return; }
      const wave = e.target.closest('.wave');
      if (wave) { Voice.seek(wave, e); return; }
      const spd = e.target.closest('.spd');
      if (spd) { Voice.cycleSpeed(); return; }
      const sn = e.target.closest('.sender');
      if (sn && mEl) { const m = this.findMsg(mEl.dataset.k); if (m) Info.openUser(m.sender_id); return; }
      if (mEl && mEl.classList.contains('failed')) { const m = this.findMsg(mEl.dataset.k); if (m) Composer.retry(m); }
    });
    box.addEventListener('contextmenu', (e) => {
      const mEl = e.target.closest('.m'); if (!mEl || e.target.closest('a[href]')) return;
      e.preventDefault(); this.msgMenu(mEl, e);
    });
    box.addEventListener('dblclick', (e) => {
      const mEl = e.target.closest('.m'); if (!mEl || window.getSelection().toString()) return;
      const m = this.findMsg(mEl.dataset.k); if (m && !m._pending && !m.deleted) Composer.setReply(m);
    });
    longPress(box, '.m', (el, ev) => this.msgMenu(el, ev));
  },

  msgMenu(el, ev) {
    const m = this.findMsg(el.dataset.k); if (!m || m._pending) return;
    const c = S.chats.get(S.cur);
    const mine = m.sender_id === S.me.id;
    const canAll = mine || (c.type === 'group' && (c.role === 'owner' || c.role === 'admin'));
    if (m.deleted) {
      Menu.open(ev, [{ icon: 'trash', label: t('delete_me'), danger: true, fn: () => this.del(m, false) }]);
      return;
    }
    const top = h('<div class="emojis"></div>');
    for (const e of ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥']) {
      const b = h(`<button>${e}</button>`); b.onclick = () => { Menu.close(); this.react(m, e); }; top.appendChild(b);
    }
    const editable = mine && ['text', 'image', 'video', 'file', 'audio'].includes(m.kind) && Date.now() - m.created_at < 48 * 3600000;
    Menu.open(ev, [
      { icon: 'reply', label: t('reply'), fn: () => Composer.setReply(m) },
      m.text ? { icon: 'copy', label: t('copy'), fn: () => { navigator.clipboard.writeText(m.text).then(() => toast(t('copied'))).catch(() => {}); } } : null,
      editable ? { icon: 'edit', label: t('edit'), fn: () => Composer.setEdit(m) } : null,
      m.kind !== 'call' ? { icon: 'share', label: t('forward'), fn: () => Modals.forward([m]) } : null,
      m.file ? { icon: 'download', label: t('download'), fn: () => { const a = h(`<a href="${m.file.url}" download="${esc(m.file.name)}"></a>`); document.body.appendChild(a); a.click(); a.remove(); } } : null,
      { icon: 'trash', label: t('delete'), danger: true, fn: () => this.askDelete(m, canAll) },
    ], top);
  },

  async askDelete(m, canAll) {
    if (!canAll || isSaved(S.chats.get(S.cur))) {
      if (await Modals.confirm(t('delete') + '؟', t('delete'), true)) this.del(m, isSaved(S.chats.get(S.cur)));
      return;
    }
    const md = Modals.open(`<div class="body" style="padding-top:22px">${t('delete')}?</div>
      <footer style="flex-wrap:wrap"><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn ghost" id="dMe">${t('delete_me')}</button><button class="btn danger" id="dAll">${t('delete_all')}</button></footer>`, { sheet: false });
    $('#dMe', md.el).onclick = () => { md.close(); this.del(m, false); };
    $('#dAll', md.el).onclick = () => { md.close(); this.del(m, true); };
  },

  async del(m, forAll) {
    try {
      await API.del(`/api/messages/${m.id}${forAll ? '?for=all' : ''}`);
      if (!forAll) this.removeLocal(m.chat_id, m.id);
    } catch (e) { toast(errText(e.code)); }
  },

  removeLocal(chatId, id) {
    const store = S.msgs.get(chatId); if (!store) return;
    store.list = store.list.filter((x) => x.id !== id);
    if (chatId === S.cur) this.renderMsgs();
  },

  async react(m, emoji) {
    try {
      const { reactions } = await API.post(`/api/messages/${m.id}/react`, { emoji });
      this.applyReactions(m.chat_id, m.id, reactions);
    } catch (e) { toast(errText(e.code)); }
  },

  applyReactions(chatId, id, reactions) {
    const store = S.msgs.get(chatId); if (!store) return;
    const m = store.list.find((x) => x.id === id); if (!m) return;
    m.reactions = reactions; m._v = (m._v || 0) + 1;
    if (chatId === S.cur) this.renderMsgs();
  },

  // ---------------- scroll ----------------
  nearBottom(px = 120) { const b = this.els && this.els.msgs; return !b || b.scrollHeight - b.scrollTop - b.clientHeight < px; },
  scrollBottom(smooth) { const b = this.els && this.els.msgs; if (b) b.scrollTo({ top: b.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); },
  scrollInitial() {
    requestAnimationFrame(() => {
      const sep = $('#unreadSep');
      if (sep) sep.scrollIntoView({ block: 'start' }); else this.scrollBottom();
      // images may change heights; keep pinned to bottom on first paint
      if (!sep) setTimeout(() => this.scrollBottom(), 120);
    });
  },
  onScroll() {
    const b = this.els.msgs;
    if (b.scrollTop < 300) this.loadOlder();
    const nb = this.nearBottom(300);
    this.els.toBottom.hidden = nb;
    if (nb) { this.markRead(); const bd = this.els.toBottom.querySelector('.badge'); bd.hidden = true; }
  },
  jumpBottom() { this.unreadMark.set(S.cur, null); this.scrollBottom(true); },
  async jumpTo(id) {
    for (let i = 0; i < 15; i++) {
      const el = this.els && this.els.msgs.querySelector(`[data-k="m${id}"]`);
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); return; }
      const store = S.msgs.get(S.cur);
      if (!store || !store.hasMore) return;
      await this.loadOlder();
    }
  },

  // ---------------- read state ----------------
  markRead() {
    const id = S.cur; if (!id || isHidden() || !this.els) return;
    if (!this.nearBottom(300)) return;
    const store = S.msgs.get(id); if (!store) return;
    const last = [...store.list].reverse().find((m) => typeof m.id === 'number');
    const c = S.chats.get(id);
    if (!last || !c) return;
    if (c.unread || last.id > (c.last_read || 0)) {
      c.unread = 0; c.last_read = last.id;
      App.renderRows(); App.updateBadges();
      clearTimeout(this._rt);
      this._rt = setTimeout(() => API.post(`/api/chats/${id}/read`, { upto: last.id }).catch(() => {}), 250);
    }
  },

  // ---------------- chat menu / settings ----------------
  chatMenu(anchor) {
    const c = S.chats.get(S.cur);
    const items = [
      { icon: 'info', label: t('info'), fn: () => Info.open(c.id) },
      { icon: 'search', label: t('search_in_chat'), fn: () => Info.open(c.id, 'search') },
      { icon: c.muted ? 'bell' : 'bellOff', label: t(c.muted ? 'unmute_chat' : 'mute_chat'), fn: () => this.setSetting(c.id, { muted: !c.muted }) },
      { icon: 'pinT', label: t(c.pinned ? 'unpin' : 'pin'), fn: () => this.setSetting(c.id, { pinned: !c.pinned }) },
      { icon: 'trash', label: t('clear_history'), danger: true, fn: () => this.clearHistory(c.id) },
      c.type === 'direct' && !isSaved(c) ? { icon: 'ban', label: t(c.blocked ? 'unblock' : 'block'), danger: !c.blocked, fn: () => this.toggleBlock(c) } : null,
      c.type === 'group' ? { icon: 'logout', label: t('leave_group'), danger: true, fn: () => this.leave(c) } : null,
    ];
    Menu.open({ anchor }, items);
  },

  async setSetting(id, body) {
    try { const { chat } = await API.patch(`/api/chats/${id}/settings`, body); putChat(chat); App.renderRows(); if (S.cur === id) this.renderHeader(); App.updateBadges(); }
    catch (e) { toast(errText(e.code)); }
  },

  async clearHistory(id) {
    if (!(await Modals.confirm(t('clear_confirm'), t('clear_history'), true))) return;
    try {
      const { chat } = await API.post(`/api/chats/${id}/clear`);
      putChat(chat); S.msgs.set(id, { list: [], hasMore: false, loaded: true });
      if (S.cur === id) { this.cache.clear(); this.renderMsgs(); }
      App.renderRows();
    } catch (e) { toast(errText(e.code)); }
  },

  async toggleBlock(c) {
    if (!c.blocked && !(await Modals.confirm(t('block_confirm'), t('block'), true))) return;
    try {
      if (c.blocked) await API.del(`/api/users/${c.peer.id}/block`); else await API.post(`/api/users/${c.peer.id}/block`);
      c.blocked = !c.blocked;
      if (S.cur === c.id) Composer.render();
      Info.refresh();
    } catch (e) { toast(errText(e.code)); }
  },

  async leave(c) {
    if (!(await Modals.confirm(t('leave_confirm'), t('leave_group'), true))) return;
    try { await API.del(`/api/chats/${c.id}/members/${S.me.id}`); this.removeChat(c.id); } catch (e) { toast(errText(e.code)); }
  },

  removeChat(id) {
    S.chats.delete(id); S.msgs.delete(id);
    if (S.cur === id) { Info.close(); this.close(); }
    App.renderRows(); App.updateBadges();
  },

  // ---------------- drafts / drop ----------------
  saveDraft() {
    const ta = $('#cText');
    if (S.cur && ta && !this.editing) this.drafts.set(S.cur, ta.value);
  },

  bindDrop(panel) {
    let depth = 0, ov = null;
    panel.addEventListener('dragenter', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; depth++; if (!ov) { ov = h(`<div class="drop">${t('drop_here')}</div>`); panel.appendChild(ov); } });
    panel.addEventListener('dragleave', () => { depth--; if (depth <= 0 && ov) { ov.remove(); ov = null; depth = 0; } });
    panel.addEventListener('dragover', (e) => e.preventDefault());
    panel.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; if (ov) { ov.remove(); ov = null; }
      const files = [...(e.dataTransfer.files || [])];
      if (files.length && S.cur) Media.pick(files);
    });
  },
};

// ---------------- composer ----------------
const Composer = {
  typingSent: 0,
  render() {
    const box = Chat.els && Chat.els.composer; if (!box) return;
    const c = S.chats.get(S.cur);
    if (c.type === 'direct' && c.blocked) {
      box.innerHTML = `<div class="blocked-bar glass">${t('blocked_you_bar')} · <a href="#" id="unb">${t('unblock')}</a></div>`;
      $('#unb').onclick = (e) => { e.preventDefault(); Chat.toggleBlock(c); };
      return;
    }
    box.innerHTML = `
      <div id="cCtx"></div>
      <div id="emojiBox" hidden></div>
      <div class="cbar glass" id="cbar">
        <button class="ibtn" id="cEmoji" title="Emoji">${icon('smile')}</button>
        <textarea id="cText" rows="1" placeholder="${t('message_ph')}" dir="auto" enterkeyhint="send"></textarea>
        <button class="ibtn" id="cAttach" title="${t('file')}">${icon('clip')}</button>
        <button class="ibtn send" id="cSend" title="${t('send')}">${icon('mic')}</button>
        <input type="file" id="cFiles" multiple hidden>
      </div>`;
    const ta = $('#cText');
    ta.value = Chat.drafts.get(S.cur) || '';
    this.autosize(); this.updateSendBtn();
    ta.addEventListener('input', () => { this.autosize(); this.updateSendBtn(); this.sendTyping(); });
    ta.addEventListener('keydown', (e) => {
      const coarse = matchMedia('(pointer:coarse)').matches;
      if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing) { e.preventDefault(); this.send(); }
      if (e.key === 'Escape') { this.clearCtx(); }
      if (e.key === 'ArrowUp' && !ta.value) {
        const store = S.msgs.get(S.cur);
        const last = store && [...store.list].reverse().find((m) => m.sender_id === S.me.id && m.kind === 'text' && !m.deleted && !m._pending);
        if (last) { e.preventDefault(); this.setEdit(last); }
      }
    });
    ta.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData && e.clipboardData.files || [])];
      if (files.length) { e.preventDefault(); Media.pick(files); }
    });
    $('#cSend').onclick = () => { if (Recorder.active) return; if (ta.value.trim() || Composer.editingMsg()) this.send(); else Recorder.start(); };
    $('#cAttach').onclick = (e) => this.attachMenu(e.currentTarget);
    $('#cEmoji').onclick = () => this.toggleEmoji();
    $('#cFiles').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) Media.pick(f, this._asFile); };
    if (!matchMedia('(pointer:coarse)').matches) ta.focus();
    this.renderCtx();
  },

  editingMsg() { return Chat.editing; },

  autosize() { const ta = $('#cText'); if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; },
  updateSendBtn() {
    const ta = $('#cText'), b = $('#cSend'); if (!ta || !b) return;
    const hasText = ta.value.trim().length > 0 || Chat.editing;
    const want = hasText ? (Chat.editing ? 'check' : 'send') : 'mic';
    if (b.dataset.ic !== want) { b.dataset.ic = want; b.innerHTML = icon(want); b.title = t(want === 'mic' ? 'hold_to_record' : 'send'); }
  },
  sendTyping(action = 'typing') {
    const n = Date.now();
    if (n - this.typingSent < 3000) return;
    this.typingSent = n;
    RT.send({ t: 'typing', chat_id: S.cur, action });
  },

  setReply(m) { Chat.editing = null; Chat.reply = m; this.renderCtx(); const ta = $('#cText'); if (ta) ta.focus(); },
  setEdit(m) {
    Chat.reply = null; Chat.editing = m; this.renderCtx();
    const ta = $('#cText'); if (ta) { ta.value = m.text; this.autosize(); ta.focus(); }
    this.updateSendBtn();
  },
  clearCtx() {
    const wasEdit = !!Chat.editing;
    Chat.reply = null; Chat.editing = null; this.renderCtx();
    if (wasEdit) { const ta = $('#cText'); if (ta) { ta.value = Chat.drafts.get(S.cur) || ''; this.autosize(); } }
    this.updateSendBtn();
  },
  renderCtx() {
    const box = $('#cCtx'); if (!box) return;
    const m = Chat.editing || Chat.reply;
    if (!m) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="ctx glass"><span class="bar"></span>${icon(Chat.editing ? 'edit' : 'reply')}
      <span class="x"><b>${esc(Chat.editing ? t('editing') : t('replying_to', { n: userName(m.sender_id) }))}</b><span>${esc(msgPreview(m))}</span></span>
      <button class="ibtn" id="ctxX">${icon('x')}</button></div>`;
    $('#ctxX').onclick = () => this.clearCtx();
  },

  attachMenu(anchor) {
    const pick = (accept, capture, asFile) => {
      const inp = $('#cFiles'); inp.accept = accept || ''; this._asFile = !!asFile;
      if (capture) inp.setAttribute('capture', capture); else inp.removeAttribute('capture');
      inp.click();
    };
    Menu.open({ anchor }, [
      { icon: 'image', label: t('photo_video'), fn: () => pick('image/*,video/*') },
      matchMedia('(pointer:coarse)').matches ? { icon: 'cam', label: t('camera'), fn: () => pick('image/*', 'environment') } : null,
      { icon: 'doc', label: t('file'), fn: () => pick('', null, true) },
      { icon: 'pin', label: t('location'), fn: () => this.sendLocation() },
    ]);
  },

  toggleEmoji() {
    const box = $('#emojiBox');
    if (!box.hidden) { box.hidden = true; return; }
    const list = '😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😇 🙂 😉 😌 😋 😜 🤗 🤔 🤨 😐 😴 😮 😢 😭 😡 🥺 😱 🤯 😬 🙄 😏 👍 👎 👏 🙏 💪 🤝 👋 ✌️ 👌 🤞 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 🔥 ✨ 🎉 🎂 🌹 🌸 ☀️ 🌙 ⭐ ⚡ ☕ 🍕 🚗 ✈️ 🏠 💯 ✅ ❌ ❓ 👀 💤'.split(' ');
    box.innerHTML = `<div class="emoji-panel glass">${list.map((e) => `<button>${e}</button>`).join('')}</div>`;
    box.hidden = false;
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const ta = $('#cText'); const s = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + b.textContent + ta.value.slice(ta.selectionEnd ?? s);
      ta.selectionStart = ta.selectionEnd = s + b.textContent.length;
      this.autosize(); this.updateSendBtn();
      if (!matchMedia('(pointer:coarse)').matches) ta.focus();
    };
  },

  async send() {
    const ta = $('#cText'); if (!ta) return;
    const text = ta.value.trim();
    const chatId = S.cur;
    if (Chat.editing) {
      const m = Chat.editing;
      if (text === m.text) { this.clearCtx(); return; }
      try { const { message } = await API.patch(`/api/messages/${m.id}`, { text }); Chat.upsert(message); Chat.renderMsgs(); } catch (e) { toast(errText(e.code)); return; }
      Chat.editing = null; ta.value = Chat.drafts.get(chatId) || ''; Chat.drafts.delete(chatId); ta.value = ''; this.autosize(); this.renderCtx(); this.updateSendBtn();
      return;
    }
    if (!text) return;
    const reply = Chat.reply;
    ta.value = ''; Chat.drafts.delete(chatId); this.autosize(); this.updateSendBtn();
    Chat.reply = null; this.renderCtx();
    $('#emojiBox').hidden = true;
    // split very long texts
    const parts = []; for (let i = 0; i < text.length; i += 8000) parts.push(text.slice(i, i + 8000));
    for (const p of parts) await this.post(chatId, { kind: 'text', text: p, reply_to: reply ? reply.id : null }, reply);
  },

  makePending(chatId, body, reply, extra = {}) {
    const client_id = 'c' + Date.now().toString(36) + (++Chat.pendSeq) + Math.random().toString(36).slice(2, 6);
    const m = {
      id: 'p' + client_id, client_id, chat_id: chatId, sender_id: S.me.id, kind: body.kind, text: body.text || '', meta: body.meta || null,
      reply_to: body.reply_to || null, reply: reply ? { id: reply.id, sender_id: reply.sender_id, kind: reply.kind, text: reply.text } : null,
      created_at: Date.now(), reactions: [], _pending: true, _v: 1, _body: body, ...extra,
    };
    const store = S.msgs.get(chatId);
    if (store) store.list.push(m);
    if (chatId === S.cur) { Chat.unreadMark.set(chatId, null); Chat.renderMsgs(); Chat.scrollBottom(); }
    return m;
  },

  async post(chatId, body, reply, pending) {
    const m = pending || this.makePending(chatId, body, reply);
    try {
      const { message } = await API.post(`/api/chats/${chatId}/messages`, { ...m._body, client_id: m.client_id });
      Chat.upsert(message);
      const c = S.chats.get(chatId); if (c) { c.last_message = message; }
      if (chatId === S.cur) { Chat.renderMsgs(); if (Chat.nearBottom(600)) Chat.scrollBottom(); }
      App.renderRows();
      Sound.sent();
      return message;
    } catch (e) {
      m._failed = true; m._v++;
      if (chatId === S.cur) Chat.renderMsgs();
      if (e.code !== 'NETWORK') toast(errText(e.code));
      return null;
    }
  },

  async retry(m) {
    m._failed = false; m._v++;
    Chat.renderMsgs();
    if (m._file && !m._body.file_id) return Media.uploadAndSend(m);
    return this.post(m.chat_id, m._body, null, m);
  },

  sendLocation() {
    if (!navigator.geolocation) return;
    const chatId = S.cur;
    navigator.geolocation.getCurrentPosition(
      (pos) => this.post(chatId, { kind: 'location', text: '', meta: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => toast(errText('default')), { enableHighAccuracy: true, timeout: 15000 });
  },
};

// ---------------- info drawer ----------------
const Info = {
  chatId: null, el: null, tab: 'media',
  close() { if (this.el) this.el.remove(); this.el = null; this.chatId = null; },
  refresh() { if (this.chatId) this.open(this.chatId, this._mode, true); },

  async openUser(uid) {
    if (uid === S.me.id) { App.setTab('settings'); return; }
    const existing = [...S.chats.values()].find((c) => c.type === 'direct' && c.peer.id === uid);
    if (existing) { await Chat.open(existing.id); this.open(existing.id); return; }
    const u = S.users.get(uid); if (u) App.openDirect(u);
  },

  async open(chatId, mode, keep) {
    const panel = $('#chatPanel'); if (!panel) return;
    if (!keep) this.close();
    this.chatId = chatId; this._mode = mode;
    const c = S.chats.get(chatId);
    let data;
    try { data = await API.get('/api/chats/' + chatId); putChat(data.chat); } catch { toast(t('load_failed')); return; }
    data.members.forEach(putUser);
    let extra = {};
    if (c.type === 'direct' && !isSaved(c)) { try { extra = await API.get('/api/users/' + c.peer.id); putUser(extra.user); } catch {} }
    const chat = S.chats.get(chatId);
    const el = this.el || h('<div class="info"></div>');
    const isAdmin = chat.role === 'owner' || chat.role === 'admin';
    const peer = chat.type === 'direct' ? S.users.get(chat.peer.id) : null;
    const link = chat.invite_code ? `${location.origin}/join/${chat.invite_code}` : '';
    el.innerHTML = `
      <div class="ch" style="border:0"><button class="ibtn" id="iBack">${icon(LANG === 'fa' ? 'fwd' : 'back')}</button><div style="flex:1;font-weight:700">${t('info')}</div>
        ${chat.type === 'group' && isAdmin ? `<button class="ibtn" id="iEdit">${icon('edit')}</button>` : ''}</div>
      <div class="scroll">
        <div class="hero">${avatar(chatAvatarObj(chat), 'xl')}<h3>${esc(chatTitle(chat))}</h3>
          <div class="mut small">${chat.type === 'group' ? `${fmt.num(chat.member_count)} ${t('members')}` : isSaved(chat) ? '' : esc(fmt.lastSeen(peer))}</div></div>
        ${mode === 'search' ? '' : `<div class="acts">
          ${chat.type === 'direct' && !isSaved(chat) ? `<button class="ibtn" id="iCall">${icon('phone')}<span>${t('call')}</span></button><button class="ibtn" id="iVideo">${icon('video')}<span>${t('video')}</span></button>` : ''}
          <button class="ibtn" id="iMute">${icon(chat.muted ? 'bell' : 'bellOff')}<span>${t(chat.muted ? 'unmute_chat' : 'mute_chat')}</span></button>
          <button class="ibtn" id="iSearch">${icon('search')}<span>${t('search')}</span></button></div>`}
        <div id="iSearchBox" ${mode === 'search' ? '' : 'hidden'} style="padding:0 14px 8px"><input class="input" id="iQ" placeholder="${t('search_in_chat')}"><div id="iRes" style="margin:6px -14px 0"></div></div>
        ${peer && !isSaved(chat) ? `<div class="sec">
          ${peer.username ? `<div class="li">${icon('at')}<span class="k" dir="ltr" style="text-align:start">@${esc(peer.username)}<small>${t('username')}</small></span></div>` : ''}
          ${peer.bio ? `<div class="li">${icon('info')}<span class="k">${esc(peer.bio)}<small>${t('bio')}</small></span></div>` : ''}
          ${(extra.common_groups || []).length ? `<div class="li">${icon('users')}<span class="k">${extra.common_groups.map((g) => esc(g.title)).join('، ')}<small>${t('common_groups')}</small></span></div>` : ''}
        </div>` : ''}
        ${chat.type === 'group' ? `
          ${chat.description ? `<div class="sec"><div class="li">${icon('info')}<span class="k">${esc(chat.description)}<small>${t('description')}</small></span></div></div>` : ''}
          ${link ? `<div class="sec"><div class="li">${icon('link')}<span class="k" dir="ltr" style="text-align:start;overflow-wrap:anywhere">${esc(link)}<small>${t('invite_link')}</small></span></div>
            <button class="li" id="iCopy">${icon('copy')}<span class="k">${t('copy_link')}</span></button>
            <button class="li" id="iReset">${icon('link')}<span class="k">${t('reset_link')}</span></button></div>` : ''}
          <div class="sec"><h4>${t('members_t')} · ${fmt.num(data.members.length)}</h4>
            ${isAdmin ? `<button class="li" id="iAdd">${icon('userPlus')}<span class="k">${t('add_members')}</span></button>` : ''}
            ${data.members.map((u) => `<button class="li" data-mem="${u.id}" style="padding:8px 16px">${avatar(u, 'sm', u.online)}<span class="k">${esc(u.id === S.me.id ? u.name + ' (' + t('you') + ')' : u.name)}<small>${esc(fmt.lastSeen(u))}</small></span>${u.role !== 'member' ? `<span class="mut small">${t(u.role)}</span>` : ''}</button>`).join('')}
          </div>` : ''}
        <div class="tabs" id="iTabs">${['media', 'files', 'voices'].map((x) => `<button data-t="${x}" class="${this.tab === x ? 'on' : ''}">${t(x)}</button>`).join('')}</div>
        <div id="iGal"></div>
        <div class="sec">
          ${chat.type === 'direct' && !isSaved(chat) ? `<button class="li danger" id="iBlock">${icon('ban')}<span class="k">${t(chat.blocked ? 'unblock' : 'block')}</span></button>` : ''}
          <button class="li danger" id="iClear">${icon('trash')}<span class="k">${t('clear_history')}</span></button>
          ${chat.type === 'group' ? `<button class="li danger" id="iLeave">${icon('logout')}<span class="k">${t('leave_group')}</span></button>` : ''}
        </div><div style="height:20px"></div>
      </div>`;
    if (!this.el) { panel.appendChild(el); this.el = el; }
    const on = (id, fn) => { const b = $('#' + id, el); if (b) b.onclick = fn; };
    on('iBack', () => this.close());
    on('iCall', () => Call.start(chatId, false));
    on('iVideo', () => Call.start(chatId, true));
    on('iMute', async () => { await Chat.setSetting(chatId, { muted: !chat.muted }); this.refresh(); });
    on('iSearch', () => { $('#iSearchBox', el).hidden = false; $('#iQ', el).focus(); });
    on('iCopy', () => navigator.clipboard.writeText(link).then(() => toast(t('copied'))));
    on('iReset', async () => { await API.post(`/api/chats/${chatId}/invite/reset`); this.refresh(); });
    on('iAdd', () => Modals.addMembers(chatId, data.members.map((u) => u.id)));
    on('iEdit', () => this.editGroup(chat));
    on('iBlock', () => Chat.toggleBlock(chat));
    on('iClear', () => Chat.clearHistory(chatId));
    on('iLeave', () => Chat.leave(chat));
    const members = $$('[data-mem]', el);
    members.forEach((b) => b.onclick = (e) => this.memberMenu(chat, data.members.find((u) => u.id === Number(b.dataset.mem)), e));
    $$('#iTabs button', el).forEach((b) => b.onclick = () => { this.tab = b.dataset.t; $$('#iTabs button', el).forEach((x) => x.classList.toggle('on', x === b)); this.loadGallery(chatId); });
    const q = $('#iQ', el);
    let st;
    q.oninput = () => {
      clearTimeout(st);
      st = setTimeout(async () => {
        const term = q.value.trim(); const res = $('#iRes', el);
        if (!term) { res.innerHTML = ''; return; }
        const { messages } = await API.get(`/api/chats/${chatId}/search?q=${encodeURIComponent(term)}`);
        res.innerHTML = messages.length ? messages.map((m) => `<div class="row" data-jm="${m.id}"><div class="mid"><div class="t1"><span class="name">${esc(userName(m.sender_id))}</span><span class="time">${fmt.listTime(m.created_at)}</span></div><div class="t2"><span class="prev">${esc(m.text)}</span></div></div></div>`).join('') : `<div class="empty" style="height:auto;padding:16px">${t('no_results')}</div>`;
        res.onclick = (e) => { const r = e.target.closest('[data-jm]'); if (r) { this.close(); Chat.jumpTo(Number(r.dataset.jm)); } };
      }, 300);
    };
    if (mode === 'search') q.focus();
    this.loadGallery(chatId);
  },

  async loadGallery(chatId) {
    const box = this.el && $('#iGal', this.el); if (!box) return;
    const kinds = { media: 'image,video', files: 'file,audio', voices: 'voice' }[this.tab];
    try {
      const { messages } = await API.get(`/api/chats/${chatId}/media?kind=${kinds}`);
      if (!this.el) return;
      if (!messages.length) { box.innerHTML = `<div class="empty" style="height:auto;padding:20px">—</div>`; return; }
      if (this.tab === 'media') {
        box.innerHTML = `<div class="gal">${messages.map((m) => `<div data-g="${m.id}">${m.kind === 'image' ? `<img src="${m.file.url}" loading="lazy" alt="">` : `<video src="${m.file.url}#t=0.1" preload="metadata" muted></video>`}</div>`).join('')}</div>`;
        box.onclick = (e) => { const g = e.target.closest('[data-g]'); if (g) Viewer.open(messages.find((m) => m.id === Number(g.dataset.g)), messages.slice().reverse()); };
      } else {
        box.innerHTML = `<div class="sec">${messages.map((m) => m.kind === 'voice' ? `<div class="li" style="display:block">${Voice.html(m, m.file.url)}<div class="mut small">${esc(userName(m.sender_id))} · ${fmt.listTime(m.created_at)}</div></div>`
          : `<a class="li" href="${m.file.url}" download="${esc(m.file.name)}" style="text-decoration:none">${icon('doc')}<span class="k">${esc(m.file.name)}<small>${fmt.size(m.file.size)} · ${fmt.listTime(m.created_at)}</small></span></a>`).join('')}</div>`;
        box.onclick = (e) => { const vp = e.target.closest('[data-voice]'); if (vp) Voice.toggle(vp.dataset.voice, messages); const w = e.target.closest('.wave'); if (w) Voice.seek(w, e); };
      }
    } catch { box.innerHTML = ''; }
  },

  memberMenu(chat, u, ev) {
    if (!u || u.id === S.me.id) return;
    const amOwner = chat.role === 'owner';
    const amAdmin = amOwner || chat.role === 'admin';
    Menu.open(ev, [
      { icon: 'chat', label: t('send_message'), fn: () => { this.close(); App.openDirect(u); } },
      amOwner && u.role !== 'owner' ? { icon: 'shield', label: t(u.role === 'admin' ? 'remove_admin' : 'make_admin'), fn: async () => { await API.patch(`/api/chats/${chat.id}/members/${u.id}`, { role: u.role === 'admin' ? 'member' : 'admin' }); this.refresh(); } } : null,
      amAdmin && u.role !== 'owner' ? { icon: 'trash', label: t('remove_member'), danger: true, fn: async () => { await API.del(`/api/chats/${chat.id}/members/${u.id}`); this.refresh(); } } : null,
    ]);
  },

  editGroup(chat) {
    const m = Modals.open(`<header><h3>${t('edit_group')}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body">
        <div style="display:flex;gap:12px;align-items:center"><label style="cursor:pointer"><div id="egAv">${avatar(chatAvatarObj(chat), 'lg')}</div><input type="file" accept="image/*" id="egF" hidden></label>
        <input class="input" id="egN" maxlength="80" value="${esc(chat.title)}"></div>
        <label class="f">${t('description')}<textarea class="input" id="egD" rows="3" maxlength="300">${esc(chat.description || '')}</textarea></label>
      </div>
      <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="egGo">${t('save')}</button></footer>`);
    let av;
    $('#egF', m.el).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const up = await API.upload(await Media.squareAvatar(f), 'group.jpg'); av = up.id; $('#egAv', m.el).innerHTML = avatar({ avatar: up.url }, 'lg'); };
    $('#egGo', m.el).onclick = async () => {
      const body = { title: $('#egN', m.el).value, description: $('#egD', m.el).value };
      if (av) body.avatar_file = av;
      try { const { chat: c } = await API.patch('/api/chats/' + chat.id, body); putChat(c); m.close(); this.refresh(); Chat.renderHeader(); App.renderRows(); } catch (e) { toast(errText(e.code)); }
    };
  },
};
