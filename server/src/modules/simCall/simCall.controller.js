import service from './simCall.service.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const q = (req) => req._validatedQuery || req.query;
const wrap = (fn) => async (req, res, next) => { try { return await fn(req, res); } catch (e) { return next(e); } };
const me = (req) => req.user._id;

export default {
  listCampaigns: wrap(async (req, res) => res.success(await service.listCampaigns(me(req), q(req)))),
  createCampaign: wrap(async (req, res) => res.success({ data: await service.createCampaign(req.body, me(req), meta(req)), statusCode: 201, message: 'Call campaign created' })),
  getCampaign: wrap(async (req, res) => res.success({ data: await service.getCampaign(req.params.id, me(req)) })),
  updateCampaign: wrap(async (req, res) => res.success({ data: await service.updateCampaign(req.params.id, req.body, me(req), meta(req)), message: 'Call campaign updated' })),
  startCampaign: wrap(async (req, res) => res.success({ data: await service.startCampaign(req.params.id, me(req), meta(req)), message: 'Call campaign started' })),
  resumeCampaign: wrap(async (req, res) => res.success({ data: await service.resumeCampaign(req.params.id, me(req), meta(req)), message: 'Call campaign resumed' })),
  pauseCampaign: wrap(async (req, res) => res.success({ data: await service.pauseCampaign(req.params.id, me(req), meta(req)), message: 'Call campaign paused' })),
  cancelCampaign: wrap(async (req, res) => res.success({ data: await service.cancelCampaign(req.params.id, me(req), meta(req)), message: 'Call campaign cancelled' })),
  retry: wrap(async (req, res) => res.success({ data: await service.retryTasks(req.params.id, me(req), req.body, meta(req)) })),
  listTasks: wrap(async (req, res) => res.success(await service.listTasks(req.params.id, me(req), q(req)))),
  listEvents: wrap(async (req, res) => res.success(await service.listEvents(req.params.id, me(req), q(req)))),
  claimNext: wrap(async (req, res) => res.success({ data: await service.claimNext(req.params.id, me(req), req.body) })),

  getTask: wrap(async (req, res) => res.success({ data: await service.getTask(req.params.id, me(req)) })),
  dial: wrap(async (req, res) => res.success({ data: await service.dial(req.params.id, me(req), req.body, meta(req)) })),
  release: wrap(async (req, res) => res.success({ data: await service.releaseTask(req.params.id, me(req), req.body) })),
  skip: wrap(async (req, res) => res.success({ data: await service.skipTask(req.params.id, me(req), req.body) })),
  saveAnswers: wrap(async (req, res) => res.success({ data: await service.saveAnswers(req.params.id, me(req), req.body) })),
  complete: wrap(async (req, res) => res.success({ data: await service.completeTask(req.params.id, me(req), req.body, meta(req)) })),
  retrySync: wrap(async (req, res) => res.success({ data: await service.retrySync(req.params.id, me(req)) })),
  reschedule: wrap(async (req, res) => res.success({ data: await service.rescheduleCallback(req.params.id, me(req), req.body) })),
  cancelCallback: wrap(async (req, res) => res.success({ data: await service.cancelCallback(req.params.id, me(req)) })),

  callbacks: wrap(async (req, res) => res.success(await service.listCallbacks(me(req), q(req)))),
  leadTasks: wrap(async (req, res) => res.success({ data: await service.leadTasks(req.params.leadId, me(req)) })),
};
