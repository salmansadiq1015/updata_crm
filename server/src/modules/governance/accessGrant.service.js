import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { getGovernanceSettings } from '../../shared/security/governanceSettings.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { resolveLeadScope, loadLeadOwnership, evaluateLeadVisibility } from './leadAccess.js';

/**
 * Break-glass access grants + the governance audit trail.
 *
 * In team mode, a user opening a lead they do not own (created by / assigned to)
 * — even one they may see as a supervisor or via `lead:read:all` — must first
 * state a reason. The reason is audited and opens a short-lived grant
 * (LEAD_ACCESS_GRANT_MINUTES) for that user+lead, so the UI prompts once per
 * lead per session rather than on every request. Each distinct kind of access
 * (lead view, transcript read, live listen, …) made under a grant is audited
 * once per grant window with that reason.
 */
export const GOVERNANCE_EVENTS = Object.freeze({
  GRANTED: 'governance.access.granted',
  ACCESSED: 'governance.access.cross_ownership',
  PII_REVEALED: 'governance.pii.revealed',
  EXPORTED: 'governance.data.exported',
  EXPORT_DENIED: 'governance.export.denied',
});

const grantKey = (userId, leadId) => `gov:grant:${userId}:${leadId}`;
const seenKey = (userId, leadId, action) => `gov:seen:${userId}:${leadId}:${action}`;

export function auditMeta(req) {
  return { ipAddress: req?.ip || 'internal', userAgent: req?.get?.('user-agent') || null, path: req?.originalUrl || null };
}

class AccessGrantService {
  async getGrant(userId, leadId) {
    try {
      return (await cacheManager.get(grantKey(userId, leadId))) || null;
    } catch {
      return null;
    }
  }

  /**
   * Open a grant for `leadId` with a stated reason. Own leads need none
   * ({ required:false }); a lead outside the caller's scope is a 404.
   */
  async createGrant(user, { leadId, reason }, meta = {}) {
    const settings = getGovernanceSettings();
    const scope = await resolveLeadScope(user, settings);
    const lead = (await loadLeadOwnership([leadId])).get(String(leadId));
    if (!lead) throw new NotFoundError('Lead', leadId);
    const { visible, own } = evaluateLeadVisibility(scope, lead);
    if (!visible) throw new NotFoundError('Lead', leadId);
    if (own) return { required: false, leadId: String(leadId) };

    const minutes = settings.accessGrantMinutes;
    const grantedAt = new Date();
    const grant = {
      leadId: String(leadId),
      reason: String(reason).trim(),
      grantedAt: grantedAt.toISOString(),
      expiresAt: new Date(grantedAt.getTime() + minutes * 60000).toISOString(),
    };
    await cacheManager.set(grantKey(String(user._id), String(leadId)), grant, { l1Ttl: minutes * 60, l2Ttl: minutes * 60 });
    auditService.logEvent({
      eventType: GOVERNANCE_EVENTS.GRANTED,
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        leadId: String(leadId), reason: grant.reason, expiresAt: grant.expiresAt,
        leadOwner: lead.createdBy ? String(lead.createdBy) : null,
        leadAssignee: lead.assignedTo ? String(lead.assignedTo) : null,
      },
      module: 'governance',
    });
    return { required: true, ...grant };
  }

  /** Audit one kind of cross-ownership access, once per grant window. Never throws. */
  async recordAccess(user, { leadId, action, resource = null, resourceId = null, grant = null }, meta = {}) {
    try {
      const userId = String(user._id);
      const key = seenKey(userId, leadId, action);
      if (await cacheManager.get(key)) return false;
      const ttl = getGovernanceSettings().accessGrantMinutes * 60;
      await cacheManager.set(key, 1, { l1Ttl: ttl, l2Ttl: ttl });
      await auditService.logEvent({
        eventType: GOVERNANCE_EVENTS.ACCESSED,
        userId: user._id,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: {
          leadId: String(leadId), action, resource, resourceId: resourceId ? String(resourceId) : null,
          reason: grant?.reason ?? null, grantedAt: grant?.grantedAt ?? null, path: meta.path || null,
        },
        module: 'governance',
      });
      return true;
    } catch {
      return false;
    }
  }
}

const accessGrantService = new AccessGrantService();
export default accessGrantService;
