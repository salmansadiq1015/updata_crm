/**
 * Status-transition rule engine.
 *
 * Turns the collected, *validated* answers plus the call disposition into a
 * single qualification verdict and a requested action. It is pure and never
 * touches the database; aiCalling.service maps the returned action to an
 * allowed lead-status transition (see ACTION_TO_LEAD_STATUS) and applies it with
 * a full audit trail.
 *
 * Guarantees enforced here (the "critical status rules" from the spec):
 *   - A call that merely *completed* never auto-qualifies on its own.
 *   - Unresolved/contradictory required answers force review, never qualification.
 *   - A do-not-contact request overrides every content rule.
 *   - There is no path to "converted"/"closed won" — that stays a human decision.
 */

/** Evaluate one clause against a flat {fieldKey: value} answer map. */
function clauseMatches(clause, values) {
  const value = values[clause.field];
  if ('exists' in clause) return clause.exists ? value !== undefined && value !== null : value === undefined || value === null;
  if (value === undefined || value === null) return false;
  if ('equals' in clause) return value === clause.equals;
  if ('notEquals' in clause) return value !== clause.notEquals;
  if ('in' in clause) return Array.isArray(clause.in) && clause.in.includes(value);
  if ('contains' in clause) return Array.isArray(value) && value.includes(clause.contains);
  if ('gt' in clause) return Number(value) > Number(clause.gt);
  if ('gte' in clause) return Number(value) >= Number(clause.gte);
  if ('lt' in clause) return Number(value) < Number(clause.lt);
  if ('lte' in clause) return Number(value) <= Number(clause.lte);
  return false;
}

export function whenMatches(when, values) {
  if (!when || (!when.all && !when.any)) return false; // a rule must have an explicit condition
  const all = when.all ? when.all.every((c) => clauseMatches(c, values)) : true;
  const any = when.any ? when.any.some((c) => clauseMatches(c, values)) : true;
  return all && any;
}

const ACTION_QUALIFICATION = {
  mark_qualified: 'qualified',
  mark_unqualified: 'unqualified',
  mark_not_interested: 'unqualified',
  mark_do_not_contact: 'do_not_contact',
  schedule_callback: 'callback',
  request_review: 'review',
  mark_contacted: 'none',
  none: 'none',
};

/**
 * @param {object} params
 * @param {Array}  params.statusRules   - campaign.statusRules (ordered)
 * @param {object} params.answers       - flat { fieldKey: normalizedValue } of VALID answers only
 * @param {string} params.disposition   - CallRecord disposition
 * @param {boolean} params.hasUnresolvedRequired - any required question left invalid/unresolved
 * @param {object} [params.control]     - { callbackRequestedAt, callbackText } captured by tools
 * @returns {{qualification, action, ruleId, reason, requiresReview, callback}}
 */
export function evaluateOutcome({ statusRules = [], answers = {}, disposition, hasUnresolvedRequired = false, control = {} } = {}) {
  // 1. Hard, disposition-driven overrides that no content rule may contradict.
  if (disposition === 'do_not_contact') {
    return verdict('do_not_contact', 'mark_do_not_contact', 'disposition:do_not_contact', false, control);
  }
  if (['no_answer', 'busy', 'voicemail', 'failed'].includes(disposition)) {
    // Not a business verdict — the queue/retry logic owns these outcomes.
    return verdict('none', 'none', `disposition:${disposition}`, false, control);
  }
  if (disposition === 'callback_requested') {
    return verdict('callback', 'schedule_callback', 'disposition:callback_requested', false, control);
  }

  // 2. Uncertain data never qualifies — it goes to a human (Rule G).
  if (hasUnresolvedRequired) {
    return verdict('review', 'request_review', 'required_answers_incomplete', true, control);
  }

  // 3. First matching configured content rule wins.
  for (const rule of statusRules) {
    if (whenMatches(rule.when, answers)) {
      const action = rule.action || 'none';
      const requiresReview = Boolean(rule.requiresReview);
      if (requiresReview) {
        return verdict('review', 'request_review', `rule:${rule.id}:requires_review`, true, control, rule.id);
      }
      return verdict(ACTION_QUALIFICATION[action] ?? 'none', action, `rule:${rule.id}`, false, control, rule.id);
    }
  }

  // 4. Declined to participate but no rule matched → not interested, not "lost".
  if (disposition === 'declined') {
    return verdict('unqualified', 'mark_not_interested', 'disposition:declined', false, control);
  }

  // 5. Default: the lead was reached and spoke — record contact, nothing more.
  return verdict('none', 'mark_contacted', 'default:contacted', false, control);
}

function verdict(qualification, action, reason, requiresReview, control, ruleId = null) {
  return {
    qualification,
    action,
    ruleId,
    reason,
    requiresReview,
    callback: action === 'schedule_callback'
      ? { requestedAt: control.callbackRequestedAt || null, note: control.callbackText || null }
      : null,
  };
}

export const __test__ = { clauseMatches };
