/* Updata SMS link assistant — real-time voice call screen. Plain JS (no framework).
 * Media: the customer's microphone and speaker ⇄ LiveKit (WebRTC) ⇄ the CRM voice agent
 * worker (OpenAI Realtime). Every state on screen comes from the live session: the room
 * connection, the agent's published `lk.agent.state`, real audio levels and real
 * transcription streams. Nothing here plays canned audio or invents a transcript. */
/* global window, document, navigator, location, MediaStream, HTMLMediaElement, requestAnimationFrame, cancelAnimationFrame */
(function () {
  'use strict';
  var U = window.ULA;
  if (!U || !document.getElementById('stage')) return;
  var boot = U.boot;
  var $ = function (id) { return document.getElementById(id); };
  var t = U.t;
  var stage = $('stage'), vapp = $('vapp'), stateEl = $('vstate'), pill = $('vpill'), timerEl = $('vtimer');
  var caption = $('caption'), orb = $('orb'), wave = $('wave'), log = $('vlog'), conv = $('vconv');
  var api = location.pathname.replace(/\/+$/, '') + '/api';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia ? window.matchMedia('(min-width: 768px)') : { matches: false };

  var LK = null, room = null, audioCtx = null, micAn = null, agentAn = null;
  var raf = 0, timerInt = 0, pollInt = 0, agentWait = 0;
  var call = fresh();
  var seen = {};
  var lastProgress = boot.progress;
  (boot.summary || []).forEach(function (a) { seen[a.label + '\u0000' + a.value] = true; });
  // Measured on this device (window.__ulaVoice): connection set-up and agent reply latency.
  var metrics = window.__ulaVoice = { setup: {}, replies: [] };

  function fresh() {
    return { phase: 'idle', agent: null, agentState: null, muted: false, hangingUp: false, startedAt: 0, maxSeconds: 0, segments: {}, userSpeaking: false, userEndAt: 0, awaitingAudio: false };
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fill(s, v) { return String(s || '').replace(/\{(\w+)\}/g, function (m, k) { return k in v ? v[k] : m; }); }
  function now() { return window.performance ? window.performance.now() : Date.now(); }

  // ---- state → screen
  var STATUS = { idle: 'sReady', connecting: 'sConnecting', waiting: 'sWaiting', listening: 'sListening', thinking: 'sThinking', speaking: 'sSpeaking', muted: 'sMuted', reconnecting: 'sReconnecting', ended: 'sEnded', error: '' };
  var PILL = { idle: 'pReady', connecting: 'pConnecting', waiting: 'pConnecting', reconnecting: 'pReconnecting', ended: 'pEnded', error: 'pEnded' };
  var LIVE = { listening: 1, thinking: 1, speaking: 1, muted: 1 };
  function visual() {
    if (call.phase !== 'live') return call.phase;
    if (!call.agent || !call.agentState || call.agentState === 'initializing') return 'waiting';
    if (call.agentState === 'speaking') return 'speaking';
    if (call.agentState === 'thinking') return 'thinking';
    return call.muted ? 'muted' : 'listening';
  }
  function render() {
    var v = visual();
    stage.setAttribute('data-state', v);
    if (LIVE[v]) stage.setAttribute('data-live', ''); else stage.removeAttribute('data-live');
    stateEl.textContent = STATUS[v] ? t(STATUS[v]) : '';
    pill.lastChild.textContent = t(PILL[v] || 'pLive');
    $('vconn').hidden = !LIVE[v];
    var lang = $('vlang');
    if (lang) lang.disabled = call.phase !== 'idle' && call.phase !== 'ended' && call.phase !== 'error';
  }
  function setPhase(p) { call.phase = p; render(); }
  function show(panel) {
    ['vpre', 'vctl', 'vresult'].forEach(function (id) { $(id).hidden = id !== panel; });
  }

  // ---- LiveKit SDK: first-party file, fetched when the page is idle so Start is quick
  var lkLoading = null;
  function loadLiveKit() {
    if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
    if (lkLoading) return lkLoading;
    lkLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = boot.livekitSrc;
      s.async = true;
      s.onload = function () { if (window.LivekitClient) resolve(window.LivekitClient); else reject(new Error('LIVEKIT_LOAD')); };
      s.onerror = function () { lkLoading = null; reject(new Error('LIVEKIT_LOAD')); };
      document.head.appendChild(s);
    });
    return lkLoading;
  }
  if (boot.livekitSrc) (window.requestIdleCallback || function (f) { setTimeout(f, 1200); })(function () { loadLiveKit().catch(function () { /* retried on Start */ }); });

  function supported() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  }

  function getState() {
    return fetch(api + '/state', { credentials: 'same-origin', headers: { 'X-Requested-With': 'ula' } }).then(function (res) {
      return res.json().then(function (j) { if (!res.ok) throw Object.assign(new Error(j.code || 'ERR'), { status: res.status, code: j.code }); return j; });
    });
  }

  // ---- start a call
  function start() {
    if (call.phase === 'connecting' || call.phase === 'waiting' || call.phase === 'live') return;
    // Microphones need a secure page (https or localhost); say so rather than "unsupported".
    if (window.isSecureContext === false) { showProblem('insecure'); return; }
    if (!supported()) { showProblem('unsupported'); return; }
    call = fresh();
    metrics.setup = { clickedAt: now() };
    show('vctl');
    setControlsEnabled(false);
    setPhase('connecting');
    // Created inside the tap so the browser lets it run (visualiser only; never plays sound).
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch { audioCtx = null; }
    // Ask for the microphone BEFORE starting the agent: a refusal costs nothing.
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {
        metrics.setup.micReady = now() - metrics.setup.clickedAt;
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        return Promise.all([loadLiveKit(), U.opened().then(function () { return U.post('/voice/start', {}); })]);
      })
      .then(function (r) {
        metrics.setup.serverReady = now() - metrics.setup.clickedAt;
        return connect(r[0], r[1]);
      })
      .catch(startFailed);
  }

  function startFailed(err) {
    cleanup();
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return showProblem('mic');
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return showProblem('nomic');
    if (err && (err.code === 'SESSION_CLOSED' || err.code === 'LINK_OPTED_OUT' || err.status === 410)) return finished(null);
    if (err && err.code === 'DEVICE_NOT_VERIFIED') { location.reload(); return; }
    if (err && err.code === 'VOICE_BUDGET') return showProblem('budget');
    return showProblem('unavailable');
  }

  function connect(lk, creds) {
    LK = lk;
    var R = LK.RoomEvent;
    call.maxSeconds = creds.maxSeconds || 0;
    room = new LK.Room({
      adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    room.on(R.TrackSubscribed, function (track, pub, participant) {
      if (track.kind !== 'audio') return;
      var audio = $('vaudio');
      track.attach(audio);
      audio.play().catch(function () { /* AudioPlaybackStatusChanged shows the button */ });
      agentAn = analyser(track.mediaStreamTrack);
      if (isAgent(participant)) agentJoined(participant);
    });
    room.on(R.TrackUnsubscribed, function (track) { if (track.kind === 'audio') { track.detach(); agentAn = null; } });
    room.on(R.ParticipantConnected, function (p) { if (isAgent(p)) agentJoined(p); });
    room.on(R.ParticipantDisconnected, function (p) {
      // The agent leaves when the conversation is over (or its time limit is reached).
      if (call.agent && p.identity === call.agent.identity) remoteEnded();
    });
    room.on(R.ParticipantAttributesChanged, function (changed, p) {
      if (p && isAgent(p) && changed && changed['lk.agent.state'] !== undefined) agentState(changed['lk.agent.state']);
    });
    room.on(R.Reconnecting, function () { if (call.phase === 'live') setPhase('reconnecting'); });
    room.on(R.Reconnected, function () { if (call.phase === 'reconnecting') setPhase('live'); });
    room.on(R.Disconnected, onDisconnected);
    room.on(R.AudioPlaybackStatusChanged, function () { $('vsound').hidden = room.canPlaybackAudio; });
    room.registerTextStreamHandler('lk.transcription', onTranscription);

    return room.connect(creds.url, creds.token).then(function () {
      metrics.setup.roomConnected = now() - metrics.setup.clickedAt;
      return room.localParticipant.setMicrophoneEnabled(true);
    }).then(function () {
      var pubMic = room.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
      micAn = pubMic && pubMic.track ? analyser(pubMic.track.mediaStreamTrack) : null;
      room.startAudio().catch(function () { /* button */ });
      $('vsound').hidden = room.canPlaybackAudio;
      setPhase('live');
      setControlsEnabled(true);
      room.remoteParticipants.forEach(function (p) { if (isAgent(p)) agentJoined(p); });
      // The worker is dispatched by the server; if it never joins, say so (no silent "listening").
      if (!call.agent) agentWait = setTimeout(function () { if (!call.agent) fail('unavailable', 'agent_unavailable'); }, window.__ulaAgentWaitMs || 25000);
      initOutputs();
      loop();
      poll();
    });
  }

  function isAgent(p) {
    if (!p) return false;
    if (LK && LK.ParticipantKind && p.kind === LK.ParticipantKind.AGENT) return true;
    return /^agent-/.test(p.identity || '');
  }
  function agentJoined(p) {
    if (call.agent) return;
    call.agent = p;
    clearTimeout(agentWait);
    metrics.setup.agentJoined = now() - metrics.setup.clickedAt;
    call.startedAt = Date.now();
    timerEl.hidden = false;
    tick();
    timerInt = setInterval(tick, 1000);
    agentState((p.attributes && p.attributes['lk.agent.state']) || 'initializing');
  }
  function agentState(s) {
    var before = call.agentState;
    call.agentState = s;
    if (s === 'speaking' && before !== 'speaking') call.awaitingAudio = true;
    render();
  }

  function tick() {
    var secs = Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000));
    timerEl.textContent = (secs >= 3600 ? Math.floor(secs / 3600) + ':' : '') + String(Math.floor(secs / 60) % 60).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    timerEl.setAttribute('datetime', 'PT' + secs + 'S');
    var left = call.maxSeconds ? call.maxSeconds - secs : Infinity;
    timerEl.title = left < 60 ? t('timeLeft') : '';
    timerEl.classList.toggle('warn', left < 60);
  }

  // ---- real audio levels → orb + waveform
  function analyser(track) {
    if (!audioCtx || !track) return null;
    try {
      var src = audioCtx.createMediaStreamSource(new MediaStream([track]));
      var an = audioCtx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.72;
      src.connect(an); // analysis only: not connected to the speakers
      return { an: an, freq: new Uint8Array(an.frequencyBinCount), time: new Uint8Array(an.fftSize) };
    } catch { return null; }
  }
  function level(a) {
    if (!a) return 0;
    a.an.getByteTimeDomainData(a.time);
    var sum = 0;
    for (var i = 0; i < a.time.length; i += 1) { var x = (a.time[i] - 128) / 128; sum += x * x; }
    return Math.min(1, Math.sqrt(sum / a.time.length) * 4);
  }
  var lvl = 0, lastDraw = 0;
  var ctx2d = wave.getContext ? wave.getContext('2d') : null;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var gap = reduced ? 140 : 33;
    if (ts && ts - lastDraw < gap) return;
    lastDraw = ts || 0;
    var v = visual();
    var agentLevel = level(agentAn);
    var micLevel = call.muted ? 0 : level(micAn);
    // Reply latency: the customer stopped talking → the agent's voice is actually audible.
    if (micLevel > 0.12) { call.userSpeaking = true; } else if (call.userSpeaking && micLevel < 0.05) { call.userSpeaking = false; call.userEndAt = now(); }
    if (call.awaitingAudio && agentLevel > 0.04) {
      call.awaitingAudio = false;
      if (call.userEndAt) { metrics.replies.push(Math.round(now() - call.userEndAt)); call.userEndAt = 0; } else if (!metrics.setup.firstAudio) metrics.setup.firstAudio = now() - metrics.setup.clickedAt;
    }
    var src = v === 'speaking' ? agentAn : (v === 'listening' ? micAn : null);
    var target = v === 'speaking' ? agentLevel : (v === 'listening' ? micLevel : 0);
    lvl += (target - lvl) * 0.35;
    if (!reduced) orb.style.setProperty('--lvl', lvl.toFixed(3));
    drawWave(src, v);
  }
  function drawWave(a, v) {
    if (!ctx2d) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = wave.clientWidth, h = wave.clientHeight;
    if (wave.width !== Math.round(w * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    var bars = Math.max(20, Math.min(44, Math.floor(w / 7)));
    var bw = Math.max(2, (w / bars) * 0.45);
    var grad = ctx2d.createLinearGradient(0, 0, w, 0);
    if (v === 'speaking') { grad.addColorStop(0, '#6366f1'); grad.addColorStop(0.5, '#a78bfa'); grad.addColorStop(1, '#6366f1'); } else { grad.addColorStop(0, '#2563eb'); grad.addColorStop(0.5, '#60a5fa'); grad.addColorStop(1, '#2563eb'); }
    ctx2d.fillStyle = grad;
    if (a) a.an.getByteFrequencyData(a.freq);
    for (var i = 0; i < bars; i += 1) {
      var mirror = Math.abs(i - (bars - 1) / 2) / (bars / 2);
      var bin = a ? a.freq[Math.min(a.freq.length - 1, Math.floor((1 - mirror) * 48) + 2)] / 255 : 0;
      var bh = Math.max(3, bin * h * (1 - mirror * 0.45));
      var x = (i + 0.5) * (w / bars) - bw / 2;
      ctx2d.globalAlpha = 0.45 + 0.55 * (1 - mirror);
      roundRect(x, (h - bh) / 2, bw, bh, bw / 2);
    }
    ctx2d.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) {
    ctx2d.beginPath();
    ctx2d.moveTo(x + r, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, r);
    ctx2d.arcTo(x + w, y + h, x, y + h, r);
    ctx2d.arcTo(x, y + h, x, y, r);
    ctx2d.arcTo(x, y, x + w, y, r);
    ctx2d.fill();
  }

  // ---- live transcript (from the agent's transcription streams)
  function onTranscription(reader, info) {
    var attrs = (reader.info && reader.info.attributes) || {};
    var seg = attrs['lk.segment_id'] || (reader.info && reader.info.id) || String(Math.random());
    var mine = Boolean(room && info && info.identity === room.localParticipant.identity);
    var entry = call.segments[seg];
    if (!entry) { entry = call.segments[seg] = addEntry(mine ? 'me' : 'ai', ''); entry.text = ''; }
    var base = mine ? '' : entry.text; // user transcripts are full text; agent ones are deltas
    var acc = '';
    entry.li.classList.add('live');
    (function next(it) {
      it.next().then(function (r) {
        if (r.done) { entry.li.classList.remove('live'); if (!entry.text.trim()) entry.li.remove(); return; }
        acc += r.value;
        entry.text = base + acc;
        setText(entry.p, entry.text);
        if (!mine) { caption.hidden = false; setText(caption, entry.text); }
        scrollLog();
        next(it);
      }).catch(function () { entry.li.classList.remove('live'); });
    })(reader[Symbol.asyncIterator]());
  }
  var LTR_RUN = /(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+?\d[\d ()-]{5,}\d)/g;
  function setText(node, text) {
    node.textContent = '';
    String(text || '').split(LTR_RUN).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) { var b = el('bdi', null, part); b.setAttribute('dir', 'ltr'); node.appendChild(b); } else node.appendChild(document.createTextNode(part));
    });
  }
  function clock(d) { return (d || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function avatar(kind) {
    var a = el('span', 'av ' + kind);
    if (kind === 'me') a.appendChild($('vhuman').querySelector('.ic').cloneNode(true));
    return a;
  }
  function addEntry(kind, text, at) {
    var empty = log.querySelector('.empty');
    if (empty) empty.remove();
    var li = el('li', kind);
    li.appendChild(avatar(kind));
    var bub = el('div', 'bub');
    var who = el('div', 'bwho');
    who.appendChild(el('b', null, kind === 'me' ? t('you') : boot.persona));
    who.appendChild(el('time', null, clock(at)));
    bub.appendChild(who);
    var p = el('p');
    p.setAttribute('dir', 'auto');
    setText(p, text);
    bub.appendChild(p);
    li.appendChild(bub);
    log.appendChild(li);
    scrollLog();
    return { li: li, p: p, text: text };
  }
  function addSaved(item) {
    var li = el('li', 'ok');
    li.appendChild(ICON_OK.cloneNode(true));
    var box = el('div');
    box.appendChild(el('b', null, t('saved')));
    var line = el('span');
    line.setAttribute('dir', 'auto');
    setText(line, item.label + ': ' + item.value);
    box.appendChild(line);
    li.appendChild(box);
    log.appendChild(li);
    scrollLog();
  }
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function emptyLog() {
    if (log.children.length) return;
    var li = el('li', 'empty', t('liveCaption'));
    log.appendChild(li);
  }

  // ---- saved progress (polled from the server while a call is live)
  function setProgress(p) {
    if (!p || !p.total) return;
    lastProgress = p;
    var box = conv.querySelector('.cprog');
    box.hidden = false;
    var answered = Math.min(p.answered, p.total);
    $('cbar').style.width = Math.round((answered / p.total) * 100) + '%';
    $('cplabel').textContent = answered >= p.total ? t('allAnswered') : fill(t('questionOf'), { n: answered + 1, total: p.total });
  }
  function absorb(model) {
    if (!model) return;
    setProgress(model.progress);
    (model.summary || []).forEach(function (a) {
      var k = a.label + '\u0000' + a.value;
      if (!seen[k]) { seen[k] = true; addSaved(a); }
    });
  }
  function poll() {
    clearInterval(pollInt);
    pollInt = setInterval(function () { if (call.phase === 'live' || call.phase === 'reconnecting') getState().then(absorb).catch(function () { /* next tick */ }); }, 2500);
  }

  // ---- controls
  function setControlsEnabled(on) {
    ['vmute', 'vspk', 'vhuman'].forEach(function (id) { $(id).disabled = !on; });
  }
  $('vmute').addEventListener('click', function () {
    if (!room || call.phase !== 'live') return;
    var next = !call.muted;
    room.localParticipant.setMicrophoneEnabled(!next).then(function () {
      call.muted = next;
      $('vmute').setAttribute('aria-pressed', String(next));
      $('vmute').querySelector('.clabel').textContent = t(next ? 'unmute' : 'mute');
      render();
    }).catch(function () { /* unchanged */ });
  });
  $('vend').addEventListener('click', function () { hangUp('customer_hangup'); });
  $('vsound').addEventListener('click', function () { if (room) room.startAudio().then(function () { $('vsound').hidden = room.canPlaybackAudio; }); });

  function initOutputs() {
    var btn = $('vspk');
    if (!('setSinkId' in HTMLMediaElement.prototype) || !LK.Room.getLocalDevices) return;
    LK.Room.getLocalDevices('audiooutput', false).then(function (devices) {
      if (!devices || devices.length < 2) return; // nothing to choose: no control
      btn.hidden = false;
      var list = $('vouts');
      btn.onclick = function () {
        list.hidden = !list.hidden;
        if (list.hidden) return;
        list.textContent = '';
        var active = room.getActiveDevice('audiooutput') || 'default';
        devices.forEach(function (d) {
          var b = el('button', null, d.label || t('speaker'));
          b.type = 'button';
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', String(d.deviceId === active));
          b.addEventListener('click', function () { room.switchActiveDevice('audiooutput', d.deviceId).finally(function () { list.hidden = true; }); });
          list.appendChild(b);
        });
      };
    }).catch(function () { /* keep hidden */ });
  }

  // Transcript: a side panel on wide screens, a bottom sheet on phones.
  function txVisible() { return wide.matches ? !vapp.classList.contains('notx') : conv.classList.contains('open'); }
  function setTx(on) {
    if (wide.matches) vapp.classList.toggle('notx', !on); else conv.classList.toggle('open', on);
    ['vtx', 'vtx2'].forEach(function (id) { $(id).setAttribute('aria-pressed', String(on)); });
    if (on) { emptyLog(); scrollLog(); }
  }
  ['vtx', 'vtx2'].forEach(function (id) { $(id).addEventListener('click', function () { setTx(!txVisible()); }); });
  $('vtxclose').addEventListener('click', function () { setTx(false); });
  if (wide.addEventListener) wide.addEventListener('change', function () { setTx(wide.matches); });

  // Talk to a person: recorded on the conversation, then the call ends.
  var dialog = $('vdialog');
  $('vhuman').addEventListener('click', function () {
    $('dtext').textContent = t('humanConfirm');
    dialog.hidden = false;
    $('dyes').focus();
  });
  $('dno').addEventListener('click', function () { dialog.hidden = true; $('vhuman').focus(); });
  dialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') { dialog.hidden = true; $('vhuman').focus(); } });
  $('dyes').addEventListener('click', function () {
    dialog.hidden = true;
    call.hangingUp = true;
    U.post('/voice/human', {}).then(finished).catch(function () { finished(null); });
    disconnect();
  });

  // ---- ending
  function hangUp(reason) {
    if (call.hangingUp) return;
    call.hangingUp = true;
    setPhase('ended');
    U.post('/voice/end', { reason: reason }).then(finished).catch(function () { finished(null); });
    disconnect();
  }
  function remoteEnded() {
    if (call.hangingUp) return;
    // Closed before the assistant ever joined: it could not be started (no false "call ended").
    if (!call.agent) { fail('unavailable', 'agent_unavailable'); return; }
    call.hangingUp = true;
    setPhase('ended');
    disconnect();
    // The worker reported the end before leaving; read the settled conversation.
    setTimeout(function () { finished(null); }, 700);
  }
  function onDisconnected(reason) {
    if (call.hangingUp) return;
    var DR = (LK && LK.DisconnectReason) || {};
    if (reason === DR.ROOM_DELETED || reason === DR.PARTICIPANT_REMOVED) { remoteEnded(); return; }
    fail('dropped', 'call_dropped');
  }
  function fail(kind, reason) {
    if (call.hangingUp) return;
    call.hangingUp = true;
    U.post('/voice/end', { reason: reason }).catch(function () { /* the server lease expires anyway */ });
    disconnect();
    showProblem(kind);
  }
  function disconnect() {
    var r = room;
    cleanup();
    if (r) r.disconnect().catch(function () { /* gone */ });
  }
  function cleanup() {
    clearTimeout(agentWait);
    clearInterval(timerInt);
    clearInterval(pollInt);
    cancelAnimationFrame(raf);
    raf = 0;
    micAn = null;
    agentAn = null;
    room = null;
    lvl = 0;
    orb.style.setProperty('--lvl', '0');
    if (ctx2d) ctx2d.clearRect(0, 0, wave.width, wave.height);
    caption.hidden = true;
    $('vsound').hidden = true;
    $('vouts').hidden = true;
    dialog.hidden = true;
  }

  // ---- result and problem screens
  function resultScreen(opts) {
    show('vresult');
    var icon = $('ricon');
    icon.className = 'ricon' + (opts.warn ? ' warn' : '');
    icon.textContent = '';
    icon.appendChild(opts.icon.cloneNode(true));
    $('rtitle').textContent = opts.title;
    $('rtext').textContent = opts.text;
    var steps = $('rsteps');
    steps.textContent = '';
    steps.hidden = !opts.steps;
    (opts.steps || []).forEach(function (s) { steps.appendChild(el('li', null, s)); });
    var sum = $('rsum');
    sum.textContent = '';
    sum.hidden = !(opts.summary && opts.summary.length);
    if (!sum.hidden) {
      sum.appendChild(el('div', 'sh', t('summary')));
      opts.summary.forEach(function (a) {
        var dt = el('dt'); dt.setAttribute('dir', 'auto'); setText(dt, a.label);
        var dd = el('dd'); dd.setAttribute('dir', 'auto'); setText(dd, a.value);
        sum.appendChild(dt); sum.appendChild(dd);
      });
    }
    var primary = $('rprimary'), secondary = $('rsecondary');
    primary.hidden = !opts.primary;
    if (opts.primary) { primary.textContent = opts.primary.label; primary.onclick = opts.primary.run; }
    secondary.hidden = !opts.secondary;
    if (opts.secondary) secondary.textContent = opts.secondary;
    if (opts.primary) setTimeout(function () { primary.focus(); }, 0);
  }
  var ICON_OK = $('ricon').querySelector('.ic').cloneNode(true);
  var ICON_MIC = $('vmute').querySelector('.ic').cloneNode(true);
  var ICON_INFO = $('vhuman').querySelector('.ic').cloneNode(true);

  function finished(model) {
    if (!model) {
      getState().then(finished).catch(function (err) {
        if (err && err.code === 'LINK_OPTED_OUT') return closedScreen('opted_out');
        closedScreen('closed');
      });
      return;
    }
    cleanup();
    call.phase = 'ended';
    render();
    timerEl.hidden = !call.startedAt;
    absorb(model);
    var open = ['issued', 'opened', 'active'].indexOf(model.status) !== -1;
    if (open) {
      resultScreen({
        warn: true, icon: ICON_OK, title: t('sEnded'), text: t('endPartial'), summary: model.summary,
        primary: { label: t('again'), run: start }, secondary: t('typeInstead'),
      });
      return;
    }
    var text = model.outcome === 'human_requested' ? fill(t('endHuman'), { company: boot.company })
      : model.outcome === 'callback_requested' ? t('endPartial')
        : fill(t('endDone'), { company: boot.company });
    resultScreen({ icon: ICON_OK, title: t('sEnded'), text: text + ' ' + t('closePage'), summary: model.summary });
  }
  function closedScreen(kind) {
    cleanup();
    call.phase = 'ended';
    render();
    resultScreen({ icon: kind === 'opted_out' ? ICON_INFO : ICON_OK, warn: kind === 'opted_out', title: t('sEnded'), text: kind === 'opted_out' ? t('endOptOut') : t('closed') });
  }
  function showProblem(kind) {
    call.phase = 'error';
    render();
    var c = {
      mic: { icon: ICON_MIC, title: t('micTitle'), text: t('micText'), steps: [t('micStep1'), t('micStep2'), t('micStep3')] },
      nomic: { icon: ICON_MIC, title: t('noMic'), text: t('noMicText') },
      unsupported: { icon: ICON_INFO, title: t('unsupported'), text: t('unsupportedText'), noRetry: true },
      insecure: { icon: ICON_MIC, title: t('insecure'), text: t('insecureText'), noRetry: true },
      budget: { icon: ICON_INFO, title: t('budget'), text: t('budgetText'), noRetry: true },
      unavailable: { icon: ICON_INFO, title: t('unavailable'), text: t('unavailableText') },
      dropped: { icon: ICON_INFO, title: t('dropped'), text: t('droppedText'), retry: t('reconnect') },
    }[kind];
    resultScreen({
      warn: true, icon: c.icon, title: c.title, text: c.text, steps: c.steps,
      primary: c.noRetry ? null : { label: c.retry || t('tryAgain2'), run: start }, secondary: t('typeInstead'),
    });
  }

  // ---- switching to typing, opting out, language
  Array.prototype.forEach.call(document.querySelectorAll('#vapp [data-chat]'), function (b) {
    b.addEventListener('click', function () { getState().then(function (m) { U.showChat(m); }).catch(function () { U.showChat(); }); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#vapp [data-optout]'), function (b) {
    b.addEventListener('click', function () {
      if (room) { call.hangingUp = true; U.post('/voice/end', { reason: 'customer_hangup' }).catch(function () { /* opt-out still sent */ }); disconnect(); }
      U.optOut();
    });
  });
  if ($('vlang')) {
    $('vlang').addEventListener('change', function (e) {
      U.setLanguage(e.target.value);
      setTimeout(function () { render(); setProgress(lastProgress); }, 0);
    });
  }
  U.onShowVoice = function () { if (call.phase === 'idle' || call.phase === 'error' || call.phase === 'ended') render(); };

  // Closing the tab ends the call (the worker also ends it when the customer leaves the room).
  window.addEventListener('pagehide', function () {
    if (!room) return;
    try { fetch(api + '/voice/end', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ula' }, body: '{"reason":"page_closed"}' }); } catch { /* best effort */ }
    room.disconnect();
  });

  // ---- initial screen
  $('vstart').addEventListener('click', start);
  (boot.transcript || []).forEach(function (m) { if (m.role === 'customer' || m.role === 'assistant') addEntry(m.role === 'customer' ? 'me' : 'ai', m.text); });
  setProgress(boot.progress);
  setTx(wide.matches);
  if (document.body.classList.contains('ended')) finished(boot);
  else { show('vpre'); render(); }
})();
