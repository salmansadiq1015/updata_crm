/**
 * Caller inquiry categories + a deterministic keyword fallback.
 *
 * The voice agent classifies each caller question while it talks (it understands context and
 * language far better than keywords). The keyword classifier only fills gaps — a question the
 * agent recorded without a category, or a call that ended before the agent could classify —
 * and is always marked `source: 'rules'` so nobody mistakes it for the agent's reading.
 */

export const INQUIRY_CATEGORIES = Object.freeze([
  'SALES_INQUIRY', 'PRODUCT_INQUIRY', 'SERVICE_INQUIRY', 'PRICING_INQUIRY', 'SUPPORT_REQUEST', 'TECHNICAL_SUPPORT',
  'APPOINTMENT_REQUEST', 'CALLBACK_REQUEST', 'COMPLAINT', 'GENERAL_INFORMATION', 'OTHER',
]);

export const SALES_INTENTS = new Set(['SALES_INQUIRY', 'PRODUCT_INQUIRY', 'SERVICE_INQUIRY', 'PRICING_INQUIRY', 'APPOINTMENT_REQUEST']);
export const SUPPORT_INTENTS = new Set(['SUPPORT_REQUEST', 'TECHNICAL_SUPPORT', 'COMPLAINT']);

// Ordered: the first category whose terms match wins. en / de / fr / es / ar / Darija (latin).
// A trailing * is a stem ("kost*" matches kostet, kosten). Boundaries are Unicode-aware, so
// Arabic script matches too (JS \b only knows ASCII word characters).
const TERMS = [
  ['COMPLAINT', ['complain*', 'unhappy', 'disappointed', 'terrible', 'refund*', 'beschwerde*', 'reklamation*', 'plainte*', 'mécontent*', 'queja*', 'reclamación', 'شكوى', 'شكاية', 'chikaya']],
  ['PRICING_INQUIRY', ['price*', 'pricing', 'cost', 'costs', 'how much', 'quote', 'quotation', 'rate*', 'fee*', 'budget', 'preis*', 'kost*', 'wie viel', 'angebot*', 'prix', 'tarif*', 'combien', 'devis', 'precio*', 'cuánto', 'cuanto', 'سعر', 'الثمن', 'بكم', 'chhal', 'bch7al', 'taman']],
  ['TECHNICAL_SUPPORT', ['error*', 'bug*', 'crash*', 'not working', "doesn't work", 'broken', 'login', 'password', 'fehler*', 'funktioniert nicht', 'panne*', 'erreur*', 'ne marche pas', 'no funciona', 'عطل', 'ma khdamch']],
  ['SUPPORT_REQUEST', ['help', 'support', 'issue*', 'problem*', 'hilfe', 'aide', 'problème*', 'ayuda', 'مساعدة', 'مشكل*', 'mochkil*']],
  ['APPOINTMENT_REQUEST', ['appointment*', 'meeting*', 'book', 'schedule', 'demo', 'visit', 'termin*', 'treffen', 'rendez-vous', 'réunion', 'cita', 'reunión', 'موعد', 'maw3id']],
  ['CALLBACK_REQUEST', ['call me back', 'call back', 'callback', 'ring me', 'zurückrufen', 'rückruf*', 'rappeler', 'rappel*', 'devolver la llamada', 'اتصل بي', '3iyet liya']],
  ['PRODUCT_INQUIRY', ['product*', 'feature*', 'model*', 'version*', 'produkt*', 'funktion*', 'produit*', 'fonctionnalité*', 'producto*', 'منتج']],
  ['SERVICE_INQUIRY', ['service*', 'develop*', 'build', 'install*', 'repair*', 'maintenance', 'dienstleistung*', 'entwickl*', 'wartung', 'prestation*', 'développ*', 'servicio*', 'desarroll*', 'خدمة', 'khedma']],
  ['SALES_INQUIRY', ['buy', 'purchase', 'order', 'interested', 'kaufen', 'bestell*', 'interessiert', 'acheter', 'commander', 'intéressé*', 'comprar', 'interesad*', 'شراء', 'بغيت نشري']],
  ['GENERAL_INFORMATION', ['open', 'opening hours', 'address', 'where', 'located', 'who are you', 'öffnungszeiten', 'adresse', 'wo', 'horaires', 'où', 'horario*', 'dónde', 'عنوان', 'فين']],
];
const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = TERMS.map(([category, words]) => [category, new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${words.map((w) => (w.endsWith('*') ? `${esc(w.slice(0, -1))}[\\p{L}]*` : esc(w))).join('|')})(?![\\p{L}\\p{N}])`, 'iu',
)]);

export function classifyText(text) {
  const t = String(text || '');
  if (!t.trim()) return 'OTHER';
  for (const [category, re] of PATTERNS) if (re.test(t)) return category;
  return 'OTHER';
}

export function normalizeCategory(value) {
  const v = String(value || '').trim().toUpperCase();
  return INQUIRY_CATEGORIES.includes(v) ? v : null;
}

/**
 * Merge the agent's stated intent with the categories of the recorded questions.
 * Returns { primary, secondary[], source }.
 */
export function resolveIntents({ agentIntent = null, questions = [], callbackRequested = false, humanRequested = false }) {
  const counts = new Map();
  const bump = (c, w = 1) => { if (c) counts.set(c, (counts.get(c) || 0) + w); };
  for (const q of questions) bump(normalizeCategory(q.category) || classifyText(q.text));
  if (callbackRequested) bump('CALLBACK_REQUEST');
  const agentPrimary = normalizeCategory(agentIntent?.primary);
  const agentSecondary = (agentIntent?.secondary || []).map(normalizeCategory).filter(Boolean);
  for (const s of agentSecondary) bump(s);
  let primary = agentPrimary;
  let source = agentPrimary ? 'ai' : 'rules';
  if (!primary) {
    const ranked = [...counts.entries()].filter(([c]) => c !== 'OTHER').sort((a, b) => b[1] - a[1]);
    primary = ranked[0]?.[0] || (humanRequested ? 'SUPPORT_REQUEST' : (counts.has('OTHER') ? 'OTHER' : null));
  }
  const secondary = [...new Set([...agentSecondary, ...counts.keys()])].filter((c) => c && c !== primary && c !== 'OTHER').slice(0, 6);
  return { primary, secondary, source };
}
