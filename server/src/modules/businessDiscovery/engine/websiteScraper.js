import * as cheerio from 'cheerio';
import axios from 'axios';
import { normalizePhone } from './normalizer.js';
import config from '../../../config/index.js';
import logger from '../../../shared/logger/index.js';

/**
 * Responsible website-enrichment scraper (§lead module).
 *
 * Fetches a lead's public website over plain HTTP and parses it with cheerio to
 * surface the business-contact fields (email, phone, social profiles) that a
 * provider like Google Places never returns. It is deliberately conservative:
 *
 *  - robots.txt is honoured (opt-out respected, fail-open only on fetch error);
 *  - at most {@link MAX_PAGES_PER_SITE} pages are fetched per site, total;
 *  - every request has a hard timeout and a response byte cap;
 *  - a polite, self-identifying User-Agent is sent;
 *  - only public business-contact info is extracted — no deep crawling, no
 *    harvesting of unrelated personal data, and full page bodies are never logged.
 *
 * ── Provider abstraction ─────────────────────────────────────────────────────
 * {@link WebsiteScraper} is the interface; {@link HttpCheerioScraper} is the only
 * implementation we ship. Sites that render their contact details with client-side
 * JavaScript are invisible to a plain HTTP + cheerio fetch. A `PlaywrightScraper`
 * could implement the SAME interface (`fetchPage` / `respectsRobots` /
 * `extractContacts` / `scrapeSite`) by driving a headless browser, and the
 * enrichment service would consume it unchanged. It is intentionally NOT installed
 * ("browser only when needed"): Playwright/puppeteer are heavy, and the vast
 * majority of SME sites expose contact info in server-rendered HTML.
 */

// Hard cap: never fetch more than this many pages for a single site (homepage +
// at most one contact/about page).
export const MAX_PAGES_PER_SITE = 2;

// Upper bound on the characters of body text scanned by the contact regexes —
// guards against pathological pages and keeps regex time bounded.
const MAX_TEXT_SCAN = 200_000;

// robots.txt bodies are tiny; cap the fetch hard and cache the parsed result
// briefly so a bulk run does not re-request it per lead on the same host.
const ROBOTS_MAX_BYTES = 128 * 1024;
const ROBOTS_CACHE_TTL_MS = 5 * 60 * 1000;
const robotsCache = new Map(); // origin -> { agents: object|null, fetchedAt: number }

const EMAIL_GLOBAL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_EXACT_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
// Phone-like run: optional +, then 7–17 digits possibly grouped by spaces, dots,
// slashes, dashes or parentheses. normalizePhone does the real validation.
const PHONE_GLOBAL_RE = /\+?\d[\d\s()./-]{6,16}\d/g;

// Drop obvious non-addresses: asset filenames, placeholders, tracking stubs.
const EMAIL_ASSET_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|css|js|mjs|woff2?|ttf|eot|pdf)$/i;
const EMAIL_NOISE_RE = /@2x|@3x|(^|@)(example|sentry|wixpress|yourdomain|yourcompany|domain|email)\b|@(example|domain|email|sentry|wixpress)\./i;

// Social networks, in a fixed priority order; first match of each key wins.
const SOCIAL_MATCHERS = [
  ['facebook', /(?:^|\.)(?:facebook\.com|fb\.com)$/i],
  ['instagram', /(?:^|\.)instagram\.com$/i],
  ['linkedin', /(?:^|\.)linkedin\.com$/i],
  ['twitter', /(?:^|\.)(?:twitter\.com|x\.com)$/i],
  ['youtube', /(?:^|\.)(?:youtube\.com|youtu\.be)$/i],
  ['tiktok', /(?:^|\.)tiktok\.com$/i],
];
// Share widgets / intent links are not the business's own profile.
const SOCIAL_SHARE_RE = /(sharer|share\.php|\/share(?:[/?]|$)|\/intent\/|\/plugins\/|\/dialog\/|\/login)/i;

// A homepage link that is likely to carry contact details (EN + DE/CH terms).
const CONTACT_LINK_RE = /contact|kontakt|about|impressum|ueber-?uns|über-?uns/i;

/**
 * Scraper interface. Any implementation (HTTP + cheerio today, a headless-browser
 * `PlaywrightScraper` tomorrow) must provide these four methods with the same
 * contracts so {@link module:leadEnrichment.service} can swap one for the other.
 *
 * @interface
 */
export class WebsiteScraper {
  /** @returns {Promise<{ok:boolean,status:number,html?:string,finalUrl?:string,contentType?:string,error?:string}>} */
  async fetchPage(_url, _opts) { throw new Error('WebsiteScraper.fetchPage() not implemented'); }

  /** @returns {Promise<boolean>} true when the UA may fetch the URL's path. */
  async respectsRobots(_url, _userAgent) { throw new Error('WebsiteScraper.respectsRobots() not implemented'); }

  /** @returns {{emails:string[],phones:string[],social:object}} */
  extractContacts(_html, _baseUrl) { throw new Error('WebsiteScraper.extractContacts() not implemented'); }

  /** @returns {Promise<{emails:string[],phones:string[],social:object,pagesFetched:number,skipped?:boolean,error?:string}>} */
  async scrapeSite(_url) { throw new Error('WebsiteScraper.scrapeSite() not implemented'); }
}

/**
 * Plain HTTP + cheerio implementation of {@link WebsiteScraper}.
 *
 * @param {object} [deps]
 * @param {object} [deps.httpClient] axios-compatible client (`.get`) — injected in tests.
 * @param {object} [deps.config]     overrides for { timeoutMs, maxBytes, userAgent, respectRobots }.
 */
export class HttpCheerioScraper extends WebsiteScraper {
  constructor({ httpClient, config: cfg } = {}) {
    super();
    this.httpClient = httpClient || axios;
    this.config = {
      timeoutMs: cfg?.timeoutMs ?? config.enrichment.timeoutMs,
      maxBytes: cfg?.maxBytes ?? config.enrichment.maxBytes,
      userAgent: cfg?.userAgent ?? config.enrichment.userAgent,
      respectRobots: cfg?.respectRobots ?? config.enrichment.respectRobots,
    };
  }

  /**
   * Fetch a single page over HTTP. Enforces timeout + byte cap, follows at most
   * two redirects, sends a polite UA and asks only for HTML. NEVER throws on a
   * 4xx/5xx — those come back as { ok:false, status }. Transport failures
   * (timeout, DNS, TLS, oversized body) also resolve to { ok:false }.
   */
  async fetchPage(url, opts = {}) {
    const timeout = opts.timeoutMs ?? this.config.timeoutMs;
    const maxBytes = opts.maxBytes ?? this.config.maxBytes;
    const userAgent = opts.userAgent ?? this.config.userAgent;

    try {
      const res = await this.httpClient.get(url, {
        timeout,
        maxContentLength: maxBytes, // abort the download once the body exceeds the cap
        maxBodyLength: maxBytes,
        maxRedirects: 2,
        responseType: 'text',
        decompress: true,
        validateStatus: () => true, // handle status ourselves; never throw on 4xx/5xx
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
        },
      });

      const status = res.status ?? 0;
      if (status < 200 || status >= 300) return { ok: false, status };

      const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return { ok: false, status, error: 'non_html', contentType };
      }

      const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      const finalUrl = res.request?.res?.responseUrl || res.request?.responseURL || url;
      return {
        ok: true, status, html, finalUrl, contentType,
      };
    } catch (err) {
      return { ok: false, status: err.response?.status ?? 0, error: this._shortError(err) };
    }
  }

  /**
   * Is `url`'s path fetchable per the host's robots.txt for `userAgent`? Parses
   * the Disallow/Allow directives of the matching UA group (falling back to `*`)
   * with longest-match precedence. Fails OPEN only when robots.txt cannot be
   * fetched; an explicit Disallow is always honoured.
   */
  async respectsRobots(url, userAgent = this.config.userAgent) {
    let origin;
    let pathForMatch;
    try {
      const u = new URL(url);
      origin = u.origin;
      pathForMatch = (u.pathname || '/') + (u.search || '');
    } catch {
      return true; // unparseable → nothing to enforce against
    }

    const agents = await this._getRobotsAgents(origin, userAgent);
    if (!agents) return true; // fetch failed → fail open (allow)

    const rules = this._resolveRules(agents, userAgent);
    return this._isAllowed(rules, pathForMatch);
  }

  /**
   * Extract public business-contact info from an HTML string.
   *  - emails: `a[href^=mailto:]` + a bounded body-text scan, lowercased, deduped,
   *    with obvious noise (example@, asset filenames, tracking stubs) dropped;
   *  - phones: `a[href^=tel:]` + bounded text patterns, each run through
   *    normalizePhone(…, 'CH') and kept only when valid (stored as E.164);
   *  - social: first matching facebook / instagram / linkedin / twitter|x /
   *    youtube / tiktok profile link (share/intent widgets ignored).
   */
  extractContacts(html, baseUrl) {
    const out = { emails: [], phones: [], social: {} };
    if (!html || typeof html !== 'string') return out;

    let $;
    try {
      $ = cheerio.load(html);
    } catch {
      return out;
    }

    const emails = new Set();
    const phones = new Set();

    // mailto: links — the most reliable source.
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let raw = href.slice('mailto:'.length).split('?')[0];
      try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
      for (const part of raw.split(',')) {
        const email = this._cleanEmail(part);
        if (email) emails.add(email);
      }
    });

    // tel: links.
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let raw = href.slice('tel:'.length);
      try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
      const { e164, valid } = normalizePhone(raw, 'CH');
      if (valid && e164) phones.add(e164);
    });

    // Bounded body-text scan for inline emails / phone numbers.
    const text = ($('body').text() || '').slice(0, MAX_TEXT_SCAN);
    for (const match of text.matchAll(EMAIL_GLOBAL_RE)) {
      const email = this._cleanEmail(match[0]);
      if (email) emails.add(email);
    }
    for (const match of text.matchAll(PHONE_GLOBAL_RE)) {
      const { e164, valid } = normalizePhone(match[0], 'CH');
      if (valid && e164) phones.add(e164);
    }

    // Social profile links.
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      let parsed;
      try {
        parsed = new URL(href, baseUrl);
      } catch {
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      const absolute = parsed.toString();
      if (SOCIAL_SHARE_RE.test(absolute)) return;
      const host = parsed.hostname.replace(/^www\./, '');
      for (const [key, re] of SOCIAL_MATCHERS) {
        if (!out.social[key] && re.test(host)) {
          out.social[key] = absolute;
          break;
        }
      }
    });

    out.emails = [...emails];
    out.phones = [...phones];
    return out;
  }

  /**
   * Scrape a site for contact info. Fetches the homepage; if no email was found
   * and a contact/about/kontakt link exists, fetches ONE additional same-site
   * page and merges the results. Honours robots.txt and the per-site page cap.
   * Returns found contacts plus `pagesFetched`, and (when applicable) `skipped`
   * or `error`. Never throws for a dead/blocked site.
   */
  async scrapeSite(url) {
    const result = {
      emails: [], phones: [], social: {}, pagesFetched: 0,
    };

    const startUrl = this._toFetchUrl(url);
    if (!startUrl) {
      result.error = 'invalid_url';
      return result;
    }
    const ua = this.config.userAgent;

    if (this.config.respectRobots && !(await this.respectsRobots(startUrl, ua))) {
      result.skipped = true;
      result.reason = 'robots_disallow';
      this._log('skipped', startUrl, result);
      return result;
    }

    const home = await this.fetchPage(startUrl);
    if (!home.ok) {
      result.error = `fetch_failed:${home.status || 0}${home.error ? `:${home.error}` : ''}`;
      this._log('error', startUrl, result);
      return result;
    }
    result.pagesFetched = 1;
    const base = home.finalUrl || startUrl;
    this._merge(result, this.extractContacts(home.html, base));

    // Follow at most one contact/about page, and only if we still lack an email.
    if (result.emails.length === 0 && result.pagesFetched < MAX_PAGES_PER_SITE) {
      const next = this._findContactLink(home.html, base);
      if (next) {
        const allowed = !this.config.respectRobots || (await this.respectsRobots(next, ua));
        if (allowed) {
          const page2 = await this.fetchPage(next);
          if (page2.ok) {
            result.pagesFetched += 1;
            this._merge(result, this.extractContacts(page2.html, page2.finalUrl || next));
          }
        }
      }
    }

    this._log('done', startUrl, result);
    return result;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Merge a contact bundle into the accumulator: union emails/phones, fill-first socials. */
  _merge(acc, contacts) {
    if (!contacts) return;
    acc.emails = [...new Set([...acc.emails, ...(contacts.emails || [])])];
    acc.phones = [...new Set([...acc.phones, ...(contacts.phones || [])])];
    for (const [key, value] of Object.entries(contacts.social || {})) {
      if (value && !acc.social[key]) acc.social[key] = value;
    }
  }

  /** Normalize + validate a candidate email, or return null if it is noise. */
  _cleanEmail(raw) {
    if (!raw) return null;
    let email = String(raw).trim().toLowerCase();
    email = email.replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9.]+$/, '');
    if (!EMAIL_EXACT_RE.test(email)) return null;
    if (EMAIL_ASSET_EXT_RE.test(email)) return null;
    if (EMAIL_NOISE_RE.test(email)) return null;
    return email;
  }

  /** First same-site contact/about link on the page, as an absolute URL, or null. */
  _findContactLink(html, base) {
    let $;
    try {
      $ = cheerio.load(html);
    } catch {
      return null;
    }

    let baseUrl;
    try {
      baseUrl = new URL(base);
    } catch {
      return null;
    }

    let found = null;
    $('a[href]').each((_, el) => {
      if (found) return;
      const href = $(el).attr('href');
      if (!href) return;
      let parsed;
      try {
        parsed = new URL(href, baseUrl);
      } catch {
        return;
      }
      if (parsed.hostname !== baseUrl.hostname) return; // same-site only
      if (parsed.pathname === baseUrl.pathname) return; // not the homepage again
      const haystack = `${parsed.pathname} ${($(el).text() || '')}`.toLowerCase();
      if (CONTACT_LINK_RE.test(haystack)) found = parsed.toString();
    });
    return found;
  }

  /** Coerce a stored website value into an absolute http(s) URL to fetch, or null. */
  _toFetchUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    let candidate = url.trim();
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const u = new URL(candidate);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  /** Short, body-free error token for logs/results. */
  _shortError(err) {
    if (err?.code) return String(err.code);
    if (err?.message) return String(err.message).slice(0, 80);
    return 'fetch_error';
  }

  /** Fetch + parse robots.txt for an origin (cached briefly). null ⇒ fail open. */
  async _getRobotsAgents(origin, userAgent) {
    const cached = robotsCache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_TTL_MS) {
      return cached.agents;
    }

    let agents;
    try {
      const res = await this.httpClient.get(`${origin}/robots.txt`, {
        timeout: this.config.timeoutMs,
        maxContentLength: ROBOTS_MAX_BYTES,
        maxBodyLength: ROBOTS_MAX_BYTES,
        maxRedirects: 2,
        responseType: 'text',
        validateStatus: () => true,
        headers: { 'User-Agent': userAgent, Accept: 'text/plain' },
      });
      if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') {
        agents = this._parseRobots(res.data);
      } else {
        // No robots.txt (404) or a server error ⇒ nothing disallowed.
        agents = {};
      }
    } catch {
      agents = null; // transport failure ⇒ fail open
    }

    robotsCache.set(origin, { agents, fetchedAt: Date.now() });
    return agents;
  }

  /** Parse robots.txt into { <agentToken>: { disallow:[], allow:[] } }. */
  _parseRobots(text) {
    const agents = {};
    let current = [];
    let sawRuleForGroup = false;

    for (const rawLine of String(text).split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const field = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();

      if (field === 'user-agent') {
        // Consecutive user-agent lines share the next block of rules.
        if (sawRuleForGroup) {
          current = [];
          sawRuleForGroup = false;
        }
        const token = value.toLowerCase();
        current.push(token);
        if (!agents[token]) agents[token] = { disallow: [], allow: [] };
      } else if (field === 'disallow' || field === 'allow') {
        if (!current.length) continue;
        sawRuleForGroup = true;
        for (const token of current) {
          if (!agents[token]) agents[token] = { disallow: [], allow: [] };
          agents[token][field === 'disallow' ? 'disallow' : 'allow'].push(value);
        }
      }
    }
    return agents;
  }

  /** Pick the most specific matching UA group (longest token prefix of the UA), else `*`. */
  _resolveRules(agents, userAgent) {
    const ua = String(userAgent).toLowerCase();
    let best = null;
    let bestLen = -1;
    for (const token of Object.keys(agents)) {
      if (token === '*') continue;
      if (token && ua.includes(token) && token.length > bestLen) {
        best = agents[token];
        bestLen = token.length;
      }
    }
    if (best) return best;
    return agents['*'] || { disallow: [], allow: [] };
  }

  /** Longest-match Allow/Disallow evaluation; ties and empty rulesets allow. */
  _isAllowed(rules, path) {
    const disallow = rules?.disallow || [];
    const allow = rules?.allow || [];
    if (!disallow.length) return true;

    const longest = (patterns) => patterns.reduce((max, pattern) => {
      if (pattern === '') return max; // empty Disallow/Allow ⇒ no restriction
      const len = this._matchLength(path, pattern);
      return len > max ? len : max;
    }, -1);

    const disallowLen = longest(disallow);
    if (disallowLen < 0) return true; // nothing disallowed matched
    const allowLen = longest(allow);
    return allowLen >= disallowLen; // Allow of equal/greater specificity wins
  }

  /** If `pattern` (with * / $ wildcards) matches the start of `path`, its specificity, else -1. */
  _matchLength(path, pattern) {
    const anchored = pattern.endsWith('$');
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const regexStr = body
      .split('*')
      .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    let re;
    try {
      re = new RegExp(`^${regexStr}${anchored ? '$' : ''}`);
    } catch {
      return -1;
    }
    return re.test(path) ? body.length : -1;
  }

  /** Structured, body-free scrape log line. */
  _log(outcome, url, result) {
    let host = null;
    try { host = new URL(url).hostname; } catch { host = null; }
    logger.debug('Website enrichment scrape', {
      module: 'crm',
      action: 'lead.enrich.scrape',
      host,
      outcome,
      pagesFetched: result.pagesFetched,
      emails: result.emails.length,
      phones: result.phones.length,
      socials: Object.keys(result.social).length,
      ...(result.error ? { error: result.error } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    });
  }
}

// Default singleton used by the enrichment service (real axios client).
const websiteScraper = new HttpCheerioScraper();

export default websiteScraper;
