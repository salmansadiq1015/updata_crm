import teamService from './team.service.js';
import governanceService from './governance.service.js';
import accessGrantService from './accessGrant.service.js';
import { userHasPermission } from './leadAccess.js';
import { AuthorizationError } from '../../shared/errors/AppError.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent'), path: req.originalUrl });
const query = (req) => req._validatedQuery || req.query;

/** Governance controller: teams, break-glass grants, PII reveal, access log. */
class GovernanceController {
  async settings(req, res, next) {
    try { return res.success({ data: await governanceService.settingsFor(req.user) }); } catch (e) { return next(e); }
  }

  async listTeams(req, res, next) {
    try { return res.success({ data: await teamService.list(query(req)) }); } catch (e) { return next(e); }
  }

  async getTeam(req, res, next) {
    try { return res.success({ data: await teamService.get(req.params.id) }); } catch (e) { return next(e); }
  }

  async createTeam(req, res, next) {
    try {
      const data = await teamService.create(req.body, req.user._id, meta(req));
      return res.success({ data, message: 'Team created', statusCode: 201 });
    } catch (e) { return next(e); }
  }

  /** team:manage edits anything; a team's own manager may edit only its membership. */
  async updateTeam(req, res, next) {
    try {
      const canManage = await userHasPermission(req.user, 'team:manage');
      if (!canManage) {
        const isManager = await teamService.isManagerOf(req.params.id, req.user._id);
        const onlyMembers = Object.keys(req.body).every((key) => key === 'members');
        if (!isManager || !onlyMembers) throw new AuthorizationError('Insufficient permissions. Required: team:manage');
      }
      const data = await teamService.update(req.params.id, req.body, req.user._id, meta(req));
      return res.success({ data, message: 'Team updated' });
    } catch (e) { return next(e); }
  }

  async deleteTeam(req, res, next) {
    try { return res.success({ data: await teamService.remove(req.params.id, req.user._id, meta(req)), message: 'Team deleted' }); } catch (e) { return next(e); }
  }

  async createGrant(req, res, next) {
    try {
      const data = await accessGrantService.createGrant(req.user, req.body, meta(req));
      return res.success({ data, message: data.required ? 'Access granted' : 'No reason needed for your own lead', statusCode: 201 });
    } catch (e) { return next(e); }
  }

  async reveal(req, res, next) {
    try {
      const data = await governanceService.revealContact(req.user, req.params.leadId, req.body, meta(req));
      res.setHeader('Cache-Control', 'no-store');
      return res.success({ data });
    } catch (e) { return next(e); }
  }

  async accessLog(req, res, next) {
    try {
      const { data, pagination } = await governanceService.accessLog(query(req));
      return res.success({ data, pagination });
    } catch (e) { return next(e); }
  }

  async leadAccessLog(req, res, next) {
    try {
      const { data, pagination } = await governanceService.leadAccessLog(req.params.leadId, query(req));
      return res.success({ data, pagination });
    } catch (e) { return next(e); }
  }
}

const governanceController = new GovernanceController();
export default governanceController;
