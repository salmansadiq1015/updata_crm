import mongoose from 'mongoose';
import CallingAgent from './callingAgent.model.js';
import CallCampaign from './callCampaign.model.js';
import CallRecord from './callRecord.model.js';
import Lead from '../crm/lead.model.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { toCsv } from '../../shared/utils/csv.js';
import { computeCallCost, COST_PRICING_VERSION, needsPricing } from './engine/callCost.js';
import { providerComparison } from './engine/providerComparison.js';
import { costDiagnostics, withModelPricing } from './engine/costDiagnostics.js';

/**
 * Cost and outcome analytics for one calling agent: every call its campaigns
 * placed, what each call cost (tokens → dollars), how long it ran, what the lead
 * said and how they came across, rolled up per lead and per day. Browser/test
 * calls are spend too, so they are totalled separately, never mixed into the
 * per-call averages.
 */

const TEST_PROVIDERS = new Set(['livekit_web', 'web_link_preview']);
const REACHED = new Set(['unresponsive', 'answered_completed', 'answered_partial', 'interrupted', 'declined', 'callback_requested', 'do_not_contact']);
const MAX_CALLS = 5000;
const CALL_LIST_LIMIT = 300;
const round = (v, d = 6) => Number((v || 0).toFixed(d));
const TOKEN_KEYS = ['inputAudio', 'inputCachedAudio', 'inputText', 'inputCachedText', 'outputAudio', 'outputText', 'input', 'output', 'total'];
const emptyTokens = () => Object.fromEntries(TOKEN_KEYS.map(k => [k, 0]));
const addTokens = (into, t) => { for (const k of TOKEN_KEYS) into[k] += t?.[k] || 0; return into; };

/** Stored cost, or — for calls saved before pricing existed — the same pricing applied now. */
export function pricedCost(call, env = process.env) {
  const cost = call.cost || {};
  const breakdown = cost.breakdown || null;
  if (breakdown?.source !== 'provider_reported' && ((needsPricing(breakdown) && !(Number(cost.amount) > 0))
    || (breakdown?.usage && breakdown?.estimate && ((breakdown.pricingVersion || 0) < COST_PRICING_VERSION || breakdown.unpriced)))) {
    // Preserve complete historic rate cards, without discarding newly configured
    // prices for models whose cost was previously unavailable.
    let overrides = {};
    try { const parsed = JSON.parse(env.AI_CALLING_MODEL_PRICING || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) overrides = parsed; } catch { /* use known rates */ }
    const completeRates = rates => rates && ['audioIn', 'audioCachedIn', 'audioOut', 'textIn', 'textCachedIn', 'textOut'].every(k => rates[k] != null && Number.isFinite(Number(rates[k])) && Number(rates[k]) >= 0);
    if (breakdown.model && completeRates(breakdown.rates)) overrides[breakdown.model] = breakdown.rates;
    for (const m of breakdown.models || []) if (m.model && !m.unpriced && completeRates(m.rates)) overrides[m.model] = m.rates;
    const historical = withModelPricing(env, overrides);
    const priced = computeCallCost({
      usage: breakdown.usage, durationSeconds: call.durationSeconds || 0, provider: call.provider,
      // A missing historical model is unknown; today's server default is not evidence.
      fallbackModel: null, isTest: call.isTest,
    }, historical);
    return { amount: priced.amount, currency: 'USD', ...priced.breakdown };
  }
  const components = breakdown?.components || { model: 0, telephony: 0, platform: 0 };
  const source = breakdown?.source || (breakdown?.estimate ? 'per_minute_estimate' : Number(cost.amount) > 0 ? 'provider_reported' : 'none');
  // A blended per-minute estimate or a provider total has no split: report it as one line.
  const unsplit = !breakdown?.components && Number(cost.amount) > 0;
  return {
    amount: Number.isFinite(Number(cost.amount)) && Number(cost.amount) >= 0 ? Number(cost.amount) : 0, currency: String(cost.currency || 'USD').toUpperCase(),
    source,
    estimate: Boolean(breakdown?.estimate), model: breakdown?.model || null, pricedAs: breakdown?.pricedAs || null,
    unpriced: Boolean(breakdown?.unpriced || (source === 'none' && call.durationSeconds > 0)), tokens: breakdown?.tokens || null, rates: breakdown?.rates || null,
    models: breakdown?.models || [], invoiceVerified: false, pricingVersion: breakdown?.pricingVersion || null,
    components: unsplit ? { model: 0, telephony: 0, platform: 0, other: Number(cost.amount) } : components,
    billedMinutes: breakdown?.billedMinutes ?? null,
  };
}

/** Evidence-based outcome profile; tone comes only from the agent's finish_call notes. */
export function behaviorProfile(call) {
  const d = call.disposition;
  const outcome = !REACHED.has(d) ? 'not_reached'
    : d === 'answered_completed' ? 'engaged'
      : ['answered_partial', 'interrupted'].includes(d) ? 'partially_engaged'
        : d === 'unresponsive' ? 'unresponsive'
        : d === 'callback_requested' ? 'callback_requested'
          : d === 'declined' ? 'declined' : 'opted_out';
  return {
    outcome,
    tone: call.callNotes?.behavior?.tone || null,
    toneEvidence: call.callNotes?.behavior?.evidence || null,
    participation: { leadTurns: call.leadTurns || 0, agentTurns: call.agentTurns || 0, interruptions: call.interruptions || 0 },
    answers: { valid: call.answersValid || 0, total: call.answersTotal || 0 },
  };
}

class CallAnalyticsService {
  async _calls(agentId, actor, { from, to } = {}) {
    const agent = await CallingAgent.findOne({ _id: agentId, createdBy: actor }).select('_id name').lean();
    if (!agent) throw new NotFoundError('CallingAgent', agentId);
    const campaigns = await CallCampaign.find({ agentId: agent._id, createdBy: actor }).select('_id name').lean();
    const match = { createdBy: new mongoose.Types.ObjectId(String(actor)), campaignId: { $in: campaigns.map(c => c._id) } };
    if (from || to) match.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lt: new Date(to) } : {}) };
    const turns = role => ({ $size: { $filter: { input: { $ifNull: ['$transcript', []] }, as: 't', cond: { $eq: ['$$t.role', role] } } } });
    const calls = campaigns.length ? await CallRecord.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: MAX_CALLS },
      { $project: {
        campaignId: 1, leadId: 1, internalCallId: 1, attemptNumber: 1, isTest: 1, provider: 1, state: 1, disposition: 1,
        qualification: 1, createdAt: 1, initiatedAt: 1, answeredAt: 1, endedAt: 1, durationSeconds: 1, cost: 1,
        callNotes: 1, reviewRequired: 1, failureCode: 1, failureMessage: 1, aiVoice: 1, quality: 1,
        leadTurns: turns('customer'), agentTurns: turns('assistant'),
        interruptions: { $size: { $filter: { input: { $ifNull: ['$transcript', []] }, as: 't', cond: { $and: [{ $eq: ['$$t.role', 'assistant'] }, '$$t.interrupted'] } } } },
        answersTotal: { $size: { $ifNull: ['$answers', []] } },
        answersValid: { $size: { $filter: { input: { $ifNull: ['$answers', []] }, as: 'a', cond: { $eq: ['$$a.validation', 'valid'] } } } },
      } },
    ]) : [];
    const leads = await Lead.find({ _id: { $in: [...new Set(calls.filter(c => c.leadId).map(c => String(c.leadId)))] } })
      .select('_id name leadNumber phone mobile status').lean();
    return { agent, campaigns: new Map(campaigns.map(c => [String(c._id), c.name])), leads: new Map(leads.map(l => [String(l._id), l])), calls, truncated: calls.length >= MAX_CALLS };
  }

  _row(call, ctx) {
    const lead = ctx.leads.get(String(call.leadId));
    const cost = pricedCost(call);
    return {
      id: String(call._id), internalCallId: call.internalCallId, attemptNumber: call.attemptNumber,
      leadId: call.leadId ? String(call.leadId) : null, leadName: lead?.name || (call.leadId ? 'Deleted lead' : 'Test contact'), leadPhone: lead?.mobile || lead?.phone || null,
      campaignId: String(call.campaignId), campaignName: ctx.campaigns.get(String(call.campaignId)) || '',
      isTest: Boolean(call.isTest || TEST_PROVIDERS.has(call.provider)), provider: call.provider || null,
      at: call.initiatedAt || call.createdAt, answeredAt: call.answeredAt || null, endedAt: call.endedAt || null,
      durationSeconds: call.durationSeconds || 0, state: call.state, disposition: call.disposition || null,
      qualification: call.qualification || null, reviewRequired: Boolean(call.reviewRequired),
      failure: call.failureCode ? { code: call.failureCode, message: call.failureMessage || '' } : null,
      summary: call.callNotes?.summary || '', description: call.callNotes?.description || '', blockers: call.callNotes?.blockers || [],
      notesSource: call.callNotes?.source || null,
      behavior: behaviorProfile(call),
      aiVoice: call.aiVoice || call.cost?.breakdown?.aiVoice || null,
      quality: call.quality || null,
      cost,
      costDiagnostics: costDiagnostics(cost, call.cost?.breakdown?.usage, call.durationSeconds || 0),
    };
  }

  async agentCallAnalytics(agentId, actor, filters = {}) {
    const ctx = await this._calls(agentId, actor, filters);
    const rows = ctx.calls.map(c => this._row(c, ctx));
    const live = rows.filter(r => !r.isTest);
    const tests = rows.filter(r => r.isTest);

    const sumCost = list => list.reduce((s, r) => s + (r.cost.currency === 'USD' ? r.cost.amount : 0), 0);
    const tokens = addTokens(emptyTokens(), {});
    const components = { model: 0, telephony: 0, platform: 0, other: 0 };
    const modelDetail = { audioIn: 0, audioOut: 0, textIn: 0, textOut: 0 };
    for (const r of live) {
      addTokens(tokens, r.cost.tokens);
      if (r.cost.currency !== 'USD') continue;
      for (const k of Object.keys(components)) components[k] += r.cost.components?.[k] || 0;
      for (const k of Object.keys(modelDetail)) modelDetail[k] += r.cost.components?.modelDetail?.[k] || 0;
    }
    const connected = live.filter(r => REACHED.has(r.disposition));
    const qualified = new Set(live.filter(r => r.qualification === 'qualified').map(r => r.leadId)).size;
    const totalCost = sumCost(live);
    const totalSeconds = live.reduce((s, r) => s + r.durationSeconds, 0);
    const uniqueLeads = new Set(live.map(r => r.leadId)).size;
    const withUsage = live.filter(r => r.cost.tokens).length;
    const per = (num, den) => (den ? round(num / den) : null);

    const byDay = new Map();
    for (const r of live) {
      const day = new Date(r.at).toISOString().slice(0, 10);
      const d = byDay.get(day) || { date: day, calls: 0, connected: 0, cost: 0, seconds: 0, tokens: 0 };
      d.calls += 1; d.connected += REACHED.has(r.disposition) ? 1 : 0; d.cost += r.cost.currency === 'USD' ? r.cost.amount : 0; d.seconds += r.durationSeconds; d.tokens += r.cost.tokens?.total || 0;
      byDay.set(day, d);
    }
    const tone = { positive: 0, neutral: 0, hesitant: 0, negative: 0, unrecorded: 0 };
    for (const r of connected) tone[r.behavior.tone || 'unrecorded'] += 1;
    const outcomes = {};
    for (const r of live) outcomes[r.behavior.outcome] = (outcomes[r.behavior.outcome] || 0) + 1;

    const leadMap = new Map();
    for (const r of live) {
      const l = leadMap.get(r.leadId) || {
        leadId: r.leadId, name: r.leadName, phone: r.leadPhone, status: ctx.leads.get(r.leadId)?.status || null,
        calls: 0, connected: 0, seconds: 0, cost: 0, tokens: 0, last: null, pricingIncomplete: false,
      };
      l.calls += 1; l.connected += REACHED.has(r.disposition) ? 1 : 0; l.seconds += r.durationSeconds;
      l.cost += r.cost.currency === 'USD' ? r.cost.amount : 0; l.tokens += r.cost.tokens?.total || 0;
      l.pricingIncomplete ||= r.cost.unpriced || r.cost.currency !== 'USD' || (r.cost.source === 'none' && r.durationSeconds > 0);
      if (!l.last) l.last = r; // rows are newest first
      leadMap.set(r.leadId, l);
    }
    const leads = [...leadMap.values()].map(({ last, ...l }) => ({
      ...l, cost: round(l.cost), avgCostPerCall: per(l.cost, l.calls),
      lastCallAt: last.at, lastCallId: last.id, lastDisposition: last.disposition, lastQualification: last.qualification,
      lastTone: last.behavior.tone, lastSummary: last.summary,
    })).sort((a, b) => b.cost - a.cost || new Date(b.lastCallAt) - new Date(a.lastCallAt));

    return {
      agent: { id: String(ctx.agent._id), name: ctx.agent.name },
      currency: 'USD',
      providerComparison: providerComparison(rows),
      totals: {
        calls: live.length, connected: connected.length, completed: live.filter(r => r.disposition === 'answered_completed').length,
        qualified, leads: uniqueLeads, totalCost: round(totalCost), totalSeconds,
        avgCostPerCall: per(totalCost, live.length), avgCostPerConnectedCall: per(sumCost(connected), connected.length),
        avgCostPerLead: per(totalCost, uniqueLeads), costPerQualifiedLead: per(totalCost, qualified),
        costPerMinute: per(totalCost, totalSeconds / 60),
        avgDurationSeconds: connected.length ? Math.round(connected.reduce((s, r) => s + r.durationSeconds, 0) / connected.length) : 0,
        connectRate: live.length ? round(connected.length / live.length, 3) : null,
        tokens, avgTokensPerCall: withUsage ? Math.round(tokens.total / withUsage) : null,
        components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, round(v)])),
        modelDetail: Object.fromEntries(Object.entries(modelDetail).map(([k, v]) => [k, round(v)])),
        callsWithUsage: withUsage, callsWithoutCost: live.filter(r => r.cost.unpriced && r.durationSeconds > 0).length,
      },
      testing: { calls: tests.length, totalCost: round(sumCost(tests)), seconds: tests.reduce((s, r) => s + r.durationSeconds, 0), tokens: tests.reduce((s, r) => s + (r.cost.tokens?.total || 0), 0) },
      pricing: {
        telephonyRatePerMinute: Number(process.env.AI_CALLING_TELEPHONY_COST_PER_MINUTE || 0),
        platformRatePerMinute: Number(process.env.AI_CALLING_PLATFORM_COST_PER_MINUTE || 0),
        model: [...new Set(rows.map(r => r.cost.model).filter(Boolean))].join(', ') || null,
      },
      billing: {
        status: 'not_reconciled', timezone: 'UTC', currency: 'USD', from: filters.from || null, to: filters.to || null,
        modelEstimate: round(components.model), additionalEstimate: round(components.telephony + components.platform),
        unpricedCalls: live.filter(r => r.cost.unpriced).length,
        foreignCurrencyCalls: live.filter(r => r.cost.currency !== 'USD').length,
        // ASR/post-call extraction are separate services; never claim a complete OpenAI bill.
        excludes: ['input_transcription', 'post_call_analysis', 'other_agents_and_api_requests'],
      },
      tone, outcomes,
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ...d, cost: round(d.cost) })),
      leads,
      calls: rows.slice(0, CALL_LIST_LIMIT),
      truncated: ctx.truncated || rows.length > CALL_LIST_LIMIT,
    };
  }

  async agentCallAnalyticsCsv(agentId, actor, filters = {}) {
    const ctx = await this._calls(agentId, actor, filters);
    const headers = ['callId', 'startedAt', 'lead', 'phone', 'campaign', 'test', 'attempt', 'durationSeconds', 'disposition', 'qualification',
      'tone', 'toneEvidence', 'leadTurns', 'agentTurns', 'validAnswers', 'totalCost', 'modelCost', 'telephonyCost', 'platformCost',
      'currency', 'costSource', 'model', 'inputAudioTokens', 'inputTextTokens', 'cachedInputTokens', 'outputAudioTokens', 'outputTextTokens',
      'totalTokens', 'costEstimated', 'pricingComplete', 'invoiceVerified', 'pricingVersion', 'summary', 'blockers', 'aiProvider', 'aiModel', 'aiFallback', 'aiProviderErrors'];
    const rows = ctx.calls.map(c => this._row(c, ctx)).map(r => ({
      callId: r.internalCallId, startedAt: r.at, lead: r.leadName, phone: r.leadPhone || '', campaign: r.campaignName, test: r.isTest ? 'yes' : 'no',
      attempt: r.attemptNumber, durationSeconds: r.durationSeconds, disposition: r.disposition || '', qualification: r.qualification || '',
      tone: r.behavior.tone || '', toneEvidence: r.behavior.toneEvidence || '', leadTurns: r.behavior.participation.leadTurns,
      agentTurns: r.behavior.participation.agentTurns, validAnswers: r.behavior.answers.valid,
      totalCost: r.cost.amount, modelCost: r.cost.components?.model ?? '', telephonyCost: r.cost.components?.telephony ?? '',
      platformCost: r.cost.components?.platform ?? '', currency: r.cost.currency, costSource: r.cost.source, model: r.cost.model || '',
      inputAudioTokens: r.cost.tokens?.inputAudio ?? '', inputTextTokens: r.cost.tokens?.inputText ?? '',
      cachedInputTokens: r.cost.tokens ? r.cost.tokens.inputCachedAudio + r.cost.tokens.inputCachedText : '',
      outputAudioTokens: r.cost.tokens?.outputAudio ?? '', outputTextTokens: r.cost.tokens?.outputText ?? '',
      totalTokens: r.cost.tokens?.total ?? '', costEstimated: r.cost.estimate, pricingComplete: !r.cost.unpriced && r.cost.source !== 'none',
      invoiceVerified: false, pricingVersion: r.cost.pricingVersion || '', summary: r.summary, blockers: r.blockers.join(' | '),
      aiProvider: r.aiVoice?.provider || '', aiModel: r.aiVoice?.model || '', aiFallback: r.aiVoice ? Boolean(r.aiVoice.fallback) : '',
      aiProviderErrors: (r.aiVoice?.attempts || []).filter(a => a.status !== 'established').map(a => `${a.provider}:${a.reason || a.status}`).join(' | '),
    }));
    return String.fromCharCode(0xFEFF) + toCsv(headers, rows);
  }
}

export default new CallAnalyticsService();
