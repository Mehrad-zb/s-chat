'use strict';
/* Realtime handlers, push notifications, service worker, boot */

// ---------------- push ----------------
const Push = {
  supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
  state() { if (!this.supported()) return 'unsupported'; return Notification.permission; },
  statusText() {
    const s = this.state();
    return s === 'granted' ? t('notif_on') : s === 'denied' ? t('notif_blocked') : s === 'unsupported' ? t('notif_unsupported') : t('notifications');
  },
  async init() { if (this.state() === 'granted') this.subscribe(); },
  async request() {
    if (!this.supported()) { toast(t('notif_unsupported')); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') { await this.subscribe(); toast(t('notif_on')); }
    this.renderBanner();
  },
  async subscribe() {
    try {
      if (!S.config.vapid) return;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const key = Uint8Array.from(atob(S.config.vapid.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
      if (sub) {
        const cur = sub.options && sub.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey);
        if (cur && cur.length === key.length && cur.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await API.post('/api/push/subscribe', { subscription: sub.toJSON() });
    } catch (e) { console.warn('[push]', e); }
  },
  async unsubscribe() {
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch {}
  },
  renderBanner() {
    const box = $('#notifBanner'); if (!box) return;
    let dismissed = false; try { dismissed = localStorage.getItem('sc_nb') === '1'; } catch {}
    if (this.state() !== 'default' || dismissed) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="banner">${icon('bell')}<span class="k">${t('notif_banner')}</span><button class="btn" style="min-height:34px;padding:4px 14px;font-size:13px" id="nbOn">${t('enable_notif')}</button><button class="ibtn" id="nbX" style="width:32px;height:32px">${icon('x')}</button></div>`;
    $('#nbOn').onclick = () => this.request();
    $('#nbX').onclick = () => { try { localStorage.setItem('sc_nb', '1'); } catch {} box.innerHTML = ''; };
  },
};

// ---------------- realtime handlers ----------------
RT.on('hello', (m) => { if (m.ice && m.ice.length) S.ice = m.ice; });

RT.on('message', async (m) => {
  const msg = m.message;
  let c = S.chats.get(msg.chat_id);
  let fresh = false;
  if (!c) {
    try { const r = await API.get('/api/chats/' + msg.chat_id); c = putChat(r.chat); fresh = true; } catch { return; }
  }
  const mine = S.me && msg.sender_id === S.me.id;
  if (msg.sender_id && !S.users.has(msg.sender_id) && c.type === 'group') await Chat.loadMembers(msg.chat_id);
  const store = S.msgs.get(msg.chat_id);
  const isOpen = S.cur === msg.chat_id;
  if (store && store.loaded) Chat.upsert(msg);
  if (!c.last_message || msg.id >= c.last_message.id) c.last_message = msg;
  if (msg.sender_id) { const map = S.typing.get(msg.chat_id); if (map) map.delete(msg.sender_id); }
  if (!mine && msg.kind !== 'system') {
    RT.send({ t: 'delivered', chat_id: msg.chat_id, upto: msg.id });
    const visible = isOpen && !document.hidden;
    if (!visible || !Chat.nearBottom(300)) {
      if (!fresh) c.unread = (c.unread || 0) + 1;
      if (!c.muted && (!visible || !isOpen)) Sound.msg();
    }
    if (c.archived && !c.muted) c.archived = false;
  }
  if (isOpen) {
    const atBottom = Chat.nearBottom(250);
    Chat.renderMsgs();
    if (mine || atBottom) Chat.scrollBottom(true);
    else { const b = Chat.els.toBottom; b.hidden = false; const bd = b.querySelector('.badge'); bd.hidden = false; bd.textContent = fmt.num(c.unread || 1); }
    Chat.renderHeader();
    Chat.markRead();
  }
  App.renderRows(); App.updateBadges();
});

RT.on('message:update', (m) => {
  const msg = m.message;
  if (Chat.upsert(msg) && S.cur === msg.chat_id) Chat.renderMsgs();
  const c = S.chats.get(msg.chat_id);
  if (c && c.last_message && c.last_message.id === msg.id) { c.last_message = msg; App.renderRows(); }
});

RT.on('message:hide', (m) => Chat.removeLocal(m.chat_id, m.id));
RT.on('reactions', (m) => Chat.applyReactions(m.chat_id, m.id, m.reactions));

let receiptTimers = new Map();
RT.on('receipt', (m) => {
  const c = S.chats.get(m.chat_id); if (!c) return;
  if (c.type === 'direct') {
    if (m.read) c.peer_last_read = Math.max(c.peer_last_read || 0, m.read);
    if (m.delivered) c.peer_last_delivered = Math.max(c.peer_last_delivered || 0, m.delivered);
    if (S.cur === m.chat_id) Chat.refreshTicks();
    App.renderRows();
  } else {
    // group ticks are min() across members — refetch lazily
    clearTimeout(receiptTimers.get(m.chat_id));
    receiptTimers.set(m.chat_id, setTimeout(async () => {
      try { const r = await API.get('/api/chats/' + m.chat_id); putChat(r.chat); if (S.cur === m.chat_id) Chat.refreshTicks(); App.renderRows(); } catch {}
    }, 800));
  }
});

RT.on('read-sync', (m) => {
  const c = S.chats.get(m.chat_id); if (!c) return;
  c.last_read = Math.max(c.last_read || 0, m.upto); c.unread = 0;
  App.renderRows(); App.updateBadges();
});

RT.on('typing', (m) => Chat.setTyping(m.chat_id, m.user_id, m.action));

RT.on('presence', (m) => {
  putUser({ id: m.user_id, online: m.online, last_seen: m.last_seen });
  if (S.cur) { const c = S.chats.get(S.cur); if (c && c.type === 'direct' && c.peer.id === m.user_id) Chat.renderHeader(); }
  App.renderRows();
});

RT.on('user', (m) => {
  putUser(m.user);
  if (S.cur) Chat.renderHeader();
  App.renderRows();
});

RT.on('chat', (m) => {
  putChat(m.chat);
  if (S.cur === m.chat.id) { Chat.renderHeader(); Chat.refreshTicks(); }
  App.renderRows(); App.updateBadges();
});

RT.on('chat:removed', (m) => Chat.removeChat(m.chat_id));

// ---------------- page lifecycle ----------------
document.addEventListener('visibilitychange', () => {
  if (!API.token) return;
  RT.send({ t: 'focus', chat_id: document.hidden ? null : S.cur });
  if (!document.hidden) {
    if (!RT.ws || RT.ws.readyState > 1) RT.connect();
    Chat.markRead();
  }
});
window.addEventListener('online', () => { if (API.token && (!RT.ws || RT.ws.readyState > 1)) RT.connect(); App.connState(); });
window.addEventListener('offline', () => App.connState());
window.addEventListener('popstate', () => { if (S.cur && window.innerWidth <= 820) Chat.close(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented && S.cur && !document.querySelector('.ov,.viewer,.pop,#callOv') && !Chat.reply && !Chat.editing) {
    if (Info.el) Info.close(); else if (window.innerWidth > 820) Chat.close();
  }
});
// unlock audio on first interaction (for ringtones)
window.addEventListener('pointerdown', () => Sound.ensure(), { once: true });

// ---------------- service worker ----------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.warn('[sw]', e));
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'open-chat' && d.chat_id) Chat.open(Number(d.chat_id));
  });
}

App.boot();
