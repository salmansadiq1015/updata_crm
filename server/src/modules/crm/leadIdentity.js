import { createHash } from 'node:crypto';
import { normalizeCountryCode } from './leadGeography.js';

const clean = (value) => typeof value === 'string' ? value.normalize('NFKC').trim() : '';
const text = (value) => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const key = (kind, value) => `${kind}:${createHash('sha256').update(value).digest('hex')}`;
const mapsHost = /^(?:(?:www|maps)\.)?google\.(?:com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i;

export function mapsUrls(lead = {}) {
  const noteUrl = typeof lead.notes === 'string' ? lead.notes.match(/^Google Maps:\s*(https?:\/\/\S+)/)?.[1] : null;
  return [lead.providerMeta?.mapsUrl, lead.googleMapsUrl, noteUrl].map(clean).filter(Boolean);
}

/** Google IDs remain case-sensitive. CID decimal and ftid hex share one alias. */
export function googleIdentityKeys(lead = {}) {
  const tokens = new Set();
  const add = (value) => {
    const id = clean(value);
    if (!id) return;
    tokens.add(`id:${id}`);
    if (/^\d+$/.test(id)) tokens.add(`cid:${BigInt(id).toString(16)}`);
    const hex = id.match(/^0x[0-9a-f]+:0x([0-9a-f]+)$/i);
    if (hex) tokens.add(`cid:${BigInt(`0x${hex[1]}`).toString(16)}`);
  };
  add(lead.sourceMetadata?.googlePlaceId ?? lead.placeIdentifier);
  for (const value of mapsUrls(lead)) {
    try {
      const url = new URL(value);
      if (!mapsHost.test(url.hostname) || !/^\/maps(?:\/|$)/.test(url.pathname)) continue;
      for (const parameter of ['query_place_id', 'place_id', 'ftid']) add(url.searchParams.get(parameter));
      const cid = url.searchParams.get('cid');
      if (cid && /^\d+$/.test(cid)) tokens.add(`cid:${BigInt(cid).toString(16)}`);
      for (const match of value.matchAll(/!(?:1s|16s)([^!?#]+)/g)) {
        try { add(decodeURIComponent(match[1])); } catch { add(match[1]); }
      }
    } catch { /* A name-only/invalid URL is not an identity. */ }
  }
  const savedAliases = Array.isArray(lead.sourceMetadata?.identityAliases)
    ? lead.sourceMetadata.identityAliases.filter((item) => /^maps:[a-f0-9]{64}$/.test(item)) : [];
  return [...new Set([...tokens].map((token) => key('maps', token)).concat(savedAliases))].sort();
}

/** Conservative branch evidence; never a name, shared phone, or domain alone. */
export function branchIdentityKeys(lead = {}) {
  if (lead.type === 'private') return [];
  const name = text(lead.name ?? lead.businessName);
  if (!name) return [];
  const address = lead.address && typeof lead.address === 'object' ? lead.address : {};
  const country = normalizeCountryCode(address.country ?? lead.country);
  const city = text(address.city ?? lead.city);
  const street = text(address.street ?? lead.street);
  const keys = [];
  if (street && /\p{L}/u.test(street) && city && country) keys.push(key('branch', `${name}|${street}|${city}|${country}`));
  // Only an explicit place pin qualifies. The @ coordinates in a Maps URL are
  // its camera and can be shared by many distinct businesses.
  for (const value of mapsUrls(lead)) {
    try {
      const url = new URL(value);
      if (!mapsHost.test(url.hostname) || !/^\/maps(?:\/|$)/.test(url.pathname)) continue;
    } catch { continue; }
    const pin = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (pin && Math.abs(Number(pin[1])) <= 90 && Math.abs(Number(pin[2])) <= 180) {
      keys.push(key('pin', `${name}|${Number(pin[1]).toFixed(6)}|${Number(pin[2]).toFixed(6)}`));
    }
  }
  return [...new Set(keys)].sort();
}

export function businessIdentityKeys(lead = {}) {
  if (lead.type === 'private') return [];
  const strong = googleIdentityKeys(lead);
  if (strong.length) return strong;
  // Manual/general file leads retain the existing duplicate-warning workflow.
  if (lead.source !== 'extension' && !mapsUrls(lead).length) return [];
  return branchIdentityKeys(lead);
}

export function sameBusinessIdentity(a, b) {
  const left = googleIdentityKeys(a); const right = googleIdentityKeys(b);
  if (left.some((item) => right.includes(item))) return true;
  // Distinct authoritative IDs are separate branches, even with shared phones.
  if (left.length && right.length) return false;
  const branch = branchIdentityKeys(a);
  return branch.some((item) => branchIdentityKeys(b).includes(item));
}

export function identityAfterPatch(current, patch) {
  const result = { ...current };
  for (const [path, value] of Object.entries(patch.$set ?? patch)) {
    const parts = path.split('.');
    let target = result;
    for (const part of parts.slice(0, -1)) { target[part] = { ...(target[part] ?? {}) }; target = target[part]; }
    target[parts.at(-1)] = value;
  }
  return businessIdentityKeys(result);
}

export const BUSINESS_IDENTITY_INDEX = {
  name: 'lead_business_identity_unique', unique: true,
  partialFilterExpression: { isDeleted: false, 'businessIdentityKeys.0': { $exists: true } },
};
