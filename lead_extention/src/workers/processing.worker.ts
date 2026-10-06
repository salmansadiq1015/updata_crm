import { dedupeKey, isSameLead } from '../shared/normalize';
import type { Lead } from '../shared/types';

self.onmessage = (event: MessageEvent<{ type: 'dedupe'; leads: Lead[] }>) => {
  if (event.data.type !== 'dedupe') return;
  const seen = new Set<string>();
  const unique: Lead[] = [];
  event.data.leads.forEach((lead) => {
    const key = dedupeKey(lead);
    if (seen.has(key) || unique.some((existing) => isSameLead(existing, lead))) return;
    seen.add(key);
    unique.push(lead);
  });
  self.postMessage({ type: 'dedupe-result', unique });
};
