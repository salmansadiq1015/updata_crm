/**
 * Cost analytics for incoming calls — the same pricing engine and the same response shape as the
 * outbound agent "Call analytics" (aiCalling/callAnalytics.service.js), so both screens price a
 * token identically and render with one component.
 *
 * Pricing: the voice worker reports token usage per call; `pricedCost` turns it into dollars with
 * the list rates in shared/voiceCost.js (or AI_CALLING_MODEL_PRICING overrides). Paired-phone
 * calls have no carrier leg (the owner's SIM plan), so only model + configured platform minutes
 * count. Browser tests are spend too, but they are totalled separately, never mixed into averages.
 * Nothing is invented: a call without usage stays unpriced and is counted as such.
 */

import mongoose from 'mongoose';

import InboundCall from './inboundCall.model.js';
import CallingAgent from '../aiCalling/callingAgent.model.js';
import Lead from '../crm/lead.model.js';
import { pricedCost } from '../aiCalling/callAnalytics.service.js';
import { computeCallCost } from '../aiCalling/engine/callCost.js';
import { costDiagnostics } from '../aiCalling/engine/costDiagnostics.js';
import { providerComparison } from '../aiCalling/engine/providerComparison.js';
import { toCsv } from '../../shared/utils/csv.js';

const MAX_CALLS = 5000;
const CALL_LIST_LIMIT = 300;
const REACHED = new Set(['handled_by_ai', 'handled_by_human', 'transferred', 'interrupted']);
const round = (v, d = 6) => Number((v || 0).toFixed(d));
const TOKEN_KEYS = ['inputAudio', 'inputCachedAudio', 'inputText', 'inputCachedText', 'outputAudio', 'outputText', 'input', 'output', 'total'];
const emptyTokens = () => Object.fromEntries(TOKEN_KEYS.map((k) => [k, 0]));
const addTokens = (into, t) => { for (const k of TOKEN_KEYS) into[k] += t?.[k] || 0; return into; };
const PROVIDER = 'paired_phone';

/** Price a call from the worker's reported usage (stored at /end; also used to backfill). */
export function priceInboundCall({ usage = null, durationSeconds = 0, isTest = false, reported = null } = {}) {
  if (!usage) return { amount: Number(reported?.amount) > 0 ? Number(reported.amount) : 0, currency: reported?.currency || 'USD', breakdown: reported?.breakdown || null };
  const priced = computeCallCost({ usage, durationSeconds, provider: isTest ? 'livekit_web' : PROVIDER, fallbackModel: null, isTest });
  return { amount: priced.amount, currency: 'USD', breakdown: { ...(reported?.breakdown || {}), usage, ...priced.breakdown } };
}

const qualificationLabel = (r) => (r === 'QUALIFIED' ? 'qualified' : r === 'NOT_QUALIFIED' ? 'unqualified' : r ? 'review' : null);

class InboundCostService {
  async _calls(viewer, { from, to, agentId } = {}) {
    const match = viewer.seeAll ? {} : { createdBy: new mongoose.Types.ObjectId(String(viewer.id)) };
    if (agentId) match['handling.agentId'] = new mongoose.Types.ObjectId(String(agentId));
    if (from || to) match.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lt: new Date(to) } : {}) };
    const turns = (role) => ({ $size: { $filter: { input: { $ifNull: ['$transcript', []] }, as: 't', cond: { $eq: ['$$t.role', role] } } } });
    const calls = await InboundCall.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: MAX_CALLS },
      { $project: {
        internalCallId: 1, isTest: 1, status: 1, outcome: 1, answeredBy: 1, leadId: 1, leadCreated: 1, caller: 1, match: 1,
        'handling.agentId': 1, 'handling.agentName': 1, deviceName: 1, simSlot: 1, simLabel: 1,
        qualification: 1, intents: 1, summary: 1, createdAt: 1, answeredAt: 1, endedAt: 1, durationSeconds: 1, cost: 1,
        aiVoice: 1, quality: 1, error: 1, callback: 1, handoff: 1,
        callerTurns: turns('caller'), agentTurns: turns('assistant'),
        interruptions: { $size: { $filter: { input: { $ifNull: ['$events', []] }, as: 'e', cond: { $eq: ['$$e.type', 'interruption'] } } } },
        fieldsCount: { $size: { $filter: { input: { $ifNull: ['$fields', []] }, as: 'f', cond: { $and: [{ $eq: ['$$f.supersededAt', null] }, { $eq: ['$$f.explicit', true] }] } } } },
        questionsCount: { $size: { $ifNull: ['$questions', []] } },
      } },
    ]);
    const leads = await Lead.find({ _id: { $in: [...new Set(calls.map((c) => String(c.leadId)).filter((x) => mongoose.isValidObjectId(x)))] } })
      .select('_id name leadNumber phone mobile status').lean();
    const agent = agentId ? await CallingAgent.findById(agentId).select('_id name').lean() : null;
    return { agent, leads: new Map(leads.map((l) => [String(l._id), l])), calls, truncated: calls.length >= MAX_CALLS };
  }

  _row(call, ctx) {
    const lead = call.leadId ? ctx.leads.get(String(call.leadId)) : null;
    // The caller is the "lead" of an incoming call; without a lead, the number identifies them.
    const callerKey = call.leadId ? String(call.leadId) : `caller:${call.caller?.e164 || call.internalCallId}`;
    const cost = pricedCost({ cost: call.cost, durationSeconds: call.durationSeconds, provider: call.isTest ? 'livekit_web' : PROVIDER, isTest: call.isTest });
    const tone = call.summary?.tone || null;
    return {
      id: String(call._id), internalCallId: call.internalCallId, attemptNumber: 1,
      leadId: callerKey, leadName: lead?.name || call.caller?.name || call.caller?.e164 || 'Private number', leadPhone: call.caller?.e164 || lead?.mobile || lead?.phone || null,
      leadCreated: Boolean(call.leadCreated), matchStatus: call.match?.status || null,
      campaignId: call.handling?.agentId ? String(call.handling.agentId) : '', campaignName: call.handling?.agentName || '',
      agentId: call.handling?.agentId ? String(call.handling.agentId) : null, agentName: call.handling?.agentName || null,
      device: call.deviceName || null, sim: call.simLabel || (call.simSlot != null ? `SIM ${call.simSlot + 1}` : null),
      isTest: Boolean(call.isTest), provider: call.isTest ? 'livekit_web' : PROVIDER,
      at: call.createdAt, answeredAt: call.answeredAt || null, endedAt: call.endedAt || null,
      durationSeconds: call.durationSeconds || 0, state: call.status, disposition: call.outcome || null, outcome: call.outcome || null,
      answeredBy: call.answeredBy || null, qualification: qualificationLabel(call.qualification?.result), qualificationResult: call.qualification?.result || null,
      inquiry: call.intents?.primary || null, reviewRequired: call.match?.status === 'ambiguous',
      failure: call.error?.code ? { code: call.error.code, message: call.error.message || '' } : null,
      summary: call.summary?.text || '', description: call.summary?.reason || '', blockers: call.summary?.objections || [],
      notesSource: call.summary?.generatedBy === 'ai_agent' ? 'ai_agent' : call.summary?.generatedBy ? 'call_results' : null,
      behavior: {
        outcome: call.outcome || 'unknown', tone, toneEvidence: call.summary?.toneEvidence || null,
        participation: { leadTurns: call.callerTurns || 0, agentTurns: call.agentTurns || 0, interruptions: call.interruptions || 0 },
        answers: { valid: call.fieldsCount || 0, total: call.fieldsCount || 0 },
        questions: call.questionsCount || 0, callbackRequested: Boolean(call.callback?.requested), humanRequested: Boolean(call.handoff?.requested),
      },
      aiVoice: call.aiVoice || call.cost?.breakdown?.aiVoice || null,
      quality: call.quality || null,
      cost,
      costDiagnostics: costDiagnostics(cost, call.cost?.breakdown?.usage, call.durationSeconds || 0),
    };
  }

  async analytics(viewer, filters = {}) {
    const ctx = await this._calls(viewer, filters);
    const rows = ctx.calls.map((c) => this._row(c, ctx));
    const live = rows.filter((r) => !r.isTest);
    const tests = rows.filter((r) => r.isTest);
    const aiRows = live.filter((r) => r.answeredBy === 'ai');
    const sumCost = (list) => list.reduce((s, r) => s + (r.cost.currency === 'USD' ? r.cost.amount : 0), 0);
    const tokens = addTokens(emptyTokens(), {});
    const components = { model: 0, telephony: 0, platform: 0, other: 0 };
    const modelDetail = { audioIn: 0, audioOut: 0, textIn: 0, textOut: 0 };
    for (const r of live) {
      addTokens(tokens, r.cost.tokens);
      if (r.cost.currency !== 'USD') continue;
      for (const k of Object.keys(components)) components[k] += r.cost.components?.[k] || 0;
      for (const k of Object.keys(modelDetail)) modelDetail[k] += r.cost.components?.modelDetail?.[k] || 0;
    }
    const connected = live.filter((r) => REACHED.has(r.outcome));
    const qualified = new Set(live.filter((r) => r.qualificationResult === 'QUALIFIED').map((r) => r.leadId)).size;
    const leadsCreated = live.filter((r) => r.leadCreated).length;
    const totalCost = sumCost(live);
    const aiSeconds = aiRows.reduce((s, r) => s + r.durationSeconds, 0);
    const totalSeconds = live.reduce((s, r) => s + r.durationSeconds, 0);
    const uniqueCallers = new Set(live.map((r) => r.leadId)).size;
    const withUsage = live.filter((r) => r.cost.tokens).length;
    const per = (num, den) => (den ? round(num / den) : null);

    const byDay = new Map();
    for (const r of live) {
      const day = new Date(r.at).toISOString().slice(0, 10);
      const d = byDay.get(day) || { date: day, calls: 0, connected: 0, cost: 0, seconds: 0, tokens: 0 };
      d.calls += 1; d.connected += REACHED.has(r.outcome) ? 1 : 0; d.cost += r.cost.currency === 'USD' ? r.cost.amount : 0; d.seconds += r.durationSeconds; d.tokens += r.cost.tokens?.total || 0;
      byDay.set(day, d);
    }
    const tone = { positive: 0, neutral: 0, hesitant: 0, negative: 0, unrecorded: 0 };
    for (const r of aiRows) tone[r.behavior.tone || 'unrecorded'] += 1;
    const outcomes = {};
    for (const r of live) outcomes[r.behavior.outcome] = (outcomes[r.behavior.outcome] || 0) + 1;

    const callerMap = new Map();
    for (const r of live) {
      const l = callerMap.get(r.leadId) || {
        leadId: r.leadId.startsWith('caller:') ? null : r.leadId, callerKey: r.leadId, name: r.leadName, phone: r.leadPhone,
        status: r.leadId.startsWith('caller:') ? null : ctx.leads.get(r.leadId)?.status || null,
        calls: 0, connected: 0, seconds: 0, cost: 0, tokens: 0, last: null, pricingIncomplete: false,
      };
      l.calls += 1; l.connected += REACHED.has(r.outcome) ? 1 : 0; l.seconds += r.durationSeconds;
      l.cost += r.cost.currency === 'USD' ? r.cost.amount : 0; l.tokens += r.cost.tokens?.total || 0;
      l.pricingIncomplete ||= r.cost.unpriced || r.cost.currency !== 'USD' || (r.cost.source === 'none' && r.answeredBy === 'ai' && r.durationSeconds > 0);
      if (!l.last) l.last = r;
      callerMap.set(r.leadId, l);
    }
    const leads = [...callerMap.values()].map(({ last, ...l }) => ({
      ...l, cost: round(l.cost), avgCostPerCall: per(l.cost, l.calls),
      lastCallAt: last.at, lastCallId: last.id, lastDisposition: last.outcome, lastQualification: last.qualification,
      lastTone: last.behavior.tone, lastSummary: last.summary,
    })).sort((a, b) => b.cost - a.cost || new Date(b.lastCallAt) - new Date(a.lastCallAt));

    const byAgent = new Map();
    for (const r of aiRows) {
      const k = r.agentId || 'none';
      const a = byAgent.get(k) || { agentId: r.agentId, name: r.agentName || '—', calls: 0, seconds: 0, cost: 0, tokens: 0 };
      a.calls += 1; a.seconds += r.durationSeconds; a.cost += r.cost.currency === 'USD' ? r.cost.amount : 0; a.tokens += r.cost.tokens?.total || 0;
      byAgent.set(k, a);
    }

    return {
      scope: 'inbound',
      agent: ctx.agent ? { id: String(ctx.agent._id), name: ctx.agent.name } : null,
      currency: 'USD',
      providerComparison: providerComparison(rows),
      totals: {
        calls: live.length, connected: connected.length, completed: live.filter((r) => r.state === 'COMPLETED').length,
        answeredByAi: aiRows.length, missed: live.filter((r) => r.outcome === 'missed').length,
        qualified, leads: uniqueCallers, leadsCreated, totalCost: round(totalCost), totalSeconds, aiSeconds,
        avgCostPerCall: per(totalCost, live.length), avgCostPerConnectedCall: per(sumCost(connected), connected.length),
        avgCostPerAiCall: per(sumCost(aiRows), aiRows.length),
        avgCostPerLead: per(totalCost, uniqueCallers), costPerQualifiedLead: per(totalCost, qualified), costPerNewLead: per(totalCost, leadsCreated),
        costPerMinute: per(totalCost, aiSeconds / 60),
        avgDurationSeconds: connected.length ? Math.round(connected.reduce((s, r) => s + r.durationSeconds, 0) / connected.length) : 0,
        connectRate: live.length ? round(connected.length / live.length, 3) : null,
        tokens, avgTokensPerCall: withUsage ? Math.round(tokens.total / withUsage) : null,
        components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, round(v)])),
        modelDetail: Object.fromEntries(Object.entries(modelDetail).map(([k, v]) => [k, round(v)])),
        callsWithUsage: withUsage, callsWithoutCost: aiRows.filter((r) => r.cost.unpriced && r.durationSeconds > 0).length,
      },
      testing: { calls: tests.length, totalCost: round(sumCost(tests)), seconds: tests.reduce((s, r) => s + r.durationSeconds, 0), tokens: tests.reduce((s, r) => s + (r.cost.tokens?.total || 0), 0) },
      pricing: {
        telephonyRatePerMinute: 0, // the owner's own SIM plan: not billed through Updata
        platformRatePerMinute: Number(process.env.AI_CALLING_PLATFORM_COST_PER_MINUTE || 0),
        model: [...new Set(rows.map((r) => r.cost.model).filter(Boolean))].join(', ') || null,
      },
      billing: {
        status: 'not_reconciled', timezone: 'UTC', currency: 'USD', from: filters.from || null, to: filters.to || null,
        modelEstimate: round(components.model), additionalEstimate: round(components.telephony + components.platform),
        unpricedCalls: aiRows.filter((r) => r.cost.unpriced).length,
        foreignCurrencyCalls: live.filter((r) => r.cost.currency !== 'USD').length,
        excludes: ['input_transcription', 'post_call_analysis', 'sim_airtime', 'other_agents_and_api_requests'],
      },
      tone, outcomes,
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, cost: round(d.cost) })),
      byAgent: [...byAgent.values()].map((a) => ({ ...a, cost: round(a.cost), avgCostPerCall: per(a.cost, a.calls) })).sort((a, b) => b.cost - a.cost),
      leads,
      calls: rows.slice(0, CALL_LIST_LIMIT),
      truncated: ctx.truncated || rows.length > CALL_LIST_LIMIT,
    };
  }

  async csv(viewer, filters = {}) {
    const ctx = await this._calls(viewer, filters);
    const headers = ['callId', 'startedAt', 'caller', 'phone', 'agent', 'device', 'sim', 'test', 'durationSeconds', 'outcome', 'answeredBy', 'qualification', 'inquiry',
      'tone', 'callerTurns', 'agentTurns', 'interruptions', 'fieldsCollected', 'questions', 'totalCost', 'modelCost', 'platformCost',
      'currency', 'costSource', 'model', 'inputAudioTokens', 'inputTextTokens', 'cachedInputTokens', 'outputAudioTokens', 'outputTextTokens',
      'totalTokens', 'costEstimated', 'pricingComplete', 'invoiceVerified', 'pricingVersion', 'summary', 'aiProvider', 'aiModel'];
    const rows = ctx.calls.map((c) => this._row(c, ctx)).map((r) => ({
      callId: r.internalCallId, startedAt: r.at, caller: r.leadName, phone: r.leadPhone || '', agent: r.agentName || '', device: r.device || '', sim: r.sim || '',
      test: r.isTest ? 'yes' : 'no', durationSeconds: r.durationSeconds, outcome: r.outcome || '', answeredBy: r.answeredBy || '',
      qualification: r.qualificationResult || '', inquiry: r.inquiry || '', tone: r.behavior.tone || '',
      callerTurns: r.behavior.participation.leadTurns, agentTurns: r.behavior.participation.agentTurns, interruptions: r.behavior.participation.interruptions,
      fieldsCollected: r.behavior.answers.valid, questions: r.behavior.questions,
      totalCost: r.cost.amount, modelCost: r.cost.components?.model ?? '', platformCost: r.cost.components?.platform ?? '',
      currency: r.cost.currency, costSource: r.cost.source, model: r.cost.model || '',
      inputAudioTokens: r.cost.tokens?.inputAudio ?? '', inputTextTokens: r.cost.tokens?.inputText ?? '',
      cachedInputTokens: r.cost.tokens ? r.cost.tokens.inputCachedAudio + r.cost.tokens.inputCachedText : '',
      outputAudioTokens: r.cost.tokens?.outputAudio ?? '', outputTextTokens: r.cost.tokens?.outputText ?? '',
      totalTokens: r.cost.tokens?.total ?? '', costEstimated: r.cost.estimate, pricingComplete: !r.cost.unpriced && r.cost.source !== 'none',
      invoiceVerified: false, pricingVersion: r.cost.pricingVersion || '', summary: r.summary, aiProvider: r.aiVoice?.provider || '', aiModel: r.aiVoice?.model || '',
    }));
    return String.fromCharCode(0xFEFF) + toCsv(headers, rows);
  }
}

export default new InboundCostService();
