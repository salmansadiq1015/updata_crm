/**
 * Deterministic intent and language detection for customer chat messages
 * (English, Urdu script, Roman Urdu). Safety-relevant intents — opt-out, asking
 * for a human, asking whether this is a human — are decided here, never by a
 * model, so they are predictable and auditable.
 */
import { isStopRequest } from '../../simSms/engine/smsCopy.js';

const norm = (text) => String(text || '').normalize('NFKC').toLowerCase()
  .replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

const OPT_OUT = [
  /\b(do ?n'?t|do not|never|stop) (contact|call|message|text|sms|email|bother|disturb)(ing)? me\b/,
  /\bunsubscribe\b/,
  /\bremove (me|my (number|details|data))\b/,
  /\bopt[ -]?out\b/,
  /\bno more (messages|sms|texts|calls)\b/,
  /\b(contact|call|message|msg|sms|rabta|raabta|tang|pareshan) (na|mat|nah) karo\b/,
  /\b(contact|call|message|msg|sms|rabta|raabta) (na|mat) (karen|kijiye|kariye|karna)\b/,
  /\b(band karo|band kar do|mat bhejo|mat bhejna|dobara (na|mat))\b/,
  /\b(mujhe|mujh ko|hamein) (contact|call|message|tang) (na|mat)\b/,
  /(رابطہ|میسج|پیغام|کال) (نہ|مت) (کریں|کرو|بھیجیں|بھیجو)/,
  /(تنگ|پریشان) (نہ|مت) کریں/,
  /(بند کریں|بند کرو)/,
];

const HUMAN = [
  /\b(talk|speak|chat) (to|with) (a |an |real |actual )*(human|person|agent|representative|someone|somebody|staff|team)\b/,
  /\b(real|actual|live) (human|person|agent)\b/,
  /\b(human|agent|representative) please\b/,
  /\b(insaan|insan|banday|bande|kisi aadmi|kisi admi|asli aadmi|agent) (se|say) baat\b/,
  /(انسان|نمائندے|ایجنٹ|کسی بندے) سے بات/,
];

const ARE_YOU_HUMAN = [
  /\bare (you|u) (a |an )?(human|person|real|bot|robot|machine|ai|computer)\b/,
  /\b(is this|am i talking to|am i chatting with) (a |an )?(human|person|real person|bot|robot|machine|ai)\b/,
  /\b(kya )?(aap|ap|tum) (insaan|insan|robot|bot|machine|ai|asli) (ho|hain|hai|hn)\b/,
  /(کیا آپ|کیا تم) (انسان|روبوٹ|مشین)/,
];

const BUSY = [
  /\b(i'?m|i am|am) (busy|driving|at work|in a meeting|not free)\b/,
  /^(busy|later|not now|call me later|text me later)\b/,
  /\b(talk|chat|do this|continue) later\b/,
  /\b(abhi|abi) (nahi|nahin|nai|busy|masroof)\b/,
  /\b(baad mein|baad me|bad mein|bad me) (baat|karte|karenge|karna)\b/,
  /\b(masroof|busy) (hoon|hun|hu|hain)\b/,
  /(مصروف ہوں|بعد میں|ابھی نہیں)/,
];

const any = (patterns, text) => patterns.some((re) => re.test(text));

/**
 * @returns {'opt_out'|'human'|'are_you_human'|'busy'|null}
 * Order matters: opt-out wins over everything.
 */
export function detectIntent(text) {
  const t = norm(text);
  if (!t) return null;
  if (isStopRequest(t) || any(OPT_OUT, t)) return 'opt_out';
  if (any(HUMAN, t)) return 'human';
  if (any(ARE_YOU_HUMAN, t)) return 'are_you_human';
  if (any(BUSY, t)) return 'busy';
  return null;
}

const URDU_SCRIPT = /[؀-ۿݐ-ݿ]/;
const ROMAN_URDU_WORDS = new Set([
  'hai', 'hain', 'haan', 'han', 'ji', 'jee', 'nahi', 'nahin', 'nai', 'kya', 'kia', 'aap', 'ap', 'mera', 'meri',
  'mujhe', 'hum', 'hamara', 'theek', 'thik', 'acha', 'achha', 'shukriya', 'bilkul', 'kitna', 'kitne', 'kab',
  'kahan', 'kyun', 'kyu', 'karo', 'karna', 'karte', 'hoon', 'hun', 'raha', 'rahi', 'wala', 'wali', 'abhi',
  'baad', 'mein', 'se', 'ka', 'ki', 'ke', 'ko', 'bhai', 'janab', 'salam', 'assalam', 'walaikum',
]);

/** 'ur' for Urdu script, 'roman_ur' for Roman Urdu, otherwise 'en' (or null when undecidable). */
export function detectLanguage(text) {
  const raw = String(text || '');
  if (URDU_SCRIPT.test(raw)) return 'ur';
  const words = norm(raw).replace(/[^\p{L} ]/gu, ' ').split(' ').filter(Boolean);
  if (!words.length) return null;
  const hits = words.filter((w) => ROMAN_URDU_WORDS.has(w)).length;
  if (hits >= 2 || (words.length <= 3 && hits >= 1 && words.length === hits)) return 'roman_ur';
  return /[a-z]/.test(norm(raw)) ? 'en' : null;
}

/** First name for a friendly greeting; businesses ("Bilal Traders") keep the full name. */
export function greetingName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean || '';
}
