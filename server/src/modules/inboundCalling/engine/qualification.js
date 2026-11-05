import { SALES_INTENTS, SUPPORT_INTENTS } from './intents.js';

/**
 * Inbound lead qualification. Deterministic and explainable: the result says WHICH criteria
 * were met and which were missing. It is evaluated from explicitly provided caller information
 * only — inferred values never count towards qualification — and it is independent of how the
 * call ended (a completed call is not a qualified lead; an interrupted call can still be).
 */

export const QUALIFICATION_RESULTS = Object.freeze([
  'QUALIFIED', 'PARTIALLY_QUALIFIED', 'NOT_QUALIFIED', 'CALLBACK_REQUIRED', 'SUPPORT_REQUIRED', 'INFORMATION_ONLY', 'UNRESOLVED',
]);

export const DEFAULT_CRITERIA = Object.freeze({
  required: ['full_name', 'service_interest', 'requirements'],
  anyOf: ['timeline', 'budget', 'decision_role'],
});

const has = (fields, key) => fields.some((f) => f.key === key && f.explicit !== false && f.verification !== 'rejected' && String(f.value ?? '').trim());

/**
 * @param {object} p
 * @param {Array}  p.fields     extracted fields [{ key, value, explicit, verification }]
 * @param {object} p.intents    { primary, secondary }
 * @param {boolean} p.callbackRequested
 * @param {boolean} p.humanRequested
 * @param {boolean} p.notInterested  caller explicitly declined
 * @param {number} p.callerTurns   how many times the caller spoke
 * @param {object} p.criteria   { required[], anyOf[] }
 */
export function evaluateQualification({
  fields = [], intents = {}, callbackRequested = false, humanRequested = false, notInterested = false,
  callerTurns = 0, criteria = DEFAULT_CRITERIA,
}) {
  const all = [intents.primary, ...(intents.secondary || [])].filter(Boolean);
  const sales = all.some((i) => SALES_INTENTS.has(i));
  const support = all.some((i) => SUPPORT_INTENTS.has(i));
  const required = criteria.required?.length ? criteria.required : DEFAULT_CRITERIA.required;
  const anyOf = criteria.anyOf || [];
  const met = required.filter((k) => has(fields, k));
  const missing = required.filter((k) => !has(fields, k));
  const anyMet = anyOf.filter((k) => has(fields, k));
  const reasons = [];

  if (callerTurns === 0 && !fields.length) return { result: 'UNRESOLVED', reasons: ['no_conversation'], met, missing, score: 0 };
  if (notInterested) return { result: 'NOT_QUALIFIED', reasons: ['caller_not_interested'], met, missing, score: 0 };

  const score = Math.round(100 * (met.length + (anyOf.length ? Math.min(1, anyMet.length) : 0)) / (required.length + (anyOf.length ? 1 : 0)));

  if (sales) {
    if (!missing.length && (!anyOf.length || anyMet.length)) {
      reasons.push('all_required_criteria_met');
      return { result: 'QUALIFIED', reasons, met, missing, score };
    }
    if (callbackRequested) return { result: 'CALLBACK_REQUIRED', reasons: ['callback_requested', 'criteria_incomplete'], met, missing, score };
    if (has(fields, 'service_interest') || has(fields, 'requirements')) {
      return { result: 'PARTIALLY_QUALIFIED', reasons: ['interest_stated', 'criteria_incomplete'], met, missing, score };
    }
    return { result: 'UNRESOLVED', reasons: ['sales_intent_without_details'], met, missing, score };
  }
  if (support) return { result: 'SUPPORT_REQUIRED', reasons: ['support_or_complaint'], met, missing, score };
  if (callbackRequested || humanRequested) return { result: 'CALLBACK_REQUIRED', reasons: [callbackRequested ? 'callback_requested' : 'human_requested'], met, missing, score };
  if (all.includes('GENERAL_INFORMATION')) return { result: 'INFORMATION_ONLY', reasons: ['general_information'], met, missing, score };
  return { result: 'UNRESOLVED', reasons: ['intent_unclear'], met, missing, score };
}
