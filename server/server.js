'use strict';
// S-Chat server — zero-dependency Node.js (22+) messenger backend.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open } = require('./lib/db');
const ws = require('./lib/ws');
const { Pusher } = require('./lib/push');
const { sendEmail, sendSms } = require('./lib/notify');

// ---------- config ----------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnv(path.join(__dirname, '..', '.env'));
const cfg = process.env;
const PORT = parseInt(cfg.PORT || '3000', 10);
const DATA_DIR = path.resolve(cfg.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.resolve(cfg.PUBLIC_DIR || path.join(__dirname, '..', 'public'));
const MAX_UPLOAD = parseInt(cfg.MAX_UPLOAD_MB || '200', 10) * 1024 * 1024;
const DEV = cfg.DEV_MODE === '1';
const APP_NAME = cfg.APP_NAME && !['S-Chat', 'Connection'].includes(cfg.APP_NAME) ? cfg.APP_NAME : 'Satin Connect';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = open(DATA_DIR);
const pusher = new Pusher(db, cfg.VAPID_SUBJECT || `mailto:${cfg.SMTP_USER || 'admin@example.com'}`);
const now = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const q = (sql) => db.prepare(sql);

// Settings editable from the /setup page (stored in the DB, override .env)
const SETTING_KEYS = ['MAIL_RELAY_URL', 'MAIL_RELAY_TOKEN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'VOIPMS_USER', 'VOIPMS_API_PASS', 'VOIPMS_DID'];
function dbSettings() { const r = db.prepare("SELECT v FROM kv WHERE k='settings'").get(); return r ? JSON.parse(r.v) : {}; }
function conf() { return { ...cfg, ...Object.fromEntries(Object.entries(dbSettings()).filter(([, v]) => v !== '' && v != null)) }; }

// ---------- helpers ----------
class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const fail = (status, code) => { throw new HttpError(status, code); };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const b = await readBody(req, 1024 * 1024);
  if (!b.length) return {};
  try { return JSON.parse(b.toString('utf8')); } catch { fail(400, 'BAD_JSON'); }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function tokenFrom(req, url) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (url && url.searchParams.get('token')) return url.searchParams.get('token');
  return parseCookies(req).sc_token || null;
}

function sessionFor(token) {
  if (!token) return null;
  const s = q('SELECT * FROM sessions WHERE token_hash = ?').get(sha(token));
  if (!s) return null;
  if (now() - s.last_used > 60000) q('UPDATE sessions SET last_used = ? WHERE id = ?').run(now(), s.id);
  return s;
}

const fileUrl = (fid) => {
  if (!fid) return null;
  const f = q('SELECT disk_name FROM files WHERE id = ?').get(fid);
  return f ? `/f/${f.disk_name}` : null;
};

function normalizeTarget(raw) {
  const t = String(raw || '').trim();
  if (t.includes('@')) {
    const e = t.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400, 'BAD_EMAIL');
    return { kind: 'email', value: e };
  }
  // Normalise Persian/Arabic digits and keep + and digits.
  let p = t.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  p = p.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) {
    if (/^09\d{9}$/.test(p)) p = '+98' + p.slice(1);          // Iranian mobile 09xx
    else if (/^\d{10}$/.test(p)) p = '+1' + p;                 // Canada / US
    else if (/^1\d{10}$/.test(p)) p = '+' + p;
    else fail(400, 'BAD_PHONE');
  }
  if (!/^\+\d{8,15}$/.test(p)) fail(400, 'BAD_PHONE');
  return { kind: 'phone', value: p };
}

function publicUser(u, viewerId) {
  if (!u) return null;
  const online = isOnline(u.id);
  const showSeen = u.show_last_seen || u.id === viewerId;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    bio: u.bio,
    avatar: fileUrl(u.avatar_file),
    online: showSeen ? online : false,
    last_seen: showSeen ? u.last_seen : null,
  };
}

function selfUser(u) {
  return { ...publicUser(u, u.id), phone: u.phone, email: u.email, show_last_seen: !!u.show_last_seen, has_password: !!u.password_hash };
}

// ---------- passwords (scrypt) ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, k] = stored.split('$');
  const key = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(k, 'base64');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
function validPassword(pw) { return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128; }

const getUser = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
const memberOf = (chatId, userId) => q('SELECT * FROM members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
const chatMembers = (chatId) => q('SELECT user_id FROM members WHERE chat_id = ?').all(chatId).map((r) => r.user_id);

function isBlocked(a, b) {
  return !!q('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?').get(a, b);
}

function msgOut(m, viewerId) {
  if (!m) return null;
  const out = {
    id: m.id,
    chat_id: m.chat_id,
    sender_id: m.sender_id,
    sender_name: m.sender_id ? ((getUser(m.sender_id) || {}).name || '') : '',
    kind: m.kind,
    text: m.deleted ? '' : m.text,
    meta: m.meta && !m.deleted ? JSON.parse(m.meta) : null,
    reply_to: m.reply_to,
    forwarded_from: m.forwarded_from,
    client_id: m.client_id,
    edited_at: m.edited_at,
    deleted: !!m.deleted,
    created_at: m.created_at,
    file: null,
    reactions: [],
    reply: null,
  };
  if (m.file_id && !m.deleted) {
    const f = q('SELECT * FROM files WHERE id = ?').get(m.file_id);
    if (f) out.file = { id: f.id, name: f.name, mime: f.mime, size: f.size, url: `/f/${f.disk_name}` };
  }
  if (!m.deleted) {
    out.reactions = q('SELECT user_id, emoji FROM reactions WHERE message_id = ?').all(m.id);
  }
  if (m.reply_to) {
    const r = q('SELECT id, sender_id, kind, text, deleted, file_id FROM messages WHERE id = ?').get(m.reply_to);
    if (r) out.reply = { id: r.id, sender_id: r.sender_id, kind: r.kind, text: r.deleted ? '' : r.text.slice(0, 200), deleted: !!r.deleted };
  }
  return out;
}

function chatOut(chatId, userId) {
  const c = q('SELECT * FROM chats WHERE id = ?').get(chatId);
  if (!c) return null;
  const me = memberOf(chatId, userId);
  if (!me) return null;
  const members = q('SELECT user_id, role FROM members WHERE chat_id = ?').all(chatId);
  const out = {
    id: c.id,
    type: c.type,
    title: c.title,
    description: c.description,
    avatar: fileUrl(c.avatar_file),
    created_at: c.created_at,
    member_count: members.length,
    role: me.role,
    muted: !!me.muted,
    pinned: !!me.pinned,
    archived: !!me.archived,
    last_read: me.last_read,
    invite_code: c.type === 'group' && me.role !== 'member' ? c.direct_key : undefined,
  };
  if (c.type === 'direct') {
    const otherId = (members.find((m) => m.user_id !== userId) || { user_id: userId }).user_id;
    const other = getUser(otherId);
    out.peer = publicUser(other, userId);
    out.title = other ? other.name : '';
    out.avatar = out.peer ? out.peer.avatar : null;
    out.blocked = isBlocked(userId, otherId);
    out.peer_last_read = (memberOf(chatId, otherId) || {}).last_read || 0;
    out.peer_last_delivered = (memberOf(chatId, otherId) || {}).last_delivered || 0;
  } else {
    // For groups, read/delivered = min across other members (so ticks are honest)
    const others = q('SELECT MIN(last_read) r, MIN(last_delivered) d FROM members WHERE chat_id = ? AND user_id != ?').get(chatId, userId);
    out.peer_last_read = others.r || 0;
    out.peer_last_delivered = others.d || 0;
  }
  const last = q(`SELECT m.* FROM messages m WHERE m.chat_id = ? AND m.id > ?
      AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ?)
      ORDER BY m.id DESC LIMIT 1`).get(chatId, me.cleared_before, userId);
  out.last_message = last ? msgOut(last, userId) : null;
  out.unread = q(`SELECT COUNT(*) n FROM messages WHERE chat_id = ? AND id > ? AND id > ? AND sender_id != ? AND deleted = 0 AND kind != 'system'`)
    .get(chatId, me.last_read, me.cleared_before, userId).n;
  out.mentions = 0;
  return out;
}

// ---------- realtime ----------
const sockets = new Map(); // userId -> Set<WSConn>
function isOnline(uid) { const s = sockets.get(uid); return !!(s && s.size); }
function emitTo(uid, evt) { const set = sockets.get(uid); if (set) for (const c of set) c.send(evt); }
function emitChat(chatId, evt, exceptUser) { for (const uid of chatMembers(chatId)) if (uid !== exceptUser) emitTo(uid, evt); }
function contactsOf(uid) {
  return q(`SELECT DISTINCT m2.user_id FROM members m1 JOIN members m2 ON m1.chat_id = m2.chat_id
            WHERE m1.user_id = ? AND m2.user_id != ?`).all(uid, uid).map((r) => r.user_id);
}
function broadcastPresence(uid) {
  const u = getUser(uid);
  if (!u) return;
  const evt = { t: 'presence', user_id: uid, online: u.show_last_seen ? isOnline(uid) : false, last_seen: u.show_last_seen ? u.last_seen : null };
  for (const c of contactsOf(uid)) emitTo(c, evt);
}

// ---------- OTP ----------
const ipHits = new Map();
function rateLimit(key, max, windowMs) {
  const t = now();
  const arr = (ipHits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) fail(429, 'RATE_LIMIT');
  arr.push(t); ipHits.set(key, arr);
}
setInterval(() => { const t = now(); for (const [k, v] of ipHits) if (!v.some((x) => t - x < 3600000)) ipHits.delete(k); }, 600000).unref();

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
}

async function startOtp(target, req) {
  rateLimit('otp-ip:' + clientIp(req), 10, 3600000);
  const c0 = conf();
  if (!DEV && target.kind === 'phone' && !(c0.VOIPMS_USER && c0.VOIPMS_API_PASS && c0.VOIPMS_DID)) fail(400, 'SMS_DISABLED');
  const existing = q('SELECT * FROM otps WHERE target = ?').get(target.value);
  if (existing && now() - existing.sent_at < 55000) fail(429, 'WAIT');
  const code = String(crypto.randomInt(100000, 1000000));
  q(`INSERT INTO otps (target, code_hash, expires, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(target) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at`)
    .run(target.value, sha(target.value + ':' + code), now() + 10 * 60000, now());
  const text = `${APP_NAME}: کد ورود شما ${code}\nYour ${APP_NAME} code: ${code}`;
  let delivered = false;
  try {
    if (target.kind === 'email') {
      const html = `<div style="font-family:Tahoma,Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border-radius:18px;background:#f6f4fc;color:#1c1a29;text-align:center">
        <h2 style="margin:0 0 6px;color:#6b4fe0">${APP_NAME}</h2>
        <p style="margin:0 0 18px">کد ورود شما / Your login code</p>
        <div style="font-size:34px;letter-spacing:8px;font-weight:700;background:#fff;border-radius:14px;padding:14px 0">${code}</div>
        <p style="font-size:12px;color:#6c6883;margin-top:18px">این کد تا ۱۰ دقیقه معتبر است. This code expires in 10 minutes.</p></div>`;
      await sendEmail(conf(), { to: target.value, subject: `${APP_NAME} – ${code}`, text, html });
    } else {
      await sendSms(conf(), { to: target.value, message: `${APP_NAME} code: ${code}` });
    }
    delivered = true;
  } catch (e) {
    console.warn('[otp] delivery failed:', e.message);
    if (!DEV) {
      q('DELETE FROM otps WHERE target = ?').run(target.value);
      fail(502, e.message === 'SMS_NOT_SUPPORTED' ? 'SMS_NOT_SUPPORTED' : 'SEND_FAILED');
    }
  }
  if (DEV) console.log(`[otp] ${target.value} -> ${code}`);
  return { channel: target.kind, delivered, dev_code: DEV ? code : undefined };
}

function checkOtp(target, code) {
  const row = q('SELECT * FROM otps WHERE target = ?').get(target.value);
  if (!row || row.expires < now()) fail(400, 'CODE_EXPIRED');
  if (row.attempts >= 5) fail(429, 'TOO_MANY_ATTEMPTS');
  const c = String(code || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\D/g, '');
  if (sha(target.value + ':' + c) !== row.code_hash) {
    q('UPDATE otps SET attempts = attempts + 1 WHERE target = ?').run(target.value);
    fail(400, 'BAD_CODE');
  }
  q('DELETE FROM otps WHERE target = ?').run(target.value);
}

function createSession(userId, device, viaOtp) {
  const token = crypto.randomBytes(32).toString('base64url');
  q('INSERT INTO sessions (user_id, token_hash, device, created_at, last_used, via_otp) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, sha(token), String(device || '').slice(0, 120), now(), now(), viaOtp ? 1 : 0);
  return token;
}

const cookieFor = (token, maxAge) =>
  `sc_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.INSECURE_COOKIE === '1' ? '' : '; Secure'}`;

// ---------- messages ----------
function insertMessage(chatId, senderId, { kind = 'text', text = '', file_id = null, meta = null, reply_to = null, forwarded_from = null, client_id = null }) {
  const t = now();
  const r = q(`INSERT INTO messages (chat_id, sender_id, kind, text, file_id, meta, reply_to, forwarded_from, client_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(chatId, senderId, kind, text, file_id, meta ? JSON.stringify(meta) : null, reply_to, forwarded_from, client_id, t);
  const id = Number(r.lastInsertRowid);
  q('UPDATE chats SET last_msg_id = ? WHERE id = ?').run(id, chatId);
  if (senderId) q('UPDATE members SET last_read = ?, last_delivered = ? WHERE chat_id = ? AND user_id = ?').run(id, id, chatId, senderId);
  q('UPDATE members SET archived = 0 WHERE chat_id = ? AND archived = 1 AND muted = 0').run(chatId);
  const m = q('SELECT * FROM messages WHERE id = ?').get(id);
  const out = msgOut(m);
  emitChat(chatId, { t: 'message', message: out });
  notifyOffline(chatId, senderId, out);
  return out;
}

function previewText(m) {
  switch (m.kind) {
    case 'image': return '🖼 ' + (m.text || 'عکس');
    case 'video': return '🎬 ' + (m.text || 'ویدیو');
    case 'voice': return '🎤 پیام صوتی';
    case 'audio': return '🎵 ' + (m.file ? m.file.name : 'صوت');
    case 'file': return '📎 ' + (m.file ? m.file.name : 'فایل');
    case 'sticker': return m.text;
    case 'location': return '📍 موقعیت';
    case 'call': return '📞 تماس';
    default: return m.text;
  }
}

function notifyOffline(chatId, senderId, out) {
  if (out.kind === 'system') return;
  const chat = q('SELECT * FROM chats WHERE id = ?').get(chatId);
  const sender = senderId ? getUser(senderId) : null;
  const members = q('SELECT user_id, muted FROM members WHERE chat_id = ?').all(chatId);
  for (const m of members) {
    if (m.user_id === senderId || m.muted) continue;
    if (isOnline(m.user_id) && activeFocus.get(m.user_id) === chatId) continue;
    if (chat.type === 'direct' && isBlocked(m.user_id, senderId)) continue;
    const title = chat.type === 'group' ? chat.title : (sender ? sender.name : APP_NAME);
    const body = (chat.type === 'group' && sender ? sender.name + ': ' : '') + previewText(out);
    const icon = chat.type === 'group' ? fileUrl(chat.avatar_file) : (sender ? fileUrl(sender.avatar_file) : null);
    pusher.sendToUser(m.user_id, { type: 'message', chat_id: chatId, title, body: body.slice(0, 180), icon, tag: 'chat-' + chatId }, { topic: 'chat' + chatId }).catch(() => {});
  }
}

// which chat each user is currently looking at (to skip pushes)
const activeFocus = new Map();

// ---------- calls ----------
const calls = new Map(); // callId -> {id, chatId, from, to, video, state, startedAt, createdAt}
const userCall = new Map(); // userId -> callId

function endCall(callId, reason, byUser) {
  const c = calls.get(callId);
  if (!c) return;
  calls.delete(callId);
  if (userCall.get(c.from) === callId) userCall.delete(c.from);
  if (userCall.get(c.to) === callId) userCall.delete(c.to);
  clearTimeout(c.timer);
  const duration = c.startedAt ? Math.round((now() - c.startedAt) / 1000) : 0;
  const status = c.startedAt ? 'ended' : reason === 'reject' ? 'declined' : reason === 'busy' ? 'busy' : reason === 'cancel' ? 'cancelled' : 'missed';
  const evt = { t: 'call:end', call_id: callId, reason, by: byUser || null };
  emitTo(c.from, evt); emitTo(c.to, evt);
  insertMessage(c.chatId, c.from, { kind: 'call', text: '', meta: { video: c.video, duration, status, to: c.to } });
  if (status === 'missed' || status === 'cancelled') {
    const caller = getUser(c.from);
    pusher.sendToUser(c.to, { type: 'missed-call', chat_id: c.chatId, title: caller ? caller.name : APP_NAME, body: c.video ? '📹 تماس تصویری از دست رفته' : '📞 تماس از دست رفته', tag: 'call-' + callId }).catch(() => {});
  }
}

function turnServers(userId, host) {
  const servers = [];
  const h = String(host || '').replace(/:\d+$/, '').replace(/[^a-z0-9.-]/gi, '') || 'localhost';
  const sub = (u) => u.trim().replace(/\{host\}/g, h);
  const stun = (cfg.STUN_URLS || '').split(',').map(sub).filter(Boolean);
  if (cfg.TURN_SECRET && cfg.TURN_URLS) {
    const username = `${Math.floor(now() / 1000) + 24 * 3600}:${userId}`;
    const credential = crypto.createHmac('sha1', cfg.TURN_SECRET).update(username).digest('base64');
    const urls = cfg.TURN_URLS.split(',').map(sub).filter(Boolean);
    servers.push({ urls, username, credential });
    // our TURN server answers STUN too
    stun.unshift(...urls.filter((u) => u.startsWith('turn:')).map((u) => u.replace(/^turn:/, 'stun:').replace(/\?.*$/, '')));
  }
  if (!stun.length) stun.push('stun:stun.l.google.com:19302');
  servers.unshift({ urls: [...new Set(stun)] });
  return servers;
}

function handleWs(conn, req, url) {
  const s = sessionFor(tokenFrom(req, url));
  if (!s) { conn.send({ t: 'auth-error' }); conn.close(4001); return; }
  const uid = s.user_id;
  hub.track(conn);
  let set = sockets.get(uid);
  const wasOnline = !!(set && set.size);
  if (!set) { set = new Set(); sockets.set(uid, set); }
  set.add(conn);
  q('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), uid);
  if (!wasOnline) broadcastPresence(uid);
  conn.send({ t: 'hello', user_id: uid, ice: turnServers(uid, req.headers['x-forwarded-host'] || req.headers.host) });
  // If a call is ringing for this user, re-send the invite (e.g. app opened from a push notification)
  const ringing = userCall.get(uid);
  if (ringing) {
    const c = calls.get(ringing);
    if (c && c.to === uid && !c.startedAt) conn.send({ t: 'call:invite', call_id: c.id, chat_id: c.chatId, from: publicUser(getUser(c.from), uid), video: c.video });
  }

  conn.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try { onWsMessage(uid, conn, m); } catch (e) { console.warn('[ws]', e.message); }
  });
  conn.on('close', () => {
    set.delete(conn);
    if (!set.size) {
      sockets.delete(uid);
      activeFocus.delete(uid);
      q('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), uid);
      broadcastPresence(uid);
      // drop calls if the user vanished entirely (give them 20s to reconnect)
      const cid = userCall.get(uid);
      if (cid) setTimeout(() => { if (!isOnline(uid) && calls.has(cid)) endCall(cid, 'disconnect', uid); }, 20000);
    }
  });
}

function onWsMessage(uid, conn, m) {
  switch (m.t) {
    case 'ping': conn.send({ t: 'pong' }); break;
    case 'focus': activeFocus.set(uid, m.chat_id || null); break;
    case 'typing': {
      if (!memberOf(m.chat_id, uid)) return;
      emitChat(m.chat_id, { t: 'typing', chat_id: m.chat_id, user_id: uid, action: m.action || 'typing' }, uid);
      break;
    }
    case 'delivered': {
      const mem = memberOf(m.chat_id, uid);
      if (!mem || !(m.upto > mem.last_delivered)) return;
      q('UPDATE members SET last_delivered = ? WHERE chat_id = ? AND user_id = ?').run(m.upto, m.chat_id, uid);
      emitChat(m.chat_id, { t: 'receipt', chat_id: m.chat_id, user_id: uid, delivered: m.upto }, uid);
      break;
    }
    case 'call:invite': {
      const chat = q('SELECT * FROM chats WHERE id = ?').get(m.chat_id);
      if (!chat || chat.type !== 'direct' || !memberOf(chat.id, uid)) return;
      const to = chatMembers(chat.id).find((x) => x !== uid);
      if (!to) return;
      if (isBlocked(to, uid)) { conn.send({ t: 'call:end', call_id: m.call_id, reason: 'unavailable' }); return; }
      if (userCall.has(uid)) endCall(userCall.get(uid), 'cancel', uid);
      const call = { id: m.call_id, chatId: chat.id, from: uid, to, video: !!m.video, createdAt: now(), startedAt: null };
      calls.set(call.id, call);
      userCall.set(uid, call.id);
      if (userCall.has(to)) { endCall(call.id, 'busy', to); return; }
      userCall.set(to, call.id);
      call.timer = setTimeout(() => endCall(call.id, 'timeout'), 45000);
      const fromUser = publicUser(getUser(uid), to);
      emitTo(to, { t: 'call:invite', call_id: call.id, chat_id: chat.id, from: fromUser, video: call.video });
      pusher.sendToUser(to, { type: 'call', chat_id: chat.id, call_id: call.id, title: fromUser.name, body: call.video ? '📹 تماس تصویری…' : '📞 در حال تماس…', icon: fromUser.avatar, tag: 'call-' + call.id }, { ttl: 45, urgency: 'high' }).catch(() => {});
      break;
    }
    case 'call:ringing':
    case 'call:accept':
    case 'call:signal':
    case 'call:media': {
      const c = calls.get(m.call_id);
      if (!c || (c.from !== uid && c.to !== uid)) return;
      const peer = c.from === uid ? c.to : c.from;
      if (m.t === 'call:accept') {
        if (c.to !== uid || c.startedAt) return;
        c.startedAt = now(); clearTimeout(c.timer);
        // tell the callee's other devices to stop ringing
        for (const other of sockets.get(uid) || []) if (other !== conn) other.send({ t: 'call:end', call_id: c.id, reason: 'answered-elsewhere' });
        c.calleeConn = conn;
      }
      const payload = { t: m.t, call_id: c.id, from: uid, data: m.data };
      if (peer === c.to && c.calleeConn) c.calleeConn.send(payload); else emitTo(peer, payload);
      break;
    }
    case 'call:reject': { const c = calls.get(m.call_id); if (c && c.to === uid) endCall(c.id, 'reject', uid); break; }
    case 'call:hangup': {
      const c = calls.get(m.call_id);
      if (c && (c.from === uid || c.to === uid)) endCall(c.id, c.startedAt ? 'hangup' : (c.from === uid ? 'cancel' : 'reject'), uid);
      break;
    }
    default: break;
  }
}

// ---------- routes ----------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
}

route('GET', '/api/config', async () => ({
  name: APP_NAME,
  vapid: pusher.publicKey,
  sms: !!(conf().VOIPMS_USER && conf().VOIPMS_API_PASS && conf().VOIPMS_DID),
  email: !!(conf().SMTP_HOST || conf().MAIL_RELAY_URL),
  dev: DEV,
  max_upload: MAX_UPLOAD,
}), { auth: false });

route('POST', '/api/auth/start', async ({ req, body }) => {
  const target = normalizeTarget(body.target);
  return { target: target.value, ...(await startOtp(target, req)) };
}, { auth: false });

route('POST', '/api/auth/verify', async ({ req, res, body }) => {
  const target = normalizeTarget(body.target);
  rateLimit('verify-ip:' + clientIp(req), 30, 600000);
  checkOtp(target, body.code);
  let user = q(`SELECT * FROM users WHERE ${target.kind} = ?`).get(target.value);
  let isNew = false;
  if (!user) {
    const r = q(`INSERT INTO users (${target.kind}, name, created_at, last_seen) VALUES (?, '', ?, ?)`).run(target.value, now(), now());
    user = getUser(Number(r.lastInsertRowid));
    isNew = true;
  }
  const token = createSession(user.id, body.device || req.headers['user-agent'], true);
  res.setHeader('Set-Cookie', cookieFor(token, 365 * 86400));
  return { token, user: selfUser(user), is_new: isNew || !user.name };
}, { auth: false });

// Sign in with username / email / phone + password
route('POST', '/api/auth/login', async ({ req, res, body }) => {
  rateLimit('login-ip:' + clientIp(req), 20, 600000);
  const login = String(body.login || '').trim().replace(/^@/, '').toLowerCase();
  if (!login || !body.password) fail(400, 'BAD_LOGIN');
  let user = null;
  if (login.includes('@')) user = q('SELECT * FROM users WHERE email = ?').get(login);
  else if (/^[a-z][a-z0-9_]{3,31}$/.test(login)) user = q('SELECT * FROM users WHERE username = ?').get(login);
  if (!user) { try { const t = normalizeTarget(login); if (t.kind === 'phone') user = q('SELECT * FROM users WHERE phone = ?').get(t.value); } catch {} }
  if (user) rateLimit('login-user:' + user.id, 10, 900000);
  if (!user || !checkPassword(body.password, user.password_hash)) fail(401, 'BAD_LOGIN');
  const token = createSession(user.id, body.device || req.headers['user-agent'], false);
  res.setHeader('Set-Cookie', cookieFor(token, 365 * 86400));
  return { token, user: selfUser(user), is_new: !user.name };
}, { auth: false });

// Set or change password. Changing an existing one needs the current password,
// unless this session was just opened with an email/SMS code (forgot-password flow).
route('POST', '/api/me/password', async ({ s, body }) => {
  const u = getUser(s.user_id);
  if (!validPassword(body.password)) fail(400, 'BAD_PASSWORD');
  const fresh = s.via_otp && now() - s.created_at < 30 * 60000;
  if (u.password_hash && !fresh && !checkPassword(body.current_password || '', u.password_hash)) fail(403, 'WRONG_PASSWORD');
  q('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), u.id);
  // sign out other devices when the password changes
  if (u.password_hash) q('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(u.id, s.id);
  return { user: selfUser(getUser(u.id)) };
});

route('POST', '/api/auth/logout', async ({ s, res }) => {
  q('DELETE FROM sessions WHERE id = ?').run(s.id);
  res.setHeader('Set-Cookie', cookieFor('', 0));
  return { ok: true };
});

route('GET', '/api/me', async ({ s }) => ({ user: selfUser(getUser(s.user_id)) }));

route('PATCH', '/api/me', async ({ s, body }) => {
  const u = getUser(s.user_id);
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 64) : u.name;
  if (!name) fail(400, 'NAME_REQUIRED');
  let username = u.username;
  if (body.username !== undefined) {
    username = String(body.username).trim().replace(/^@/, '').toLowerCase() || null;
    if (username && !/^[a-z][a-z0-9_]{3,31}$/.test(username)) fail(400, 'BAD_USERNAME');
    if (username && q('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, u.id)) fail(409, 'USERNAME_TAKEN');
  }
  const bio = body.bio !== undefined ? String(body.bio).slice(0, 200) : u.bio;
  let avatar = u.avatar_file;
  if (body.avatar_file !== undefined) {
    avatar = body.avatar_file ? Number(body.avatar_file) : null;
    if (avatar && !q('SELECT 1 FROM files WHERE id = ? AND owner_id = ?').get(avatar, u.id)) fail(400, 'BAD_FILE');
  }
  const sls = body.show_last_seen !== undefined ? (body.show_last_seen ? 1 : 0) : u.show_last_seen;
  q('UPDATE users SET name = ?, username = ?, bio = ?, avatar_file = ?, show_last_seen = ? WHERE id = ?').run(name, username, bio, avatar, sls, u.id);
  const updated = getUser(u.id);
  for (const c of contactsOf(u.id)) emitTo(c, { t: 'user', user: publicUser(updated, c) });
  return { user: selfUser(updated) };
});

route('POST', '/api/me/link/start', async ({ req, body }) => {
  const target = normalizeTarget(body.target);
  if (q(`SELECT 1 FROM users WHERE ${target.kind} = ?`).get(target.value)) fail(409, 'ALREADY_USED');
  return { target: target.value, ...(await startOtp(target, req)) };
});
route('POST', '/api/me/link/verify', async ({ s, body }) => {
  const target = normalizeTarget(body.target);
  checkOtp(target, body.code);
  if (q(`SELECT 1 FROM users WHERE ${target.kind} = ?`).get(target.value)) fail(409, 'ALREADY_USED');
  q(`UPDATE users SET ${target.kind} = ? WHERE id = ?`).run(target.value, s.user_id);
  return { user: selfUser(getUser(s.user_id)) };
});

route('GET', '/api/sessions', async ({ s }) => ({
  sessions: q('SELECT id, device, created_at, last_used FROM sessions WHERE user_id = ? ORDER BY last_used DESC').all(s.user_id)
    .map((x) => ({ ...x, current: x.id === s.id })),
}));
route('DELETE', '/api/sessions/:id', async ({ s, params }) => {
  q('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(Number(params.id), s.user_id);
  return { ok: true };
});

route('POST', '/api/push/subscribe', async ({ s, body }) => {
  const sub = body.subscription || {};
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) fail(400, 'BAD_SUB');
  if (!/^https:\/\//.test(sub.endpoint)) fail(400, 'BAD_SUB');
  q(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(s.user_id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now());
  return { ok: true };
});
route('POST', '/api/push/test', async ({ s }) => {
  await pusher.sendToUser(s.user_id, { type: 'test', title: APP_NAME, body: 'نوتیفیکیشن فعال است ✅', tag: 'test' });
  return { ok: true };
});

route('GET', '/api/turn', async ({ s, req }) => ({ ice: turnServers(s.user_id, req.headers['x-forwarded-host'] || req.headers.host) }));

route('GET', '/api/calls', async ({ s }) => {
  const rows = q(`SELECT m.* FROM messages m JOIN members me ON me.chat_id = m.chat_id AND me.user_id = ?
                  WHERE m.kind = 'call' AND m.deleted = 0 AND m.id > me.cleared_before
                  AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ?)
                  ORDER BY m.id DESC LIMIT 100`).all(s.user_id, s.user_id);
  return {
    calls: rows.map((m) => {
      const peerId = chatMembers(m.chat_id).find((u) => u !== s.user_id);
      return { message: msgOut(m), peer: publicUser(getUser(peerId), s.user_id) };
    }),
  };
});

route('GET', '/api/users/search', async ({ s, url }) => {
  const raw = (url.searchParams.get('q') || '').trim();
  if (raw.length < 2) return { users: [] };
  const found = new Map();
  const add = (u) => { if (u && u.id !== s.user_id && u.name) found.set(u.id, publicUser(u, s.user_id)); };
  if (raw.includes('@') && raw.indexOf('@') > 0) add(q('SELECT * FROM users WHERE email = ?').get(raw.toLowerCase()));
  const digits = raw.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length >= 8) {
    try { add(q('SELECT * FROM users WHERE phone = ?').get(normalizeTarget(digits).value)); } catch {}
  }
  const uname = raw.replace(/^@/, '').toLowerCase();
  if (/^[a-z0-9_]{2,}$/.test(uname)) {
    for (const u of q("SELECT * FROM users WHERE username LIKE ? ESCAPE '\\' LIMIT 20").all(uname.replace(/_/g, '\\_') + '%')) add(u);
  }
  // People you already share chats with, by name
  for (const u of q(`SELECT u.* FROM users u WHERE u.id IN (SELECT DISTINCT m2.user_id FROM members m1 JOIN members m2 ON m1.chat_id = m2.chat_id WHERE m1.user_id = ?)
                     AND u.name LIKE ? LIMIT 20`).all(s.user_id, '%' + raw + '%')) add(u);
  return { users: [...found.values()] };
});

route('GET', '/api/users/:id', async ({ s, params }) => {
  const u = getUser(Number(params.id));
  if (!u) fail(404, 'NOT_FOUND');
  const common = q(`SELECT c.id, c.title FROM chats c JOIN members a ON a.chat_id = c.id AND a.user_id = ?
                    JOIN members b ON b.chat_id = c.id AND b.user_id = ? WHERE c.type = 'group'`).all(s.user_id, u.id);
  return { user: { ...publicUser(u, s.user_id), blocked: isBlocked(s.user_id, u.id) }, common_groups: common };
});
route('POST', '/api/users/:id/block', async ({ s, params }) => {
  q('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)').run(s.user_id, Number(params.id));
  return { ok: true };
});
route('DELETE', '/api/users/:id/block', async ({ s, params }) => {
  q('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(s.user_id, Number(params.id));
  return { ok: true };
});

route('GET', '/api/chats', async ({ s }) => {
  const ids = q('SELECT chat_id FROM members WHERE user_id = ?').all(s.user_id).map((r) => r.chat_id);
  const chats = ids.map((id) => chatOut(id, s.user_id)).filter(Boolean)
    .filter((c) => c.type === 'group' || c.last_message || c.pinned);
  chats.sort((a, b) => (b.pinned - a.pinned) || ((b.last_message ? b.last_message.id : 0) - (a.last_message ? a.last_message.id : 0)));
  return { chats };
});

function ensureDirect(a, b) {
  const key = [a, b].sort((x, y) => x - y).join(':');
  let c = q('SELECT * FROM chats WHERE direct_key = ?').get('d:' + key);
  if (!c) {
    const r = q("INSERT INTO chats (type, direct_key, created_by, created_at) VALUES ('direct', ?, ?, ?)").run('d:' + key, a, now());
    const id = Number(r.lastInsertRowid);
    q("INSERT INTO members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(id, a, now());
    if (a !== b) q("INSERT INTO members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(id, b, now());
    c = q('SELECT * FROM chats WHERE id = ?').get(id);
  }
  return c;
}

route('POST', '/api/chats/direct', async ({ s, body }) => {
  const other = getUser(Number(body.user_id));
  if (!other) fail(404, 'NOT_FOUND');
  const c = ensureDirect(s.user_id, other.id);
  return { chat: chatOut(c.id, s.user_id) };
});

route('POST', '/api/chats/group', async ({ s, body }) => {
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) fail(400, 'TITLE_REQUIRED');
  const ids = [...new Set((body.member_ids || []).map(Number))].filter((id) => id !== s.user_id && getUser(id));
  const code = crypto.randomBytes(9).toString('base64url');
  const r = q("INSERT INTO chats (type, title, description, avatar_file, direct_key, created_by, created_at) VALUES ('group', ?, ?, ?, ?, ?, ?)")
    .run(title, String(body.description || '').slice(0, 300), body.avatar_file || null, code, s.user_id, now());
  const id = Number(r.lastInsertRowid);
  q("INSERT INTO members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(id, s.user_id, now());
  for (const uid of ids) q("INSERT INTO members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(id, uid, now());
  insertMessage(id, s.user_id, { kind: 'system', meta: { action: 'created', title } });
  for (const uid of [s.user_id, ...ids]) emitTo(uid, { t: 'chat', chat: chatOut(id, uid) });
  return { chat: chatOut(id, s.user_id) };
});

function requireMember(chatId, uid) {
  const m = memberOf(chatId, uid);
  if (!m) fail(403, 'NOT_MEMBER');
  return m;
}
const isAdmin = (m) => m.role === 'owner' || m.role === 'admin';
function pushChatUpdate(chatId) { for (const uid of chatMembers(chatId)) emitTo(uid, { t: 'chat', chat: chatOut(chatId, uid) }); }

route('GET', '/api/chats/:id', async ({ s, params }) => {
  const id = Number(params.id);
  requireMember(id, s.user_id);
  const members = q('SELECT user_id, role FROM members WHERE chat_id = ? ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, joined_at').all(id)
    .map((m) => ({ ...publicUser(getUser(m.user_id), s.user_id), role: m.role }));
  const counts = q(`SELECT kind, COUNT(*) n FROM messages WHERE chat_id = ? AND deleted = 0 AND kind IN ('image','video','file','audio','voice') GROUP BY kind`).all(id);
  return { chat: chatOut(id, s.user_id), members, media_counts: Object.fromEntries(counts.map((c) => [c.kind, c.n])) };
});

route('PATCH', '/api/chats/:id', async ({ s, params, body }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  const c = q('SELECT * FROM chats WHERE id = ?').get(id);
  if (c.type !== 'group' || !isAdmin(me)) fail(403, 'FORBIDDEN');
  const title = body.title !== undefined ? String(body.title).trim().slice(0, 80) || c.title : c.title;
  const desc = body.description !== undefined ? String(body.description).slice(0, 300) : c.description;
  const avatar = body.avatar_file !== undefined ? (body.avatar_file || null) : c.avatar_file;
  q('UPDATE chats SET title = ?, description = ?, avatar_file = ? WHERE id = ?').run(title, desc, avatar, id);
  if (title !== c.title) insertMessage(id, s.user_id, { kind: 'system', meta: { action: 'renamed', title } });
  pushChatUpdate(id);
  return { chat: chatOut(id, s.user_id) };
});

route('POST', '/api/chats/:id/invite/reset', async ({ s, params }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  if (!isAdmin(me)) fail(403, 'FORBIDDEN');
  q("UPDATE chats SET direct_key = ? WHERE id = ? AND type = 'group'").run(crypto.randomBytes(9).toString('base64url'), id);
  return { chat: chatOut(id, s.user_id) };
});

route('GET', '/api/join/:code', async ({ s, params }) => {
  const c = q("SELECT * FROM chats WHERE type = 'group' AND direct_key = ?").get(params.code);
  if (!c) fail(404, 'NOT_FOUND');
  const count = q('SELECT COUNT(*) n FROM members WHERE chat_id = ?').get(c.id).n;
  return { group: { id: c.id, title: c.title, description: c.description, avatar: fileUrl(c.avatar_file), member_count: count, is_member: !!memberOf(c.id, s.user_id) } };
});
route('POST', '/api/join/:code', async ({ s, params }) => {
  const c = q("SELECT * FROM chats WHERE type = 'group' AND direct_key = ?").get(params.code);
  if (!c) fail(404, 'NOT_FOUND');
  if (!memberOf(c.id, s.user_id)) {
    q("INSERT INTO members (chat_id, user_id, role, joined_at, last_read) VALUES (?, ?, 'member', ?, ?)").run(c.id, s.user_id, now(), c.last_msg_id || 0);
    insertMessage(c.id, s.user_id, { kind: 'system', meta: { action: 'joined' } });
    pushChatUpdate(c.id);
  }
  return { chat: chatOut(c.id, s.user_id) };
});

route('POST', '/api/chats/:id/members', async ({ s, params, body }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  const c = q('SELECT * FROM chats WHERE id = ?').get(id);
  if (c.type !== 'group' || !isAdmin(me)) fail(403, 'FORBIDDEN');
  const added = [];
  for (const uid of (body.user_ids || []).map(Number)) {
    if (!getUser(uid) || memberOf(id, uid)) continue;
    q("INSERT INTO members (chat_id, user_id, role, joined_at, last_read) VALUES (?, ?, 'member', ?, ?)").run(id, uid, now(), 0);
    added.push(uid);
  }
  if (added.length) {
    insertMessage(id, s.user_id, { kind: 'system', meta: { action: 'added', users: added.map((u) => ({ id: u, name: getUser(u).name })) } });
    pushChatUpdate(id);
  }
  return { ok: true, added };
});

route('DELETE', '/api/chats/:id/members/:uid', async ({ s, params }) => {
  const id = Number(params.id); const uid = Number(params.uid);
  const me = requireMember(id, s.user_id);
  const target = memberOf(id, uid);
  if (!target) fail(404, 'NOT_FOUND');
  const c = q('SELECT * FROM chats WHERE id = ?').get(id);
  if (c.type !== 'group') fail(400, 'NOT_GROUP');
  if (uid !== s.user_id && (!isAdmin(me) || target.role === 'owner')) fail(403, 'FORBIDDEN');
  q('DELETE FROM members WHERE chat_id = ? AND user_id = ?').run(id, uid);
  emitTo(uid, { t: 'chat:removed', chat_id: id });
  const left = q('SELECT COUNT(*) n FROM members WHERE chat_id = ?').get(id).n;
  if (!left) { q('DELETE FROM chats WHERE id = ?').run(id); return { ok: true }; }
  if (target.role === 'owner') {
    const next = q("SELECT user_id FROM members WHERE chat_id = ? ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at LIMIT 1").get(id);
    q("UPDATE members SET role = 'owner' WHERE chat_id = ? AND user_id = ?").run(id, next.user_id);
  }
  insertMessage(id, s.user_id, { kind: 'system', meta: uid === s.user_id ? { action: 'left' } : { action: 'removed', users: [{ id: uid, name: getUser(uid).name }] } });
  pushChatUpdate(id);
  return { ok: true };
});

route('PATCH', '/api/chats/:id/members/:uid', async ({ s, params, body }) => {
  const id = Number(params.id); const uid = Number(params.uid);
  const me = requireMember(id, s.user_id);
  if (me.role !== 'owner') fail(403, 'FORBIDDEN');
  const role = body.role === 'admin' ? 'admin' : 'member';
  q("UPDATE members SET role = ? WHERE chat_id = ? AND user_id = ? AND role != 'owner'").run(role, id, uid);
  pushChatUpdate(id);
  return { ok: true };
});

route('PATCH', '/api/chats/:id/settings', async ({ s, params, body }) => {
  const id = Number(params.id);
  const m = requireMember(id, s.user_id);
  const val = (k) => (body[k] !== undefined ? (body[k] ? 1 : 0) : m[k]);
  q('UPDATE members SET muted = ?, pinned = ?, archived = ? WHERE chat_id = ? AND user_id = ?').run(val('muted'), val('pinned'), val('archived'), id, s.user_id);
  const out = chatOut(id, s.user_id);
  emitTo(s.user_id, { t: 'chat', chat: out });
  return { chat: out };
});

route('POST', '/api/chats/:id/clear', async ({ s, params }) => {
  const id = Number(params.id);
  requireMember(id, s.user_id);
  const last = q('SELECT MAX(id) m FROM messages WHERE chat_id = ?').get(id).m || 0;
  q('UPDATE members SET cleared_before = ?, last_read = MAX(last_read, ?) WHERE chat_id = ? AND user_id = ?').run(last, last, id, s.user_id);
  const out = chatOut(id, s.user_id);
  emitTo(s.user_id, { t: 'chat', chat: out });
  return { chat: out };
});

route('GET', '/api/chats/:id/messages', async ({ s, params, url }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const after = Number(url.searchParams.get('after')) || 0;
  const around = Number(url.searchParams.get('around')) || 0;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const base = `FROM messages m WHERE m.chat_id = ? AND m.id > ?
    AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id = m.id AND h.user_id = ?)`;
  let rows;
  if (around) {
    const older = q(`SELECT m.* ${base} AND m.id <= ? ORDER BY m.id DESC LIMIT ?`).all(id, me.cleared_before, s.user_id, around, 30);
    const newer = q(`SELECT m.* ${base} AND m.id > ? ORDER BY m.id ASC LIMIT ?`).all(id, me.cleared_before, s.user_id, around, 30);
    rows = [...older.reverse(), ...newer];
  } else if (after) {
    rows = q(`SELECT m.* ${base} AND m.id > ? ORDER BY m.id ASC LIMIT ?`).all(id, me.cleared_before, s.user_id, after, limit);
  } else {
    rows = q(`SELECT m.* ${base} AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(id, me.cleared_before, s.user_id, before, limit).reverse();
  }
  return { messages: rows.map((m) => msgOut(m, s.user_id)) };
});

route('GET', '/api/chats/:id/search', async ({ s, params, url }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  const term = (url.searchParams.get('q') || '').trim();
  if (!term) return { messages: [] };
  const rows = q(`SELECT * FROM messages WHERE chat_id = ? AND id > ? AND deleted = 0 AND text LIKE ? ORDER BY id DESC LIMIT 50`).all(id, me.cleared_before, '%' + term + '%');
  return { messages: rows.map((m) => msgOut(m, s.user_id)) };
});

route('GET', '/api/chats/:id/media', async ({ s, params, url }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  const kinds = (url.searchParams.get('kind') || 'image,video').split(',').filter((k) => /^[a-z]+$/.test(k));
  const rows = q(`SELECT * FROM messages WHERE chat_id = ? AND id > ? AND deleted = 0 AND kind IN (${kinds.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 200`)
    .all(id, me.cleared_before, ...kinds);
  return { messages: rows.map((m) => msgOut(m, s.user_id)) };
});

const KINDS = new Set(['text', 'image', 'video', 'voice', 'audio', 'file', 'sticker', 'location', 'contact']);

route('POST', '/api/chats/:id/messages', async ({ s, params, body }) => {
  const id = Number(params.id);
  requireMember(id, s.user_id);
  const c = q('SELECT * FROM chats WHERE id = ?').get(id);
  if (c.type === 'direct') {
    const other = chatMembers(id).find((u) => u !== s.user_id);
    if (other && isBlocked(other, s.user_id)) fail(403, 'BLOCKED');
    if (other && isBlocked(s.user_id, other)) fail(403, 'YOU_BLOCKED');
  }
  if (body.client_id) {
    const dup = q('SELECT * FROM messages WHERE chat_id = ? AND sender_id = ? AND client_id = ?').get(id, s.user_id, String(body.client_id));
    if (dup) return { message: msgOut(dup) };
  }
  // forwarding
  if (body.forward_of) {
    const src = q('SELECT * FROM messages WHERE id = ?').get(Number(body.forward_of));
    if (!src || src.deleted || !memberOf(src.chat_id, s.user_id)) fail(404, 'NOT_FOUND');
    const from = src.forwarded_from || (getUser(src.sender_id) || {}).name || '';
    return { message: insertMessage(id, s.user_id, { kind: src.kind, text: src.text, file_id: src.file_id, meta: src.meta ? JSON.parse(src.meta) : null, forwarded_from: from, client_id: body.client_id ? String(body.client_id) : null }) };
  }
  const kind = KINDS.has(body.kind) ? body.kind : 'text';
  const text = String(body.text || '').slice(0, 8000);
  let fileId = null;
  if (body.file_id) {
    const f = q('SELECT * FROM files WHERE id = ? AND owner_id = ?').get(Number(body.file_id), s.user_id);
    if (!f) fail(400, 'BAD_FILE');
    fileId = f.id;
  }
  if (kind === 'text' && !text.trim()) fail(400, 'EMPTY');
  if (['image', 'video', 'voice', 'audio', 'file'].includes(kind) && !fileId) fail(400, 'FILE_REQUIRED');
  let replyTo = null;
  if (body.reply_to) {
    const r = q('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(Number(body.reply_to), id);
    if (r) replyTo = r.id;
  }
  let meta = null;
  if (body.meta && typeof body.meta === 'object') {
    meta = {};
    for (const k of ['width', 'height', 'duration', 'waveform', 'lat', 'lng', 'name', 'phone', 'thumb']) if (body.meta[k] !== undefined) meta[k] = body.meta[k];
    if (Array.isArray(meta.waveform)) meta.waveform = meta.waveform.slice(0, 64).map((x) => Math.max(0, Math.min(31, x | 0)));
    if (typeof meta.thumb === 'string' && meta.thumb.length > 12000) delete meta.thumb;
  }
  return { message: insertMessage(id, s.user_id, { kind, text, file_id: fileId, meta, reply_to: replyTo, client_id: body.client_id ? String(body.client_id).slice(0, 64) : null }) };
});

route('PATCH', '/api/messages/:id', async ({ s, params, body }) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(Number(params.id));
  if (!m || m.sender_id !== s.user_id || m.deleted) fail(404, 'NOT_FOUND');
  if (m.kind === 'system' || m.kind === 'call') fail(400, 'NOT_EDITABLE');
  const text = String(body.text || '').slice(0, 8000);
  if (m.kind === 'text' && !text.trim()) fail(400, 'EMPTY');
  q('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, now(), m.id);
  const out = msgOut(q('SELECT * FROM messages WHERE id = ?').get(m.id));
  emitChat(m.chat_id, { t: 'message:update', message: out });
  return { message: out };
});

route('DELETE', '/api/messages/:id', async ({ s, params, url }) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(Number(params.id));
  if (!m) fail(404, 'NOT_FOUND');
  const me = requireMember(m.chat_id, s.user_id);
  const forAll = url.searchParams.get('for') === 'all';
  if (forAll) {
    const chat = q('SELECT type FROM chats WHERE id = ?').get(m.chat_id);
    const allowed = m.sender_id === s.user_id || (chat.type === 'group' && isAdmin(me));
    if (!allowed) fail(403, 'FORBIDDEN');
    q("UPDATE messages SET deleted = 1, text = '', meta = NULL WHERE id = ?").run(m.id);
    q('DELETE FROM reactions WHERE message_id = ?').run(m.id);
    if (m.file_id && !q('SELECT 1 FROM messages WHERE file_id = ? AND deleted = 0 AND id != ?').get(m.file_id, m.id)) {
      const f = q('SELECT * FROM files WHERE id = ?').get(m.file_id);
      if (f && !q('SELECT 1 FROM users WHERE avatar_file = ?').get(f.id) && !q('SELECT 1 FROM chats WHERE avatar_file = ?').get(f.id)) {
        fs.rm(path.join(UPLOAD_DIR, f.disk_name), () => {});
      }
    }
    emitChat(m.chat_id, { t: 'message:update', message: msgOut(q('SELECT * FROM messages WHERE id = ?').get(m.id)) });
  } else {
    q('INSERT OR IGNORE INTO hidden_messages (message_id, user_id) VALUES (?, ?)').run(m.id, s.user_id);
    emitTo(s.user_id, { t: 'message:hide', chat_id: m.chat_id, id: m.id });
  }
  return { ok: true };
});

route('POST', '/api/messages/:id/react', async ({ s, params, body }) => {
  const m = q('SELECT * FROM messages WHERE id = ?').get(Number(params.id));
  if (!m || m.deleted) fail(404, 'NOT_FOUND');
  requireMember(m.chat_id, s.user_id);
  const emoji = String(body.emoji || '').slice(0, 16);
  const cur = q('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(m.id, s.user_id);
  if (!emoji || (cur && cur.emoji === emoji)) q('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(m.id, s.user_id);
  else q('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?) ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji').run(m.id, s.user_id, emoji);
  const reactions = q('SELECT user_id, emoji FROM reactions WHERE message_id = ?').all(m.id);
  emitChat(m.chat_id, { t: 'reactions', chat_id: m.chat_id, id: m.id, reactions });
  return { reactions };
});

route('POST', '/api/chats/:id/read', async ({ s, params, body }) => {
  const id = Number(params.id);
  const me = requireMember(id, s.user_id);
  const upto = Math.min(Number(body.upto) || 0, q('SELECT MAX(id) m FROM messages WHERE chat_id = ?').get(id).m || 0);
  if (upto > me.last_read) {
    q('UPDATE members SET last_read = ?, last_delivered = MAX(last_delivered, ?) WHERE chat_id = ? AND user_id = ?').run(upto, upto, id, s.user_id);
    emitChat(id, { t: 'receipt', chat_id: id, user_id: s.user_id, read: upto, delivered: upto }, s.user_id);
    emitTo(s.user_id, { t: 'read-sync', chat_id: id, upto });
  }
  return { ok: true };
});

// ---------- setup (owner settings page) ----------
function requireSetup(req) {
  const tok = String(req.headers['x-setup-token'] || '');
  if (!cfg.SETUP_TOKEN || tok.length < 16 || !crypto.timingSafeEqual(Buffer.from(sha(tok)), Buffer.from(sha(cfg.SETUP_TOKEN)))) fail(403, 'BAD_SETUP_TOKEN');
}
route('GET', '/api/setup', async ({ req }) => {
  requireSetup(req);
  const c = conf();
  const out = {};
  for (const k of SETTING_KEYS) out[k] = /PASS/.test(k) ? (c[k] ? '••••••••' : '') : (c[k] || '');
  const users = q('SELECT COUNT(*) n FROM users').get().n;
  return { settings: out, users };
}, { auth: false });
route('POST', '/api/setup', async ({ req, body }) => {
  requireSetup(req);
  rateLimit('setup:' + clientIp(req), 30, 600000);
  const cur = dbSettings();
  for (const k of SETTING_KEYS) {
    if (body[k] === undefined) continue;
    const v = String(body[k]).trim().slice(0, 300);
    if (/PASS/.test(k) && v === '••••••••') continue;
    cur[k] = v;
  }
  q("INSERT INTO kv (k, v) VALUES ('settings', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(JSON.stringify(cur));
  return { ok: true };
}, { auth: false });
route('POST', '/api/setup/test', async ({ req, body }) => {
  requireSetup(req);
  rateLimit('setup-test:' + clientIp(req), 10, 600000);
  const c = conf();
  try {
    if (body.kind === 'sms') await sendSms(c, { to: String(body.to || ''), message: `${APP_NAME}: test ✓` });
    else await sendEmail(c, { to: String(body.to || ''), subject: `${APP_NAME} test`, text: 'Satin Connect email works ✓', html: '<p>Satin Connect email works ✓</p>' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}, { auth: false });

// ---------- files ----------
const SAFE_INLINE = /^(image\/(png|jpe?g|gif|webp|avif|heic|heif)|video\/(mp4|webm|quicktime|3gpp)|audio\/[a-z0-9.+-]+)$/i;

route('POST', '/api/files', async ({ s, req }) => {
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD) fail(413, 'TOO_LARGE');
  const rawName = decodeURIComponent(String(req.headers['x-file-name'] || 'file'));
  const name = rawName.replace(/[\\/\r\n"]/g, '_').slice(0, 180) || 'file';
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100);
  const disk = crypto.randomBytes(18).toString('base64url') + (path.extname(name).replace(/[^.a-z0-9]/gi, '').slice(0, 8) || '');
  const dest = path.join(UPLOAD_DIR, disk);
  let size = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); fs.rm(dest, () => {}); reject(new HttpError(413, 'TOO_LARGE')); }
    });
    req.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    req.on('error', reject);
  });
  if (!size) { fs.rm(dest, () => {}); fail(400, 'EMPTY'); }
  const r = q('INSERT INTO files (owner_id, name, mime, size, disk_name, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(s.user_id, name, mime, size, disk, now());
  return { file: { id: Number(r.lastInsertRowid), name, mime, size, url: `/f/${disk}` } };
});

function serveFile(req, res, diskName, s) {
  if (!s) return send(res, 401, 'Unauthorized');
  if (!/^[A-Za-z0-9_-]{24}(\.[A-Za-z0-9]{1,8})?$/.test(diskName)) return send(res, 404, 'Not found');
  const f = q('SELECT * FROM files WHERE disk_name = ?').get(diskName);
  if (!f) return send(res, 404, 'Not found');
  const p = path.join(UPLOAD_DIR, f.disk_name);
  fs.stat(p, (err, st) => {
    if (err) return send(res, 404, 'Not found');
    const inline = SAFE_INLINE.test(f.mime);
    const headers = {
      'Content-Type': inline ? f.mime : 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    };
    const range = req.headers.range && req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (range) {
      let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (!range[1]) end = st.size - 1;
      if (start >= st.size || start < 0 || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(p, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(p).pipe(res);
    }
  });
}

// ---------- static ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain',
};
function serveStatic(req, res, pathname) {
  if (pathname === '/.well-known/assetlinks.json') {
    const fps = (cfg.ANDROID_CERT_SHA256 || '').split(',').map((x) => x.trim()).filter(Boolean);
    return send(res, 200, [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: cfg.ANDROID_PACKAGE || 'ca.satingraphic.schat', sha256_cert_fingerprints: fps },
    }], { 'Cache-Control': 'public, max-age=3600' });
  }
  if (pathname === '/download/s-chat.apk') {
    const apk = path.join(DATA_DIR, 'download', 's-chat.apk');
    return fs.stat(apk, (err, st) => {
      if (err) {
        if (cfg.APK_URL) { res.writeHead(302, { Location: cfg.APK_URL }); return res.end(); }
        return send(res, 404, 'APK not uploaded yet');
      }
      res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': st.size, 'Content-Disposition': 'attachment; filename="Satin-Connect.apk"', 'Cache-Control': 'no-cache' });
      fs.createReadStream(apk).pipe(res);
    });
  }
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const p = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!p.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(p, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(p);
    const long = /\/(fonts|sounds)\//.test(p);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': long ? 'public, max-age=2592000' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      ...(ext === '.html' ? { 'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)' } : {}),
      ...(rel === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    res.end(data);
  });
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  try {
    if (pathname.startsWith('/f/')) return serveFile(req, res, pathname.slice(3), sessionFor(tokenFrom(req, null)));
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let s = null;
      if (r.auth) { s = sessionFor(tokenFrom(req, null)); if (!s) fail(401, 'UNAUTHORIZED'); }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // basic CSRF guard for cookie-authenticated requests
        const origin = req.headers.origin;
        if (origin && !req.headers.authorization) {
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          if (new URL(origin).host !== host) fail(403, 'BAD_ORIGIN');
        }
      }
      const body = req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT'
        ? (pathname === '/api/files' ? null : await readJson(req)) : {};
      const result = await r.handler({ req, res, url, params, body, s });
      return send(res, 200, result);
    }
    fail(404, 'NOT_FOUND');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.code });
    console.error(e);
    return send(res, 500, { error: 'SERVER_ERROR' });
  }
});

const hub = ws.attach(server, '/ws', handleWs);
server.listen(PORT, () => console.log(`${APP_NAME} listening on :${PORT} (data: ${DATA_DIR})${DEV ? ' [DEV MODE]' : ''}`));

// housekeeping
setInterval(() => {
  q('DELETE FROM otps WHERE expires < ?').run(now() - 3600000);
  q('DELETE FROM sessions WHERE last_used < ?').run(now() - 180 * 86400000);
}, 3600000).unref();

process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
