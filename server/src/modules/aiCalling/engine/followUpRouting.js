/**
 * Follow-up routing rules — pure, deterministic, unit-tested.
 *
 * Decides WHICH agent takes the next conversation from facts about the lead and the call,
 * not just the call outcome. Rules are evaluated in order; the first enabled rule whose
 * every non-empty condition matches wins. Precedence in the decision engine:
 *   routing rule  >  per-outcome route (followUp.routes)  >  the agent that made the call.
 *
 * Conditions (all optional; an empty list means "any"):
 *   outcomes       follow-up outcome codes, plus 'QUALIFIED' for a hand-over after success
 *   leadSources    Lead.source (extension, google_places, manual, widget, import, incoming_call)
 *   leadStatuses   Lead.status
 *   leadTypes      Lead.type
 *   languages      conversation language of the call (BCP-47 prefix match: 'ar' matches 'ar-MA')
 *   countries      Lead.address.country (ISO-3166 alpha-2, case-insensitive)
 *   cities         Lead.address.city (case-insensitive, accent-insensitive equality)
 *   businessTypes  Lead.sourceMetadata.businessType (case-insensitive substring)
 */

export const ROUTING_CONDITION_KEYS = Object.freeze(['outcomes', 'leadSources', 'leadStatuses', 'leadTypes', 'languages', 'countries', 'cities', 'businessTypes']);
export const MAX_ROUTING_RULES = 25;

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const nonEmpty = (list) => Array.isArray(list) && list.some((x) => String(x ?? '').trim());

function matchesList(key, list, value) {
  if (!nonEmpty(list)) return true;
  if (value == null || value === '') return false;
  const v = fold(value);
  const wanted = list.map(fold).filter(Boolean);
  switch (key) {
    case 'languages': return wanted.some((w) => v === w || v.startsWith(`${w}-`) || w.startsWith(`${v}-`));
    case 'businessTypes': return wanted.some((w) => v.includes(w));
    default: return wanted.includes(v);
  }
}

/** Facts a rule can test, from the lead (lean) and the finished call. */
export function routingContext({ outcome, lead = {}, call = null } = {}) {
  return {
    outcomes: outcome || null,
    leadSources: lead.source || null,
    leadStatuses: lead.status || null,
    leadTypes: lead.type || null,
    languages: call?.conversationLanguage?.current || call?.conversationState?.language?.current || null,
    countries: lead.address?.country || null,
    cities: lead.address?.city || null,
    businessTypes: lead.sourceMetadata?.businessType || null,
  };
}

/** First matching enabled rule, or null. */
export function matchRoutingRule(rules = [], context = {}) {
  for (const rule of (Array.isArray(rules) ? rules : []).slice(0, MAX_ROUTING_RULES)) {
    if (!rule || rule.enabled === false || !rule.agentId) continue;
    const when = rule.when || {};
    // A hand-over after success is opt-in: a rule without 'QUALIFIED' never moves a qualified lead.
    if (context.outcomes === 'QUALIFIED' && !(when.outcomes || []).includes('QUALIFIED')) continue;
    if (ROUTING_CONDITION_KEYS.every((key) => matchesList(key, when[key], context[key]))) return rule;
  }
  return null;
}

/**
 * Per-outcome routes with the matching rule applied for this call. `QUALIFIED` is the hand-over
 * key the decision engine uses for a successful call (classification COMPLETED).
 */
export function effectiveRoutes({ config = {}, classification, lead = {}, call = null } = {}) {
  const key = classification === 'COMPLETED' ? 'QUALIFIED' : classification;
  const rule = matchRoutingRule(config.routingRules, routingContext({ outcome: key, lead, call }));
  if (!rule) return { routes: config.routes || {}, rule: null };
  return { routes: { ...(config.routes || {}), [key]: String(rule.agentId) }, rule };
}
