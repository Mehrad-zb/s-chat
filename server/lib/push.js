'use strict';
// Web Push (RFC 8030 / 8291 aes128gcm / 8292 VAPID) — no dependencies.
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

function loadOrCreateVapid(db) {
  const row = db.prepare("SELECT v FROM kv WHERE k='vapid'").get();
  if (row) return JSON.parse(row.v);
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  db.prepare("INSERT INTO kv (k, v) VALUES ('vapid', ?)").run(JSON.stringify(jwk));
  return jwk;
}

class Pusher {
  constructor(db, subject) {
    this.db = db;
    this.subject = subject || 'mailto:admin@example.com';
    this.jwk = loadOrCreateVapid(db);
    this.privateKey = crypto.createPrivateKey({ key: this.jwk, format: 'jwk' });
    this.publicKeyRaw = Buffer.concat([Buffer.from([4]), fromB64u(this.jwk.x), fromB64u(this.jwk.y)]);
    this.publicKey = b64u(this.publicKeyRaw);
    this.jwtCache = new Map();
  }

  vapidHeader(endpoint) {
    const aud = new URL(endpoint).origin;
    const cached = this.jwtCache.get(aud);
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.exp - now > 3600) return cached.header;
    const exp = now + 12 * 3600;
    const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const payload = b64u(JSON.stringify({ aud, exp, sub: this.subject }));
    const data = `${header}.${payload}`;
    const sig = crypto.sign('sha256', Buffer.from(data), { key: this.privateKey, dsaEncoding: 'ieee-p1363' });
    const h = `vapid t=${data}.${b64u(sig)}, k=${this.publicKey}`;
    this.jwtCache.set(aud, { exp, header: h });
    return h;
  }

  encrypt(sub, plaintext) {
    const uaPublic = fromB64u(sub.p256dh);
    const authSecret = fromB64u(sub.auth);
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const asPublic = ecdh.getPublicKey();
    const shared = ecdh.computeSecret(uaPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
    const salt = crypto.randomBytes(16);
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
    return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
  }

  async send(sub, payloadObj, { ttl = 3600, urgency = 'high', topic } = {}) {
    const body = this.encrypt(sub, JSON.stringify(payloadObj));
    const headers = {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
      Authorization: this.vapidHeader(sub.endpoint),
    };
    if (topic) headers.Topic = topic;
    const r = await fetch(sub.endpoint, { method: 'POST', headers, body });
    if (r.status === 404 || r.status === 410) {
      this.db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(sub.endpoint);
    }
    if (r.status >= 300) {
      const txt = await r.text().catch(() => '');
      console.warn('[push]', new URL(sub.endpoint).host, r.status, txt.slice(0, 200));
    }
    return r.status;
  }

  async sendToUser(userId, payload, opts) {
    const subs = this.db.prepare('SELECT * FROM push_subs WHERE user_id = ?').all(userId);
    return Promise.all(subs.map((s) => this.send(s, payload, opts)
      .then((status) => ({ host: new URL(s.endpoint).host, status }))
      .catch((e) => { console.warn('[push]', e.message); return { host: new URL(s.endpoint).host, status: 0 }; })));
  }
}

module.exports = { Pusher };
