import mongoose from 'mongoose';
import client from 'prom-client';
import CallRecord from './callRecord.model.js';
import CallCampaign from './callCampaign.model.js';
import CallingAgent from './callingAgent.model.js';
import Lead from '../crm/lead.model.js';
import logger from '../../shared/logger/index.js';
import {
  FLAG_REASONS, audioFailuresOf, extractionErrorOf, flagsForCall, percentile, rate, sanitizeTelemetry,
} from './engine/callQualityTelemetry.js';

/**
 * Call quality: persists the worker's per-call telemetry (once, at /end) and
 * aggregates it for the Quality dashboard.
 *
 * Population: processed, answered, non-test calls (browser/link tests and test
 * campaigns are excluded, as in callAnalytics.service.js). A call without telemetry
 * (placed before it was recorded, or the worker died before /end) counts as
 * "not recorded" in every quality metric — never as zero.
 */

const TEST_PROVIDERS = ['livekit_web', 'web_link_preview'];
const MAX_CALLS = 5000;
export const DEFAULT_LATENCY_THRESHOLD_MS = () => Number(process.env.AI_CALLING_QUALITY_LATENCY_MS) || 2000;

let turnLatency = null;
try {
  turnLatency = new client.Histogram({
    name: 'updata_ai_call_turn_latency_ms',
    help: 'AI call response latency per turn (end of caller speech to first agent audio), ms',
    buckets: [250, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000],
  });
} catch { /* already registered (hot reload / tests) */ }

const baseLanguage = l => (l ? String(l).toLowerCase().split(/[-_]/)[0] : null);

class CallQualityService {
  /** Store the worker's telemetry for a call. First report wins (a retried /end is a no-op). */
  async recordTelemetry(internalCallId, raw) {
    const quality = sanitizeTelemetry(raw);
    if (!quality) return { stored: false };
    try {
      const res = await CallRecord.updateOne({ internalCallId, quality: { $exists: false } }, { $set: { quality } });
      if (res.modifiedCount && turnLatency) for (const ms of quality.latency.samplesMs) turnLatency.observe(ms);
      return { stored: Boolean(res.modifiedCount) };
    } catch (error) {
      // Telemetry must never block ending the call.
      logger.warn('call quality telemetry not stored', { module: 'ai-calling', callId: internalCallId, error: error?.message });
      return { stored: false };
    }
  }

  async _context(actor, { from, to, agentId, campaignId, language, provider } = {}) {
    const owner = new mongoose.Types.ObjectId(String(actor));
    const campaignFilter = { createdBy: owner, isTest: { $ne: true } };
    if (agentId) campaignFilter.agentId = agentId;
    if (campaignId) campaignFilter._id = campaignId;
    const [campaigns, agents] = await Promise.all([
      CallCampaign.find(campaignFilter).select('_id name agentId agentConfig.language').lean(),
      CallingAgent.find({ createdBy: owner }).select('_id name').lean(),
    ]);
    const match = {
      createdBy: owner, campaignId: { $in: campaigns.map(c => c._id) },
      isTest: { $ne: true }, provider: provider && !TEST_PROVIDERS.includes(provider) ? provider : { $nin: TEST_PROVIDERS },
      answeredAt: { $ne: null }, resultsProcessedAt: { $ne: null },
    };
    if (from || to) match.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const calls = campaigns.length ? await CallRecord.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: MAX_CALLS },
      { $project: {
        campaignId: 1, leadId: 1, internalCallId: 1, provider: 1, createdAt: 1, initiatedAt: 1, durationSeconds: 1,
        disposition: 1, state: 1, quality: 1, intelligence: 1, experimentId: 1, arm: 1, scriptVersionId: 1,
        pairedAudioLost: { $cond: [{ $ifNull: ['$gateway.audioLostAt', false] }, true, false] },
        persistedTurns: { $size: { $ifNull: ['$transcript', []] } },
      } },
    ]) : [];
    const campaignMap = new Map(campaigns.map(c => [String(c._id), c]));
    const agentMap = new Map(agents.map(a => [String(a._id), a.name]));
    let rows = calls.map((c) => {
      const campaign = campaignMap.get(String(c.campaignId));
      const detected = baseLanguage(c.quality?.languageDetected);
      return {
        ...c,
        language: detected || baseLanguage(campaign?.agentConfig?.language) || 'unknown',
        languageSource: detected ? 'detected' : 'configured',
        campaignName: campaign?.name || '',
        agentId: campaign?.agentId ? String(campaign.agentId) : null,
        agentName: campaign?.agentId ? agentMap.get(String(campaign.agentId)) || '' : '',
      };
    });
    if (language) rows = rows.filter(r => r.language === baseLanguage(language));
    return { rows, campaigns, agents, truncated: calls.length >= MAX_CALLS };
  }

  _flags(row, threshold) {
    return flagsForCall({ quality: row.quality, intelligence: row.intelligence, persistedTurns: row.persistedTurns, pairedAudioLost: row.pairedAudioLost }, { latencyThresholdMs: threshold });
  }

  /** Aggregate quality over the filters. */
  async summary(actor, filters = {}) {
    const threshold = filters.latencyThresholdMs || DEFAULT_LATENCY_THRESHOLD_MS();
    const { rows, campaigns, agents, truncated } = await this._context(actor, filters);
    const block = (list) => {
      const recorded = list.filter(r => r.quality);
      const samples = recorded.flatMap(r => r.quality.latency?.samplesMs || []);
      const withIntel = list.map(r => extractionErrorOf(r.intelligence)).filter(Boolean);
      const failing = recorded.filter(r => audioFailuresOf(r.quality).length);
      return {
        calls: list.length,
        withTelemetry: recorded.length,
        notRecorded: list.length - recorded.length,
        latency: {
          p50Ms: percentile(samples, 50), p95Ms: percentile(samples, 95), maxMs: samples.length ? Math.max(...samples) : null,
          samples: samples.length, callsWithSamples: recorded.filter(r => r.quality.latency?.samples > 0).length,
          highLatencyCalls: recorded.filter(r => r.quality.latency?.p95Ms != null && r.quality.latency.p95Ms > threshold).length,
          vadSilenceMs: recorded.find(r => r.quality.latency?.vadSilenceMs != null)?.quality.latency.vadSilenceMs ?? null,
        },
        transcripts: {
          recorded: recorded.length,
          missing: recorded.filter(r => r.quality.transcript?.missing).length,
          notPersisted: recorded.filter(r => !r.quality.transcript?.missing && r.persistedTurns === 0 && (r.quality.transcript?.turns || 0) > 0).length,
          missingRate: rate(recorded.filter(r => r.quality.transcript?.missing).length, recorded.length),
        },
        audio: {
          recorded: recorded.length, callsWithFailures: failing.length, rate: rate(failing.length, recorded.length),
          pairedAudioLost: list.filter(r => r.pairedAudioLost).length,
        },
        interruptions: { total: recorded.reduce((s, r) => s + (r.quality.interruptions || 0), 0), perCall: rate(recorded.reduce((s, r) => s + (r.quality.interruptions || 0), 0), recorded.length) },
        silenceEvents: { total: recorded.reduce((s, r) => s + (r.quality.silenceEvents || 0), 0), perCall: rate(recorded.reduce((s, r) => s + (r.quality.silenceEvents || 0), 0), recorded.length) },
        extraction: {
          recorded: withIntel.length, notRecorded: list.length - withIntel.length,
          errors: withIntel.filter(x => x.error).length, rate: rate(withIntel.filter(x => x.error).length, withIntel.length),
          rejectedItems: withIntel.reduce((s, x) => s + x.rejectedItems, 0),
        },
      };
    };

    const failureTypes = Object.fromEntries(FLAG_REASONS.map(k => [k, 0]));
    const audioTypes = {};
    let flaggedCalls = 0;
    const byDay = new Map();
    for (const r of rows) {
      const flags = this._flags(r, threshold);
      if (flags.length) flaggedCalls += 1;
      for (const f of flags) failureTypes[f] += 1;
      for (const f of audioFailuresOf(r.quality)) audioTypes[f.type] = (audioTypes[f.type] || 0) + 1;
      const day = new Date(r.initiatedAt || r.createdAt).toISOString().slice(0, 10);
      const d = byDay.get(day) || { date: day, calls: 0, withTelemetry: 0, flagged: 0, samples: [] };
      d.calls += 1; d.flagged += flags.length ? 1 : 0;
      if (r.quality) { d.withTelemetry += 1; d.samples.push(...(r.quality.latency?.samplesMs || [])); }
      byDay.set(day, d);
    }
    const groupBy = (keyOf, labelOf = k => k) => {
      const map = new Map();
      for (const r of rows) { const k = keyOf(r) || 'unknown'; if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
      return [...map.entries()].map(([key, list]) => {
        const b = block(list);
        return { key, label: labelOf(key), calls: b.calls, withTelemetry: b.withTelemetry, p50Ms: b.latency.p50Ms, p95Ms: b.latency.p95Ms, missingTranscripts: b.transcripts.missing, audioFailureCalls: b.audio.callsWithFailures, extractionErrors: b.extraction.errors, extractionRecorded: b.extraction.recorded };
      }).sort((a, b) => b.calls - a.calls);
    };
    const agentNames = new Map(agents.map(a => [String(a._id), a.name]));

    return {
      latencyThresholdMs: threshold,
      totals: { ...block(rows), flaggedCalls },
      failureTypes: Object.entries(failureTypes).map(([type, calls]) => ({ type, calls })),
      audioFailureTypes: Object.entries(audioTypes).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ samples, ...d }) => ({
        ...d, samples: samples.length, p50Ms: percentile(samples, 50), p95Ms: percentile(samples, 95),
      })),
      breakdown: {
        byLanguage: groupBy(r => r.language),
        byProvider: groupBy(r => r.provider),
        byAgent: groupBy(r => r.agentId, k => agentNames.get(k) || (k === 'unknown' ? 'Legacy campaigns' : k)),
      },
      facets: {
        agents: agents.map(a => ({ id: String(a._id), name: a.name })),
        campaigns: campaigns.map(c => ({ id: String(c._id), name: c.name, agentId: c.agentId ? String(c.agentId) : null })),
        languages: [...new Set(rows.map(r => r.language))].sort(),
        providers: [...new Set(rows.map(r => r.provider).filter(Boolean))].sort(),
      },
      truncated,
    };
  }

  /** Calls with at least one quality flag (optionally one reason), newest first. */
  async flagged(actor, { reason, page = 1, limit = 25, ...filters } = {}) {
    const threshold = filters.latencyThresholdMs || DEFAULT_LATENCY_THRESHOLD_MS();
    const { rows, truncated } = await this._context(actor, filters);
    const flagged = rows.map(r => ({ r, flags: this._flags(r, threshold) }))
      .filter(x => x.flags.length && (!reason || x.flags.includes(reason)));
    const pageRows = flagged.slice((page - 1) * limit, page * limit);
    const leads = await Lead.find({ _id: { $in: pageRows.map(x => x.r.leadId) } }).select('_id name').lean();
    const leadNames = new Map(leads.map(l => [String(l._id), l.name]));
    return {
      calls: pageRows.map(({ r, flags }) => {
        const intel = extractionErrorOf(r.intelligence);
        return {
          id: String(r._id), internalCallId: r.internalCallId, at: r.initiatedAt || r.createdAt,
          leadId: String(r.leadId), leadName: leadNames.get(String(r.leadId)) || 'Deleted lead',
          campaignId: String(r.campaignId), campaignName: r.campaignName, agentId: r.agentId, agentName: r.agentName,
          provider: r.provider, language: r.language, languageSource: r.languageSource,
          durationSeconds: r.durationSeconds || 0, disposition: r.disposition || null, flags,
          telemetry: Boolean(r.quality),
          latency: r.quality ? { p50Ms: r.quality.latency?.p50Ms ?? null, p95Ms: r.quality.latency?.p95Ms ?? null, maxMs: r.quality.latency?.maxMs ?? null, samples: r.quality.latency?.samples || 0 } : null,
          audioFailures: audioFailuresOf(r.quality).map(f => f.type).concat(r.pairedAudioLost ? ['paired_audio_lost'] : []),
          transcript: r.quality ? { ...r.quality.transcript, persistedTurns: r.persistedTurns } : { persistedTurns: r.persistedTurns },
          extraction: intel,
          experiment: r.experimentId ? { id: String(r.experimentId), arm: r.arm } : null,
        };
      }),
      pagination: { page, limit, total: flagged.length, pages: Math.ceil(flagged.length / limit) },
      latencyThresholdMs: threshold,
      truncated,
    };
  }
}

export default new CallQualityService();
