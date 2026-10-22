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

import { pageCopy, pageCopyFor } from './copy.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function load(name, type) {
  const body = fs.readFileSync(path.join(here, 'assets', name));
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 10);
  return { name, type, body, gzip: zlib.gzipSync(body, { level: 9 }), hash, path: `/c/assets/${name.replace('.', `.${hash}.`)}` };
}

export const ASSETS = { js: load('app.js', 'application/javascript; charset=utf-8'), css: load('app.css', 'text/css; charset=utf-8') };
export const assetByPath = new Map(Object.values(ASSETS).map((a) => [a.path, a]));

export const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "connect-src 'self'", "font-src 'self'", "media-src 'self'", "base-uri 'none'", "form-action 'self'",
  "frame-ancestors 'none'", "manifest-src 'self'",
].join('; ');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script type="application/json">: neutralise "</script" and HTML comments.
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

const LANG_LABEL = { en: 'English', ur: 'اردو', roman_ur: 'Roman Urdu' };
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

export function renderChatPage(model) {
  const lang = model.language || 'en';
  const c = pageCopy(lang);
  const vars = { company: model.company, persona: model.persona };
  const languages = model.languages || ['en'];
  const options = languages.map((l) => `<option value="${esc(l)}"${l === lang ? ' selected' : ''}>${esc(LANG_LABEL[l] || l)}</option>`).join('');
  const bootstrap = {
    view: model.view, status: model.status, language: lang, languages, greeting: model.greeting,
    transcript: model.transcript, quickReplies: model.quickReplies, inputMode: model.inputMode, progress: model.progress,
    voiceTier: model.voiceTier, paused: model.paused, company: model.company, persona: model.persona, copy: pageCopyFor(languages),
  };
  const linkRow = links(model, c);
  const open = model.status !== 'completed';
  return `${head({ title: model.company, company: model.company, lang })}
<body><div class="app">
<header class="bar">
  <div class="top">
    <div class="logo" aria-hidden="true">${initial(model.company)}</div>
    <div class="who">
      <b class="co">${esc(model.company)}</b>
      <span class="role">${ICONS.spark}<span><span data-k="aiBadge">${esc(c.aiBadge)}</span><span class="persona"> · ${esc(model.persona)}</span></span>${model.isPreview ? `<em class="pv" data-k="preview">${esc(c.preview)}</em>` : ''}</span>
    </div>
    <div class="tools">
      ${languages.length > 1 ? `<label class="lang">${ICONS.globe}<span class="sr" data-k="language">${esc(c.language)}</span><select id="lang">${options}</select></label>` : ''}
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
<script src="${ASSETS.js.path}" defer></script>
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
