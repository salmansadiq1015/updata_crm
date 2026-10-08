import mongoose from 'mongoose';
import logger from '../shared/logger/index.js';

/**
 * Clear garbage websites stored before the website-validation fix. Old extension
 * scrapes captured a rating / IP-like number as the website (e.g.
 * "https://4.0.0.9/" or "https://4.3/"), where the host has no alphabetic TLD.
 * Such a value is not a real site, breaks the "Website" link, and poisons email
 * enrichment (which crawls the website). There is no way to recover the real
 * site from a bad value, so it is cleared to null; a re-scrape via the fixed
 * extension — or website enrichment on a corrected site — repopulates it.
 * `websiteDomain` (the dedup key) is cleared to match.
 *
 * Best-effort + idempotent: a lead whose website is already a real domain (or
 * already null) is left untouched.
 */

const VALID_HOST_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

function hostOf(website) {
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

export async function up() {
  const leads = mongoose.connection.db.collection('leads');
  const cursor = leads.find(
    { website: { $type: 'string', $ne: '' } },
    { projection: { _id: 1, website: 1 } },
  );

  let scanned = 0;
  let cleared = 0;
  for await (const lead of cursor) {
    scanned += 1;
    const host = hostOf(lead.website);
    if (host && VALID_HOST_RE.test(host)) continue; // a real domain — keep it
    await leads.updateOne({ _id: lead._id }, { $set: { website: null, websiteDomain: null } });
    cleared += 1;
  }

  logger.info(`012 clear-garbage-lead-websites: scanned ${scanned} lead(s), cleared ${cleared}`, { module: 'migration' });
}

// Non-destructive cleanup (garbage → null) — nothing to roll back.
export async function down() {}
