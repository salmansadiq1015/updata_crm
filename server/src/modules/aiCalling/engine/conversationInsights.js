import { conditionMet, normalizeState } from './questionEngine.js';

/** A read-only view of recorded evidence, shared by voice calls and SIM SMS. */
export function conversationInsights({ questionnaire = {}, state: rawState, answers = [], transcript = [], disposition = null, terminal = false, incomplete = false } = {}) {
  const state = normalizeState(rawState);
  const recorded = { ...state.answers };
  // Reviewed answers take precedence over the original agent tool values.
  for (const answer of answers) recorded[answer.questionFieldKey || answer.fieldKey] = answer;
  const questions = [...(questionnaire.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(q => {
    const answer = recorded[q.fieldKey];
    const eligible = conditionMet(q.condition, recorded);
    const hasAnswer = Boolean(answer);
    const status = hasAnswer
      ? answer.validation === 'unknown' ? 'unknown'
        : answer.validation !== 'valid' ? (answer.noResponseCount || 0) + (answer.clarifications || 0) > 3 ? 'not_answered' : 'needs_clarification'
          : q.confirmCritical && !answer.confirmed ? 'needs_confirmation' : 'answered'
      : !eligible ? 'not_applicable' : terminal ? 'not_answered' : 'pending';
    return {
      fieldKey: q.fieldKey, label: q.label || q.fieldKey, question: q.text || '', required: Boolean(q.required), eligible, status,
      rawAnswer: answer?.rawAnswer || '', normalizedValue: answer?.normalizedValue ?? null,
      validation: answer?.validation || null, confirmed: Boolean(answer?.confirmed),
      source: answer?.source || (hasAnswer ? 'agent_tool' : null),
      noResponseCount: answer?.noResponseCount || 0, reason: answer?.reason || null,
    };
  });
  const eligible = questions.filter(q => q.eligible);
  const count = status => eligible.filter(q => q.status === status).length;
  const requiredGaps = eligible.filter(q => q.required && q.status !== 'answered');
  const coverage = {
    total: questions.length, applicable: eligible.length, answered: count('answered'), unknown: count('unknown'),
    needsClarification: count('needs_clarification'), needsConfirmation: count('needs_confirmation'),
    unanswered: count('pending') + count('not_answered'), notApplicable: questions.filter(q => !q.eligible).length,
    requiredGaps: requiredGaps.map(q => q.fieldKey), questions,
  };
  const observations = [];
  const nextSteps = [];
  let intent = 'not_established';
  const control = state.control || {};
  const endedReason = state.endedReason || disposition;
  if (endedReason === 'do_not_contact' || disposition === 'do_not_contact') {
    intent = 'do_not_contact';
    observations.push({ code: 'do_not_contact', label: 'No further contact requested', evidence: 'The conversation recorded a do-not-contact request.' });
    nextSteps.push('Keep the lead suppressed. Do not schedule sales follow-ups.');
  } else if (control.humanRequested) {
    intent = 'human_requested';
    observations.push({ code: 'human_requested', label: 'Human follow-up requested', evidence: control.callbackText || 'The human-request control was recorded.' });
    nextSteps.push('Assign the conversation to a team member and review the recorded request.');
  } else if (endedReason === 'callback_requested' || disposition === 'callback_requested') {
    intent = 'callback_requested';
    observations.push({ code: 'callback_requested', label: 'Callback requested', evidence: [control.callbackRequestedAt, control.callbackText].filter(Boolean).join(' · ') || 'A callback request was recorded.' });
    nextSteps.push('Confirm the callback time and timezone, then assign an owner.');
  } else if (endedReason === 'declined' || disposition === 'declined') {
    intent = 'declined';
    observations.push({ code: 'declined', label: 'Participation declined', evidence: 'The conversation recorded a decline.' });
    nextSteps.push('Review the decline and contact permissions before any further outreach.');
  }
  const statedInterest = eligible.find(q => q.fieldKey === 'interest' && q.validation === 'valid');
  if (statedInterest && intent !== 'do_not_contact' && intent !== 'declined') observations.push({
    code: 'stated_interest', label: 'Stated interest',
    evidence: statedInterest.rawAnswer || String(statedInterest.normalizedValue),
  });
  if (count('unknown')) observations.push({ code: 'unknown_answers', label: 'Some information is unknown', evidence: `${count('unknown')} applicable question(s) were explicitly marked unknown.` });
  if (count('needs_clarification')) observations.push({ code: 'clarification_needed', label: 'Answers need clarification', evidence: `${count('needs_clarification')} applicable answer(s) did not pass validation.` });
  if (count('needs_confirmation')) observations.push({ code: 'confirmation_needed', label: 'Critical answers need confirmation', evidence: `${count('needs_confirmation')} critical answer(s) have not been confirmed by the lead.` });
  if (incomplete) observations.push({ code: 'incomplete_evidence', label: 'Conversation evidence may be incomplete', evidence: 'Audio loss, a human takeover, or an uncertain call outcome was recorded.' });
  if (requiredGaps.length && intent !== 'do_not_contact' && intent !== 'declined') nextSteps.push(`Review ${requiredGaps.length} required question(s) with missing, unknown, or unconfirmed information before relying on the result.`);
  if (incomplete && intent !== 'do_not_contact') nextSteps.push('Review the call evidence before accepting the automated outcome.');
  const agentTurns = transcript.filter(t => t.role === 'assistant').length;
  const leadTurns = transcript.filter(t => t.role === 'customer').length;
  return {
    questionCoverage: coverage,
    conversationInsights: {
      version: 1, basis: 'recorded_evidence', intent, observations, nextSteps,
      participation: { agentTurns, leadTurns, interruptedAgentTurns: transcript.filter(t => t.role === 'assistant' && t.interrupted).length },
      limitation: 'These observations describe recorded conversation events. Interest, emotion and buying intent are not inferred from silence, accent, or response length.',
    },
  };
}
