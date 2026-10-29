import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped governance context (lead access scope + PII masking decision).
 *
 * The governance middleware (modules/governance/governance.middleware.js) runs
 * the rest of a governed request inside `runWithAccessContext`, so the shared
 * lead query builder and the export/follow-up queries can apply the caller's
 * lead-access filter with a ONE-LINE hook instead of threading `req.user`
 * through every service signature.
 *
 * Outside a governed request (background jobs, scripts, other routers) there is
 * no context and every helper here is a no-op — i.e. company-wide behaviour.
 */
const storage = new AsyncLocalStorage();

export function runWithAccessContext(context, fn) {
  return storage.run(context, fn);
}

export function getAccessContext() {
  return storage.getStore() || null;
}

/**
 * The resolved lead-access Mongo filter for the current request, or `{}` when
 * unrestricted (company mode, `lead:read:all`, Admin, or no governed request).
 */
export function currentLeadAccessFilter() {
  const filter = storage.getStore()?.scope?.filter;
  return filter && Object.keys(filter).length ? filter : {};
}

/** Masks lead rows for the current viewer when PII masking applies (exports). */
export async function maskForCurrentViewer(rows) {
  const ctx = storage.getStore();
  if (!ctx || typeof ctx.shouldMask !== 'function') return rows;
  if (!(await ctx.shouldMask())) return rows;
  const { maskSensitive } = await import('./fieldMasking.js');
  return maskSensitive(rows);
}

export default {
  runWithAccessContext, getAccessContext, currentLeadAccessFilter, maskForCurrentViewer,
};
