import mongoose from 'mongoose';
import { computeAttribution } from './attribution.engine.js';
import { getGovernanceSettings } from '../../shared/security/governanceSettings.js';
import { buildLeadAccessFilter } from '../governance/leadAccess.js';
import { pricedCost } from '../aiCalling/callAnalytics.service.js';
import logger from '../../shared/logger/index.js';

/**
 * Campaign performance / conversion attribution — assembles RECORDED touches,
 * outcomes and revenue, then hands them to the pure engine.
 *
 * Touch sources (period = touch time within [from, to]):
 *   ai_call          CallRecord (tests excluded). Cost = recorded/priced token usage
 *                    + configured minute rates (callAnalytics.pricedCost). A call
 *                    that never connected (no answer, 0 s, no usage) is a recorded 0.
 *   sim_call         SimCallTask attempts that dialled. Own SIM plan: not recorded.
 *   sim_sms          SimSmsMessage outbound + sent. SIM_SMS_COST_PER_MESSAGE if set.
 *   email/sms/whatsapp  provider MessageRecipient with sentAt; actualCost only
 *                    (estimatedCost is an estimate and is never used).
 *   mobile_call/mobile_sms  manual device communications (no campaign).
 *   discovery        (optional) lead creation by source; cost not recorded.
 *
 * Outcomes: qualified = status qualified|converted; converted = convertedCustomerId.
 * Revenue: net (subtotal, excl. VAT) of the converted customer's issued invoices
 * (STANDARD + FINAL, minus CREDIT_NOTE; drafts/cancelled/written-off and ADVANCE
 * invoices excluded — FINAL invoices carry the full amount). Converted leads with
 * no such invoice have revenue "not recorded".
 * Currency: everything is reported in `currency`; other currencies are converted
 * only with a RECORDED exchange rate (accounting exchange rates), else excluded.
 */
const MAX_PER_SOURCE = 50000;
const TEST_PROVIDERS = new Set(['livekit_web', 'web_link_preview']);
const REVENUE_STATUSES = ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
const SIM_SMS_SENT = ['sent'];
const PROVIDER_SENT = ['accepted', 'sent', 'delivered', 'read', 'undelivered', 'unknown'];

const s = (v) => (v === null || v === undefined ? null : String(v));
const userName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null : null);

async function model(path) {
  return (await import(path)).default;
}

async function namesById(Model, ids, field = 'name') {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const rows = await Model.find({ _id: { $in: unique } }).select(`_id ${field}`).lean();
  return new Map(rows.map((r) => [String(r._id), r[field]]));
}

async function userNames(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const User = await model('../auth/user.model.js');
  const rows = await User.find({ _id: { $in: unique } }).select('_id firstName lastName email')
    .setOptions({ includeDeleted: true }).lean();
  return new Map(rows.map((u) => [String(u._id), userName(u)]));
}

class AttributionService {
  async _aiCallTouches(range, truncated) {
    const CallRecord = await model('../aiCalling/callRecord.model.js');
    const calls = await CallRecord.find({
      isTest: { $ne: true },
      provider: { $nin: [...TEST_PROVIDERS] },
      $or: [{ initiatedAt: range }, { initiatedAt: null, dispatchStartedAt: range }],
    }).select('leadId campaignId createdBy cost durationSeconds provider answeredAt initiatedAt dispatchStartedAt isTest')
      .limit(MAX_PER_SOURCE + 1).lean();
    if (calls.length > MAX_PER_SOURCE) { truncated.push('ai_call'); calls.length = MAX_PER_SOURCE; }

    const CallCampaign = await model('../aiCalling/callCampaign.model.js');
    const campaigns = await CallCampaign.find({ _id: { $in: [...new Set(calls.map((c) => String(c.campaignId)))] } })
      .select('_id name agentId').lean();
    const campaignById = new Map(campaigns.map((c) => [String(c._id), c]));
    const CallingAgent = await model('../aiCalling/callingAgent.model.js');
    const agentNames = await namesById(CallingAgent, campaigns.map((c) => c.agentId));

    return calls.map((call) => {
      const priced = pricedCost(call);
      const neverConnected = !call.answeredAt && !(call.durationSeconds > 0);
      const recorded = priced.source !== 'none' || neverConnected;
      const campaign = campaignById.get(String(call.campaignId));
      const agentId = s(campaign?.agentId);
      return {
        leadId: String(call.leadId),
        at: new Date(call.initiatedAt || call.dispatchStartedAt),
        channel: 'ai_call',
        campaignKey: `ai_call:${call.campaignId}`,
        campaignName: campaign?.name || null,
        agentKey: agentId ? `ai_agent:${agentId}` : `user:${call.createdBy}`,
        agentName: agentId ? agentNames.get(agentId) || null : null,
        agentUserId: agentId ? null : s(call.createdBy),
        cost: recorded ? { amount: Number(priced.amount) || 0, currency: (priced.currency || 'USD').toUpperCase() } : null,
      };
    });
  }

  async _simCallTouches(range, truncated) {
    const SimCallTask = await model('../simCall/simCallTask.model.js');
    const tasks = await SimCallTask.find({ 'attempts.dialedAt': range })
      .select('leadId campaignId createdBy attempts.dialedAt').limit(MAX_PER_SOURCE + 1).lean();
    if (tasks.length > MAX_PER_SOURCE) { truncated.push('sim_call'); tasks.length = MAX_PER_SOURCE; }
    const SimCallCampaign = await model('../simCall/simCallCampaign.model.js');
    const names = await namesById(SimCallCampaign, tasks.map((t) => t.campaignId));
    const touches = [];
    for (const task of tasks) {
      for (const attempt of task.attempts || []) {
        if (!attempt.dialedAt || attempt.dialedAt < range.$gte || attempt.dialedAt > range.$lte) continue;
        touches.push({
          leadId: String(task.leadId),
          at: new Date(attempt.dialedAt),
          channel: 'sim_call',
          campaignKey: `sim_call:${task.campaignId}`,
          campaignName: names.get(String(task.campaignId)) || null,
          agentKey: `user:${task.createdBy}`,
          agentUserId: s(task.createdBy),
          cost: null, // the user's own SIM plan — no recorded per-call cost
        });
      }
    }
    return touches;
  }

  async _simSmsTouches(range, truncated, settings) {
    const SimSmsMessage = await model('../simSms/simSmsMessage.model.js');
    const messages = await SimSmsMessage.find({ direction: 'outbound', status: { $in: SIM_SMS_SENT }, sentAt: range })
      .select('leadId campaignId createdBy sentAt').limit(MAX_PER_SOURCE + 1).lean();
    if (messages.length > MAX_PER_SOURCE) { truncated.push('sim_sms'); messages.length = MAX_PER_SOURCE; }
    const SimSmsCampaign = await model('../simSms/simSmsCampaign.model.js');
    const names = await namesById(SimSmsCampaign, messages.map((m) => m.campaignId));
    const cost = settings.simSmsCostPerMessage !== null
      ? { amount: settings.simSmsCostPerMessage, currency: settings.simSmsCostCurrency } : null;
    return messages.map((m) => ({
      leadId: String(m.leadId),
      at: new Date(m.sentAt),
      channel: 'sim_sms',
      campaignKey: `sim_sms:${m.campaignId}`,
      campaignName: names.get(String(m.campaignId)) || null,
      agentKey: `user:${m.createdBy}`,
      agentUserId: s(m.createdBy),
      cost,
    }));
  }

  async _providerTouches(range, truncated) {
    const MessageRecipient = await model('../messaging/messageRecipient.model.js');
    const rows = await MessageRecipient.find({ sentAt: range, status: { $in: PROVIDER_SENT } })
      .select('leadId campaignId createdBy channel sentAt actualCost').limit(MAX_PER_SOURCE + 1).lean();
    if (rows.length > MAX_PER_SOURCE) { truncated.push('provider_message'); rows.length = MAX_PER_SOURCE; }
    const MessageCampaign = await model('../messaging/campaign.model.js');
    const names = await namesById(MessageCampaign, rows.map((r) => r.campaignId));
    return rows.map((r) => {
      const amount = r.actualCost?.amount;
      const recorded = typeof amount === 'number' && Number.isFinite(amount) && r.actualCost?.currency;
      return {
        leadId: String(r.leadId),
        at: new Date(r.sentAt),
        channel: r.channel,
        campaignKey: `message:${r.campaignId}`,
        campaignName: names.get(String(r.campaignId)) || null,
        agentKey: `user:${r.createdBy}`,
        agentUserId: s(r.createdBy),
        cost: recorded ? { amount, currency: String(r.actualCost.currency).toUpperCase() } : null,
      };
    });
  }

  async _manualTouches(range, truncated, settings) {
    const LeadCommunication = await model('../crm/leadCommunication.model.js');
    const rows = await LeadCommunication.find({ createdAt: range, direction: 'outbound' })
      .select('leadId createdBy channel createdAt').limit(MAX_PER_SOURCE + 1).lean();
    if (rows.length > MAX_PER_SOURCE) { truncated.push('mobile'); rows.length = MAX_PER_SOURCE; }
    return rows.map((r) => ({
      leadId: String(r.leadId),
      at: new Date(r.createdAt),
      channel: r.channel === 'sms' ? 'mobile_sms' : 'mobile_call',
      campaignKey: 'manual',
      campaignName: null,
      agentKey: `user:${r.createdBy}`,
      agentUserId: s(r.createdBy),
      cost: r.channel === 'sms' && settings.simSmsCostPerMessage !== null
        ? { amount: settings.simSmsCostPerMessage, currency: settings.simSmsCostCurrency } : null,
    }));
  }

  async _discoveryTouches(range, accessFilter, truncated) {
    const Lead = await model('../crm/lead.model.js');
    const leads = await Lead.find({ createdAt: range, ...accessFilter })
      .select('_id source createdBy createdAt').setOptions({ includeDeleted: true })
      .limit(MAX_PER_SOURCE + 1).lean();
    if (leads.length > MAX_PER_SOURCE) { truncated.push('discovery'); leads.length = MAX_PER_SOURCE; }
    return leads.map((l) => ({
      leadId: String(l._id),
      at: new Date(l.createdAt),
      channel: 'discovery',
      campaignKey: `source:${l.source || 'unknown'}`,
      campaignName: null,
      agentKey: `user:${l.createdBy}`,
      agentUserId: s(l.createdBy),
      cost: null, // discovery/provider API spend is not recorded per lead
    }));
  }

  async _revenueFor(customerIds) {
    const ids = [...new Set(customerIds.filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const Invoice = await model('../qop/invoice.model.js');
    const rows = await Invoice.aggregate([
      {
        $match: {
          isDeleted: false,
          customerId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
          status: { $in: REVENUE_STATUSES },
          invoiceType: { $in: ['STANDARD', 'FINAL', 'CREDIT_NOTE'] },
        },
      },
      {
        $group: {
          _id: { customerId: '$customerId', currency: { $ifNull: ['$currency', 'CHF'] } },
          amount: {
            $sum: { $cond: [{ $eq: ['$invoiceType', 'CREDIT_NOTE'] }, { $multiply: [{ $abs: '$subtotal' }, -1] }, '$subtotal'] },
          },
          invoices: { $sum: 1 },
        },
      },
    ]);
    const byCustomer = new Map();
    for (const row of rows) {
      const key = String(row._id.customerId);
      if (!byCustomer.has(key)) byCustomer.set(key, {});
      byCustomer.get(key)[String(row._id.currency).toUpperCase()] = row.amount;
    }
    return byCustomer;
  }

  async _rates(currencies, target, asOfDate) {
    const rates = new Map();
    const others = [...new Set(currencies)].filter((c) => c && c !== target);
    if (!others.length) return { rates, sources: [] };
    const exchangeRateService = await model('../accounting/exchangeRate.service.js');
    const sources = [];
    for (const from of others) {
      try {
        const resolved = await exchangeRateService.resolveRate({ baseCurrency: from, quoteCurrency: target, asOfDate });
        rates.set(`${from}>${target}`, Number(resolved.effectiveRate));
        sources.push({ from, to: target, rate: Number(resolved.effectiveRate), rateDate: resolved.rateDate, direction: resolved.direction });
      } catch {
        sources.push({ from, to: target, rate: null, missing: true });
      }
    }
    return { rates, sources };
  }

  /**
   * GET /analytics/attribution
   * @param {object} q  { from, to, groupBy, model, currency, channels?, includeDiscovery }
   */
  async attribution(user, q) {
    const settings = getGovernanceSettings();
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86400000);
    const range = { $gte: from, $lte: to };
    const accessFilter = await buildLeadAccessFilter(user);
    const truncated = [];

    const sources = await Promise.all([
      this._aiCallTouches(range, truncated),
      this._simCallTouches(range, truncated),
      this._simSmsTouches(range, truncated, settings),
      this._providerTouches(range, truncated),
      this._manualTouches(range, truncated, settings),
      q.includeDiscovery ? this._discoveryTouches(range, accessFilter, truncated) : [],
    ]);
    let touches = sources.flat().filter((t) => mongoose.isValidObjectId(t.leadId) && !Number.isNaN(t.at.getTime()));
    if (q.channels?.length) touches = touches.filter((t) => q.channels.includes(t.channel));

    // Outcomes for touched leads — within the caller's lead scope (team mode).
    const Lead = await model('../crm/lead.model.js');
    const leadIds = [...new Set(touches.map((t) => t.leadId))];
    const leadDocs = leadIds.length
      ? await Lead.find({ _id: { $in: leadIds }, ...accessFilter })
        .select('_id status convertedCustomerId convertedAt').setOptions({ includeDeleted: true }).lean()
      : [];
    const leads = new Map(leadDocs.map((l) => [String(l._id), {
      qualified: ['qualified', 'converted'].includes(l.status) || Boolean(l.convertedCustomerId),
      converted: Boolean(l.convertedCustomerId),
      convertedAt: l.convertedAt || null,
      customerId: s(l.convertedCustomerId),
    }]));
    const outOfScope = touches.filter((t) => !leads.has(t.leadId)).length;
    touches = touches.filter((t) => leads.has(t.leadId));

    const revenueByCustomer = await this._revenueFor([...leads.values()].map((l) => l.customerId));
    const revenue = new Map();
    for (const [leadId, l] of leads) {
      if (l.converted && l.customerId && revenueByCustomer.has(l.customerId)) revenue.set(leadId, revenueByCustomer.get(l.customerId));
    }

    const currency = (q.currency || 'CHF').toUpperCase();
    const currencies = [
      ...touches.filter((t) => t.cost).map((t) => t.cost.currency),
      ...[...revenue.values()].flatMap((bag) => Object.keys(bag)),
    ];
    const { rates, sources: rateSources } = await this._rates(currencies, currency, to);

    // Human-readable agent names for user-run touches.
    const names = await userNames(touches.map((t) => t.agentUserId));
    for (const t of touches) if (t.agentUserId && !t.agentName) t.agentName = names.get(t.agentUserId) || null;

    const result = computeAttribution({
      touches, leads, revenue, rates, groupBy: q.groupBy, model: q.model, currency,
    });

    logger.info('Attribution computed', {
      module: 'analytics', action: 'attribution', touches: touches.length, leads: leads.size, groupBy: q.groupBy, model: q.model,
    });

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      groupBy: q.groupBy,
      model: q.model,
      currency,
      ...result,
      excluded: {
        ...result.excluded,
        touchesOutsideLeadScope: outOfScope,
        truncatedSources: truncated,
      },
      exchangeRates: rateSources,
      assumptions: {
        leadAccessMode: settings.leadAccessMode,
        simSmsCostRecorded: settings.simSmsCostPerMessage !== null,
        revenueBasis: 'invoice_subtotal_excl_vat',
      },
    };
  }

  /** CSV of the grouped rows (same numbers as the page). */
  toCsv(report) {
    const header = ['group', 'label', 'touches', 'leads_touched', 'qualified_credit', 'converted_credit',
      `spend_${report.currency}`, `revenue_${report.currency}`, `profit_${report.currency}`, 'roi',
      `cost_per_qualified_${report.currency}`, `cost_per_conversion_${report.currency}`,
      'touches_cost_not_recorded', 'conversions_revenue_not_recorded', 'currencies_without_rate'];
    const cell = (v) => {
      if (v === null || v === undefined) return 'n/a';
      const text = String(v);
      // CSV-injection guard: a leading formula character is neutralised.
      const safe = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
      return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [header.join(',')];
    for (const r of [...report.rows, { ...report.totals, key: 'TOTAL' }]) {
      lines.push([r.key, r.label || '', r.touches, r.leadsTouched, r.qualifiedCredit, r.convertedCredit, r.spend, r.revenue,
        r.profit, r.roi, r.costPerQualifiedLead, r.costPerConversion, r.excluded.touchesCostNotRecorded,
        r.excluded.conversionsRevenueNotRecorded, r.excluded.currenciesWithoutRate.join(' ')].map(cell).join(','));
    }
    return `\uFEFF${lines.join('\n')}\n`;
  }
}

const attributionService = new AttributionService();
export default attributionService;
