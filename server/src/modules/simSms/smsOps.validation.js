import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { RECOVERY_STATUSES, RECOVERY_TYPES } from './recoveryItem.model.js';

const deviceIdSchema = Joi.string().trim().min(8).max(80);
const page = Joi.number().integer().min(1).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const bool = Joi.boolean().allow(null);
const isoDate = Joi.date().iso().allow(null);
const count = Joi.number().integer().min(0).max(100_000).default(0);

export const heartbeat = { body: Joi.object({
  deviceId: deviceIdSchema.required(),
  platform: Joi.string().valid('android', 'ios').default('android'),
  manufacturer: Joi.string().trim().max(80).allow(null, ''),
  model: Joi.string().trim().max(80).allow(null, ''),
  osVersion: Joi.string().trim().max(20).allow(null, ''),
  sdkInt: Joi.number().integer().min(0).max(100).allow(null),
  appVersion: Joi.string().trim().max(30).allow(null, ''),
  buildNumber: Joi.string().trim().max(30).allow(null, ''),
  buildProfile: Joi.string().valid('play', 'shared', 'private', 'development').allow(null),
  permissions: Joi.object({
    smsDeclared: bool, sendSms: bool, receiveSms: bool, readPhoneState: bool, postNotifications: bool, batteryOptimizationIgnored: bool,
  }).default({}),
  simState: Joi.string().valid('ready', 'absent', 'locked', 'not_ready', 'unknown').allow(null),
  sims: Joi.array().max(4).items(Joi.object({
    subscriptionId: Joi.number().integer().allow(null),
    slotIndex: Joi.number().integer().min(-1).max(8).default(-1),
    carrierName: Joi.string().trim().max(80).allow(null, ''),
    displayName: Joi.string().trim().max(80).allow(null, ''),
    countryIso: Joi.string().trim().max(4).allow(null, ''),
    isDefaultSms: Joi.boolean().default(false),
    selected: Joi.boolean().default(false),
    // Masked by the phone; the server masks again (never stores a full number).
    numberMasked: Joi.string().trim().max(24).allow(null, ''),
  })).default([]),
  selectedSubscriptionId: Joi.number().integer().allow(null),
  network: Joi.object({
    type: Joi.string().trim().max(20).allow(null, ''), connected: bool, internetReachable: bool, airplaneMode: bool,
  }).default({}),
  queue: Joi.object({ pending: count, attempting: count, unknown: count, failed: count, inboundPending: count }).default({}),
  last: Joi.object({ sendAt: isoDate, inboundAt: isoDate, leaseAt: isoDate, resultPostAt: isoDate }).default({}),
  lastError: Joi.object({ code: Joi.string().max(80).allow(null, ''), message: Joi.string().max(300).allow(null, ''), at: isoDate }).allow(null).default(null),
  agent: Joi.object({ running: bool, lastCycleAt: isoDate }).default({}),
  // Journal entries the phone still holds (results not yet acknowledged by the CRM).
  journal: Joi.array().max(100).items(Joi.object({
    messageId: Joi.string().trim().max(64).required(),
    status: Joi.string().valid('attempting', 'sent', 'failed', 'unknown').required(),
    finishedAt: isoDate,
  })).default([]),
  resyncCompleted: Joi.boolean().default(false),
  trigger: Joi.string().valid('loop', 'foreground', 'headless', 'manual', 'interval').default('loop'),
}) };

export const deviceParam = { params: Joi.object({ deviceId: deviceIdSchema.required() }) };

export const listReviews = { query: Joi.object({ page, limit, status: Joi.string().valid('pending', 'resolved', 'dismissed').default('pending') }) };
export const reviewId = { params: Joi.object({ id: objectId.required() }) };
export const resolveReview = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    decisions: Joi.array().min(1).max(20).items(Joi.object({
      fieldKey: Joi.string().trim().max(80).required(),
      action: Joi.string().valid('accept', 'edit', 'reject').required(),
      value: Joi.alternatives(Joi.string().max(1000), Joi.number(), Joi.boolean(), Joi.array().items(Joi.string().max(200)).max(20)).allow(null),
    })).required(),
    note: Joi.string().trim().max(500).allow('', null),
  }),
};

export const listRecovery = { query: Joi.object({
  page, limit, type: Joi.string().valid(...RECOVERY_TYPES), status: Joi.string().valid(...RECOVERY_STATUSES).default('open'),
}) };
export const recoveryId = { params: Joi.object({ id: objectId.required() }) };
export const recoveryAction = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    action: Joi.string().valid('mark_sent', 'mark_not_sent', 'resend', 'link_lead', 'retry_other_sim', 'request_resync', 'retry_sync', 'dismiss').required(),
    leadId: objectId.when('action', { is: 'link_lead', then: Joi.required() }),
    subscriptionId: Joi.number().integer().min(0).allow(null),
    note: Joi.string().trim().max(500).allow('', null),
  }),
};
export const bulkDismiss = { body: Joi.object({ ids: Joi.array().items(objectId).min(1).max(200).unique().required(), note: Joi.string().trim().max(500).allow('', null) }) };
