import mongoose from 'mongoose';
import AuditLog from '../auth/auditLog.model.js';
import auditService from '../auth/audit.service.js';
import { getGovernanceSettings } from '../../shared/security/governanceSettings.js';
import { PII_UNMASK_PERMISSION } from '../../shared/security/fieldMasking.js';
import { AppError, AuthorizationError, NotFoundError } from '../../shared/errors/AppError.js';
import accessGrantService, { GOVERNANCE_EVENTS } from './accessGrant.service.js';
import {
  resolveLeadScope, evaluateLeadVisibility, userHasPermission, LEAD_READ_ALL_PERMISSION,
} from './leadAccess.js';

/**
 * Governance service: client-facing settings, audited "reveal for action" of
 * lead contact data, and the access log (who opened / revealed / exported what).
 */
const REVEAL_PERMISSION = Object.freeze({
  view: PII_UNMASK_PERMISSION,
  call: 'lead:write',
  sms: 'lead:write',
  email: 'lead:write',
  whatsapp: 'lead:whatsapp',
});

const ACTION_EVENTS = Object.freeze({
  grant: [GOVERNANCE_EVENTS.GRANTED],
  access: [GOVERNANCE_EVENTS.ACCESSED],
  reveal: [GOVERNANCE_EVENTS.PII_REVEALED],
  export: [GOVERNANCE_EVENTS.EXPORTED, GOVERNANCE_EVENTS.EXPORT_DENIED],
});
const ALL_EVENTS = Object.values(GOVERNANCE_EVENTS);

const encodeCursor = (row) => Buffer.from(`${new Date(row.timestamp).toISOString()}|${row._id}`).toString('base64url');
function decodeCursor(cursor) {
  try {
    const [ts, id] = Buffer.from(String(cursor), 'base64url').toString('utf8').split('|');
    const date = new Date(ts);
    if (Number.isNaN(date.getTime()) || !mongoose.isValidObjectId(id)) return null;
    return { date, id: new mongoose.Types.ObjectId(id) };
  } catch {
    return null;
  }
}

function toEntry(row, leadNames) {
  const d = row.details || {};
  return {
    id: String(row._id),
    timestamp: row.timestamp,
    eventType: row.eventType,
    result: row.result,
    userId: row.userId ? String(row.userId) : null,
    userName: row.userName || null,
    leadId: d.leadId ? String(d.leadId) : null,
    leadName: d.leadId ? leadNames.get(String(d.leadId)) ?? null : null,
    action: d.action || (row.eventType === GOVERNANCE_EVENTS.PII_REVEALED ? `pii.${d.purpose || 'view'}` : row.eventType.split('.').slice(1).join('.')),
    reason: d.reason ?? null,
    purpose: d.purpose ?? null,
    fields: d.fields ?? null,
    path: d.path ?? null,
    piiMasked: d.piiMasked ?? null,
    ipAddress: row.ipAddress || null,
  };
}

async function leadNamesFor(rows) {
  const ids = [...new Set(rows.map((r) => r.details?.leadId).filter(Boolean).map(String))]
    .filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return new Map();
  const Lead = (await import('../crm/lead.model.js')).default;
  const leads = await Lead.find({ _id: { $in: ids } }).select('_id name leadNumber').lean();
  return new Map(leads.map((l) => [String(l._id), [l.leadNumber, l.name].filter(Boolean).join(' · ')]));
}

class GovernanceService {
  /** What the client needs to render governance-aware UI for the current user. */
  async settingsFor(user) {
    const s = getGovernanceSettings();
    const [canViewPii, canReadAll, canReadAccessLog] = await Promise.all([
      userHasPermission(user, PII_UNMASK_PERMISSION),
      userHasPermission(user, LEAD_READ_ALL_PERMISSION),
      userHasPermission(user, 'audit:read'),
    ]);
    return {
      leadAccessMode: s.leadAccessMode,
      accessReasonRequired: s.teamMode && s.accessReasonRequired,
      accessGrantMinutes: s.accessGrantMinutes,
      piiMaskingEnabled: s.piiMaskingEnabled,
      piiMaskedForMe: s.piiMaskingEnabled && !canViewPii,
      canViewPii,
      canReadAllLeads: !s.teamMode || canReadAll,
      canReadAccessLog,
      simSmsCostRecorded: s.simSmsCostPerMessage !== null,
    };
  }

  /**
   * Return a lead's real contact values for ONE declared purpose. Dialling and
   * sending stay server-resolved; this exists for the cases where the person must
   * see/use the value (open the phone's dialer, copy an address) while masking
   * is on. Always audited; rate-limited at the route.
   */
  async revealContact(user, leadId, { purpose, fields }, meta = {}) {
    const settings = getGovernanceSettings();
    const Lead = (await import('../crm/lead.model.js')).default;
    const lead = await Lead.findById(leadId).select('_id createdBy assignedTo source phone mobile email').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const scope = await resolveLeadScope(user, settings);
    const { visible, own } = evaluateLeadVisibility(scope, lead);
    if (!visible) throw new NotFoundError('Lead', leadId);

    let grant = null;
    if (settings.teamMode && !own) {
      grant = await accessGrantService.getGrant(String(user._id), String(leadId));
      if (!grant && settings.accessReasonRequired) {
        throw new AppError('This lead belongs to someone else. State a reason to open it.', 428, 'ACCESS_REASON_REQUIRED', [
          { field: 'leadId', message: String(leadId) },
        ]);
      }
    }

    // Without masking everyone with lead:read already sees the values.
    const required = purpose === 'view' && !settings.piiMaskingEnabled ? 'lead:read' : REVEAL_PERMISSION[purpose];
    if (!(await userHasPermission(user, required))) {
      auditService.logEvent({
        eventType: GOVERNANCE_EVENTS.PII_REVEALED,
        userId: user._id,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'failure',
        details: { leadId: String(leadId), purpose, fields, requiredPermission: required },
        module: 'governance',
      });
      throw new AuthorizationError(`Revealing contact data for '${purpose}' requires ${required}`);
    }

    const values = {};
    for (const field of fields) values[field] = lead[field] ?? null;
    auditService.logEvent({
      eventType: GOVERNANCE_EVENTS.PII_REVEALED,
      userId: user._id,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        leadId: String(leadId),
        purpose,
        fields: fields.filter((f) => values[f]),
        reason: grant?.reason ?? null,
        own,
      },
      module: 'governance',
    });
    return { leadId: String(leadId), purpose, values };
  }

  /** Governance audit events, newest first, cursor-paginated. */
  async accessLog({ userId, leadId, action, from, to, cursor, limit = 50 } = {}) {
    const clauses = [{ module: 'governance', eventType: { $in: action ? ACTION_EVENTS[action] : ALL_EVENTS } }];
    if (userId) clauses.push({ userId: new mongoose.Types.ObjectId(String(userId)) });
    if (leadId) clauses.push({ 'details.leadId': String(leadId) });
    if (from || to) {
      clauses.push({ timestamp: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) } });
    }
    const after = cursor ? decodeCursor(cursor) : null;
    if (after) {
      clauses.push({ $or: [{ timestamp: { $lt: after.date } }, { timestamp: after.date, _id: { $lt: after.id } }] });
    }
    const rows = await AuditLog.find({ $and: clauses }).sort({ timestamp: -1, _id: -1 }).limit(limit + 1).lean();
    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const [named, leadNames] = await Promise.all([auditService.withUserNames(page), leadNamesFor(page)]);
    return {
      data: named.map((row) => toEntry(row, leadNames)),
      pagination: { hasNext, nextCursor: hasNext ? encodeCursor(page[page.length - 1]) : null, limit },
    };
  }

  /** Who accessed one lead (for the lead drawer). */
  async leadAccessLog(leadId, { limit = 50 } = {}) {
    return this.accessLog({ leadId, limit });
  }
}

const governanceService = new GovernanceService();
export default governanceService;
