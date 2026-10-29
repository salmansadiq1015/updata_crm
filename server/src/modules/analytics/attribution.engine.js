/**
 * Conversion attribution engine — pure functions, no I/O.
 *
 * Inputs (assembled by attribution.service.js from recorded data only):
 *   touches: [{ leadId, at: Date, channel, campaignKey, campaignName, agentKey, agentName,
 *               cost: { amount, currency } | null }]      null cost = NOT recorded
 *   leads:   Map<leadId, { qualified: bool, converted: bool, convertedAt: Date|null }>
 *   revenue: Map<leadId, { [currency]: amount }>          absent = NOT recorded
 *   rates:   Map<'FROM>TO', number>                       recorded exchange rates
 *
 * Credit models (per lead, over the touches that happened before conversion):
 *   first  — 1.0 to the first touch's group
 *   last   — 1.0 to the last touch's group
 *   linear — 1/n to the group of each of the n touches
 *
 * Spend is NOT attributed: a group's spend is the recorded cost of its own touches
 * in the period. Touches without a recorded cost are excluded from spend and
 * counted (`touchesCostNotRecorded`); converted leads without recorded revenue are
 * excluded from revenue and counted (`conversionsRevenueNotRecorded`). Nothing is
 * estimated: a figure that cannot be computed from records is `null`.
 */
export const ATTRIBUTION_MODELS = Object.freeze(['first', 'last', 'linear']);
export const GROUP_BY = Object.freeze(['campaign', 'channel', 'agent']);

const round = (v, d = 4) => (v === null || v === undefined ? null : Number(Number(v).toFixed(d)));
const addTo = (bag, currency, amount) => { bag[currency] = (bag[currency] || 0) + amount; };

function groupKeyOf(touch, groupBy) {
  if (groupBy === 'channel') return { key: touch.channel, label: touch.channel };
  if (groupBy === 'agent') return { key: touch.agentKey || 'unassigned', label: touch.agentName || null };
  return { key: touch.campaignKey || 'none', label: touch.campaignName || null };
}

/** Credit shares for one lead's ordered touches → Map<groupKey, share>. */
export function creditShares(orderedTouches, model, groupBy) {
  const shares = new Map();
  if (!orderedTouches.length) return shares;
  const add = (touch, share) => {
    const { key } = groupKeyOf(touch, groupBy);
    shares.set(key, (shares.get(key) || 0) + share);
  };
  if (model === 'first') add(orderedTouches[0], 1);
  else if (model === 'last') add(orderedTouches[orderedTouches.length - 1], 1);
  else for (const t of orderedTouches) add(t, 1 / orderedTouches.length);
  return shares;
}

/**
 * Convert a { currency: amount } bag into `target` with recorded rates.
 * Returns { amount, missing: [currencies without a rate] }.
 */
export function convertBag(bag, target, rates = new Map()) {
  let amount = 0;
  const missing = [];
  for (const [currency, value] of Object.entries(bag || {})) {
    if (!value) continue;
    if (currency === target) { amount += value; continue; }
    const rate = rates.get(`${currency}>${target}`);
    if (typeof rate === 'number' && Number.isFinite(rate)) amount += value * rate;
    else missing.push(currency);
  }
  return { amount, missing };
}

function newGroup(key, label) {
  return {
    key,
    label,
    touches: 0,
    leads: new Set(),
    spendByCurrency: {},
    touchesCostNotRecorded: 0,
    qualifiedCredit: 0,
    convertedCredit: 0,
    revenueByCurrency: {},
    conversionsRevenueNotRecorded: 0,
    qualifiedLeads: new Set(),
    convertedLeads: new Set(),
  };
}

function finalize(group, currency, rates) {
  const spend = convertBag(group.spendByCurrency, currency, rates);
  const revenue = convertBag(group.revenueByCurrency, currency, rates);
  const spendKnown = spend.missing.length === 0;
  const revenueKnown = revenue.missing.length === 0;
  const revenueRecorded = Object.keys(group.revenueByCurrency).length > 0;
  const spendValue = spendKnown ? spend.amount : null;
  const revenueValue = revenueKnown ? (revenueRecorded ? revenue.amount : (group.convertedCredit > 0 ? null : 0)) : null;
  // Profit needs both sides from records: no conversions = recorded revenue of 0.
  const profit = spendValue !== null && revenueValue !== null ? revenueValue - spendValue : null;
  return {
    key: group.key,
    label: group.label,
    touches: group.touches,
    leadsTouched: group.leads.size,
    qualifiedLeads: group.qualifiedLeads.size,
    convertedLeads: group.convertedLeads.size,
    qualifiedCredit: round(group.qualifiedCredit),
    convertedCredit: round(group.convertedCredit),
    spend: round(spendValue, 2),
    spendByCurrency: Object.fromEntries(Object.entries(group.spendByCurrency).map(([c, v]) => [c, round(v, 4)])),
    revenue: round(revenueValue, 2),
    revenueByCurrency: Object.fromEntries(Object.entries(group.revenueByCurrency).map(([c, v]) => [c, round(v, 2)])),
    costPerQualifiedLead: spendValue !== null && group.qualifiedCredit > 0 ? round(spendValue / group.qualifiedCredit, 2) : null,
    costPerConversion: spendValue !== null && group.convertedCredit > 0 ? round(spendValue / group.convertedCredit, 2) : null,
    profit: round(profit, 2),
    roi: profit !== null && spendValue > 0 ? round(profit / spendValue, 4) : null,
    excluded: {
      touchesCostNotRecorded: group.touchesCostNotRecorded,
      conversionsRevenueNotRecorded: group.conversionsRevenueNotRecorded,
      currenciesWithoutRate: [...new Set([...spend.missing, ...revenue.missing])],
    },
  };
}

/**
 * Compute grouped attribution. Returns { rows, totals, timeline, excluded }.
 */
export function computeAttribution({
  touches = [], leads = new Map(), revenue = new Map(), rates = new Map(),
  groupBy = 'campaign', model = 'linear', currency = 'CHF',
} = {}) {
  const groups = new Map();
  const total = newGroup('total', null);
  const timeline = new Map();
  const byLead = new Map();
  let touchesAfterConversion = 0;

  for (const touch of touches) {
    const { key, label } = groupKeyOf(touch, groupBy);
    if (!groups.has(key)) groups.set(key, newGroup(key, label));
    const g = groups.get(key);
    if (!g.label && label) g.label = label;
    for (const bucket of [g, total]) {
      bucket.touches += 1;
      bucket.leads.add(touch.leadId);
      if (touch.cost) addTo(bucket.spendByCurrency, touch.cost.currency, touch.cost.amount);
      else bucket.touchesCostNotRecorded += 1;
    }
    const day = touch.at.toISOString().slice(0, 10);
    if (!timeline.has(day)) timeline.set(day, { date: day, touches: 0, spendByCurrency: {}, touchesCostNotRecorded: 0 });
    const t = timeline.get(day);
    t.touches += 1;
    if (touch.cost) addTo(t.spendByCurrency, touch.cost.currency, touch.cost.amount);
    else t.touchesCostNotRecorded += 1;
    if (!byLead.has(touch.leadId)) byLead.set(touch.leadId, []);
    byLead.get(touch.leadId).push(touch);
  }

  for (const [leadId, leadTouches] of byLead) {
    const outcome = leads.get(leadId);
    if (!outcome || (!outcome.qualified && !outcome.converted)) continue;
    const ordered = [...leadTouches].sort((a, b) => a.at - b.at);
    const cutoff = outcome.converted && outcome.convertedAt ? new Date(outcome.convertedAt) : null;
    const eligible = cutoff ? ordered.filter((t) => t.at <= cutoff) : ordered;
    if (!eligible.length) { touchesAfterConversion += 1; continue; }
    const shares = creditShares(eligible, model, groupBy);
    const leadRevenue = outcome.converted ? revenue.get(leadId) : null;
    for (const [key, share] of shares) {
      const g = groups.get(key);
      g.qualifiedCredit += share;
      g.qualifiedLeads.add(leadId);
      if (!outcome.converted) continue;
      g.convertedCredit += share;
      g.convertedLeads.add(leadId);
      if (leadRevenue) {
        for (const [cur, amount] of Object.entries(leadRevenue)) addTo(g.revenueByCurrency, cur, amount * share);
      } else {
        g.conversionsRevenueNotRecorded += 1;
      }
    }
    total.qualifiedLeads.add(leadId);
    if (outcome.converted) {
      total.convertedLeads.add(leadId);
      if (leadRevenue) {
        for (const [cur, amount] of Object.entries(leadRevenue)) addTo(total.revenueByCurrency, cur, amount);
      } else {
        total.conversionsRevenueNotRecorded += 1;
      }
    }
  }

  total.qualifiedCredit = total.qualifiedLeads.size;
  total.convertedCredit = total.convertedLeads.size;

  const rows = [...groups.values()].map((g) => finalize(g, currency, rates))
    .sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1) || b.leadsTouched - a.leadsTouched);

  return {
    rows,
    totals: finalize(total, currency, rates),
    timeline: [...timeline.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
      const spend = convertBag(d.spendByCurrency, currency, rates);
      return {
        date: d.date,
        touches: d.touches,
        spend: spend.missing.length ? null : round(spend.amount, 2),
        touchesCostNotRecorded: d.touchesCostNotRecorded,
      };
    }),
    excluded: { leadsTouchedOnlyAfterConversion: touchesAfterConversion },
  };
}

export default { computeAttribution, creditShares, convertBag, ATTRIBUTION_MODELS, GROUP_BY };
