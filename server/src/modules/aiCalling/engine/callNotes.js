/** Build a bounded recap from recorded evidence, including calls the agent could not close. */
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const valueText = (value) => Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '');

export function buildCallNotes({ campaign, call, answers, disposition, unresolvedRequired = [], agentNotes = null, now = new Date() }) {
  const captured = answers.filter(a => a.rawAnswer || a.normalizedValue != null);
  const blockers = [];
  if (['no_answer', 'busy', 'voicemail', 'failed', 'needs_review', 'unresponsive'].includes(disposition)) blockers.push(`Call outcome: ${disposition.replaceAll('_', ' ')}.`);
  if (call.failureMessage) blockers.push(call.failureMessage);
  if (disposition === 'declined') blockers.push('The lead declined to participate.');
  if (disposition === 'do_not_contact') blockers.push('The lead requested no further contact.');
  if (disposition === 'callback_requested') blockers.push('The lead requested a callback.');
  if (unresolvedRequired.length) blockers.push(`${unresolvedRequired.length} required answer(s) unresolved.`);
  if (call.gateway?.audioLostAt || call.gateway?.takenOverAt || call.reconciliation?.needed) blockers.push('The call record may be incomplete and needs review.');
  const suppliedBlockers = (agentNotes?.blockers || []).map(b => text(b, 500)).filter(Boolean).slice(0, 10);
  const details = captured.map(a => `${a.label || a.questionFieldKey}: ${a.rawAnswer || valueText(a.normalizedValue)}${a.validation !== 'valid' ? ` (${a.validation})` : ''}`).join('\n');
  const control = call.conversationState?.control || {};
  const followUp = [control.callbackRequestedAt ? `Callback requested: ${control.callbackRequestedAt}` : '', control.callbackText, control.humanRequested ? 'A human follow-up was requested.' : ''].filter(Boolean).join('\n');
  return {
    description: text(agentNotes?.description, 2000) || text(campaign.objective || campaign.name || 'AI lead call', 2000),
    summary: text(agentNotes?.summary, 4000) || text([`Outcome: ${disposition.replaceAll('_', ' ')}.`, details || 'No lead responses were captured.', followUp].filter(Boolean).join('\n'), 4000),
    blockers: [...new Set([...suppliedBlockers, ...blockers.map(b => text(b, 500))])].slice(0, 20),
    ...(agentNotes?.behavior?.tone ? { behavior: { tone: agentNotes.behavior.tone, evidence: text(agentNotes.behavior.evidence, 300) } } : {}),
    source: agentNotes ? 'ai_agent' : 'call_results',
    generatedAt: now,
  };
}
