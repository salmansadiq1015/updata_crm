import leadFollowUpService, { FOLLOW_UP_LIMIT, NOTE_EXCERPT_LENGTH } from './leadFollowUp.service.js';

/**
 * Back-compat shim: the follow-ups agenda is now served by the first-class
 * LeadFollowUp inbox (leadFollowUp.service.js). `listFollowUps` keeps the
 * legacy GET /crm/leads/follow-ups response shape for the mobile app.
 */
export { FOLLOW_UP_LIMIT, NOTE_EXCERPT_LENGTH };

async function listFollowUps(query = {}, userId, now = new Date()) {
  return leadFollowUpService.listLegacy(query, userId, now);
}

export default { listFollowUps };
