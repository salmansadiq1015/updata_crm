/**
 * Work status of an incoming call: where the FOLLOW-UP WORK stands, separate from the technical
 * call status (stateMachine.js), the qualification and the lead status.
 *
 * Set automatically after the call (by the AI agent's routing rules, see `autoWorkStatus`) and then
 * changed by people as they review and work the call. Every change is kept in the call's history
 * with who made it (user, AI agent or system).
 */

export const WORK_STATUSES = Object.freeze(['new', 'in_progress', 'follow_up', 'waiting_on_caller', 'resolved', 'closed', 'spam']);
export const OPEN_WORK_STATUSES = new Set(['new', 'in_progress', 'follow_up', 'waiting_on_caller']);

/** Defaults the agent applies after a call; each agent can override them (CallingAgent.inbound.statusByResult). */
export const DEFAULT_STATUS_BY_RESULT = Object.freeze({
  QUALIFIED: 'new',
  PARTIALLY_QUALIFIED: 'new',
  CALLBACK_REQUIRED: 'new',
  SUPPORT_REQUIRED: 'new',
  UNRESOLVED: 'new',
  INFORMATION_ONLY: 'resolved',
  NOT_QUALIFIED: 'closed',
});

/**
 * Status after post-call processing.
 * @param {object} p
 * @param {string|null} p.outcome         inbound outcome (missed, handled_by_ai, …)
 * @param {string|null} p.qualification   qualification result
 * @param {boolean} p.followUpCreated     an automatic follow-up task exists
 * @param {boolean} p.doNotContact
 * @param {object}  p.rules               agent overrides { [result]: status, HUMAN_HANDLED?: status, MISSED?: status }
 * @returns {{ status: string, reason: string }}
 */
export function autoWorkStatus({ outcome = null, qualification = null, followUpCreated = false, doNotContact = false, rules = {} } = {}) {
  const pick = (key, fallback) => (WORK_STATUSES.includes(rules?.[key]) ? rules[key] : fallback);
  if (doNotContact) return { status: 'closed', reason: 'do_not_contact' };
  if (['missed', 'rejected', 'unanswered'].includes(outcome)) return { status: pick('MISSED', followUpCreated ? 'follow_up' : 'new'), reason: 'missed_call' };
  if (outcome === 'handled_by_human' || outcome === 'transferred') return { status: pick('HUMAN_HANDLED', 'resolved'), reason: 'handled_by_person' };
  if (['interrupted', 'failed'].includes(outcome) && !qualification) return { status: pick('INTERRUPTED', 'new'), reason: 'call_interrupted' };
  const configured = pick(qualification, DEFAULT_STATUS_BY_RESULT[qualification] || 'new');
  // A task already exists for an open result: the call is waiting on that follow-up.
  if (followUpCreated && configured === 'new') return { status: 'follow_up', reason: 'follow_up_created' };
  return { status: configured, reason: qualification ? `qualification_${qualification.toLowerCase()}` : 'no_conversation' };
}
