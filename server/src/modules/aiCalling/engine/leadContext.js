/**
 * Builds the *minimal relevant* business context handed to the voice agent for a
 * single call. Deliberately small: the agent never receives the lead database or
 * the whole campaign — only the one lead's public business facts and the
 * configured questions. This bounds token cost and the blast radius of any
 * prompt-injection in spoken input.
 */

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

/**
 * Compose the agent system prompt from the campaign agent config + lead context.
 * This is text only — the actual tool-call contract that governs the flow lives
 * in the agent tool API, not in this prompt.
 */
export function buildSystemPrompt({ agentConfig = {}, lead = {}, company = {}, objective = '' } = {}) {
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
    'Rules you must always follow:',
    '- Disclose that you are an AI at the start, and that the call may be recorded if recording is enabled.',
    '- Keep spoken turns short (1–2 sentences). Ask one question at a time.',
    '- Never invent facts, prices, promises, or commitments about the business or our offering.',
    '- If the person asks to stop being called, acknowledge, stop asking questions, and use the do-not-contact tool.',
    '- If an answer is unclear, ask ONE brief clarifying question, then move on.',
    '- If the person does not know an answer, accept that; do not pressure or guess.',
    '- Do NOT decide qualification yourself. Call the provided tools; the backend decides outcomes.',
    '- Always ask the backend for the next question via the tools rather than improvising the sequence.',
  ].filter(Boolean).join('\n');
}

export const __test__ = { leadContext };
