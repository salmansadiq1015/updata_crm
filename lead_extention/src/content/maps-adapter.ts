import type { MapsContext, RawBusinessRecord } from '../shared/types';

const PLACE_LINK = 'a[href*="/maps/place/"]';

export class MapsAdapter {
  detectMapsPage(): boolean {
    return /(^|\.)google\.[^/]+$/.test(location.hostname) && location.pathname.startsWith('/maps');
  }

  detectSearchResults(): boolean {
    return this.getResultLinks().length > 0 || Boolean(document.querySelector('[role="feed"]'));
  }

  detectBusinessListing(): boolean {
    return /\/maps\/place\//.test(location.pathname) && !this.detectSearchResults();
  }

  getResultLinks(): HTMLAnchorElement[] {
    return [...document.querySelectorAll<HTMLAnchorElement>(PLACE_LINK)].filter((anchor) => {
      const rect = anchor.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
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

  scrollResults(): { changed: boolean; atEnd: boolean } {
    const feed = document.querySelector<HTMLElement>('[role="feed"]') ?? this.findScrollableResultsContainer();
    if (!feed) return { changed: false, atEnd: true };
    const before = feed.scrollTop;
    feed.scrollTop = Math.min(feed.scrollTop + Math.max(feed.clientHeight * 0.85, 650), feed.scrollHeight);
    const changed = feed.scrollTop !== before;
    const atEnd = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 8;
    return { changed, atEnd };
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
    return [...document.querySelectorAll<HTMLElement>('div')]
      .filter((node) => node.scrollHeight > node.clientHeight + 100)
      .sort((a, b) => a.clientWidth * a.clientHeight - b.clientWidth * b.clientHeight)[0] ?? null;
  }
}
