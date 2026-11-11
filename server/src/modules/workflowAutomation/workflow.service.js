/**
 * Workflow Automation service: definitions, validation, publishing & versions, dry-run
 * tests, campaigns, monitoring and analytics.
 *
 * Visibility: workflows are company-wide resources gated by the workflow:* permissions
 * (the app is single-tenant; there is no organization id — see WORKFLOW-AUTOMATION.md).
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  Workflow, WorkflowCampaign, WorkflowEvent, WorkflowLink, WorkflowRun, WorkflowVersion,
} from './workflow.models.js';
import runner, { recordEvent } from './workflow.runner.js';
import { invalidateTriggerCache } from './workflow.events.js';
import { findTrigger, nextNodeId, sanitizeGraph, validateGraph } from './engine/graph.js';
import {
  CONDITION_FIELDS, QUALIFICATION_FIELD_KEYS, normalizeConfig,
} from './engine/nodeConfig.js';
import { nextScheduleFire } from './engine/time.js';
import { HANDLERS } from './engine/handlers.js';
import { buildTemplate, TEMPLATE_META } from './workflow.templates.js';
import { trackedBaseUrl } from './workflowLink.service.js';
import { bumpWorkflowReadGeneration, cachedRead, READ_TTL } from './workflow.readCache.js';
import {
  ACTIVE_RUN_STATUSES, CALL_OUTCOME_FILTERS, CONDITION_OPERATORS, END_OUTCOMES, LEAD_STATUSES, LIMITS, RUN_STATUSES,
  NODE_CATALOG, WAITABLE_EVENTS, WORKFLOW_QUEUE,
} from './workflow.constants.js';
import auditService from '../auth/audit.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

const str = (v) => (v == null ? null : String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const DAY = 86_400_000;
const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MESSAGE_STEP_TYPES = ['msg.sms', 'msg.whatsapp', 'msg.email'];
const ANALYTICS_STEP_TYPES = ['ai.call', ...MESSAGE_STEP_TYPES];

function audit(eventType, user, meta, details) {
  // Every audited write changes what the dashboards show: drop the cached reads
  // (the generation switches synchronously in-process; the Redis copy follows).
  void bumpWorkflowReadGeneration();
  auditService.logEvent({ eventType, module: 'workflow', userId: user, ipAddress: meta?.ipAddress || 'internal', userAgent: meta?.userAgent, result: 'success', details });
}

/** Webhook triggers carry a per-workflow secret token generated server-side. */
function ensureWebhookTokens(graph) {
  for (const node of graph.nodes) {
    if (node.type === 'trigger.webhook' && !/^[A-Za-z0-9_-]{24,64}$/.test(String(node.data?.config?.token || ''))) {
      node.data.config = { ...(node.data.config || {}), token: crypto.randomBytes(24).toString('base64url') };
    }
  }
  return graph;
}

function checksum(graph) {
  return crypto.createHash('sha256').update(JSON.stringify(graph)).digest('hex');
}

class WorkflowService {
  // ------------------------------------------------------------------------ catalog
  catalog() {
    return {
      nodes: Object.entries(NODE_CATALOG).map(([type, meta]) => ({ type, ...meta, defaults: normalizeConfig(type, {}) })),
      waitableEvents: WAITABLE_EVENTS, operators: CONDITION_OPERATORS, conditionFields: CONDITION_FIELDS,
      qualificationKeys: QUALIFICATION_FIELD_KEYS, endOutcomes: END_OUTCOMES, leadStatuses: LEAD_STATUSES,
      callOutcomeFilters: CALL_OUTCOME_FILTERS, limits: LIMITS, templates: TEMPLATE_META,
    };
  }

  // ------------------------------------------------------------------------ CRUD
  async list({ search = '', status = null, sortBy = 'updatedAt', sortOrder = 'desc', page = 1, limit = 25, templates = false } = {}) {
    const filter = { archivedAt: null };
    if (status === 'archived') { delete filter.archivedAt; filter.status = 'archived'; } else if (status) filter.status = status;
    if (templates) filter.isTemplate = true;
    if (search) filter.name = { $regex: escapeRegex(String(search).slice(0, 80)), $options: 'i' };
    const sortField = ['updatedAt', 'createdAt', 'name', 'publishedAt'].includes(sortBy) ? sortBy : 'updatedAt';
    const [items, total] = await Promise.all([
      Workflow.find(filter).select('-draft').sort({ [sortField]: sortOrder === 'asc' ? 1 : -1, _id: -1 })
        .skip((page - 1) * limit).limit(limit).populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean(),
      Workflow.countDocuments(filter),
    ]);
    const stats = await this._cachedRunStats(items.map((w) => w._id));
    return {
      items: items.map((w) => ({ ...w, stats: stats.get(String(w._id)) || emptyStats() })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** Run counters for a page of workflows, cached briefly (the list pages poll every 30 s). */
  async _cachedRunStats(ids) {
    if (!ids.length) return new Map();
    const key = crypto.createHash('sha1').update(ids.map(String).sort().join(',')).digest('base64url');
    const obj = await cachedRead('runStats', [key], READ_TTL.runStats, async () => Object.fromEntries(await this._runStats(ids)));
    return new Map(Object.entries(obj));
  }

  async _runStats(ids) {
    if (!ids.length) return new Map();
    const rows = await WorkflowRun.aggregate([
      { $match: { workflowId: { $in: ids } } },
      { $group: { _id: { w: '$workflowId', s: '$status' }, n: { $sum: 1 }, last: { $max: '$updatedAt' } } },
    ]);
    const out = new Map();
    for (const r of rows) {
      const key = String(r._id.w);
      const s = out.get(key) || emptyStats();
      s.total += r.n; s[r._id.s] = (s[r._id.s] || 0) + r.n;
      if (!s.lastRunAt || r.last > s.lastRunAt) s.lastRunAt = r.last;
      out.set(key, s);
    }
    for (const s of out.values()) {
      s.active = ACTIVE_RUN_STATUSES.reduce((sum, st) => sum + (s[st] || 0), 0);
      const finished = (s.completed || 0) + (s.failed || 0);
      s.successRate = finished ? Math.round(((s.completed || 0) / finished) * 1000) / 10 : null;
    }
    return out;
  }

  async get(id) {
    const wf = await Workflow.findById(id).populate('createdBy', 'firstName lastName').populate('updatedBy', 'firstName lastName').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    const versions = await WorkflowVersion.find({ workflowId: wf._id }).select('-graph').sort({ version: -1 }).limit(50).populate('publishedBy', 'firstName lastName').lean();
    const stats = (await this._runStats([wf._id])).get(String(wf._id)) || emptyStats();
    return { ...wf, versions, stats };
  }

  async create(input, user, meta = {}) {
    let graph = { nodes: [], edges: [] };
    if (input.templateKey) {
      graph = buildTemplate(input.templateKey);
      if (!graph) throw new ValidationError('Unknown template', [{ field: 'templateKey', message: 'Unknown template' }]);
    } else if (input.fromWorkflowId) {
      const source = await Workflow.findById(input.fromWorkflowId).select('draft name').lean();
      if (!source) throw new NotFoundError('Workflow', input.fromWorkflowId);
      graph = source.draft;
    } else if (input.graph) graph = input.graph;
    graph = ensureWebhookTokens(sanitizeGraph(graph));
    // Fresh secrets for a copied webhook trigger: two workflows never share a hook URL.
    if (input.fromWorkflowId) for (const node of graph.nodes) if (node.type === 'trigger.webhook') node.data.config.token = crypto.randomBytes(24).toString('base64url');
    const wf = await Workflow.create({
      name: input.name, description: input.description || '', draft: graph, templateKey: input.templateKey || null,
      settings: input.settings || {}, createdBy: user, updatedBy: user,
    });
    audit('workflow.created', user, meta, { workflowId: str(wf._id), templateKey: input.templateKey || null, fromWorkflowId: input.fromWorkflowId || null });
    return this.get(wf._id);
  }

  async update(id, input, user, meta = {}) {
    const wf = await Workflow.findById(id).select('draftRevision status').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    if (wf.status === 'archived') throw new ConflictError('Archived workflows are read-only. Duplicate it to make changes.');
    const set = { updatedBy: user };
    for (const key of ['name', 'description', 'isTemplate']) if (input[key] !== undefined) set[key] = input[key];
    if (input.settings) for (const [k, v] of Object.entries(input.settings)) set[`settings.${k}`] = v;
    const filter = { _id: id };
    if (input.graph) {
      const graph = ensureWebhookTokens(sanitizeGraph(input.graph));
      if (graph.nodes.length > LIMITS.maxNodes || graph.edges.length > LIMITS.maxEdges) throw new ValidationError('Workflow is too large', [{ field: 'graph', message: `At most ${LIMITS.maxNodes} nodes and ${LIMITS.maxEdges} connections` }]);
      set.draft = graph; set.draftUpdatedAt = new Date();
      if (input.baseRevision !== undefined) filter.draftRevision = input.baseRevision;
    }
    const updated = await Workflow.findOneAndUpdate(filter, { $set: set, ...(input.graph ? { $inc: { draftRevision: 1 } } : {}) }, { returnDocument: 'after' }).lean();
    if (!updated) {
      const latest = await Workflow.findById(id).select('draftRevision draftUpdatedAt updatedBy').populate('updatedBy', 'firstName lastName').lean();
      throw new ConflictError('This workflow was changed by someone else. Reload to see the latest version.', { draftRevision: latest?.draftRevision, updatedBy: latest?.updatedBy });
    }
    if (input.settings) invalidateTriggerCache();
    audit('workflow.updated', user, meta, { workflowId: String(id), fields: Object.keys(input) });
    return this.get(id);
  }

  async remove(id, user, meta = {}) {
    const wf = await Workflow.findById(id).select('latestVersion status').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    if (wf.latestVersion > 0 || await WorkflowRun.exists({ workflowId: id })) {
      // Published history must stay inspectable: archive instead of deleting.
      await this.setStatus(id, 'archived', user, meta);
      return { archived: true };
    }
    await Workflow.deleteOne({ _id: id });
    audit('workflow.deleted', user, meta, { workflowId: String(id) });
    return { deleted: true };
  }

  // ------------------------------------------------------------------------ validation / publishing
  async validate(idOrGraph) {
    const graph = typeof idOrGraph === 'object' && idOrGraph?.nodes
      ? sanitizeGraph(idOrGraph)
      : (await Workflow.findById(idOrGraph).select('draft').lean())?.draft;
    if (!graph) throw new NotFoundError('Workflow', String(idOrGraph));
    const result = validateGraph(graph);
    const refs = await this._validateReferences(graph);
    result.errors.push(...refs.errors); result.warnings.push(...refs.warnings);
    result.valid = result.errors.length === 0;
    return result;
  }

  async _validateReferences(graph) {
    const errors = []; const warnings = [];
    const agentIds = new Set(); const templateIds = new Map(); const userIds = new Set();
    for (const node of graph.nodes) {
      const c = node.data?.config || {};
      if (['ai.call', 'ai.callback', 'trigger.call_completed'].includes(node.type) && mongoose.isValidObjectId(c.agentId)) agentIds.add(String(c.agentId));
      if (node.type.startsWith('msg.') && mongoose.isValidObjectId(c.templateId)) templateIds.set(node.id, { id: String(c.templateId), channel: NODE_CATALOG[node.type].channel });
      if (node.type === 'crm.assign' && mongoose.isValidObjectId(c.userId)) userIds.add(String(c.userId));
      if (node.type === 'task.create' && c.assignee === 'user' && mongoose.isValidObjectId(c.userId)) userIds.add(String(c.userId));
      if (node.type === 'notify.user' && c.recipients === 'users') (c.userIds || []).filter(mongoose.isValidObjectId).forEach((u) => userIds.add(String(u)));
    }
    const [{ default: CallingAgent }, { default: MessageTemplate }, { default: User }] = await Promise.all([
      import('../aiCalling/callingAgent.model.js'), import('../messaging/messageTemplate.model.js'), import('../auth/user.model.js'),
    ]);
    const agents = new Map((await CallingAgent.find({ _id: { $in: [...agentIds] } }).select('name availability usage questionnaire followUp').lean()).map((a) => [String(a._id), a]));
    const templates = new Map((await MessageTemplate.find({ _id: { $in: [...templateIds.values()].map((t) => t.id) } }).select('channel isArchived whatsapp.approvalStatus').lean()).map((t) => [String(t._id), t]));
    const users = new Map((await User.find({ _id: { $in: [...userIds] } }).select('status').lean()).map((u) => [String(u._id), u]));
    for (const node of graph.nodes) {
      const c = node.data?.config || {};
      if (['ai.call', 'ai.callback'].includes(node.type) && c.agentId) {
        const agent = agents.get(String(c.agentId));
        if (!agent || agent.availability === 'archived') errors.push({ nodeId: node.id, field: 'agentId', code: 'agent_missing' });
        else {
          if (node.type === 'ai.call' && agent.usage === 'inbound') errors.push({ nodeId: node.id, field: 'agentId', code: 'agent_inbound_only' });
          if (node.type === 'ai.call' && !(agent.questionnaire?.questions || []).length) errors.push({ nodeId: node.id, field: 'agentId', code: 'agent_not_ready' });
          if (node.type === 'ai.callback' && !agent.followUp?.enabled) errors.push({ nodeId: node.id, field: 'agentId', code: 'agent_follow_up_disabled' });
          if (agent.availability !== 'active') warnings.push({ nodeId: node.id, field: 'agentId', code: 'agent_not_active' });
        }
      }
      const tpl = templateIds.get(node.id);
      if (tpl) {
        const doc = templates.get(tpl.id);
        if (!doc || doc.isArchived) errors.push({ nodeId: node.id, field: 'templateId', code: 'template_missing' });
        else if (doc.channel !== tpl.channel) errors.push({ nodeId: node.id, field: 'templateId', code: 'template_channel_mismatch' });
        else if (tpl.channel === 'whatsapp' && doc.whatsapp?.approvalStatus && doc.whatsapp.approvalStatus !== 'approved') warnings.push({ nodeId: node.id, field: 'templateId', code: 'template_not_approved' });
      }
      const checkUser = (u, field) => { const doc = users.get(String(u)); if (!doc || doc.status !== 'active') errors.push({ nodeId: node.id, field, code: 'user_missing' }); };
      if (node.type === 'crm.assign' && c.userId) checkUser(c.userId, 'userId');
      if (node.type === 'task.create' && c.assignee === 'user' && c.userId) checkUser(c.userId, 'userId');
      if (node.type === 'notify.user' && c.recipients === 'users') (c.userIds || []).forEach((u) => checkUser(u, 'userIds'));
    }
    return { errors, warnings };
  }

  async publish(id, { notes = '' } = {}, user, meta = {}) {
    const wf = await Workflow.findById(id).lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    if (wf.status === 'archived') throw new ConflictError('Archived workflows cannot be published');
    const result = await this.validate(wf.draft);
    if (!result.valid) {
      throw Object.assign(new ValidationError('Workflow has validation errors', result.errors.map((e) => ({ field: e.field || e.code, message: e.code, nodeId: e.nodeId || null, code: e.code }))), { data: result });
    }
    return this._publishGraph(wf, wf.draft, { notes, user, meta });
  }

  async _publishGraph(wf, graph, { notes, user, meta, rolledBackFrom = null }) {
    const trigger = findTrigger(graph);
    const bumped = await Workflow.findOneAndUpdate({ _id: wf._id }, { $inc: { latestVersion: 1 } }, { returnDocument: 'after' }).lean();
    const version = await WorkflowVersion.create({
      workflowId: wf._id, version: bumped.latestVersion, graph, triggerType: trigger.type,
      triggerConfig: normalizeConfig(trigger.type, trigger.data?.config), checksum: checksum(graph), notes, publishedBy: user, rolledBackFrom,
    });
    const triggerConfig = normalizeConfig(trigger.type, trigger.data?.config);
    await Workflow.updateOne({ _id: wf._id }, {
      $set: {
        status: 'published', publishedVersionId: version._id, publishedVersion: version.version, publishedAt: new Date(),
        triggerType: trigger.type, triggerConfig, updatedBy: user,
        nextFireAt: trigger.type === 'trigger.schedule' ? nextScheduleFire(triggerConfig, new Date()) : null,
      },
    });
    invalidateTriggerCache();
    audit(rolledBackFrom ? 'workflow.rolled_back' : 'workflow.published', user, meta, { workflowId: str(wf._id), version: version.version, rolledBackFrom });
    await recordEvent({ type: 'workflow.published', workflowId: wf._id, actor: user, data: { version: version.version, rolledBackFrom } });
    return this.get(wf._id);
  }

  async setStatus(id, status, user, meta = {}) {
    const wf = await Workflow.findById(id).select('status publishedVersionId triggerType triggerConfig').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    if (status === 'published' && !wf.publishedVersionId) throw new ConflictError('Publish the workflow first');
    const set = { status, updatedBy: user, archivedAt: status === 'archived' ? new Date() : null };
    if (status === 'published' && wf.triggerType === 'trigger.schedule') set.nextFireAt = nextScheduleFire(normalizeConfig('trigger.schedule', wf.triggerConfig), new Date());
    if (status !== 'published') set.nextFireAt = null;
    await Workflow.updateOne({ _id: id }, { $set: set });
    invalidateTriggerCache();
    audit(`workflow.${status}`, user, meta, { workflowId: String(id) });
    return this.get(id);
  }

  async versions(id) {
    if (!await Workflow.exists({ _id: id })) throw new NotFoundError('Workflow', id);
    return WorkflowVersion.find({ workflowId: id }).sort({ version: -1 }).limit(100).populate('publishedBy', 'firstName lastName').lean();
  }

  async getVersion(id, version) {
    const v = await WorkflowVersion.findOne({ workflowId: id, version: Number(version) }).populate('publishedBy', 'firstName lastName').lean();
    if (!v) throw new NotFoundError('WorkflowVersion', `${id}@${version}`);
    return v;
  }

  /** Re-publish an older version as a NEW version (history is never rewritten). */
  async rollback(id, version, user, meta = {}) {
    const wf = await Workflow.findById(id).lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    const target = await this.getVersion(id, version);
    await Workflow.updateOne({ _id: id }, { $set: { draft: target.graph, draftUpdatedAt: new Date() }, $inc: { draftRevision: 1 } });
    return this._publishGraph(wf, target.graph, { notes: `Rollback to v${target.version}`, user, meta, rolledBackFrom: target.version });
  }

  async duplicate(id, user, meta = {}) {
    const wf = await Workflow.findById(id).select('name description settings').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    return this.create({ name: `${wf.name} (copy)`.slice(0, 160), description: wf.description, fromWorkflowId: id, settings: wf.settings }, user, meta);
  }

  templates() {
    return TEMPLATE_META.map((t) => ({ ...t, graph: buildTemplate(t.key) }));
  }

  // ------------------------------------------------------------------------ test (dry run)
  /**
   * Simulate the draft on a real lead WITHOUT side-effects: conditions read the real lead,
   * actions are simulated, waits pass immediately. `options` steer simulated outcomes.
   */
  /** "Full check": settings, every step (dry), every path, live channels. Read-only. */
  async analyze(id, { graph: overrideGraph = null, leadId = null } = {}) {
    const wf = await Workflow.findById(id).select('name draft settings').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    const graph = overrideGraph ? sanitizeGraph(overrideGraph) : wf.draft;
    const validation = await this.validate(graph);
    let lead = null;
    if (leadId) {
      const { default: Lead } = await import('../crm/lead.model.js');
      lead = await Lead.findById(leadId).select('-qualification.history').lean();
      if (!lead || lead.isDeleted) throw new NotFoundError('Lead', leadId);
    }
    const { analyzeWorkflow } = await import('./workflow.analysis.js');
    return analyzeWorkflow({ workflow: wf, graph, validation, lead });
  }

  async test(id, { leadId, graph: overrideGraph = null, options = {} } = {}) {
    const wf = await Workflow.findById(id).select('name draft settings').lean();
    if (!wf) throw new NotFoundError('Workflow', id);
    const graph = overrideGraph ? sanitizeGraph(overrideGraph) : wf.draft;
    const validation = validateGraph(graph);
    const { default: Lead } = await import('../crm/lead.model.js');
    const lead = await Lead.findById(leadId).select('-qualification.history').lean();
    if (!lead || lead.isDeleted) throw new NotFoundError('Lead', leadId);
    const trigger = findTrigger(graph);
    if (!trigger) throw new ValidationError('Add a trigger before testing');
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const run = { _id: new mongoose.Types.ObjectId(), workflowId: wf._id, leadId: lead._id, ownerId: null, context: { event: options.event || null }, visits: {}, stepCount: 0, createdAt: new Date() };
    // "Test this step": start at a given node and (optionally) run only that step.
    const start = options.startNodeId && nodes.has(options.startNodeId) ? options.startNodeId : trigger.id;
    const maxSteps = options.singleStep ? 1 : 100;
    const steps = []; let nodeId = start; let outcome = null;
    for (let i = 0; i < maxSteps && nodeId; i += 1) {
      const node = nodes.get(nodeId);
      if (!node) break;
      run.visits[nodeId] = (run.visits[nodeId] || 0) + 1; run.stepCount += 1;
      if (run.visits[nodeId] > (Number(node.data?.config?.maxVisits) || LIMITS.defaultMaxVisits)) { outcome = 'loop_limit'; break; }
      const attemptOverride = options.attempts?.[nodeId];
      const dryOptions = { ...options, callOutcome: Array.isArray(attemptOverride) ? attemptOverride[run.visits[nodeId] - 1] : options.callOutcome };
      const handler = HANDLERS[node.type];
      let result;
      try {
        result = await handler.execute({ run, node, step: { startedAt: new Date() }, workflow: wf, actionKey: `test:${nodeId}`, keyHash: 'test', config: normalizeConfig(node.type, node.data?.config), dry: true, dryOptions, _lead: lead });
      } catch (error) { result = { status: 'failed', error: { code: 'node_error', message: error.message } }; }
      if (result.status !== 'completed') { steps.push({ nodeId, type: node.type, label: node.data?.label, status: result.status, error: result.error || null }); outcome = 'failed'; break; }
      if (result.context) run.context = { ...run.context, ...result.context };
      steps.push({ nodeId, type: node.type, label: node.data?.label, status: 'completed', port: result.port || null, output: result.output || null });
      if (result.end) { outcome = result.end; break; }
      nodeId = result.port ? nextNodeId(graph, node.id, result.port) : null;
      if (!nodeId) outcome = result.port === 'blocked' ? 'skipped' : 'completed';
    }
    return { valid: validation.valid, validation, steps, outcome, lead: { _id: lead._id, name: lead.name, status: lead.status } };
  }

  // ------------------------------------------------------------------------ campaigns
  async listCampaigns({ workflowId = null, status = null, page = 1, limit = 25 } = {}) {
    const filter = {};
    if (workflowId) filter.workflowId = workflowId;
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      WorkflowCampaign.find(filter).select('-selection.leadIds -skipped').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('workflowId', 'name status publishedVersion').populate('createdBy', 'firstName lastName').lean(),
      WorkflowCampaign.countDocuments(filter),
    ]);
    const progress = await this._campaignProgress(items.map((c) => c._id));
    return { items: items.map((c) => ({ ...c, progress: progress.get(String(c._id)) || {} })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async _campaignProgress(ids) {
    if (!ids.length) return new Map();
    const rows = await WorkflowRun.aggregate([{ $match: { campaignId: { $in: ids } } }, { $group: { _id: { c: '$campaignId', s: '$status', o: '$outcome' }, n: { $sum: 1 } } }]);
    const out = new Map();
    for (const r of rows) {
      const key = String(r._id.c); const p = out.get(key) || { total: 0, byStatus: {}, byOutcome: {} };
      p.total += r.n; p.byStatus[r._id.s] = (p.byStatus[r._id.s] || 0) + r.n;
      if (r._id.o) p.byOutcome[r._id.o] = (p.byOutcome[r._id.o] || 0) + r.n;
      out.set(key, p);
    }
    return out;
  }

  async getCampaign(id) {
    const c = await WorkflowCampaign.findById(id).select('-selection.leadIds').populate('workflowId', 'name status publishedVersion triggerType').populate('createdBy', 'firstName lastName').lean();
    if (!c) throw new NotFoundError('WorkflowCampaign', id);
    return { ...c, progress: (await this._campaignProgress([c._id])).get(String(c._id)) || { total: 0, byStatus: {}, byOutcome: {} } };
  }

  async createCampaign(input, user, meta = {}) {
    const wf = await Workflow.findById(input.workflowId).select('status publishedVersionId').lean();
    if (!wf) throw new NotFoundError('Workflow', input.workflowId);
    const selection = { mode: input.selection.mode, leadIds: [], filters: { statuses: [], tags: [], sources: [] } };
    if (selection.mode === 'explicit') selection.leadIds = [...new Set(input.selection.leadIds.map(String))].slice(0, LIMITS.maxCampaignLeads).map(oid);
    else selection.filters = { statuses: input.selection.filters?.statuses || [], tags: input.selection.filters?.tags || [], sources: input.selection.filters?.sources || [] };
    const doc = await WorkflowCampaign.create({ name: input.name, description: input.description || '', workflowId: wf._id, selection, createdBy: user, updatedBy: user });
    audit('workflow.campaign.created', user, meta, { campaignId: str(doc._id), workflowId: str(wf._id) });
    return this.getCampaign(doc._id);
  }

  async _resolveCampaignLeads(campaign) {
    const { default: Lead } = await import('../crm/lead.model.js');
    const filter = { isDeleted: { $ne: true } };
    if (campaign.selection.mode === 'explicit') filter._id = { $in: campaign.selection.leadIds };
    else {
      const f = campaign.selection.filters || {};
      if (!(f.statuses?.length || f.tags?.length || f.sources?.length)) throw new ValidationError('Choose at least one lead filter');
      if (f.statuses?.length) filter.status = { $in: f.statuses };
      if (f.tags?.length) filter.tags = { $in: f.tags };
      if (f.sources?.length) filter.source = { $in: f.sources };
    }
    return Lead.find(filter).select('_id status mergedInto').sort({ createdAt: 1 }).limit(LIMITS.maxCampaignLeads + 1).lean();
  }

  async previewCampaign(input) {
    const leads = await this._resolveCampaignLeads({ selection: input.selection });
    return { count: Math.min(leads.length, LIMITS.maxCampaignLeads), capped: leads.length > LIMITS.maxCampaignLeads };
  }

  async startCampaign(id, user, meta = {}) {
    const campaign = await WorkflowCampaign.findById(id).lean();
    if (!campaign) throw new NotFoundError('WorkflowCampaign', id);
    if (campaign.status !== 'draft') throw new ConflictError('Only draft campaigns can be started');
    const wf = await Workflow.findById(campaign.workflowId).lean();
    if (!wf?.publishedVersionId || wf.status !== 'published') throw new ConflictError('Publish the workflow before starting a campaign');
    const claimed = await WorkflowCampaign.findOneAndUpdate({ _id: id, status: 'draft' }, { $set: { status: 'running', startedAt: new Date(), versionId: wf.publishedVersionId, version: wf.publishedVersion, updatedBy: user } }, { returnDocument: 'after' }).lean();
    if (!claimed) throw new ConflictError('The campaign was started already');
    audit('workflow.campaign.started', user, meta, { campaignId: String(id), workflowId: str(wf._id), version: wf.publishedVersion });
    await this._enqueueEnrollment(claimed._id);
    return this.getCampaign(id);
  }

  async _enqueueEnrollment(campaignId) {
    if (runner.inline) return this.enrollCampaign(campaignId);
    try {
      const { default: queueManager } = await import('../../shared/queue/QueueManager.js');
      await queueManager.addJob(WORKFLOW_QUEUE, 'enroll', { campaignId: String(campaignId) }, { jobId: `wf-enroll-${campaignId}`, attempts: 3 });
    } catch {
      setImmediate(() => this.enrollCampaign(campaignId).catch(() => {}));
    }
    return null;
  }

  /** Enroll every selected lead (idempotent: enrollmentKey per campaign+lead). */
  async enrollCampaign(campaignId) {
    const campaign = await WorkflowCampaign.findById(campaignId).lean();
    if (!campaign || campaign.status !== 'running') return { skipped: true };
    const wf = await Workflow.findById(campaign.workflowId).lean();
    const leads = (await this._resolveCampaignLeads(campaign)).slice(0, LIMITS.maxCampaignLeads);
    const skipped = []; let enrolled = 0;
    for (const lead of leads) {
      if (lead.mergedInto) { skipped.push({ leadId: lead._id, reason: 'merged' }); continue; }
      if (lead.status === 'converted') { skipped.push({ leadId: lead._id, reason: 'converted' }); continue; }
      const res = await runner.enroll({
        workflow: wf, leadId: lead._id, campaignId: campaign._id, versionId: campaign.versionId,
        trigger: { type: 'campaign', eventId: String(campaign._id), data: { campaignId: String(campaign._id) } },
        enrollmentKey: `${wf._id}:${lead._id}:campaign:${campaign._id}`,
      });
      if (res.run) enrolled += 1;
      else if (res.skipped !== 'duplicate_event') skipped.push({ leadId: lead._id, reason: res.skipped });
    }
    const selected = leads.length;
    const enrolledTotal = await WorkflowRun.countDocuments({ campaignId: campaign._id });
    await WorkflowCampaign.updateOne({ _id: campaign._id }, { $set: { 'counts.selected': selected, 'counts.enrolled': enrolledTotal, 'counts.skipped': skipped.length, skipped: skipped.slice(0, 1000) } });
    await bumpWorkflowReadGeneration();
    return { selected, enrolled, skipped: skipped.length };
  }

  async pauseCampaign(id, user, meta = {}) {
    const c = await WorkflowCampaign.findOneAndUpdate({ _id: id, status: 'running' }, { $set: { status: 'paused', pausedAt: new Date(), updatedBy: user } }, { returnDocument: 'after' }).lean();
    if (!c) throw new ConflictError('Only running campaigns can be paused');
    await WorkflowRun.updateMany({ campaignId: id, status: { $in: ['queued', 'waiting', 'pending'] }, lockToken: null }, { $set: { status: 'paused', pausedAt: new Date(), pausedBy: 'campaign' } });
    audit('workflow.campaign.paused', user, meta, { campaignId: String(id) });
    return this.getCampaign(id);
  }

  async resumeCampaign(id, user, meta = {}) {
    const c = await WorkflowCampaign.findOneAndUpdate({ _id: id, status: 'paused' }, { $set: { status: 'running', pausedAt: null, updatedBy: user } }, { returnDocument: 'after' }).lean();
    if (!c) throw new ConflictError('Only paused campaigns can be resumed');
    const paused = await WorkflowRun.find({ campaignId: id, status: 'paused', pausedBy: 'campaign' }).select('_id').lean();
    for (const r of paused) await runner.resume(r._id);
    await this._enqueueEnrollment(id); // leads selected but not yet enrolled when paused
    audit('workflow.campaign.resumed', user, meta, { campaignId: String(id) });
    return this.getCampaign(id);
  }

  async stopCampaign(id, user, meta = {}) {
    const c = await WorkflowCampaign.findOneAndUpdate({ _id: id, status: { $in: ['running', 'paused', 'draft'] } }, { $set: { status: 'stopped', stoppedAt: new Date(), updatedBy: user } }, { returnDocument: 'after' }).lean();
    if (!c) throw new ConflictError('This campaign has already ended');
    const active = await WorkflowRun.find({ campaignId: id, status: { $in: ACTIVE_RUN_STATUSES } }).select('_id').lean();
    for (const r of active) await runner.cancel(r._id, 'campaign_stopped');
    audit('workflow.campaign.stopped', user, meta, { campaignId: String(id), cancelledRuns: active.length });
    return this.getCampaign(id);
  }

  // ------------------------------------------------------------------------ monitoring
  async listRuns({ workflowId, campaignId, leadId, status, page = 1, limit = 25 } = {}) {
    const filter = {};
    if (workflowId) filter.workflowId = workflowId;
    if (campaignId) filter.campaignId = campaignId;
    if (leadId) filter.leadId = leadId;
    if (status === 'active') filter.status = { $in: ACTIVE_RUN_STATUSES };
    else if (status) filter.status = status;
    // Every run has a status: spelling it out lets { workflowId, status, updatedAt } serve the
    // updatedAt sort as a merge of per-status ranges instead of a blocking in-memory sort.
    else if (workflowId && !campaignId && !leadId) filter.status = { $in: RUN_STATUSES };
    const match = { ...filter };
    for (const key of ['workflowId', 'campaignId', 'leadId']) if (match[key]) match[key] = oid(match[key]);
    const [rows, total] = await Promise.all([
      // Runs are fat (steps with outputs, context, trigger payloads): page and sort on the
      // index, then project only the step count and the last step instead of the whole array.
      WorkflowRun.aggregate([
        { $match: match }, { $sort: { updatedAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
        { $project: { context: 0, visits: 0 } },
        { $set: { stepTotal: { $size: { $ifNull: ['$steps', []] } }, currentStep: { $ifNull: [{ $arrayElemAt: ['$steps', -1] }, null] } } },
        { $project: { steps: 0, 'currentStep.output': 0 } },
      ]),
      Object.keys(filter).length ? WorkflowRun.countDocuments(filter) : WorkflowRun.estimatedDocumentCount(),
    ]);
    const items = await WorkflowRun.populate(rows, [{ path: 'workflowId', select: 'name' }, { path: 'leadId', select: 'name leadNumber status' }]);
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getRun(id) {
    const run = await WorkflowRun.findById(id).populate('workflowId', 'name status').populate('leadId', 'name leadNumber status phone mobile email assignedTo').lean();
    if (!run) throw new NotFoundError('WorkflowRun', id);
    const version = await WorkflowVersion.findById(run.versionId).select('version graph publishedAt').lean();
    const events = await WorkflowEvent.find({ runId: run._id }).sort({ at: 1 }).limit(500).lean();
    const links = (await WorkflowLink.find({ runId: run._id }).select('token kind url clicks humanClicks scannerHits firstClickAt nodeId').lean()).map((l) => ({ ...l, trackedUrl: l.kind === 'open' ? `${trackedBaseUrl()}/t/o/${l.token}.gif` : `${trackedBaseUrl()}/t/${l.token}` }));
    return { ...run, version, events, links };
  }

  async controlRun(id, action, { port = null } = {}, user, meta = {}) {
    const fn = { pause: () => runner.pause(id), resume: () => runner.resume(id), stop: () => runner.cancel(id, 'manual'), retry: () => runner.retryStep(id), skip: () => runner.skipStep(id, port) }[action];
    if (!fn) throw new ValidationError('Unknown action');
    const before = await WorkflowRun.findById(id).select('status currentNodeId workflowId leadId').lean();
    if (!before) throw new NotFoundError('WorkflowRun', id);
    const result = await fn();
    if (!result) throw new ConflictError(`This execution cannot be ${({ pause: 'paused', resume: 'resumed', stop: 'stopped', retry: 'retried', skip: 'skipped' })[action]} in its current state (${before.status})`);
    await recordEvent({ type: `manual.${action}`, run: { _id: before._id, workflowId: before.workflowId, leadId: before.leadId, campaignId: null }, actor: user, nodeId: before.currentNodeId, data: { from: before.status, port } });
    audit(`workflow.run.${action}`, user, meta, { runId: String(id), workflowId: str(before.workflowId), leadId: str(before.leadId), from: before.status, port });
    return this.getRun(id);
  }

  async listEvents({ workflowId, leadId, runId, type, from, to, page = 1, limit = 50 } = {}) {
    const filter = {};
    if (workflowId) filter.workflowId = workflowId;
    if (leadId) filter.leadId = leadId;
    if (runId) filter.runId = runId;
    if (type) filter.type = type.endsWith('*') ? { $regex: `^${escapeRegex(type.slice(0, -1))}` } : type;
    if (from || to) filter.at = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const [items, total] = await Promise.all([
      WorkflowEvent.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('workflowId', 'name').populate('leadId', 'name leadNumber').populate('actor', 'firstName lastName').lean(),
      // The unfiltered timeline is the default view: read the total from collection metadata
      // instead of counting an append-only log that grows without bound.
      Object.keys(filter).length ? WorkflowEvent.countDocuments(filter) : WorkflowEvent.estimatedDocumentCount(),
    ]);
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ------------------------------------------------------------------------ analytics
  /**
   * Dashboard KPIs. Cached for READ_TTL.analytics seconds (key includes the write generation,
   * so a publish / campaign / manual action shows up immediately; background run progress
   * within the TTL).
   */
  async analytics({ days = 30, workflowId = null } = {}) {
    return cachedRead('analytics', [days, workflowId ? String(workflowId) : 'all'], READ_TTL.analytics, () => this._analytics({ days, workflowId }));
  }

  async _analytics({ days = 30, workflowId = null } = {}) {
    // The window is exactly the `days` UTC calendar days shown in the timeline, so the timeline
    // always adds up to the execution totals (a rolling now-N*24h window left runs from the
    // partial first day in the totals but outside every timeline bucket).
    const since = new Date(Math.floor(Date.now() / DAY) * DAY - (days - 1) * DAY);
    const scope = workflowId ? { workflowId: oid(workflowId) } : {};
    const window = { ...scope, createdAt: { $gte: since } };
    // One pass over the window's runs (index on createdAt / workflowId+createdAt). The steps
    // array is reduced to the four fields the KPIs read before anything is grouped, instead of
    // six separate aggregations that each fetched and unwound the full run documents.
    const [wfCounts, [facets], links, recentFailures] = await Promise.all([
      Workflow.aggregate([{ $match: workflowId ? { _id: oid(workflowId) } : { archivedAt: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      WorkflowRun.aggregate([
        { $match: window },
        { $project: {
          _id: 0, status: 1, outcome: 1, leadId: 1, workflowId: 1, createdAt: 1,
          steps: { $map: {
            input: { $filter: { input: { $ifNull: ['$steps', []] }, as: 's', cond: { $in: ['$$s.type', ANALYTICS_STEP_TYPES] } } },
            as: 's', in: { t: '$$s.type', p: '$$s.port', s: '$$s.status', r: '$$s.output.recipientId' },
          } },
        } },
        { $facet: {
          status: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
          outcomes: [{ $match: { outcome: { $ne: null } } }, { $group: { _id: '$outcome', n: { $sum: 1 } } }],
          contacts: [{ $group: { _id: '$leadId' } }, { $count: 'n' }],
          series: [{ $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, s: '$status' }, n: { $sum: 1 } } }],
          top: [
            { $group: { _id: '$workflowId', runs: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
            { $sort: { runs: -1, _id: 1 } }, { $limit: 8 },
          ],
          steps: [{ $unwind: '$steps' }, { $group: { _id: { t: '$steps.t', p: '$steps.p', s: '$steps.s' }, n: { $sum: 1 } } }],
          // Delivered = provider-confirmed delivery of workflow messages (messaging is the source of truth).
          recipients: [
            { $unwind: '$steps' }, { $match: { 'steps.t': { $in: MESSAGE_STEP_TYPES }, 'steps.p': 'sent', 'steps.r': { $nin: [null, ''] } } },
            { $limit: 20000 }, { $group: { _id: null, ids: { $push: '$steps.r' } } },
          ],
        } },
      ]).allowDiskUse(true),
      WorkflowLink.aggregate([{ $match: window }, { $group: { _id: { $ifNull: ['$kind', 'link'] }, links: { $sum: 1 }, clicked: { $sum: { $cond: [{ $gt: ['$humanClicks', 0] }, 1, 0] } }, human: { $sum: '$humanClicks' }, scanner: { $sum: '$scannerHits' } } }]),
      WorkflowRun.find({ ...scope, status: 'failed', completedAt: { $gte: since } }).select('workflowId leadId error completedAt').sort({ completedAt: -1 }).limit(8)
        .populate('workflowId', 'name').populate('leadId', 'name leadNumber').lean(),
    ]);
    const { status: runCounts, outcomes, contacts, series, top, steps: stepAgg, recipients } = facets;
    const byKey = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const runs = byKey(runCounts);
    const steps = { calls: 0, answered: 0, unanswered: 0, messagesSent: 0, messagesBlocked: 0 };
    for (const r of stepAgg) {
      if (r._id.t === 'ai.call' && r._id.s !== 'running') { if (r._id.p !== 'blocked') steps.calls += r.n; if (r._id.p === 'answered') steps.answered += r.n; if (r._id.p === 'unanswered') steps.unanswered += r.n; }
      if (r._id.t.startsWith('msg.') && r._id.p === 'sent') steps.messagesSent += r.n;
      if (r._id.t.startsWith('msg.') && r._id.p === 'blocked') steps.messagesBlocked += r.n;
    }
    const messageRecipientIds = (recipients[0]?.ids || []).filter((r) => mongoose.isValidObjectId(r)).map(oid);
    const [delivered, topNames] = await Promise.all([
      messageRecipientIds.length
        ? import('../messaging/messageRecipient.model.js').then(({ default: MessageRecipient }) => MessageRecipient.countDocuments({ _id: { $in: messageRecipientIds }, status: { $in: ['delivered', 'read'] } }))
        : 0,
      top.length ? Workflow.find({ _id: { $in: top.map((t) => t._id) } }).select('name status').lean() : [],
    ]);
    const wfById = new Map(topNames.map((w) => [String(w._id), w]));
    const totalRuns = Object.values(runs).reduce((a, b) => a + b, 0);
    const outcomeMap = byKey(outcomes);
    const finished = (runs.completed || 0) + (runs.failed || 0) + (runs.skipped || 0);
    const conversions = (outcomeMap.qualified || 0) + (outcomeMap.converted || 0);
    const seriesMap = new Map();
    for (const r of series) { const row = seriesMap.get(r._id.d) || { date: r._id.d, started: 0, completed: 0, failed: 0 }; row.started += r.n; if (r._id.s === 'completed') row.completed += r.n; if (r._id.s === 'failed') row.failed += r.n; seriesMap.set(r._id.d, row); }
    const timeline = [];
    for (let d = 0; d < days; d += 1) { const key = new Date(since.getTime() + d * DAY).toISOString().slice(0, 10); timeline.push(seriesMap.get(key) || { date: key, started: 0, completed: 0, failed: 0 }); }
    const wfMap = byKey(wfCounts);
    return {
      range: { days, since },
      workflows: { total: Object.values(wfMap).reduce((a, b) => a + b, 0), published: wfMap.published || 0, draft: wfMap.draft || 0, paused: wfMap.paused || 0 },
      executions: {
        total: totalRuns, completed: runs.completed || 0, failed: runs.failed || 0, running: (runs.running || 0) + (runs.queued || 0) + (runs.pending || 0),
        waiting: runs.waiting || 0, paused: runs.paused || 0, cancelled: runs.cancelled || 0, skipped: runs.skipped || 0,
        successRate: finished ? Math.round(((runs.completed || 0) / finished) * 1000) / 10 : null,
      },
      contacts: contacts[0]?.n || 0,
      calls: { initiated: steps.calls, answered: steps.answered, unanswered: steps.unanswered, answerRate: steps.calls ? Math.round((steps.answered / steps.calls) * 1000) / 10 : null },
      messages: { sent: steps.messagesSent, delivered, blocked: steps.messagesBlocked },
      links: (() => { const l = links.find((x) => x._id === 'link') || {}; return { issued: l.links || 0, clicked: l.clicked || 0, humanClicks: l.human || 0, scannerHits: l.scanner || 0 }; })(),
      opens: (() => { const o = links.find((x) => x._id === 'open') || {}; return { tracked: o.links || 0, opened: o.clicked || 0 }; })(),
      outcomes: outcomeMap, qualified: outcomeMap.qualified || 0,
      conversionRate: totalRuns ? Math.round((conversions / totalRuns) * 1000) / 10 : null,
      timeline,
      topWorkflows: top.map((t) => { const wf = wfById.get(String(t._id)); return { workflowId: t._id, name: wf?.name || '—', status: wf?.status || null, runs: t.runs, completed: t.completed, failed: t.failed, successRate: (t.completed + t.failed) ? Math.round((t.completed / (t.completed + t.failed)) * 1000) / 10 : null }; }),
      recentFailures,
    };
  }

  /** Unified per-lead automation history (runs + events), for the lead drawer and inspector. */
  async leadHistory(leadId) {
    const [runs, events] = await Promise.all([
      WorkflowRun.find({ leadId }).select('workflowId version status outcome currentNodeId startedAt completedAt createdAt error').sort({ createdAt: -1 }).limit(50).populate('workflowId', 'name').lean(),
      WorkflowEvent.find({ leadId }).sort({ at: -1 }).limit(200).populate('workflowId', 'name').lean(),
    ]);
    return { runs, events };
  }
}

function emptyStats() {
  return { total: 0, active: 0, completed: 0, failed: 0, successRate: null, lastRunAt: null };
}

export default new WorkflowService();
