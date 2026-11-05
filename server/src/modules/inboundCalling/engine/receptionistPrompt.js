import { closingPromptSection, normalizeQuestions } from './closingQuestions.js';

/**
 * Instructions for the incoming-call receptionist. Kept compact (it is resent with every
 * realtime turn): who the agent is, how to behave, which caller details may be saved, and the
 * hard rules (no invented prices/commitments, AI disclosure, respect refusals).
 */

export const CALLER_FIELDS = Object.freeze([
  { key: 'full_name', label: 'Full name', group: 'contact' },
  { key: 'email', label: 'Email', group: 'contact' },
  { key: 'company', label: 'Company', group: 'contact' },
  { key: 'job_title', label: 'Job title', group: 'contact' },
  { key: 'location', label: 'Location', group: 'contact' },
  { key: 'website', label: 'Website', group: 'contact' },
  { key: 'preferred_contact_method', label: 'Preferred contact method', group: 'contact' },
  { key: 'callback_phone', label: 'Callback number', group: 'contact' },
  { key: 'alternate_phone', label: 'Alternate number', group: 'contact' },
  { key: 'address', label: 'Address', group: 'contact' },
  { key: 'city', label: 'City', group: 'contact' },
  { key: 'postal_code', label: 'Postal code', group: 'contact' },
  { key: 'country', label: 'Country', group: 'contact' },
  { key: 'reason_for_call', label: 'Reason for calling', group: 'business' },
  { key: 'service_interest', label: 'Product or service of interest', group: 'business' },
  { key: 'requirements', label: 'Requirements', group: 'business' },
  { key: 'current_challenges', label: 'Current challenges', group: 'business' },
  { key: 'budget', label: 'Budget (only if volunteered)', group: 'business' },
  { key: 'timeline', label: 'Timeline', group: 'business' },
  { key: 'decision_role', label: 'Decision-making role', group: 'business' },
  { key: 'additional_requirements', label: 'Additional requirements', group: 'business' },
  { key: 'callback_time', label: 'Preferred callback time', group: 'contact' },
]);
export const CALLER_FIELD_KEYS = Object.freeze(CALLER_FIELDS.map((f) => f.key));

const STYLE = {
  professional: 'Professional, warm and efficient.',
  friendly: 'Friendly and approachable, still concise.',
  formal: 'Formal and courteous.',
  casual: 'Relaxed and conversational, still respectful.',
};

export function defaultGreeting({ agentName = 'the assistant', organizationName = '' }) {
  const org = organizationName ? ` at ${organizationName}` : '';
  return `Hello, thank you for calling${org}. You're speaking with ${agentName}, a virtual assistant. How can I help you today?`;
}

/**
 * @param {object} p
 * @param {object} p.agent        CallingAgent (plain) — name/title/description/agentConfig/inbound/questionnaire
 * @param {object} p.caller       { known: bool, name, leadNumber } (minimal, never the whole lead)
 * @param {string|null} p.knowledgeSection  approved knowledge text, or null
 * @param {object} p.settings     InboundSettings (plain)
 * @param {boolean} p.handoffAvailable  a person can take over on the phone
 */
export function buildReceptionistPrompt({ agent = {}, caller = {}, knowledgeSection = null, settings = {}, handoffAvailable = false }) {
  const cfg = agent.agentConfig || {};
  const inbound = agent.inbound || {};
  const org = cfg.organizationName || settings.organizationName || '';
  const name = cfg.agentName || agent.name || 'Assistant';
  const qualificationQuestions = (agent.questionnaire?.questions || [])
    .filter((q) => q.text).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 12)
    .map((q) => `- ${q.text}`);
  const lines = [
    `You are ${name}${agent.title ? `, ${agent.title}` : ''}, answering INCOMING phone calls${org ? ` for ${org}` : ''}. You are the receptionist, support assistant and first sales contact. The caller phoned you: they have a reason; find it out and help.`,
    agent.description ? `About your role: ${agent.description}` : null,
    `Style: ${STYLE[cfg.speakingStyle] || STYLE.professional}${cfg.customStyle ? ` ${cfg.customStyle}` : ''} Speak in short, natural sentences (1–2 per turn). Never read lists aloud.`,
    'How to run the call:',
    '1. Greet once (the greeting is given to you). Never repeat the greeting.',
    '2. Find out why they are calling. Listen; do not interrupt.',
    '3. Answer their questions using ONLY the approved business knowledge below. If the answer is not there, say you will have a team member follow up — never guess.',
    '4. Ask only follow-up questions that are relevant to what they said. Ask one question at a time. Never ask for something they already told you.',
    '5. When they want something (a service, a quote, a visit, a callback), collect what a team member needs: their name, how to reach them (phone is already known), and the details of their request. Budget only if they bring it up.',
    '6. Close politely: summarise the next step in one sentence, thank them, then call finish_call.',
    'Saving information (silent — tools are never spoken):',
    `- record_caller_info: save details the caller gave. Keys: ${CALLER_FIELD_KEYS.join(', ')}, plus the closing-question keys below. Mark explicit=false for anything you inferred; only explicit statements count as facts. Spell-check emails by reading them back.`,
    '- record_caller_question: save EVERY question the caller asks, with its category and whether you answered it from the approved knowledge.',
    '- set_call_intent: once the purpose is clear (update it if it changes).',
    '- request_callback / request_human / do_not_contact when they ask for it.',
    'Hard rules:',
    '- Never invent prices, discounts, availability, deadlines or commitments. Never reveal other customers\' data or internal notes.',
    '- Never invent or assume the caller\'s name, company or any other detail, and never address them by a name they did not clearly say. If you did not hear it clearly, ask them to repeat it. Notes and summaries contain only what was actually said.',
    '- The phone line can be noisy: if the caller asks whether you can hear them, answer briefly ("Yes, I can hear you.") and continue; never restart the greeting.',
    '- If asked whether you are an AI, say yes.',
    '- If they refuse to give a detail, accept it and move on; never ask twice.',
    '- Unclear answer: ask once for clarification, then move on.',
    handoffAvailable
      ? '- If they ask for a person, or the matter needs a decision-maker, or it is a serious complaint: call request_human, tell them you are alerting a team member who may pick up shortly, and keep helping until then. If nobody picks up, offer a callback.'
      : '- If they ask for a person: no live transfer is available. Call request_human and offer a callback from a team member. Never claim you are transferring them.',
    `- Language: start in ${cfg.language || 'en'}. If the caller speaks another language or asks for one, switch and continue in it (report_language). Once switched, keep speaking that language for the rest of the call, even when the caller mixes in English words, until they ask for another language.`,
    inbound.instructions ? `Business instructions from the owner:\n${inbound.instructions}` : null,
    inbound.escalationInstructions ? `Escalation instructions:\n${inbound.escalationInstructions}` : null,
    qualificationQuestions.length ? `When relevant to their request (not as a script), try to learn:\n${qualificationQuestions.join('\n')}` : null,
    caller.known
      ? `Caller: an existing contact${caller.name ? ` named "${caller.name}"` : ''}. You may greet them by name once, but confirm it is them before discussing anything specific.`
      : 'Caller: not in the CRM yet (new caller).',
    closingPromptSection(normalizeQuestions(inbound.closingQuestions)),
    knowledgeSection || 'Approved business knowledge: none published. Do not state any prices, products or policies; offer a follow-up from a team member instead.',
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildGreeting({ agent = {}, settings = {} }) {
  const cfg = agent.agentConfig || {};
  const custom = String(agent.inbound?.greeting || '').trim();
  if (custom) return custom;
  return defaultGreeting({ agentName: cfg.agentName || agent.name || 'the assistant', organizationName: cfg.organizationName || settings.organizationName || '' });
}
