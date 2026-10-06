import type { MapsContext, MapsScrollState, RawBusinessRecord } from '../shared/types';

const PLACE_LINK = 'a[href*="/maps/place/"]';

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
    const lines = this.visibleLines(card);
    const labelled = this.labelledValues(card);
    const businessName = this.cleanName(anchor.getAttribute('aria-label') || lines[0] || anchor.textContent || '');
    if (!businessName) return null;
    const href = anchor.href;
    const ratingLine = labelled.rating || lines.find((line) => /\b\d(?:\.\d)?\b/.test(line) && /\(?\d[\d,.]*\)?/.test(line)) || '';
    const rating = this.parseRating(ratingLine);
    const reviewCount = this.parseReviewCount(labelled.reviews || ratingLine);
    const phone = labelled.phone || lines.find((line) => /(?:\+?\d[\d ()\-().]{6,}\d)/.test(line)) || null;
    const websiteAnchor = [...card.querySelectorAll<HTMLAnchorElement>('a[href]')].find((item) => {
      try {
        const label = `${item.textContent || ''} ${item.getAttribute('aria-label') || ''}`;
        return (/website|web site|site|official/i.test(label) || /^https?:/i.test(item.href)) && !/google\./i.test(new URL(item.href).hostname);
      } catch {
        return false;
      }
    });
    const website = websiteAnchor?.href ?? labelled.website ?? this.websiteFromText(lines);
    const address = labelled.address || lines.find((line) => line.length > 12 && line !== businessName && !/^\d(?:\.\d)?$/.test(line) && !/reviews?|rating|stars?/i.test(line) && !/(open|closed|website|directions|call|sponsored|free parking|free breakfast|free wi.?fi|air.conditioned)/i.test(line) && !this.looksLikeDomain(line)) || null;
    return {
      businessName,
      category: lines.find((line) => line !== businessName && !/^(sponsored|visit site)$/i.test(line) && line.length < 80 && /[a-z]/i.test(line)) ?? null,
      phone,
      website,
      address,
      ...this.addressParts(address),
      rating,
      reviewCount,
      googleMapsUrl: href,
      placeIdentifier: this.extractPlaceIdentifier(href),
      latitude: null,
      longitude: null
    };
  }

  extractBusinessDetails(): RawBusinessRecord | null {
    const title = document.querySelector<HTMLElement>('h1')?.textContent?.trim() ?? '';
    if (!title) return null;
    const lines = this.visibleLines(document.body);
    const labelled = this.labelledValues(document.body);
    const websiteAnchor = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find((item) => {
      try {
        return /^https?:/i.test(item.href) && !/google\./i.test(new URL(item.href).hostname) && /website|web/i.test(`${item.textContent} ${item.getAttribute('aria-label')}`);
      } catch {
        return false;
      }
    });
    const ratingLine = labelled.rating || lines.find((line) => /\d(?:\.\d)?\s*\(/.test(line)) || '';
    return {
      businessName: title,
      category: lines.find((line) => line !== title && line.length < 80 && /[a-z]/i.test(line)) ?? null,
      phone: labelled.phone || lines.find((line) => /(?:\+?\d[\d ()\-().]{6,}\d)/.test(line)) || null,
      website: websiteAnchor?.href ?? labelled.website ?? null,
      address: labelled.address || this.findDetailByLabel(['address', 'adresse', 'العنوان']),
      rating: this.parseRating(ratingLine),
      reviewCount: this.parseReviewCount(labelled.reviews || ratingLine),
      businessStatus: lines.find((line) => /open|closed|temporarily/i.test(line)) ?? null,
      openingHours: lines.filter((line) => /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i.test(line)).slice(0, 14),
      googleMapsUrl: location.href,
      placeIdentifier: this.extractPlaceIdentifier(location.href),
      latitude: null,
      longitude: null
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
    const wasAtEnd = before + feed.clientHeight >= feed.scrollHeight - 8;
    const target = Math.min(feed.scrollTop + Math.max(feed.clientHeight * 0.85, 650), Math.max(0, feed.scrollHeight - feed.clientHeight));
    if (!wasAtEnd && target > before) {
      feed.scrollTo({ top: target, behavior: 'auto' });
      feed.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    if (!wasAtEnd && feed.scrollTop <= before) {
      const last = this.getResultLinks().at(-1);
      last?.scrollIntoView({ block: 'end', behavior: 'auto' });
      feed.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.max(feed.clientHeight, 650), bubbles: true }));
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

  private visibleLines(element: Element): string[] {
    return [...element.querySelectorAll<HTMLElement>('*')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && node.children.length === 0;
      })
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
      .filter((line, index, lines) => lines.indexOf(line) === index)
      .slice(0, 30);
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
    const phoneLabel = by(/\b(phone|telephone|tel|call)\b/i);
    const websiteLabel = by(/\b(website|web site|official site)\b/i);
    const addressLabel = by(/\b(address|location|adresse)\b/i);
    const ratingLabel = by(/\b(rating|stars?|out of 5)\b/i);
    const reviewsLabel = by(/\b(reviews?|ratings?)\b/i);
    return {
      phone: phoneLabel ? this.valueFromLabel(phoneLabel) : null,
      website: websiteLabel && this.looksLikeDomain(this.valueFromLabel(websiteLabel)) ? this.normalizeWebsite(this.valueFromLabel(websiteLabel)) : null,
      address: addressLabel ? this.valueFromLabel(addressLabel) : null,
      rating: ratingLabel,
      reviews: reviewsLabel
    };
  }

  private valueFromLabel(value: string): string {
    const cleaned = value.replace(/^[^:]+:\s*/, '').replace(/^\s*(?:website|web site|official site)\s*/i, '').trim();
    return /^(phone|telephone|tel|call|website|web site|official site|address|location|adresse|rating|stars?)$/i.test(cleaned) ? '' : cleaned;
  }

  private normalizeWebsite(value: string): string {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }

  private addressParts(address: string | null): Pick<RawBusinessRecord, 'street' | 'area' | 'city' | 'postalCode'> {
    if (!address) return { street: null, area: null, city: null, postalCode: null };
    const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
    return {
      street: parts[0] ?? null,
      area: parts[1] ?? null,
      city: parts[2] ?? null,
      postalCode: address.match(/\b\d{4,6}\b/)?.[0] ?? null
    };
  }

  private coordinatesFromUrl(value: string): { latitude: number; longitude: number } | null {
    const match = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }

  private parseRating(value: string): number | null {
    const match = value.match(/\b([1-5](?:\.\d)?)\b/);
    return match ? Number(match[1]) : null;
  }

  private parseReviewCount(value: string): number | null {
    const match = value.match(/\(\s*([\d,.]+)\s*\)|\b([\d,.]+)\s*(?:reviews?|ratings?|مراجعة)/i);
    const raw = match?.[1] ?? match?.[2];
    return raw ? Number(raw.replace(/,/g, '')) : null;
  }

  private extractPlaceIdentifier(url: string): string | null {
    const match = url.match(/!1s([^!]+)/);
    return match?.[1] ?? null;
  }

  private looksLikeDomain(value: string): boolean {
    return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(value.trim());
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
    const token = record.googleMapsUrl.match(/!1s([^!]+)/)?.[1];
    if (token) return `maps:id:${normalizeText(decodeURIComponent(token))}`;
    try {
      const url = new URL(record.googleMapsUrl, 'https://www.google.com');
      const place = url.pathname.match(/\/maps\/place\/([^/]+)/i)?.[1];
      if (place) {
        const coordinates = record.googleMapsUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
        const geo = coordinates ? `|${Number(coordinates[1]).toFixed(5)},${Number(coordinates[2]).toFixed(5)}` : '';
        return `maps:name:${normalizeText(decodeURIComponent(place.replace(/\+/g, ' ')))}${geo}`;
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
