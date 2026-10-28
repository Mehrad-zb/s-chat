'use strict';
/* 1:1 voice & video calls over WebRTC (signaling through the S-Chat socket, relay via TURN) */

const Call = {
  cur: null, // { id, chatId, peer, video, outgoing, pc, local, remote, state, startedAt, polite, ... }

  uuid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); },

  async getMedia(video) {
    const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false };
    try { return await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) {
      if (video) { try { return await navigator.mediaDevices.getUserMedia({ audio: constraints.audio }); } catch {} }
      throw e;
    }
  },

  async start(chatId, video) {
    if (this.cur) { this.showOverlay(); return; }
    const c = S.chats.get(chatId);
    if (!c || c.type !== 'direct' || isSaved(c)) return;
    if (!navigator.mediaDevices || !window.RTCPeerConnection) { toast(errText('default')); return; }
    const peer = S.users.get(c.peer.id) || c.peer;
    this.cur = { id: this.uuid(), chatId, peer, video, outgoing: true, state: 'calling', polite: false, pendingIce: [] };
    this.showOverlay();
    Sound.ensure();
    try { this.cur.local = await this.getMedia(video); }
    catch { toast(t('mic_denied')); this.cleanup(); return; }
    if (!this.cur) { return; }
    this.attachLocal();
    RT.send({ t: 'call:invite', call_id: this.cur.id, chat_id: chatId, video: !!video });
    Sound.startRing('outgoing');
  },

  onInvite(m) {
    if (this.cur) {
      if (this.cur.id === m.call_id) return; // re-sent invite after reconnect
      RT.send({ t: 'call:reject', call_id: m.call_id });
      return;
    }
    const peer = putUser(m.from);
    this.cur = { id: m.call_id, chatId: m.chat_id, peer, video: m.video, outgoing: false, state: 'incoming', polite: true, pendingIce: [] };
    RT.send({ t: 'call:ringing', call_id: m.call_id });
    this.showOverlay();
    if (window.__answer && window.__answer === m.call_id) { window.__answer = null; setTimeout(() => this.accept(), 250); return; }
    Sound.startRing('incoming');
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(peer.name, { body: m.video ? t('incoming_video') : t('incoming_call'), tag: 'call-' + m.call_id, renotify: true, requireInteraction: true, icon: '/icons/icon-192.png?v=2', data: { chat_id: m.chat_id } })).catch(() => {});
    }
  },

  async accept() {
    const c = this.cur; if (!c || c.state !== 'incoming') return;
    Sound.stopRing();
    c.state = 'connecting'; this.renderOverlay();
    try { c.local = await this.getMedia(c.video); }
    catch { toast(t('mic_denied')); this.hangup(); return; }
    if (this.cur !== c) return;
    this.attachLocal();
    this.createPc();
    RT.send({ t: 'call:accept', call_id: c.id });
  },

  decline() { if (!this.cur) return; RT.send({ t: 'call:reject', call_id: this.cur.id }); this.cleanup(); },
  hangup() { if (!this.cur) return; RT.send({ t: 'call:hangup', call_id: this.cur.id }); Sound.end(); this.cleanup(); },

  createPc() {
    const c = this.cur;
    const pc = new RTCPeerConnection({ iceServers: S.ice, iceCandidatePoolSize: 2 });
    c.pc = pc; c.makingOffer = false; c.ignoreOffer = false;
    c.remote = new MediaStream();
    for (const tr of c.local.getTracks()) pc.addTrack(tr, c.local);
    pc.ontrack = (e) => {
      if (!c.remote.getTracks().includes(e.track)) c.remote.addTrack(e.track);
      e.track.onunmute = () => this.renderOverlay();
      this.attachRemote();
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.signal({ type: 'ice', candidate: e.candidate.toJSON() }); };
    pc.onnegotiationneeded = async () => {
      try {
        c.makingOffer = true;
        await pc.setLocalDescription();
        this.signal({ type: 'sdp', description: pc.localDescription.toJSON() });
      } catch (e) { console.warn(e); } finally { c.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') {
        if (!c.startedAt) { c.startedAt = Date.now(); this.startTimer(); }
        c.state = 'connected'; clearTimeout(c.failTimer);
        try { if (window.SatinNative) window.SatinNative.inCall(true, !!c.video); } catch {}
      } else if (st === 'disconnected') {
        c.state = 'reconnecting';
        c.failTimer = setTimeout(() => { if (pc.connectionState !== 'connected') { try { pc.restartIce(); } catch {} } }, 2500);
      } else if (st === 'failed') {
        c.state = 'reconnecting';
        try { pc.restartIce(); } catch {}
        clearTimeout(c.dropTimer);
        c.dropTimer = setTimeout(() => { if (this.cur === c && pc.connectionState !== 'connected') this.hangup(); }, 25000);
      }
      this.renderOverlay();
    };
    return pc;
  },

  signal(data) { if (this.cur) RT.send({ t: 'call:signal', call_id: this.cur.id, data }); },

  async onSignal(m) {
    const c = this.cur; if (!c || c.id !== m.call_id || !c.pc) return;
    const pc = c.pc; const d = m.data || {};
    try {
      if (d.type === 'sdp') {
        const desc = d.description;
        const collision = desc.type === 'offer' && (c.makingOffer || pc.signalingState !== 'stable');
        c.ignoreOffer = !c.polite && collision;
        if (c.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        for (const ice of c.pendingIce.splice(0)) await pc.addIceCandidate(ice).catch(() => {});
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          this.signal({ type: 'sdp', description: pc.localDescription.toJSON() });
        }
      } else if (d.type === 'ice') {
        if (!pc.remoteDescription) c.pendingIce.push(d.candidate);
        else await pc.addIceCandidate(d.candidate).catch((e) => { if (!c.ignoreOffer) console.warn(e); });
      }
    } catch (e) { console.warn('[call]', e); }
  },

  onAccept(m) {
    const c = this.cur; if (!c || c.id !== m.call_id || !c.outgoing) return;
    Sound.stopRing();
    c.state = 'connecting'; this.renderOverlay();
    this.createPc(); // negotiationneeded fires -> offer
  },

  onRinging(m) { const c = this.cur; if (c && c.id === m.call_id && c.state === 'calling') { c.state = 'ringing'; this.renderOverlay(); } },

  onMedia(m) {
    const c = this.cur; if (!c || c.id !== m.call_id) return;
    c.peerMuted = !!(m.data && m.data.muted); c.peerCam = !!(m.data && m.data.camera);
    this.renderOverlay();
  },

  onEnd(m) {
    const c = this.cur; if (!c || c.id !== m.call_id) return;
    const reasons = { busy: 'user_busy', timeout: 'no_answer', reject: 'call_declined', unavailable: 'unavailable', 'answered-elsewhere': 'answered_elsewhere' };
    if (m.reason === 'answered-elsewhere' && c.pc) return; // that was us
    if (m.reason !== 'answered-elsewhere') Sound.end();
    toast(t(reasons[m.reason] || 'call_ended'));
    this.cleanup();
  },

  cleanup() {
    try { if (window.SatinNative) window.SatinNative.inCall(false, false); } catch {}
    const c = this.cur; if (!c) return;
    Sound.stopRing();
    clearInterval(c.timer); clearTimeout(c.failTimer); clearTimeout(c.dropTimer);
    if (c.pc) { try { c.pc.close(); } catch {} }
    if (c.local) c.local.getTracks().forEach((tr) => tr.stop());
    this.cur = null;
    const ov = $('#callOv'); if (ov) ov.remove();
    const mini = $('#callMini'); if (mini) mini.remove();
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then((r) => r.getNotifications({ tag: 'call-' + c.id })).then((ns) => ns && ns.forEach((n) => n.close())).catch(() => {});
  },

  // ---------------- controls ----------------
  toggleMute() {
    const c = this.cur; if (!c || !c.local) return;
    c.muted = !c.muted;
    c.local.getAudioTracks().forEach((tr) => { tr.enabled = !c.muted; });
    this.sendMediaState(); this.renderOverlay();
  },

  async toggleCamera() {
    const c = this.cur; if (!c || !c.local) return;
    let vt = c.local.getVideoTracks()[0];
    if (!vt) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: c.facing || 'user' } });
        vt = s.getVideoTracks()[0];
        c.local.addTrack(vt);
        if (c.pc) {
          const tx = c.pc.getTransceivers().find((x) => x.receiver.track && x.receiver.track.kind === 'video' && !x.sender.track && !x.stopped);
          if (tx) { await tx.sender.replaceTrack(vt); tx.direction = 'sendrecv'; tx.sender.setStreams && tx.sender.setStreams(c.local); }
          else c.pc.addTrack(vt, c.local);
        }
        c.camOff = false; c.video = true;
      } catch { toast(t('mic_denied')); return; }
    } else {
      c.camOff = !c.camOff; vt.enabled = !c.camOff;
    }
    this.attachLocal(); this.sendMediaState(); this.renderOverlay();
  },

  async flipCamera() {
    const c = this.cur; if (!c || !c.local) return;
    const old = c.local.getVideoTracks()[0]; if (!old) return;
    c.facing = (c.facing || 'user') === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: c.facing } } });
      const nt = s.getVideoTracks()[0];
      if (c.pc) { const sender = c.pc.getSenders().find((x) => x.track && x.track.kind === 'video'); if (sender) await sender.replaceTrack(nt); }
      c.local.removeTrack(old); old.stop(); c.local.addTrack(nt);
      this.attachLocal();
    } catch { c.facing = c.facing === 'user' ? 'environment' : 'user'; }
  },

  sendMediaState() {
    const c = this.cur; if (!c) return;
    const vt = c.local && c.local.getVideoTracks()[0];
    RT.send({ t: 'call:media', call_id: c.id, data: { muted: !!c.muted, camera: !!(vt && vt.enabled && !c.camOff) } });
  },

  startTimer() {
    const c = this.cur; if (!c) return;
    clearInterval(c.timer);
    c.timer = setInterval(() => {
      const st = $('#callOv .st'); if (st && c.state === 'connected') st.textContent = fmt.dur((Date.now() - c.startedAt) / 1000);
      const mini = $('#callMini span'); if (mini) mini.textContent = fmt.dur((Date.now() - c.startedAt) / 1000);
    }, 1000);
    this.sendMediaState();
  },

  // ---------------- UI ----------------
  attachLocal() { const v = $('#callOv .local'); if (v && this.cur && this.cur.local) { v.srcObject = this.cur.local; v.play().catch(() => {}); } this.renderOverlay(); },
  attachRemote() {
    const v = $('#callOv .remote'); const c = this.cur;
    if (v && c && c.remote && v.srcObject !== c.remote) { v.srcObject = c.remote; v.play().catch(() => {}); }
    this.renderOverlay();
  },

  showOverlay() {
    const mini = $('#callMini'); if (mini) mini.remove();
    if ($('#callOv')) { this.renderOverlay(); return; }
    const c = this.cur; if (!c) return;
    const el = h(`<div class="call-ov" id="callOv">
      <video class="remote" playsinline autoplay hidden></video>
      <video class="local" playsinline autoplay muted hidden></video>
      <div style="align-self:stretch;display:flex;justify-content:flex-start"><button class="ibtn" id="callMin" style="color:#fff" title="${t('back_to_call')}">${icon('min')}</button></div>
      <div class="who">${avatar(c.peer, 'xl')}<h2>${esc(c.peer.name)}</h2><div class="st"></div></div>
      <div class="ctrls" id="callCtrls"></div></div>`);
    document.body.appendChild(el);
    $('#callMin').onclick = () => this.minimize();
    if (c.local) this.attachLocal();
    if (c.remote) this.attachRemote();
    this.renderOverlay();
  },

  minimize() {
    const c = this.cur; if (!c) return;
    const ov = $('#callOv'); if (ov) ov.style.display = 'none';
    if ($('#callMini')) return;
    const m = h(`<div class="call-mini" id="callMini">${icon('phone')}<b>${esc(c.peer.name)}</b><span></span><button class="ibtn" style="color:#fff;width:34px;height:34px;background:#e5484d">${icon('hangup')}</button></div>`);
    m.onclick = (e) => { if (e.target.closest('button')) { this.hangup(); return; } m.remove(); if (ov) ov.style.display = ''; };
    document.body.appendChild(m);
  },

  renderOverlay() {
    const c = this.cur; const el = $('#callOv'); if (!c || !el) return;
    const st = $('.st', el);
    const labels = { calling: 'calling', ringing: 'ringing', connecting: 'connecting', reconnecting: 'reconnecting', incoming: c.video ? 'incoming_video' : 'incoming_call' };
    if (c.state !== 'connected') st.textContent = t(labels[c.state] || 'connecting');
    else if (c.startedAt) st.textContent = fmt.dur((Date.now() - c.startedAt) / 1000) + (c.peerMuted ? ' · 🔇' : '');
    $('.av', el).classList.toggle('ringing', c.state === 'incoming' || c.state === 'ringing' || c.state === 'calling');
    const lv = $('.local', el), rv = $('.remote', el);
    const localVideo = c.local && c.local.getVideoTracks().some((tr) => tr.enabled && tr.readyState === 'live') && !c.camOff;
    const remoteVideo = c.remote && c.remote.getVideoTracks().some((tr) => tr.readyState === 'live' && !tr.muted) && (c.peerCam !== false || !c.startedAt);
    lv.hidden = !localVideo;
    rv.hidden = !remoteVideo;
    el.classList.toggle('video-on', !!remoteVideo);
    // keep remote audio flowing even when video is hidden
    if (!remoteVideo && c.remote && rv.srcObject !== c.remote) { rv.srcObject = c.remote; rv.play().catch(() => {}); }
    rv.style.display = remoteVideo ? '' : 'block';
    if (!remoteVideo) { rv.style.opacity = '0'; } else rv.style.opacity = '1';
    rv.hidden = false;
    const ctrls = $('#callCtrls', el);
    const btn = (id, ic, label, cls = '') => `<button class="cb ${cls}" id="${id}"><span>${icon(ic)}</span>${esc(label)}</button>`;
    let html;
    if (c.state === 'incoming') {
      html = btn('cbDecline', 'hangup', t('decline'), 'end') + btn('cbAccept', c.video ? 'video' : 'phone', t('accept'), 'ok');
    } else {
      const hasCam = c.local && c.local.getVideoTracks().length;
      html = btn('cbMute', c.muted ? 'micOff' : 'mic', t(c.muted ? 'unmute' : 'mute'), c.muted ? 'off' : '')
        + btn('cbCam', localVideo ? 'video' : 'videoOff', t('camera_on'), localVideo ? 'off' : '')
        + (hasCam && matchMedia('(pointer:coarse)').matches ? btn('cbFlip', 'flip', t('flip')) : '')
        + btn('cbEnd', 'hangup', t('end'), 'end');
    }
    if (ctrls._h !== html) {
      ctrls.innerHTML = html; ctrls._h = html;
      const on = (id, fn) => { const b = $('#' + id, ctrls); if (b) b.onclick = fn; };
      on('cbAccept', () => this.accept());
      on('cbDecline', () => this.decline());
      on('cbMute', () => this.toggleMute());
      on('cbCam', () => this.toggleCamera());
      on('cbFlip', () => this.flipCamera());
      on('cbEnd', () => this.hangup());
    }
  },
};

RT.on('call:invite', (m) => Call.onInvite(m));
RT.on('call:accept', (m) => Call.onAccept(m));
RT.on('call:ringing', (m) => Call.onRinging(m));
RT.on('call:signal', (m) => Call.onSignal(m));
RT.on('call:media', (m) => Call.onMedia(m));
RT.on('call:end', (m) => Call.onEnd(m));
window.addEventListener('beforeunload', () => { if (Call.cur) RT.send({ t: 'call:hangup', call_id: Call.cur.id }); });
