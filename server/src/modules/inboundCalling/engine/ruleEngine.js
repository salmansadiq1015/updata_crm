/**
 * Incoming-call automation rules: exactly ONE handling decision per call.
 *
 * Evaluation order (first match wins, nothing later can override it):
 *   1. blocked numbers / do-not-contact → never answered by the AI;
 *   2. the owner's rules, by ascending priority (then creation order);
 *   3. the default: AI answering when enabled, otherwise let it ring for a person.
 * An "ai" decision is then checked against availability (agent active, AI session cap, voice
 * pause, device audio verified, outside hours). If the AI cannot take the call the decision
 * falls back to the configured fallback — never to a second AI session.
 *
 * Pure: no database, no clock except `now`.
 */

export const RULE_ACTIONS = Object.freeze(['ai_answer', 'human', 'ignore']);
export const CALLER_TYPES = Object.freeze(['any', 'unknown_number', 'existing_lead', 'private_number', 'ambiguous']);

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function minutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Local weekday + minutes in `timeZone` (Intl, no dependency). */
export function localClock(now, timeZone = 'UTC') {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  }
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = DAY_KEYS.indexOf(String(get('weekday')).slice(0, 3).toLowerCase());
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function withinBusinessHours(hours, now = new Date()) {
  if (!hours?.enabled) return true;
  const { day, minutes: m } = localClock(now, hours.timezone || 'UTC');
  const days = Array.isArray(hours.days) && hours.days.length ? hours.days : [1, 2, 3, 4, 5];
  if (!days.includes(day)) return false;
  const start = minutes(hours.start) ?? 0;
  const end = minutes(hours.end) ?? 24 * 60;
  return start <= end ? m >= start && m < end : m >= start || m < end; // overnight window
}

export function callerTypeOf({ presentation, matchStatus }) {
  if (presentation !== 'available') return 'private_number';
  if (matchStatus === 'existing') return 'existing_lead';
  if (matchStatus === 'ambiguous') return 'ambiguous';
  return 'unknown_number';
}

function ruleMatches(rule, ctx) {
  const c = rule.conditions || {};
  if (c.callerType && c.callerType !== 'any' && c.callerType !== ctx.callerType) return false;
  if (Array.isArray(c.numbers) && c.numbers.length && !c.numbers.includes(ctx.e164)) return false;
  if (Array.isArray(c.numberPrefixes) && c.numberPrefixes.length && !c.numberPrefixes.some((p) => ctx.e164 && ctx.e164.startsWith(p))) return false;
  if (Array.isArray(c.deviceIds) && c.deviceIds.length && !c.deviceIds.map(String).includes(String(ctx.deviceId))) return false;
  if (Array.isArray(c.simSlots) && c.simSlots.length && !c.simSlots.includes(ctx.simSlot)) return false;
  if (typeof c.withinBusinessHours === 'boolean' && c.withinBusinessHours !== ctx.inHours) return false;
  if (Array.isArray(c.leadStatuses) && c.leadStatuses.length && !c.leadStatuses.includes(ctx.leadStatus)) return false;
  return true;
}

/** The agent configured for this device/SIM, else the default agent. */
export function agentFor(settings, { deviceId, simSlot }) {
  const rows = settings.deviceAgents || [];
  const exact = rows.find((r) => String(r.deviceId) === String(deviceId) && r.simSlot != null && r.simSlot === simSlot);
  const anySim = rows.find((r) => String(r.deviceId) === String(deviceId) && (r.simSlot == null));
  const row = exact || anySim;
  if (row && row.aiEnabled === false) return { agentId: null, disabledForDevice: true };
  return { agentId: row?.agentId || settings.defaultAgentId || null, disabledForDevice: false };
}

/**
 * @param {object} p
 * @param {object} p.settings   InboundSettings (plain)
 * @param {object} p.caller     { e164, presentation }
 * @param {object} p.match      { status, leadStatus }
 * @param {object} p.device     { id, audioVerified, online, simSlot }
 * @param {object} p.availability { activeAiSessions, voicePaused, agents: Map(agentId → { availability }) }
 */
export function decideHandling({ settings = {}, caller = {}, match = {}, device = {}, availability = {}, now = new Date() }) {
  const ctx = {
    e164: caller.e164 || null,
    callerType: callerTypeOf({ presentation: caller.presentation, matchStatus: match.status }),
    deviceId: device.id,
    simSlot: device.simSlot ?? null,
    inHours: withinBusinessHours(settings.businessHours, now),
    leadStatus: match.leadStatus || null,
  };
  const base = { callerType: ctx.callerType, inBusinessHours: ctx.inHours, answerAfterMs: Math.max(0, Number(settings.answerDelaySeconds ?? 4)) * 1000 };

  // 1. Hard exclusions: never AI.
  if (ctx.e164 && (settings.blockedNumbers || []).includes(ctx.e164)) {
    return { ...base, action: settings.blockedAction === 'ignore' ? 'ignore' : 'human', agentId: null, ruleId: null, ruleName: 'Blocked number', reason: 'blocked_number' };
  }
  if (match.doNotContact) {
    return { ...base, action: 'human', agentId: null, ruleId: null, ruleName: 'Do not contact', reason: 'do_not_contact' };
  }

  // 2. Owner rules by priority.
  const rules = [...(settings.rules || [])].filter((r) => r.enabled !== false)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const hit = rules.find((r) => ruleMatches(r, ctx));
  let decision;
  if (hit) {
    decision = { action: RULE_ACTIONS.includes(hit.action) ? hit.action : 'human', agentId: hit.agentId || null, ruleId: hit.id || String(hit._id || ''), ruleName: hit.name || 'Rule', reason: 'rule_matched' };
  } else if (!settings.enabled) {
    decision = { action: settings.fallbackAction === 'ignore' ? 'ignore' : 'human', agentId: null, ruleId: null, ruleName: 'AI answering off', reason: 'ai_answering_disabled', aiBlockedBy: 'ai_answering_disabled' };
  } else if (!ctx.inHours && settings.outsideHoursAction && settings.outsideHoursAction !== 'ai_answer') {
    decision = { action: settings.outsideHoursAction, agentId: null, ruleId: null, ruleName: 'Outside business hours', reason: 'outside_business_hours' };
  } else {
    decision = { action: 'ai_answer', agentId: null, ruleId: null, ruleName: 'Default', reason: 'default_ai' };
  }
  if (decision.action !== 'ai_answer') return { ...base, ...decision, agentId: null };

  // 3. Availability checks for an AI decision.
  const resolved = agentFor(settings, { deviceId: ctx.deviceId, simSlot: ctx.simSlot });
  const agentId = decision.agentId || resolved.agentId;
  const fallback = (reason) => ({ ...base, ...decision, action: settings.fallbackAction === 'ignore' ? 'ignore' : 'human', agentId: null, reason, aiBlockedBy: reason });
  // The master switch wins over every rule: "AI answering off" means no AI on any call.
  if (!settings.enabled) return fallback('ai_answering_disabled');
  if (resolved.disabledForDevice && !decision.agentId) return fallback('ai_disabled_for_device');
  if (!agentId) return fallback('no_agent_configured');
  const agent = availability.agents?.get?.(String(agentId));
  if (!agent || agent.availability !== 'active') return fallback('agent_unavailable');
  if (availability.voicePaused) return fallback('voice_paused');
  if (!device.audioVerified) return fallback('device_audio_not_verified');
  const cap = Math.max(1, Number(settings.maxConcurrentAiSessions) || 1);
  if ((availability.activeAiSessions || 0) >= cap) return fallback('ai_session_limit');
  return { ...base, ...decision, agentId: String(agentId) };
}
