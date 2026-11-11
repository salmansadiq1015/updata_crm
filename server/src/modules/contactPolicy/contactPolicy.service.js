import mongoose from 'mongoose';
import Lead from '../crm/lead.model.js';
import LeadCommunication from '../crm/leadCommunication.model.js';
import MessageSuppression from '../messaging/suppression.model.js';
import LeadChannelConsent from '../messaging/consent.model.js';
import { destinationHash } from '../messaging/destinationHash.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import CallConsent from '../aiCalling/callConsent.model.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import {
  ContactLedger, ContactPolicyDenial, ContactPolicySettings, ContactTouch,
} from './contactPolicy.models.js';
import {
  evaluateLimits, horizonMs, leadTimezone, limitConditions, normalizePolicy, quietHoursState,
} from './contactPolicy.engine.js';
import { CONTACT_CHANNELS, HARD_BLOCK_REASONS } from './contactPolicy.constants.js';

const SETTINGS_TTL_MS = 15_000;
const oid = (v) => (v ? new mongoose.Types.ObjectId(String(v)) : null);

/** E.164 candidates of a lead's phone numbers (lead country first, then generic). */
function leadNumbers(lead) {
  const out = new Set();
  for (const field of ['mobile', 'phone']) {
    const raw = lead?.[field] ? String(lead[field]).trim() : '';
    if (!raw) continue;
    for (const n of [normalizePhone(raw, lead.address?.country || 'CH'), normalizePhone(raw)]) {
      if (n.valid) out.add(n.e164);
    }
  }
  return [...out];
}

/**
 * contactPolicyService — the shared cross-channel contact gate.
 *
 *   check({ leadId, channel, campaignId?, at? })            → { allowed, reason, nextAllowedAt, ... }  (read-only)
 *   reserve({ leadId, channel, campaignId, source, refId, force?, userId? })
 *                                                            → { allowed, reason, nextAllowedAt, reservationId }
 *   release(reservationId) / commit(reservationId)
 *   releaseByRef(source, refId) / commitByRef(source, refId)
 *
 * Hard blockers (DNC, channel suppression, revoked consent) always deny — even a
 * forced manual contact. Frequency / quiet-hours limits deny automated sends; a
 * `force: true` (manual one-off contact by a user) is recorded with a warning.
 */
class ContactPolicyService {
  constructor() { this._settingsCache = null; }

  async getPolicy() {
    const now = Date.now();
    if (this._settingsCache && now - this._settingsCache.at < SETTINGS_TTL_MS) return this._settingsCache.policy;
    const stored = await ContactPolicySettings.findOne({ key: 'global' }).lean();
    const policy = normalizePolicy(stored);
    this._settingsCache = { at: now, policy };
    return policy;
  }

  async getSettings() {
    const stored = await ContactPolicySettings.findOne({ key: 'global' }).lean();
    return { ...normalizePolicy(stored), updatedAt: stored?.updatedAt || null };
  }

  async updateSettings(input, actor, meta = {}) {
    const current = normalizePolicy(await ContactPolicySettings.findOne({ key: 'global' }).lean());
    const next = {
      enabled: input.enabled ?? current.enabled ?? true,
      maxTouchesPerDay: input.maxTouchesPerDay ?? current.maxTouchesPerDay,
      maxTouchesPerWeek: input.maxTouchesPerWeek ?? current.maxTouchesPerWeek,
      minGapMinutes: input.minGapMinutes ?? current.minGapMinutes,
      channels: Object.fromEntries(CONTACT_CHANNELS.map((c) => [c, { ...current.channels[c], ...(input.channels?.[c] || {}) }])),
      quietHours: { ...current.quietHours, ...(input.quietHours || {}) },
      updatedBy: actor,
    };
    await ContactPolicySettings.updateOne({ key: 'global' }, { $set: next, $setOnInsert: { key: 'global' } }, { upsert: true, runValidators: true });
    this._settingsCache = null;
    auditService.logEvent({
      eventType: 'contact_policy.settings_updated', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'contact-policy', details: { before: current, after: { ...next, updatedBy: undefined } },
    });
    return this.getSettings();
  }

  // ------------------------------------------------------------ hard blockers
  async hardBlockers(lead, channel) {
    if (!lead || lead.isDeleted) return ['lead_unavailable'];
    const numbers = leadNumbers(lead);
    const callHashes = numbers.map((e) => phoneHash(e));
    const msgChannel = channel === 'voice' ? null : channel;
    const msgHashes = msgChannel === 'email'
      ? (lead.email ? [destinationHash('email', lead.email)] : [])
      : (msgChannel ? numbers.map((e) => destinationHash(msgChannel, e)) : []);
    const [dncComm, dncCall, callSuppressed, callRevoked, msgSuppressed, msgConsent] = await Promise.all([
      LeadCommunication.exists({ leadId: lead._id, 'outcome.doNotContact': true }),
      CallSuppression.exists({ reason: 'do_not_contact', $or: [{ leadId: lead._id }, ...(callHashes.length ? [{ phoneHash: { $in: callHashes } }] : [])] }),
      channel === 'voice' && callHashes.length ? CallSuppression.exists({ phoneHash: { $in: callHashes } }) : null,
      channel === 'voice' ? CallConsent.findOne({ leadId: lead._id }).sort({ updatedAt: -1 }).select('status').lean() : null,
      msgChannel ? MessageSuppression.exists({ channel: msgChannel, $or: [{ leadId: lead._id }, ...(msgHashes.length ? [{ destinationHash: { $in: msgHashes } }] : [])] }) : null,
      msgChannel ? LeadChannelConsent.findOne({ leadId: lead._id, channel: msgChannel }).select('status').lean() : null,
    ]);
    const reasons = [];
    if (dncComm || dncCall) reasons.push('do_not_contact');
    if (callSuppressed && !reasons.includes('do_not_contact')) reasons.push('call_suppressed');
    if (msgSuppressed) reasons.push('channel_suppressed');
    if (['denied', 'revoked'].includes(callRevoked?.status) || ['denied', 'revoked'].includes(msgConsent?.status)) reasons.push('consent_revoked');
    return reasons;
  }

  async _loadLead(leadId) {
    return Lead.findById(leadId).select('_id isDeleted phone mobile email address.country lastContactedAt').lean();
  }

  async _ledgerEvents(leadId) {
    const ledger = await ContactLedger.findOne({ leadId }).select('events').lean();
    return ledger?.events || [];
  }

  /**
   * Read-only decision for UI ("next allowed contact") and pre-flight checks.
   * Never reserves; the dispatcher must still call reserve() atomically.
   */
  async check({ leadId, channel, campaignId = null, at = null } = {}) {
    const now = at ? new Date(at) : new Date();
    const [policy, lead] = await Promise.all([this.getPolicy(), this._loadLead(leadId)]);
    const blockers = await this.hardBlockers(lead, channel);
    const events = lead ? await this._ledgerEvents(lead._id) : [];
    const limits = evaluateLimits(policy, events, channel, now, { extraLastContactAt: lead?.lastContactedAt });
    const timezone = leadTimezone(lead);
    const quiet = policy.enabled ? quietHoursState(policy, timezone, now) : { applies: false, quiet: false, until: null };
    let reason = null; let nextAllowedAt = null;
    if (blockers.length) reason = blockers[0];
    else {
      const soft = [];
      if (!limits.allowed) soft.push([limits.reason, limits.nextAllowedAt]);
      if (quiet.quiet) soft.push(['quiet_hours', quiet.until]);
      if (soft.length) {
        soft.sort((a, b) => new Date(b[1] || 0) - new Date(a[1] || 0));
        [[reason, nextAllowedAt]] = soft;
        // A limit that frees up during the lead's night really frees up in the morning.
        const later = nextAllowedAt ? quietHoursState(policy, timezone, new Date(nextAllowedAt)) : null;
        if (later?.quiet && later.until) nextAllowedAt = later.until;
      }
    }
    return {
      allowed: !reason, reason, nextAllowedAt, blocked: blockers.length > 0, blockers,
      channel, campaignId: campaignId ? String(campaignId) : null, policyEnabled: policy.enabled,
      counts: limits.counts, timezone, quietHours: { applies: quiet.applies, quiet: quiet.quiet, until: quiet.until || null, unknownTimezone: Boolean(quiet.unknownTimezone) },
    };
  }

  /** Lead panel: every channel's decision + recent touches. */
  async leadStatus(leadId, now = new Date()) {
    // check() is read-only, so the per-channel decisions and the touch list load in parallel.
    const [decisions, recent] = await Promise.all([
      Promise.all(CONTACT_CHANNELS.map((channel) => this.check({ leadId, channel, at: now }))),
      ContactTouch.find({ leadId, status: { $ne: 'released' } }).sort({ at: -1 }).limit(20)
        .select('channel source campaignId at status manual policyWarning').lean(),
    ]);
    const channels = Object.fromEntries(CONTACT_CHANNELS.map((channel, i) => [channel, decisions[i]]));
    const allowedTimes = Object.values(channels).filter((c) => !c.blocked).map((c) => (c.allowed ? now : c.nextAllowedAt)).filter(Boolean);
    return {
      leadId: String(leadId),
      nextAllowedAt: allowedTimes.length ? new Date(Math.min(...allowedTimes.map((d) => new Date(d).getTime()))) : null,
      channels, recentTouches: recent,
    };
  }

  /**
   * Atomically reserve a touch. Idempotent per {source, refId}: a retried
   * dispatch gets its existing reservation back instead of counting twice.
   */
  async reserve({ leadId, channel, campaignId = null, source, refId, force = false, userId = null, at = null } = {}) {
    if (!CONTACT_CHANNELS.includes(channel)) throw new Error(`Unknown contact channel: ${channel}`);
    if (!source || !refId) throw new Error('reserve() needs source and refId');
    const now = at ? new Date(at) : new Date();
    const existing = await ContactTouch.findOne({ source, refId: String(refId) }).lean();
    if (existing && existing.status !== 'released') {
      return { allowed: true, reason: existing.policyWarning, nextAllowedAt: null, reservationId: String(existing._id), duplicate: true };
    }

    const [policy, lead] = await Promise.all([this.getPolicy(), this._loadLead(leadId)]);
    // No CRM lead behind the recipient (e.g. an imported provider recipient): nothing to
    // track per lead; each channel's own gates still apply.
    if (!lead) return { allowed: true, reason: null, nextAllowedAt: null, reservationId: null, untracked: true };
    const blockers = await this.hardBlockers(lead, channel);
    if (blockers.length) {
      await this._recordDenial({ source, campaignId, leadId, channel, reason: blockers[0], nextAllowedAt: null, now });
      return { allowed: false, reason: blockers[0], nextAllowedAt: null, reservationId: null, blocked: true };
    }

    // Quiet hours + lead.lastContactedAt (legacy contacts not in the ledger) are
    // checked before the atomic step; the ledger counts are checked inside it.
    let softReason = null; let softNext = null;
    if (policy.enabled) {
      const quiet = quietHoursState(policy, leadTimezone(lead), now);
      if (quiet.quiet) { softReason = 'quiet_hours'; softNext = quiet.until; }
      const gapMs = policy.minGapMinutes * 60_000;
      if (!softReason && gapMs > 0 && lead.lastContactedAt && new Date(lead.lastContactedAt).getTime() > now.getTime() - gapMs) {
        softReason = 'min_gap'; softNext = new Date(new Date(lead.lastContactedAt).getTime() + gapMs);
      }
    }
    if (softReason && !force) {
      await this._recordDenial({ source, campaignId, leadId, channel, reason: softReason, nextAllowedAt: softNext, now });
      return { allowed: false, reason: softReason, nextAllowedAt: softNext, reservationId: null };
    }

    const touchId = new mongoose.Types.ObjectId();
    await ContactLedger.updateOne({ leadId: lead._id }, { $setOnInsert: { leadId: lead._id, events: [] } }, { upsert: true });
    // Age out old events (separate update: $pull and $push on one array conflict).
    await ContactLedger.updateOne({ leadId: lead._id }, { $pull: { events: { at: { $lt: new Date(now.getTime() - horizonMs(policy)) } } } });

    let warning = softReason;
    const conditions = force ? [] : limitConditions(policy, channel, now);
    let pushed = await ContactLedger.findOneAndUpdate(
      { leadId: lead._id, ...(conditions.length ? { $expr: { $and: conditions } } : {}) },
      { $push: { events: { touchId, channel, at: now } } },
      { returnDocument: 'after', projection: { _id: 1 } },
    ).lean();
    if (!pushed) {
      const events = await this._ledgerEvents(lead._id);
      const verdict = evaluateLimits(policy, events, channel, now);
      if (!force) {
        const reason = verdict.reason || 'daily_limit';
        await this._recordDenial({ source, campaignId, leadId, channel, reason, nextAllowedAt: verdict.nextAllowedAt, now });
        return { allowed: false, reason, nextAllowedAt: verdict.nextAllowedAt, reservationId: null };
      }
      pushed = true;
    }
    if (force && !warning) {
      // Manual contact: record and report what it would have violated.
      const events = (await this._ledgerEvents(lead._id)).filter((e) => String(e.touchId) !== String(touchId));
      warning = evaluateLimits(policy, events, channel, now).reason;
    }

    try {
      const touch = await ContactTouch.create({
        _id: touchId, leadId: lead._id, channel, campaignId: oid(campaignId), source, refId: String(refId), at: now,
        status: 'reserved', manual: Boolean(force), policyWarning: warning || null, userId: oid(userId),
      });
      if (campaignId) await ContactPolicyDenial.updateOne({ source, campaignId: oid(campaignId), leadId: lead._id, active: true }, { $set: { active: false } });
      return { allowed: true, reason: warning || null, nextAllowedAt: null, reservationId: String(touch._id), warning: warning || null };
    } catch (error) {
      // Lost a race with the same {source, refId}: undo our ledger event, return theirs.
      await ContactLedger.updateOne({ leadId: lead._id }, { $pull: { events: { touchId } } });
      if (error?.code !== 11000) throw error;
      const winner = await ContactTouch.findOne({ source, refId: String(refId) }).lean();
      return { allowed: true, reason: winner?.policyWarning || null, nextAllowedAt: null, reservationId: winner ? String(winner._id) : null, duplicate: true };
    }
  }

  async _recordDenial({ source, campaignId, leadId, channel, reason, nextAllowedAt, now }) {
    if (!campaignId || !leadId) return;
    try {
      await ContactPolicyDenial.updateOne(
        { source, campaignId: oid(campaignId), leadId: oid(leadId) },
        { $set: { channel, reason, lastAt: now, nextAllowedAt: nextAllowedAt || null, active: true }, $inc: { count: 1 }, $setOnInsert: { firstAt: now } },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) logger.warn('contact policy denial not recorded', { module: 'contact-policy', error: error.message });
    }
  }

  async release(reservationId) {
    if (!reservationId || !mongoose.isValidObjectId(reservationId)) return { released: false };
    const touch = await ContactTouch.findOneAndUpdate(
      { _id: reservationId, status: 'reserved' }, { $set: { status: 'released', releasedAt: new Date() } }, { returnDocument: 'after' },
    ).lean();
    if (!touch) return { released: false };
    await ContactLedger.updateOne({ leadId: touch.leadId }, { $pull: { events: { touchId: touch._id } } });
    return { released: true };
  }

  async commit(reservationId) {
    if (!reservationId || !mongoose.isValidObjectId(reservationId)) return { committed: false };
    const res = await ContactTouch.updateOne({ _id: reservationId, status: 'reserved' }, { $set: { status: 'committed', committedAt: new Date() } });
    return { committed: res.modifiedCount === 1 };
  }

  async releaseByRef(source, refId) {
    if (!refId) return { released: false };
    const touch = await ContactTouch.findOne({ source, refId: String(refId) }).select('_id').lean();
    return touch ? this.release(touch._id) : { released: false };
  }

  async commitByRef(source, refId) {
    if (!refId) return { committed: false };
    const touch = await ContactTouch.findOne({ source, refId: String(refId) }).select('_id').lean();
    return touch ? this.commit(touch._id) : { committed: false };
  }

  /** "Skipped: contact limit" figures for a campaign view. */
  async campaignSkips(source, campaignId) {
    const rows = await ContactPolicyDenial.aggregate([
      { $match: { source, campaignId: oid(campaignId), active: true } },
      { $group: { _id: '$reason', leads: { $sum: 1 }, attempts: { $sum: '$count' }, nextAllowedAt: { $min: '$nextAllowedAt' } } },
    ]);
    const byReason = Object.fromEntries(rows.map((r) => [r._id, { leads: r.leads, attempts: r.attempts, nextAllowedAt: r.nextAllowedAt }]));
    const limitRows = rows.filter((r) => !HARD_BLOCK_REASONS.includes(r._id));
    return {
      source, campaignId: String(campaignId),
      skipped: rows.reduce((a, r) => a + r.leads, 0),
      skippedContactLimit: limitRows.reduce((a, r) => a + r.leads, 0),
      blocked: rows.filter((r) => HARD_BLOCK_REASONS.includes(r._id)).reduce((a, r) => a + r.leads, 0),
      byReason,
    };
  }

  /** Delete ledger events past the horizon for leads not touched lately (sweep). */
  async prune(now = new Date()) {
    const policy = await this.getPolicy();
    const res = await ContactLedger.updateMany(
      { 'events.at': { $lt: new Date(now.getTime() - horizonMs(policy)) } },
      { $pull: { events: { at: { $lt: new Date(now.getTime() - horizonMs(policy)) } } } },
    );
    return { pruned: res.modifiedCount || 0 };
  }

  _invalidate() { this._settingsCache = null; }
}

export const contactPolicyService = new ContactPolicyService();
export default contactPolicyService;
