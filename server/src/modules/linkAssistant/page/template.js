/**
 * Server-rendered customer page. The first screen (header + greeting) is in the
 * HTML, so it paints before any JavaScript runs; the script only adds behaviour.
 * Assets are fingerprinted for long-lived caching.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

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

const LANG_LABEL = { en: 'English', ur: 'اردو', roman_ur: 'Roman Urdu' };
const DIR = (lang) => (lang === 'ur' ? 'rtl' : 'ltr');

function head({ title, company, lang }) {
  return `<!doctype html><html lang="${lang === 'roman_ur' ? 'ur-Latn' : esc(lang)}" dir="${DIR(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#1d4ed8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(company)}"><meta property="og:description" content="A short message from ${esc(company)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="${ASSETS.css.path}">
</head>`;
}

const initial = (name) => esc(String(name || 'U').trim().charAt(0).toUpperCase() || 'U');

export function renderChatPage(model) {
  const lang = model.language || 'en';
  const options = (model.languages || ['en']).map((l) => `<option value="${esc(l)}"${l === lang ? ' selected' : ''}>${esc(LANG_LABEL[l] || l)}</option>`).join('');
  const bootstrap = {
    view: model.view, status: model.status, language: lang, languages: model.languages, greeting: model.greeting,
    transcript: model.transcript, quickReplies: model.quickReplies, inputMode: model.inputMode, progress: model.progress,
    voiceTier: model.voiceTier, paused: model.paused,
  };
  return `${head({ title: model.company, company: model.company, lang })}
<body><div class="app">
<header>
  <div class="logo" aria-hidden="true">${initial(model.company)}</div>
  <div class="who"><b>${esc(model.persona)} · ${esc(model.company)}</b><span class="badge">AI assistant${model.isPreview ? ' · PREVIEW' : ''}</span></div>
  <div class="tools">
    <label class="sr" for="lang">Language</label><select id="lang" aria-label="Language">${options}</select>
    <button id="bigger" type="button" aria-label="Larger text">A+</button>
    <button id="speak" type="button" aria-label="Read replies aloud" aria-pressed="false" hidden>🔊</button>
  </div>
</header>
<div class="progress" aria-hidden="true"><i id="bar"></i></div>
<div class="progress-label" id="plabel" aria-live="polite"></div>
<div id="banner" class="banner" role="status" hidden></div>
<section id="verify" class="card" hidden>
  <h1 id="vtitle"></h1><p id="vtext"></p>
  <form id="vform"><input id="vcode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Last 4 digits"><button id="vbtn" type="submit"></button></form>
  <p id="verr" role="alert"></p>
</section>
<div id="chat">
<main id="messages" aria-live="polite" aria-label="Conversation">
  ${model.view === 'verify' ? '' : `<div class="msg ai" dir="auto">${esc(model.greeting)}</div>`}
</main>
<div id="quick" class="quick"></div>
<form id="form" class="composer" autocomplete="off">
  <label class="sr" for="input">Message</label>
  <input id="input" dir="auto" maxlength="1000" enterkeyhint="send">
  <button id="mic" class="mic" type="button" aria-label="Hold to talk" hidden>🎤</button>
  <button id="send" type="submit" aria-label="Send">➤</button>
</form>
</div>
<footer>
  <div>This is an automated assistant from ${esc(model.company)}. Your answers are only used by ${esc(model.company)} to follow up with you.</div>
  ${model.privacyUrl ? `<a href="${esc(model.privacyUrl)}" rel="noopener noreferrer">Privacy</a>` : ''}${model.privacyUrl && model.termsUrl ? ' · ' : ''}${model.termsUrl ? `<a href="${esc(model.termsUrl)}" rel="noopener noreferrer">Terms</a>` : ''}
  ${model.status === 'completed' ? '' : '<div><button id="optout" class="optout" type="button">I don\'t want to be contacted</button></div>'}
</footer>
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
  return `${head({ title: e.title, company: company || 'Message', lang: 'en' })}
<body><div class="app"><section class="card"><h1>${esc(e.title)}</h1><p>${esc(e.text)}</p>
<p dir="rtl" lang="ur">${code === 'LINK_EXPIRED' ? 'یہ لنک ختم ہو چکا ہے۔' : code === 'LINK_OPTED_OUT' ? 'آپ سے رابطہ نہیں کیا جائے گا۔' : 'یہ لنک درست نہیں ہے۔'}</p></section></div></body></html>`;
}
