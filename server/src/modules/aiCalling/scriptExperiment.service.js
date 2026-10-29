import CallingAgent from './callingAgent.model.js';
import CallCampaign from './callCampaign.model.js';
import CallRecord from './callRecord.model.js';
import { AgentScriptVersion, ScriptActivation, ScriptExperiment } from './scriptExperiment.model.js';
import { BenchmarkRun } from './benchmark.model.js';
import audit from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { contentHash, guardrailBreaches, twoProportionTest } from './engine/experimentStats.js';
import { audioFailuresOf, percentile } from './engine/callQualityTelemetry.js';
import { pricedCost } from './callAnalytics.service.js';
import { activeVersionId, agentConfigHash, pickAgentConfig } from './scriptVersionResolver.js';

/**
 * Agent script versions, experiments, promotion and rollback.
 *
 * Experiments vary the agentConfig only; all arms must share the questionnaire and
 * status rules (checked at start) so answers and outcomes stay comparable. Promote
 * and rollback write the version onto the agent (future launches) and onto the agent's
 * unfinished campaigns' agentConfig (calls dialled from now on), and are audit logged.
 */

const TEST_PROVIDERS = ['livekit_web', 'web_link_preview'];
const REACHED = new Set(['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact']);
const UNFINISHED_CAMPAIGNS = ['draft', 'scheduled', 'queued', 'running', 'paused'];
const MAX_CALLS = 20_000;

const snapshotOf = agent => ({
  agentConfig: pickAgentConfig(agent.agentConfig || {}),
  questionnaire: { questions: agent.questionnaire?.questions || [] },
  statusRules: agent.statusRules || [],
});
const hashes = snapshot => ({
  contentHash: contentHash(snapshot),
  agentConfigHash: agentConfigHash(snapshot.agentConfig),
  questionnaireHash: contentHash({ questions: snapshot.questionnaire?.questions || [], statusRules: snapshot.statusRules || [] }),
});
const ratio = (n, d) => (d ? Number((n / d).toFixed(4)) : null);

class ScriptExperimentService {
  log(action, actor, details, meta = {}) {
    audit.logEvent({ eventType: `ai_calling.script.${action}`, module: 'ai-calling', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details });
  }

  async _agent(agentId, actor) {
    const agent = await CallingAgent.findOne({ _id: agentId, createdBy: actor }).lean();
    if (!agent) throw new NotFoundError('CallingAgent', agentId);
    return agent;
  }

  async _version(id, actor) {
    const version = await AgentScriptVersion.findOne({ _id: id, createdBy: actor }).lean();
    if (!version) throw new NotFoundError('AgentScriptVersion', id);
    return version;
  }

  async _nextNumber(agentId) {
    const last = await AgentScriptVersion.findOne({ agentId }).sort({ number: -1 }).select('number').lean();
    return (last?.number || 0) + 1;
  }

  async _insertVersion(doc) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return (await AgentScriptVersion.create({ ...doc, number: await this._nextNumber(doc.agentId) })).toObject(); } catch (error) {
        if (error?.code !== 11000) throw error; // concurrent snapshot took the number: retry
      }
    }
    throw new ConflictError('Could not allocate a version number. Try again');
  }

  /**
   * Snapshot the agent's live script ('agent'), or derive a variant from an existing
   * version with agentConfig changes ('variant'). A live snapshot becomes the active
   * version when it differs from the current one (it IS what the agent runs).
   */
  async createVersion({ agentId, source = 'agent', basedOnVersionId, agentConfig, label = '', note = '' }, actor, meta) {
    const agent = await this._agent(agentId, actor);
    let snapshot;
    let base = null;
    if (source === 'variant') {
      base = await this._version(basedOnVersionId, actor);
      if (String(base.agentId) !== String(agentId)) throw new ValidationError('The base version belongs to another agent');
      snapshot = { ...base.snapshot, agentConfig: { ...pickAgentConfig(base.snapshot.agentConfig), ...agentConfig } };
    } else {
      snapshot = snapshotOf(agent);
    }
    const h = hashes(snapshot);
    if (source === 'variant' && h.contentHash === base.contentHash) throw new ValidationError('The variant is identical to its base version. Change at least one setting');
    let version = await AgentScriptVersion.findOne({ agentId, contentHash: h.contentHash }).lean();
    const existing = Boolean(version);
    if (!version) {
      version = await this._insertVersion({
        agentId, label, note, source, basedOnVersionId: base?._id || null, snapshot, ...h,
        sourceAgentVersion: source === 'agent' ? agent.version : null, createdBy: actor,
      });
    }
    if (source === 'agent') {
      const active = await activeVersionId(agentId);
      if (!active || String(active) !== String(version._id)) {
        await ScriptActivation.create({ agentId, versionId: version._id, previousVersionId: active, action: 'snapshot', createdBy: actor, reason: 'Snapshot of the live agent script' });
      }
    }
    this.log('version_created', actor, { agentId: String(agentId), versionId: String(version._id), source, existing }, meta);
    return { ...version, existing };
  }

  async listVersions(agentId, actor) {
    await this._agent(agentId, actor);
    const [versions, activeId] = await Promise.all([
      AgentScriptVersion.find({ agentId, createdBy: actor }).sort({ number: -1 }).lean(),
      activeVersionId(agentId),
    ]);
    const runs = await BenchmarkRun.aggregate([
      { $match: { scriptVersionId: { $in: versions.map(v => v._id) }, status: 'completed' } },
      { $sort: { completedAt: -1 } },
      { $group: { _id: '$scriptVersionId', runId: { $first: '$_id' }, completedAt: { $first: '$completedAt' }, overall: { $first: '$metrics.overall' }, unreviewedExcluded: { $first: '$metrics.unreviewedExcluded' } } },
    ]);
    const bench = new Map(runs.map(r => [String(r._id), r]));
    return versions.map(v => ({ ...v, active: String(v._id) === String(activeId), latestBenchmark: bench.get(String(v._id)) || null }));
  }

  /** Active version, whether the live agent drifted from it, and the activation log. */
  async scriptState(agentId, actor) {
    const agent = await this._agent(agentId, actor);
    const [activations, activeId] = await Promise.all([
      ScriptActivation.find({ agentId }).sort({ createdAt: -1, _id: -1 }).limit(50).lean(),
      activeVersionId(agentId),
    ]);
    const active = activeId ? await AgentScriptVersion.findById(activeId).lean() : null;
    return {
      agentId: String(agentId),
      activeVersion: active ? { _id: active._id, number: active.number, label: active.label } : null,
      liveMatchesActive: active ? active.contentHash === hashes(snapshotOf(agent)).contentHash : null,
      canRollback: Boolean(activations[0]?.previousVersionId),
      activations,
    };
  }

  // ------------------------------------------------------------ experiments
  async _experiment(id, actor) {
    const experiment = await ScriptExperiment.findOne({ _id: id, createdBy: actor }).lean();
    if (!experiment) throw new NotFoundError('ScriptExperiment', id);
    return experiment;
  }

  async _validateDesign({ agentId, arms, campaignIds = [] }, actor) {
    if (!arms.some(a => a.key === 'control')) throw new ValidationError('An experiment needs a control arm');
    const total = arms.reduce((s, a) => s + a.weight, 0);
    if (Math.abs(total - 100) > 1e-9) throw new ValidationError(`Traffic split must add up to 100% (now ${total}%)`);
    const versions = await AgentScriptVersion.find({ _id: { $in: arms.map(a => a.versionId) }, createdBy: actor }).lean();
    if (versions.length !== arms.length || versions.some(v => String(v.agentId) !== String(agentId))) throw new ValidationError('Every arm must use a script version of this agent');
    if (new Set(versions.map(v => v.questionnaireHash)).size > 1) {
      throw new ValidationError('Arms must share the same questions and status rules; experiments compare prompt, style and voice settings only');
    }
    if (campaignIds.length) {
      const owned = await CallCampaign.countDocuments({ _id: { $in: campaignIds }, agentId, createdBy: actor });
      if (owned !== campaignIds.length) throw new ValidationError('Eligible campaigns must be campaigns of this agent');
    }
  }

  async createExperiment(input, actor, meta) {
    await this._agent(input.agentId, actor);
    await this._validateDesign(input, actor);
    const experiment = await ScriptExperiment.create({ ...input, status: 'draft', createdBy: actor, updatedBy: actor });
    this.log('experiment_created', actor, { experimentId: String(experiment._id), agentId: String(input.agentId) }, meta);
    return this.getExperiment(experiment._id, actor);
  }

  async updateExperiment(id, { version, ...changes }, actor, meta) {
    const current = await this._experiment(id, actor);
    if (current.status !== 'draft') throw new ConflictError('Only a draft experiment can be edited; assignments must not change once leads were called');
    await this._validateDesign({ agentId: current.agentId, arms: changes.arms || current.arms, campaignIds: changes.campaignIds || current.campaignIds }, actor);
    const updated = await ScriptExperiment.findOneAndUpdate({ _id: id, createdBy: actor, version, status: 'draft' },
      { $set: { ...changes, updatedBy: actor }, $inc: { version: 1 } }, { returnDocument: 'after', runValidators: true });
    if (!updated) throw new ConflictError('Experiment changed meanwhile. Reload before saving');
    this.log('experiment_updated', actor, { experimentId: String(id) }, meta);
    return this.getExperiment(id, actor);
  }

  async listExperiments(agentId, actor) {
    await this._agent(agentId, actor);
    return ScriptExperiment.find({ agentId, createdBy: actor }).sort({ createdAt: -1 }).lean();
  }

  async getExperiment(id, actor) {
    const experiment = await this._experiment(id, actor);
    const versions = await AgentScriptVersion.find({ _id: { $in: experiment.arms.map(a => a.versionId) } }).select('number label snapshot.agentConfig').lean();
    const runs = await BenchmarkRun.aggregate([
      { $match: { scriptVersionId: { $in: experiment.arms.map(a => a.versionId) }, status: 'completed' } },
      { $sort: { completedAt: -1 } },
      { $group: { _id: '$scriptVersionId', runId: { $first: '$_id' }, completedAt: { $first: '$completedAt' }, overall: { $first: '$metrics.overall' } } },
    ]);
    const bench = new Map(runs.map(r => [String(r._id), r]));
    const versionMap = new Map(versions.map(v => [String(v._id), v]));
    return {
      ...experiment,
      arms: experiment.arms.map(a => ({ ...a, version: versionMap.get(String(a.versionId)) || null, latestBenchmark: bench.get(String(a.versionId)) || null })),
      stats: await this.experimentStats(experiment),
    };
  }

  /** Per-arm outcomes and quality from processed, non-test calls, with tests vs control. */
  async experimentStats(experiment) {
    const calls = await CallRecord.find({
      experimentId: experiment._id, isTest: { $ne: true }, provider: { $nin: TEST_PROVIDERS }, resultsProcessedAt: { $ne: null },
    }).select('arm state disposition qualification durationSeconds cost provider isTest quality transcript.role').limit(MAX_CALLS).lean();
    const min = experiment.guardrails?.minCallsPerArm ?? 30;
    const arms = experiment.arms.map((arm) => {
      const list = calls.filter(c => c.arm === arm.key);
      const connected = list.filter(c => REACHED.has(c.disposition));
      const recorded = connected.filter(c => c.quality);
      const samples = recorded.flatMap(c => c.quality.latency?.samplesMs || []);
      const costs = list.map(c => pricedCost(c).amount);
      return {
        key: arm.key, weight: arm.weight, versionId: arm.versionId,
        calls: list.length, connected: connected.length,
        completed: connected.filter(c => c.disposition === 'answered_completed').length,
        qualified: connected.filter(c => c.qualification === 'qualified').length,
        failed: list.filter(c => c.state === 'failed' || c.disposition === 'failed').length,
        optOuts: connected.filter(c => c.disposition === 'do_not_contact').length,
        connectRate: ratio(connected.length, list.length),
        completionRate: ratio(connected.filter(c => c.disposition === 'answered_completed').length, connected.length),
        qualifiedRate: ratio(connected.filter(c => c.qualification === 'qualified').length, connected.length),
        failureRate: ratio(list.filter(c => c.state === 'failed' || c.disposition === 'failed').length, list.length),
        optOutRate: ratio(connected.filter(c => c.disposition === 'do_not_contact').length, connected.length),
        avgCost: list.length ? Number((costs.reduce((s, v) => s + v, 0) / list.length).toFixed(6)) : null,
        quality: {
          callsWithTelemetry: recorded.length, notRecorded: connected.length - recorded.length,
          p50LatencyMs: percentile(samples, 50), p95LatencyMs: percentile(samples, 95),
          missingTranscriptRate: ratio(recorded.filter(c => c.quality.transcript?.missing).length, recorded.length),
          audioFailureRate: ratio(recorded.filter(c => audioFailuresOf(c.quality).length).length, recorded.length),
        },
        underpowered: list.length < min,
      };
    });
    const control = arms.find(a => a.key === 'control');
    const comparisons = arms.filter(a => a.key !== 'control').map(v => ({
      arm: v.key,
      connectRate: twoProportionTest({ x1: control.connected, n1: control.calls, x2: v.connected, n2: v.calls }, { minSamples: min }),
      completionRate: twoProportionTest({ x1: control.completed, n1: control.connected, x2: v.completed, n2: v.connected }, { minSamples: min }),
      qualifiedRate: twoProportionTest({ x1: control.qualified, n1: control.connected, x2: v.qualified, n2: v.connected }, { minSamples: min }),
    }));
    return { minCallsPerArm: min, arms, comparisons, totalCalls: calls.length, truncated: calls.length >= MAX_CALLS };
  }

  async startExperiment(id, actor, meta) {
    const experiment = await this._experiment(id, actor);
    if (!['draft', 'paused'].includes(experiment.status)) throw new ConflictError(`A ${experiment.status} experiment cannot be started`);
    await this._validateDesign(experiment, actor);
    try {
      const started = await ScriptExperiment.findOneAndUpdate({ _id: id, createdBy: actor, status: experiment.status },
        { $set: { status: 'running', startedAt: experiment.startedAt || new Date(), pausedAt: null, pausedReason: null, updatedBy: actor }, $inc: { version: 1 } },
        { returnDocument: 'after' });
      if (!started) throw new ConflictError('Experiment changed meanwhile. Reload and try again');
    } catch (error) {
      if (error?.code === 11000) throw new ConflictError('This agent already has a running experiment. Pause or finish it first');
      throw error;
    }
    this.log('experiment_started', actor, { experimentId: String(id), resumed: experiment.status === 'paused' }, meta);
    return this.getExperiment(id, actor);
  }

  async pauseExperiment(id, actor, { reason = '' } = {}, meta = {}) {
    const paused = await ScriptExperiment.findOneAndUpdate({ _id: id, createdBy: actor, status: 'running' },
      { $set: { status: 'paused', pausedAt: new Date(), pausedReason: 'manual', updatedBy: actor }, $inc: { version: 1 } }, { returnDocument: 'after' });
    if (!paused) throw new ConflictError('Only a running experiment can be paused');
    this.log('experiment_paused', actor, { experimentId: String(id), reason }, meta);
    return this.getExperiment(id, actor);
  }

  /** Write a version onto the agent and its unfinished campaigns, and record the activation. */
  async _activate(agentId, versionId, { action, experimentId = null, reason = '' }, actor) {
    const version = await AgentScriptVersion.findById(versionId).lean();
    const previous = await activeVersionId(agentId);
    const agent = await CallingAgent.findOneAndUpdate({ _id: agentId, createdBy: actor,
      $or: [{ launchLeaseUntil: null }, { launchLeaseUntil: { $lt: new Date() } }],
    }, { $set: {
      agentConfig: { ...version.snapshot.agentConfig },
      questionnaire: version.snapshot.questionnaire, statusRules: version.snapshot.statusRules, updatedBy: actor,
    }, $inc: { version: 1 } }, { returnDocument: 'after' });
    if (!agent) throw new ConflictError('A campaign launch is in progress for this agent. Try again in a moment');
    // Prompt/voice settings only: a running campaign's questionnaire stays as snapshotted.
    const campaigns = await CallCampaign.updateMany({ agentId, createdBy: actor, status: { $in: UNFINISHED_CAMPAIGNS } },
      { $set: Object.fromEntries(Object.entries(pickAgentConfig(version.snapshot.agentConfig)).map(([k, v]) => [`agentConfig.${k}`, v])) });
    await ScriptActivation.create({ agentId, versionId, previousVersionId: previous, action, experimentId, campaignsUpdated: campaigns.modifiedCount || 0, reason, createdBy: actor });
    return { campaignsUpdated: campaigns.modifiedCount || 0, previousVersionId: previous };
  }

  async promote(id, { arm, reason = '' }, actor, meta) {
    const experiment = await this._experiment(id, actor);
    if (!['running', 'paused'].includes(experiment.status)) throw new ConflictError('Only a running or paused experiment can be promoted');
    const chosen = experiment.arms.find(a => a.key === arm);
    if (!chosen) throw new ValidationError('Unknown arm');
    // Stop assignment first so no new call lands on a losing arm mid-promotion.
    const closed = await ScriptExperiment.findOneAndUpdate({ _id: id, status: experiment.status },
      { $set: { status: 'completed', completedAt: new Date(), promotedArm: arm, updatedBy: actor }, $inc: { version: 1 } });
    if (!closed) throw new ConflictError('Experiment changed meanwhile. Reload and try again');
    const result = await this._activate(experiment.agentId, chosen.versionId, { action: 'promote', experimentId: experiment._id, reason }, actor);
    this.log('experiment_promoted', actor, { experimentId: String(id), arm, versionId: String(chosen.versionId), ...result, previousVersionId: result.previousVersionId ? String(result.previousVersionId) : null, reason }, meta);
    return { experiment: await this.getExperiment(id, actor), ...result };
  }

  /** Restore the version that was active before the current one; any running experiment is paused. */
  async rollback(agentId, { reason = '' } = {}, actor, meta) {
    await this._agent(agentId, actor);
    const latest = await ScriptActivation.findOne({ agentId }).sort({ createdAt: -1, _id: -1 }).lean();
    if (!latest?.previousVersionId) throw new ConflictError('There is no earlier script version to restore');
    const paused = await ScriptExperiment.updateMany({ agentId, createdBy: actor, status: 'running' },
      { $set: { status: 'paused', pausedAt: new Date(), pausedReason: 'rollback', updatedBy: actor }, $inc: { version: 1 } });
    const result = await this._activate(agentId, latest.previousVersionId, { action: 'rollback', reason }, actor);
    this.log('rollback', actor, { agentId: String(agentId), restoredVersionId: String(latest.previousVersionId), fromVersionId: String(latest.versionId), experimentsPaused: paused.modifiedCount || 0, campaignsUpdated: result.campaignsUpdated, reason }, meta);
    return { restoredVersionId: latest.previousVersionId, experimentsPaused: paused.modifiedCount || 0, ...result, state: await this.scriptState(agentId, actor) };
  }

  /** Sweep: auto-pause a running experiment whose variant breaches a guardrail vs control. */
  async evaluateGuardrails(now = new Date()) {
    const running = await ScriptExperiment.find({ status: 'running' }).lean();
    const outcome = { checked: 0, paused: 0 };
    for (const experiment of running) {
      outcome.checked += 1;
      try {
        const stats = await this.experimentStats(experiment);
        const control = stats.arms.find(a => a.key === 'control');
        const flat = a => a && ({ calls: a.calls, failureRate: a.failureRate, optOutRate: a.optOutRate, missingTranscriptRate: a.quality.missingTranscriptRate, audioFailureRate: a.quality.audioFailureRate, p95LatencyMs: a.quality.p95LatencyMs });
        const min = experiment.guardrails?.minCallsPerArm ?? 30;
        const enough = stats.arms.every(a => a.calls >= min);
        const breaches = stats.arms.filter(a => a.key !== 'control')
          .flatMap(v => guardrailBreaches(flat(control), flat(v), experiment.guardrails || {}).map(b => ({ ...b, arm: v.key, controlCalls: control.calls, variantCalls: v.calls, at: now })));
        if (!breaches.length) {
          await ScriptExperiment.updateOne({ _id: experiment._id }, { $set: { guardrailStatus: { checkedAt: now, state: enough ? 'ok' : 'insufficient_data' } } });
          continue;
        }
        const paused = await ScriptExperiment.findOneAndUpdate({ _id: experiment._id, status: 'running' }, {
          $set: { status: 'paused', pausedAt: now, pausedReason: 'guardrail', guardrailStatus: { checkedAt: now, state: 'breached' } },
          $push: { guardrailEvents: { $each: breaches } }, $inc: { version: 1 },
        });
        if (!paused) continue;
        outcome.paused += 1;
        audit.logEvent({ eventType: 'ai_calling.script.experiment_guardrail_paused', module: 'ai-calling', userId: experiment.createdBy,
          ipAddress: 'internal', result: 'success', details: { experimentId: String(experiment._id), breaches: breaches.map(b => ({ arm: b.arm, metric: b.metric, controlValue: b.controlValue, variantValue: b.variantValue })) } });
        notificationService.create({
          channels: ['IN_APP'], recipientIds: [experiment.createdBy], type: 'ai_calling.experiment_paused', category: 'CRM', priority: 'HIGH',
          payload: { title: 'Script experiment paused', message: `"${experiment.name}" was paused: ${breaches.map(b => `${b.arm} ${b.metric}`).join(', ')} exceeded its guardrail.`, experimentId: String(experiment._id) },
          sourceModule: 'ai-calling', sourceEvent: 'EXPERIMENT_GUARDRAIL', sourceEntityType: 'ScriptExperiment', sourceEntityId: experiment._id,
          idempotencyKey: `ai-experiment-guardrail-${experiment._id}-${now.getTime()}`,
        }, experiment.createdBy).catch(e => logger.warn('experiment notification failed', { module: 'ai-calling', error: e.message }));
      } catch (error) {
        logger.warn('experiment guardrail check failed', { module: 'ai-calling', experimentId: String(experiment._id), error: error?.message });
      }
    }
    return outcome;
  }
}

export const __test__ = { snapshotOf, hashes };
export default new ScriptExperimentService();
