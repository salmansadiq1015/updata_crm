import type { MapsContext, MapsScrollState, RatingBreakdown, RawBusinessRecord } from '../shared/types';

const PLACE_LINK = 'a[href*="/maps/place/"]';
const PHONE_LABEL = /\b(phone|telephone|tel|call|téléphone|telefon|teléfono|telefono|telefone)\b|هاتف|الهاتف/i;
const WEBSITE_LABEL = /\b(website|web site|official site|site internet|webseite|sitio web|sito web)\b|موقع الويب/i;
const ADDRESS_LABEL = /\b(address|location|adresse|dirección|direccion|indirizzo|endereço|endereco)\b|العنوان|адрес/i;
const RATING_LABEL = /\b(rating|stars?|out of 5|note|étoiles?|sterne|estrellas?|stelle)\b|نجوم/i;
const REVIEWS_LABEL = /\b(reviews?|ratings?|avis|bewertungen|reseñas?|recensioni|avaliações|avaliacoes)\b|مراجعات?|تقييمات?/i;

export class MapsAdapter {
  detectMapsPage(): boolean {
    return /(^|\.)google\.[^/]+$/.test(location.hostname) && location.pathname.startsWith('/maps');
  }

  detectSearchResults(): boolean {
    return this.getResultLinks().length > 0 || Boolean(this.resultListRoot());
  }

  detectBusinessListing(): boolean {
    return /\/maps\/place\//.test(location.pathname) && !this.detectSearchResults();
  }

  getResultLinks(): HTMLAnchorElement[] {
    const feed = this.resultListRoot();
    if (!feed) return [];
    const seenCards = new Set<HTMLElement>();
    return [...feed.querySelectorAll<HTMLAnchorElement>(PLACE_LINK)].filter((anchor) => {
      const rect = anchor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const card = this.findResultCard(anchor);
      if (!feed.contains(card) || seenCards.has(card)) return false;
      seenCards.add(card);
      return true;
    });
  }

  extractBusinessSummary(anchor: HTMLAnchorElement): RawBusinessRecord | null {
    const card = this.findResultCard(anchor);
    const lines = this.visibleLines(card, 50);
    const labelled = this.labelledValues(card);
    const businessName = this.cleanName(anchor.getAttribute('aria-label') || lines[0] || anchor.textContent || '');
    if (!businessName) return null;
    const href = anchor.href;
    const ratingLine = labelled.rating || lines.find((line) => /\b\d(?:[.,]\d)?\b/.test(line) && /\(?\d[\d,.]*\)?/.test(line)) || '';
    const rating = this.parseRating(ratingLine);
    const reviewCount = this.parseReviewCount(labelled.reviews || ratingLine);
    const phone = this.phoneFromElement(card) || labelled.phone || lines.find((line) => /(?:\+?\d[\d ()\-().]{6,}\d)/.test(line)) || null;
    const website = this.websiteFromElement(card) ?? labelled.website ?? this.websiteFromText(lines);
    const address = labelled.address || lines.find((line) => line.length > 12 && line !== businessName && !/^\d(?:\.\d)?$/.test(line) && !/reviews?|rating|stars?/i.test(line) && !/(open|closed|website|directions|call|sponsored|free parking|free breakfast|free wi.?fi|air.conditioned)/i.test(line) && !this.looksLikeDomain(line)) || null;
    const coordinates = this.coordinatesFromUrl(href);
    return {
      businessName,
      category: this.categoryFromElement(card) ?? this.categoryFromLines(lines, businessName),
      phone,
      website,
      address,
      ...this.addressParts(address),
      rating,
      reviewCount,
      googleMapsUrl: href,
      placeIdentifier: this.extractPlaceIdentifier(href),
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null
    };
  }

  extractBusinessDetails(): RawBusinessRecord | null {
    const detailRoot = document.querySelector<HTMLElement>('[role="main"]') ?? document.body;
    const title = detailRoot.querySelector<HTMLElement>('h1')?.textContent?.trim()
      ?? document.querySelector<HTMLElement>('h1')?.textContent?.trim()
      ?? '';
    if (!title) return null;
    const lines = this.visibleLines(detailRoot, 160);
    const labelled = this.labelledValues(detailRoot);
    const ratingLine = labelled.rating || lines.find((line) => /\d(?:[.,]\d)?\s*\(/.test(line)) || '';
    const address = this.dataItemValue(detailRoot, 'address') || labelled.address || this.findDetailByLabel(['address', 'adresse', 'dirección', 'indirizzo', 'العنوان']);
    const coordinates = this.coordinatesFromUrl(location.href);
    return {
      businessName: title,
      category: this.categoryFromElement(detailRoot) ?? this.categoryFromLines(lines, title),
      phone: this.phoneFromElement(detailRoot) || labelled.phone || lines.find((line) => /(?:\+?\d[\d ()\-().]{6,}\d)/.test(line)) || null,
      website: this.websiteFromElement(detailRoot) ?? labelled.website ?? null,
      address,
      ...this.addressParts(address),
      rating: this.parseRating(ratingLine),
      reviewCount: this.parseReviewCount(labelled.reviews || ratingLine),
      ratingBreakdown: this.parseRatingBreakdown(detailRoot),
      photos: this.extractPhotos(detailRoot),
      businessStatus: lines.find((line) => /open|closed|temporarily/i.test(line)) ?? null,
      openingHours: lines.filter((line) => /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i.test(line)).slice(0, 14),
      googleMapsUrl: location.href,
      placeIdentifier: this.extractPlaceIdentifier(location.href),
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null
    };
  }

  context(): MapsContext {
    return {
      isMaps: this.detectMapsPage(),
      url: location.href,
      query: new URLSearchParams(location.search).get('q') || this.searchBoxValue(),
      hasResults: this.detectSearchResults(),
      isListing: this.detectBusinessListing(),
      visibleResultCount: this.getResultLinks().length,
      centerCoordinates: this.coordinatesFromUrl(location.href)
    };
  }

  scrollResults(): MapsScrollState {
    const feed = this.resultsContainer();
    if (!feed) return this.scrollState(null, false);
    const before = feed.scrollTop;
    const maxTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    const atBottom = before + feed.clientHeight >= feed.scrollHeight - 8;
    const target = Math.min(before + Math.max(feed.clientHeight * 0.85, 650), maxTop);
    if (target > before) {
      feed.scrollTo({ top: target, behavior: 'auto' });
      feed.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    // Google Maps appends the next page of results only once the feed is pushed
    // against its current bottom. Always nudge the last card into view and emit a
    // wheel event — even when the feed already appears to be at the bottom — so a
    // not-yet-extended feed keeps lazy-loading instead of being mistaken for the
    // end after only the first ~20 cards. Genuine completion is still gated on the
    // "end of the list" marker plus settled no-progress rounds in the background
    // loop, never on scroll position alone, so this cannot spin forever.
    if (atBottom || feed.scrollTop <= before + 1) {
      const last = this.getResultLinks().at(-1);
      last?.scrollIntoView({ block: 'end', behavior: 'auto' });
      feed.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.max(feed.clientHeight, 650), bubbles: true }));
      feed.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    // Only forward movement is continuation. A virtual list jumping back to
    // "Back to top" must not reset the no-progress completion counter.
    const changed = feed.scrollTop > before + 1;
    return this.scrollState(feed, changed);
  }

  getScrollState(): MapsScrollState {
    return this.scrollState(this.resultsContainer(), false);
  }

  restoreScroll(checkpoint: { scrollTop?: number; lastVisibleResultKey?: string | null }): MapsScrollState {
    const feed = this.resultsContainer();
    if (!feed) return this.scrollState(null, false);
    const before = feed.scrollTop;
    const anchor = checkpoint.lastVisibleResultKey
      ? this.getResultLinks().find((link) => {
        const record = this.extractBusinessSummary(link);
        return record ? resultKeyForMapRecord(record) === checkpoint.lastVisibleResultKey : false;
      })
      : null;
    if (anchor) anchor.scrollIntoView({ block: 'end', behavior: 'auto' });
    else if (Number.isFinite(checkpoint.scrollTop)) feed.scrollTo({ top: Math.max(0, checkpoint.scrollTop ?? 0), behavior: 'auto' });
    feed.dispatchEvent(new Event('scroll', { bubbles: true }));
    return this.scrollState(feed, feed.scrollTop !== before);
  }

  collectVisible(): RawBusinessRecord[] {
    const summaries = this.getResultLinks().map((anchor) => this.extractBusinessSummary(anchor)).filter((item): item is RawBusinessRecord => Boolean(item));
    const detail = this.detectBusinessListing() ? this.extractBusinessDetails() : null;
    return detail ? [detail, ...summaries] : summaries;
  }

  private visibleLines(element: Element, limit = 50): string[] {
    return [...element.querySelectorAll<HTMLElement>('*')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && node.children.length === 0;
      })
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .filter((line, index, lines) => lines.indexOf(line) === index)
      .slice(0, limit);
  }

  private cleanName(value: string): string {
    return value.replace(/\s*[-|·].*$/, '').replace(/^\d+\.\s*/, '').trim();
  }

  private findResultCard(anchor: HTMLAnchorElement): HTMLElement {
    const semanticCard = anchor.closest<HTMLElement>('[role="article"], .Nv2PK, .bfdHY, [jsaction*="mouseover:pane"]');
    if (semanticCard && semanticCard.textContent?.trim()) return semanticCard;
    let current: HTMLElement | null = anchor.parentElement;
    let best: HTMLElement = anchor;
    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
      const text = current.textContent?.trim() ?? '';
      const placeLinks = current.querySelectorAll('a[href*="/maps/place/"]').length;
      if (text.length >= 50 && text.length < 2_000 && placeLinks <= 2) best = current;
    }
    return best;
  }

  private labelledValues(card: Element): { phone: string | null; website: string | null; address: string | null; rating: string | null; reviews: string | null } {
    const labels = [...card.querySelectorAll<HTMLElement>('[aria-label]')]
      .map((node) => node.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean);
    const by = (pattern: RegExp): string | null => labels.find((label) => pattern.test(label)) ?? null;
    const phoneLabel = by(PHONE_LABEL);
    const websiteLabel = by(WEBSITE_LABEL);
    const addressLabel = by(ADDRESS_LABEL);
    const ratingLabel = by(RATING_LABEL);
    const reviewsLabel = by(REVIEWS_LABEL);
    return {
      phone: phoneLabel ? this.valueFromLabel(phoneLabel) : null,
      website: websiteLabel && this.looksLikeDomain(this.valueFromLabel(websiteLabel)) ? this.normalizeWebsite(this.valueFromLabel(websiteLabel)) : null,
      address: addressLabel ? this.valueFromLabel(addressLabel) : null,
      rating: ratingLabel,
      reviews: reviewsLabel
    };
  }

  private valueFromLabel(value: string): string {
    const cleaned = value.replace(/^[^:：]+[:：]\s*/, '').replace(/^\s*(?:website|web site|official site|site internet|webseite|sitio web|sito web)\s*/i, '').trim();
    return /^(?:phone|telephone|tel|call|téléphone|telefon|teléfono|telefono|telefone|website|web site|official site|site internet|webseite|sitio web|sito web|address|location|adresse|dirección|direccion|indirizzo|endereço|endereco|rating|stars?|out of 5|note|étoiles?|sterne|estrellas?|stelle|هاتف|الهاتف|موقع الويب|العنوان|نجوم|адрес)$/i.test(cleaned) ? '' : cleaned;
  }

  private normalizeWebsite(value: string): string {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }

  private addressParts(address: string | null): Pick<RawBusinessRecord, 'street' | 'area' | 'city' | 'postalCode' | 'country'> {
    if (!address) return { street: null, area: null, city: null, postalCode: null, country: null };
    const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
    const postalCode = address.match(/\b\d{4,6}\b/)?.[0] ?? null;
    const postalPart = postalCode ? parts.find((part) => part.includes(postalCode)) : null;
    const country = parts.length >= 3 && !/\d/.test(parts.at(-1) ?? '') ? parts.at(-1) ?? null : null;
    const city = postalPart?.replace(postalCode ?? '', '').trim()
      || (parts.length >= 3 ? parts.at(-2) : parts[1])
      || null;
    return {
      street: parts[0] ?? null,
      area: parts.length > 3 ? parts[1] ?? null : null,
      city,
      postalCode,
      country
    };
  }

  private coordinatesFromUrl(value: string): { latitude: number; longitude: number } | null {
    const match = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
      ?? value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }

  private parseRating(value: string): number | null {
    const match = value.match(/\b([1-5](?:[.,]\d)?)\b/);
    return match ? Number(match[1].replace(',', '.')) : null;
  }

  private parseReviewCount(value: string): number | null {
    const parenthetical = value.match(/\(\s*([\d\s.,]+)\s*([kmb])?\s*\)/i);
    const labelled = value.match(/\b([\d\s.,]+)\s*([kmb])?\s*(?:reviews?|ratings?|avis|bewertungen|reseñas?|recensioni|avaliações|مراجعات?|تقييمات?)/i);
    const raw = (parenthetical?.[1] ?? labelled?.[1])?.trim();
    if (!raw) return null;
    const suffix = (parenthetical?.[2] ?? labelled?.[2])?.toLowerCase();
    if (suffix) {
      const compact = Number(raw.replace(/\s/g, '').replace(',', '.'));
      const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1_000_000_000;
      return Number.isFinite(compact) ? Math.round(compact * multiplier) : null;
    }
    const count = Number(raw.replace(/\D/g, ''));
    return Number.isFinite(count) ? count : null;
  }

  // Google renders the reviews histogram as up to five rows, each with an
  // aria-label pairing a star level (1–5) with its review count — wording and
  // order vary by locale ("5 stars, 1,234 reviews" / "1 234 avis, 5 étoiles").
  // We read those labels and NEVER fabricate a level we did not find; if fewer
  // than two rows are confidently parsed the breakdown is treated as unavailable.
  private parseRatingBreakdown(root: Element): RatingBreakdown | null {
    const nodes = [...root.querySelectorAll<HTMLElement>('[aria-label][role="img"], tr[role="row"][aria-label], [role="row"] [aria-label], [aria-label]')]
      .slice(0, 400);
    const found: Partial<Record<1 | 2 | 3 | 4 | 5, number>> = {};
    for (const node of nodes) {
      const label = node.getAttribute('aria-label');
      if (!label || !RATING_LABEL.test(label) || !/\b[1-5]\b/.test(label)) continue;
      const level = this.starLevelFromLabel(label);
      if (level === null || found[level] !== undefined) continue;
      const count = this.reviewCountFromHistogramLabel(label);
      if (count !== null) found[level] = count;
    }
    const present = ([5, 4, 3, 2, 1] as const).filter((lvl) => found[lvl] !== undefined);
    if (present.length < 2) return null;
    return { 5: found[5] ?? 0, 4: found[4] ?? 0, 3: found[3] ?? 0, 2: found[2] ?? 0, 1: found[1] ?? 0 };
  }

  private starLevelFromLabel(label: string): 1 | 2 | 3 | 4 | 5 | null {
    const stars = /(star|stars|étoile|étoiles|estrella|estrellas|stern|sterne|stella|stelle|نجم|نجوم)/i;
    const match = label.match(new RegExp(`\\b([1-5])\\b[^0-9%]{0,12}${stars.source}`, 'i'))
      ?? label.match(new RegExp(`${stars.source}[^0-9%]{0,12}\\b([1-5])\\b`, 'i'));
    const digit = match?.[1] && /^[1-5]$/.test(match[1]) ? match[1] : match?.[2];
    return digit && /^[1-5]$/.test(digit) ? (Number(digit) as 1 | 2 | 3 | 4 | 5) : null;
  }

  // A histogram bar's count is the number tied to a "reviews"/"ratings" word
  // ("5 stars, 1,234 reviews" / "5 étoiles, 1 234 avis"). We deliberately do NOT
  // guess a count from a bare number or a percentage, so the overall-rating
  // label ("4.5 out of 5 stars") can never be mistaken for a 5-star row count.
  private reviewCountFromHistogramLabel(label: string): number | null {
    const tied = label.match(new RegExp(`([\\d][\\d.,\\s\\u00a0]*)\\s*(?:${REVIEWS_LABEL.source})`, 'i'))?.[1];
    const digits = tied ? tied.replace(/[^\d]/g, '') : '';
    if (!digits) return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Place-page photos (hero + gallery) come from googleusercontent/ggpht. We skip
  // reviewer avatars and tiny icons, and return absolute URLs only. Best-effort —
  // an empty list simply means the page exposed no usable photo.
  private extractPhotos(root: Element, max = 8): string[] {
    const urls = new Set<string>();
    const isPhotoHost = (value: string) => /(googleusercontent\.com|ggpht\.com)/i.test(value);
    const isJunk = (value: string) => /\/a[/-]|=s(?:16|24|32|40|48|56|64)\b|avatar|profile_photo|gstatic\.com\/(?:images|maps\/?)/i.test(value);
    for (const img of [...root.querySelectorAll<HTMLImageElement>('img[src]')]) {
      const src = img.getAttribute('src') ?? '';
      if (!isPhotoHost(src) || isJunk(src)) continue;
      if (img.naturalWidth > 0 && img.naturalWidth < 60) continue;
      const abs = this.absoluteUrl(src);
      if (abs) urls.add(abs);
      if (urls.size >= max) return [...urls];
    }
    for (const node of [...root.querySelectorAll<HTMLElement>('[style*="googleusercontent"], [style*="ggpht"]')]) {
      const match = node.getAttribute('style')?.match(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/i);
      if (match && isPhotoHost(match[2]) && !isJunk(match[2])) {
        const abs = this.absoluteUrl(match[2]);
        if (abs) urls.add(abs);
        if (urls.size >= max) break;
      }
    }
    return [...urls].slice(0, max);
  }

  private absoluteUrl(value: string): string | null {
    try {
      const base = typeof location === 'undefined' ? 'https://www.google.com/maps' : location.href;
      const url = new URL(value, base);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  private extractPlaceIdentifier(url: string): string | null {
    try {
      const baseUrl = typeof location === 'undefined' ? 'https://www.google.com/maps' : location.href;
      const parsed = new URL(url, baseUrl);
      const parameter = ['query_place_id', 'place_id', 'ftid', 'cid']
        .map((name) => parsed.searchParams.get(name))
        .find(Boolean);
      if (parameter) return parameter;
    } catch { /* data token fallback below */ }
    const token = url.match(/!(?:1s|16s)([^!]+)/)?.[1];
    if (!token) return null;
    try { return decodeURIComponent(token); } catch { return token; }
  }

  private looksLikeDomain(value: string): boolean {
    try {
      if (/\s/.test(value.trim())) return false;
      const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return parsed.hostname.includes('.') && !/google\./i.test(parsed.hostname);
    } catch { return false; }
  }

  private websiteFromText(lines: string[]): string | null {
    const line = lines.find((value) => this.looksLikeDomain(value));
    if (!line || /google\./i.test(line)) return null;
    return /^https?:\/\//i.test(line) ? line.trim() : `https://${line.trim()}`;
  }

  private searchBoxValue(): string | null {
    const input = document.querySelector<HTMLInputElement>('input[aria-label*="Search" i], input[placeholder*="Search" i]');
    return input?.value?.trim() || null;
  }

  private findDetailByLabel(labels: string[]): string | null {
    const nodes = [...document.querySelectorAll<HTMLElement>('[aria-label], button, div')];
    const node = nodes.find((item) => labels.some((label) => item.getAttribute('aria-label')?.toLowerCase().includes(label)));
    return node?.getAttribute('aria-label')?.replace(/^.*?:\s*/, '').trim() || null;
  }

  private dataItemValue(root: Element, itemId: string): string | null {
    const node = root.querySelector<HTMLElement>(`[data-item-id="${itemId}"], [data-item-id^="${itemId}:"]`);
    if (!node) return null;
    const dataId = node.getAttribute('data-item-id') || '';
    if (itemId === 'phone' && dataId.startsWith('phone:tel:')) return this.decodeValue(dataId.slice('phone:tel:'.length)) || null;
    const label = node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '';
    return this.valueFromLabel(label) || null;
  }

  private phoneFromElement(root: Element): string | null {
    const tel = root.querySelector<HTMLAnchorElement>('a[href^="tel:"]')?.getAttribute('href')?.slice(4);
    if (tel) return this.decodeValue(tel);
    return this.dataItemValue(root, 'phone');
  }

  private decodeValue(value: string): string {
    try { return decodeURIComponent(value).trim(); } catch { return value.trim(); }
  }

  private websiteFromElement(root: Element): string | null {
    const candidates = [...root.querySelectorAll<HTMLAnchorElement>('a[data-item-id="authority"], a[href]')];
    for (const anchor of candidates) {
      const label = `${anchor.textContent || ''} ${anchor.getAttribute('aria-label') || ''} ${anchor.getAttribute('data-item-id') || ''}`;
      if (anchor.getAttribute('data-item-id') !== 'authority' && !WEBSITE_LABEL.test(label)) continue;
      try {
        const parsed = new URL(anchor.href, location.href);
        if (/(^|\.)google\./i.test(parsed.hostname)) {
          const target = parsed.searchParams.get('q') || parsed.searchParams.get('url');
          if (!target) continue;
          const targetUrl = new URL(target);
          if (/^https?:$/.test(targetUrl.protocol)) return targetUrl.href;
          continue;
        }
        if (/^https?:$/.test(parsed.protocol)) return parsed.href;
      } catch { /* inspect the next candidate */ }
    }
    return null;
  }

  private categoryFromElement(root: Element): string | null {
    const node = root.querySelector<HTMLElement>('.DkEaL, button[jsaction*="category"], [data-item-id="category"]');
    const value = node?.textContent?.replace(/\s+/g, ' ').trim() || null;
    // Place pages render "Hotel · 3-star hotel · $$" in one node; the category is
    // the first segment.
    return value ? value.split('·')[0].trim() || value : null;
  }

  // Fallback when no category element is present (most search-result cards). Pick
  // the first line that looks like a business CATEGORY, deliberately rejecting the
  // address, rating, review count, price, open/closed status, phone and website —
  // the lines that the old "first text line with a letter" heuristic wrongly grabbed
  // and surfaced in the CRM as the business "type".
  private categoryFromLines(lines: string[], name: string): string | null {
    const STATUS = /^(open|closed|opens?|closes?|temporarily|permanently|open 24 hours|24 hours|directions|website|call|share|save|order online|dine-in|dine in|takeaway|take-?out|delivery|curbside|in-store shopping|visit site|sponsored|ad|results|reviews?|rating)\b/i;
    for (const raw of lines) {
      const line = raw.replace(/^·\s*/, '').split('·')[0].replace(/\s+/g, ' ').trim();
      if (!line || line === name) continue;
      if (line.length < 2 || line.length > 48) continue;
      if (!/\p{L}/u.test(line)) continue;
      if ((line.match(/\d/g) || []).length >= 3) continue; // address / phone / postal
      if (/^\d(?:[.,]\d)?$/.test(line)) continue; // a bare rating
      if (/\(\s*[\d.,\s]+\s*\)/.test(line)) continue; // a review count "(1,234)"
      if (/[$€£₹₨]|^\$+$/.test(line)) continue; // price tier
      if (/\b\d{4,6}\b/.test(line)) continue; // postal code embedded in an address
      if (/^\+?\d[\d ()\-.]{5,}/.test(line)) continue; // phone number
      if (STATUS.test(line)) continue;
      if (this.looksLikeDomain(line)) continue;
      return line;
    }
    return null;
  }

  private findScrollableResultsContainer(): HTMLElement | null {
    const candidates = [...document.querySelectorAll<HTMLElement>('div')]
      .filter((node) => node.scrollHeight > node.clientHeight + 100 && node.clientHeight > 200 && node.clientWidth > 220)
      .map((node) => ({
        node,
        placeLinks: node.querySelectorAll(PLACE_LINK).length,
        visibleArea: node.clientWidth * node.clientHeight
      }))
      .filter((item) => item.placeLinks > 0)
      .sort((a, b) => (b.placeLinks * 1_000_000 + b.visibleArea) - (a.placeLinks * 1_000_000 + a.visibleArea));
    return candidates[0]?.node ?? null;
  }

  private resultsContainer(): HTMLElement | null {
    const root = this.resultListRoot();
    const feeds = root ? [root] : [];
    const feedContainers = feeds.flatMap((feed) => {
      const candidates: HTMLElement[] = [];
      let node: HTMLElement | null = feed;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 20 && node.clientHeight > 200 && node.querySelector(PLACE_LINK)) candidates.push(node);
      }
      return candidates;
    }).sort((a, b) => b.querySelectorAll(PLACE_LINK).length - a.querySelectorAll(PLACE_LINK).length);
    return feedContainers[0] ?? this.findScrollableResultsContainer() ?? feeds[0] ?? null;
  }

  private resultFeedRoot(): HTMLElement | null {
    return [...document.querySelectorAll<HTMLElement>('[role="feed"]')]
      .filter((node) => node.querySelector(PLACE_LINK) && node.clientHeight > 100)
      .sort((a, b) => {
        const visibleLinks = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(PLACE_LINK)]
          .filter((link) => { const rect = link.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).length;
        return visibleLinks(b) - visibleLinks(a);
      })[0] ?? null;
  }

  private resultListRoot(): HTMLElement | null {
    return this.resultFeedRoot()
      ?? (/\/maps\/search\//.test(location.pathname) ? this.findScrollableResultsContainer() : null);
  }

  private scrollState(feed: HTMLElement | null, changed: boolean): MapsScrollState {
    const records = this.getResultLinks()
      .map((anchor) => this.extractBusinessSummary(anchor))
      .filter((record): record is RawBusinessRecord => Boolean(record));
    const visibleKeys = records.map(resultKeyForMapRecord);
    const text = feed?.textContent ?? document.body.textContent ?? '';
    const endConfirmed = /you(?:'|’)?ve reached the end|end of (?:the )?(?:list|results)|no more results|no additional results/i.test(text);
    const scrollTop = feed?.scrollTop ?? 0;
    const scrollHeight = feed?.scrollHeight ?? 0;
    const clientHeight = feed?.clientHeight ?? 0;
    return {
      changed,
      atEnd: Boolean(feed) && scrollTop + clientHeight >= scrollHeight - 8,
      endConfirmed,
      scrollTop,
      scrollHeight,
      clientHeight,
      visibleResultCount: records.length,
      firstVisibleResultKey: visibleKeys[0] ?? null,
      lastVisibleResultKey: visibleKeys.at(-1) ?? null
    };
  }
}

// Keep the content-script entry self-contained. Chrome loads manifest content
// scripts as classic scripts, so this identity helper intentionally mirrors the
// background implementation without introducing a static ESM import/chunk.
function resultKeyForMapRecord(record: RawBusinessRecord): string {
  const normalizeText = (value: string | null | undefined) => (value ?? '')
    .normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (record.placeIdentifier) return `place:${normalizeText(record.placeIdentifier)}`;
  if (record.googleMapsUrl) {
    try {
      const url = new URL(record.googleMapsUrl, 'https://www.google.com');
      const parameter = ['query_place_id', 'place_id', 'ftid', 'cid']
        .map((name) => url.searchParams.get(name))
        .find(Boolean);
      if (parameter) return `maps:id:${normalizeText(parameter)}`;
      const token = record.googleMapsUrl.match(/!(?:1s|16s)([^!]+)/)?.[1];
      if (token) {
        let decoded = token;
        try { decoded = decodeURIComponent(token); } catch { /* retain the stable raw token */ }
        return `maps:id:${normalizeText(decoded)}`;
      }
      const place = url.pathname.match(/\/maps\/place\/([^/]+)/i)?.[1];
      if (place) {
        const coordinates = record.googleMapsUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
        const geo = coordinates ? `|${Number(coordinates[1]).toFixed(5)},${Number(coordinates[2]).toFixed(5)}` : '';
        let decodedPlace = place.replace(/\+/g, ' ');
        try { decodedPlace = decodeURIComponent(decodedPlace); } catch { /* retain the URL-safe name */ }
        return `maps:name:${normalizeText(decodedPlace)}${geo}`;
      }
    } catch { /* field-based fallback below */ }
  }
  const name = normalizeText(record.businessName);
  const phone = (record.phone ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+');
  const address = normalizeText(record.address);
  if (name && (phone || address)) return `contact:${name}|${phone}|${address}`;
  let domain = '';
  try { if (record.website) domain = new URL(record.website.startsWith('http') ? record.website : `https://${record.website}`).hostname.replace(/^www\./i, '').toLowerCase(); } catch { /* coordinate fallback */ }
  if (name && domain) return `domain:${name}|${domain}`;
  return `fallback:${name}|${record.latitude?.toFixed(5) ?? ''}|${record.longitude?.toFixed(5) ?? ''}`;
}
