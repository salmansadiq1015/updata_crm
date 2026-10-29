import contactPolicyService from './contactPolicy.service.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const q = (req) => req._validatedQuery || req.query;
const wrap = (fn) => async (req, res, next) => { try { return await fn(req, res); } catch (e) { return next(e); } };

export default {
  getSettings: wrap(async (req, res) => res.success({ data: await contactPolicyService.getSettings() })),
  updateSettings: wrap(async (req, res) => res.success({ data: await contactPolicyService.updateSettings(req.body, req.user._id, meta(req)), message: 'Contact policy saved' })),
  leadStatus: wrap(async (req, res) => res.success({ data: await contactPolicyService.leadStatus(req.params.leadId) })),
  leadCheck: wrap(async (req, res) => res.success({ data: await contactPolicyService.check({ leadId: req.params.leadId, channel: q(req).channel, campaignId: q(req).campaignId }) })),
  campaignSkips: wrap(async (req, res) => res.success({ data: await contactPolicyService.campaignSkips(req.params.source, req.params.campaignId) })),
};
