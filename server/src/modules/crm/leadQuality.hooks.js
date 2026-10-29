/**
 * Fire-and-forget lead-quality hooks for write paths owned by other modules
 * (lead create/import, communication completion, AI call results).
 *
 * They only ENQUEUE work (debounced rescore, duplicate detection) and never
 * throw, reject or block the caller. Neither service imports lead.service,
 * so importing this file cannot create an import cycle.
 */
import leadDuplicateService from './leadDuplicate.service.js';
import leadScoringService from './leadScoring.service.js';
import logger from '../../shared/logger/index.js';

function swallow(action) {
  return (err) => logger.debug('Lead quality hook skipped', { module: 'crm', action, error: { message: err?.message } });
}

/** New leads (single create, file import, extension import, discovery import). */
export function onLeadsCreated(leadIds = []) {
  const ids = (Array.isArray(leadIds) ? leadIds : [leadIds]).filter(Boolean).map(String);
  if (!ids.length) return;
  Promise.resolve()
    .then(() => leadDuplicateService.scheduleDetect(ids))
    .catch(swallow('leadQuality.onLeadsCreated.duplicates'));
  Promise.resolve()
    .then(() => Promise.all(ids.slice(0, 500).map((id) => leadScoringService.scheduleRecompute(id, 'created'))))
    .catch(swallow('leadQuality.onLeadsCreated.score'));
}

/** Engagement / qualification recorded for a lead → debounced rescore. */
export function onLeadSignalsChanged(leadId, reason = 'signal') {
  if (!leadId) return;
  Promise.resolve()
    .then(() => leadScoringService.scheduleRecompute(String(leadId), reason))
    .catch(swallow('leadQuality.onLeadSignalsChanged'));
}

export default { onLeadsCreated, onLeadSignalsChanged };
