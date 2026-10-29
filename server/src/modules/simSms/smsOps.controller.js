import deviceService from './smsDevice.service.js';
import reviewService from './smsAnswerReview.service.js';
import recoveryService from './recovery.service.js';
import callbackService from './smsCallback.service.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const q = (req) => req._validatedQuery || req.query;
const wrap = (fn) => async (req, res, next) => { try { return await fn(req, res); } catch (e) { return next(e); } };

/** SMS operations: device dashboard, answer review queue, recovery inbox, callbacks. */
export default {
  heartbeat: wrap(async (req, res) => res.success({ data: await deviceService.heartbeat(req.user._id, req.body) })),
  listDevices: wrap(async (req, res) => res.success({ data: await deviceService.list(req.user._id) })),
  getDevice: wrap(async (req, res) => res.success({ data: await deviceService.get(req.user._id, req.params.deviceId) })),
  requestResync: wrap(async (req, res) => res.success({ data: await deviceService.requestResync(req.user._id, req.params.deviceId, meta(req)), message: 'Resync requested' })),

  listReviews: wrap(async (req, res) => res.success(await reviewService.list(req.user._id, q(req)))),
  reviewCounts: wrap(async (req, res) => res.success({ data: await reviewService.counts(req.user._id) })),
  getReview: wrap(async (req, res) => res.success({ data: await reviewService.get(req.user._id, req.params.id) })),
  resolveReview: wrap(async (req, res) => res.success({ data: await reviewService.resolve(req.user._id, req.params.id, req.body, meta(req)), message: 'Review saved' })),

  listRecovery: wrap(async (req, res) => res.success(await recoveryService.list(req.user._id, q(req)))),
  recoveryCounts: wrap(async (req, res) => res.success({ data: await recoveryService.counts(req.user._id) })),
  getRecovery: wrap(async (req, res) => res.success({ data: await recoveryService.get(req.user._id, req.params.id) })),
  recoveryAction: wrap(async (req, res) => res.success({ data: await recoveryService.act(req.user._id, req.params.id, req.body, meta(req)) })),
  bulkDismiss: wrap(async (req, res) => res.success({ data: await recoveryService.bulkDismiss(req.user._id, req.body, meta(req)) })),

  listCallbacks: wrap(async (req, res) => res.success({ data: await callbackService.list(req.user._id) })),
};
