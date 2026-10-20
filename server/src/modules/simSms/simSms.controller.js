import service from './simSms.service.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const q = (req) => req._validatedQuery || req.query;
const wrap = (fn) => async (req, res, next) => { try { return await fn(req, res); } catch (e) { return next(e); } };

export default {
  listCampaigns: wrap(async (req, res) => res.success(await service.listCampaigns(req.user._id, q(req)))),
  createCampaign: wrap(async (req, res) => res.success({ data: await service.createCampaign(req.body, req.user._id, meta(req)), statusCode: 201, message: 'SMS campaign created' })),
  getCampaign: wrap(async (req, res) => res.success({ data: await service.getCampaign(req.params.id, req.user._id) })),
  startCampaign: wrap(async (req, res) => res.success({ data: await service.startCampaign(req.params.id, req.user._id, meta(req)), message: 'SMS campaign started' })),
  pauseCampaign: wrap(async (req, res) => res.success({ data: await service.pauseCampaign(req.params.id, req.user._id, meta(req)), message: 'SMS campaign paused' })),
  cancelCampaign: wrap(async (req, res) => res.success({ data: await service.cancelCampaign(req.params.id, req.user._id, meta(req)), message: 'SMS campaign cancelled' })),
  listConversations: wrap(async (req, res) => res.success(await service.listConversations(req.params.id, req.user._id, q(req)))),
  getConversation: wrap(async (req, res) => res.success({ data: await service.getConversation(req.params.id, req.user._id) })),
  resolveAttention: wrap(async (req, res) => res.success({ data: await service.resolveAttention(req.params.id, req.user._id, req.body) })),
  leadConversations: wrap(async (req, res) => res.success({ data: await service.leadConversations(req.params.leadId, req.user._id) })),

  lease: wrap(async (req, res) => res.success({ data: await service.lease(req.user._id, req.body) })),
  attempting: wrap(async (req, res) => res.success({ data: await service.markAttempting(req.user._id, req.params.id, req.body) })),
  result: wrap(async (req, res) => res.success({ data: await service.reportResult(req.user._id, req.params.id, req.body) })),
  delivery: wrap(async (req, res) => res.success({ data: await service.reportDelivery(req.user._id, req.params.id, req.body) })),
  watchList: wrap(async (req, res) => res.success({ data: { numbers: await service.watchList(req.user._id) } })),
  inbound: wrap(async (req, res) => res.success({ data: await service.receiveInbound(req.user._id, req.body) })),
};
