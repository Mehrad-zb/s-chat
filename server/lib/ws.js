// Minimal RFC 6455 WebSocket server (no dependencies).
'use strict';
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 1024 * 1024; // 1 MB per message is plenty for signaling/events

class WSConn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragOp = 0;
    this.open = true;
    this.alive = true;
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _closed() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }
  _onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const hi = this.buf.readUInt32BE(2);
        len = hi * 2 ** 32 + this.buf.readUInt32BE(6); off = 10;
      }
      if (len > MAX_FRAME) return this.close(1009);
      if (!masked) return this.close(1002);
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this._frame(fin, op, payload);
    }
  }
  _frame(fin, op, payload) {
    this.alive = true;
    if (op === 0x8) { this.close(1000); return; }
    if (op === 0x9) { this._send(0xA, payload); return; }
    if (op === 0xA) { this.alive = true; return; }
    if (op === 0x1 || op === 0x2) { this.fragOp = op; this.frags = [payload]; }
    else if (op === 0x0) { this.frags.push(payload); }
    else return;
    if (fin) {
      const data = Buffer.concat(this.frags);
      this.frags = [];
      if (this.fragOp === 0x1) this.emit('message', data.toString('utf8'));
    }
  }
  _send(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.from([0x80 | op, len]); }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 127; header.writeUInt32BE(Math.floor(len / 2 ** 32), 2); header.writeUInt32BE(len >>> 0, 6); }
    try { this.socket.write(Buffer.concat([header, payload])); } catch { this._closed(); }
  }
  send(obj) {
    this._send(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)));
  }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
    this._send(0x8, p);
    this.open = false;
    try { this.socket.end(); } catch {}
    this.emit('close');
  }
}

function attach(server, path, onConnection) {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== path || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.destroy(); return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const conn = new WSConn(socket);
    onConnection(conn, req, url);
  });
  // heartbeat
  const conns = new Set();
  return {
    track(c) {
      conns.add(c); c.on('close', () => conns.delete(c));
    },
    timer: setInterval(() => {
      for (const c of conns) {
        if (!c.alive) { c.close(1001); continue; }
        c.alive = false; c.ping();
      }
    }, 25000),
  };
}

module.exports = { attach };
