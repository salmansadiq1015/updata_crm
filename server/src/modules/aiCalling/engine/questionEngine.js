/**
 * Dynamic question engine — a deterministic conversation state machine.
 *
 * The question SEQUENCE is data (the campaign's snapshotted questionnaire), never
 * hardcoded. Given the questionnaire and the current conversation state, the
 * engine decides the single next action. It is pure: the same inputs always
 * yield the same next action, which is what lets the server — not the LLM —
 * remain the authority over the flow.
 *
 * conversationState shape:
 * {
 *   disclosed: boolean,
 *   endedReason: string|null,            // set by control actions (declined/DNC/done)
 *   answers: {
 *     [fieldKey]: {
 *       validation: 'valid'|'invalid'|'unknown'|'unconfirmed',
 *       normalizedValue: *,
 *       rawAnswer: string,
 *       clarifications: number,
 *       confirmed: boolean,
 *     }
 *   }
 * }
 */

export function initConversationState() {
  return { disclosed: false, endedReason: null, answers: {} };
}

/**
 * Normalise a persisted state. Mongoose `minimize` drops empty objects, so a
 * freshly stored state comes back without `answers`; never trust the shape.
 */
export function normalizeState(state) {
  return { ...initConversationState(), ...(state || {}), answers: { ...(state?.answers || {}) } };
}

/** Compare one condition clause against the resolved answers. */
function clauseMatches(clause, answers) {
  const entry = answers[clause.field];
  const value = entry && entry.validation === 'valid' ? entry.normalizedValue : undefined;
  if ('exists' in clause) return clause.exists ? value !== undefined : value === undefined;
  if (value === undefined) return false;
  if ('equals' in clause) return value === clause.equals;
  if ('notEquals' in clause) return value !== clause.notEquals;
  if ('in' in clause) return Array.isArray(clause.in) && clause.in.includes(value);
  if ('gt' in clause) return Number(value) > Number(clause.gt);
  if ('gte' in clause) return Number(value) >= Number(clause.gte);
  if ('lt' in clause) return Number(value) < Number(clause.lt);
  if ('lte' in clause) return Number(value) <= Number(clause.lte);
  return false;
}

/**
 * Whether a question should be shown given prior answers. Supports
 * { all: [clause…] } and { any: [clause…] }. No condition → always shown.
 */
export function conditionMet(condition, answers) {
  if (!condition || (!condition.all && !condition.any)) return true;
  const all = (condition.all || []).every((c) => clauseMatches(c, answers));
  const any = condition.any ? condition.any.some((c) => clauseMatches(c, answers)) : true;
  return all && any;
}

/** A question is "resolved" once it has a valid or an explicit unknown answer. */
function isResolved(entry) {
  return Boolean(entry) && (entry.validation === 'valid' || entry.validation === 'unknown');
}

/** Ordered, condition-eligible questions for the current answers. */
export function eligibleQuestions(questionnaire, answers) {
  return [...(questionnaire.questions || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((q) => conditionMet(q.condition, answers));
}

/**
 * The single next thing the agent should do.
 * @returns {{type:'disclose'|'ask'|'clarify'|'confirm'|'finish'|'end', question?:object, reason?:string}}
 */
export function nextAction(questionnaire, state) {
  if (state.endedReason) return { type: 'end', reason: state.endedReason };
  if (!state.disclosed) return { type: 'disclose' };

  const answers = state.answers || {};
  const eligible = eligibleQuestions(questionnaire, answers);

  for (const q of eligible) {
    const entry = answers[q.fieldKey];
    if (isResolved(entry)) continue;
    // An invalid answer with clarifications left → clarify; otherwise move on
    // (required+unresolved is surfaced at finish, never looped forever).
    if (entry && entry.validation === 'invalid') {
      const max = q.maxClarifications ?? 2;
      if ((entry.clarifications ?? 0) < max) return { type: 'clarify', question: q };
      continue; // give up on this one; it remains unresolved
    }
    return { type: 'ask', question: q };
  }

  // All eligible questions have been attempted. Read back critical answers once.
  const needsConfirm = eligible.find(
    (q) => q.confirmCritical && isResolved(answers[q.fieldKey])
      && answers[q.fieldKey].validation === 'valid' && !answers[q.fieldKey].confirmed,
  );
  if (needsConfirm) return { type: 'confirm', question: needsConfirm };

  return { type: 'finish' };
}

/** Immutably record an answer (validation result) for a question. */
export function applyAnswer(rawState, fieldKey, result) {
  const state = normalizeState(rawState);
  const prev = state.answers[fieldKey] || { clarifications: 0 };
  const clarifications = result.validation === 'invalid'
    ? (prev.clarifications ?? 0) + 1
    : (prev.clarifications ?? 0);
  return {
    ...state,
    answers: {
      ...state.answers,
      [fieldKey]: {
        validation: result.validation,
        normalizedValue: result.normalizedValue ?? null,
        rawAnswer: result.rawAnswer ?? prev.rawAnswer ?? '',
        reason: result.reason ?? null,
        clarifications,
        confirmed: result.confirmed ?? prev.confirmed ?? false,
      },
    },
  };
}

export function markDisclosed(state) {
  return { ...state, disclosed: true };
}

export function markConfirmed(rawState, fieldKey) {
  const state = normalizeState(rawState);
  const entry = state.answers[fieldKey];
  if (!entry) return state;
  return { ...state, answers: { ...state.answers, [fieldKey]: { ...entry, confirmed: true } } };
}

export function endConversation(state, reason) {
  return { ...state, endedReason: reason };
}

/** Required questions that never got a valid, confirmed-or-unknown answer. */
export function unresolvedRequired(questionnaire, state) {
  const answers = state.answers || {};
  return eligibleQuestions(questionnaire, answers)
    .filter((q) => q.required)
    .filter((q) => {
      const entry = answers[q.fieldKey];
      return !entry || entry.validation === 'invalid';
    })
    .map((q) => q.fieldKey);
}

/** Progress metrics for live monitoring / summaries. */
export function progress(questionnaire, state) {
  const answers = state.answers || {};
  const eligible = eligibleQuestions(questionnaire, answers);
  const resolved = eligible.filter((q) => isResolved(answers[q.fieldKey]));
  const valid = eligible.filter((q) => answers[q.fieldKey]?.validation === 'valid');
  return {
    total: eligible.length,
    answered: resolved.length,
    valid: valid.length,
    unresolvedRequired: unresolvedRequired(questionnaire, state),
  };
}
