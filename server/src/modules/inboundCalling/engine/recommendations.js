/**
 * Next-best actions after an incoming call. Recommendations are suggestions the user approves
 * or executes; nothing here sends a message. Each has a stable id so re-processing a call
 * never duplicates them and an executed/dismissed state survives recomputation.
 */

export const RECOMMENDATION_ACTIONS = Object.freeze([
  'SEND_SERVICE_INFO', 'SEND_PRICING', 'SCHEDULE_DEMO', 'ARRANGE_CALLBACK', 'ASSIGN_SALES_REP',
  'REQUEST_MISSING_INFO', 'ESCALATE_SUPPORT', 'RESOLVE_COMPLAINT', 'RETURN_MISSED_CALL', 'REVIEW_CALLER_MATCH',
]);

/** Which follow-up channel + task type an action becomes when executed. */
export const ACTION_FOLLOW_UP = Object.freeze({
  SEND_SERVICE_INFO: { channel: 'email', taskType: 'EMAIL', priority: 'NORMAL', dueHours: 4 },
  SEND_PRICING: { channel: 'email', taskType: 'EMAIL', priority: 'HIGH', dueHours: 4 },
  SCHEDULE_DEMO: { channel: 'phone', taskType: 'MEETING', priority: 'HIGH', dueHours: 24 },
  ARRANGE_CALLBACK: { channel: 'phone', taskType: 'PHONE_CALL', priority: 'HIGH', dueHours: 2 },
  ASSIGN_SALES_REP: { channel: 'phone', taskType: 'PHONE_CALL', priority: 'NORMAL', dueHours: 24 },
  REQUEST_MISSING_INFO: { channel: 'phone', taskType: 'PHONE_CALL', priority: 'NORMAL', dueHours: 24 },
  ESCALATE_SUPPORT: { channel: 'phone', taskType: 'CUSTOM_TASK', priority: 'HIGH', dueHours: 2 },
  RESOLVE_COMPLAINT: { channel: 'phone', taskType: 'CUSTOM_TASK', priority: 'CRITICAL', dueHours: 1 },
  RETURN_MISSED_CALL: { channel: 'phone', taskType: 'PHONE_CALL', priority: 'HIGH', dueHours: 1 },
  REVIEW_CALLER_MATCH: { channel: null, taskType: 'CUSTOM_TASK', priority: 'NORMAL', dueHours: 24 },
});

export function recommend({ status, outcome, intents = {}, qualification = {}, callbackRequested = false, humanRequested = false, matchStatus = null, presentation = 'available', unresolvedQuestions = [] }) {
  const out = [];
  const add = (action, reason) => { if (!out.some((r) => r.action === action)) out.push({ id: action, action, reason }); };
  const all = new Set([intents.primary, ...(intents.secondary || [])].filter(Boolean));

  if (matchStatus === 'ambiguous') add('REVIEW_CALLER_MATCH', 'The number matches more than one lead; link the call to the right one.');
  if (['missed', 'rejected', 'failed', 'unanswered'].includes(outcome) && presentation === 'available') {
    add('RETURN_MISSED_CALL', 'The caller did not reach anyone.');
    return out;
  }
  if (all.has('COMPLAINT')) add('RESOLVE_COMPLAINT', 'The caller raised a complaint.');
  if (all.has('SUPPORT_REQUEST') || all.has('TECHNICAL_SUPPORT')) add('ESCALATE_SUPPORT', 'The caller needs support.');
  if (humanRequested) add('ARRANGE_CALLBACK', 'The caller asked to speak to a person.');
  if (callbackRequested) add('ARRANGE_CALLBACK', 'The caller asked for a callback.');
  if (all.has('PRICING_INQUIRY')) add('SEND_PRICING', 'The caller asked about prices.');
  if (all.has('APPOINTMENT_REQUEST')) add('SCHEDULE_DEMO', 'The caller asked for a meeting or demo.');
  if (all.has('SERVICE_INQUIRY') || all.has('PRODUCT_INQUIRY')) add('SEND_SERVICE_INFO', 'The caller asked about products or services.');
  if (qualification.result === 'QUALIFIED') add('ASSIGN_SALES_REP', 'The caller meets the qualification criteria.');
  if (qualification.result === 'PARTIALLY_QUALIFIED' && qualification.missing?.length) {
    add('REQUEST_MISSING_INFO', `Still missing: ${qualification.missing.join(', ')}.`);
  }
  if (unresolvedQuestions.length && !out.some((r) => r.action === 'ARRANGE_CALLBACK')) {
    add('ARRANGE_CALLBACK', `${unresolvedQuestions.length} caller question(s) were not answered.`);
  }
  if (status === 'INTERRUPTED' && !out.length && presentation === 'available') add('RETURN_MISSED_CALL', 'The call was cut off.');
  return out;
}
