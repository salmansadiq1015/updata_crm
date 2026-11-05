/**
 * Explainable lead scoring — a PURE, deterministic function of recorded data.
 *
 *   scoreLead(lead, signals, config, { now }) → {
 *     score 0–100, band hot|warm|cold|unscored, version, engineVersion,
 *     disqualified, factors[{ key, label, group, points, maxPoints, evidence }],
 *     missing[{ key, label, group, reason }]
 *   }
 *
 * Inputs are ONLY what the CRM recorded: the provider snapshot on the lead
 * (rating, review count, business status), contact fields present, business
 * type / city against configured target lists, confirmed qualification answers
 * (with their source and evidence), and engagement records gathered by
 * leadScoring.signals.js (connected calls, SMS replies, outcomes, contact
 * recency, do-not-contact). No ML, no estimates: a signal that was never
 * recorded scores 0 and is listed in `missing` — it is never guessed.
 *
 * Same (lead, signals, config, now) ⇒ byte-identical output. Factor order is
 * fixed by FACTOR_DEFINITIONS; nothing reads the clock except through `now`.
 */

export const ENGINE_VERSION = 'lead-score/1';
export const SCORE_BANDS = Object.freeze(['hot', 'warm', 'cold', 'unscored']);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every factor the engine knows, in output order. `maxPoints` are the defaults. */
export const FACTOR_DEFINITIONS = Object.freeze([
  // Business information (provider snapshot + recorded contact data)
  { key: 'provider_rating', group: 'business', label: 'Provider rating', maxPoints: 10 },
  { key: 'review_volume', group: 'business', label: 'Review volume', maxPoints: 5 },
  { key: 'business_status', group: 'business', label: 'Business operational', maxPoints: 5 },
  { key: 'has_phone', group: 'business', label: 'Phone on record', maxPoints: 4 },
  { key: 'has_email', group: 'business', label: 'Email on record', maxPoints: 3 },
  { key: 'has_website', group: 'business', label: 'Website on record', maxPoints: 3 },
  { key: 'business_type_match', group: 'business', label: 'Target business type', maxPoints: 5 },
  { key: 'target_location', group: 'business', label: 'Target city', maxPoints: 5 },
  // Qualification answers (lead.qualification.fields)
  { key: 'q_need', group: 'qualification', label: 'Need stated', maxPoints: 6 },
  { key: 'q_budget', group: 'qualification', label: 'Budget stated', maxPoints: 6 },
  { key: 'q_decision_authority', group: 'qualification', label: 'Decision authority', maxPoints: 7 },
  { key: 'q_timeline', group: 'qualification', label: 'Timeline', maxPoints: 7 },
  { key: 'q_interest', group: 'qualification', label: 'Interest level', maxPoints: 9 },
  { key: 'q_objections', group: 'qualification', label: 'Objections raised', maxPoints: 0, penalty: 3 },
  // Engagement (communications, AI calls, SIM SMS)
  { key: 'connected_calls', group: 'engagement', label: 'Connected calls', maxPoints: 10 },
  { key: 'sms_replies', group: 'engagement', label: 'SMS replies', maxPoints: 6 },
  { key: 'positive_outcome', group: 'engagement', label: 'Positive outcome', maxPoints: 4 },
  { key: 'contact_recency', group: 'engagement', label: 'Last contact recency', maxPoints: 5 },
].map((f) => Object.freeze(f)));

export const FACTOR_KEYS = Object.freeze(FACTOR_DEFINITIONS.map((f) => f.key));
const FACTOR_BY_KEY = new Map(FACTOR_DEFINITIONS.map((f) => [f.key, f]));

/** Default rule tables. Multipliers are fractions of the factor's maxPoints. */
export const DEFAULT_RULES = Object.freeze({
  ratingTiers: [{ min: 4.5, multiplier: 1 }, { min: 4, multiplier: 0.7 }, { min: 3.5, multiplier: 0.4 }],
  reviewTiers: [{ min: 100, multiplier: 1 }, { min: 20, multiplier: 0.6 }, { min: 5, multiplier: 0.3 }],
  connectedCallTiers: [{ min: 2, multiplier: 1 }, { min: 1, multiplier: 0.6 }],
  smsReplyTiers: [{ min: 2, multiplier: 1 }, { min: 1, multiplier: 0.7 }],
  // Days since the last recorded contact → multiplier (first match wins).
  recencyTiers: [{ maxDays: 7, multiplier: 1 }, { maxDays: 30, multiplier: 0.6 }, { maxDays: 90, multiplier: 0.3 }],
  decisionAuthority: { decision_maker: 1, influencer: 0.5, no_authority: 0 },
  timeline: { immediate: 1, within_3_months: 0.75, within_6_months: 0.4, later: 0.1 },
  interest: { high: 1, medium: 0.6, low: 0.2, none: 0 },
});

export const DEFAULT_SCORING_CONFIG = Object.freeze({
  version: 1,
  bands: { hot: 70, warm: 40 },
  // A lead with fewer evidenced factors than this is "unscored", not "cold":
  // too little is recorded to rank it honestly.
  minEvidence: 3,
  targetBusinessTypes: [],
  targetCities: [],
  factors: Object.fromEntries(FACTOR_DEFINITIONS.map((f) => [
    f.key, { enabled: true, maxPoints: f.key === 'q_objections' ? f.penalty : f.maxPoints },
  ])),
  rules: DEFAULT_RULES,
});

// Provider status strings seen across Google Places / OSM / the extension.
const OPERATIONAL = new Set(['operational', 'open', 'open now', 'opened', 'business_status_operational']);
const CLOSED = new Set([
  'closed_permanently', 'closed permanently', 'permanently closed', 'closed_temporarily',
  'closed temporarily', 'temporarily closed',
]);
const NO_OBJECTION = /^(none|no|nein|keine|aucune?|non|n\/a|-|—)$/i;
const CONNECTED_CALL_DISPOSITIONS = new Set(['answered_completed', 'answered_partial', 'interrupted', 'callback_requested', 'declined', 'do_not_contact']);
const POSITIVE_COMM_DISPOSITIONS = new Set(['interested', 'callback_requested']);
// Communication dispositions that describe the lead's answer (transport-only
// results such as sent / no_answer / voicemail say nothing about intent).
const BUSINESS_COMM_DISPOSITIONS = new Set(['interested', 'not_interested', 'callback_requested', 'human_follow_up', 'wrong_number', 'do_not_contact']);
const POSITIVE_CALL_QUALIFICATIONS = new Set(['qualified', 'callback']);

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;
const iso = (d) => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const str = (v) => (v == null ? '' : String(v).trim());
const fold = (v) => str(v).toLocaleLowerCase('en').normalize('NFD').replace(/[̀-ͯ]/g, '');

function tierMultiplier(value, tiers = []) {
  for (const tier of tiers) if (value >= tier.min) return tier.multiplier;
  return 0;
}

/**
 * Merge a stored (partial) config onto the defaults so an older stored config
 * keeps working when the engine gains a factor. Never mutates its input.
 */
export function normalizeScoringConfig(config = {}) {
  const src = isPlainObject(config) ? config : {};
  const factors = {};
  for (const def of FACTOR_DEFINITIONS) {
    const base = DEFAULT_SCORING_CONFIG.factors[def.key];
    const given = isPlainObject(src.factors?.[def.key]) ? src.factors[def.key] : {};
    factors[def.key] = {
      enabled: typeof given.enabled === 'boolean' ? given.enabled : base.enabled,
      maxPoints: Number.isFinite(given.maxPoints) && given.maxPoints >= 0 ? given.maxPoints : base.maxPoints,
    };
  }
  const rules = { ...DEFAULT_RULES };
  if (isPlainObject(src.rules)) {
    for (const key of Object.keys(DEFAULT_RULES)) {
      if (src.rules[key] != null) rules[key] = src.rules[key];
    }
  }
  const hot = Number.isFinite(src.bands?.hot) ? src.bands.hot : DEFAULT_SCORING_CONFIG.bands.hot;
  const warm = Number.isFinite(src.bands?.warm) ? src.bands.warm : DEFAULT_SCORING_CONFIG.bands.warm;
  return {
    version: Number.isInteger(src.version) ? src.version : DEFAULT_SCORING_CONFIG.version,
    bands: { hot, warm: Math.min(warm, hot) },
    minEvidence: Number.isInteger(src.minEvidence) && src.minEvidence >= 0 ? src.minEvidence : DEFAULT_SCORING_CONFIG.minEvidence,
    targetBusinessTypes: (Array.isArray(src.targetBusinessTypes) ? src.targetBusinessTypes : []).map(str).filter(Boolean),
    targetCities: (Array.isArray(src.targetCities) ? src.targetCities : []).map(str).filter(Boolean),
    factors,
    rules,
  };
}

/** Band for a score under a config. */
export function bandFor(score, config, { evidenced = Infinity } = {}) {
  if (evidenced < config.minEvidence) return 'unscored';
  if (score >= config.bands.hot) return 'hot';
  if (score >= config.bands.warm) return 'warm';
  return 'cold';
}

function leadRef(lead) {
  return { type: 'lead', id: lead?._id ? String(lead._id) : (lead?.id ? String(lead.id) : null) };
}

function providerSource(lead) {
  return lead?.source === 'google_places' ? 'provider' : (lead?.source || 'lead');
}

function providerAt(lead) {
  return iso(lead?.sourceMetadata?.discoveredAt) ?? iso(lead?.createdAt);
}

function qualificationField(lead, key) {
  const fields = Array.isArray(lead?.qualification?.fields) ? lead.qualification.fields : [];
  return fields.find((f) => f?.fieldKey === key) || null;
}

/** Evidence ref for a qualification answer: the record it rests on, when stored. */
function answerRef(field) {
  if (field?.callRecordId) return { type: 'call_record', id: String(field.callRecordId) };
  if (field?.smsMessageId) return { type: 'sim_sms_message', id: String(field.smsMessageId) };
  if (field?.communicationId) return { type: 'lead_communication', id: String(field.communicationId) };
  return null;
}

function answerEvidence(field) {
  return {
    field: `qualification.fields.${field.fieldKey}`,
    value: field.status === 'answered' ? (field.value ?? null) : field.status,
    source: field.source || 'user',
    at: iso(field.updatedAt),
    ref: answerRef(field),
    quote: field.evidence || field.transcriptRef?.quote || null,
  };
}

// ── Factor evaluators: each returns { points, evidence } or { missing: reason } ──

const EVALUATORS = {
  provider_rating(lead, _s, cfg, max) {
    const rating = lead?.providerMeta?.rating;
    if (!Number.isFinite(rating)) return { missing: 'not_recorded' };
    return {
      points: max * tierMultiplier(rating, cfg.rules.ratingTiers),
      evidence: { field: 'providerMeta.rating', value: rating, source: providerSource(lead), at: providerAt(lead), ref: leadRef(lead) },
    };
  },
  review_volume(lead, _s, cfg, max) {
    const count = lead?.providerMeta?.reviewCount;
    if (!Number.isFinite(count)) return { missing: 'not_recorded' };
    return {
      points: max * tierMultiplier(count, cfg.rules.reviewTiers),
      evidence: { field: 'providerMeta.reviewCount', value: count, source: providerSource(lead), at: providerAt(lead), ref: leadRef(lead) },
    };
  },
  business_status(lead, _s, _cfg, max) {
    const raw = str(lead?.providerMeta?.businessStatus);
    if (!raw) return { missing: 'not_recorded' };
    const key = raw.toLowerCase();
    const evidence = { field: 'providerMeta.businessStatus', value: raw, source: providerSource(lead), at: providerAt(lead), ref: leadRef(lead) };
    if (OPERATIONAL.has(key)) return { points: max, evidence };
    if (CLOSED.has(key)) return { points: 0, evidence };
    // A status string the engine does not recognise is reported, never guessed.
    return { points: 0, evidence: { ...evidence, note: 'unrecognised_status' } };
  },
  has_phone(lead, _s, _cfg, max) {
    const field = str(lead?.mobile) ? 'mobile' : (str(lead?.phone) ? 'phone' : null);
    if (!field) return { missing: 'not_recorded' };
    return { points: max, evidence: { field, value: true, source: 'lead', at: iso(lead?.updatedAt), ref: leadRef(lead) } };
  },
  has_email(lead, _s, _cfg, max) {
    if (!str(lead?.email)) return { missing: 'not_recorded' };
    return { points: max, evidence: { field: 'email', value: true, source: 'lead', at: iso(lead?.updatedAt), ref: leadRef(lead) } };
  },
  has_website(lead, _s, _cfg, max) {
    if (!str(lead?.website)) return { missing: 'not_recorded' };
    return { points: max, evidence: { field: 'website', value: lead.website, source: 'lead', at: iso(lead?.updatedAt), ref: leadRef(lead) } };
  },
  business_type_match(lead, _s, cfg, max) {
    if (!cfg.targetBusinessTypes.length) return { notApplicable: 'no_targets_configured' };
    const type = str(lead?.sourceMetadata?.businessType);
    if (!type) return { missing: 'not_recorded' };
    const targets = new Set(cfg.targetBusinessTypes.map(fold));
    return {
      points: targets.has(fold(type)) ? max : 0,
      evidence: { field: 'sourceMetadata.businessType', value: type, source: providerSource(lead), at: providerAt(lead), ref: leadRef(lead) },
    };
  },
  target_location(lead, _s, cfg, max) {
    if (!cfg.targetCities.length) return { notApplicable: 'no_targets_configured' };
    const candidates = [lead?.address?.geography?.cityName, lead?.address?.city].map(str).filter(Boolean);
    if (!candidates.length) return { missing: 'not_recorded' };
    const targets = new Set(cfg.targetCities.map(fold));
    const hit = candidates.find((c) => targets.has(fold(c)));
    return {
      points: hit ? max : 0,
      evidence: { field: 'address.city', value: hit || candidates[0], source: 'lead', at: iso(lead?.updatedAt), ref: leadRef(lead) },
    };
  },
  q_need: (lead, _s, _cfg, max) => textAnswer(lead, 'need', max),
  q_budget(lead, _s, _cfg, max) {
    const field = qualificationField(lead, 'budget');
    if (!field) return { missing: 'not_asked' };
    if (field.status !== 'answered') return { points: 0, evidence: answerEvidence(field) };
    const amount = typeof field.value === 'number' ? field.value : Number(field.value?.amount ?? field.value);
    return { points: Number.isFinite(amount) && amount > 0 ? max : 0, evidence: answerEvidence(field) };
  },
  q_decision_authority: (lead, _s, cfg, max) => choiceAnswer(lead, 'decision_authority', cfg.rules.decisionAuthority, max),
  q_timeline: (lead, _s, cfg, max) => choiceAnswer(lead, 'timeline', cfg.rules.timeline, max),
  q_interest: (lead, _s, cfg, max) => choiceAnswer(lead, 'interest', cfg.rules.interest, max),
  q_objections(lead, _s, _cfg, penalty) {
    const field = qualificationField(lead, 'objections');
    if (!field) return { missing: 'not_asked' };
    const text = str(field.value);
    const raised = field.status === 'answered' && text && !NO_OBJECTION.test(text);
    return { points: raised ? -penalty : 0, evidence: answerEvidence(field) };
  },
  connected_calls(_lead, signals, cfg, max) {
    const connected = [
      ...(signals.communications || []).filter((c) => c.channel === 'phone' && c.connected === 'yes')
        .map((c) => ({ at: c.at, ref: { type: 'lead_communication', id: c.id }, value: c.disposition, source: 'mobile_call' })),
      ...(signals.calls || []).filter((c) => c.answeredAt || CONNECTED_CALL_DISPOSITIONS.has(c.disposition))
        .map((c) => ({ at: c.answeredAt || c.at, ref: { type: 'call_record', id: c.id }, value: c.disposition, source: 'ai_call' })),
    ].sort(byAtDesc);
    if (!connected.length) {
      const attempted = (signals.communications || []).some((c) => c.channel === 'phone') || (signals.calls || []).length > 0;
      return attempted
        ? { points: 0, evidence: { field: 'calls', value: 0, source: 'calls', at: null, ref: null, note: 'attempted_not_connected' } }
        : { missing: 'no_calls_recorded' };
    }
    const latest = connected[0];
    return {
      points: max * tierMultiplier(connected.length, cfg.rules.connectedCallTiers),
      evidence: { field: 'calls', value: connected.length, source: latest.source, at: iso(latest.at), ref: latest.ref },
    };
  },
  sms_replies(_lead, signals, cfg, max) {
    const replies = [...(signals.smsReplies || [])].sort(byAtDesc);
    if (!replies.length) {
      return (signals.smsSent || 0) > 0
        ? { points: 0, evidence: { field: 'sms.replies', value: 0, source: 'sim_sms', at: null, ref: null, note: 'sent_no_reply' } }
        : { missing: 'no_sms_recorded' };
    }
    return {
      points: max * tierMultiplier(replies.length, cfg.rules.smsReplyTiers),
      evidence: { field: 'sms.replies', value: replies.length, source: 'sim_sms', at: iso(replies[0].at), ref: { type: 'sim_sms_message', id: replies[0].id } },
    };
  },
  positive_outcome(_lead, signals, _cfg, max) {
    const outcomes = [
      ...(signals.communications || []).filter((c) => BUSINESS_COMM_DISPOSITIONS.has(c.disposition))
        .map((c) => ({ at: c.at, positive: POSITIVE_COMM_DISPOSITIONS.has(c.disposition), value: c.disposition, ref: { type: 'lead_communication', id: c.id } })),
      ...(signals.calls || []).filter((c) => c.qualification && c.qualification !== 'none')
        .map((c) => ({ at: c.at, positive: POSITIVE_CALL_QUALIFICATIONS.has(c.qualification), value: c.qualification, ref: { type: 'call_record', id: c.id } })),
    ].sort(byAtDesc);
    if (!outcomes.length) return { missing: 'no_outcome_recorded' };
    // The most recent recorded outcome decides: a later "not interested" outweighs an old "interested".
    const latest = outcomes[0];
    return {
      points: latest.positive ? max : 0,
      evidence: { field: 'outcome', value: latest.value, source: latest.ref.type, at: iso(latest.at), ref: latest.ref },
    };
  },
  contact_recency(lead, signals, cfg, max, now) {
    const candidates = [
      lead?.lastContactedAt ? { at: lead.lastContactedAt, ref: leadRef(lead), source: 'lead.lastContactedAt' } : null,
      ...(signals.communications || []).map((c) => ({ at: c.at, ref: { type: 'lead_communication', id: c.id }, source: 'communication' })),
      ...(signals.calls || []).map((c) => ({ at: c.at, ref: { type: 'call_record', id: c.id }, source: 'ai_call' })),
      ...(signals.smsReplies || []).map((c) => ({ at: c.at, ref: { type: 'sim_sms_message', id: c.id }, source: 'sim_sms' })),
    ].filter((c) => c && iso(c.at)).sort(byAtDesc);
    if (!candidates.length) return { missing: 'never_contacted' };
    const latest = candidates[0];
    const days = Math.max(0, Math.floor((now.getTime() - new Date(latest.at).getTime()) / DAY_MS));
    const tier = (cfg.rules.recencyTiers || []).find((t) => days <= t.maxDays);
    return {
      points: max * (tier ? tier.multiplier : 0),
      evidence: { field: 'lastContactedAt', value: `${days}d`, source: latest.source, at: iso(latest.at), ref: latest.ref },
    };
  },
};

function byAtDesc(a, b) {
  const ta = a.at ? new Date(a.at).getTime() : 0;
  const tb = b.at ? new Date(b.at).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return String(b.ref?.id ?? b.id ?? '').localeCompare(String(a.ref?.id ?? a.id ?? ''));
}

function textAnswer(lead, key, max) {
  const field = qualificationField(lead, key);
  if (!field) return { missing: 'not_asked' };
  const answered = field.status === 'answered' && str(field.value).length > 0;
  return { points: answered ? max : 0, evidence: answerEvidence(field) };
}

function choiceAnswer(lead, key, table, max) {
  const field = qualificationField(lead, key);
  if (!field) return { missing: 'not_asked' };
  if (field.status !== 'answered') return { points: 0, evidence: answerEvidence(field) };
  const multiplier = Object.prototype.hasOwnProperty.call(table || {}, field.value) ? table[field.value] : 0;
  return { points: max * multiplier, evidence: answerEvidence(field) };
}

/** First recorded do-not-contact, if any (signals.dnc is pre-sorted oldest first). */
function dncEvidence(lead, signals) {
  if (lead?.doNotContact === true) {
    return { field: 'doNotContact', value: true, source: 'lead', at: iso(lead.updatedAt), ref: leadRef(lead) };
  }
  const first = (signals.dnc || [])[0];
  if (!first) return null;
  return { field: 'doNotContact', value: true, source: first.source, at: iso(first.at), ref: first.ref || null };
}

/**
 * Score one lead. `signals` comes from leadScoring.signals.collectSignals (or a
 * test fixture); `config` may be partial (normalized here); `now` anchors the
 * recency factor so the result is reproducible.
 */
export function scoreLead(lead, signals = {}, config = DEFAULT_SCORING_CONFIG, { now } = {}) {
  const cfg = normalizeScoringConfig(config);
  const at = now instanceof Date ? now : new Date(now ?? signals.asOf ?? Date.now());
  const factors = [];
  const missing = [];
  let earned = 0;
  let possible = 0;
  let evidenced = 0;

  for (const def of FACTOR_DEFINITIONS) {
    const setting = cfg.factors[def.key];
    if (!setting.enabled) continue;
    const max = setting.maxPoints;
    const result = EVALUATORS[def.key](lead, signals, cfg, max, at);
    if (result.notApplicable) continue;
    const isPenalty = def.key === 'q_objections';
    if (!isPenalty) possible += max;
    if (result.missing) {
      missing.push({ key: def.key, label: def.label, group: def.group, reason: result.missing });
      continue;
    }
    const points = round2(result.points);
    earned += points;
    evidenced += 1;
    factors.push({
      key: def.key,
      label: def.label,
      group: def.group,
      points,
      maxPoints: isPenalty ? 0 : max,
      ...(isPenalty ? { minPoints: -max } : {}),
      evidence: result.evidence,
    });
  }

  const dnc = dncEvidence(lead, signals);
  if (dnc) {
    // Do-not-contact disqualifies regardless of every other signal.
    factors.unshift({
      key: 'do_not_contact', label: 'Do not contact', group: 'engagement', points: 0, maxPoints: 0, evidence: dnc,
    });
    return {
      score: 0,
      band: 'cold',
      disqualified: true,
      version: cfg.version,
      engineVersion: ENGINE_VERSION,
      computedAt: at.toISOString(),
      evidenced,
      factors,
      missing,
    };
  }

  const raw = possible > 0 ? (Math.max(0, earned) / possible) * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return {
    score,
    band: bandFor(score, cfg, { evidenced }),
    disqualified: false,
    version: cfg.version,
    engineVersion: ENGINE_VERSION,
    computedAt: at.toISOString(),
    evidenced,
    factors,
    missing,
  };
}

/** The compact copy persisted on lead.score (no evidence payloads). */
export function toStoredScore(result) {
  return {
    value: result.score,
    band: result.band,
    version: result.version,
    engineVersion: result.engineVersion,
    computedAt: new Date(result.computedAt),
    disqualified: Boolean(result.disqualified),
    factors: result.factors.map((f) => ({ key: f.key, points: f.points, maxPoints: f.maxPoints })),
  };
}

export function factorDefinition(key) {
  return FACTOR_BY_KEY.get(key) || null;
}

export default { scoreLead, normalizeScoringConfig, bandFor, toStoredScore, DEFAULT_SCORING_CONFIG, FACTOR_DEFINITIONS, ENGINE_VERSION };
