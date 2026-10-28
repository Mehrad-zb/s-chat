'use strict';
// Email (SMTP, 465 implicit TLS or 587 STARTTLS) and SMS (VoIP.ms) senders — no dependencies.
const net = require('net');
const tls = require('tls');
const os = require('os');

function smtpSession(sock) {
  let buf = '';
  let waiter = null;
  const lines = [];
  const onData = (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      lines.push(buf.slice(0, i)); buf = buf.slice(i + 2);
    }
    pump();
  };
  function pump() {
    if (!waiter) return;
    // A full reply ends with a line "XYZ " (space after code)
    const idx = lines.findIndex((l) => /^\d{3}( |$)/.test(l));
    if (idx < 0) return;
    const reply = lines.splice(0, idx + 1);
    const w = waiter; waiter = null;
    w(reply);
  }
  sock.on('data', onData);
  return {
    read() {
      return new Promise((res, rej) => {
        waiter = res; pump();
        sock.once('error', rej);
      });
    },
    async cmd(line, expect) {
      if (line !== null) sock.write(line + '\r\n');
      const reply = await this.read();
      const code = parseInt(reply[reply.length - 1].slice(0, 3), 10);
      if (expect && !expect.includes(code)) {
        throw new Error(`SMTP ${line ? line.split(' ')[0] : 'greeting'} failed: ${reply.join(' | ')}`);
      }
      return { code, reply };
    },
    detach() { sock.removeListener('data', onData); },
  };
}

function encodeHeader(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
}

// HTTPS mail relay (a small PHP script on regular web hosting) — used because many
// cloud providers (DigitalOcean included) block outgoing SMTP ports on new servers.
async function sendViaRelay(cfg, { to, subject, text, html }) {
  const r = await fetch(cfg.MAIL_RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.MAIL_RELAY_TOKEN || '', to, subject, text, html, from: cfg.SMTP_FROM || '' }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error('Mail relay: ' + (j.error || r.status));
}

async function sendEmail(cfg, msg) {
  if (cfg.MAIL_RELAY_URL) return sendViaRelay(cfg, msg);
  return sendSmtp(cfg, msg);
}

async function sendSmtp(cfg, { to, subject, text, html }) {
  if (!cfg.SMTP_HOST) throw new Error('SMTP is not configured');
  const port = parseInt(cfg.SMTP_PORT || '465', 10);
  const host = cfg.SMTP_HOST;
  const secure = port === 465;
  let sock = await new Promise((res, rej) => {
    const s = secure
      ? tls.connect({ host, port, servername: host }, () => res(s))
      : net.connect({ host, port }, () => res(s));
    s.setTimeout(15000, () => { s.destroy(new Error('SMTP timeout (port ' + port + ' blocked?)')); });
    s.once('error', (e) => rej(new Error(e.message || e.code || (e.errors && e.errors[0] && e.errors[0].code) || 'SMTP connection failed')));
  });
  let s = smtpSession(sock);
  const me = os.hostname() || 's-chat';
  try {
    await s.cmd(null, [220]);
    await s.cmd(`EHLO ${me}`, [250]);
    if (!secure) {
      await s.cmd('STARTTLS', [220]);
      s.detach();
      sock = await new Promise((res, rej) => {
        const t = tls.connect({ socket: sock, servername: host }, () => res(t));
        t.once('error', rej);
      });
      s = smtpSession(sock);
      await s.cmd(`EHLO ${me}`, [250]);
    }
    if (cfg.SMTP_USER) {
      const auth = Buffer.from(`\0${cfg.SMTP_USER}\0${cfg.SMTP_PASS || ''}`).toString('base64');
      await s.cmd(`AUTH PLAIN ${auth}`, [235]);
    }
    const from = cfg.SMTP_FROM || cfg.SMTP_USER;
    const fromAddr = (from.match(/<([^>]+)>/) || [null, from])[1];
    await s.cmd(`MAIL FROM:<${fromAddr}>`, [250]);
    await s.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await s.cmd('DATA', [354]);
    const boundary = 'b' + Date.now().toString(36);
    const fromHeader = from.includes('<')
      ? from.replace(/^([^<]+)</, (m, n) => encodeHeader(n.trim()) + ' <')
      : from;
    const msg = [
      `From: ${fromHeader}`,
      `To: <${to}>`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${fromAddr.split('@')[1] || 'localhost'}>`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n'),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html || text).toString('base64').replace(/.{76}/g, '$&\r\n'),
      `--${boundary}--`,
      '',
    ].join('\r\n');
    sock.write(msg + '\r\n.\r\n');
    await s.cmd(null, [250]);
    await s.cmd('QUIT', [221]).catch(() => {});
  } finally {
    sock.destroy();
  }
}

// VoIP.ms only delivers SMS to Canada/US numbers (+1).
async function sendSms(cfg, { to, message }) {
  if (!cfg.VOIPMS_USER || !cfg.VOIPMS_API_PASS || !cfg.VOIPMS_DID) throw new Error('SMS is not configured');
  const dst = to.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(dst)) throw new Error('SMS_NOT_SUPPORTED');
  const q = new URLSearchParams({
    api_username: cfg.VOIPMS_USER,
    api_password: cfg.VOIPMS_API_PASS,
    method: 'sendSMS',
    did: cfg.VOIPMS_DID.replace(/\D/g, ''),
    dst,
    message,
  });
  const r = await fetch('https://voip.ms/api/v1/rest.php?' + q.toString());
  const j = await r.json().catch(() => ({}));
  if (j.status !== 'success') throw new Error('VoIP.ms: ' + (j.status || r.status));
}

module.exports = { sendEmail, sendSms };
