/**
 * Server-rendered customer page. The first screen (header, notice, greeting) is in
 * the HTML in the session's language, so it paints before any JavaScript runs; the
 * script only adds behaviour. Assets are fingerprinted for long-lived caching.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

import { pageCopy, pageCopyFor } from './copy.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

function load(name, type, file = path.join(here, 'assets', name)) {
  const body = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 10);
  return { name, type, body, gzip: zlib.gzipSync(body, { level: 9 }), hash, path: `/c/assets/${name.replace('.', `.${hash}.`)}` };
}

const JS = 'application/javascript; charset=utf-8';
export const ASSETS = {
  js: load('app.js', JS),
  css: load('app.css', 'text/css; charset=utf-8'),
  voice: load('voice.js', JS),
  // The LiveKit browser SDK (same version as the CRM web app), served first-party and
  // only fetched once the page is idle on voice pages.
  livekit: load('livekit-client.js', JS, require.resolve('livekit-client') /* the package's UMD ("require") build */),
};
export const assetByPath = new Map(Object.values(ASSETS).map((a) => [a.path, a]));

/** LiveKit signalling hosts a voice page may connect to (LiveKit Cloud uses regional subdomains). */
function livekitHosts() {
  const url = String(process.env.LIVEKIT_URL || '').trim();
  const host = url.replace(/^\w+:\/\//, '').replace(/[/?#].*$/, '');
  if (!/^[\w.-]+(:\d+)?$/.test(host)) return [];
  const secure = !/^(ws|http):/.test(url);
  const hosts = [`${secure ? 'wss' : 'ws'}://${host}`, `${secure ? 'https' : 'http'}://${host}`];
  if (/\.livekit\.cloud$/.test(host)) hosts.push('wss://*.livekit.cloud', 'https://*.livekit.cloud');
  return hosts;
}

export function cspFor({ voice = false } = {}) {
  return [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
    ['connect-src', "'self'", ...(voice ? livekitHosts() : [])].join(' '), "font-src 'self'", "media-src 'self' blob:", "base-uri 'none'", "form-action 'self'",
    "frame-ancestors 'none'", "manifest-src 'self'",
  ].join('; ');
}
export const CSP = cspFor();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script type="application/json">: neutralise "</script" and HTML comments.
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

const LANG_LABEL = { en: 'English', ur: 'اردو', roman_ur: 'Roman Urdu' };
const LANG_SHORT = { en: 'EN', ur: 'اردو', roman_ur: 'Roman' };
const DIR = (lang) => (lang === 'ur' ? 'rtl' : 'ltr');

// 24px stroke icons (Lucide geometry), inline so they need no request and follow currentColor.
const svg = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"${extra}>${d}</svg>`;
export const ICONS = {
  send: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', ' data-flip'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/>'),
  more: svg('<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>'),
  spark: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  text: svg('<path d="M4 7V5h10v2"/><path d="M9 5v14"/><path d="M7 19h4"/><path d="M14 12v-1h6v1"/><path d="M17 11v8"/><path d="M15.5 19h3"/>'),
  sound: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  stop: svg('<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  hangup: svg('<path d="M3.5 14.5a13 13 0 0 1 17 0l-1.6 2.6a1.5 1.5 0 0 1-1.9.5l-2.3-1.1a1.5 1.5 0 0 1-.8-1.5l.2-1.8a12 12 0 0 0-4.2 0l.2 1.8a1.5 1.5 0 0 1-.8 1.5L7 17.6a1.5 1.5 0 0 1-1.9-.5z"/>'),
  micOff: svg('<path d="m3 3 18 18"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1"/><path d="M15 9.3V5a3 3 0 0 0-5.7-1.3"/><path d="M19 10v1a7 7 0 0 1-.9 3.4"/><path d="M5 10v1a7 7 0 0 0 11.2 5.6"/><path d="M12 18v4"/>'),
  doc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h3"/>'),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  check: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>'),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>'),
  wave: svg('<path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 7v10"/><path d="M20 10v4"/>'),
  bolt: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
};

function head({ title, company, lang }) {
  return `<!doctype html><html lang="${lang === 'roman_ur' ? 'ur-Latn' : esc(lang)}" dir="${DIR(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0f1524" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(company)}"><meta property="og:description" content="A short message from ${esc(company)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="${ASSETS.css.path}">
</head>`;
}

const initial = (name) => esc(String(name || 'U').trim().charAt(0).toUpperCase() || 'U');

function progressHtml(progress, c) {
  const total = progress?.total || 0;
  const done = total ? Math.min(progress.answered, total) : 0;
  return `<div class="prog" id="prog"${total ? '' : ' hidden'}>
  <div class="track" role="progressbar" aria-labelledby="ptext" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i id="bar"></i></div>
  <span class="ptext" id="ptext"><span id="plabel" aria-live="polite">${total ? `${done} ${esc(c.of)} ${total}` : ''}</span> <span id="pword">${esc(c.answered)}</span></span>
</div>`;
}

function links(model, c) {
  const items = [];
  if (model.privacyUrl) items.push(`<a href="${esc(model.privacyUrl)}" rel="noopener noreferrer" target="_blank" data-k="privacy">${esc(c.privacy)}</a>`);
  if (model.termsUrl) items.push(`<a href="${esc(model.termsUrl)}" rel="noopener noreferrer" target="_blank" data-k="terms">${esc(c.terms)}</a>`);
  return items.join('<span aria-hidden="true"> · </span>');
}

const ctl = (id, icon, key, c, extra = '') => `<button id="${id}" class="ctl" type="button"${extra}><span class="cbtn">${icon}</span><span class="clabel" data-k="${key}">${esc(c[key])}</span></button>`;

/**
 * The voice-first call screen (shown when the campaign offers a real-time voice
 * call). Every state shown here is driven by the live LiveKit session in voice.js:
 * nothing claims a connection, audio or an answer that did not happen.
 */
function renderVoice(model, c, vars, linkRow) {
  const total = model.progress?.total || 0;
  const minutes = model.estimatedMinutes || 3;
  const intro = fill(c.vIntro, { ...vars, minutes });
  const feature = (icon, title, text) => `<li><span class="fic">${icon}</span><span><b data-k="${title}">${esc(fill(c[title], vars))}</b><small data-k="${text}">${esc(fill(c[text], vars))}</small></span></li>`;
  return `<div class="vapp" id="vapp">
<aside class="vinfo" aria-label="${esc(model.company)}">
  <div class="brand"><span class="logo" aria-hidden="true">${initial(model.company)}</span><b>${esc(model.company)}</b>${model.isPreview ? `<em class="pv" data-k="preview">${esc(c.preview)}</em>` : ''}</div>
  <p class="kicker"><span data-k="vKicker">${esc(c.vKicker)}</span><span class="chip">${ICONS.bolt}Voice AI</span></p>
  <h1 class="vtitle" data-k="vTitle">${esc(c.vTitle)}</h1>
  <p class="vintro" data-k="vIntro" data-min="${esc(minutes)}">${esc(intro)}</p>
  <ul class="feats">
    ${feature(ICONS.wave, 'fTalk', 'fTalkText')}
    ${feature(ICONS.shield, 'fPrivate', 'fPrivateText')}
    ${feature(ICONS.globe, 'fNoApp', 'fNoAppText')}
  </ul>
  <div class="vlegal">
    <p class="notice">${ICONS.shield}<span data-k="notice">${esc(fill(c.notice, vars))}</span></p>
    <p class="vlinks">${linkRow ? `${linkRow}<span aria-hidden="true"> · </span>` : ''}<button class="optout" type="button" data-optout data-k="optOut">${esc(c.optOut)}</button></p>
  </div>
</aside>

<section class="stage" id="stage" data-state="idle" aria-labelledby="vname">
  <div class="stop">
    <div class="sleft">
      <span class="brandm"><span class="logo" aria-hidden="true">${initial(model.company)}</span><b>${esc(model.company)}</b></span>
      <span class="pill" id="vpill"><i aria-hidden="true"></i><span data-k="pReady">${esc(c.pReady)}</span></span>
      <time class="timer" id="vtimer" hidden>00:00</time>
    </div>
    <div class="sright">
      ${(model.languages || []).length > 1 ? `<label class="vlang">${ICONS.globe}<span class="sr" data-k="language">${esc(c.language)}</span><select id="vlang">${(model.languages || []).map((l) => `<option value="${esc(l)}"${l === model.language ? ' selected' : ''}>${esc(LANG_SHORT[l] || l)}</option>`).join('')}</select></label>` : ''}
      <button id="vtx" class="ghost" type="button" aria-pressed="false" aria-controls="vconv">${ICONS.doc}<span data-k="transcript">${esc(c.transcript)}</span></button>
    </div>
  </div>

  <div class="scenter">
    <div class="orb" id="orb" aria-hidden="true"><span class="glow"></span><span class="ring"></span><span class="core"><i></i><i></i></span></div>
    <h2 class="sname" id="vname">${esc(model.persona)} <span class="aitag">AI</span></h2>
    <p class="sstate" id="vstate" role="status" aria-live="polite" data-k="sReady">${esc(c.sReady)}</p>
    <canvas class="wave" id="wave" width="320" height="56" aria-hidden="true"></canvas>
    <p class="caption" id="caption" dir="auto" hidden></p>
  </div>

  <div class="sbottom">
    <div class="panel pre" id="vpre">
      <p class="pintro" data-k="vIntro" data-min="${esc(minutes)}">${esc(intro)}</p>
      <button id="vstart" class="startbtn" type="button">${ICONS.phone}<span data-k="start">${esc(c.start)}</span></button>
      <p class="alt"><span data-k="preferType">${esc(c.preferType)}</span> <button type="button" class="linkbtn" data-chat data-k="typeInstead">${esc(c.typeInstead)}</button></p>
      <p class="trust">${ICONS.shield}<span data-k="fPrivate">${esc(c.fPrivate)}</span><span aria-hidden="true">·</span><span data-k="fNoApp">${esc(c.fNoApp)}</span></p>
      <div class="mlegal">
        <p data-k="notice">${esc(fill(c.notice, vars))}</p>
        <p>${model.isPreview ? `<em class="pv" data-k="preview">${esc(c.preview)}</em> ` : ''}${linkRow ? `${linkRow}<span aria-hidden="true"> · </span>` : ''}<button class="optout" type="button" data-optout data-k="optOut">${esc(c.optOut)}</button></p>
      </div>
    </div>

    <div class="panel ctls" id="vctl" hidden>
      <button id="vsound" class="soundbtn" type="button" hidden>${ICONS.sound}<span data-k="soundOn">${esc(c.soundOn)}</span></button>
      <div class="ctlrow">
        ${ctl('vmute', `${ICONS.mic}${ICONS.micOff}`, 'mute', c, ' aria-pressed="false"')}
        ${ctl('vspk', ICONS.sound, 'speaker', c, ' hidden aria-haspopup="listbox"')}
        ${ctl('vtx2', ICONS.doc, 'transcript', c, ' aria-pressed="false" aria-controls="vconv"')}
        ${ctl('vhuman', ICONS.person, 'human', c)}
        ${ctl('vend', ICONS.hangup, 'end', c, ' data-danger')}
      </div>
      <div id="vouts" class="outs" role="listbox" hidden></div>
    </div>

    <div class="panel result" id="vresult" hidden>
      <div class="ricon" id="ricon">${ICONS.check}</div>
      <h3 id="rtitle"></h3>
      <p id="rtext"></p>
      <ol class="steps" id="rsteps" hidden></ol>
      <dl class="sumcard" id="rsum" hidden></dl>
      <div class="ractions">
        <button id="rprimary" class="startbtn" type="button" hidden></button>
        <button id="rsecondary" class="outline" type="button" data-chat hidden></button>
      </div>
    </div>
  </div>

  <p class="conn" id="vconn" hidden><i aria-hidden="true"></i><span data-k="secureConn">${esc(c.secureConn)}</span></p>
  <div class="dialog" id="vdialog" role="alertdialog" aria-modal="true" aria-labelledby="dtext" hidden>
    <div class="dcard"><p id="dtext"></p><div class="dactions"><button id="dno" type="button" class="outline" data-k="cancel">${esc(c.cancel)}</button><button id="dyes" type="button" class="startbtn" data-k="yesHuman">${esc(c.yesHuman)}</button></div></div>
  </div>
</section>

<aside class="vconv" id="vconv" aria-labelledby="ctitle">
  <header class="chead"><span class="cic">${ICONS.wave}</span><h2 id="ctitle" data-k="conv">${esc(c.conv)}</h2><button id="vtxclose" class="iconbtn dark" type="button" aria-label="${esc(c.close)}" data-k-label="close">${ICONS.close}</button></header>
  <div class="cprog"${total ? '' : ' hidden'}><div class="ctrack"><i id="cbar"></i></div><span id="cplabel"></span></div>
  <ol class="clog" id="vlog" role="log" aria-live="polite"></ol>
</aside>
<audio id="vaudio" autoplay hidden></audio>
</div>`;
}

export function renderChatPage(model) {
  const lang = model.language || 'en';
  const c = pageCopy(lang);
  const vars = { company: model.company, persona: model.persona };
  const languages = model.languages || ['en'];
  const options = languages.map((l) => `<option value="${esc(l)}"${l === lang ? ' selected' : ''}>${esc(LANG_LABEL[l] || l)}</option>`).join('');
  const bootstrap = {
    view: model.view, status: model.status, outcome: model.outcome || null, language: lang, languages, greeting: model.greeting,
    transcript: model.transcript, quickReplies: model.quickReplies, inputMode: model.inputMode, progress: model.progress,
    voiceTier: model.voiceTier, paused: model.paused, company: model.company, persona: model.persona, copy: pageCopyFor(languages, { voice: Boolean(model.voice?.available) && model.view !== 'verify' }),
    voice: model.voice || { available: false }, summary: model.summary || [], estimatedMinutes: model.estimatedMinutes || 3,
    livekitSrc: model.voice?.available ? ASSETS.livekit.path : null,
  };
  const withVoice = Boolean(model.voice?.available) && model.view !== 'verify';
  const linkRow = links(model, c);
  const open = model.status !== 'completed';
  return `${head({ title: model.company, company: model.company, lang })}
<body class="${withVoice ? (open ? 'mode-voice' : 'mode-voice ended') : 'mode-chat'}">
${withVoice ? renderVoice(model, c, vars, linkRow) : ''}<div class="app">
<header class="bar">
  <div class="top">
    <div class="logo" aria-hidden="true">${initial(model.company)}</div>
    <div class="who">
      <b class="co">${esc(model.company)}</b>
      <span class="role">${ICONS.spark}<span><span data-k="aiBadge">${esc(c.aiBadge)}</span><span class="persona"> · ${esc(model.persona)}</span></span>${model.isPreview ? `<em class="pv" data-k="preview">${esc(c.preview)}</em>` : ''}</span>
    </div>
    <div class="tools">
      ${languages.length > 1 ? `<label class="lang">${ICONS.globe}<span class="sr" data-k="language">${esc(c.language)}</span><select id="lang">${options}</select></label>` : ''}
      ${withVoice ? `<button id="tocall" class="iconbtn callbtn" type="button" aria-label="${esc(c.callInstead)}" data-k-label="callInstead">${ICONS.phone}</button>` : ''}
      <button id="more" class="iconbtn" type="button" aria-expanded="false" aria-controls="menu" aria-label="${esc(c.options)}" data-k-label="options">${ICONS.more}</button>
    </div>
  </div>
  ${progressHtml(model.progress, c)}
  <div id="menu" class="menu" hidden>
    <button id="bigger" type="button" class="mi" aria-pressed="false">${ICONS.text}<span data-k="bigger">${esc(c.bigger)}</span></button>
    <button id="speak" type="button" class="mi" aria-pressed="false" hidden>${ICONS.sound}<span data-k="speak">${esc(c.speak)}</span></button>
    ${linkRow ? `<div class="mlinks">${linkRow}</div>` : ''}
    ${open ? `<button id="optout2" type="button" class="mi quiet">${ICONS.stop}<span data-k="optOut">${esc(c.optOut)}</span></button>` : ''}
  </div>
</header>
<div id="banner" class="banner" role="status" hidden></div>
<section id="verify" class="verify" hidden aria-labelledby="vtitle">
  <div class="vicon">${ICONS.lock}</div>
  <h1 id="vtitle"></h1><p id="vtext"></p>
  <form id="vform" novalidate><label class="sr" for="vcode" data-k="verifyLabel">${esc(c.verifyLabel)}</label><input id="vcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" dir="ltr"><button id="vbtn" class="primary" type="submit"></button></form>
  <p id="verr" role="alert"></p>
</section>
<div id="chat" class="chat">
<div id="scroll" class="scroll">
  <section class="intro" aria-label="${esc(model.company)}">
    <p class="notice">${ICONS.shield}<span data-k="notice">${esc(fill(c.notice, vars))}</span></p>
    ${linkRow || open ? `<div class="irow">${linkRow ? `<span class="ilinks">${linkRow}</span>` : ''}${open ? `<button id="optout" class="optout" type="button" data-k="optOut">${esc(c.optOut)}</button>` : ''}</div>` : ''}
  </section>
  <main id="messages" role="log" aria-live="polite" aria-label="Conversation">
    ${model.view === 'verify' ? '' : `<div class="row ai"><div class="msg ai" dir="auto">${esc(model.greeting)}</div></div>`}
  </main>
</div>
<div class="dock">
  <div id="quick" class="quick"></div>
  <form id="form" class="composer" autocomplete="off">
    <label class="sr" for="input" data-k="placeholder">${esc(c.placeholder)}</label>
    <input id="input" dir="auto" maxlength="1000" enterkeyhint="send" placeholder="${esc(c.placeholder)}">
    <button id="mic" class="iconbtn mic" type="button" aria-label="${esc(c.mic)}" aria-pressed="false" hidden>${ICONS.mic}</button>
    <button id="send" class="send" type="submit" aria-label="${esc(c.send)}">${ICONS.send}</button>
  </form>
</div>
</div>
</div>
<script type="application/json" id="boot">${safeJson(bootstrap)}</script>
<script src="${ASSETS.js.path}" defer></script>${withVoice ? `\n<script src="${ASSETS.voice.path}" defer></script>` : ''}
</body></html>`;
}

const ERRORS = {
  LINK_NOT_FOUND: { title: 'Link not found', text: 'This link is not valid. Please check the message you received.' },
  LINK_EXPIRED: { title: 'This link has expired', text: 'Thank you for your interest. This link is no longer active.' },
  LINK_REVOKED: { title: 'This link is no longer active', text: 'Thank you. There is nothing more to do here.' },
  LINK_OPTED_OUT: { title: 'You will not be contacted', text: 'You asked not to be contacted, and we respect that.' },
  RATE_LIMITED: { title: 'Please wait a moment', text: 'Too many requests. Please try again in a minute.' },
};

export function renderErrorPage(code, company = '') {
  const e = ERRORS[code] || ERRORS.LINK_NOT_FOUND;
  const icon = code === 'LINK_OPTED_OUT' ? ICONS.shield : code === 'RATE_LIMITED' ? ICONS.info : ICONS.lock;
  return `${head({ title: e.title, company: company || 'Message', lang: 'en' })}
<body><div class="app solo"><section class="verify"><div class="vicon">${icon}</div><h1>${esc(e.title)}</h1><p>${esc(e.text)}</p>
<p dir="rtl" lang="ur" class="alt">${code === 'LINK_EXPIRED' ? 'یہ لنک ختم ہو چکا ہے۔' : code === 'LINK_OPTED_OUT' ? 'آپ سے رابطہ نہیں کیا جائے گا۔' : 'یہ لنک درست نہیں ہے۔'}</p></section></div></body></html>`;
}
