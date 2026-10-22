/* Updata SMS link assistant — customer page. Plain JS (no framework).
 * Everything the customer or the server writes is inserted with textContent (no HTML). */
/* global window, document, localStorage, location, navigator, TextDecoder, SpeechSynthesisUtterance, crypto */
(function () {
  'use strict';
  var boot = JSON.parse(document.getElementById('boot').textContent);
  var base = location.pathname.replace(/\/+$/, '');
  var api = base + '/api';
  var pendingKey = 'ula:p:' + base.slice(-22);
  var $ = function (id) { return document.getElementById(id); };
  var list = $('messages');
  var scroller = $('scroll');
  var quick = $('quick');
  var input = $('input');
  var send = $('send');
  var banner = $('banner');
  var state = { busy: false, ended: boot.status === 'completed' || boot.view === 'completed', inputMode: boot.inputMode || 'text', progress: boot.progress };

  var COPY = boot.copy || {};
  var lang = boot.language || 'en';
  var vars = { company: boot.company || '', persona: boot.persona || '' };
  var t = function (k) {
    var s = (COPY[lang] || COPY.en || {})[k] || (COPY.en || {})[k] || '';
    return s.replace(/\{(\w+)\}/g, function (m, key) { return key in vars ? vars[key] : m; });
  };

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toBottom() { scroller.scrollTop = scroller.scrollHeight; }

  // Phone numbers, links and e-mail addresses stay left-to-right inside Urdu text.
  var LTR_RUN = /(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+?\d[\d ()-]{5,}\d)/g;
  function setText(node, text) {
    node.textContent = '';
    String(text || '').split(LTR_RUN).forEach(function (part, i) {
      if (!part) return;
      if (i % 2) { var b = el('bdi', null, part); b.setAttribute('dir', 'ltr'); node.appendChild(b); }
      else node.appendChild(document.createTextNode(part));
    });
  }
  function bubble(role, text) {
    var kind = role === 'customer' ? 'me' : role === 'note' ? 'note' : 'ai';
    var row = el('div', 'row ' + kind);
    if (kind !== 'note') row.appendChild(el('span', 'sr', (kind === 'me' ? t('you') : vars.persona) + ':'));
    var n = el('div', 'msg ' + kind);
    n.setAttribute('dir', 'auto');
    setText(n, text);
    row.appendChild(n);
    list.appendChild(row);
    toBottom();
    return n;
  }
  function typing() {
    var row = el('div', 'row ai');
    row.appendChild(el('span', 'sr', t('typing')));
    var n = el('div', 'msg ai');
    n.setAttribute('aria-busy', 'true');
    var dots = el('span', 'typing');
    dots.setAttribute('aria-hidden', 'true');
    dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
    n.appendChild(dots);
    row.appendChild(n);
    list.appendChild(row);
    toBottom();
    return n;
  }
  function showBanner(text, isErr, action) {
    banner.textContent = text || '';
    banner.hidden = !text;
    banner.className = 'banner' + (isErr ? ' err' : '');
    if (text && action) {
      var b = el('button', null, action.label);
      b.type = 'button';
      b.addEventListener('click', action.run);
      banner.appendChild(b);
    }
  }
  function setProgress(p) {
    if (!p || !p.total) return;
    state.progress = p;
    var done = Math.min(p.answered, p.total);
    $('prog').hidden = false;
    $('bar').style.width = Math.round((done / p.total) * 100) + '%';
    var track = $('bar').parentNode;
    track.setAttribute('aria-valuemax', String(p.total));
    track.setAttribute('aria-valuenow', String(done));
    $('plabel').textContent = done + ' ' + t('of') + ' ' + p.total;
  }
  function setQuick(items) {
    quick.textContent = '';
    (items || []).forEach(function (q) {
      var b = el('button', q.value === '__opt_out' ? 'danger' : '', q.label);
      b.type = 'button';
      b.setAttribute('dir', 'auto');
      b.addEventListener('click', function () { submit(null, q.value, q.label); });
      quick.appendChild(b);
    });
  }

  // Long answers get a growing text area; everything else a one-line field with the right keyboard.
  function fieldFor(multiline) {
    var want = multiline ? 'TEXTAREA' : 'INPUT';
    if (input.tagName === want) return;
    var next = document.createElement(want.toLowerCase());
    next.id = 'input';
    next.setAttribute('dir', 'auto');
    next.setAttribute('maxlength', '1000');
    if (multiline) next.rows = 1; else next.setAttribute('enterkeyhint', 'send');
    next.value = input.value;
    input.parentNode.replaceChild(next, input);
    input = next;
    bindField();
  }
  function grow() {
    if (input.tagName !== 'TEXTAREA') return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight + 2, 140) + 'px';
  }
  function bindField() {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && state.inputMode !== 'multiline') { e.preventDefault(); var v = input.value.trim(); if (v) submit(v); }
    });
    input.addEventListener('input', grow);
  }
  function setInputMode(mode) {
    state.inputMode = mode || 'text';
    var locked = state.ended || mode === 'none';
    fieldFor(state.inputMode === 'multiline' && !locked);
    input.disabled = locked;
    send.disabled = locked;
    if (input.tagName === 'INPUT') {
      // Native pickers for dates and times; the right keyboard for numbers, phone, email.
      input.type = { date: 'date', time: 'time', email: 'email', tel: 'tel' }[mode] || 'text';
    }
    input.setAttribute('inputmode', { numeric: 'numeric', decimal: 'decimal', tel: 'tel', email: 'email', url: 'url' }[mode] || 'text');
    input.placeholder = locked ? t('done') : t('placeholder');
    grow();
  }
  function setBusy(busy) {
    state.busy = busy;
    send.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
  function endConversation(status) {
    state.ended = true;
    setQuick([]);
    setInputMode('none');
    document.querySelector('.dock').classList.add('ended');
    var opt = $('optout');
    if (opt) opt.hidden = true;
    var opt2 = $('optout2');
    if (opt2) opt2.hidden = true;
    if (status === 'completed' && !list.querySelector('.done')) {
      var card = el('div', 'done');
      card.setAttribute('role', 'status');
      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'ic'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '9');
      var tick = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tick.setAttribute('d', 'm8 12.5 2.5 2.5L16 9.5');
      icon.appendChild(circle); icon.appendChild(tick);
      card.appendChild(icon);
      card.appendChild(el('b', null, t('doneTitle')));
      card.appendChild(el('p', null, t('doneText')));
      list.appendChild(card);
      toBottom();
    }
  }

  // ---- streaming request (NDJSON lines: token / replace / done)
  function post(path, body, onEvent) {
    return fetch(api + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ula' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!onEvent) return res.json().then(function (j) { if (!res.ok) throw Object.assign(new Error(j.code || 'ERR'), { status: res.status, code: j.code }); return j; });
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { throw Object.assign(new Error(j.code || 'ERR'), { status: res.status, code: j.code }); });
      var buffer = '';
      var flush = function (chunk, final) {
        buffer += chunk;
        var lines = buffer.split('\n');
        buffer = final ? '' : lines.pop();
        lines.forEach(function (line) { if (line.trim()) onEvent(JSON.parse(line)); });
      };
      if (res.body && res.body.getReader && window.TextDecoder) {
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var pump = function () {
          return reader.read().then(function (r) {
            if (r.done) { flush(dec.decode(), true); return; }
            flush(dec.decode(r.value, { stream: true }), false);
            return pump();
          });
        };
        return pump();
      }
      return res.text().then(function (txt) { flush(txt, true); });
    });
  }

  function remember(p) { try { localStorage.setItem(pendingKey, JSON.stringify({ text: p.text, action: p.action, label: p.label, clientMessageId: p.clientMessageId })); } catch { /* private mode */ } }
  function forget() { try { localStorage.removeItem(pendingKey); } catch { /* ignore */ } }
  function recall() { try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; } }

  // Every message waits for /open, which registers this device for the conversation.
  var ready = null;
  function opened() { if (!ready) ready = post('/open', {}).catch(function () { ready = null; }); return ready; }

  function markFailed(msg) {
    var row = msg.node.parentNode;
    row.classList.remove('pending');
    row.classList.add('failed');
    if (row.querySelector('.fail')) return;
    var note = el('div', 'fail');
    note.appendChild(el('span', null, t('failed')));
    var again = el('button', null, t('tryAgain'));
    again.type = 'button';
    again.addEventListener('click', function () {
      row.classList.remove('failed');
      row.removeChild(note);
      submit(null, null, null, msg);
    });
    note.appendChild(again);
    row.appendChild(note);
  }

  var retryDelay = 1000;
  function submit(text, action, label, existing) {
    if (state.busy || state.ended) return;
    var msg = existing || { text: text || null, action: action || null, label: label || text, clientMessageId: uid() };
    if (!msg.text && !msg.action) return;
    setBusy(true);
    remember(msg);
    setQuick([]);
    var mine = existing && existing.node ? existing.node : bubble('customer', msg.label || msg.text);
    msg.node = mine;
    mine.parentNode.classList.add('pending');
    var reply = typing();
    var started = false;
    input.value = '';
    grow();
    opened().then(function () { return post('/message', { text: msg.text, action: msg.action, clientMessageId: msg.clientMessageId }, function (ev) {
      if (ev.type === 'token') {
        if (!started) { reply.textContent = ''; reply.setAttribute('dir', 'auto'); started = true; }
        reply.textContent += ev.text;
        toBottom();
      } else if (ev.type === 'replace') {
        reply.textContent = ev.text; reply.setAttribute('dir', 'auto'); started = true;
      } else if (ev.type === 'done') {
        setText(reply, ev.reply || reply.textContent);
        reply.removeAttribute('aria-busy');
        if (reply.previousSibling) reply.previousSibling.textContent = vars.persona + ':';
        if (ev.language && ev.language !== lang) setLanguage(ev.language, false);
        setProgress(ev.progress);
        if (ev.ended) endConversation(ev.status);
        else { setQuick(ev.quickReplies); setInputMode(ev.inputMode); }
        if (ev.paused) showBanner(t('paused'));
        if (voice.speak) voice.say(ev.reply);
      }
    }); }).then(function () {
      mine.parentNode.classList.remove('pending');
      forget();
      if (!state.ended && !(banner.textContent === t('paused'))) showBanner('');
      retryDelay = 1000;
      setBusy(false);
      if (!state.ended) input.focus();
    }).catch(function (err) {
      setBusy(false);
      var replyRow = reply.parentNode;
      if (replyRow && replyRow.parentNode) replyRow.parentNode.removeChild(replyRow);
      if (err && err.status) {
        forget();
        if (err.code === 'SESSION_CLOSED' || err.status === 410) { mine.parentNode.classList.remove('pending'); bubble('note', t('closed')); endConversation(); }
        else if (err.code === 'DEVICE_NOT_VERIFIED') location.reload();
        else { markFailed(msg); showBanner(t('error'), true); }
        return;
      }
      // Network: keep the message and resend it (same id → never answered twice).
      showBanner(navigator.onLine === false ? t('offline') : t('retry'), false, { label: t('tryAgain'), run: function () { retryNow(msg); } });
      retryTimer = setTimeout(function () { submit(null, null, null, msg); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    });
  }
  var retryTimer = null;
  function retryNow(msg) {
    clearTimeout(retryTimer);
    retryDelay = 1000;
    submit(null, null, null, msg);
  }

  // Interface wording follows the conversation language.
  function applyCopy() {
    document.documentElement.lang = lang === 'roman_ur' ? 'ur-Latn' : lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (n) { n.textContent = t(n.getAttribute('data-k')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-k-label]'), function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-k-label'))); });
    send.setAttribute('aria-label', t('send'));
    var mic = $('mic');
    if (mic) mic.setAttribute('aria-label', t('mic'));
    $('pword').textContent = t('answered');
    if (state.progress) setProgress(state.progress);
  }
  function setLanguage(code, persist) {
    lang = code;
    if ($('lang')) $('lang').value = code;
    applyCopy();
    setInputMode(state.inputMode);
    if (persist) {
      post('/language', { language: code }).then(function (model) {
        if (!model.transcript || !model.transcript.length) {
          list.textContent = '';
          bubble('assistant', model.greeting);
          setQuick(model.quickReplies);
        }
      }).catch(function () { /* keep current language */ });
    }
  }

  // ---- options menu (text size, read aloud, policies, opt-out)
  var more = $('more');
  var menu = $('menu');
  function toggleMenu(open) {
    menu.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    if (open) { var first = menu.querySelector('button:not([hidden]),a'); if (first) first.focus(); }
  }
  more.addEventListener('click', function () { toggleMenu(menu.hidden); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { toggleMenu(false); more.focus(); } });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target) && !more.contains(e.target)) toggleMenu(false); });

  // ---- browser voice tier (near-free): speech recognition + speech synthesis
  var voice = {
    speak: false,
    supported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    say: function (text) {
      if (!window.speechSynthesis || !text) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'en' ? 'en-US' : 'ur-PK';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  };
  function initVoice() {
    if (boot.voiceTier === 'off' || !voice.supported) return;
    var mic = $('mic');
    var speakBtn = $('speak');
    mic.hidden = false;
    if (window.speechSynthesis) speakBtn.hidden = false;
    speakBtn.addEventListener('click', function () {
      voice.speak = !voice.speak;
      speakBtn.setAttribute('aria-pressed', String(voice.speak));
    });
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = null;
    var stop = function () { if (rec) rec.stop(); };
    var start = function () {
      if (state.ended || state.busy || rec) return;
      if (window.speechSynthesis) window.speechSynthesis.cancel(); // barge-in on our own voice
      rec = new Rec();
      rec.lang = lang === 'en' ? 'en-US' : 'ur-PK';
      rec.interimResults = true;
      rec.onresult = function (ev) {
        var txt = '';
        for (var i = 0; i < ev.results.length; i += 1) txt += ev.results[i][0].transcript;
        input.value = txt;
      };
      var off = function () { mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); input.placeholder = t('placeholder'); rec = null; };
      rec.onend = function () { var v = input.value.trim(); off(); if (v) submit(v); };
      rec.onerror = function (ev) {
        off();
        if (ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')) showBanner(t('micDenied'), true);
      };
      mic.classList.add('on');
      mic.setAttribute('aria-pressed', 'true');
      input.placeholder = t('listen');
      rec.start();
    };
    // Hold to talk with a finger or mouse; Space/Enter toggles for keyboard users.
    mic.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });
    mic.addEventListener('pointerup', stop);
    mic.addEventListener('pointerleave', stop);
    mic.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (rec) stop(); else start();
    });
  }

  // ---- verification for a second device
  function showVerify() {
    $('chat').hidden = true;
    var card = $('verify');
    card.hidden = false;
    $('vtitle').textContent = t('verifyTitle');
    $('vtext').textContent = t('verifyText');
    $('vbtn').textContent = t('verifyBtn');
    var code = $('vcode');
    code.focus();
    $('vform').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!/^\d{4}$/.test(code.value)) { $('verr').textContent = t('verifyFail'); return; }
      $('vbtn').disabled = true;
      post('/verify', { last4: code.value }).then(function () { location.reload(); }).catch(function (err) {
        $('vbtn').disabled = false;
        $('verr').textContent = err && err.code === 'VERIFY_LOCKED' ? t('locked') : t('verifyFail');
        code.select();
      });
    });
  }

  // ---- start
  bindField();
  setLanguage(lang, false);
  if ($('lang')) $('lang').addEventListener('change', function (e) { setLanguage(e.target.value, true); });
  var bigger = $('bigger');
  bigger.addEventListener('click', function () {
    var on = document.body.classList.toggle('big');
    bigger.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('ula:big', on ? '1' : ''); } catch { /* ignore */ }
  });
  try { if (localStorage.getItem('ula:big')) { document.body.classList.add('big'); bigger.setAttribute('aria-pressed', 'true'); } } catch { /* ignore */ }
  $('form').addEventListener('submit', function (e) { e.preventDefault(); var v = input.value.trim(); if (v) submit(v); });
  var optOut = function () { toggleMenu(false); submit(null, '__opt_out', t('optOut')); };
  if ($('optout')) $('optout').addEventListener('click', optOut);
  if ($('optout2')) $('optout2').addEventListener('click', optOut);

  if (boot.view === 'verify') {
    opened();
    showVerify();
    return;
  }
  list.textContent = '';
  if (boot.greeting) bubble('assistant', boot.greeting);
  (boot.transcript || []).forEach(function (m) { bubble(m.role, m.text); });
  setProgress(boot.progress);
  if (state.ended) { endConversation(boot.status); if (boot.status !== 'completed') bubble('note', t('done')); }
  else { setQuick(boot.quickReplies); setInputMode(boot.inputMode); }
  if (boot.paused) showBanner(t('paused'));
  initVoice();
  opened();
  var pending = recall();
  if (pending && !state.ended) submit(null, null, null, pending);
  window.addEventListener('online', function () { if (!state.busy) showBanner(''); });
})();
