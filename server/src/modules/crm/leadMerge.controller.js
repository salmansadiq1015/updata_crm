import leadDuplicateService from './leadDuplicate.service.js';
import leadMergeService from './leadMerge.service.js';
import { NotFoundError, ServiceUnavailableError } from '../../shared/errors/AppError.js';
import { resolveLeadScope, evaluateLeadVisibility, findInaccessibleLeadIds, loadLeadOwnership } from '../governance/leadAccess.js';

const metaOf = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const queryOf = (req) => req._validatedQuery || req.query;

/**
 * Lead-access policy (governance/leadAccess.js): these routes live outside
 * /crm/leads, so they apply the caller's scope themselves. Company mode (the
 * default) is unrestricted; in team mode an out-of-scope lead is a 404.
 */
async function assertVisible(user, leadIds) {
  const scope = await resolveLeadScope(user);
  if (scope.unrestricted) return;
  const hidden = await findInaccessibleLeadIds(scope, leadIds);
  if (hidden.length) throw new NotFoundError('Lead', hidden[0]);
}

class LeadMergeController {
  // ── duplicate review queue ──
  async listGroups(req, res, next) {
    try {
      const scope = await resolveLeadScope(req.user);
      const data = await leadDuplicateService.listGroups(queryOf(req));
      if (!scope.unrestricted) {
        data.groups = data.groups.filter((g) => g.leads.every((lead) => evaluateLeadVisibility(scope, lead).visible));
      }
      return res.success({ data });
    } catch (err) { return next(err); }
  }

  async scan(req, res, next) {
    try {
      const queued = await leadDuplicateService.scheduleScan();
      if (!queued) throw new ServiceUnavailableError('The background queue is unavailable; try again later');
      return res.success({ data: { queued }, message: 'Duplicate scan queued', statusCode: 202 });
    } catch (err) { return next(err); }
  }

  async dismiss(req, res, next) {
    try {
      const data = await leadDuplicateService.dismiss(req.params.id, req.user._id, req.body || {}, metaOf(req));
      return res.success({ data, message: 'Marked as not a duplicate' });
    } catch (err) { return next(err); }
  }

  async reopen(req, res, next) {
    try { return res.success({ data: await leadDuplicateService.reopen(req.params.id, req.user._id, metaOf(req)) }); } catch (err) { return next(err); }
  }

  // ── merges ──
  async preview(req, res, next) {
    try {
      const { survivorId, loserId } = queryOf(req);
      await assertVisible(req.user, [survivorId, loserId]);
      return res.success({ data: await leadMergeService.preview(survivorId, loserId) });
    } catch (err) { return next(err); }
  }

  async merge(req, res, next) {
    try {
      await assertVisible(req.user, [req.body.survivorId, req.body.loserId]);
      const data = await leadMergeService.merge(req.body, req.user._id, metaOf(req));
      return res.success({ data, message: 'Leads merged', statusCode: 201 });
    } catch (err) { return next(err); }
  }

  async list(req, res, next) {
    try {
      const scope = await resolveLeadScope(req.user);
      const { data, pagination } = await leadMergeService.list(queryOf(req));
      if (scope.unrestricted) return res.success({ data, pagination });
      const owners = await loadLeadOwnership(data.map((m) => m.survivorId));
      const visible = data.filter((m) => evaluateLeadVisibility(scope, owners.get(String(m.survivorId))).visible);
      return res.success({ data: visible, pagination });
    } catch (err) { return next(err); }
  }

  async getById(req, res, next) {
    try {
      const data = await leadMergeService.getById(req.params.id);
      await assertVisible(req.user, [data.survivorId]);
      return res.success({ data });
    } catch (err) { return next(err); }
  }

  async resume(req, res, next) {
    try {
      await assertVisible(req.user, [(await leadMergeService.getById(req.params.id)).survivorId]);
      const data = await leadMergeService.resume(req.params.id, req.user._id, metaOf(req));
      return res.success({ data, message: 'Merge completed' });
    } catch (err) { return next(err); }
  }

  async undo(req, res, next) {
    try {
      await assertVisible(req.user, [(await leadMergeService.getById(req.params.id)).survivorId]);
      const data = await leadMergeService.undo(req.params.id, req.user._id, metaOf(req));
      return res.success({ data, message: 'Merge undone' });
    } catch (err) { return next(err); }
  }
}

export default new LeadMergeController();
