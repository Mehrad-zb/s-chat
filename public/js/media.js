'use strict';
/* Media: picking/compressing/uploading files, viewer, voice player & recorder */

const Media = {
  async squareAvatar(file) {
    const img = await this.loadImage(file);
    const size = Math.min(640, img.width, img.height);
    const c = document.createElement('canvas'); c.width = c.height = size;
    const s = Math.min(img.width, img.height);
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return new Promise((r) => c.toBlob((b) => r(new File([b], 'avatar.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.88));
  },

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = reject;
      img.src = url;
    });
  },

  thumbFrom(source, w, h) {
    const tw = 24, th = Math.max(1, Math.round(24 * h / w));
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    c.getContext('2d').drawImage(source, 0, 0, tw, th);
    return c.toDataURL('image/jpeg', 0.6);
  },

  async prepImage(file, compress) {
    if (/gif|svg/.test(file.type)) return { blob: file, meta: {} };
    let img;
    try { img = await this.loadImage(file); } catch { return { blob: file, meta: {}, asFile: true }; }
    const meta = { width: img.naturalWidth, height: img.naturalHeight };
    meta.thumb = this.thumbFrom(img, meta.width, meta.height);
    if (!compress || (file.size < 400 * 1024 && /jpe?g|webp/.test(file.type))) return { blob: file, meta };
    const max = 2048;
    const scale = Math.min(1, max / Math.max(meta.width, meta.height));
    const w = Math.round(meta.width * scale), hh = Math.round(meta.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    c.getContext('2d').drawImage(img, 0, 0, w, hh);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size > file.size) return { blob: file, meta };
    meta.width = w; meta.height = hh;
    return { blob: new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }), meta };
  },

  prepVideo(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
      let done = false;
      const finish = (meta) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve({ blob: file, meta }); };
      v.onloadedmetadata = () => {
        const meta = { width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration: Math.round(v.duration || 0) };
        v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
        v.onseeked = () => {
          try {
            const w = 320, hh = Math.round(320 * (v.videoHeight || 180) / (v.videoWidth || 320));
            const c = document.createElement('canvas'); c.width = w; c.height = hh;
            c.getContext('2d').drawImage(v, 0, 0, w, hh);
            const d = c.toDataURL('image/jpeg', 0.55);
            if (d.length < 12000) meta.thumb = d; else meta.thumb = this.thumbFrom(v, v.videoWidth, v.videoHeight);
          } catch {}
          finish(meta);
        };
        setTimeout(() => finish(meta), 2500);
      };
      v.onerror = () => finish({});
      setTimeout(() => finish({}), 6000);
    });
  },

  kindOf(file, asFile) {
    if (asFile) return 'file';
    if (/^image\/(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(file.type)) return 'image';
    if (/^video\/(mp4|webm|quicktime|3gpp)/i.test(file.type)) return 'video';
    if (/^audio\//i.test(file.type)) return 'audio';
    return 'file';
  },

  pick(files, asFile) {
    const max = S.config.max_upload || 200 * 1024 * 1024;
    const tooBig = files.filter((f) => f.size > max);
    if (tooBig.length) { toast(t('file_too_large', { m: fmt.num(Math.round(max / 1048576)) })); files = files.filter((f) => f.size <= max); }
    if (!files.length) return;
    const chatId = S.cur;
    const urls = files.map((f) => (/^image\//.test(f.type) || /^video\//.test(f.type) ? URL.createObjectURL(f) : null));
    const visual = files.some((f) => /^image\//.test(f.type) && !/svg/.test(f.type));
    const m = Modals.open(`<header><h3>${t('send_n', { n: fmt.num(files.length) })}</h3><button class="ibtn" data-close>${icon('x')}</button></header>
      <div class="body">
        <div class="gal" style="padding:0;grid-template-columns:repeat(${Math.min(3, files.length)},1fr)">
          ${files.map((f, i) => urls[i] && !asFile ? `<div>${/^video/.test(f.type) ? `<video src="${urls[i]}" muted preload="metadata"></video>` : `<img src="${urls[i]}" alt="">`}</div>`
            : `<div style="display:grid;place-items:center;padding:8px;text-align:center;font-size:12px">${icon('doc')}<span style="overflow-wrap:anywhere">${esc(f.name)}</span><span class="mut">${fmt.size(f.size)}</span></div>`).join('')}
        </div>
        <textarea class="input" id="mCap" rows="2" placeholder="${t('caption_ph')}" dir="auto">${esc(($('#cText') || {}).value || '')}</textarea>
        ${visual && !asFile ? `<label style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" id="mComp" checked> ${t('compress')}</label>
          <label style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" id="mAsFile"> ${t('send_as_files')}</label>` : ''}
      </div>
      <footer><button class="btn ghost" data-close>${t('cancel')}</button><button class="btn" id="mGo">${icon('send')} ${t('send')}</button></footer>`,
      { onClose: () => urls.forEach((u) => u && URL.revokeObjectURL(u)) });
    const cap = $('#mCap', m.el); cap.focus();
    cap.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#mGo', m.el).click(); } };
    $('#mGo', m.el).onclick = async () => {
      const caption = cap.value.trim();
      const compress = $('#mComp', m.el) ? $('#mComp', m.el).checked : true;
      const af = asFile || ($('#mAsFile', m.el) && $('#mAsFile', m.el).checked);
      m.close();
      const ta = $('#cText'); if (ta && caption && ta.value.trim() === caption) { ta.value = ''; Composer.autosize(); Composer.updateSendBtn(); Chat.drafts.delete(chatId); }
      const reply = Chat.reply; Chat.reply = null; Composer.renderCtx();
      for (let i = 0; i < files.length; i++) await this.sendFile(chatId, files[i], { caption: i === 0 ? caption : '', compress, asFile: af, reply: i === 0 ? reply : null });
    };
  },

  async sendFile(chatId, file, { caption = '', compress = true, asFile = false, reply = null, kind, meta: extraMeta } = {}) {
    kind = kind || this.kindOf(file, asFile);
    let blob = file, meta = extraMeta || {};
    if (kind === 'image') { const r = await this.prepImage(file, compress); blob = r.blob; meta = r.meta; if (r.asFile) kind = 'file'; }
    else if (kind === 'video') { const r = await this.prepVideo(file); meta = r.meta; }
    const local = URL.createObjectURL(blob);
    const body = { kind, text: caption, meta, reply_to: reply ? reply.id : null };
    const m = Composer.makePending(chatId, body, reply, { _local: local, _file: blob, _progress: 0, file: { name: file.name || 'file', size: blob.size, mime: blob.type, url: local } });
    return this.uploadAndSend(m);
  },

  async uploadAndSend(m) {
    const chatId = m.chat_id;
    const tick = setInterval(() => RT.send({ t: 'typing', chat_id: chatId, action: m.kind === 'voice' ? 'recording' : 'uploading' }), 3000);
    try {
      const up = await API.upload(m._file, m.file.name, (p) => {
        m._progress = p;
        const el = document.querySelector(`[data-k="c${m.client_id}"] .ring .fg`);
        if (el) el.setAttribute('stroke-dashoffset', String(138.2 * (1 - p)));
      });
      m._body.file_id = up.id;
      clearInterval(tick);
      return Composer.post(chatId, m._body, null, m);
    } catch (e) {
      clearInterval(tick);
      m._failed = true; m._v++;
      if (chatId === S.cur) Chat.renderMsgs();
      toast(errText(e.code));
      return null;
    }
  },
};

// ---------------- viewer ----------------
const Viewer = {
  open(m, list) {
    const all = list || ((S.msgs.get(m.chat_id) || {}).list || []).filter((x) => (x.kind === 'image' || x.kind === 'video') && !x.deleted && x.file && !x._pending);
    let i = Math.max(0, all.findIndex((x) => x.id === m.id));
    const el = h(`<div class="viewer" role="dialog">
      <div class="vt"><button class="ibtn" data-x>${icon('x')}</button><div class="x"><b></b><div class="small" style="opacity:.75"></div></div>
        <button class="ibtn" data-prev>${icon(LANG === 'fa' ? 'fwd' : 'back')}</button><button class="ibtn" data-next>${icon(LANG === 'fa' ? 'back' : 'fwd')}</button>
        <a class="ibtn" data-dl download>${icon('download')}</a></div>
      <div class="vc"></div><div class="cap"></div></div>`);
    const show = () => {
      const x = all[i]; if (!x) return;
      $('.vt b', el).textContent = userName(x.sender_id);
      $('.vt .small', el).textContent = fmt.day(x.created_at) + ' · ' + fmt.time(x.created_at);
      const url = x._local || x.file.url;
      $('.vc', el).innerHTML = x.kind === 'video' ? `<video src="${esc(url)}" controls autoplay playsinline></video>` : `<img src="${esc(url)}" alt="">`;
      $('.cap', el).textContent = x.text || '';
      const dl = $('[data-dl]', el); dl.href = x.file.url; dl.setAttribute('download', x.file.name);
      $('[data-prev]', el).style.visibility = i > 0 ? 'visible' : 'hidden';
      $('[data-next]', el).style.visibility = i < all.length - 1 ? 'visible' : 'hidden';
    };
    const close = () => { el.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') { LANG === 'fa' ? next() : prev(); }
      if (e.key === 'ArrowRight') { LANG === 'fa' ? prev() : next(); }
    };
    const prev = () => { if (i > 0) { i--; show(); } };
    const next = () => { if (i < all.length - 1) { i++; show(); } };
    $('[data-x]', el).onclick = close;
    $('[data-prev]', el).onclick = prev;
    $('[data-next]', el).onclick = next;
    $('.vc', el).onclick = (e) => { if (e.target === e.currentTarget) close(); };
    let sx = null;
    el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) < 60) return;
      if ((dx < 0) !== (LANG === 'fa')) next(); else prev();
    });
    document.addEventListener('keydown', key);
    document.body.appendChild(el);
    show();
  },
};

// ---------------- voice player ----------------
const Voice = {
  audio: null, curKey: null, speed: 1, raf: null,
  html(m, url) {
    const meta = m.meta || {};
    const wf = (meta.waveform && meta.waveform.length ? meta.waveform : Array.from({ length: 40 }, (_, i) => 6 + ((i * 7919 + (m.id | 0)) % 17)));
    const k = (typeof m.id === 'number' ? 'm' + m.id : 'c' + m.client_id);
    const isVoice = m.kind === 'voice';
    return `<div class="voice" data-vk="${k}" data-url="${esc(url || '')}">
      <button class="pp" data-voice="${k}" aria-label="play">${icon(this.curKey === k && this.audio && !this.audio.paused ? 'pause' : 'play')}</button>
      <div style="flex:1;min-width:0;display:grid;gap:2px">
        ${isVoice ? `<div class="wave">${wf.map((v) => `<i style="height:${Math.max(3, Math.round((v / 31) * 28))}px"></i>`).join('')}</div>`
        : `<div class="fn" style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.file ? m.file.name : '')}</div><div class="wave" style="height:6px;background:rgba(127,127,127,.25);border-radius:3px;gap:0"><i class="p" style="height:6px;flex:none;width:0%;opacity:1;border-radius:3px"></i></div>`}
        <div style="display:flex;align-items:center;gap:8px"><span class="vt">${fmt.dur(meta.duration || 0)}</span>${isVoice ? `<button class="spd">${this.speed}×</button>` : ''}</div>
      </div></div>`;
  },
  toggle(key, list) {
    const el = document.querySelector(`[data-vk="${key}"]`); if (!el) return;
    if (this.curKey === key && this.audio) {
      if (this.audio.paused) this.audio.play().catch(() => {}); else this.audio.pause();
      return;
    }
    this.stop();
    const a = new Audio(el.dataset.url);
    a.playbackRate = this.speed;
    this.audio = a; this.curKey = key;
    a.onplay = () => { this.setIcon(key, 'pause'); this.loop(); };
    a.onpause = () => { this.setIcon(key, 'play'); cancelAnimationFrame(this.raf); };
    a.onended = () => {
      this.setIcon(key, 'play'); this.paint(key, 0, a.duration); cancelAnimationFrame(this.raf);
      // autoplay next voice message in the chat
      const store = S.msgs.get(S.cur);
      if (store) {
        const idx = store.list.findIndex((m) => this.keyOf(m) === key);
        const next = store.list.slice(idx + 1).find((m) => m.kind === 'voice' && !m.deleted);
        if (next && idx >= 0) { this.curKey = null; this.toggle(this.keyOf(next)); return; }
      }
      this.curKey = null; this.audio = null;
    };
    a.play().catch(() => toast(errText('default')));
  },
  keyOf(m) { return typeof m.id === 'number' ? 'm' + m.id : 'c' + m.client_id; },
  stop() { if (this.audio) { this.audio.pause(); const k = this.curKey; this.audio = null; this.curKey = null; if (k) this.setIcon(k, 'play'); } },
  setIcon(key, ic) { $$(`[data-vk="${key}"] .pp`).forEach((b) => b.innerHTML = icon(ic)); },
  loop() {
    const a = this.audio; if (!a) return;
    this.paint(this.curKey, a.currentTime, a.duration);
    this.raf = requestAnimationFrame(() => this.loop());
  },
  paint(key, cur, dur) {
    for (const el of $$(`[data-vk="${key}"]`)) {
      const bars = $$('.wave i', el);
      const frac = dur && isFinite(dur) ? cur / dur : 0;
      if (bars.length === 1) bars[0].style.width = (frac * 100) + '%';
      else { const n = Math.round(frac * bars.length); bars.forEach((b, i) => b.classList.toggle('p', i < n)); }
      const vt = $('.vt', el); if (vt) vt.textContent = fmt.dur(cur > 0 ? cur : (dur && isFinite(dur) ? dur : 0));
    }
  },
  seek(wave, e) {
    const el = wave.closest('[data-vk]'); const key = el.dataset.vk;
    const r = wave.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (this.curKey !== key) { this.toggle(key); }
    const a = this.audio; if (!a) return;
    const go = () => { if (isFinite(a.duration)) a.currentTime = frac * a.duration; };
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
  },
  cycleSpeed() {
    this.speed = this.speed === 1 ? 1.5 : this.speed === 1.5 ? 2 : 1;
    if (this.audio) this.audio.playbackRate = this.speed;
    $$('.voice .spd').forEach((b) => b.textContent = this.speed + '×');
  },
};

// ---------------- voice recorder ----------------
const Recorder = {
  active: false,
  async start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast(errText('default')); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { toast(t('mic_denied')); return; }
    Voice.stop();
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const ctx = Sound.ensure();
    let analyser, levels = [];
    if (ctx) {
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      src.connect(analyser);
    }
    this.active = true;
    const chatId = S.cur;
    const started = Date.now();
    const bar = $('#cbar');
    const saved = bar.innerHTML;
    bar.innerHTML = `<button class="ibtn" id="rCancel" title="${t('cancel')}">${icon('trash')}</button>
      <div class="rec"><span class="rd"></span><span class="rt">0:00</span><div class="lv" id="rLv"></div></div>
      <button class="ibtn send" id="rSend" title="${t('send')}">${icon('send')}</button>`;
    const lv = $('#rLv');
    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;
    let raf;
    const loop = () => {
      const sec = (Date.now() - started) / 1000;
      const rt = $('.rec .rt'); if (rt) rt.textContent = fmt.dur(sec);
      if (analyser) {
        analyser.getByteTimeDomainData(buf);
        let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        const v = Math.min(31, Math.round((peak / 128) * 31 * 1.6));
        levels.push(v);
        if (levels.length % 3 === 0 && lv) {
          lv.appendChild(h(`<i style="height:${Math.max(3, v)}px"></i>`));
          if (lv.children.length > 120) lv.firstChild.remove();
        }
      }
      if (sec > 900) { finish(true); return; }
      raf = requestAnimationFrame(loop);
    };
    const typingIv = setInterval(() => RT.send({ t: 'typing', chat_id: chatId, action: 'recording' }), 3000);
    RT.send({ t: 'typing', chat_id: chatId, action: 'recording' });
    const finish = (send) => {
      if (!this.active) return;
      this.active = false;
      cancelAnimationFrame(raf); clearInterval(typingIv);
      RT.send({ t: 'typing', chat_id: chatId, action: 'stop' });
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (document.body.contains(bar)) { bar.innerHTML = saved; Composer.render(); }
        const dur = (Date.now() - started) / 1000;
        if (!send) return;
        if (dur < 0.8) { toast(t('voice_too_short')); return; }
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const blob = new File(chunks, `voice-${Date.now()}.${ext}`, { type });
        // downsample levels to 48 bars
        const n = 48, wf = [];
        for (let i = 0; i < n; i++) {
          const a = Math.floor(i * levels.length / n), b = Math.max(a + 1, Math.floor((i + 1) * levels.length / n));
          let mx = 0; for (let j = a; j < b; j++) mx = Math.max(mx, levels[j] || 0);
          wf.push(mx);
        }
        Media.sendFile(chatId, blob, { kind: 'voice', meta: { duration: Math.round(dur), waveform: wf } });
      };
      try { rec.stop(); } catch { stream.getTracks().forEach((tr) => tr.stop()); }
    };
    $('#rCancel').onclick = () => finish(false);
    $('#rSend').onclick = () => finish(true);
    this._finish = finish;
    rec.start(250);
    loop();
  },
  cancel() { if (this.active && this._finish) this._finish(false); },
};
