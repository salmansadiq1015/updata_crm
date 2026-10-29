import { BenchmarkCase, BenchmarkRun, BenchmarkSuite } from './benchmark.model.js';
import { AgentScriptVersion } from './scriptExperiment.model.js';
import FileMetadata from '../files/file.model.js';
import queueManager from '../../shared/queue/QueueManager.js';
import audit from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { runCase } from './engine/benchmarkRunner.js';
import { aggregateResults } from './engine/benchmarkScoring.js';
import { contentHash } from './engine/experimentStats.js';
import { SAMPLE_CASES, SAMPLE_SUITE } from './benchmarkSamples.js';

export const BENCHMARK_QUEUE = 'ai-calling-benchmark';
const RUN_STALE_MS = 30 * 60_000;
const CONTENT_FIELDS = ['language', 'conditions', 'turns', 'audio', 'groundTruth'];
const DEFAULT_STT_LANGUAGE = { ur: 'ur', en: 'en', mixed: 'ur' };

/**
 * The post-call extractor (callIntelligence: model proposes → evidence-checked
 * acceptance), when it exists in this build. Only items it auto-accepts are scored;
 * items it routes to human review are counted separately. It calls the configured
 * LLM, so it only runs when a run asks for it. Absent/unconfigured → reported, never faked.
 */
export async function loadExtractor() {
  let engine; let service; let llm;
  try {
    [engine, service, llm] = await Promise.all([
      import('./engine/callIntelligence.js'), import('./callIntelligence.service.js'), import('../../shared/ai/llmFactory.js'),
    ]);
  } catch (error) {
    return { fn: null, name: `not available in this build (${String(error?.message || error).slice(0, 120)})` };
  }
  const svc = service.default;
  if (typeof engine.buildExtractionMessages !== 'function' || typeof engine.parseExtraction !== 'function'
    || typeof engine.acceptProposals !== 'function' || typeof svc?._model !== 'function') {
    return { fn: null, name: 'callIntelligence has no compatible extraction API' };
  }
  const fn = async ({ transcript, language }) => {
    if (!svc.complete && !llm.isAiConfigured()) throw new Error('AI provider is not configured');
    const turns = transcript.map(t => ({ role: t.role, text: t.text }));
    const out = await svc._model(engine.buildExtractionMessages(turns, { language }));
    const proposals = engine.parseExtraction(out.raw);
    if (!proposals) throw new Error('The model reply was not valid JSON');
    const { items, rejected } = engine.acceptProposals(proposals, turns);
    return {
      items: items.filter(i => i.status === 'accepted').map(i => ({ category: i.category, value: i.normalized ?? i.value, quote: i.quote })),
      needsReview: items.filter(i => i.status === 'needs_review').length,
      rejected: rejected.length,
    };
  };
  return { fn, name: `callIntelligence (${engine.INTELLIGENCE_PROMPT_VERSION || 'unversioned'})` };
}

class BenchmarkService {
  log(action, actor, details, meta = {}) {
    audit.logEvent({ eventType: `ai_calling.benchmark.${action}`, module: 'ai-calling', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details });
  }

  async _suite(id, actor) {
    const suite = await BenchmarkSuite.findOne({ _id: id, createdBy: actor }).lean();
    if (!suite) throw new NotFoundError('BenchmarkSuite', id);
    return suite;
  }

  async _case(caseId, actor) {
    const doc = await BenchmarkCase.findOne({ _id: caseId, createdBy: actor }).lean();
    if (!doc) throw new NotFoundError('BenchmarkCase', caseId);
    return doc;
  }

  async listSuites(actor, { includeArchived = false } = {}) {
    const suites = await BenchmarkSuite.find({ createdBy: actor, ...(includeArchived ? {} : { archivedAt: null }) }).sort({ updatedAt: -1 }).lean();
    const ids = suites.map(s => s._id);
    const [counts, runs] = await Promise.all([
      BenchmarkCase.aggregate([{ $match: { suiteId: { $in: ids } } }, { $group: { _id: '$suiteId', cases: { $sum: 1 }, reviewed: { $sum: { $cond: ['$reviewed', 1, 0] } } } }]),
      BenchmarkRun.aggregate([{ $match: { suiteId: { $in: ids } } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$suiteId', last: { $first: { _id: '$_id', status: '$status', createdAt: '$createdAt', metrics: '$metrics.overall' } } } }]),
    ]);
    const c = new Map(counts.map(x => [String(x._id), x]));
    const r = new Map(runs.map(x => [String(x._id), x.last]));
    return suites.map(s => ({ ...s, cases: c.get(String(s._id))?.cases || 0, reviewedCases: c.get(String(s._id))?.reviewed || 0, lastRun: r.get(String(s._id)) || null }));
  }

  async getSuite(id, actor) {
    const suite = await this._suite(id, actor);
    const cases = await BenchmarkCase.find({ suiteId: suite._id }).sort({ createdAt: 1 }).lean();
    return { ...suite, caseList: cases };
  }

  async createSuite(input, actor, meta) {
    const suite = await BenchmarkSuite.create({ ...input, createdBy: actor, updatedBy: actor });
    this.log('suite_created', actor, { suiteId: String(suite._id) }, meta);
    return this.getSuite(suite._id, actor);
  }

  async updateSuite(id, { archived, ...changes }, actor, meta) {
    await this._suite(id, actor);
    const set = { ...changes, updatedBy: actor };
    if (archived !== undefined) set.archivedAt = archived ? new Date() : null;
    await BenchmarkSuite.updateOne({ _id: id, createdBy: actor }, { $set: set }, { runValidators: true });
    // A changed questionnaire changes what every case's ground truth refers to.
    if (changes.questionnaire) {
      await BenchmarkCase.updateMany({ suiteId: id, reviewed: true }, { $set: { reviewed: false, reviewedBy: null, reviewedAt: null, reviewNote: 'Questionnaire changed: review again' }, $inc: { revision: 1 } });
    }
    this.log('suite_updated', actor, { suiteId: String(id), questionnaireChanged: Boolean(changes.questionnaire) }, meta);
    return this.getSuite(id, actor);
  }

  /** The starter suite (unreviewed SAMPLE cases). Idempotent per user. */
  async seedSampleSuite(actor, meta) {
    const existing = await BenchmarkSuite.findOne({ createdBy: actor, sample: true, archivedAt: null }).lean();
    if (existing) return { ...(await this.getSuite(existing._id, actor)), existing: true };
    const suite = await BenchmarkSuite.create({ ...SAMPLE_SUITE, sample: true, createdBy: actor, updatedBy: actor });
    await BenchmarkCase.insertMany(SAMPLE_CASES.map(c => ({ ...c, suiteId: suite._id, sample: true, reviewed: false, createdBy: actor, updatedBy: actor })));
    this.log('sample_suite_created', actor, { suiteId: String(suite._id), cases: SAMPLE_CASES.length }, meta);
    return this.getSuite(suite._id, actor);
  }

  async _assertAudio(audio, actor) {
    if (!audio?.fileId) return;
    const file = await FileMetadata.findOne({ _id: audio.fileId, uploadedBy: actor }).select('mimeType').lean();
    if (!file) throw new ValidationError('The audio file was not found among your uploads');
    if (file.mimeType && !String(file.mimeType).startsWith('audio/')) throw new ValidationError('The selected file is not audio');
  }

  _assertFieldKeys(suite, groundTruth) {
    const keys = new Set((suite.questionnaire?.questions || []).map(q => q.fieldKey));
    const unknown = (groundTruth?.answers || []).map(a => a.fieldKey).filter(k => !keys.has(k));
    if (unknown.length) throw new ValidationError(`Expected answers refer to fields not in this suite: ${unknown.join(', ')}`);
  }

  async createCase(suiteId, input, actor, meta) {
    const suite = await this._suite(suiteId, actor);
    this._assertFieldKeys(suite, input.groundTruth);
    await this._assertAudio(input.audio, actor);
    const doc = await BenchmarkCase.create({ ...input, suiteId, reviewed: false, createdBy: actor, updatedBy: actor });
    this.log('case_created', actor, { suiteId: String(suiteId), caseId: String(doc._id) }, meta);
    return doc.toObject();
  }

  /** Any content edit withdraws the review: approved ground truth must be what was approved. */
  async updateCase(caseId, input, actor, meta) {
    const current = await this._case(caseId, actor);
    const suite = await this._suite(current.suiteId, actor);
    if (input.groundTruth) this._assertFieldKeys(suite, input.groundTruth);
    if (input.audio) await this._assertAudio(input.audio, actor);
    const contentChanged = CONTENT_FIELDS.some(k => input[k] !== undefined && contentHash(input[k]) !== contentHash(current[k] ?? null));
    const update = { $set: { ...input, updatedBy: actor } };
    if (input.audio === null) { delete update.$set.audio; update.$unset = { audio: 1 }; }
    if (contentChanged) {
      Object.assign(update.$set, { reviewed: false, reviewedBy: null, reviewedAt: null, reviewNote: '' });
      update.$inc = { revision: 1 };
    }
    const doc = await BenchmarkCase.findOneAndUpdate({ _id: caseId, createdBy: actor, revision: current.revision }, update, { returnDocument: 'after', runValidators: true }).lean();
    if (!doc) throw new ConflictError('This case changed meanwhile. Reload before saving');
    this.log('case_updated', actor, { caseId: String(caseId), contentChanged, reviewWithdrawn: contentChanged && current.reviewed }, meta);
    return doc;
  }

  async removeCase(caseId, actor, meta) {
    await this._case(caseId, actor);
    await BenchmarkCase.deleteOne({ _id: caseId, createdBy: actor });
    this.log('case_deleted', actor, { caseId: String(caseId) }, meta);
    return { deleted: true };
  }

  /** Approve (or withdraw) a case's ground truth, for exactly the revision the reviewer saw. */
  async reviewCase(caseId, { approved, revision, note = '' }, actor, meta) {
    const current = await this._case(caseId, actor);
    if (approved && !(current.groundTruth?.answers?.length || current.groundTruth?.extraction?.length || current.audio?.referenceTranscript)) {
      throw new ValidationError('Add expected answers, extraction items or an audio reference transcript before approving');
    }
    const doc = await BenchmarkCase.findOneAndUpdate({ _id: caseId, createdBy: actor, revision }, {
      $set: approved
        ? { reviewed: true, reviewedBy: actor, reviewedAt: new Date(), reviewNote: note }
        : { reviewed: false, reviewedBy: null, reviewedAt: null, reviewNote: note },
    }, { returnDocument: 'after' }).lean();
    if (!doc) throw new ConflictError('This case was edited after you opened it. Review the latest version');
    this.log(approved ? 'case_approved' : 'case_review_withdrawn', actor, { caseId: String(caseId), revision, sample: current.sample }, meta);
    return doc;
  }

  // ------------------------------------------------------------ runs
  async createRun(suiteId, input, actor, meta) {
    const suite = await this._suite(suiteId, actor);
    if (suite.archivedAt) throw new ValidationError('Restore this suite before running it');
    if (!await BenchmarkCase.exists({ suiteId })) throw new ValidationError('Add at least one case before running the benchmark');
    let agentId = suite.agentId || null;
    if (input.scriptVersionId) {
      const version = await AgentScriptVersion.findById(input.scriptVersionId).select('agentId createdBy').lean();
      if (!version || String(version.createdBy) !== String(actor)) throw new ValidationError('Script version not found');
      agentId = version.agentId;
    }
    const run = await BenchmarkRun.create({
      suiteId, label: input.label || '', agentId, scriptVersionId: input.scriptVersionId || null,
      knowledgeVersionId: input.knowledgeVersionId || null,
      options: { includeExtractor: Boolean(input.includeExtractor), includeAudio: Boolean(input.includeAudio) },
      createdBy: actor,
    });
    try {
      await queueManager.addJob(BENCHMARK_QUEUE, 'run', { runId: String(run._id) }, { jobId: `benchmark-${run._id}` });
    } catch (error) {
      await BenchmarkRun.updateOne({ _id: run._id }, { $set: { status: 'failed', error: `Could not queue the run: ${error.message}`.slice(0, 1000), completedAt: new Date() } });
      throw new ConflictError('The benchmark queue is unavailable. Try again later');
    }
    this.log('run_queued', actor, { suiteId: String(suiteId), runId: String(run._id), scriptVersionId: input.scriptVersionId || null }, meta);
    return BenchmarkRun.findById(run._id).lean();
  }

  async listRuns(suiteId, actor) {
    await this._suite(suiteId, actor);
    return BenchmarkRun.find({ suiteId, createdBy: actor }).select('-caseResults').sort({ createdAt: -1 }).limit(100).lean();
  }

  async getRun(runId, actor) {
    const run = await BenchmarkRun.findOne({ _id: runId, createdBy: actor }).lean();
    if (!run) throw new NotFoundError('BenchmarkRun', runId);
    return run;
  }

  /** Run-to-run comparison: metric deltas and per-case changes on cases both runs scored. */
  async compareRuns(a, b, actor) {
    const [ra, rb] = await Promise.all([this.getRun(a, actor), this.getRun(b, actor)]);
    const delta = (x, y) => (x == null || y == null ? null : Number((y - x).toFixed(4)));
    const keys = ['fieldAccuracy', 'exactMatchRate', 'missRate', 'falsePositiveRate'];
    const diff = (ma, mb) => Object.fromEntries(keys.map(k => [k, { a: ma?.[k] ?? null, b: mb?.[k] ?? null, delta: delta(ma?.[k], mb?.[k]) }]));
    const groups = (field) => [...new Set([...Object.keys(ra.metrics?.[field] || {}), ...Object.keys(rb.metrics?.[field] || {})])]
      .map(k => ({ key: k, ...diff(ra.metrics?.[field]?.[k], rb.metrics?.[field]?.[k]), casesA: ra.metrics?.[field]?.[k]?.cases ?? 0, casesB: rb.metrics?.[field]?.[k]?.cases ?? 0 }));
    const byCase = new Map(ra.caseResults.filter(r => r.scored).map(r => [String(r.caseId), r]));
    const cases = rb.caseResults.filter(r => r.scored && byCase.has(String(r.caseId))).map((r) => {
      const prev = byCase.get(String(r.caseId));
      const correct = x => x.fields.filter(f => ['exact', 'normalized'].includes(f.outcome)).length;
      return { caseId: String(r.caseId), title: r.title, language: r.language, sameRevision: prev.caseRevision === r.caseRevision, correctA: correct(prev), correctB: correct(r), fields: r.fields.length };
    });
    return {
      a: { id: String(ra._id), label: ra.label, createdAt: ra.createdAt, scriptVersionId: ra.scriptVersionId, knowledgeVersionId: ra.knowledgeVersionId, status: ra.status },
      b: { id: String(rb._id), label: rb.label, createdAt: rb.createdAt, scriptVersionId: rb.scriptVersionId, knowledgeVersionId: rb.knowledgeVersionId, status: rb.status },
      sameSuite: String(ra.suiteId) === String(rb.suiteId),
      overall: diff(ra.metrics?.overall, rb.metrics?.overall),
      byLanguage: groups('byLanguage'), byCondition: groups('byCondition'),
      cases,
    };
  }

  async _transcriber() {
    const [{ default: stt }, { default: fileService }] = await Promise.all([
      import('../ai/sttGateway.service.js'), import('../files/file.service.js'),
    ]);
    return async (caseDoc) => {
      const file = await FileMetadata.findById(caseDoc.audio.fileId).select('key mimeType').lean();
      if (!file) throw new Error('Audio file no longer exists');
      const buffer = await fileService.downloadBuffer(file.key);
      const language = caseDoc.audio.sttLanguage || DEFAULT_STT_LANGUAGE[caseDoc.language] || undefined;
      const result = await stt.transcribe(buffer, { language, mimeType: caseDoc.audio.mimeType || file.mimeType });
      return { text: result.text, language, provider: result.provider };
    };
  }

  /** Worker entry point: execute a queued run. Idempotent (only a queued run is claimed). */
  async processRun(runId, { extractorLoader = loadExtractor, transcriber = null } = {}) {
    const run = await BenchmarkRun.findOneAndUpdate({ _id: runId, status: 'queued' }, { $set: { status: 'running', startedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!run) return { skipped: true };
    try {
      const suite = await BenchmarkSuite.findById(run.suiteId).lean();
      if (!suite) throw new Error('Suite was deleted');
      let questionnaire = suite.questionnaire;
      let questionnaireSource = 'suite';
      if (run.scriptVersionId) {
        const version = await AgentScriptVersion.findById(run.scriptVersionId).select('snapshot.questionnaire').lean();
        if (!version) throw new Error('Script version was deleted');
        questionnaire = version.snapshot.questionnaire;
        questionnaireSource = 'script_version';
      }
      const cases = await BenchmarkCase.find({ suiteId: run.suiteId }).sort({ createdAt: 1 }).lean();
      const extractor = run.options?.includeExtractor ? await extractorLoader() : { fn: null, name: 'not requested' };
      const transcribe = run.options?.includeAudio ? (transcriber || await this._transcriber()) : null;
      const caseResults = [];
      for (const c of cases) caseResults.push(await runCase(c, questionnaire, { extractor: extractor.fn, transcribe }));
      const metrics = aggregateResults(caseResults);
      await BenchmarkRun.updateOne({ _id: run._id }, { $set: {
        status: 'completed', completedAt: new Date(), caseResults, metrics, questionnaireSource,
        questionnaireHash: contentHash(questionnaire?.questions || []), extractor: extractor.name,
      } });
      return { completed: true, runId: String(run._id), scoredCases: metrics.overall.cases };
    } catch (error) {
      logger.warn('benchmark run failed', { module: 'ai-calling', runId: String(runId), error: error?.message });
      await BenchmarkRun.updateOne({ _id: run._id }, { $set: { status: 'failed', completedAt: new Date(), error: String(error?.message || error).slice(0, 1000) } });
      return { failed: true, error: error?.message };
    }
  }

  /** Runs whose worker died mid-run are failed, not left "running" forever. */
  async failStaleRuns(now = new Date()) {
    const res = await BenchmarkRun.updateMany({ status: 'running', startedAt: { $lt: new Date(now.getTime() - RUN_STALE_MS) } },
      { $set: { status: 'failed', completedAt: now, error: 'The run did not finish (worker stopped). Start it again.' } });
    return res.modifiedCount || 0;
  }
}

export default new BenchmarkService();
