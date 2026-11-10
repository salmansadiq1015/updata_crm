import service from './workflow.service.js';
import copilot from './copilot/copilot.service.js';
import auditService from '../auth/audit.service.js';
import { isAiConfigured } from '../../shared/ai/llmFactory.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const q = (req) => req._validatedQuery || req.query;
const wrap = (fn) => async (req, res, next) => { try { return await fn(req, res); } catch (e) { return next(e); } };
const user = (req) => req.user._id;

export default {
  catalog: wrap(async (req, res) => res.success({ data: service.catalog() })),
  templates: wrap(async (req, res) => res.success({ data: service.templates() })),
  list: wrap(async (req, res) => { const r = await service.list(q(req)); return res.success({ data: r.items, pagination: r.pagination }); }),
  get: wrap(async (req, res) => res.success({ data: await service.get(req.params.id) })),
  create: wrap(async (req, res) => res.success({ data: await service.create(req.body, user(req), meta(req)), statusCode: 201, message: 'Workflow created' })),
  update: wrap(async (req, res) => res.success({ data: await service.update(req.params.id, req.body, user(req), meta(req)), message: 'Workflow saved' })),
  remove: wrap(async (req, res) => res.success({ data: await service.remove(req.params.id, user(req), meta(req)) })),
  validate: wrap(async (req, res) => res.success({ data: await service.validate(req.body?.graph || req.params.id) })),
  publish: wrap(async (req, res) => res.success({ data: await service.publish(req.params.id, req.body, user(req), meta(req)), message: 'Workflow published' })),
  setStatus: wrap(async (req, res) => res.success({ data: await service.setStatus(req.params.id, req.body.status, user(req), meta(req)) })),
  versions: wrap(async (req, res) => res.success({ data: await service.versions(req.params.id) })),
  getVersion: wrap(async (req, res) => res.success({ data: await service.getVersion(req.params.id, req.params.version) })),
  rollback: wrap(async (req, res) => res.success({ data: await service.rollback(req.params.id, req.params.version, user(req), meta(req)), message: 'Rolled back' })),
  duplicate: wrap(async (req, res) => res.success({ data: await service.duplicate(req.params.id, user(req), meta(req)), statusCode: 201 })),
  test: wrap(async (req, res) => res.success({ data: await service.test(req.params.id, req.body) })),

  listCampaigns: wrap(async (req, res) => { const r = await service.listCampaigns(q(req)); return res.success({ data: r.items, pagination: r.pagination }); }),
  getCampaign: wrap(async (req, res) => res.success({ data: await service.getCampaign(req.params.id) })),
  createCampaign: wrap(async (req, res) => res.success({ data: await service.createCampaign(req.body, user(req), meta(req)), statusCode: 201 })),
  previewCampaign: wrap(async (req, res) => res.success({ data: await service.previewCampaign(req.body) })),
  startCampaign: wrap(async (req, res) => res.success({ data: await service.startCampaign(req.params.id, user(req), meta(req)) })),
  pauseCampaign: wrap(async (req, res) => res.success({ data: await service.pauseCampaign(req.params.id, user(req), meta(req)) })),
  resumeCampaign: wrap(async (req, res) => res.success({ data: await service.resumeCampaign(req.params.id, user(req), meta(req)) })),
  stopCampaign: wrap(async (req, res) => res.success({ data: await service.stopCampaign(req.params.id, user(req), meta(req)) })),

  listRuns: wrap(async (req, res) => { const r = await service.listRuns(q(req)); return res.success({ data: r.items, pagination: r.pagination }); }),
  getRun: wrap(async (req, res) => res.success({ data: await service.getRun(req.params.id) })),
  controlRun: wrap(async (req, res) => res.success({ data: await service.controlRun(req.params.id, req.params.action, req.body || {}, user(req), meta(req)) })),
  listEvents: wrap(async (req, res) => { const r = await service.listEvents(q(req)); return res.success({ data: r.items, pagination: r.pagination }); }),
  analytics: wrap(async (req, res) => res.success({ data: await service.analytics(q(req)) })),
  leadHistory: wrap(async (req, res) => res.success({ data: await service.leadHistory(req.params.leadId) })),

  /** Workflow Copilot — Server-Sent Events stream of copilot events (status/op/question/message/done). */
  async copilot(req, res, next) {
    let workflow;
    try {
      workflow = await service.get(req.params.id);
      if (workflow.status === 'archived') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Archived workflows are read-only' } });
      if (!isAiConfigured()) return res.status(503).json({ success: false, error: { code: 'AI_NOT_CONFIGURED', message: 'The AI assistant is not configured' } });
    } catch (e) { return next(e); }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const controller = new globalThis.AbortController();
    req.on('close', () => controller.abort());
    const send = (event) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15000);
    let ops = 0;
    try {
      for await (const event of copilot.run({ workflow, messages: req.body.messages, graph: req.body.graph, selectedNodeId: req.body.selectedNodeId, locale: req.body.locale, apply: req.body.apply || null, userId: req.user._id, signal: controller.signal })) {
        if (event.type === 'op') ops += 1;
        send(event);
      }
    } catch (error) {
      if (!controller.signal.aborted) send({ type: 'error', message: error?.status === 429 ? 'The AI service is busy. Please try again in a moment.' : 'The AI assistant could not complete this request.' });
    } finally {
      clearInterval(heartbeat);
      auditService.logEvent({ eventType: 'workflow.copilot.turn', module: 'workflow', userId: req.user._id, ipAddress: req.ip, result: 'success', details: { workflowId: String(req.params.id), ops, messages: req.body.messages.length } });
      res.end();
    }
    return undefined;
  },
};
