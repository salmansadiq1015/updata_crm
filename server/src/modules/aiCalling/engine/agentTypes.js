/**
 * Agent types — configurable templates, not separate implementations.
 *
 * Every calling agent runs on the same engine (questionnaire, rules, tools,
 * telephony). A type only supplies sensible defaults: objective, conversation
 * instructions, follow-up instructions and which follow-up outcomes the agent
 * handles. Applying a template never overwrites what an admin already wrote
 * (see applyAgentTemplate), and several agents may share a type.
 */

export const AGENT_TYPES = Object.freeze([
  'sales', 'follow_up', 'customer_support', 'receptionist', 'lead_qualification', 'appointment',
  'retention', 'collection', 'feedback', 'renewal', 'onboarding', 'custom',
]);

/** Follow-up outcomes an agent can be configured to act on (see engine/followUpDecision.js). */
export const FOLLOW_UP_TRIGGERS = Object.freeze([
  'CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'TEMPORARILY_UNAVAILABLE',
  'QUALIFICATION_INCOMPLETE', 'APPOINTMENT_PENDING',
]);

const T = (objective, instructions, followUpInstructions, triggers, extra = {}) => ({
  objective, instructions, followUpInstructions, triggers, ...extra,
});

const TEMPLATES = Object.freeze({
  sales: T(
    'Understand the prospect\'s needs, qualify their interest and agree a concrete next step.',
    'Lead with the prospect\'s situation, not the product. Only describe products, prices and terms that appear in the approved knowledge. Handle objections by asking what is behind them. Never pressure or promise discounts.',
    'Reconfirm interest, ask what changed since the last conversation, address the open objection or question, and agree the next step (meeting, offer, or a clear no).',
    ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'TEMPORARILY_UNAVAILABLE'],
    { speakingStyle: 'friendly' },
  ),
  follow_up: T(
    'Continue an earlier conversation with this lead and collect the information that is still missing.',
    'You are following up on a previous conversation. Refer to it briefly and naturally. Never restart the full interview. Ask only for information that is still missing, and confirm anything the lead says has changed.',
    'Start from the reason for this follow-up. If the lead asked for a callback, thank them for their time and continue where the conversation stopped.',
    ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'TEMPORARILY_UNAVAILABLE', 'QUALIFICATION_INCOMPLETE'],
  ),
  customer_support: T(
    'Understand the customer\'s issue, collect the details support needs and agree how it will be resolved.',
    'Be patient and precise. Restate the issue in the customer\'s words. Never guess at technical causes or promise resolution times that are not in the approved knowledge. Escalate to a human when the issue cannot be resolved on the call.',
    'Ask whether the previous issue was resolved. If not, collect what changed and escalate. Record the customer\'s satisfaction in their own words.',
    ['CALLBACK_REQUESTED', 'INFORMATION_REQUESTED', 'TEMPORARILY_UNAVAILABLE'],
    { speakingStyle: 'professional' },
  ),
  receptionist: T(
    'Greet callers, understand why they are calling and route the request to the right person or next step.',
    'Keep the greeting short. Identify the caller and their reason for calling. Never pretend to transfer a call; only say a person will call back when a follow-up has been recorded.',
    'Call back callers whose request could not be handled on the first call and confirm their request is now in progress.',
    ['CALLBACK_REQUESTED', 'INFORMATION_REQUESTED'],
    { usage: 'inbound' },
  ),
  lead_qualification: T(
    'Run a structured qualification interview and record verified answers to every required question.',
    'Ask the configured questions in order, one at a time. Confirm critical values. If the lead does not know, record that and move on; never fill in an answer for them.',
    'Continue the qualification from the first unanswered question. Do not ask again for answers that were already confirmed unless the lead says something changed.',
    ['CALLBACK_REQUESTED', 'QUALIFICATION_INCOMPLETE', 'TEMPORARILY_UNAVAILABLE'],
    { speakingStyle: 'concise' },
  ),
  appointment: T(
    'Schedule, confirm or reschedule an appointment within the approved time slots.',
    'Offer only time slots allowed by the configured schedule and knowledge. Read the agreed date and time back and confirm the timezone. Never book outside the allowed options.',
    'Confirm whether the proposed appointment still works. Handle rescheduling by offering approved alternatives.',
    ['CALLBACK_REQUESTED', 'APPOINTMENT_PENDING', 'TEMPORARILY_UNAVAILABLE'],
  ),
  retention: T(
    'Understand why an existing customer is dissatisfied or leaving and record what would keep them.',
    'Listen first. Record reasons in the customer\'s words. Offer only approved solutions from the knowledge base and escalate any request outside them to a human.',
    'Ask whether the earlier concern has been addressed and record the customer\'s current intent.',
    ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'TEMPORARILY_UNAVAILABLE'],
  ),
  collection: T(
    'Remind the customer about an open invoice and agree when it will be paid.',
    'Be respectful and factual. State only the amounts and due dates provided in the CRM context. Never threaten, never discuss the debt with anyone but the customer, and offer a human contact for disputes.',
    'Reconfirm the payment date agreed on the previous call, or record the reason it changed.',
    ['CALLBACK_REQUESTED', 'TEMPORARILY_UNAVAILABLE'],
    { speakingStyle: 'formal' },
  ),
  feedback: T(
    'Collect the customer\'s feedback and satisfaction rating about a recent service.',
    'Keep it short. Ask the rating question, then one open question about what could be better. Record the answers verbatim.',
    'Collect any feedback questions that were not answered on the previous call.',
    ['CALLBACK_REQUESTED', 'QUALIFICATION_INCOMPLETE'],
    { speakingStyle: 'friendly' },
  ),
  renewal: T(
    'Contact the customer about an expiring service and record whether and how they want to renew.',
    'State only the renewal terms in the approved knowledge. Record the customer\'s decision and any change they need.',
    'Follow up on the customer\'s pending renewal decision.',
    ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'TEMPORARILY_UNAVAILABLE'],
  ),
  onboarding: T(
    'Welcome a new customer, confirm their setup details and make sure they know the next steps.',
    'Go step by step. Confirm each detail. Offer a human contact for anything technical you cannot answer from the approved knowledge.',
    'Check the onboarding steps that were still open on the previous call.',
    ['CALLBACK_REQUESTED', 'QUALIFICATION_INCOMPLETE', 'TEMPORARILY_UNAVAILABLE'],
  ),
  custom: T('', '', '', ['CALLBACK_REQUESTED']),
});

export function agentTemplate(type) {
  const key = AGENT_TYPES.includes(type) ? type : 'custom';
  return { type: key, ...TEMPLATES[key] };
}

export function listAgentTemplates() {
  return AGENT_TYPES.map(agentTemplate);
}

/**
 * Fill empty fields of an agent input from its type's template. Text an admin
 * entered is never replaced; follow-up triggers are only seeded when unset.
 */
export function applyAgentTemplate(input = {}) {
  const tpl = agentTemplate(input.agentType);
  const config = { ...(input.agentConfig || {}) };
  if (!config.objective?.trim() && tpl.objective) config.objective = tpl.objective;
  if (!config.instructions?.trim() && tpl.instructions) config.instructions = tpl.instructions;
  const followUp = input.followUp ? { ...input.followUp } : undefined;
  if (followUp) {
    if (!followUp.instructions?.trim() && tpl.followUpInstructions) followUp.instructions = tpl.followUpInstructions;
    if (!Array.isArray(followUp.triggers) || !followUp.triggers.length) followUp.triggers = [...tpl.triggers];
  }
  return { ...input, agentConfig: config, ...(followUp ? { followUp } : {}) };
}
