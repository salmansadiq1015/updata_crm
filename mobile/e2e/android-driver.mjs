/**
 * Minimal Android UI driver over adb + UI Automator, for E2E runs on an emulator without extra
 * tooling. Finds nodes by visible text / content-desc in a fresh `uiautomator dump`, taps their
 * centre, types text, takes screenshots. Every lookup polls until a timeout.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class AndroidDriver {
  constructor({ serial = 'emulator-5554', shots = null } = {}) {
    this.serial = serial;
    this.shots = shots;
    if (shots) mkdirSync(shots, { recursive: true });
  }

  adb(...args) {
    return execFileSync('adb', ['-s', this.serial, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  }

  dump() {
    this.adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
    const xml = this.adb('shell', 'cat', '/sdcard/ui.xml');
    const nodes = [];
    for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
      const attr = (name) => (m[1].match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || '';
      const b = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!b) continue;
      nodes.push({
        text: decode(attr('text')), desc: decode(attr('content-desc')), cls: attr('class'),
        clickable: attr('clickable') === 'true', enabled: attr('enabled') !== 'false',
        x: Math.round((+b[1] + +b[3]) / 2), y: Math.round((+b[2] + +b[4]) / 2),
      });
    }
    return nodes;
  }

  /** First node whose text or content-desc matches (string = exact, RegExp = test). */
  async find(match, { timeout = 30_000, nth = 0 } = {}) {
    const ok = (s) => (match instanceof RegExp ? match.test(s) : s === match);
    const end = Date.now() + timeout;
    for (;;) {
      const hits = this.dump().filter((n) => ok(n.text) || ok(n.desc));
      if (hits.length > nth) return hits[nth];
      if (Date.now() > end) throw new Error(`not found on screen: ${match}`);
      await sleep(700);
    }
  }

  /** Polls ONE dump at a time (parallel dumps clobber /sdcard/ui.xml) until any match shows. */
  async findAny(matches, timeout = 30_000) {
    const end = Date.now() + timeout;
    for (;;) {
      const nodes = this.dump();
      for (const m of matches) {
        const ok = (s) => (m instanceof RegExp ? m.test(s) : s === m);
        if (nodes.some((n) => ok(n.text) || ok(n.desc))) return m;
      }
      if (Date.now() > end) throw new Error(`none on screen: ${matches.join(' | ')}`);
      await sleep(800);
    }
  }

  async has(match, timeout = 3000) {
    try {
      await this.find(match, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  async gone(match, timeout = 30_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (!(await this.has(match, 500))) return;
      await sleep(700);
    }
    throw new Error(`still on screen: ${match}`);
  }

  async tap(match, opts) {
    const n = await this.find(match, opts);
    this.adb('shell', 'input', 'tap', String(n.x), String(n.y));
    await sleep(500);
    return n;
  }

  async type(text) {
    this.adb('shell', 'input', 'text', text.replace(/ /g, '%s').replace(/([&|;<>()$`\\"'*?])/g, '\\$1'));
    await sleep(300);
  }

  async fill(match, text, opts) {
    await this.tap(match, opts);
    this.adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
    for (let i = 0; i < 40; i += 1) this.adb('shell', 'input', 'keyevent', 'KEYCODE_DEL');
    await this.type(text);
  }

  async scrollDown() {
    this.adb('shell', 'input', 'swipe', '540', '1700', '540', '700', '300');
    await sleep(600);
  }

  async scrollTo(match, tries = 6) {
    for (let i = 0; i < tries; i += 1) {
      if (await this.has(match, 800)) return this.find(match);
      await this.scrollDown();
    }
    return this.find(match, { timeout: 1000 });
  }

  back() {
    this.adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }

  screenshot(name) {
    if (!this.shots) return;
    const png = execFileSync('adb', ['-s', this.serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(join(this.shots, `${name}.png`), png);
  }
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#10;/g, '\n');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
