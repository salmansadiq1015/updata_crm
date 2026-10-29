import leadTimelineService from './leadTimeline.service.js';
import leadFollowUpService from './leadFollowUp.service.js';
import leadAssignmentService from './leadAssignment.service.js';
import leadQualificationService from './leadQualification.service.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';

/**
 * HTTP handlers for the lead workflow: unified timeline, answer corrections,
 * follow-up inbox and the assignment/SLA policy. Identity and capabilities come
 * from req.user only (never from the request body/query).
 */

export async function viewerOf(req) {
  const isAdmin = req.user?.role?.name === 'Admin';
  const perms = isAdmin ? [] : await loadUserPermissions(req.user);
  const has = (p) => isAdmin || satisfiesPermission(perms, p);
  return {
    id: String(req.user._id),
    department: req.user.department || null,
    isSupervisor: has('lead:assign-policy'),
    canSeeAllTranscripts: has('ai-calling:admin'),
  };
}

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const query = (req) => req._validatedQuery || req.query;

const leadWorkflowController = {
  async timeline(req, res, next) {
    try {
      const result = await leadTimelineService.list(req.params.leadId, query(req), await viewerOf(req));
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { return next(err); }
  },

  async callTranscript(req, res, next) {
    try {
      const data = await leadTimelineService.callTranscript(req.params.leadId, req.params.callId, await viewerOf(req));
      return res.success({ data });
    } catch (err) { return next(err); }
  },

  async correctQualification(req, res, next) {
    try {
      const data = await leadQualificationService.correct(req.params.leadId, req.body, req.user._id);
      return res.success({ data, message: 'Answer corrected', statusCode: 201 });
    } catch (err) { return next(err); }
  },

  async listFollowUps(req, res, next) {
    try {
      const result = await leadFollowUpService.list(query(req), await viewerOf(req));
      return res.success({ data: result.data, pagination: { ...result.pagination, ...result.meta } });
    } catch (err) { return next(err); }
  },

  async followUpSummary(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.summary(query(req), await viewerOf(req)) });
    } catch (err) { return next(err); }
  },

  async getFollowUp(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.getById(req.params.id, await viewerOf(req)) });
    } catch (err) { return next(err); }
  },

  async createFollowUp(req, res, next) {
    try {
      const data = await leadFollowUpService.create(req.body, await viewerOf(req), meta(req));
      return res.success({ data, message: 'Follow-up created', statusCode: 201 });
    } catch (err) { return next(err); }
  },

  async completeFollowUp(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.complete(req.params.id, req.body, await viewerOf(req), meta(req)) });
    } catch (err) { return next(err); }
  },

  async snoozeFollowUp(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.snooze(req.params.id, req.body, await viewerOf(req), meta(req)) });
    } catch (err) { return next(err); }
  },

  async reassignFollowUp(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.reassign(req.params.id, req.body, await viewerOf(req), meta(req)) });
    } catch (err) { return next(err); }
  },

  async cancelFollowUp(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.cancel(req.params.id, req.body, await viewerOf(req), meta(req)) });
    } catch (err) { return next(err); }
  },

  async followUpContactCheck(req, res, next) {
    try {
      return res.success({ data: await leadFollowUpService.contactCheck(req.params.id, query(req).channel, await viewerOf(req)) });
    } catch (err) { return next(err); }
  },

  async getAssignmentPolicy(req, res, next) {
    try {
      const policy = await leadAssignmentService.getPolicy();
      const { rrCounters: _counters, ...data } = policy;
      return res.success({ data });
    } catch (err) { return next(err); }
  },

  async updateAssignmentPolicy(req, res, next) {
    try {
      const policy = await leadAssignmentService.updatePolicy(req.body, req.user._id, meta(req));
      const { rrCounters: _counters, ...data } = policy;
      return res.success({ data, message: 'Assignment policy saved' });
    } catch (err) { return next(err); }
  },
};

export default leadWorkflowController;
