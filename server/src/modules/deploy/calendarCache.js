import { createNamespaceCache } from '../../shared/cache/namespaceCache.js';

/**
 * Read cache for the scheduling calendar (GET /scheduling/calendar).
 *
 * One write generation covers every source the calendar merges: Assignment,
 * EmployeeAvailability and CoarseAllocation bump it through Mongoose hooks
 * registered in their models (any module, any write path); PM schedule entries
 * and project/customer changes bump it through deploy.events.js. The short TTL
 * bounds what has no hook: employee renames/deactivation and raw-driver writes.
 */
const calendarCache = createNamespaceCache('deploy:calendar', { l1Ttl: 15, l2Ttl: 60 });

export default calendarCache;
