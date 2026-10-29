/**
 * Tenant-isolation startup guard.
 *
 * updata_crm is single-tenant: no collection carries a tenant id and no request,
 * job, event or storage path enforces one (see docs/PLATFORM-GOVERNANCE.md,
 * "Tenant isolation"). `MULTI_TENANT_MODE=true` therefore must never "half work":
 * the server refuses to start instead of silently serving several companies from
 * one shared dataset.
 */
export const TENANCY_ERROR = 'MULTI_TENANT_MODE=true but tenant isolation is not implemented; '
  + 'refusing to start. See docs/PLATFORM-GOVERNANCE.md#tenant-isolation.';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

/** Throws when multi-tenant mode is requested. Accepts a raw env object or the Joi-validated values. */
export function assertTenancySupported(env = process.env) {
  const raw = env?.MULTI_TENANT_MODE;
  const enabled = raw === true || TRUE_VALUES.has(String(raw ?? '').trim().toLowerCase());
  if (enabled) {
    const err = new Error(TENANCY_ERROR);
    err.code = 'TENANCY_NOT_IMPLEMENTED';
    throw err;
  }
}

export default assertTenancySupported;
