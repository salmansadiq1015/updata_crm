import mongoose from 'mongoose';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { getGovernanceSettings } from '../../shared/security/governanceSettings.js';
import { runWithAccessContext } from '../../shared/security/requestAccessContext.js';
import { maskSensitive, PII_UNMASK_PERMISSION } from '../../shared/security/fieldMasking.js';
import auditService from '../auth/audit.service.js';
import accessGrantService, { GOVERNANCE_EVENTS, auditMeta } from './accessGrant.service.js';
import {
  resolveLeadScope, userHasPermission, loadLeadOwnership, evaluateLeadVisibility, findInaccessibleLeadIds,
} from './leadAccess.js';

/**
 * Lead data governance middleware — ONE hook, mounted in app.js in front of every
 * router that serves lead-linked data:
 *
 *   /api/v1/crm/leads   /api/v1/crm/follow-ups   /api/v1/ai-calling   /api/v1/sim-sms   /api/v1/sim-calls
 *   /api/v1/crm/lead-duplicates   /api/v1/crm/lead-merges
 *
 * With LEAD_ACCESS_MODE=company and PII_MASKING_ENABLED=false (the defaults) it
 * only audit-logs exports and otherwise calls next() untouched.
 *
 * Team mode:
 *  - resolves the caller's lead scope once and runs the request inside the
 *    request access context (list / map / filter options / export / follow-ups
 *    queries apply it through their one-line hooks);
 *  - by-id access (a lead, or a call / SMS conversation / SIM-call task linked to
 *    one) outside the scope → 404 (existence is not leaked); visible but not own
 *    → requires a break-glass grant (428 ACCESS_REASON_REQUIRED) and is audited;
 *  - mutating requests naming lead ids in the body (bulk delete/assign, enrich,
 *    merge, campaign assignment, …) are refused when any id is out of scope.
 *
 * PII masking: JSON responses are masked for viewers without `lead:pii:view`;
 * CSV exports that the governed services build themselves (AI calling) are
 * refused for such viewers; the lead export masks its rows via the context.
 */
const GOVERNED = {
  '/api/v1/crm/leads': {
    targets: [{ re: /^\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'lead' }],
    exports: [{ re: /^\/export\/?$/i, masksRows: true }],
  },
  // Follow-up inbox: lead lookups are scoped through the context; payloads carry lead phone/e-mail.
  '/api/v1/crm/follow-ups': {},
  // Duplicate review + merges: services scope lead lookups via leadAccess; the
  // middleware adds masking and the body-id check (survivorId / loserId).
  '/api/v1/crm/lead-duplicates': {},
  '/api/v1/crm/lead-merges': {},
  '/api/v1/ai-calling': {
    // The voice-agent worker API authenticates with per-call tokens, not users.
    skip: [/^\/agent\//i],
    targets: [
      { re: /^\/leads\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'lead' },
      { re: /^\/calls\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'aiCall' },
    ],
    exports: [
      { re: /^\/campaigns\/[^/]+\/export\/?$/i },
      { re: /^\/analytics\/export\/?$/i },
      { re: /^\/agents\/[^/]+\/call-analytics\/export\/?$/i },
    ],
  },
  '/api/v1/sim-sms': {
    // The Android device is the sender: it must receive the real destination.
    maskExempt: [/^\/device\//i],
    targets: [
      { re: /^\/leads\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'lead' },
      { re: /^\/conversations\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'smsConversation' },
    ],
  },
  '/api/v1/sim-calls': {
    // Claim-next / dial hand the phone the number for that one call.
    maskExempt: [/^\/campaigns\/[^/]+\/next\/?$/i, /^\/tasks\/[^/]+\/dial\/?$/i],
    targets: [
      { re: /^\/leads\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'lead' },
      { re: /^\/tasks\/([0-9a-f]{24})(?:\/(.*))?$/i, kind: 'simCallTask' },
    ],
  },
};

export const GOVERNED_PATHS = Object.freeze(Object.keys(GOVERNED));

// Body keys that name leads on mutating requests.
const BODY_LEAD_KEYS = ['leadId', 'leadIds', 'sourceLeadId', 'sourceLeadIds', 'targetLeadId', 'primaryLeadId',
  'duplicateLeadId', 'duplicateLeadIds', 'mergeLeadIds', 'survivorLeadId', 'survivorId', 'loserId'];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const matchAny = (patterns = [], path) => patterns.find((p) => (p.re || p).test(path)) || null;

function configFor(req) {
  // Express routing is case-insensitive, so the lookup must be too.
  return GOVERNED[String(req.baseUrl || '').toLowerCase().replace(/\/+$/, '')] || null;
}

function collectBodyLeadIds(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const ids = [];
  for (const key of BODY_LEAD_KEYS) {
    const value = body[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string' && mongoose.isValidObjectId(item)) ids.push(item);
    }
  }
  return [...new Set(ids)];
}

/** Authenticate without responding: governance needs the user before the route's own guard runs. */
function silentAuthenticate(req) {
  if (req.user) return Promise.resolve(true);
  if (!req.headers?.authorization) return Promise.resolve(false);
  return new Promise((resolve) => {
    const shim = { fail: () => resolve(false) };
    Promise.resolve(authenticate(req, shim, (err) => resolve(!err))).catch(() => resolve(false));
  });
}

/** What a by-id request means, for the audit trail. */
export function describeAccess(kind, method, subPath = '') {
  const sub = String(subPath || '').split('/')[0];
  if (kind === 'aiCall') {
    if (sub === 'monitor') return 'call.listen';
    return method === 'GET' ? 'transcript.read' : 'call.modify';
  }
  if (kind === 'smsConversation') return method === 'GET' ? 'conversation.view' : 'conversation.modify';
  if (kind === 'simCallTask') return method === 'GET' ? 'call.view' : 'call.modify';
  if (method !== 'GET') return 'lead.modify';
  if (['communications', 'conversations', 'contact-log'].includes(sub)) return 'conversation.view';
  if (['history', 'tasks', 'transitions'].includes(sub)) return 'call.view';
  return 'lead.view';
}

async function resolveTarget(target) {
  if (target.kind === 'lead') return { leadId: target.id, recordOwner: null };
  const models = {
    aiCall: '../aiCalling/callRecord.model.js',
    smsConversation: '../simSms/simSmsConversation.model.js',
    simCallTask: '../simCall/simCallTask.model.js',
  };
  const Model = (await import(models[target.kind])).default;
  const record = await Model.findById(target.id).select('leadId createdBy').lean();
  if (!record?.leadId) return null;
  return { leadId: String(record.leadId), recordOwner: record.createdBy ? String(record.createdBy) : null };
}

function fail(res, statusCode, code, message, details = []) {
  return res.fail({ statusCode, code, message, details });
}

/** Team-mode checks. Returns true when a response has been sent. */
async function enforceScope(req, res, ctx, cfg) {
  const { scope, settings } = ctx;
  const userId = scope.userId;

  const match = (cfg.targets || []).map((t) => ({ t, m: t.re.exec(req.path) })).find((x) => x.m);
  if (match) {
    const target = { kind: match.t.kind, id: match.m[1], subPath: match.m[2] || '' };
    const ref = await resolveTarget(target);
    // A record owned by the caller (their own campaign's call/task/conversation) is theirs.
    if (ref && ref.recordOwner !== userId) {
      const lead = (await loadLeadOwnership([ref.leadId])).get(ref.leadId);
      if (lead) {
        const { visible, own } = evaluateLeadVisibility(scope, lead);
        if (!visible) {
          fail(res, 404, 'NOT_FOUND', 'Lead not found');
          return true;
        }
        if (!own) {
          const grant = await accessGrantService.getGrant(userId, ref.leadId);
          if (!grant && settings.accessReasonRequired) {
            fail(res, 428, 'ACCESS_REASON_REQUIRED', 'This lead belongs to someone else. State a reason to open it.', [
              { field: 'leadId', message: ref.leadId },
            ]);
            return true;
          }
          accessGrantService.recordAccess(req.user, {
            leadId: ref.leadId,
            action: describeAccess(target.kind, req.method, target.subPath),
            resource: target.kind,
            resourceId: target.id,
            grant,
          }, auditMeta(req));
        }
      }
    }
  }

  if (MUTATING.has(req.method) && !scope.unrestricted) {
    const ids = collectBodyLeadIds(req.body);
    if (ids.length) {
      const denied = await findInaccessibleLeadIds(scope, ids);
      if (denied.length) {
        fail(res, 403, 'LEAD_ACCESS_DENIED', `${denied.length} lead(s) are outside your access scope`, [
          { field: 'leadIds', message: `${denied.length} lead(s) are outside your access scope` },
        ]);
        return true;
      }
    }
  }
  return false;
}

function wrapJsonForMasking(res, ctx) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (!body || typeof body !== 'object' || body.success === false || res.statusCode >= 400) return original(body);
    const masked = () => ('data' in body ? { ...body, data: maskSensitive(body.data) } : maskSensitive(body));
    ctx.shouldMask()
      .then((mask) => original(mask ? masked() : body))
      .catch(() => original(masked())); // fail closed
    return res;
  };
}

function auditExportOnFinish(req, res, ctx, exportRule) {
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    Promise.resolve(ctx?.shouldMask ? ctx.shouldMask() : false).then((masked) => auditService.logEvent({
      eventType: GOVERNANCE_EVENTS.EXPORTED,
      userId: req.user._id,
      ...auditMeta(req),
      result: 'success',
      details: {
        path: req.originalUrl,
        format: (req._validatedQuery || req.query)?.format || null,
        piiMasked: Boolean(masked),
        rowsMasked: Boolean(masked && exportRule.masksRows),
        leadAccessMode: getGovernanceSettings().leadAccessMode,
      },
      module: 'governance',
    })).catch(() => {});
  });
}

export function leadGovernance({ settingsFn = getGovernanceSettings } = {}) {
  return async function leadGovernanceMiddleware(req, res, next) {
    const cfg = configFor(req);
    if (!cfg || matchAny(cfg.skip, req.path)) return next();
    const settings = settingsFn();
    const exportRule = matchAny(cfg.exports, req.path);

    if (!settings.teamMode && !settings.piiMaskingEnabled) {
      if (exportRule) auditExportOnFinish(req, res, null, exportRule);
      return next();
    }

    try {
      const maskExempt = Boolean(matchAny(cfg.maskExempt, req.path));
      let maskDecision = null;
      const ctx = {
        req,
        settings,
        scope: null,
        shouldMask: () => {
          if (!settings.piiMaskingEnabled || maskExempt) return Promise.resolve(false);
          if (!maskDecision) {
            maskDecision = req.user
              ? userHasPermission(req.user, PII_UNMASK_PERMISSION).then((canView) => !canView)
              : Promise.resolve(true);
          }
          return maskDecision;
        },
      };

      if (settings.piiMaskingEnabled && !maskExempt) wrapJsonForMasking(res, ctx);

      if (settings.teamMode || (exportRule && settings.piiMaskingEnabled)) await silentAuthenticate(req);

      if (exportRule && settings.piiMaskingEnabled && !exportRule.masksRows && req.user && await ctx.shouldMask()) {
        auditService.logEvent({
          eventType: GOVERNANCE_EVENTS.EXPORT_DENIED,
          userId: req.user._id,
          ...auditMeta(req),
          result: 'failure',
          details: { path: req.originalUrl, requiredPermission: PII_UNMASK_PERMISSION },
          module: 'governance',
        });
        return fail(res, 403, 'PII_PERMISSION_REQUIRED', `Exporting contact data requires ${PII_UNMASK_PERMISSION}`);
      }

      if (settings.teamMode) {
        ctx.scope = req.user
          ? await resolveLeadScope(req.user, settings)
          : { mode: 'team', unrestricted: false, userId: null, supervisedUserIds: [], pools: [], filter: { _id: { $exists: false } } };
        if (req.user && await enforceScope(req, res, ctx, cfg)) return undefined;
      }

      if (exportRule) auditExportOnFinish(req, res, ctx, exportRule);
      return runWithAccessContext(ctx, next);
    } catch (err) {
      return next(err);
    }
  };
}

export default leadGovernance;
