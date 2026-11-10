/**
 * Workflow run engine — a persistent, lease-guarded state machine.
 *
 *  advance(runId)  acquire the run's lease (Mongo CAS on lockUntil), then execute nodes
 *                  until the run waits, ends or fails. Every step is persisted as
 *                  'running' (with its actionKey) BEFORE its side-effect, so a crash or
 *                  restart replays the same step with the same idempotency key.
 *  kick(runId)     enqueue an advance on the BullMQ queue (falls back to in-process).
 *  sweep()         every minute: due timers/polls, expired leases, schedule triggers,
 *                  campaign completion. This is the durability backstop — no state lives
 *                  only in memory or in Redis.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  Workflow, WorkflowCampaign, WorkflowEvent, WorkflowRun, WorkflowVersion,
} from './workflow.models.js';
import { HANDLERS } from './engine/handlers.js';
import { findTrigger, nextNodeId } from './engine/graph.js';
import { normalizeConfig } from './engine/nodeConfig.js';
import { nextScheduleFire } from './engine/time.js';
import {
  ACTIVE_RUN_STATUSES, LIMITS, NODE_CATALOG, TERMINAL_RUN_STATUSES, WORKFLOW_QUEUE,
} from './workflow.constants.js';
import logger from '../../shared/logger/index.js';

const MIN = 60_000;
const str = (v) => (v == null ? null : String(v));
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Published versions are immutable → cache their graphs.
const versionCache = new Map();
async function loadVersion(versionId) {
  const key = String(versionId);
  if (versionCache.has(key)) return versionCache.get(key);
  const v = await WorkflowVersion.findById(versionId).lean();
  if (v) { versionCache.set(key, v); if (versionCache.size > 500) versionCache.delete(versionCache.keys().next().value); }
  return v;
}

export async function recordEvent({ type, run = null, workflowId = null, leadId = null, nodeId = null, data = null, dedupeKey, actor = null, at = new Date() }) {
  try {
    await WorkflowEvent.create({
      type, at, actor, nodeId, data,
      workflowId: run?.workflowId || workflowId, runId: run?._id || null, campaignId: run?.campaignId || null, leadId: run?.leadId || leadId,
      ...(dedupeKey ? { dedupeKey: String(dedupeKey).slice(0, 200) } : {}),
    });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    logger.warn('Workflow event write failed', { module: 'workflow', type, error: error.message });
    return false;
  }
}

async function leadTimeline(run, type, details) {
  try {
    const { recordLeadEvent } = await import('../crm/leadEvent.model.js');
    await recordLeadEvent({ leadId: run.leadId, type, details: { workflowId: str(run.workflowId), runId: str(run._id), ...details }, dedupeKey: `wf-run:${run._id}:${type}` });
  } catch { /* timeline is best effort */ }
}

class WorkflowRunner {
  constructor() {
    this.inline = false; // tests: run advances in-process and awaited
    this._inlineDepth = 0;
  }

  // ------------------------------------------------------------------------- scheduling
  async kick(runId, { delayMs = 0 } = {}) {
    if (this.inline) {
      if (delayMs > 0) return;
      if (this._inlineDepth > 20) return;
      this._inlineDepth += 1;
      try { await this.advance(runId); } finally { this._inlineDepth -= 1; }
      return;
    }
    try {
      const { default: queueManager } = await import('../../shared/queue/QueueManager.js');
      await queueManager.addJob(WORKFLOW_QUEUE, 'advance', { runId: String(runId) }, {
        jobId: `wf-adv-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, delay: delayMs, attempts: 1,
        removeOnComplete: { age: 3600, count: 2000 }, removeOnFail: { age: 86400 },
      });
    } catch (error) {
      // Queue offline → in-process fallback; the sweep recovers anything lost.
      logger.warn('Workflow queue unavailable, advancing in-process', { module: 'workflow', runId: String(runId), error: error.message });
      setTimeout(() => this.advance(runId).catch((e) => logger.error('Workflow advance failed', { module: 'workflow', error: e.message })), delayMs);
    }
  }

  async _acquire(runId) {
    const now = new Date();
    const token = crypto.randomUUID();
    const run = await WorkflowRun.findOneAndUpdate(
      { _id: runId, status: { $in: ['pending', 'queued', 'running', 'waiting'] }, $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }] },
      { $set: { lockToken: token, lockUntil: new Date(now.getTime() + LIMITS.leaseMs) } },
      { returnDocument: 'after' },
    ).lean();
    return run ? { run, token } : null;
  }

  async _save(run, token, set, extra = {}) {
    const res = await WorkflowRun.updateOne({ _id: run._id, lockToken: token }, { $set: { ...set, lockUntil: new Date(Date.now() + LIMITS.leaseMs) }, ...extra });
    if (!res.matchedCount) throw Object.assign(new Error('Workflow run lease lost'), { code: 'LEASE_LOST' });
    Object.assign(run, set);
  }

  async _release(run, token, set = {}, extra = {}) {
    await WorkflowRun.updateOne({ _id: run._id, lockToken: token }, { $set: { ...set, lockToken: null, lockUntil: null }, ...extra });
  }

  // ------------------------------------------------------------------------- advance
  async advance(runId) {
    const acquired = await this._acquire(runId);
    if (!acquired) return { skipped: 'locked_or_inactive' };
    const { run, token } = acquired;
    try {
      const version = await loadVersion(run.versionId);
      const workflow = await Workflow.findById(run.workflowId).select('name status settings').lean();
      if (!version || !workflow) return this._finish(run, token, 'failed', { code: 'workflow_missing', message: 'Workflow or version no longer exists' });
      const graph = version.graph;
      const nodes = new Map(graph.nodes.map((n) => [n.id, n]));

      for (let i = 0; i < LIMITS.maxStepsPerAdvance; i += 1) {
        // Pause / stop requested by a person or the campaign since the last step?
        const live = await WorkflowRun.findById(run._id).select('status').lean();
        if (!live || !['pending', 'queued', 'running', 'waiting'].includes(live.status)) { await this._release(run, token); return { stopped: live?.status }; }
        if (run.campaignId) {
          const campaign = await WorkflowCampaign.findById(run.campaignId).select('status').lean();
          if (campaign?.status === 'paused') {
            await this._release(run, token, { status: 'paused', pausedAt: new Date(), pausedBy: 'campaign' });
            await recordEvent({ type: 'run.paused', run, data: { by: 'campaign' } });
            return { paused: true };
          }
          if (campaign?.status === 'stopped') return this._finish(run, token, 'cancelled', { code: 'campaign_stopped', message: 'Campaign stopped' });
        }

        let result; let node; let step;
        if (run.status === 'waiting') {
          node = nodes.get(run.wait?.nodeId);
          if (!node) return this._finish(run, token, 'failed', { code: 'node_missing', message: 'Waiting node missing from version' });
          const due = !run.nextRunAt || new Date(run.nextRunAt) <= new Date() || run.wait?.resumeEvent;
          if (!due) { await this._release(run, token); return { waiting: true }; }
          step = run.steps[run.steps.length - 1];
          const ctx = this._ctx({ run, node, step, workflow, actionKey: step?.actionKey });
          ctx.timedOut = Boolean(run.wait?.until && new Date(run.wait.until) <= new Date());
          if (run.wait?.kind === 'retry') {
            // Re-execute the same step (same actionKey) after a transient failure.
            await this._save(run, token, { status: 'running', wait: emptyWait(), nextRunAt: null, [`steps.${run.steps.length - 1}.attempt`]: (step.attempt || 1) + 1, [`steps.${run.steps.length - 1}.status`]: 'running' });
            step.attempt = (step.attempt || 1) + 1;
            result = await this._safeExecute(HANDLERS[node.type].execute, ctx);
          } else {
            const handler = HANDLERS[node.type];
            result = handler.resume ? await this._safeExecute(handler.resume, ctx) : { status: 'completed', port: NODE_CATALOG[node.type].outputs[0] };
          }
        } else {
          // queued / pending / running (a running run here = crash replay of its last step).
          let nodeId = run.currentNodeId;
          if (!nodeId) {
            const trigger = findTrigger(graph);
            if (!trigger) return this._finish(run, token, 'failed', { code: 'trigger_missing', message: 'Version has no trigger' });
            nodeId = trigger.id;
            await this._save(run, token, { status: 'running', currentNodeId: nodeId, startedAt: run.startedAt || new Date() });
          } else if (run.status !== 'running') await this._save(run, token, { status: 'running', startedAt: run.startedAt || new Date() });
          node = nodes.get(nodeId);
          if (!node) return this._finish(run, token, 'failed', { code: 'node_missing', message: `Node ${nodeId} missing from version` });
          const last = run.steps[run.steps.length - 1];
          if (last && last.nodeId === nodeId && last.status === 'running') {
            step = last; // replay with the same actionKey
          } else {
            const visits = { ...(run.visits || {}) };
            visits[nodeId] = (visits[nodeId] || 0) + 1;
            const maxVisits = Math.min(Number(node.data?.config?.maxVisits) || LIMITS.defaultMaxVisits, LIMITS.maxMaxVisits);
            if (visits[nodeId] > maxVisits) return this._finish(run, token, 'failed', { code: 'loop_limit', message: `Node visited more than ${maxVisits} times`, nodeId });
            if ((run.stepCount || 0) + 1 > LIMITS.maxStepsPerRun) return this._finish(run, token, 'failed', { code: 'step_limit', message: 'Run exceeded the step limit', nodeId });
            step = {
              _id: new mongoose.Types.ObjectId(), nodeId, type: node.type, label: node.data?.label || '', visit: visits[nodeId], attempt: 1, status: 'running', port: null,
              actionKey: `${run._id}:${nodeId}:${visits[nodeId]}:${run.context?.manualRetries || 0}`, startedAt: new Date(), endedAt: null, output: null,
            };
            await this._save(run, token, { visits, stepCount: (run.stepCount || 0) + 1 }, { $push: { steps: step } });
            run.steps = [...run.steps, step];
          }
          const handler = HANDLERS[node.type];
          if (!handler) return this._finish(run, token, 'failed', { code: 'node_type_unknown', message: node.type, nodeId });
          result = await this._safeExecute(handler.execute, this._ctx({ run, node, step, workflow, actionKey: step.actionKey }));
        }

        const outcome = await this._apply(run, token, { node, step, result, graph });
        if (outcome !== 'continue') return { status: run.status };
      }
      // Step budget for this advance spent: continue in a fresh job (keeps jobs short).
      await this._release(run, token, { status: 'queued' });
      await this.kick(run._id);
      return { continued: true };
    } catch (error) {
      if (error?.code === 'LEASE_LOST') return { skipped: 'lease_lost' };
      logger.error('Workflow advance crashed', { module: 'workflow', runId: String(run._id), error: error.message, stack: error.stack });
      // Leave the step 'running' and the lease to expire: the sweep replays it with the same key.
      await WorkflowRun.updateOne({ _id: run._id, lockToken: token }, { $set: { lockToken: null, lockUntil: new Date(Date.now() + MIN), 'error.message': String(error.message).slice(0, 500) } });
      return { error: error.message };
    }
  }

  _ctx({ run, node, step, workflow, actionKey }) {
    return {
      run, node, step, workflow, actionKey, keyHash: hash(actionKey || `${run._id}:${node.id}`),
      config: normalizeConfig(node.type, node.data?.config), dry: false, _lead: undefined,
    };
  }

  async _safeExecute(fn, ctx) {
    try { return await fn(ctx); } catch (error) {
      const transient = error?.statusCode === 503 || /ECONN|timed out|unavailable|topology|pool/i.test(error?.message || '');
      if (transient) return { status: 'retry', at: new Date(Date.now() + 5 * MIN), reason: error.message };
      return { status: 'failed', error: { code: error?.code && typeof error.code === 'string' ? error.code.toLowerCase() : 'node_error', message: String(error?.message || error).slice(0, 500) } };
    }
  }

  async _apply(run, token, { node, step, result, graph }) {
    const idx = run.steps.findIndex((s) => String(s._id) === String(step._id));
    const at = (k) => `steps.${idx}.${k}`;
    const now = new Date();

    if (result.status === 'waiting') {
      const until = result.wait?.until ? new Date(result.wait.until) : null;
      const pollAt = result.pollAt ? new Date(result.pollAt) : null;
      const next = [until, pollAt].filter(Boolean).sort((a, b) => a - b)[0] || null;
      const firstWait = run.status !== 'waiting';
      await this._release(run, token, {
        status: 'waiting', currentNodeId: node.id, nextRunAt: next,
        wait: { ...emptyWait(), ...result.wait, nodeId: node.id, startedAt: firstWait ? now : (run.wait?.startedAt || now), resumeEvent: null },
        [at('status')]: 'waiting', ...(result.output ? { [at('output')]: result.output } : {}),
      });
      run.status = 'waiting';
      if (firstWait) await recordEvent({ type: 'node.waiting', run, nodeId: node.id, data: { kind: result.wait?.kind, until }, dedupeKey: `${step.actionKey}:waiting` });
      return 'stop';
    }

    if (result.status === 'retry') {
      if ((step.attempt || 1) >= 100) result = { status: 'failed', error: { code: 'retry_exhausted', message: result.reason } };
      else {
        await this._release(run, token, {
          status: 'waiting', currentNodeId: node.id, nextRunAt: result.at,
          wait: { ...emptyWait(), kind: 'retry', nodeId: node.id, until: null, startedAt: now, data: { reason: String(result.reason || '').slice(0, 300) } },
          [at('status')]: 'waiting', [at('error')]: { code: 'retry_scheduled', message: String(result.reason || '').slice(0, 500) },
        });
        run.status = 'waiting';
        await recordEvent({ type: 'node.retry_scheduled', run, nodeId: node.id, data: { at: result.at, reason: result.reason, attempt: step.attempt } });
        return 'stop';
      }
    }

    if (result.status === 'failed') {
      await recordEvent({ type: 'node.failed', run, nodeId: node.id, data: result.error, dedupeKey: `${step.actionKey}:failed:${step.attempt || 1}` });
      // A connected "Failed" branch is the user's error handling: continue there (the error
      // stays on the step for the inspector). Otherwise the run fails.
      const failTarget = (NODE_CATALOG[node.type]?.outputs || []).includes('failed') ? nextNodeId(graph, node.id, 'failed') : null;
      if (failTarget) {
        await this._save(run, token, {
          [at('status')]: 'completed', [at('endedAt')]: now, [at('port')]: 'failed', [at('error')]: result.error,
          [at('output')]: { failed: true, error: result.error }, wait: emptyWait(), nextRunAt: null, currentNodeId: failTarget, status: 'running',
        });
        return 'continue';
      }
      await this._save(run, token, { [at('status')]: 'failed', [at('endedAt')]: now, [at('error')]: result.error });
      await this._finish(run, token, 'failed', { ...result.error, nodeId: node.id });
      return 'stop';
    }

    // completed
    const contextPatch = result.context || {};
    const context = { ...(run.context || {}), ...contextPatch };
    await this._save(run, token, {
      [at('status')]: 'completed', [at('endedAt')]: now, [at('port')]: result.port || null, [at('output')]: result.output ?? null,
      context, wait: emptyWait(), nextRunAt: null,
    });
    run.context = context;
    const meta = NODE_CATALOG[node.type];
    if (meta.category !== 'trigger') {
      await recordEvent({
        type: node.type === 'logic.condition' ? 'branch.selected' : 'node.completed', run, nodeId: node.id,
        data: { nodeType: node.type, port: result.port || null, ...(node.type === 'logic.condition' ? { trace: result.output?.trace } : {}) },
        dedupeKey: `${step.actionKey}:completed`,
      });
    }
    if (result.end) { await this._finish(run, token, 'completed', null, result.end); return 'stop'; }
    const target = result.port ? nextNodeId(graph, node.id, result.port) : null;
    if (!target) {
      // Unconnected port: blocked → skipped, failed → failed, anything else → completed.
      if (result.port === 'blocked') await this._finish(run, token, 'skipped', { code: 'contact_blocked', message: result.output?.reason || 'blocked', nodeId: node.id });
      else if (result.port === 'failed') await this._finish(run, token, 'failed', { code: result.output?.reason || 'node_failed', message: 'Step ended on its failure branch', nodeId: node.id });
      else await this._finish(run, token, 'completed', null, 'completed');
      return 'stop';
    }
    await this._save(run, token, { currentNodeId: target, status: 'running' });
    return 'continue';
  }

  async _finish(run, token, status, error = null, outcome = null) {
    const finalOutcome = outcome || (status === 'failed' ? 'failed' : status === 'cancelled' ? 'stopped' : null);
    await this._release(run, token, {
      status, completedAt: new Date(), nextRunAt: null, outcome: finalOutcome,
      ...(error ? { error: { code: error.code || null, message: error.message ? String(error.message).slice(0, 500) : null, nodeId: error.nodeId || null } } : {}),
    }, { $unset: { activeKey: 1 } });
    run.status = status;
    await recordEvent({ type: `run.${status}`, run, data: { outcome: finalOutcome, error }, dedupeKey: `run:${run._id}:${status}:${run.stepCount}` });
    await leadTimeline(run, status === 'completed' ? 'automation.completed' : status === 'cancelled' ? 'automation.stopped' : 'automation.failed', { outcome: finalOutcome, status, error: error?.code || null });
    return { status };
  }

  // ------------------------------------------------------------------------- enrollment
  /**
   * Create a run (idempotent on enrollmentKey). Returns { run } | { skipped: reason }.
   */
  async enroll({ workflow, leadId, trigger = {}, campaignId = null, enrollmentKey, versionId = null, kickNow = true }) {
    const versionRef = versionId || workflow.publishedVersionId;
    if (!versionRef) return { skipped: 'not_published' };
    const version = await loadVersion(versionRef);
    if (!version) return { skipped: 'version_missing' };
    const reentry = workflow.settings?.reentry || 'after_completion';
    if (reentry === 'never' && await WorkflowRun.exists({ workflowId: workflow._id, leadId })) return { skipped: 'already_enrolled' };
    const doc = {
      workflowId: workflow._id, versionId: version._id, version: version.version, leadId, campaignId, ownerId: workflow.createdBy,
      status: 'queued', enrollmentKey: String(enrollmentKey).slice(0, 300),
      ...(reentry === 'always' ? {} : { activeKey: `${workflow._id}:${leadId}` }),
      trigger: { type: trigger.type || version.triggerType, eventId: trigger.eventId || null, data: trigger.data || null },
      context: { event: trigger.data || null },
    };
    let run;
    try { run = await WorkflowRun.create(doc); } catch (error) {
      if (error?.code === 11000) return { skipped: error.keyPattern?.activeKey ? 'already_active' : 'duplicate_event' };
      throw error;
    }
    await recordEvent({ type: 'run.enrolled', run, data: { trigger: run.trigger.type, campaignId: str(campaignId), version: version.version } });
    await leadTimeline(run, 'automation.enrolled', { workflowName: workflow.name, version: version.version, trigger: run.trigger.type });
    if (kickNow) await this.kick(run._id);
    return { run: run.toObject() };
  }

  // ------------------------------------------------------------------------- signals
  /** Resume event-waiting runs of this lead that wait for `waitEvent`. */
  async resumeWaiting({ leadId, waitEvent, data = {}, excludeWorkflowId = null }) {
    if (!leadId) return 0;
    const filter = { leadId, status: 'waiting', 'wait.kind': 'event', 'wait.events': waitEvent, 'wait.resumeEvent': null };
    if (excludeWorkflowId) filter.workflowId = { $ne: excludeWorkflowId };
    const runs = await WorkflowRun.find(filter).select('_id').limit(100).lean();
    let n = 0;
    for (const { _id } of runs) {
      const res = await WorkflowRun.updateOne({ _id, status: 'waiting', 'wait.resumeEvent': null }, { $set: { 'wait.resumeEvent': { type: waitEvent, data, at: new Date() }, nextRunAt: new Date() } });
      if (res.modifiedCount) { n += 1; await this.kick(_id); }
    }
    return n;
  }

  /** An AI call finished: poke the run that launched it (the resume reads the real state). */
  async pokeRun(runId) {
    const res = await WorkflowRun.updateOne({ _id: runId, status: 'waiting', 'wait.kind': { $in: ['ai_call', 'analysis', 'callback'] } }, { $set: { nextRunAt: new Date() } });
    if (res.modifiedCount) await this.kick(runId);
  }

  // ------------------------------------------------------------------------- sweep
  async sweep({ now = new Date(), limit = 200 } = {}) {
    const due = await WorkflowRun.find({ status: 'waiting', nextRunAt: { $lte: now }, $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }] })
      .select('_id').sort({ nextRunAt: 1 }).limit(limit).lean();
    const stale = await WorkflowRun.find({
      status: { $in: ['queued', 'pending', 'running'] }, updatedAt: { $lt: new Date(now.getTime() - 2 * MIN) },
      $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }],
    }).select('_id').limit(limit).lean();
    for (const { _id } of [...due, ...stale]) await this.kick(_id);
    const fired = await this._fireSchedules(now);
    await this._completeCampaigns();
    return { due: due.length, recovered: stale.length, schedules: fired };
  }

  async _fireSchedules(now) {
    const workflows = await Workflow.find({ status: 'published', triggerType: 'trigger.schedule', nextFireAt: { $lte: now } }).limit(20).lean();
    let fired = 0;
    for (const wf of workflows) {
      const config = normalizeConfig('trigger.schedule', wf.triggerConfig);
      const next = nextScheduleFire(config, now);
      // CAS on nextFireAt: only one process fires a given occurrence.
      const claimed = await Workflow.updateOne({ _id: wf._id, nextFireAt: wf.nextFireAt }, { $set: { nextFireAt: next } });
      if (!claimed.modifiedCount) continue;
      fired += 1;
      const { default: Lead } = await import('../crm/lead.model.js');
      const seg = config.segment || {};
      const filter = { isDeleted: { $ne: true }, mergedInto: null };
      if (seg.statuses?.length) filter.status = { $in: seg.statuses };
      if (seg.tags?.length) filter.tags = { $in: seg.tags };
      if (seg.sources?.length) filter.source = { $in: seg.sources };
      const leads = await Lead.find(filter).select('_id').sort({ createdAt: 1 }).limit(config.limit).lean();
      const occurrence = new Date(wf.nextFireAt).toISOString();
      for (const lead of leads) {
        await this.enroll({ workflow: wf, leadId: lead._id, trigger: { type: 'trigger.schedule', eventId: occurrence, data: { firedAt: occurrence } }, enrollmentKey: `${wf._id}:${lead._id}:schedule:${occurrence}` });
      }
      await recordEvent({ type: 'schedule.fired', workflowId: wf._id, data: { occurrence, enrolled: leads.length } });
    }
    return fired;
  }

  /**
   * Event retention (daily job). Deletes workflow events older than
   * WORKFLOW_EVENT_RETENTION_DAYS (default 365, minimum 30; 0 disables). Events of runs that are
   * still active are kept, so de-duplication and the run timeline stay intact while a run lives.
   * Runs, versions and lead timeline entries (LeadEvent) are never touched.
   */
  async purgeOldEvents({ now = new Date(), days = Number(process.env.WORKFLOW_EVENT_RETENTION_DAYS ?? 365), batch = 5000 } = {}) {
    if (!Number.isFinite(days) || days <= 0) return { deleted: 0, disabled: true };
    const keepDays = Math.max(30, Math.floor(days));
    const cutoff = new Date(now.getTime() - keepDays * 86400000);
    const activeRunIds = await WorkflowRun.distinct('_id', { status: { $in: ACTIVE_RUN_STATUSES } });
    let deleted = 0;
    for (let i = 0; i < 200; i += 1) {
      const ids = await WorkflowEvent.find({ at: { $lt: cutoff }, runId: { $nin: activeRunIds } }).select('_id').limit(batch).lean();
      if (!ids.length) break;
      deleted += (await WorkflowEvent.deleteMany({ _id: { $in: ids.map((d) => d._id) } })).deletedCount;
      if (ids.length < batch) break;
    }
    if (deleted) logger.info('Workflow events purged', { module: 'workflow', deleted, keepDays });
    return { deleted, keepDays, cutoff };
  }

  async _completeCampaigns() {
    const running = await WorkflowCampaign.find({ status: 'running' }).select('_id').limit(50).lean();
    for (const c of running) {
      if (!await WorkflowRun.exists({ campaignId: c._id, status: { $in: ACTIVE_RUN_STATUSES } })) {
        await WorkflowCampaign.updateOne({ _id: c._id, status: 'running' }, { $set: { status: 'completed', completedAt: new Date() } });
      }
    }
  }

  // ------------------------------------------------------------------------- manual controls
  async pause(runId) {
    const run = await WorkflowRun.findOneAndUpdate({ _id: runId, status: { $in: ['pending', 'queued', 'running', 'waiting'] } }, { $set: { status: 'paused', pausedAt: new Date(), pausedBy: 'user' } }, { returnDocument: 'after' }).lean();
    return run;
  }

  async resume(runId) {
    const current = await WorkflowRun.findOne({ _id: runId, status: 'paused' }).select('wait').lean();
    if (!current) return null;
    const nextStatus = current.wait?.kind ? 'waiting' : 'queued';
    const run = await WorkflowRun.findOneAndUpdate({ _id: runId, status: 'paused' }, { $set: { status: nextStatus, pausedAt: null, pausedBy: null, lockToken: null, lockUntil: null, ...(nextStatus === 'waiting' ? { nextRunAt: new Date() } : {}) } }, { returnDocument: 'after' }).lean();
    if (run) await this.kick(run._id);
    return run;
  }

  async cancel(runId, reason = 'manual') {
    const run = await WorkflowRun.findOneAndUpdate(
      { _id: runId, status: { $in: ACTIVE_RUN_STATUSES } },
      { $set: { status: 'cancelled', completedAt: new Date(), outcome: 'stopped', nextRunAt: null, lockToken: null, lockUntil: null, 'error.code': reason }, $unset: { activeKey: 1 } },
      { returnDocument: 'after' },
    ).lean();
    if (!run) return null;
    if (run.wait?.kind === 'ai_call' && run.wait?.data?.campaignId) {
      try {
        const { default: calling } = await import('../aiCalling/aiCalling.service.js');
        await calling.cancelCampaign(run.wait.data.campaignId, run.wait.data.owner, { ipAddress: 'workflow' });
      } catch { /* already finished */ }
    }
    await recordEvent({ type: 'run.cancelled', run, data: { reason } });
    await leadTimeline(run, 'automation.stopped', { reason });
    return run;
  }

  /** Retry the failed (or retry-waiting) step with a NEW idempotency key. */
  async retryStep(runId) {
    const run = await WorkflowRun.findOne({ _id: runId, status: { $in: ['failed', 'waiting'] } }).lean();
    if (!run || !run.steps.length) return null;
    const last = run.steps[run.steps.length - 1];
    if (run.status === 'waiting' && run.wait?.kind !== 'retry') return null;
    const idx = run.steps.length - 1;
    const activeKey = run.status === 'failed' ? `${run.workflowId}:${run.leadId}` : undefined;
    const updated = await WorkflowRun.findOneAndUpdate({ _id: runId, status: run.status, ...(run.status === 'failed' ? { activeKey: { $exists: false } } : {}) }, {
      $set: {
        status: 'queued', currentNodeId: last.nodeId, wait: emptyWait(), nextRunAt: null, completedAt: null, outcome: null,
        error: { code: null, message: null, nodeId: null }, lockToken: null, lockUntil: null,
        [`steps.${idx}.status`]: 'failed', [`steps.${idx}.manual`]: 'retried', [`steps.${idx}.endedAt`]: new Date(),
        'context.manualRetries': (run.context?.manualRetries || 0) + 1,
        [`visits.${last.nodeId}`]: Math.max(0, (run.visits?.[last.nodeId] || 1) - 1),
        ...(activeKey ? { activeKey } : {}),
      },
    }, { returnDocument: 'after' }).lean().catch((error) => { if (error?.code === 11000) return null; throw error; });
    if (updated) await this.kick(updated._id);
    return updated;
  }

  /** Skip the current step and continue on `port` (default: the node's first output). */
  async skipStep(runId, port = null) {
    const run = await WorkflowRun.findOne({ _id: runId, status: { $in: ['failed', 'waiting', 'paused'] } }).lean();
    if (!run) return null;
    const version = await loadVersion(run.versionId);
    const nodeId = run.status === 'failed' ? (run.error?.nodeId || run.currentNodeId) : run.currentNodeId;
    const node = version?.graph?.nodes?.find((n) => n.id === nodeId);
    if (!node) return null;
    const outputs = NODE_CATALOG[node.type]?.outputs || [];
    const chosen = port && outputs.includes(port) ? port : outputs[0];
    const target = chosen ? nextNodeId(version.graph, node.id, chosen) : null;
    const idx = run.steps.length - 1;
    const set = {
      wait: emptyWait(), nextRunAt: null, lockToken: null, lockUntil: null, error: { code: null, message: null, nodeId: null },
      ...(idx >= 0 && run.steps[idx].nodeId === node.id ? { [`steps.${idx}.status`]: 'skipped', [`steps.${idx}.manual`]: 'skipped', [`steps.${idx}.port`]: chosen || null, [`steps.${idx}.endedAt`]: new Date() } : {}),
    };
    if (!target) Object.assign(set, { status: 'completed', completedAt: new Date(), outcome: 'completed' });
    else Object.assign(set, { status: 'queued', currentNodeId: target, completedAt: null, outcome: null });
    const updated = await WorkflowRun.findOneAndUpdate({ _id: runId, status: run.status }, { $set: set, ...(target ? {} : { $unset: { activeKey: 1 } }) }, { returnDocument: 'after' }).lean();
    if (updated && target) {
      if (run.status === 'failed') await WorkflowRun.updateOne({ _id: runId, activeKey: { $exists: false } }, { $set: { activeKey: `${run.workflowId}:${run.leadId}` } }).catch(() => {});
      await this.kick(updated._id);
    }
    return updated;
  }
}

function emptyWait() {
  return { kind: null, nodeId: null, until: null, events: undefined, startedAt: null, data: null, resumeEvent: null };
}

export { TERMINAL_RUN_STATUSES };
export default new WorkflowRunner();
