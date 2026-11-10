/**
 * Public (unauthenticated) Workflow Automation endpoints.
 *
 *   GET|HEAD /t/:token                          tracked link → 302 to the stored destination
 *   POST /api/v1/workflow-hooks/:workflowId/:token   inbound webhook trigger
 *
 * The webhook is authorised by the per-workflow secret token in the URL (generated
 * server-side, compared in constant time). Payloads identify the lead by leadId, phone
 * or email; anything else is rejected. Requests are rate-limited at mount time.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import links from './workflowLink.service.js';
import runner from './workflow.runner.js';
import { Workflow } from './workflow.models.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';

export const linkRouter = Router();

const notFoundPage = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Link expired</title><body style="font-family:system-ui;padding:40px;text-align:center;color:#334155"><h1 style="font-size:20px">This link is no longer available</h1></body>';

const handleLink = async (req, res, next) => {
  try {
    const result = await links.click(req.params.token, req);
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (!result) return res.status(404).type('html').send(notFoundPage);
    return res.redirect(302, result.url);
  } catch (error) { return next(error); }
};
// 1×1 transparent GIF for email open tracking (always served; counting happens in the service).
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
linkRouter.get('/o/:token.gif', async (req, res) => {
  try { await links.open(req.params.token, req); } catch { /* never break image loading */ }
  res.set('Cache-Control', 'no-store, private');
  res.set('Content-Type', 'image/gif');
  return res.status(200).send(PIXEL);
});
linkRouter.get('/:token', handleLink);
linkRouter.head('/:token', handleLink);

export const hookRouter = Router();

const sameToken = (a, b) => {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

hookRouter.post('/:workflowId/:token', async (req, res, next) => {
  try {
    const { workflowId, token } = req.params;
    if (!mongoose.isValidObjectId(workflowId) || !/^[A-Za-z0-9_-]{24,64}$/.test(token)) return res.status(404).json({ success: false, message: 'Not found' });
    const wf = await Workflow.findOne({ _id: workflowId, triggerType: 'trigger.webhook' }).lean();
    if (!wf || !sameToken(wf.triggerConfig?.token, token)) return res.status(404).json({ success: false, message: 'Not found' });
    if (wf.status !== 'published') return res.status(409).json({ success: false, message: 'Workflow is not active' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { default: Lead } = await import('../crm/lead.model.js');
    let lead = null;
    if (body.leadId && mongoose.isValidObjectId(body.leadId)) lead = await Lead.findOne({ _id: body.leadId, isDeleted: { $ne: true } }).select('_id').lean();
    else if (body.email) lead = await Lead.findOne({ email: String(body.email).trim().toLowerCase(), isDeleted: { $ne: true } }).select('_id').lean();
    else if (body.phone) {
      const { normalizePhone } = await import('../businessDiscovery/engine/normalizer.js');
      const parsed = normalizePhone(String(body.phone), undefined);
      if (parsed?.valid) lead = await Lead.findOne({ normalizedPhone: parsed.e164, isDeleted: { $ne: true } }).select('_id').lean();
    }
    if (!lead) return res.status(422).json({ success: false, message: 'Lead not found: send leadId, email or phone of an existing lead' });

    const data = body.data && typeof body.data === 'object' ? body.data : {};
    if (JSON.stringify(data).length > 10_000) return res.status(413).json({ success: false, message: 'data must be at most 10 KB' });
    const eventId = String(body.eventId || req.get('x-event-id') || crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')).slice(0, 100);
    const result = await runner.enroll({
      workflow: wf, leadId: lead._id, trigger: { type: 'trigger.webhook', eventId, data }, enrollmentKey: `${wf._id}:${lead._id}:webhook:${eventId}`,
    });
    try { eventBus.publish(EVENT_TYPES.WORKFLOW_WEBHOOK_RECEIVED, { workflowId: String(wf._id), leadId: String(lead._id), eventId, data }, { source: 'workflow-webhook' }); } catch { /* best effort */ }
    logger.info('Workflow webhook received', { module: 'workflow', workflowId: String(wf._id), enrolled: Boolean(result.run), skipped: result.skipped || null });
    return res.status(202).json({ success: true, data: { accepted: true, runId: result.run?._id || null, skipped: result.skipped || null } });
  } catch (error) { return next(error); }
});
