/* global document, window -- used inside page.evaluate (runs in the browser) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  afterAll, beforeAll, describe, expect, it,
} from '@jest/globals';

import {
  assetByPath, CSP, cspFor, renderChatPage, renderErrorPage,
} from '../../src/modules/linkAssistant/page/template.js';
import { PAGE_COPY } from '../../src/modules/linkAssistant/page/copy.js';

/**
 * Layout, accessibility and interaction checks for the customer page across phone,
 * tablet and desktop widths. Renders the real template + assets against a stubbed
 * API (no database), in headless Chromium loaded from the web client's node_modules.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const playwrightEntry = path.resolve(here, '../../../client/node_modules/playwright-core/index.mjs');
const describeIf = fs.existsSync(playwrightEntry) ? describe : describe.skip;

const GREETING = { en: "Hi Ali! I'm Ayesha, an AI assistant from Sunrise Solar. Shall we start?", ur: 'السلام علیکم Ali! میں Ayesha ہوں، Sunrise Solar کی AI اسسٹنٹ۔ کیا ہم شروع کریں؟' };
const model = (over = {}) => ({
  view: 'chat', status: 'opened', company: 'Sunrise Solar', persona: 'Ayesha', language: 'en', languages: ['en', 'ur', 'roman_ur'],
  greeting: GREETING.en, transcript: [], progress: { answered: 1, total: 4 }, inputMode: 'text', voiceTier: 'off', paused: false,
  privacyUrl: 'https://example.test/privacy', termsUrl: '', isPreview: false,
  quickReplies: [{ value: '__start', label: "Yes, let's start" }, { value: '__opt_out', label: "Don't contact me" }],
  ...over,
});

const pages = {
  en: model(),
  ur: model({
    language: 'ur', greeting: GREETING.ur, quickReplies: [],
    transcript: [{ role: 'assistant', text: 'ہمارا نمبر +92 300 1234567 ہے۔ کیا آپ مالک ہیں؟' }],
  }),
  done: model({ view: 'completed', status: 'completed', transcript: [{ role: 'assistant', text: 'Thank you!' }], quickReplies: [], inputMode: 'none' }),
  voice: model({ voiceTier: 'premium', voice: { available: true, maxMinutes: 10 }, estimatedMinutes: 3 }),
  voiceur: model({ voiceTier: 'premium', voice: { available: true, maxMinutes: 10 }, language: 'ur', greeting: GREETING.ur }),
  voicedone: model({
    voiceTier: 'premium', voice: { available: true }, view: 'completed', status: 'completed', outcome: 'completed', quickReplies: [], inputMode: 'none',
    summary: [{ label: 'Interest', value: 'Yes' }, { label: 'Monthly bill', value: '12,000' }],
  }),
};
const messages = [];
let failNext = false;

let server; let origin; let browser;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const asset = assetByPath.get(url.pathname);
    if (asset) { res.setHeader('Content-Type', asset.type); return res.end(asset.body); }
    const m = url.pathname.match(/^\/c\/(\w+)(?:\/api\/(\w+))?$/);
    if (!m || !pages[m[1]]) { res.statusCode = 404; return res.end(); }
    if (!m[2]) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', pages[m[1]]?.voice?.available ? cspFor({ voice: true }) : CSP);
      return res.end(m[1] === 'gone' ? renderErrorPage('LINK_EXPIRED') : renderChatPage(pages[m[1]]));
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    return req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      if (m[2] === 'language') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(model({ language: json.language, greeting: GREETING[json.language] || GREETING.en })));
      }
      if (m[2] === 'message') {
        messages.push(json);
        if (failNext) { failNext = false; res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); return res.end('{"code":"ERROR"}'); }
        res.setHeader('Content-Type', 'application/x-ndjson');
        return res.end(`${JSON.stringify({ type: 'done', reply: 'How many people live in the house?', quickReplies: [], inputMode: 'numeric', progress: { answered: 2, total: 4 } })}\n`);
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end('{"verified":true}');
    });
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  origin = `http://127.0.0.1:${server.address().port}`;
  if (fs.existsSync(playwrightEntry)) {
    const { chromium } = await import(pathToFileURL(playwrightEntry).href);
    try { browser = await chromium.launch(); } catch { browser = null; }
  }
}, 60000);

afterAll(async () => {
  await browser?.close();
  await new Promise((r) => { server.close(r); });
});

async function open(name, width, height = 760) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800, isMobile: width < 800 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(`${origin}/c/${name}`);
  await page.locator('#messages .msg').first().waitFor();
  return { context, page, errors };
}

describe('customer page markup', () => {
  it('ships interface copy only for the offered languages and renders the first paint in the session language', () => {
    const html = renderChatPage(model({ language: 'ur', languages: ['en', 'ur'], greeting: GREETING.ur }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain(PAGE_COPY.ur.optOut);
    expect(html).not.toContain(PAGE_COPY.roman_ur.placeholder);
    expect(html).not.toMatch(/style="/); // CSP: style-src 'self' blocks inline style attributes
  });

  it('every language has every interface string', () => {
    const keys = Object.keys(PAGE_COPY.en).sort();
    for (const copy of Object.values(PAGE_COPY)) expect(Object.keys(copy).sort()).toEqual(keys);
  });
});

describeIf('customer page in a real browser: layout, accessibility, interaction', () => {
  it.each([320, 360, 390, 768, 1440])('%ipx: no horizontal overflow; essential controls visible and large enough', async (width) => {
    if (!browser) return;
    for (const name of ['en', 'ur']) {
      const { context, page, errors } = await open(name, width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      for (const id of ['#input', '#send', '#lang', '#more', '#optout']) expect(await page.locator(id).isVisible()).toBe(true);
      const send = await page.locator('#send').boundingBox();
      expect(send.height).toBeGreaterThanOrEqual(44);
      expect(send.x + send.width).toBeLessThanOrEqual(width);
      for (const b of await page.locator('#quick button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
      expect(errors).toEqual([]);
      await context.close();
    }
  }, 60000);

  it('Urdu is right-to-left and keeps phone numbers left-to-right', async () => {
    if (!browser) return;
    const { context, page } = await open('ur', 390);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    expect(await page.locator('.msg.ai bdi[dir=ltr]').first().textContent()).toBe('+92 300 1234567');
    await context.close();
  }, 30000);

  it('options menu: opens, closes on Escape and returns focus', async () => {
    if (!browser) return;
    const { context, page } = await open('en', 390);
    await page.locator('#more').click();
    expect(await page.locator('#more').getAttribute('aria-expanded')).toBe('true');
    expect(await page.locator('#menu').isVisible()).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.locator('#menu').isVisible()).toBe(false);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('more');
    await page.locator('#bigger').evaluate((n) => n.click());
    expect(await page.locator('#bigger').getAttribute('aria-pressed')).toBe('true');
    await context.close();
  }, 30000);

  it('switching language updates the interface text and direction, not only the label', async () => {
    if (!browser) return;
    const { context, page } = await open('en', 390);
    await page.selectOption('#lang', 'ur');
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    expect(await page.locator('#optout').textContent()).toBe(PAGE_COPY.ur.optOut);
    expect(await page.locator('#input').getAttribute('placeholder')).toBe(PAGE_COPY.ur.placeholder);
    expect(await page.locator('#send').getAttribute('aria-label')).toBe(PAGE_COPY.ur.send);
    await context.close();
  }, 30000);

  it('a server error keeps the message and "Try again" resends it with the same id', async () => {
    if (!browser) return;
    messages.length = 0;
    failNext = true;
    const { context, page } = await open('en', 390);
    await page.locator('#input').fill('5');
    await page.locator('#input').press('Enter');
    await page.locator('.row.failed .fail button').waitFor();
    expect(await page.locator('#banner').isVisible()).toBe(true);
    await page.locator('.row.failed .fail button').click();
    await page.locator('.msg.ai', { hasText: 'How many people' }).waitFor();
    expect(messages).toHaveLength(2);
    expect(messages[1].clientMessageId).toBe(messages[0].clientMessageId);
    expect(await page.locator('#input').getAttribute('inputmode')).toBe('numeric');
    expect(await page.locator('#plabel').textContent()).toBe('2 of 4');
    expect(await page.locator('[role=progressbar]').getAttribute('aria-valuenow')).toBe('2');
    await context.close();
  }, 30000);

  it('completed: shows the confirmation and no composer', async () => {
    if (!browser) return;
    const { context, page } = await open('done', 360);
    expect(await page.locator('.done').textContent()).toContain(PAGE_COPY.en.doneTitle);
    expect(await page.locator('#send').isVisible()).toBe(false);
    expect(await page.locator('#optout').count()).toBe(0);
    await context.close();
  }, 30000);
});

describe('voice call screen markup', () => {
  it('is the landing view when the campaign offers a call; the text chat is only a fallback', () => {
    const html = renderChatPage(pages.voice);
    expect(html).toContain('<body class="mode-voice">');
    for (const id of ['vstart', 'vmute', 'vend', 'vtx2', 'vhuman', 'vlog', 'orb', 'wave']) expect(html).toContain(`id="${id}"`);
    expect(html).toMatch(/livekit-client\.[0-9a-f]{10}\.js/); // first-party SDK, fetched only on idle/start
    expect(html).not.toMatch(/<script src="[^"]*livekit/); // never render-blocking
    expect(html).toContain('data-optout'); // opt-out stays one tap away
    expect(renderChatPage(pages.en)).toContain('<body class="mode-chat">');
    expect(renderChatPage(pages.en)).not.toContain('id="vapp"');
  });

  it('only voice pages may connect to the LiveKit host', () => {
    const before = process.env.LIVEKIT_URL;
    process.env.LIVEKIT_URL = 'wss://demo-123.livekit.cloud';
    expect(cspFor({ voice: true })).toMatch(/connect-src 'self' wss:\/\/demo-123\.livekit\.cloud https:\/\/demo-123\.livekit\.cloud wss:\/\/\*\.livekit\.cloud/);
    expect(cspFor()).toMatch(/connect-src 'self';/);
    process.env.LIVEKIT_URL = 'javascript:alert(1)';
    expect(cspFor({ voice: true })).toMatch(/connect-src 'self';/);
    process.env.LIVEKIT_URL = before;
  });
});

describeIf('voice call screen in a browser (layout, no call)', () => {
  async function openVoice(name, width, height = 760, colorScheme = 'dark') {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800, isMobile: width < 800, colorScheme });
    const page = await context.newPage();
    await page.route('**/c/assets/livekit-client.*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.LivekitClient = {};' }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${origin}/c/${name}`);
    await page.locator('#stage').waitFor();
    return { context, page, errors };
  }

  it.each([[320, 640], [390, 844], [768, 1024], [1280, 800], [1920, 1080]])('%ipx: no horizontal scroll, Start call reachable, disclosure and opt-out visible', async (w, h) => {
    if (!browser) return;
    const { context, page, errors } = await openVoice('voice', w, h);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const start = await page.locator('#vstart').boundingBox();
    expect(start.y + start.height).toBeLessThanOrEqual(h);
    expect(start.height).toBeGreaterThanOrEqual(44);
    const notice = w >= 1100 ? '.vinfo .notice' : '.mlegal [data-k=notice]';
    expect(await page.locator(notice).isVisible()).toBe(true);
    expect(await page.locator(w >= 1100 ? '.vinfo [data-optout]' : '.mlegal [data-optout]').isVisible()).toBe(true);
    expect(await page.locator('#vconv').isVisible()).toBe(w >= 768); // side panel on wide screens
    expect(errors).toEqual([]);
    await context.close();
  }, 30000);

  it('every control has an accessible name; Urdu is right-to-left', async () => {
    if (!browser) return;
    const { context, page } = await openVoice('voice', 390, 844);
    const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('#vapp button')).filter((b) => b.offsetParent !== null && !(b.getAttribute('aria-label') || b.textContent.trim())).map((b) => b.id));
    expect(unnamed).toEqual([]);
    await context.close();
    const ur = await openVoice('voiceur', 390, 844);
    expect(await ur.page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    expect(await ur.page.locator('#vstart').textContent()).toContain(PAGE_COPY.ur.start);
    await ur.context.close();
  }, 30000);

  it('a finished conversation opens on its summary', async () => {
    if (!browser) return;
    const { context, page } = await openVoice('voicedone', 390, 844);
    await page.locator('#vresult').waitFor();
    expect(await page.locator('#rsum').textContent()).toMatch(/Monthly bill\s*12,000/);
    expect(await page.locator('#vstart').isVisible()).toBe(false);
    await context.close();
  }, 30000);
});
