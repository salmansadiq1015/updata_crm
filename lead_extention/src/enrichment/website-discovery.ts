import { MAX_PAGE_BYTES } from '../shared/constants';
import { isValidEmail, normalizeEmail, normalizeUrl } from '../shared/utils';

export interface EnrichmentResult {
  emails: string[];
  emailSource: string | null;
  emailConfidence: 'high' | 'medium' | 'low' | null;
  pagesVisited: string[];
}

const CONTACT_HINTS = /contact|about|connect|reach|support|team/i;

export async function discoverPublicEmails(website: string, maxPages: number, signal?: AbortSignal): Promise<EnrichmentResult> {
  const root = new URL(website);
  if (!/^https?:$/.test(root.protocol)) throw new Error('Only public HTTP(S) websites can be enriched.');
  const queue = [root.href];
  const visited = new Set<string>();
  const emails = new Set<string>();
  let source: string | null = null;

  while (queue.length && visited.size < Math.max(1, Math.min(maxPages, 5))) {
    if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError');
    const current = queue.shift()!;
    const normalized = normalizeUrl(current);
    if (visited.has(normalized)) continue;
    visited.add(normalized);
    try {
      const response = await fetch(current, { signal, redirect: 'follow' });
      if (!response.ok) continue;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) continue;
      const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
      const pageEmails = extractEmails(`${stripHtml(html)}\n${extractLinks(html).map((link) => link.href).join('\n')}`);
      if (pageEmails.length && !source) source = new URL(current).pathname || '/';
      pageEmails.forEach((email) => emails.add(email));
      if (visited.size < maxPages) {
        for (const link of extractLinks(html)) {
          if (!CONTACT_HINTS.test(`${link.text} ${link.href}`)) continue;
          const candidate = new URL(link.href, current);
          if (candidate.origin === root.origin && /^https?:$/.test(candidate.protocol)) queue.push(candidate.href);
        }
      }
    } catch {
      // Public websites can reject extension fetches or have broken markup; skip and retain local results.
    }
  }
  return {
    emails: [...emails],
    emailSource: source ? `website${source}` : null,
    emailConfidence: emails.size ? 'high' : null,
    pagesVisited: [...visited]
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function extractLinks(html: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(regex)) links.push({ href: match[1], text: stripHtml(match[2]) });
  return links;
}

export function extractEmails(text: string): string[] {
  const normalizedText = text
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, '@')
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, '.');
  const candidates = normalizedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(candidates.map(normalizeEmail).filter((email): email is string => Boolean(email && isValidEmail(email))))];
}
