'use strict';
/* Core: icons, DOM helpers, API, store, realtime socket, formatting, sounds */

// ---------- icons (stroke icons, 24x24) ----------
const IC = {
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  video: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  videoOff: '<path d="M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 8v8"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  fwd: '<path d="M9 18l6-6-6-6"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
  micOff: '<path d="m2 2 20 20M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11v-1m14 0v1a7 7 0 0 1-.1 1.2M12 18v4M8 22h8"/>',
  clip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  cam: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  bellOff: '<path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17.9 17.9 0 0 1 18 8M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20"/>',
  pinT: '<path d="M12 17v5M9 10.8V4h6v6.8l3 3.2v2H6v-2z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  devices: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  phoneIn: '<path d="M16 2v6h6M22 2l-6 6"/>' ,
  phoneOut: '<path d="M22 8V2h-6M16 8l6-6"/>',
  phoneMiss: '<path d="m16 2 6 6M22 2l-6 6"/>',
  hangup: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 4.2 2 2 0 0 1 5.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L9 9.8" transform="rotate(135 12 12)"/>',
  flip: '<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3M6 2l3 3-3 3"/>',
  min: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  app: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;
const TICK1 = '<svg class="ticks" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TICK2 = (read) => `<svg class="ticks${read ? ' read' : ''}" viewBox="0 0 24 24"><path d="M2 12.5l4.5 4.5L16 7.5"/><path d="M11.5 16l1 1L22 7.5"/></svg>`;
const TICK0 = '<svg class="ticks" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>';

// ---------- DOM helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function h(html) { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function linkify(text) {
  return esc(text).replace(/\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi, (u) => {
    const href = u.startsWith('http') ? u : 'https://' + u;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
}
const isEmojiOnly = (s) => s && s.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s) && !/^[\d#*\s]+$/.test(s);

let toastTimer;
function toast(msg) {
  $$('.toast').forEach((x) => x.remove());
  const el = h(`<div class="toast" role="status">${esc(msg)}</div>`);
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
const AV_COLORS = ['#122029', '#2f6f86', '#6b4fe0', '#b0306e', '#147a6a', '#c25a12', '#3550b4', '#5f7a14'];
function avatar(o, cls = '', dot = false) {
  if (!o) return `<div class="av ${cls}">?</div>`;
  if (o.saved) return `<div class="av saved ${cls}">${icon('bookmark')}</div>`;
  const color = AV_COLORS[(o.id || 0) % AV_COLORS.length];
  const inner = o.avatar ? `<img src="${esc(o.avatar)}" alt="" loading="lazy" decoding="async">` : esc(initials(o.name || o.title));
  return `<div class="av ${cls}" style="background:${color}">${inner}${dot ? '<span class="dot"></span>' : ''}</div>`;
}

// ---------- formatting ----------
const fmt = {
  time(ts) { return new Date(ts).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit', hour12: false }); },
  sameDay(a, b) { const x = new Date(a), y = new Date(b); return x.toDateString() === y.toDateString(); },
  day(ts) {
    const d = new Date(ts); const n = new Date();
    if (this.sameDay(d, n)) return t('today');
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this.sameDay(d, y)) return t('yesterday');
    const opts = { day: 'numeric', month: 'long' };
    if (d.getFullYear() !== n.getFullYear() || LANG === 'fa') opts.year = 'numeric';
    return d.toLocaleDateString(LOCALE(), opts);
  },
  listTime(ts) {
    if (!ts) return '';
    const d = new Date(ts); const n = new Date();
    if (this.sameDay(d, n)) return this.time(ts);
    if (n - d < 6 * 86400000) return d.toLocaleDateString(LOCALE(), { weekday: 'short' });
    return d.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' });
  },
  lastSeen(u) {
    if (!u) return '';
    if (u.online) return t('online');
    if (!u.last_seen) return t('last_seen_recently');
    const diff = Date.now() - u.last_seen;
    if (diff < 60000) return t('last_seen', { t: t('just_now') });
    if (diff < 3600000) return t('last_seen', { t: t('min_ago', { n: this.num(Math.floor(diff / 60000)) }) });
    if (this.sameDay(u.last_seen, Date.now())) return t('last_seen', { t: t('today_at', { t: this.time(u.last_seen) }) });
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this.sameDay(u.last_seen, y)) return t('last_seen', { t: t('yesterday_at', { t: this.time(u.last_seen) }) });
    return t('last_seen', { t: new Date(u.last_seen).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) });
  },
  num(n) { return Number(n).toLocaleString(LOCALE()); },
  dur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    const out = `${m}:${String(s).padStart(2, '0')}`;
    return LANG === 'fa' ? out.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : out;
  },
  size(b) {
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${this.num(b.toFixed(i ? 1 : 0))} ${u[i]}`;
  },
};

// ---------- API ----------
const API = {
  token: (() => { try { return localStorage.getItem('sc_token'); } catch { return null; } })(),
  setToken(tok) { this.token = tok; try { tok ? localStorage.setItem('sc_token', tok) : localStorage.removeItem('sc_token'); } catch {} },
  async req(method, path, body) {
    let r;
    try {
      r = await fetch(path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
    } catch { const e = new Error('NETWORK'); e.code = 'NETWORK'; throw e; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.error || 'HTTP_' + r.status); e.code = j.error || 'default'; e.status = r.status;
      if (r.status === 401 && path !== '/api/auth/verify') App.onUnauthorized();
      throw e;
    }
    return j;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b || {}); },
  patch(p, b) { return this.req('PATCH', p, b || {}); },
  del(p) { return this.req('DELETE', p); },
  upload(file, name, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', '/api/files');
      if (this.token) x.setRequestHeader('Authorization', 'Bearer ' + this.token);
      x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      x.setRequestHeader('X-File-Name', encodeURIComponent(name || file.name || 'file'));
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let j = {}; try { j = JSON.parse(x.responseText); } catch {}
        if (x.status >= 200 && x.status < 300) resolve(j.file);
        else { const e = new Error(j.error || 'UPLOAD'); e.code = j.error || 'default'; reject(e); }
      };
      x.onerror = () => { const e = new Error('NETWORK'); e.code = 'NETWORK'; reject(e); };
      x.send(file);
      if (onProgress) onProgress(0);
      file._xhr = x;
    });
  },
};

// ---------- store ----------
const S = {
  me: null,
  config: {},
  chats: new Map(),      // id -> chat
  msgs: new Map(),       // chatId -> { list: [], hasMore, loaded }
  users: new Map(),      // id -> user
  cur: null,             // open chat id
  typing: new Map(),     // chatId -> Map(userId -> {until, action})
  tab: 'chats',
  filter: 'all',
  query: '',
  ice: [{ urls: ['stun:stun.l.google.com:19302'] }],
  online: navigator.onLine,
  wsUp: false,
  sounds: (() => { try { return localStorage.getItem('sc_sounds') !== '0'; } catch { return true; } })(),
};

function putUser(u) {
  if (!u || !u.id) return u;
  const prev = S.users.get(u.id) || {};
  const merged = { ...prev, ...u };
  S.users.set(u.id, merged);
  return merged;
}
function putChat(c) {
  if (!c) return c;
  learn(c);
  if (c.peer) c.peer = putUser(c.peer);
  const prev = S.chats.get(c.id);
  const merged = prev ? { ...prev, ...c } : c;
  S.chats.set(c.id, merged);
  return merged;
}
function chatTitle(c) {
  if (!c) return '';
  if (c.type === 'direct' && c.peer && S.me && c.peer.id === S.me.id) return t('saved_messages');
  return c.type === 'direct' ? (c.peer ? (S.users.get(c.peer.id) || c.peer).name : c.title) : c.title;
}
function chatAvatarObj(c) {
  if (c.type === 'direct' && c.peer && S.me && c.peer.id === S.me.id) return { saved: true };
  if (c.type === 'direct') return S.users.get(c.peer.id) || c.peer;
  return { id: c.id, name: c.title, avatar: c.avatar };
}
const isSaved = (c) => c && c.type === 'direct' && c.peer && S.me && c.peer.id === S.me.id;
function learn(m) {
  if (m && m.sender_id && m.sender_name && !S.users.has(m.sender_id)) S.users.set(m.sender_id, { id: m.sender_id, name: m.sender_name });
  if (m && m.last_message) learn(m.last_message);
  return m;
}
const userName = (id) => (S.me && id === S.me.id ? t('you') : ((S.users.get(id) || {}).name || '…'));

function msgPreview(m) {
  if (!m) return '';
  if (m.deleted) return t('deleted_msg');
  switch (m.kind) {
    case 'image': return '🖼 ' + (m.text || t('photo'));
    case 'video': return '🎬 ' + (m.text || t('video'));
    case 'voice': return '🎤 ' + t('voice') + (m.meta && m.meta.duration ? ' ' + fmt.dur(m.meta.duration) : '');
    case 'audio': return '🎵 ' + (m.file ? m.file.name : '');
    case 'file': return '📎 ' + (m.file ? m.file.name : t('file'));
    case 'location': return '📍 ' + t('location');
    case 'call': return callLabel(m);
    case 'system': return sysText(m);
    default: return m.text;
  }
}
function callLabel(m) {
  const meta = m.meta || {};
  const mine = S.me && m.sender_id === S.me.id;
  const icon = meta.video ? '📹 ' : '📞 ';
  if (meta.status === 'ended') return icon + (mine ? t('outgoing_call') : (meta.video ? t('incoming_video') : t('incoming_call'))) + ' · ' + fmt.dur(meta.duration);
  if (meta.status === 'busy') return icon + t('busy_call');
  if (meta.status === 'declined') return icon + t('declined_call');
  if (mine) return icon + t('cancelled_call');
  return icon + t('missed_call');
}
function sysText(m) {
  const meta = m.meta || {};
  const u = userName(m.sender_id);
  const names = (meta.users || []).map((x) => (S.me && x.id === S.me.id ? t('you') : x.name)).join('، ');
  switch (meta.action) {
    case 'created': return t('sys_created', { u, t: meta.title || '' });
    case 'renamed': return t('sys_renamed', { u, t: meta.title || '' });
    case 'added': return t('sys_added', { u, x: names });
    case 'removed': return t('sys_removed', { u, x: names });
    case 'left': return t('sys_left', { u });
    case 'joined': return t('sys_joined', { u });
    default: return '';
  }
}

// ---------- sounds (generated, no audio files) ----------
const Sound = {
  ctx: null,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  tone(freqs, dur, vol = 0.12, when = 0) {
    const ctx = this.ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(ctx.destination);
    for (const f of [].concat(freqs)) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(g); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  },
  msg() { if (!S.sounds) return; this.tone(880, 0.12, 0.08); this.tone(1320, 0.16, 0.06, 0.09); },
  sent() { if (!S.sounds) return; this.tone(660, 0.08, 0.04); },
  loopTimer: null,
  startRing(kind) {
    this.stopRing();
    const play = () => {
      if (kind === 'incoming') { this.tone([660, 880], 0.35, 0.12); this.tone([660, 880], 0.35, 0.12, 0.45); }
      else this.tone(425, 1.0, 0.07);
    };
    play();
    this.loopTimer = setInterval(play, kind === 'incoming' ? 2200 : 4000);
    if (kind === 'incoming' && navigator.vibrate) { try { navigator.vibrate([400, 200, 400]); } catch {} }
  },
  stopRing() { clearInterval(this.loopTimer); this.loopTimer = null; if (navigator.vibrate) { try { navigator.vibrate(0); } catch {} } },
  end() { this.tone(480, 0.25, 0.08); this.tone(380, 0.35, 0.08, 0.28); },
};

// ---------- realtime ----------
const RT = {
  ws: null, retry: 0, timer: null, handlers: {}, queue: [],
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
  connect() {
    if (!API.token) return;
    clearTimeout(this.timer);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(API.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0; S.wsUp = true; App.connState();
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      if (S.cur) this.send({ t: 'focus', chat_id: document.hidden ? null : S.cur });
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'auth-error') { App.onUnauthorized(); return; }
      for (const fn of this.handlers[m.t] || []) { try { fn(m); } catch (err) { console.error(err); } }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      S.wsUp = false; App.connState();
      if (!API.token) return;
      const delay = Math.min(15000, 500 * 2 ** this.retry++) + Math.random() * 400;
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  },
  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else if (m.t.startsWith('call:')) this.queue.push(m);
  },
  close() { const w = this.ws; this.ws = null; if (w) w.close(); clearTimeout(this.timer); S.wsUp = false; },
};
// keep-alive for proxies/mobile networks
setInterval(() => { if (RT.ws && RT.ws.readyState === 1) RT.send({ t: 'ping' }); }, 20000);
