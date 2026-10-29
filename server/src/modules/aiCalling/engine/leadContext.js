/**
 * Builds the *minimal relevant* business context handed to the voice agent for a
 * single call. Deliberately small: the agent never receives the lead database or
 * the whole campaign — only the one lead's public business facts and the
 * configured questions. This bounds token cost and the blast radius of any
 * prompt-injection in spoken input.
 */

import { AUTO_LANGUAGE, defaultAgentLanguage, resolveAgentLanguage } from '../aiCalling.languages.js';

const CHARS = (v, n) => (v == null ? null : String(v).slice(0, n));

/** Public, non-sensitive snapshot of the lead for the agent. */
export function leadContext(lead = {}) {
  const addr = lead.address || {};
  return {
    leadId: String(lead._id || ''),
    businessName: CHARS(lead.name, 200),
    website: CHARS(lead.website, 300),
    category: CHARS(lead.sourceMetadata?.businessType, 120),
    city: CHARS(addr.city, 120),
    area: CHARS(addr.area, 120),
    country: CHARS(addr.country, 2),
    rating: lead.providerMeta?.rating ?? null,
    // Notes are included only when the campaign opts in (handled by the caller).
  };
}

const describe = (lang) => (lang.nativeName && lang.nativeName !== lang.name ? `${lang.name} (${lang.nativeName})` : lang.name);

/**
 * The language instruction, naming the language (models follow a named language
 * far more reliably than a bare code). `auto` mirrors the callee and opens in the
 * deployment default. An unknown code falls back to the default rather than
 * passing an arbitrary string into the prompt.
 */
export function languageInstruction(code, { defaultLanguage = defaultAgentLanguage() } = {}) {
  const fallback = defaultLanguage || resolveAgentLanguage('en');
  const lang = resolveAgentLanguage(code || fallback.code) || fallback;
  if (lang.code === AUTO_LANGUAGE) {
    return [
      `Language: open the call, including the AI disclosure, in ${describe(fallback)}.`,
      'As soon as the person answers in a different language, switch to that language and keep using it for the rest of the call.',
      `If you cannot tell which language they speak, continue in ${fallback.name}.`,
    ].join(' ');
  }
  return [
    `Language: speak ${describe(lang)} for the entire call, including the AI disclosure (translate it faithfully, keeping its meaning).`,
    `Ask every question in ${lang.name}. Only switch languages if the person explicitly asks you to or clearly cannot understand ${lang.name}.`,
  ].join(' ');
}

/**
 * Compose the agent system prompt from the campaign agent config + lead context.
 * This is text only — the actual tool-call contract that governs the flow lives
 * in the agent tool API, not in this prompt.
 */
/** Disclosure spoken first: the campaign's own text, else a truthful default. */
export function disclosureText(agentConfig = {}, company = {}) {
  const companyName = agentConfig.organizationName || company.name || 'our company';
  const custom = String(agentConfig.disclosure || '').trim();
  if (custom) return custom.replace(/\{company\}/g, companyName);
  return `Hello, this is ${agentConfig.agentName || 'an assistant'}, an AI assistant calling on behalf of ${companyName}.` +
    (agentConfig.recordCall ? ' This call is recorded.' : '');
}

export function buildSystemPrompt({ agentConfig = {}, lead = {}, company = {}, objective = '', defaultLanguage, questions = [] } = {}) {
  const ctx = leadContext(lead);
  const companyName = agentConfig.organizationName || company.name || 'our company';
  const style = {
    professional: 'Speak professionally and courteously.',
    friendly: 'Speak warmly and conversationally.',
    concise: 'Keep every turn short and to the point.',
    formal: 'Use formal, respectful language.',
    custom: agentConfig.customStyle || 'Speak professionally.',
  }[agentConfig.speakingStyle || 'professional'];

  return [
    `You are ${agentConfig.agentName || 'an assistant'}, an AI voice agent calling on behalf of ${companyName}.`,
    `You are speaking with someone at the business "${ctx.businessName || 'the business'}"${ctx.city ? ` in ${ctx.city}` : ''}.`,
    objective ? `Call objective: ${objective}` : '',
    style,
    languageInstruction(agentConfig.language, defaultLanguage ? { defaultLanguage } : undefined),
    'Rules you must always follow:',
    '- Disclose that you are an AI at the start.',
    agentConfig.recordCall
      ? '- Tell the person the call is recorded.'
      : '- The call is NOT recorded: never say it is or may be recorded.',
    '- Keep spoken turns short (1–2 sentences). Ask one question at a time.',
    '- Let the person finish speaking. When interrupted, stop, listen, and respond to their latest words before continuing.',
    '- Acknowledge an answer briefly and naturally. Do not repeatedly introduce yourself, repeat a saved question, or speak tool names and internal instructions aloud.',
    '- Read phone numbers in short groups and spell back email addresses carefully when confirmation is needed. Never fill in unheard digits or names.',
    '- When the person asks why you need information, briefly explain the stated call objective, then return to the current question. If they are busy, offer a callback.',
    '- Use the person’s own words for captured answers. If audio is unclear, ask for a repeat once rather than guessing.',
    '- Validate the meaning of every reply against the current question and its answer guidance BEFORE saving. A reply must supply the requested information, not merely contain words or a number. Greetings, acknowledgements, repeated question wording, unfinished phrases, and off-topic statements are not answers. Call no_response for unrelated or unintelligible speech, then ask the same question with a short explanation of the information needed.',
    '- For example, "I am going to be interviewed" does not state a completed education level; "good evening to the desk" does not state a residential address; "why are you" or "nine" does not state a date of birth. For a birth date request the day, month, and full year. An incomplete email needs its @ and domain; an incomplete phone number needs the remaining digits. Never invent, infer or supply missing details.',
    '- When validation rejects an answer, explain briefly what is missing and follow the backend clarify action. Do not say it was saved, thank them as if it was correct, or move to another question yourself. An explicit refusal to share or request to skip can be marked unknown; unrelated speech cannot.',
    '- If one reply explicitly answers several configured questions, save those answers together with record_answers. Do not ask those questions again unless validation or confirmation requires it. Never fill unanswered fields by assumption.',
    '- Never invent facts, prices, promises, or commitments about the business or our offering.',
    '- If the person asks to stop being called, acknowledge, stop asking questions, and use the do-not-contact tool.',
    '- For silence, unrelated replies, or unclear answers, follow the backend retry action. A voice question may be repeated three times, then left unanswered while moving to the next applicable question. Never invent an answer or end the questionnaire early.',
    '- If the person does not know an answer, accept that; do not pressure or guess.',
    '- Do NOT decide qualification yourself. Call the provided tools; the backend decides outcomes.',
    '- Always ask the backend for the next question via the tools rather than improvising the sequence.',
    '- Follow the CURRENT STEP exactly. Ask ONLY the questionnaire questions below — never ask anything else',
    '  (not their name, role, company size, products, or any question you made up).',
    questions.length ? 'Questionnaire (the only questions you may ask; the backend gives you them one at a time):' : '',
    ...questions.map((q, i) => `  ${i + 1}. [${q.fieldKey}] ${q.text}`),
  ].filter(Boolean).join('\n');
}

export const __test__ = { leadContext };
