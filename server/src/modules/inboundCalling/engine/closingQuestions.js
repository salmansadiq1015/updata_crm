/**
 * Closing questions: what an incoming-call agent asks before it says goodbye, configured per agent
 * (CallingAgent.inbound.closingQuestions). Contact details (email, callback / alternate number,
 * address…) map to standard caller fields; anything else is a custom question with its own key.
 *
 * The agent asks them one at a time near the end of the call, SKIPS any the caller already
 * answered, accepts a refusal, and saves each answer with record_caller_info. Answers are
 * validated here by type — the model proposes, the CRM decides.
 */

import { normalizePhone } from '../../businessDiscovery/engine/normalizer.js';

export const QUESTION_TYPES = Object.freeze(['text', 'long_text', 'email', 'phone', 'address', 'number', 'date', 'time', 'choice', 'yes_no']);
export const MAX_CLOSING_QUESTIONS = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Standard keys a closing question may map to (they land in the lead's own fields). */
export const STANDARD_KEYS = Object.freeze({
  full_name: 'text', email: 'email', company: 'text', job_title: 'text', website: 'text',
  callback_phone: 'phone', alternate_phone: 'phone', address: 'address', city: 'text', postal_code: 'text', country: 'text',
  preferred_contact_method: 'choice', callback_time: 'text', budget: 'text', timeline: 'text',
});

const q = (key, label, question, type = STANDARD_KEYS[key] || 'text', extra = {}) => ({ key, label, question, type, required: false, ...extra });

/** Ready-made sets the owner can drop into an agent and edit. */
export const QUESTION_TEMPLATES = Object.freeze([
  { id: 'contact_details', name: 'Contact details', description: 'Name, email, callback and alternate number, address.', questions: [
    q('full_name', 'Full name', 'May I have your full name, please?', 'text', { required: true }),
    q('email', 'Email', 'What is the best email address to reach you?', 'email', { required: true }),
    q('callback_phone', 'Callback number', 'Is this number the best one to call you back on, or should we use another?'),
    q('alternate_phone', 'Alternate number', 'Do you have an additional phone number we can use?'),
    q('address', 'Address', 'What is your address, including city and postal code?'),
    q('preferred_contact_method', 'Preferred contact method', 'How do you prefer us to contact you: phone, SMS, email or WhatsApp?', 'choice', { options: ['phone', 'sms', 'email', 'whatsapp'] }),
  ] },
  { id: 'support', name: 'Support agent', description: 'Issue details, product or order reference, urgency.', questions: [
    q('custom_issue', 'Issue description', 'Could you briefly describe the problem you are having?', 'long_text', { required: true }),
    q('custom_reference', 'Order / account / ticket number', 'Do you have an order, account or ticket number for this?'),
    q('custom_product', 'Product or device', 'Which product, model or device is this about?'),
    q('custom_urgency', 'Urgency', 'How urgent is this for you: urgent, today, or this week?', 'choice', { options: ['urgent', 'today', 'this_week'] }),
    q('email', 'Email', 'What email address should our support team reply to?', 'email'),
  ] },
  { id: 'orders', name: 'Order taking', description: 'Items, quantities, delivery address and time, payment.', questions: [
    q('custom_items', 'Items and quantities', 'What would you like to order, and how many of each?', 'long_text', { required: true }),
    q('address', 'Delivery address', 'What is the delivery address?', 'address', { required: true }),
    q('custom_delivery_time', 'Delivery date / time', 'When would you like it delivered?', 'text'),
    q('custom_payment', 'Payment preference', 'How would you like to pay: cash on delivery, card or bank transfer?', 'choice', { options: ['cash_on_delivery', 'card', 'bank_transfer'] }),
    q('alternate_phone', 'Alternate number', 'Is there another number we can reach you on for the delivery?'),
  ] },
  { id: 'restaurant', name: 'Restaurant / waiter', description: 'Reservation or takeaway order, party size, time, dietary needs.', questions: [
    q('custom_booking_type', 'Reservation or order', 'Would you like to book a table or place an order?', 'choice', { options: ['reservation', 'takeaway', 'delivery'], required: true }),
    q('custom_party_size', 'Number of guests', 'For how many people?', 'number'),
    q('custom_date_time', 'Date and time', 'For which date and time?', 'text', { required: true }),
    q('custom_dietary', 'Dietary requirements / allergies', 'Any allergies or dietary requirements we should know about?', 'long_text'),
    q('custom_items', 'Order items', 'What would you like to order?', 'long_text'),
  ] },
  { id: 'appointments', name: 'Appointments', description: 'Service, preferred date and time, location.', questions: [
    q('custom_service', 'Service', 'Which service would you like to book?', 'text', { required: true }),
    q('custom_preferred_date', 'Preferred date and time', 'Which day and time would suit you best?', 'text', { required: true }),
    q('address', 'Address (for visits)', 'If we should come to you, what is the address?', 'address'),
    q('email', 'Email for the confirmation', 'Which email should we send the confirmation to?', 'email'),
  ] },
  { id: 'sales', name: 'Sales', description: 'Need, timeline, budget, decision role.', questions: [
    q('requirements', 'Requirements', 'What are the main things the solution must do for you?', 'long_text', { required: true }),
    q('timeline', 'Timeline', 'When would you like to get started?'),
    q('budget', 'Budget', 'Do you have a budget in mind? It is fine if not.'),
    q('decision_role', 'Decision role', 'Will you be making the decision, or is someone else involved?'),
  ] },
]);

const slug = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

/** Clean an agent's configured questions: unique keys, known types, bounded lengths. */
export function normalizeQuestions(list = []) {
  const out = [];
  const seen = new Set();
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_CLOSING_QUESTIONS)) {
    const question = String(raw?.question || '').trim().slice(0, 300);
    const label = String(raw?.label || '').trim().slice(0, 80) || question.slice(0, 80);
    if (!question || !label) continue;
    let key = String(raw?.key || '').trim();
    if (!STANDARD_KEYS[key]) key = `custom_${slug(key.replace(/^custom_/, '') || label)}`;
    if (key === 'custom_' || seen.has(key)) continue;
    seen.add(key);
    const type = QUESTION_TYPES.includes(raw?.type) ? raw.type : STANDARD_KEYS[key] || 'text';
    const options = type === 'choice' ? [...new Set((raw?.options || []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean))].slice(0, 12) : [];
    out.push({ key, label, question, type, required: Boolean(raw?.required), options });
  }
  return out;
}

/**
 * Validate one spoken answer for its question type. Returns { ok, value } with a normalised
 * value, or { ok:false, reason } so the agent asks again (once) instead of saving garbage.
 */
export function validateAnswer(type, value, { region = 'CH', options = [] } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return { ok: false, reason: 'empty' };
  switch (type) {
    case 'email': {
      const e = v.toLowerCase().replace(/\s+/g, '').replace(/\(at\)|\[at\]/g, '@');
      return EMAIL_RE.test(e) ? { ok: true, value: e } : { ok: false, reason: 'invalid_email' };
    }
    case 'phone': {
      const p = normalizePhone(v, region);
      return p.valid ? { ok: true, value: p.e164 } : { ok: false, reason: 'invalid_phone' };
    }
    case 'number': {
      // Digits only (the agent passes "4", not "four"); no digits must never become 0.
      const digits = v.replace(/[^\d.,-]/g, '').replace(',', '.');
      const n = /\d/.test(digits) ? Number(digits) : NaN;
      return Number.isFinite(n) ? { ok: true, value: String(n) } : { ok: false, reason: 'invalid_number' };
    }
    case 'yes_no': {
      if (/^(yes|y|ja|oui|si|sí|نعم|haan|ji|true)$/i.test(v)) return { ok: true, value: 'yes' };
      if (/^(no|n|nein|non|لا|nahi|false)$/i.test(v)) return { ok: true, value: 'no' };
      return { ok: false, reason: 'not_yes_no' };
    }
    case 'choice': {
      if (!options.length) return { ok: true, value: v.slice(0, 1000) };
      const hit = options.find((o) => o.toLowerCase() === v.toLowerCase() || slug(o) === slug(v));
      return hit ? { ok: true, value: hit } : { ok: false, reason: 'not_an_option' };
    }
    case 'address':
      // A street address has a number, a comma-separated part, or several words — not just a city name.
      return /\d/.test(v) || v.includes(',') || v.split(/\s+/).length >= 3 ? { ok: true, value: v.slice(0, 1000) } : { ok: false, reason: 'incomplete_address' };
    default:
      return { ok: true, value: v.slice(0, 1000) };
  }
}

/** Prompt section: the questions to ask before closing, with their keys and formats. */
export function closingPromptSection(questions = []) {
  if (!questions.length) return null;
  const lines = questions.map((x, i) => {
    const fmt = x.type === 'choice' && x.options.length ? ` (one of: ${x.options.join(' | ')})`
      : x.type === 'email' ? ' (spell-check by reading it back)'
        : x.type === 'phone' ? ' (digits, include the country code if they give one)'
          : x.type === 'yes_no' ? ' (yes or no)' : '';
    return `${i + 1}. key=${x.key}${x.required ? ' [important]' : ''}: "${x.question}"${fmt}`;
  });
  return [
    'Closing questions — before you say goodbye, once the caller\'s own request is handled, ask these one at a time in the conversation language.',
    'SKIP any whose answer the caller already gave (it is already saved). If they decline or do not know, accept it, call record_caller_info with declined=true for that key, and move on. Never insist; never ask twice.',
    'Save every answer immediately with record_caller_info using the exact key below.',
    ...lines,
  ].join('\n');
}
