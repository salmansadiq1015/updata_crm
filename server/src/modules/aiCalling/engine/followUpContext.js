/**
 * Context for a follow-up call — pure and unit-tested.
 *
 * Gives the voice agent only what it needs to CONTINUE a conversation: why it
 * is calling again, a short recap of the last few calls, which configured
 * answers are already known (so they are not asked again) and which are still
 * missing. Bounded: at most 3 previous calls, short summaries, no transcripts.
 *
 * Known answers come from evidence only: a previous call's validated (and,
 * when the question requires it, confirmed) answer, or a lead qualification
 * field recorded by a person or confirmed evidence. AI-inferred proposals that
 * no one confirmed are never treated as known.
 */

const MAX_CALLS = 3;
const SUMMARY_MAX = 400;
const VALUE_MAX = 160;
// Lead qualification sources that count as verified for "don't ask again".
const VERIFIED_LEAD_SOURCES = new Set(['user', 'user_correction', 'ai_proposed_user_confirmed', 'ai_call_agent', 'sms_agent']);

const REASON_TEXT = {
  CALLBACK_REQUESTED: 'the lead asked to be called back',
  INTERESTED_NEEDS_MORE_TIME: 'the lead was interested but needed time to decide',
  INFORMATION_REQUESTED: 'the lead asked for more information',
  TEMPORARILY_UNAVAILABLE: 'earlier call attempts were not answered',
  QUALIFICATION_INCOMPLETE: 'some required information is still missing',
  APPOINTMENT_PENDING: 'an appointment still has to be agreed',
  APPOINTMENT_CONFIRMATION_REQUIRED: 'an appointment needs to be confirmed',
  HANDOFF: 'a colleague qualified this lead and handed it over to you',
  MANUAL: 'a team member scheduled this follow-up',
};

const clip = (value, max) => {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const valueText = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? ''));

/**
 * Answers already known for this questionnaire.
 * @returns {Record<string, {value, raw, source: 'previous_call'|'lead_record', callRecordId: string|null, at: string|null}>}
 */
export function knownAnswers({ questions = [], previousCalls = [], qualificationFields = [] } = {}) {
  const known = {};
  const byKey = new Map(questions.map((q) => [q.fieldKey, q]));
  // Newest evidence wins: walk calls newest-first and only fill gaps.
  const calls = [...previousCalls].sort((a, b) => new Date(b.endedAt || b.createdAt || 0) - new Date(a.endedAt || a.createdAt || 0));
  for (const call of calls) {
    for (const a of call.answers || []) {
      const q = byKey.get(a.questionFieldKey);
      if (!q || known[q.fieldKey] || a.validation !== 'valid' || a.normalizedValue == null) continue;
      if (q.confirmCritical && !a.confirmed) continue;
      if (a.reviewStatus === 'rejected') continue;
      known[q.fieldKey] = { value: a.normalizedValue, raw: a.rawAnswer || valueText(a.normalizedValue), source: 'previous_call', callRecordId: call._id ? String(call._id) : null, at: call.endedAt ? new Date(call.endedAt).toISOString() : null };
    }
  }
  // A human correction or a newer verified lead field overrides an older call answer.
  for (const f of qualificationFields) {
    const q = byKey.get(f.fieldKey);
    if (!q || f.status !== 'answered' || f.value == null || !VERIFIED_LEAD_SOURCES.has(f.source || 'user')) continue;
    const existing = known[q.fieldKey];
    const newer = !existing || f.source === 'user_correction' || (f.updatedAt && existing.at && new Date(f.updatedAt) > new Date(existing.at));
    if (newer) known[q.fieldKey] = { value: f.value, raw: valueText(f.value), source: 'lead_record', callRecordId: f.callRecordId ? String(f.callRecordId) : null, at: f.updatedAt ? new Date(f.updatedAt).toISOString() : null };
  }
  return known;
}

/** Conversation-state answer entries for known answers (flagged prefilled; never re-written to the lead). */
export function prefilledAnswerState(known = {}) {
  return Object.fromEntries(Object.entries(known).map(([fieldKey, k]) => [fieldKey, {
    validation: 'valid', classification: 'ANSWERED', normalizedValue: k.value, rawAnswer: clip(k.raw, VALUE_MAX),
    reason: null, clarifications: 0, noResponseCount: 0, noResponseIds: [], confirmResponseIds: [], confirmed: true,
    prefilled: true, prefillSource: { type: k.source, callRecordId: k.callRecordId, at: k.at },
  }]));
}

/**
 * The prompt section. `followUp` is the LeadFollowUp (or a plain object with
 * automation/source/note), `previousCalls` CallRecords (lean), `agentName` the
 * name of the agent who made each call when known.
 */
export function buildFollowUpContext({
  followUp = {}, previousCalls = [], questions = [], known = {}, instructions = '', agentNames = {},
} = {}) {
  const automation = followUp.automation || {};
  const reason = REASON_TEXT[automation.reason] || REASON_TEXT.MANUAL;
  const round = Math.max(1, automation.round || 1);
  const calls = [...previousCalls]
    .sort((a, b) => new Date(b.endedAt || b.createdAt || 0) - new Date(a.endedAt || a.createdAt || 0))
    .slice(0, MAX_CALLS);
  const missing = questions.filter((q) => !known[q.fieldKey]).map((q) => `[${q.fieldKey}] ${clip(q.label || q.text, 80)}`);
  const knownLines = questions.filter((q) => known[q.fieldKey]).map((q) => `[${q.fieldKey}] ${clip(q.label || q.text, 60)}: ${clip(known[q.fieldKey].raw, VALUE_MAX)}`);
  const blockers = [...new Set(calls.flatMap((c) => c.callNotes?.blockers || []))]
    .filter((b) => !/^Call outcome:|required answer\(s\) unresolved|record may be incomplete/i.test(b)).slice(0, 4);
  const requested = followUp.source?.requestedTimeText || automation.timeResolution?.requestedText || null;

  const lines = [
    'FOLLOW-UP CALL CONTEXT (CRM records — use it, never read it out verbatim):',
    `- This is follow-up ${round}. You are calling again because ${reason}.`,
    requested ? `- The lead's words about timing: "${clip(requested, 200)}".` : null,
    followUp.note ? `- Follow-up note: ${clip(followUp.note, 300)}` : null,
    calls.length ? '- Previous conversations (newest first):' : '- There is no recorded previous conversation with this lead.',
    ...calls.map((c, i) => {
      const at = c.endedAt || c.createdAt;
      const who = agentNames[String(c.campaignId)] || 'an AI agent';
      return `  ${i + 1}. ${at ? new Date(at).toISOString().slice(0, 10) : 'earlier'} by ${who}: ${String(c.disposition || 'unknown').replaceAll('_', ' ')}. ${clip(c.callNotes?.summary || '', SUMMARY_MAX)}`;
    }),
    blockers.length ? `- Open points from earlier calls: ${blockers.map((b) => clip(b, 160)).join(' | ')}` : null,
    knownLines.length ? '- Already known — do NOT ask again unless the lead says it changed (then record the new answer):' : null,
    ...knownLines.map((l) => `  • ${l}`),
    missing.length ? `- Still missing: ${missing.join('; ')}` : '- All configured questions already have answers; confirm anything that may have changed and agree the next step.',
    instructions ? `- Follow-up instructions: ${clip(instructions, 1200)}` : null,
    'Open by briefly referring to the previous conversation in one natural sentence, then continue with what is still missing. Never restart the interview from the beginning.',
  ];
  return lines.filter(Boolean).join('\n');
}

export const __test__ = { REASON_TEXT, MAX_CALLS };
