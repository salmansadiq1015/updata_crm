import Lead from './lead.model.js';
import LeadScoringConfig from './leadScoringConfig.model.js';
import {
  scoreLead, normalizeScoringConfig, toStoredScore, DEFAULT_SCORING_CONFIG, FACTOR_DEFINITIONS, ENGINE_VERSION,
} from './leadScoring.engine.js';
import { collectSignals } from './leadScoring.signals.js';
import queueManager from '../../shared/queue/QueueManager.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

export const LEAD_SCORING_QUEUE = 'lead-scoring';
const CONFIG_TTL_MS = 30_000;
const BATCH = 200;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
// Debounce window for event-driven rescoring: bursts (a call wrap-up writes
// outcome, qualification and contact stamp back to back) collapse into one job.
const DEBOUNCE_MS = 5_000;

let cached = null; // { at, value }

function serializeConfigDoc(doc) {
  if (!doc) {
    return {
      ...normalizeScoringConfig(DEFAULT_SCORING_CONFIG),
      source: 'default',
      note: null,
      createdBy: null,
      createdAt: null,
      recompute: null,
    };
  }
  return {
    ...normalizeScoringConfig(doc),
    source: 'stored',
    id: String(doc._id),
    note: doc.note ?? null,
    createdBy: doc.createdBy ?? null,
    createdAt: doc.createdAt ?? null,
    recompute: doc.recompute ?? null,
  };
}

class LeadScoringService {
  /** The active (highest-version) config, normalized onto the engine defaults. */
  async getActiveConfig({ fresh = false } = {}) {
    if (!fresh && cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.value;
    const doc = await LeadScoringConfig.findOne({}).sort({ version: -1 }).lean();
    const value = serializeConfigDoc(doc);
    cached = { at: Date.now(), value };
    return value;
  }

  invalidateConfigCache() { cached = null; }

  /** Engine metadata for the admin editor (factor catalogue + defaults). */
  describe() {
    return {
      engineVersion: ENGINE_VERSION,
      factors: FACTOR_DEFINITIONS.map((f) => ({ key: f.key, group: f.group, label: f.label, penalty: f.key === 'q_objections' })),
      defaults: normalizeScoringConfig(DEFAULT_SCORING_CONFIG),
    };
  }

  async listVersions({ limit = 20 } = {}) {
    const docs = await LeadScoringConfig.find({}).sort({ version: -1 }).limit(Math.min(limit, 100))
      .select('version note createdBy createdAt recompute').populate({ path: 'createdBy', select: 'firstName lastName email' }).lean();
    return docs;
  }

  /**
   * Store a new config version (never edits an old one) and queue a bulk
   * recompute so every lead is re-stamped with the new version.
   */
  async updateConfig(input, userId, meta = {}) {
    const current = await LeadScoringConfig.findOne({}).sort({ version: -1 }).select('version').lean();
    const version = Math.max(current?.version ?? DEFAULT_SCORING_CONFIG.version, DEFAULT_SCORING_CONFIG.version) + 1;
    const normalized = normalizeScoringConfig({ ...input, version });
    const doc = await LeadScoringConfig.create({
      version,
      bands: normalized.bands,
      minEvidence: normalized.minEvidence,
      targetBusinessTypes: normalized.targetBusinessTypes,
      targetCities: normalized.targetCities,
      factors: normalized.factors,
      rules: normalized.rules,
      note: input.note ?? null,
      createdBy: userId,
      recompute: { status: 'queued' },
    });
    this.invalidateConfigCache();

    auditService.logEvent({
      eventType: 'lead.scoring_config_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { version, previousVersion: current?.version ?? DEFAULT_SCORING_CONFIG.version },
      module: 'lead',
    });

    await this.scheduleRecomputeAll(version);
    return serializeConfigDoc(doc.toObject());
  }

  async _loadLead(leadId) {
    const lead = await Lead.findById(leadId).lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    return lead;
  }

  /** Compute (without persisting) the full explanation for a lead. */
  async evaluate(lead, { config, now = new Date() } = {}) {
    const cfg = config || await this.getActiveConfig();
    const signals = await collectSignals(lead);
    return scoreLead(lead, signals, cfg, { now });
  }

  /**
   * GET /crm/leads/:id/score — the fresh, evidence-backed breakdown plus the
   * stored copy, so the UI can show when the list value is out of date.
   */
  async explain(leadId) {
    const lead = await this._loadLead(leadId);
    const result = await this.evaluate(lead);
    const stored = lead.score || null;
    return {
      leadId: String(lead._id),
      ...result,
      stored,
      stale: !stored || stored.value !== result.score || stored.band !== result.band || stored.version !== result.version,
    };
  }

  async _persist(leadId, result) {
    // timestamps:false — a score write must not bump updatedAt, otherwise the
    // staleness sweep (updatedAt > score.computedAt) would chase its own tail.
    await Lead.updateOne(
      { _id: leadId, isDeleted: false },
      { $set: { score: toStoredScore(result), scoreValue: result.score } },
      { timestamps: false },
    );
  }

  /** Recompute and persist one lead's score. */
  async recalculate(leadId, { userId = null, meta = {}, reason = 'manual' } = {}) {
    const lead = await this._loadLead(leadId);
    const result = await this.evaluate(lead);
    await this._persist(lead._id, result);
    if (userId) {
      auditService.logEvent({
        eventType: 'lead.score_recalculated',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: { leadId: String(lead._id), score: result.score, band: result.band, version: result.version, reason },
        module: 'lead',
      });
    }
    return { leadId: String(lead._id), ...result, stored: toStoredScore(result), stale: false };
  }

  /**
   * Live preview for the admin editor: the candidate config's result for one
   * sample lead next to the active config's result. Never persists.
   */
  async preview(candidate, leadId) {
    const lead = await this._loadLead(leadId);
    const signals = await collectSignals(lead);
    const now = new Date();
    const active = await this.getActiveConfig();
    const draft = normalizeScoringConfig({ ...candidate, version: (active.version || 1) + 1 });
    return {
      leadId: String(lead._id),
      leadName: lead.name,
      current: scoreLead(lead, signals, active, { now }),
      preview: scoreLead(lead, signals, draft, { now }),
    };
  }

  /** Recompute every live lead (bulk job after a config change). */
  async recomputeAll({ version = null } = {}) {
    const cfg = await this.getActiveConfig({ fresh: true });
    if (version != null && cfg.version !== version) {
      // A newer config superseded this run; that version's own job re-stamps everything.
      logger.info('Lead score recompute superseded', { module: 'crm', action: 'leadScoring.recomputeAll', version, active: cfg.version });
      await LeadScoringConfig.updateOne({ version }, { $set: { 'recompute.status': 'done', 'recompute.finishedAt': new Date() } });
      return { superseded: true, processed: 0, failed: 0 };
    }
    if (cfg.source === 'stored') {
      await LeadScoringConfig.updateOne({ version: cfg.version }, {
        $set: { 'recompute.status': 'running', 'recompute.startedAt': new Date(), 'recompute.processed': 0, 'recompute.failed': 0 },
      });
    }
    let processed = 0;
    let failed = 0;
    let lastId = null;
    try {
      for (;;) {
        const filter = lastId ? { _id: { $gt: lastId } } : {};
        const leads = await Lead.find(filter).sort({ _id: 1 }).limit(BATCH).lean();
        if (!leads.length) break;
        for (const lead of leads) {
          try {
            const result = await this.evaluate(lead, { config: cfg });
            await this._persist(lead._id, result);
            processed += 1;
          } catch (err) {
            failed += 1;
            logger.warn('Lead score recompute failed', { module: 'crm', action: 'leadScoring.recomputeAll', leadId: String(lead._id), error: { message: err.message } });
          }
        }
        lastId = leads[leads.length - 1]._id;
        if (cfg.source === 'stored') {
          await LeadScoringConfig.updateOne({ version: cfg.version }, { $set: { 'recompute.processed': processed, 'recompute.failed': failed } });
        }
      }
      if (cfg.source === 'stored') {
        await LeadScoringConfig.updateOne({ version: cfg.version }, {
          $set: { 'recompute.status': 'done', 'recompute.finishedAt': new Date(), 'recompute.processed': processed, 'recompute.failed': failed },
        });
      }
    } catch (err) {
      if (cfg.source === 'stored') {
        await LeadScoringConfig.updateOne({ version: cfg.version }, {
          $set: { 'recompute.status': 'failed', 'recompute.error': String(err.message).slice(0, 500), 'recompute.finishedAt': new Date() },
        });
      }
      throw err;
    }
    this.invalidateConfigCache();
    return { processed, failed, version: cfg.version };
  }

  /**
   * Periodic catch-up: leads never scored, scored under an older config,
   * changed since their score, or whose score is older than a day (recency
   * decays with time). Bounded per run.
   */
  async sweep({ limit = 500, now = new Date() } = {}) {
    const cfg = await this.getActiveConfig({ fresh: true });
    const leads = await Lead.find({
      $or: [
        { score: { $exists: false } },
        { score: null },
        { 'score.version': { $ne: cfg.version } },
        { 'score.computedAt': { $lt: new Date(now.getTime() - STALE_AFTER_MS) } },
        { $expr: { $gt: ['$updatedAt', '$score.computedAt'] } },
      ],
    }).sort({ updatedAt: -1 }).limit(limit).lean();
    let processed = 0;
    for (const lead of leads) {
      try {
        await this._persist(lead._id, await this.evaluate(lead, { config: cfg, now }));
        processed += 1;
      } catch (err) {
        logger.warn('Lead score sweep failed for lead', { module: 'crm', action: 'leadScoring.sweep', leadId: String(lead._id), error: { message: err.message } });
      }
    }
    return { processed, candidates: leads.length };
  }

  /**
   * Event-driven rescore (after a communication / call / qualification change).
   * Debounced by a per-lead job id; never throws — scoring must never break the
   * write path that triggered it. Without a queue (scripts, tests) it is a
   * no-op and the periodic sweep catches the lead up.
   */
  async scheduleRecompute(leadId, reason = 'signal') {
    if (!leadId) return false;
    try {
      await queueManager.addJob(LEAD_SCORING_QUEUE, 'score-lead', { leadId: String(leadId), reason }, {
        jobId: `lead-score-${String(leadId)}`,
        delay: DEBOUNCE_MS,
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return true;
    } catch (err) {
      logger.debug('Lead rescore not queued', { module: 'crm', action: 'leadScoring.schedule', leadId: String(leadId), error: { message: err.message } });
      return false;
    }
  }

  async scheduleRecomputeAll(version) {
    try {
      await queueManager.addJob(LEAD_SCORING_QUEUE, 'recompute-all', { version }, {
        jobId: `lead-score-all-${version}`, removeOnComplete: true, removeOnFail: 20,
      });
      return true;
    } catch (err) {
      logger.warn('Lead score bulk recompute not queued', { module: 'crm', action: 'leadScoring.scheduleAll', version, error: { message: err.message } });
      return false;
    }
  }
}

const leadScoringService = new LeadScoringService();
export default leadScoringService;
