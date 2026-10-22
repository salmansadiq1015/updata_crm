/**
 * Default SMS templates for the link assistant and placeholder rendering.
 * Placeholders: {name} {city} {company} {link}. Urdu-script and Arabic templates
 * are UCS-2 (70 characters per segment), so they are kept deliberately short.
 */
import { smsEncoding, smsSegments } from '../../simSms/engine/smsCopy.js';

export const DEFAULT_SMS_TEMPLATES = Object.freeze({
  en: 'Hi {name}, {company} here. Please answer 3 quick questions: {link}',
  roman_ur: 'Assalam o Alaikum {name}, {company} ki taraf se. 2 minute ke sawal: {link}',
  ur: 'السلام علیکم {name}، {company}۔ چند سوالات: {link}',
  fr: 'Bonjour {name}, ici {company}. 3 questions rapides : {link}',
  de: 'Hallo {name}, hier ist {company}. 3 kurze Fragen: {link}',
  ar: 'مرحبا {name}، {company}. أسئلة سريعة: {link}',
});

export const PLACEHOLDERS = Object.freeze(['name', 'city', 'company', 'link']);

/** Fill placeholders; an empty value never leaves a dangling space before punctuation. */
export function renderTemplate(template, values = {}) {
  return String(template || '')
    .replace(/\{(\w+)\}/g, (match, key) => (PLACEHOLDERS.includes(key) ? String(values[key] ?? '').trim() : match))
    .replace(/[ \t]+([,.!?،۔:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function unknownPlaceholders(template) {
  const found = [...String(template || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(found)].filter((k) => !PLACEHOLDERS.includes(k));
}

export function hasLinkPlaceholder(template) {
  return /\{link\}/.test(String(template || ''));
}

/** Preview stats with a representative link so the segment count is realistic. */
export function templateStats(template, values = {}, sampleLink = 'https://updata.behjja.com/c/0123456789abcdefABCDEF') {
  const text = renderTemplate(template, { link: sampleLink, ...values });
  return {
    text,
    characters: [...text].length,
    encoding: smsEncoding(text),
    segments: smsSegments(text),
    missingLink: !hasLinkPlaceholder(template),
    unknownPlaceholders: unknownPlaceholders(template),
  };
}
