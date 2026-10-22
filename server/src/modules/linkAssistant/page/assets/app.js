/* Updata SMS link assistant — customer page. Plain JS (no framework, ~10 KB).
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
  var quick = $('quick');
  var input = $('input');
  var send = $('send');
  var banner = $('banner');
  var state = { busy: false, ended: boot.status === 'completed' || boot.view === 'completed', inputMode: boot.inputMode || 'text' };

  var T = {
    en: { placeholder: 'Type your answer…', send: 'Send', offline: 'No connection. Your message will be sent when you are back online.', retry: 'Reconnecting…', done: 'This conversation is complete. Thank you!', verifyTitle: 'Welcome back', verifyText: 'To protect your answers, please enter the last 4 digits of the phone number this link was sent to.', verifyBtn: 'Continue', verifyFail: 'That did not match. Please try again.', locked: 'Too many attempts. Please try again in an hour.', paused: 'The assistant is paused right now. Please try again later.', closed: 'This conversation has ended.', listen: 'Listening…', speak: 'Read replies aloud', bigger: 'Larger text', of: 'of', error: 'Something went wrong. Please try again.' },
    roman_ur: { placeholder: 'Apna jawab likhein…', send: 'Bhejein', offline: 'Internet nahi hai. Connection wapas aate hi aap ka message bhej diya jayega.', retry: 'Dobara jor rahe hain…', done: 'Yeh guftagu mukammal ho gayi. Shukriya!', verifyTitle: 'Khush aamdeed', verifyText: 'Aap ke jawab mehfooz rakhne ke liye, jis number par yeh link bheja gaya us ke aakhri 4 hindse likhein.', verifyBtn: 'Jaari rakhein', verifyFail: 'Yeh match nahi hua. Dobara koshish karein.', locked: 'Bohat zyada koshishein. Ek ghante baad koshish karein.', paused: 'Assistant abhi band hai. Thori dair baad koshish karein.', closed: 'Yeh guftagu khatam ho chuki hai.', listen: 'Sun rahi hoon…', speak: 'Jawab parh kar sunayein', bigger: 'Bara text', of: '/', error: 'Masla aa gaya. Dobara koshish karein.' },
    ur: { placeholder: 'اپنا جواب لکھیں…', send: 'بھیجیں', offline: 'انٹرنیٹ نہیں ہے۔ کنکشن واپس آتے ہی آپ کا پیغام بھیج دیا جائے گا۔', retry: 'دوبارہ جوڑ رہے ہیں…', done: 'یہ گفتگو مکمل ہو گئی۔ شکریہ!', verifyTitle: 'خوش آمدید', verifyText: 'آپ کے جوابات محفوظ رکھنے کے لیے، جس نمبر پر یہ لنک بھیجا گیا اس کے آخری 4 ہندسے لکھیں۔', verifyBtn: 'جاری رکھیں', verifyFail: 'یہ میچ نہیں ہوا۔ دوبارہ کوشش کریں۔', locked: 'بہت زیادہ کوششیں۔ ایک گھنٹے بعد کوشش کریں۔', paused: 'اسسٹنٹ ابھی بند ہے۔ تھوڑی دیر بعد کوشش کریں۔', closed: 'یہ گفتگو ختم ہو چکی ہے۔', listen: 'سن رہی ہوں…', speak: 'جوابات سنائیں', bigger: 'بڑا متن', of: '/', error: 'مسئلہ آ گیا۔ دوبارہ کوشش کریں۔' }
  };
  var lang = boot.language || 'en';
  var t = function (k) { return (T[lang] || T.en)[k] || T.en[k]; };

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
  function bubble(role, text) {
    var n = el('div', 'msg ' + (role === 'customer' ? 'me' : role === 'note' ? 'note' : 'ai'), text);
    n.setAttribute('dir', 'auto');
    list.appendChild(n);
    n.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return n;
  }
  function typing() {
    var n = el('div', 'msg ai');
    n.setAttribute('aria-label', '…');
    var dots = el('span', 'typing');
    dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
    n.appendChild(dots);
    list.appendChild(n);
    n.scrollIntoView({ block: 'end' });
    return n;
  }
  function showBanner(text, isErr) {
    banner.textContent = text || '';
    banner.hidden = !text;
    banner.className = 'banner' + (isErr ? ' err' : '');
  }
  function setProgress(p) {
    if (!p || !p.total) return;
    var done = Math.min(p.answered, p.total);
    $('bar').style.width = Math.round((done / p.total) * 100) + '%';
    $('plabel').textContent = done + ' ' + t('of') + ' ' + p.total;
  }
  function setQuick(items) {
    quick.textContent = '';
    (items || []).forEach(function (q) {
      var b = el('button', q.value === '__opt_out' ? 'danger' : '', q.label);
      b.type = 'button';
      b.addEventListener('click', function () { submit(null, q.value, q.label); });
      quick.appendChild(b);
    });
  }
  function setInputMode(mode) {
    state.inputMode = mode || 'text';
    var locked = state.ended || mode === 'none';
    input.disabled = locked;
    send.disabled = locked;
    input.setAttribute('inputmode', { numeric: 'numeric', decimal: 'decimal', tel: 'tel', email: 'email', url: 'url' }[mode] || 'text');
    // Native pickers for dates and times; the right keyboard for numbers, phone, email.
    input.type = { date: 'date', time: 'time', email: 'email', tel: 'tel' }[mode] || 'text';
    input.placeholder = locked ? t('done') : t('placeholder');
  }
  function endConversation() {
    state.ended = true;
    setQuick([]);
    setInputMode('none');
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

  function remember(p) { try { localStorage.setItem(pendingKey, JSON.stringify(p)); } catch { /* private mode */ } }
  function forget() { try { localStorage.removeItem(pendingKey); } catch { /* ignore */ } }
  function recall() { try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; } }

  // Every message waits for /open, which registers this device for the conversation.
  var ready = null;
  function opened() { if (!ready) ready = post('/open', {}).catch(function () { ready = null; }); return ready; }

  var retryDelay = 1000;
  function submit(text, action, label, existing) {
    if (state.busy || state.ended) return;
    var msg = existing || { text: text || null, action: action || null, label: label || text, clientMessageId: uid() };
    if (!msg.text && !msg.action) return;
    state.busy = true;
    remember(msg);
    setQuick([]);
    var mine = existing && existing.node ? existing.node : bubble('customer', msg.label || msg.text);
    mine.classList.add('pending');
    var reply = typing();
    var started = false;
    input.value = '';
    opened().then(function () { return post('/message', { text: msg.text, action: msg.action, clientMessageId: msg.clientMessageId }, function (ev) {
      if (ev.type === 'token') {
        if (!started) { reply.textContent = ''; reply.setAttribute('dir', 'auto'); started = true; }
        reply.textContent += ev.text;
        reply.scrollIntoView({ block: 'end' });
      } else if (ev.type === 'replace') {
        reply.textContent = ev.text; reply.setAttribute('dir', 'auto'); started = true;
      } else if (ev.type === 'done') {
        reply.textContent = ev.reply || reply.textContent;
        if (ev.language && ev.language !== lang) setLanguage(ev.language, false);
        setProgress(ev.progress);
        if (ev.ended) endConversation();
        else { setQuick(ev.quickReplies); setInputMode(ev.inputMode); }
        if (voice.speak) voice.say(ev.reply);
      }
    }); }).then(function () {
      mine.classList.remove('pending');
      forget();
      showBanner('');
      retryDelay = 1000;
      state.busy = false;
      if (!state.ended) input.focus();
    }).catch(function (err) {
      state.busy = false;
      if (reply.parentNode) reply.parentNode.removeChild(reply);
      if (err && err.status) {
        mine.classList.remove('pending');
        forget();
        if (err.code === 'SESSION_CLOSED' || err.status === 410) { bubble('note', t('closed')); endConversation(); }
        else if (err.code === 'DEVICE_NOT_VERIFIED') location.reload();
        else showBanner(t('error'), true);
        return;
      }
      // Network: keep the message and resend it (same id → never answered twice).
      showBanner(navigator.onLine === false ? t('offline') : t('retry'));
      msg.node = mine;
      setTimeout(function () { submit(null, null, null, msg); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15000);
    });
  }

  function setLanguage(code, persist) {
    lang = code;
    document.documentElement.lang = code === 'roman_ur' ? 'ur-Latn' : code;
    $('lang').value = code;
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

  // ---- browser voice tier (near-free): speech recognition + speech synthesis
  var voice = {
    speak: false,
    supported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    say: function (text) {
      if (!window.speechSynthesis || !text) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'ur' ? 'ur-PK' : (lang === 'roman_ur' ? 'ur-PK' : 'en-US');
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
    var stop = function () { if (rec) { rec.stop(); } };
    var start = function (e) {
      e.preventDefault();
      if (state.ended || state.busy) return;
      if (window.speechSynthesis) window.speechSynthesis.cancel(); // barge-in on our own voice
      rec = new Rec();
      rec.lang = lang === 'en' ? 'en-US' : 'ur-PK';
      rec.interimResults = true;
      rec.onresult = function (ev) {
        var txt = '';
        for (var i = 0; i < ev.results.length; i += 1) txt += ev.results[i][0].transcript;
        input.value = txt;
      };
      rec.onend = function () { mic.classList.remove('on'); if (input.value.trim()) submit(input.value.trim()); rec = null; };
      rec.onerror = function () { mic.classList.remove('on'); rec = null; };
      mic.classList.add('on');
      input.placeholder = t('listen');
      rec.start();
    };
    mic.addEventListener('pointerdown', start);
    mic.addEventListener('pointerup', stop);
    mic.addEventListener('pointerleave', stop);
  }

  // ---- verification for a second device
  function showVerify() {
    $('chat').hidden = true;
    var card = $('verify');
    card.hidden = false;
    $('vtitle').textContent = t('verifyTitle');
    $('vtext').textContent = t('verifyText');
    $('vbtn').textContent = t('verifyBtn');
    $('vform').addEventListener('submit', function (e) {
      e.preventDefault();
      post('/verify', { last4: $('vcode').value }).then(function () { location.reload(); }).catch(function (err) {
        $('verr').textContent = err && err.code === 'VERIFY_LOCKED' ? t('locked') : t('verifyFail');
      });
    });
  }

  // ---- start
  setLanguage(lang, false);
  $('lang').addEventListener('change', function (e) { setLanguage(e.target.value, true); });
  $('bigger').addEventListener('click', function () {
    document.body.classList.toggle('big');
    try { localStorage.setItem('ula:big', document.body.classList.contains('big') ? '1' : ''); } catch { /* ignore */ }
  });
  try { if (localStorage.getItem('ula:big')) document.body.classList.add('big'); } catch { /* ignore */ }
  $('form').addEventListener('submit', function (e) { e.preventDefault(); var v = input.value.trim(); if (v) submit(v); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && state.inputMode !== 'multiline') { e.preventDefault(); var v = input.value.trim(); if (v) submit(v); } });
  var optOut = $('optout');
  if (optOut) optOut.addEventListener('click', function () { submit(null, '__opt_out', optOut.textContent); });

  if (boot.view === 'verify') {
    opened();
    showVerify();
    return;
  }
  list.textContent = '';
  if (boot.greeting) bubble('assistant', boot.greeting);
  (boot.transcript || []).forEach(function (m) { bubble(m.role, m.text); });
  setProgress(boot.progress);
  if (state.ended) { bubble('note', t('done')); endConversation(); }
  else { setQuick(boot.quickReplies); setInputMode(boot.inputMode); }
  if (boot.paused) showBanner(t('paused'));
  initVoice();
  opened();
  var pending = recall();
  if (pending && !state.ended) submit(null, null, null, pending);
  window.addEventListener('online', function () { showBanner(''); });
})();
