import { createNamespaceCache } from '../../shared/cache/namespaceCache.js';

/**
 * Read cache for the Tasks workspace (task list pages, task detail, dashboard and
 * stats tiles). One generation covers them all: any Task / TaskNote / TaskAttachment
 * write — from this module, jobs (overdue pool), workflow automation or AI tools —
 * bumps it through the Mongoose hooks registered in those models, so a cached page
 * can never outlive the write that changed it. TTLs only bound writes that bypass
 * Mongoose and the freshness of populated names (assignee/project renames).
 */
const taskCache = createNamespaceCache('tasks:read', { l1Ttl: 30, l2Ttl: 120 });

export default taskCache;
