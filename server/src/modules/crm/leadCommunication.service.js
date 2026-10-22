import mongoose from 'mongoose';
import LeadCommunication from './leadCommunication.model.js';
import Lead, { LEAD_STATUS } from './lead.model.js';
import leadService from './lead.service.js';
import contactLogService from './contactLog.service.js';
import leadQualificationService, { normalizeConfirmedAnswer } from './leadQualification.service.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import CampaignRecipient from '../aiCalling/campaignRecipient.model.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import MessageSuppression from '../messaging/suppression.model.js';
import LeadChannelConsent from '../messaging/consent.model.js';
import { destinationHash } from '../messaging/destinationHash.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import { buildCursorQuery, buildCursorSort, buildCursorResponse } from '../../shared/utils/pagination.js';
import logger from '../../shared/logger/index.js';
import {
  ELIGIBILITY_REASONS, COMM_ERROR_CODES, MAX_EVENTS, RECEIPT_STEPS, DNC_DISPOSITION,
} from './leadCommunication.constants.js';

const LOCK_MS = 60_000;
const DISPATCH_STATE_BY_EVENT = {
  dispatch_requested: 'dispatched',
  dispatched: 'dispatched',
  dispatch_failed: 'dispatch_failed',
};
const SUBJECT_ROUTE = {
  telecom_direct: 'SIM call (in-app)',
  dialer_handoff: 'SIM call via dialer',
  sms_composer: 'SMS composer',
  sms_direct: 'SMS sent from SIM (app)',
  sim_call_campaign: 'SIM call (campaign)',
};
const CREATOR_FIELDS = 'firstName lastName email';

const iso = (value) => (value ? new Date(value).toISOString() : null);
const idOf = (value) => (value && typeof value === 'object' && value._id ? String(value._id) : value ? String(value) : null);

function conflict(message, code, details = [], data = null) {
  const err = new AppError(message, 409, code, details);
  if (data) err.data = data;
  return err;
}

/**
 * Resolve a lead's destination for one field. The number always comes from
 * the CRM, never from the client. Returns every E.164 normalization the other
 * modules may have used (lead-country aware like aiCalling, CH-default like
 * messaging) so suppression lookups match whichever wrote the hash.
 */
export function resolveDestination(lead, field) {
  const raw = typeof lead[field] === 'string' ? lead[field].trim() : '';
  if (!raw) return { raw: null, valid: false, e164: null, candidates: [], masked: null };
  const primary = normalizePhone(raw, lead.address?.country || 'CH');
  const fallback = normalizePhone(raw);
  const candidates = [...new Set([primary, fallback].filter((n) => n.valid).map((n) => n.e164))];
  const digits = raw.replace(/\D/g, '');
  const masked = digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
  if (!primary.valid) return { raw, valid: false, e164: null, candidates, masked };
  return { raw, valid: true, e164: primary.e164, candidates, masked };
}

/** Derive what the telephony events actually show. Off-hook ≠ answered. */
export function deriveObserved(events = []) {
  const callEvents = events
    .filter((e) => typeof e.type === 'string' && e.type.startsWith('call_state_'))
    .sort((a, b) => (new Date(a.at) - new Date(b.at)) || (a.seq - b.seq));
  if (!callEvents.length) {
    return {
      ringingObserved: false, offhookAt: null, idleAfterOffhookAt: null, offhookDurationSec: null, evidence: 'none',
    };
  }
  const offhook = callEvents.find((e) => e.type === 'call_state_offhook') || null;
  const offhookAt = offhook ? new Date(offhook.at) : null;
  const idle = offhookAt
    ? callEvents.find((e) => e.type === 'call_state_idle' && new Date(e.at) >= offhookAt) || null
    : null;
  const idleAt = idle ? new Date(idle.at) : null;
  return {
    ringingObserved: callEvents.some((e) => e.type === 'call_state_ringing'),
    offhookAt,
    idleAfterOffhookAt: idleAt,
    offhookDurationSec: offhookAt && idleAt ? Math.max(0, Math.round((idleAt - offhookAt) / 1000)) : null,
    evidence: 'telephony_events',
  };
}

/** Lifecycle state from the last dispatch-related event (by seq), unless completed. */
function deriveState(currentState, events) {
  if (currentState === 'completed') return 'completed';
  const dispatchEvents = events.filter((e) => DISPATCH_STATE_BY_EVENT[e.type]).sort((a, b) => a.seq - b.seq);
  const last = dispatchEvents[dispatchEvents.length - 1];
  return last ? DISPATCH_STATE_BY_EVENT[last.type] : 'started';
}

function serializeStep(step) {
  if (!step || !step.status) return null;
  return { status: step.status, error: step.error ?? null, at: iso(step.at) };
}

export function serializeCommunication(doc) {
  if (!doc) return null;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const createdBy = d.createdBy && typeof d.createdBy === 'object' && d.createdBy.firstName !== undefined
    ? {
      id: String(d.createdBy._id), firstName: d.createdBy.firstName ?? null, lastName: d.createdBy.lastName ?? null, email: d.createdBy.email ?? null,
    }
    : idOf(d.createdBy);
  const steps = d.receipt?.steps || {};
  return {
    id: String(d._id),
    operationId: d.operationId,
    leadId: idOf(d.leadId),
    channel: d.channel,
    direction: d.direction || 'outbound',
    route: d.route,
    mode: d.mode,
    state: d.state,
    destinationField: d.destinationField,
    destinationMasked: d.destinationMasked ?? null,
    sim: d.sim ? {
      subscriptionId: d.sim.subscriptionId ?? null,
      slotIndex: d.sim.slotIndex ?? null,
      carrierName: d.sim.carrierName ?? null,
      displayName: d.sim.displayName ?? null,
      isEmbedded: d.sim.isEmbedded ?? null,
      originNumber: d.sim.originNumber ?? null,
      originNumberSource: d.sim.originNumberSource ?? null,
    } : null,
    device: d.device ? {
      platform: d.device.platform ?? 'android',
      osVersion: d.device.osVersion ?? null,
      appVersion: d.device.appVersion ?? null,
      model: d.device.model ?? null,
    } : null,
    observed: {
      ringingObserved: Boolean(d.observed?.ringingObserved),
      offhookAt: iso(d.observed?.offhookAt),
      idleAfterOffhookAt: iso(d.observed?.idleAfterOffhookAt),
      offhookDurationSec: d.observed?.offhookDurationSec ?? null,
      evidence: d.observed?.evidence || 'none',
    },
    outcome: d.outcome ? {
      disposition: d.outcome.disposition,
      connected: d.outcome.connected,
      notes: d.outcome.notes ?? '',
      followUpAt: iso(d.outcome.followUpAt),
      followUpTimezone: d.outcome.followUpTimezone ?? null,
      statusChange: d.outcome.statusChange ?? null,
      doNotContact: Boolean(d.outcome.doNotContact),
    } : null,
    sms: d.sms ? {
      templateId: d.sms.templateId ?? null,
      body: d.sms.body ?? '',
      encoding: d.sms.encoding,
      segments: d.sms.segments,
      sendStatus: d.sms.sendStatus,
    } : null,
    qualification: d.qualification ? {
      answers: (d.qualification.answers || []).map((a) => ({
        fieldKey: a.fieldKey,
        label: a.label ?? null,
        value: a.value ?? null,
        status: a.status,
        source: a.source,
        evidence: a.evidence ?? null,
        confidence: a.confidence ?? null,
      })),
    } : null,
    receipt: {
      steps: Object.fromEntries(RECEIPT_STEPS.map((name) => [name, serializeStep(steps[name])])),
      completedAt: iso(d.receipt?.completedAt),
    },
    events: (d.events || []).slice().sort((a, b) => a.seq - b.seq).map((e) => ({
      seq: e.seq, type: e.type, at: iso(e.at), source: e.source, data: e.data ?? null,
    })),
    contactLogId: idOf(d.contactLogId),
    createdBy,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    completedAt: iso(d.completedAt),
  };
}

function normalizeOutcome(outcome) {
  return {
    disposition: outcome.disposition,
    connected: outcome.connected,
    notes: outcome.notes ?? '',
    followUpAt: outcome.followUpAt ? new Date(outcome.followUpAt) : null,
    followUpTimezone: outcome.followUpAt ? (outcome.followUpTimezone ?? null) : null,
    statusChange: outcome.statusChange ?? null,
    doNotContact: Boolean(outcome.doNotContact),
  };
}

function sameOutcome(stored, incoming) {
  if (!stored) return false;
  const a = normalizeOutcome(stored);
  return a.disposition === incoming.disposition
    && a.connected === incoming.connected
    && a.notes === incoming.notes
    && (a.followUpAt?.getTime() ?? null) === (incoming.followUpAt?.getTime() ?? null)
    && a.followUpTimezone === incoming.followUpTimezone
    && a.statusChange === incoming.statusChange
    && a.doNotContact === incoming.doNotContact;
}

const stepDone = (step) => step && (step.status === 'ok' || step.status === 'skipped');

/**
 * Do-not-contact for a lead's numbers: blocks calls (CallSuppression, pending AI-call
 * recipients) and SMS (MessageSuppression). Idempotent; shared by the mobile outcome
 * step, the SMS link assistant and SMS-reply opt-outs so every path applies the same rule.
 * @returns {{ callHashes: string[], smsSuppressed: boolean }}
 */
export async function suppressLeadContact({ leadId, userId, source, e164s = [], extraCallHashes = [], now = new Date() }) {
  const callHashes = [...new Set([...extraCallHashes.filter(Boolean), ...e164s.map((e164) => phoneHash(e164))])];
  for (const hash of callHashes) {
    await CallSuppression.updateOne(
      { phoneHash: hash },
      { $setOnInsert: { leadId, reason: 'do_not_contact', source, suppressedAt: now, createdBy: userId } },
      { upsert: true },
    );
  }
  if (callHashes.length) {
    await CampaignRecipient.updateMany(
      { phoneHash: { $in: callHashes }, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
      { $set: { state: 'suppressed', 'eligibility.eligible': false } },
    );
  }
  for (const e164 of e164s) {
    await MessageSuppression.updateOne(
      { channel: 'sms', destinationHash: destinationHash('sms', e164) },
      { $setOnInsert: { leadId, reason: 'opt_out', source, suppressedAt: now, createdBy: userId } },
      { upsert: true },
    );
  }
  return { callHashes, smsSuppressed: e164s.length > 0 };
}

class LeadCommunicationService {
  async _loadLead(leadId) {
    const lead = await Lead.findById(leadId).select('_id status phone mobile address.country').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    return lead;
  }

  async _findOwned(leadId, operationId, userId) {
    const doc = await LeadCommunication.findOne({ createdBy: userId, leadId, operationId }).lean();
    if (!doc) throw new NotFoundError('Communication', operationId);
    return doc;
  }

  async _evaluate(lead, channel, destinationField) {
    const dest = resolveDestination(lead, destinationField);
    const reasons = [];
    if (!dest.raw) reasons.push(ELIGIBILITY_REASONS.NO_DESTINATION);
    else if (!dest.valid) reasons.push(ELIGIBILITY_REASONS.INVALID_NUMBER);
    else if (channel === 'phone') {
      const hashes = dest.candidates.map((e164) => phoneHash(e164));
      if (await CallSuppression.exists({ phoneHash: { $in: hashes } })) reasons.push(ELIGIBILITY_REASONS.PHONE_SUPPRESSED);
    } else {
      const hashes = dest.candidates.map((e164) => destinationHash('sms', e164));
      const [suppressed, consent] = await Promise.all([
        MessageSuppression.exists({ channel: 'sms', destinationHash: { $in: hashes } }),
        LeadChannelConsent.findOne({ leadId: lead._id, channel: 'sms' }).select('status').lean(),
      ]);
      if (suppressed) reasons.push(ELIGIBILITY_REASONS.SMS_SUPPRESSED);
      if (consent && ['denied', 'revoked'].includes(consent.status)) reasons.push(ELIGIBILITY_REASONS.SMS_CONSENT_DENIED);
    }
    // A converted lead is deliberately NOT a block: contacting a customer's
    // former lead record is allowed.
    return { eligible: reasons.length === 0, reasons, destinationMasked: dest.masked, dest };
  }

  async _issueLink(leadId, input, userId) {
    if (input.channel !== 'sms' || !input.linkCampaignId) return null;
    const { default: linkAssistant } = await import('../linkAssistant/linkAssistant.service.js');
    const issued = await linkAssistant.issueLink({
      campaignId: input.linkCampaignId, leadId, userId, operationId: input.operationId, purpose: input.linkPurpose || 'initial',
    });
    return { url: issued.url, expiresAt: issued.expiresAt, sessionId: issued.sessionId };
  }

  async _linkFunnel(fn) {
    try {
      const { default: linkAssistant } = await import('../linkAssistant/linkAssistant.service.js');
      await fn(linkAssistant);
    } catch (error) {
      logger.warn('link funnel update failed', { module: 'lead', error: error.message });
    }
  }

  async eligibility(leadId, { channel, destinationField }) {
    const lead = await this._loadLead(leadId);
    const { eligible, reasons, destinationMasked } = await this._evaluate(lead, channel, destinationField);
    return { eligible, reasons, destinationMasked };
  }

  _notEligible(result) {
    return conflict(
      'This lead cannot be contacted on that channel',
      COMM_ERROR_CODES.CONTACT_NOT_ELIGIBLE,
      result.reasons.map((code) => ({ field: 'destination', code, message: code })),
      { reasons: result.reasons, destinationMasked: result.destinationMasked },
    );
  }

  _assertSameOperation(existing, leadId, channel) {
    if (String(existing.leadId) !== String(leadId) || existing.channel !== channel) {
      throw conflict(
        'operationId is already used for a different lead or channel',
        COMM_ERROR_CODES.OPERATION_ID_CONFLICT,
        [{ field: 'operationId', message: 'operationId already used for a different lead or channel' }],
      );
    }
  }

  /**
   * Start (or idempotently re-fetch) an operation. Returns { communication, dialNumber, created }.
   * `options.skipEligibility` is for server-side recorders only (the SIM SMS agent
   * logging a conversation that already happened, e.g. one that ended in STOP);
   * it is never reachable from HTTP.
   */
  async create(leadId, input, userId, meta = {}, { skipEligibility = false } = {}) {
    const lead = await this._loadLead(leadId);
    const existing = await LeadCommunication.findOne({ createdBy: userId, operationId: input.operationId }).lean();
    if (existing) this._assertSameOperation(existing, leadId, input.channel);

    const result = await this._evaluate(lead, input.channel, input.destinationField);
    const dialNumber = result.dest.raw;
    if (existing) {
      // A replayed create for an operation that was never completed must not
      // hand out a number that has since been suppressed.
      if (existing.state !== 'completed' && !result.eligible && !skipEligibility) throw this._notEligible(result);
      const link = await this._issueLink(leadId, input, userId);
      return { communication: serializeCommunication(existing), dialNumber, created: false, link };
    }
    if (!result.eligible && !skipEligibility) throw this._notEligible(result);
    // The personal link is issued (and its campaign, hours and kill switch checked)
    // before anything is recorded: if it can't be issued, no SMS goes out.
    const link = await this._issueLink(leadId, input, userId);

    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
    let doc;
    try {
      doc = await LeadCommunication.create({
        operationId: input.operationId,
        leadId,
        createdBy: userId,
        channel: input.channel,
        route: input.route,
        mode: input.mode || 'manual',
        destinationField: input.destinationField,
        destinationHash: phoneHash(result.dest.e164),
        destinationMasked: result.destinationMasked,
        sim: input.sim || undefined,
        device: input.device || undefined,
        events: [{ seq: 0, type: 'created', at: startedAt, source: 'app', data: null }],
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Lost a create race with a retry of the same operation.
      const winner = await LeadCommunication.findOne({ createdBy: userId, operationId: input.operationId }).lean();
      if (!winner) throw err;
      this._assertSameOperation(winner, leadId, input.channel);
      return { communication: serializeCommunication(winner), dialNumber, created: false, link };
    }

    auditService.logEvent({
      eventType: 'lead.communication_started',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        leadId: String(leadId), communicationId: String(doc._id), operationId: doc.operationId, channel: doc.channel, route: doc.route,
      },
      module: 'lead',
    });
    return { communication: serializeCommunication(doc), dialNumber, created: true, link };
  }

  /** Append app/native events (dedupe by seq), then re-derive state + observed. */
  async appendEvents(leadId, operationId, events, userId) {
    await this._loadLead(leadId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const doc = await LeadCommunication.findOne({ createdBy: userId, leadId, operationId });
      if (!doc) throw new NotFoundError('Communication', operationId);

      const known = new Set(doc.events.map((e) => e.seq));
      const fresh = [];
      for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
        if (known.has(event.seq)) continue;
        known.add(event.seq);
        fresh.push({
          seq: event.seq, type: event.type, at: new Date(event.at), source: event.source, data: event.data ?? null,
        });
      }
      const room = Math.max(0, MAX_EVENTS - doc.events.length);
      const accepted = fresh.slice(0, room);
      if (!accepted.length) return serializeCommunication(doc);

      doc.events.push(...accepted);
      const all = doc.events.map((e) => ({ seq: e.seq, type: e.type, at: e.at }));
      doc.state = deriveState(doc.state, all);
      doc.observed = deriveObserved(all);
      // A carrier delivery report upgrades a SIM-sent SMS; it never revives a failed or unknown one.
      if (doc.route === 'sms_direct' && doc.sms?.sendStatus === 'device_sent'
        && accepted.some((e) => e.type === 'sms_delivered')) {
        doc.sms.sendStatus = 'device_delivered';
      }
      try {
        await doc.save();
        if (accepted.some((e) => e.type === 'sms_delivered')) {
          await this._linkFunnel((link) => link.onSmsDelivered(operationId));
        }
        return serializeCommunication(doc);
      } catch (err) {
        if (err?.name !== 'VersionError') throw err;
      }
    }
    throw conflict('The communication changed concurrently; retry the request', 'CONCURRENT_UPDATE');
  }

  async _acquireLock(id) {
    const now = new Date();
    return LeadCommunication.findOneAndUpdate(
      { _id: id, $or: [{ completionLockUntil: null }, { completionLockUntil: { $lte: now } }] },
      { $set: { completionLockUntil: new Date(now.getTime() + LOCK_MS) } },
      { returnDocument: 'after' },
    ).lean();
  }

  async _setStep(id, name, status, error = null, extra = {}) {
    await LeadCommunication.updateOne(
      { _id: id },
      { $set: { [`receipt.steps.${name}`]: { status, error, at: new Date() }, ...extra }, $inc: { __v: 1 } },
    );
  }

  /**
   * Complete an operation: store the outcome, then run each side effect as a
   * recorded receipt step. Idempotent and resumable — a retry only runs steps
   * that are not already ok/skipped. Returns { communication, receipt }.
   */
  async complete(leadId, operationId, body, userId, meta = {}) {
    await this._loadLead(leadId);
    const existing = await this._findOwned(leadId, operationId, userId);
    const outcome = normalizeOutcome(body.outcome);
    const outcomeStored = existing.receipt?.steps?.outcome?.status === 'ok';
    if (outcomeStored && !sameOutcome(existing.outcome, outcome)) {
      throw conflict(
        'This communication was already completed with a different outcome',
        COMM_ERROR_CODES.ALREADY_COMPLETED,
        [{ field: 'outcome', message: 'Outcome differs from the stored outcome' }],
      );
    }

    // Validate confirmed answers before any write (400 on a bad value).
    const answers = outcomeStored ? null : (body.qualification?.answers || []).map((a, i) => normalizeConfirmedAnswer(a, i));

    const locked = await this._acquireLock(existing._id);
    if (!locked) {
      throw conflict('Completion is already in progress for this communication', COMM_ERROR_CODES.COMPLETION_IN_PROGRESS);
    }

    const ran = {};
    try {
      // a. outcome
      if (!outcomeStored) {
        const now = new Date();
        const sms = existing.channel === 'sms' && body.sms ? {
          templateId: body.sms.templateId || null,
          body: body.sms.body ?? '',
          encoding: body.sms.encoding,
          segments: body.sms.segments,
          // A delivery report that reached the CRM before the outcome (offline device) still counts.
          sendStatus: existing.route === 'sms_direct' && body.sms.sendStatus === 'device_sent'
            && existing.events.some((e) => e.type === 'sms_delivered') ? 'device_delivered' : body.sms.sendStatus,
        } : null;
        try {
          await LeadCommunication.updateOne(
            { _id: existing._id, 'receipt.steps.outcome.status': { $ne: 'ok' } },
            {
              $set: {
                outcome,
                sms,
                qualification: answers.length ? { answers } : null,
                state: 'completed',
                completedAt: now,
                'receipt.steps.outcome': { status: 'ok', error: null, at: now },
              },
              $inc: { __v: 1 },
            },
            { runValidators: true },
          );
          ran.outcome = 'ok';
          if (sms) await this._linkFunnel((link) => link.onSmsOutcome(operationId, sms.sendStatus));
        } catch (err) {
          await this._setStep(existing._id, 'outcome', 'failed', String(err.message).slice(0, 500));
          ran.outcome = 'failed';
          logger.warn('Communication outcome step failed', { module: 'crm', action: 'leadCommunication.complete', operationId, error: { message: err.message } });
        }
      }

      const doc = await LeadCommunication.findById(existing._id).lean();
      if (doc.receipt?.steps?.outcome?.status === 'ok') {
        await this._runSideEffects(doc, leadId, userId, meta, ran);
      }

      const final = await LeadCommunication.findById(existing._id).lean();
      const allDone = RECEIPT_STEPS.every((name) => stepDone(final.receipt?.steps?.[name]));
      await LeadCommunication.updateOne(
        { _id: existing._id },
        { $set: { 'receipt.completedAt': allDone ? (final.receipt?.completedAt || new Date()) : null } },
      );
    } finally {
      await LeadCommunication.updateOne({ _id: existing._id }, { $set: { completionLockUntil: null } });
    }

    const finalDoc = await LeadCommunication.findById(existing._id).populate('createdBy', CREATOR_FIELDS).lean();
    const communication = serializeCommunication(finalDoc);

    if (Object.keys(ran).length) {
      auditService.logEvent({
        eventType: 'lead.communication_completed',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: Object.values(communication.receipt.steps).some((s) => s?.status === 'failed') ? 'failure' : 'success',
        details: {
          leadId: String(leadId),
          communicationId: communication.id,
          operationId,
          channel: communication.channel,
          disposition: communication.outcome?.disposition ?? null,
          steps: Object.fromEntries(RECEIPT_STEPS.map((n) => [n, communication.receipt.steps[n]?.status ?? null])),
        },
        module: 'lead',
      });
    }
    return { communication, receipt: communication.receipt };
  }

  async _runSideEffects(doc, leadId, userId, meta, ran) {
    const steps = doc.receipt?.steps || {};
    const run = async (name, fn) => {
      if (stepDone(steps[name])) return;
      try {
        const { status, error = null, extra = {} } = await fn();
        await this._setStep(doc._id, name, status, error, extra);
        ran[name] = status;
      } catch (err) {
        const message = String(err?.code && typeof err.code === 'string' ? `${err.code}: ${err.message}` : err?.message || err).slice(0, 500);
        await this._setStep(doc._id, name, 'failed', message);
        ran[name] = 'failed';
        logger.warn('Communication completion step failed', {
          module: 'crm', action: `leadCommunication.complete.${name}`, communicationId: String(doc._id), error: { message: err?.message },
        });
      }
    };
    const { outcome } = doc;
    const smsStatus = doc.sms?.sendStatus || 'unknown';

    // b. contact log
    await run('contactLog', async () => {
      if (doc.contactLogId) return { status: 'skipped' };
      const isPhone = doc.channel === 'phone';
      const subject = isPhone
        ? `Phone call (mobile) — ${outcome.disposition}`
        : `SMS (mobile) — ${smsStatus}`;
      let note = outcome.notes?.trim();
      if (!note) {
        note = isPhone
          ? `${SUBJECT_ROUTE[doc.route] || 'SIM call'} from the mobile app. Disposition: ${outcome.disposition}. Connected (user-reported): ${outcome.connected}.`
          : `${doc.sms?.body ? `SMS: ${doc.sms.body}\n` : ''}Sent from the mobile SMS composer. Send status (user-reported): ${smsStatus}.`;
      }
      const entry = await contactLogService.create(null, {
        leadId,
        channel: doc.channel,
        subject,
        note: note.slice(0, 5000),
        occurredAt: doc.createdAt,
        followUpAt: outcome.followUpAt || null,
        employeeId: userId,
      }, userId, meta);
      return { status: 'ok', extra: { contactLogId: entry._id } };
    });

    // c. lead contact stamp — an attempt counts as contact, except an SMS the
    // user says was not sent.
    await run('leadContact', async () => {
      if (doc.channel === 'sms' && smsStatus === 'user_reported_not_sent') return { status: 'skipped' };
      const at = doc.createdAt;
      await Lead.updateOne(
        { _id: leadId, $or: [{ lastContactedAt: null }, { lastContactedAt: { $lte: at } }] },
        { $set: { lastContactedAt: at, lastContactChannel: doc.channel } },
      );
      return { status: 'ok' };
    });

    // d. status change — through the lead service so 'lead.updated' is audited.
    await run('statusChange', async () => {
      const target = outcome.statusChange;
      if (!target) return { status: 'skipped' };
      const lead = await Lead.findById(leadId).select('status').lean();
      if (!lead) throw new NotFoundError('Lead', leadId);
      if (lead.status === target) return { status: 'skipped' };
      if (lead.status === LEAD_STATUS.CONVERTED || target === LEAD_STATUS.CONVERTED) {
        return { status: 'failed', error: COMM_ERROR_CODES.LEAD_CONVERTED_PROTECTED };
      }
      await leadService.update(String(leadId), { status: target }, { userId, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
      return { status: 'ok' };
    });

    // e. qualification merge (unknown never overwrites)
    await run('qualification', async () => {
      const answers = (doc.qualification?.answers || []).filter((a) => a.status !== 'unknown');
      if (!answers.length) return { status: 'skipped' };
      await leadQualificationService.mergeAnswers(leadId, answers, { communicationId: doc._id, userId });
      return { status: 'ok' };
    });

    // f. suppression — opting out of contact from the business blocks both
    // calls and SMS to that number.
    await run('suppression', async () => {
      if (!outcome.doNotContact && outcome.disposition !== DNC_DISPOSITION) return { status: 'skipped' };
      const lead = await Lead.findById(leadId).select('_id phone mobile address.country').lean();
      // Recover the dialed number: the stored hash identifies which of the
      // lead's current numbers (if any) is still the one that was contacted.
      let candidates = [];
      for (const field of [doc.destinationField, 'phone', 'mobile']) {
        const dest = lead ? resolveDestination(lead, field) : null;
        if (dest?.valid && dest.candidates.some((e164) => phoneHash(e164) === doc.destinationHash)) {
          candidates = dest.candidates;
          break;
        }
      }
      const { smsSuppressed } = await suppressLeadContact({
        leadId, userId, source: 'mobile_app', e164s: candidates, extraCallHashes: [doc.destinationHash],
      });
      if (!smsSuppressed) {
        return { status: 'failed', error: 'SMS_DESTINATION_UNRESOLVED: the lead number changed; call suppression applied, SMS suppression could not be' };
      }
      return { status: 'ok' };
    });
  }

  /** Company-wide list for a lead, newest first, cursor-paginated. */
  async list(leadId, { limit = 20, cursor } = {}) {
    await this._loadLead(leadId);
    const filter = { leadId: new mongoose.Types.ObjectId(String(leadId)), ...buildCursorQuery(cursor, 'createdAt', 'desc') };
    const docs = await LeadCommunication.find(filter)
      .sort(buildCursorSort('createdAt', 'desc'))
      .limit(limit + 1)
      .select('-completionLockUntil -destinationHash')
      .populate('createdBy', CREATOR_FIELDS)
      .lean();
    const page = buildCursorResponse(docs, limit, 'createdAt');
    return { data: page.data.map(serializeCommunication), pagination: page.pagination };
  }
}

const leadCommunicationService = new LeadCommunicationService();
export default leadCommunicationService;
