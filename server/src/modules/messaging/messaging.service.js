import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Campaign from './campaign.model.js';
import MessageRecipient from './messageRecipient.model.js';
import ProviderAttempt from './providerAttempt.model.js';
import MessageTemplate from './messageTemplate.model.js';
import Consent from './consent.model.js';
import Suppression from './suppression.model.js';
import ProviderSettings from './providerSettings.model.js';
import DeliveryEvent from './deliveryEvent.model.js';
import FrequencyLedger from './frequencyLedger.model.js';
import IntegrationHealthCheck from '../integrations/integrationHealthCheck.model.js';
import Lead from '../crm/lead.model.js';
import leadRepository from '../crm/lead.repository.js';
import userRepository from '../auth/user.repository.js';
import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { AppError, NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import {
  CHANNELS, OUTBOUND_QUEUE, STATUS_RANK,
  normalizeProviderStatus,
} from './messaging.constants.js';
import { ALLOWED_VARIABLES, extractVariables, leadVariables, renderPersonalized, smsSegments } from './personalization.js';
import textBee from './providers/textbee.provider.js';
import twilio from './providers/twilio.provider.js';
import metaWhatsapp from './providers/metaWhatsApp.provider.js';
import existingEmail from './providers/existingEmail.provider.js';
import { fallbackPolicyAllows, mayFallbackAfterSubmission } from './smsRoutingPolicy.js';
import { verifyUnsubscribeToken } from './unsubscribeToken.js';
import { destinationHash } from './destinationHash.js';
import { buildMessagingReadiness } from './messagingReadiness.js';
import logger from '../../shared/logger/index.js';

const MAX_FILTERED_RECIPIENTS = 5000;
export { destinationHash } from './destinationHash.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quotaPeriods(value = new Date()) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return { dayKey: `${year}-${month}-${day}`, monthKey: `${year}-${month}` };
}

const SENSITIVE_PAYLOAD_KEYS = new Set([
  'accesstoken', 'apikey', 'appsecret', 'authorization', 'authtoken',
  'clientsecret', 'password', 'secret', 'token', 'webhooksecret',
  'signature', 'xhubsignature256', 'xtwiliosignature',
]);

function sanitizePayloadValue(value, depth = 0) {
  if (depth > 10) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}[TRUNCATED]` : value;
  if (Array.isArray(value)) {
    const sanitized = value.slice(0, 200).map((item) => sanitizePayloadValue(item, depth + 1));
    if (value.length > 200) sanitized.push(`[TRUNCATED_${value.length - 200}_ITEMS]`);
    return sanitized;
  }
  if (!value || typeof value !== 'object') return value;
  const result = {};
  const entries = Object.entries(value);
  for (const [key, item] of entries.slice(0, 300)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['__proto__', 'prototype', 'constructor'].includes(key.toLowerCase())) continue;
    result[key] = SENSITIVE_PAYLOAD_KEYS.has(normalizedKey)
      ? '[REDACTED]'
      : sanitizePayloadValue(item, depth + 1);
  }
  if (entries.length > 300) result._truncatedFields = entries.length - 300;
  return result;
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return sanitizePayloadValue(JSON.parse(JSON.stringify(payload)));
}

function destinationFor(lead, channel) {
  if (channel === 'email') {
    const value = String(lead.email || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  }
  const raw = lead.mobile || lead.phone || '';
  const normalized = normalizePhone(raw);
  return normalized.valid ? normalized.e164 : null;
}

function countryAllowed(allowedCountries = [], country) {
  if (!allowedCountries.length) return true;
  return Boolean(country) && allowedCountries.includes(String(country).toUpperCase());
}

function mapFallbacks(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}

const defaultSettings = () => ({
  providers: {
    metaWhatsappEnabled: metaWhatsapp.configured,
    textbeeEnabled: textBee.configured,
    twilioEnabled: twilio.configured,
    twilioWhatsappEnabled: twilio.whatsappConfigured,
    emailEnabled: true,
  },
  smsFallback: { enabled: false, allowedCountries: [], allowedPurposes: ['transactional', 'support'], dailySpendLimit: 0, monthlySpendLimit: 0 },
  whatsappFallback: { enabled: false, allowedCountries: [], allowedPurposes: ['transactional', 'support'], dailySpendLimit: 0, monthlySpendLimit: 0 },
  countryRouting: { textbeeAllowedCountries: [], twilioAllowedCountries: [], whatsappAllowedCountries: [], twilioWhatsappAllowedCountries: [] },
  quotas: { daily: 50, monthly: 300, perCampaign: 1000 },
  quietHours: { enabled: false, start: '20:00', end: '08:00', timezone: 'UTC' },
  frequencyLimits: {
    enabled: false, purposes: ['promotional'],
    email: { minIntervalHours: 0, dailyMax: 0, weeklyMax: 0 },
    sms: { minIntervalHours: 0, dailyMax: 0, weeklyMax: 0 },
    whatsapp: { minIntervalHours: 0, dailyMax: 0, weeklyMax: 0 },
  },
  regionalQuietHours: [],
  pricing: { currency: 'USD', textbeeCarrierPerSegment: 0, twilioDefaultPerSegment: 0, twilioWhatsappDefaultPerMessage: 0, metaMarketingPerMessage: 0, metaUtilityPerMessage: 0, metaServicePerMessage: 0 },
});

async function settings() {
  const stored = await ProviderSettings.findOne({ key: 'global' }).lean();
  const defaults = defaultSettings();
  if (!stored) return defaults;
  return {
    ...stored,
    providers: { ...defaults.providers, ...stored.providers },
    smsFallback: { ...defaults.smsFallback, ...stored.smsFallback },
    whatsappFallback: { ...defaults.whatsappFallback, ...stored.whatsappFallback },
    countryRouting: { ...defaults.countryRouting, ...stored.countryRouting },
    quotas: { ...defaults.quotas, ...stored.quotas },
    quietHours: { ...defaults.quietHours, ...stored.quietHours },
    frequencyLimits: {
      ...defaults.frequencyLimits, ...stored.frequencyLimits,
      email: { ...defaults.frequencyLimits.email, ...stored.frequencyLimits?.email },
      sms: { ...defaults.frequencyLimits.sms, ...stored.frequencyLimits?.sms },
      whatsapp: { ...defaults.frequencyLimits.whatsapp, ...stored.frequencyLimits?.whatsapp },
    },
    regionalQuietHours: stored.regionalQuietHours || [],
    pricing: { ...defaults.pricing, ...stored.pricing },
  };
}

async function resolveLeadIds(selection) {
  if (selection.mode === 'explicit') return [...new Set(selection.leadIds.map(String))];
  const {
    q, search, minRating, maxRating, tags, hasEmail, hasPhone, ...filters
  } = selection.filters || {};
  const term = search ?? q;
  let searchUserIds = [];
  if (term) searchUserIds = await userRepository.findIdsByNameOrEmail(term, 50).catch(() => []);
  const filter = await leadRepository.buildDatasetFilter({ filters, search: term, searchUserIds });
  const extra = {};
  if (minRating != null || maxRating != null) extra['providerMeta.rating'] = { ...(minRating != null ? { $gte: minRating } : {}), ...(maxRating != null ? { $lte: maxRating } : {}) };
  if (tags?.length) extra.tags = { $all: tags };
  if (hasEmail === true) extra.email = { $type: 'string', $nin: ['', null] };
  if (hasEmail === false) extra.$or = [{ email: null }, { email: '' }, { email: { $exists: false } }];
  if (hasPhone === true) extra.$and = [{ $or: [{ mobile: { $type: 'string', $nin: ['', null] } }, { phone: { $type: 'string', $nin: ['', null] } }] }];
  if (hasPhone === false) extra.$and = [{ $and: [{ $or: [{ mobile: null }, { mobile: '' }, { mobile: { $exists: false } }] }, { $or: [{ phone: null }, { phone: '' }, { phone: { $exists: false } }] }] }];
  const docs = await Lead.find({ ...filter, ...extra, isDeleted: false }).sort({ _id: 1 }).limit(MAX_FILTERED_RECIPIENTS + 1).select('_id').lean();
  if (docs.length > MAX_FILTERED_RECIPIENTS) {
    throw new AppError(`Filtered selection exceeds the ${MAX_FILTERED_RECIPIENTS} recipient safety limit`, 413, ERROR_CODES.VALIDATION_ERROR);
  }
  return docs.map((lead) => String(lead._id));
}

async function renderForLead(campaign, lead, template) {
  const fallbacks = mapFallbacks(campaign.content.fallbackValues);
  // Company and sender are campaign-level form values, not lead fallbacks.
  // Keep the existing profile/environment values as safe defaults, while an
  // explicitly entered campaign value takes precedence.
  const vars = leadVariables(lead, {
    companyName: fallbacks.companyName || undefined,
    senderName: fallbacks.senderName || campaign.createdBy?.firstName || '',
  });
  const required = template?.requiredVariables || [];
  const subject = renderPersonalized(campaign.content.subject, vars, { fallbacks, required });
  const bodyText = renderPersonalized(campaign.content.bodyText, vars, { fallbacks, required });
  const bodyHtml = renderPersonalized(campaign.content.bodyHtml, vars, { html: true, fallbacks, required });
  const missing = [...new Set([...subject.missing, ...bodyText.missing, ...bodyHtml.missing])];
  const unresolved = [...new Set([...subject.unresolved, ...bodyText.unresolved, ...bodyHtml.unresolved])];

  let whatsappComponents = campaign.content.whatsappComponents || [];
  if (campaign.channel === 'whatsapp') {
    whatsappComponents = whatsappComponents.map((component) => ({
      ...component,
      parameters: (component.parameters || []).map((param) => {
        if (param.type !== 'text') return param;
        const rendered = renderPersonalized(param.text, vars, { fallbacks, required });
        missing.push(...rendered.missing);
        unresolved.push(...rendered.unresolved);
        return { ...param, text: rendered.value };
      }),
    }));
  }
  return {
    rendered: { subject: subject.value, bodyText: bodyText.value, bodyHtml: bodyHtml.value, whatsappComponents },
    missing: [...new Set(missing)], unresolved: [...new Set(unresolved)],
  };
}

async function eligibilityFor(lead, campaign, template, consentByLeadChannel, suppressions) {
  const reasons = [];
  const destination = destinationFor(lead, campaign.channel);
  if (!destination) {
    const raw = campaign.channel === 'email' ? lead.email : (lead.mobile || lead.phone);
    reasons.push(`${String(raw || '').trim() ? 'invalid' : 'missing'}_${campaign.channel === 'email' ? 'email' : 'phone'}`);
  }
  const hash = destination ? destinationHash(campaign.channel, destination) : destinationHash(campaign.channel, `missing:${lead._id}`);
  if (suppressions.has(hash)) reasons.push('suppressed');
  const consent = consentByLeadChannel.get(`${lead._id}:${campaign.channel}`);
  if (consent?.status === 'denied' || consent?.status === 'revoked') reasons.push('opted_out');
  if ((campaign.purpose === 'promotional' || campaign.channel === 'whatsapp') && consent?.status !== 'granted') reasons.push('consent_required');
  if (consent?.expiresAt && new Date(consent.expiresAt) <= new Date()) reasons.push('consent_expired');
  const personalization = await renderForLead(campaign, lead, template);
  if (personalization.missing.length) reasons.push(`missing_variables:${personalization.missing.join(',')}`);
  if (personalization.unresolved.length) reasons.push(`unresolved_variables:${personalization.unresolved.join(',')}`);
  if (campaign.channel === 'whatsapp' && (!campaign.content.whatsappTemplateName || !campaign.content.whatsappLanguage)) reasons.push('approved_template_required');
  if (campaign.channel === 'whatsapp' && (template?.whatsapp?.approvalStatus !== 'approved' || !template?.whatsapp?.providerDefinition)) reasons.push('template_not_approved');
  return { destination, hash, reasons: [...new Set(reasons)], rendered: personalization.rendered };
}

async function refreshCampaignSummary(campaignId) {
  const objectId = new mongoose.Types.ObjectId(campaignId);
  const [rows, reasonRows, campaign] = await Promise.all([
    MessageRecipient.aggregate([
      { $match: { campaignId: objectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    MessageRecipient.aggregate([
      { $match: { campaignId: objectId } },
      { $unwind: '$eligibility.reasons' },
      { $group: { _id: '$eligibility.reasons', count: { $sum: 1 } } },
    ]),
    Campaign.findById(campaignId).select('status').lean(),
  ]);
  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const reasons = Object.fromEntries(reasonRows.map((row) => [row._id, row.count]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const summary = {
    total,
    eligible: total - (counts.ineligible || 0) - (counts.suppressed || 0),
    ineligible: counts.ineligible || 0,
    draft: counts.draft || 0,
    queued: counts.queued || 0,
    submitting: counts.submitting || 0,
    accepted: counts.accepted || 0,
    sent: counts.sent || 0,
    delivered: counts.delivered || 0,
    read: counts.read || 0,
    failed: (counts.failed || 0) + (counts.undelivered || 0),
    undelivered: counts.undelivered || 0,
    unknown: counts.unknown || 0,
    cancelled: counts.cancelled || 0,
    suppressed: counts.suppressed || 0,
    missingContact: (reasons.missing_email || 0) + (reasons.missing_phone || 0),
    invalidContact: (reasons.invalid_email || 0) + (reasons.invalid_phone || 0),
    duplicate: reasons.duplicate_destination || 0,
    optedOut: reasons.opted_out || 0,
  };
  const pending = (counts.draft || 0) + (counts.queued || 0) + (counts.submitting || 0);
  const update = { summary };
  // A summary refresh must never turn a draft, paused, cancelled, or failed
  // campaign into a completed campaign. Completion means active dispatch work
  // crossed the internal queue boundary; it is not inferred from an empty or
  // entirely ineligible draft.
  if (pending === 0 && total > 0 && ['queued', 'running'].includes(campaign?.status)) {
    update.status = 'completed';
    update.completedAt = new Date();
  }
  await Campaign.updateOne({ _id: campaignId }, { $set: update });
  return summary;
}

export function buildCampaignMonitoring(campaign, now = new Date()) {
  const summary = campaign?.summary || {};
  const total = Number(summary.total || 0);
  const eligible = Number(summary.eligible || 0);
  const draft = Number(summary.draft || 0);
  const queued = Number(summary.queued || 0);
  const submitting = Number(summary.submitting || 0);
  const pending = draft + queued + submitting;
  const processed = Math.max(0, eligible - pending);
  const percent = eligible ? Math.min(100, Math.round((processed / eligible) * 1000) / 10) : 0;
  const startedAt = campaign?.startedAt ? new Date(campaign.startedAt) : null;
  const elapsedMinutes = startedAt && startedAt < now ? Math.max((now - startedAt) / 60000, 1 / 60) : 0;
  const processedPerMinute = elapsedMinutes && processed ? Math.round((processed / elapsedMinutes) * 10) / 10 : null;
  const estimatedSecondsRemaining = processedPerMinute && pending
    ? Math.ceil((pending / processedPerMinute) * 60)
    : null;
  const scheduledAt = campaign?.scheduledAt ? new Date(campaign.scheduledAt) : null;
  let scheduleState = 'not_scheduled';
  if (campaign?.status === 'paused') scheduleState = 'paused';
  else if (campaign?.status === 'cancelled') scheduleState = 'cancelled';
  else if (campaign?.status === 'completed') scheduleState = 'completed';
  else if (scheduledAt && scheduledAt > now) scheduleState = 'scheduled';
  else if (campaign?.status === 'scheduled' && scheduledAt) scheduleState = 'overdue';
  else if (['queued', 'running'].includes(campaign?.status)) scheduleState = 'processing';

  return {
    progress: { eligible, processed, pending, queued, inFlight: submitting, percent },
    schedule: {
      state: scheduleState,
      scheduledAt: scheduledAt?.toISOString() || null,
      timezone: campaign?.timezone || 'UTC',
      dueInSeconds: scheduledAt && scheduledAt > now ? Math.ceil((scheduledAt - now) / 1000) : null,
    },
    throughput: { processedPerMinute, estimatedSecondsRemaining },
    largeAudience: total >= 1000,
    refreshedAt: now.toISOString(),
  };
}

class MessagingService {
  async createCampaign(input, actor, meta = {}) {
    const leadIds = await resolveLeadIds(input.selection);
    if (!leadIds.length) throw new ValidationError('No leads match the selected recipients');
    const providerSettings = await settings();
    if (leadIds.length > providerSettings.quotas.perCampaign) {
      throw new AppError(`Campaign exceeds the configured limit of ${providerSettings.quotas.perCampaign}`, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED);
    }
    const template = input.templateId ? await MessageTemplate.findOne({
      _id: input.templateId, isArchived: false,
      $or: [{ createdBy: actor }, { isShared: true }],
    }).lean() : null;
    if (input.templateId && !template) throw new NotFoundError('MessageTemplate', input.templateId);
    if (template && template.channel !== input.channel) throw new ValidationError('Template channel does not match campaign channel');
    const templateContent = template ? {
      subject: template.subject, bodyHtml: template.bodyHtml, bodyText: template.bodyText,
      fallbackValues: mapFallbacks(template.fallbackValues),
      whatsappTemplateName: template.whatsapp?.metaName,
      whatsappLanguage: template.whatsapp?.language,
      whatsappComponents: template.whatsapp?.components,
      whatsappTwilioContentSid: template.whatsapp?.twilioContentSid,
    } : {};
    const content = { ...templateContent, ...input.content };
    const variables = extractVariables(content.subject, content.bodyHtml, content.bodyText, JSON.stringify(content.whatsappComponents || []));
    const invalidVariables = variables.filter((key) => !ALLOWED_VARIABLES.includes(key));
    if (invalidVariables.length) throw new ValidationError(`Unsupported personalization variables: ${invalidVariables.join(', ')}`);

    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .populate('assignedTo', 'firstName lastName').lean();
    if (leads.length !== leadIds.length) throw new ValidationError('One or more selected leads are unavailable');

    const campaign = await Campaign.create({
      name: input.name, description: input.description || '', channel: input.channel,
      purpose: input.purpose || template?.purpose || 'promotional', templateId: template?._id || null,
      content, routing: input.routing || {},
      selection: { ...input.selection, leadIds, selectedAt: new Date() },
      status: 'draft', timezone: input.timezone || 'UTC', scheduledAt: input.scheduledAt || null,
      isTest: Boolean(input.isTest),
      createdBy: actor, updatedBy: actor,
    });
    await campaign.populate('createdBy', 'firstName lastName');

    const consents = await Consent.find({ leadId: { $in: leadIds }, channel: input.channel }).lean();
    const consentMap = new Map(consents.map((item) => [`${item.leadId}:${item.channel}`, item]));
    const candidateHashes = leads.map((lead) => {
      const destination = destinationFor(lead, input.channel);
      return destination ? destinationHash(input.channel, destination) : null;
    }).filter(Boolean);
    const suppressionDocs = await Suppression.find({ channel: input.channel, destinationHash: { $in: candidateHashes } }).lean();
    const suppressionSet = new Set(suppressionDocs.map((item) => item.destinationHash));
    const frequencyPolicy = this._frequencyPolicy(providerSettings, campaign.channel, campaign.purpose);
    const frequencyStats = await this._frequencyStats(campaign.channel, candidateHashes, frequencyPolicy);

    const recipientDocs = [];
    const seenDestinations = new Set();
    for (const lead of leads) {
      const result = await eligibilityFor(lead, campaign, template, consentMap, suppressionSet);
      const frequencyReason = this._frequencyViolation(frequencyPolicy, frequencyStats.get(result.hash));
      if (frequencyReason) result.reasons.push(frequencyReason);
      if (result.destination && seenDestinations.has(result.hash)) result.reasons.push('duplicate_destination');
      if (result.destination) seenDestinations.add(result.hash);
      const isSuppressed = result.reasons.includes('suppressed') || result.reasons.includes('opted_out');
      recipientDocs.push({
        campaignId: campaign._id, leadId: lead._id, channel: campaign.channel,
        destination: result.destination || `missing:${lead._id}`,
        destinationHash: result.hash,
        country: lead.address?.country || null,
        status: result.reasons.length ? (isSuppressed ? 'suppressed' : 'ineligible') : 'draft',
        eligibility: { eligible: result.reasons.length === 0, reasons: result.reasons },
        rendered: result.rendered, createdBy: actor,
        estimatedCost: this._estimatedCost(campaign, result.rendered, providerSettings),
      });
    }
    await MessageRecipient.insertMany(recipientDocs, { ordered: false });
    await refreshCampaignSummary(campaign._id);
    auditService.logEvent({
      eventType: 'messaging.campaign.created', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'messaging',
      details: { campaignId: campaign._id, channel: campaign.channel, selected: leadIds.length },
    });
    return this.getCampaign(campaign._id, actor);
  }

  async getCampaign(id, actor) {
    const campaign = await Campaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('MessageCampaign', id);
    return { ...campaign, monitoring: buildCampaignMonitoring(campaign) };
  }

  async listCampaigns(actor, { page = 1, limit = 25, status, channel, q } = {}) {
    const filter = { createdBy: actor };
    if (status) filter.status = status;
    if (channel) filter.channel = channel;
    if (q?.trim()) {
      const term = new RegExp(escapeRegex(q.trim()), 'i');
      filter.$or = [{ name: term }, { description: term }];
    }
    const [data, total] = await Promise.all([
      Campaign.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Campaign.countDocuments(filter),
    ]);
    return {
      data: data.map((campaign) => ({ ...campaign, monitoring: buildCampaignMonitoring(campaign) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async listRecipients(campaignId, actor, { page = 1, limit = 50, status } = {}) {
    await this.getCampaign(campaignId, actor);
    const filter = { campaignId };
    if (status) filter.status = status;
    const [data, total] = await Promise.all([
      MessageRecipient.find(filter).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'leadNumber name email phone mobile address').lean(),
      MessageRecipient.countDocuments(filter),
    ]);
    const recipientIds = data.map((recipient) => recipient._id);
    const latestAttempts = recipientIds.length ? await ProviderAttempt.aggregate([
      { $match: { recipientId: { $in: recipientIds } } },
      { $sort: { recipientId: 1, attemptNumber: -1 } },
      { $group: { _id: '$recipientId', latest: { $first: '$$ROOT' } } },
    ]) : [];
    const attemptsByRecipient = new Map(latestAttempts.map((row) => [String(row._id), row.latest]));
    return {
      data: data.map((recipient) => ({ ...recipient, latestAttempt: attemptsByRecipient.get(String(recipient._id)) || null })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async removeDraftRecipient(campaignId, recipientId, actor, meta = {}) {
    const campaign = await Campaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', campaignId);
    if (campaign.status !== 'draft') throw new ConflictError('Recipients can only be removed from a draft campaign');
    const recipient = await MessageRecipient.findOneAndDelete({
      _id: recipientId,
      campaignId,
      status: { $in: ['draft', 'ineligible', 'suppressed'] },
    });
    if (!recipient) throw new ConflictError('Recipient is not removable from this draft');
    await Campaign.updateOne(
      { _id: campaignId, createdBy: actor },
      { $pull: { 'selection.leadIds': recipient.leadId }, $set: { updatedBy: actor } },
    );
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({
      eventType: 'messaging.campaign.recipient_removed', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'messaging',
      details: { campaignId, recipientId, leadId: recipient.leadId },
    });
    return this.getCampaign(campaignId, actor);
  }

  async verifyCampaignRecipientConsent(campaignId, input, actor, meta = {}) {
    if (input.confirmation !== true || String(input.evidence || '').trim().length < 10) {
      throw new ValidationError('Explicit confirmation and verifiable evidence are required');
    }
    const campaign = await Campaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', campaignId);
    if (campaign.status !== 'draft') throw new ConflictError('Consent can only be verified from a draft campaign');

    const recipientIds = [...new Set(input.recipientIds.map(String))];
    const recipients = await MessageRecipient.find({
      _id: { $in: recipientIds }, campaignId,
      status: 'ineligible', 'eligibility.reasons': 'consent_required',
    }).lean();
    if (recipients.length !== recipientIds.length) {
      throw new ValidationError('Every selected recipient must belong to this draft and require consent verification');
    }

    const leadIds = recipients.map((item) => item.leadId);
    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .populate('assignedTo', 'firstName lastName').lean();
    if (leads.length !== leadIds.length) throw new ValidationError('One or more selected leads are unavailable');
    const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));
    const destinations = leads.map((lead) => destinationFor(lead, campaign.channel));
    if (destinations.some((value) => !value)) throw new ValidationError(`One or more selected leads have no valid ${campaign.channel} destination`);
    const hashes = destinations.map((value) => destinationHash(campaign.channel, value));
    const suppressions = await Suppression.find({ channel: campaign.channel, destinationHash: { $in: hashes } }).lean();
    if (suppressions.length) {
      throw new ConflictError('A selected destination is suppressed. Verify renewed opt-in through the administrator reinstatement workflow first.');
    }

    const capturedAt = new Date(input.capturedAt);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    await Consent.bulkWrite(leads.map((lead) => ({
      updateOne: {
        filter: { leadId: lead._id, channel: campaign.channel },
        update: { $set: {
          status: 'granted', evidence: input.evidence, source: input.source || 'manual_admin_verification',
          capturedAt, expiresAt, changedBy: actor,
        } },
        upsert: true,
      },
    })), { ordered: true });

    const template = campaign.templateId ? await MessageTemplate.findById(campaign.templateId).lean() : null;
    const consentMap = new Map(leads.map((lead) => [`${lead._id}:${campaign.channel}`, {
      leadId: lead._id, channel: campaign.channel, status: 'granted', capturedAt, expiresAt,
    }]));
    const suppressionSet = new Set();
    const providerSettings = await settings();
    const frequencyPolicy = this._frequencyPolicy(providerSettings, campaign.channel, campaign.purpose);
    const frequencyStats = await this._frequencyStats(campaign.channel, hashes, frequencyPolicy);
    const writes = [];
    for (const recipient of recipients) {
      const lead = leadById.get(String(recipient.leadId));
      const result = await eligibilityFor(lead, campaign, template, consentMap, suppressionSet);
      const frequencyReason = this._frequencyViolation(frequencyPolicy, frequencyStats.get(result.hash));
      if (frequencyReason) result.reasons.push(frequencyReason);
      if (recipient.eligibility?.reasons?.includes('duplicate_destination')) result.reasons.push('duplicate_destination');
      const reasons = [...new Set(result.reasons)];
      const blocked = reasons.includes('suppressed') || reasons.includes('opted_out');
      writes.push({
        updateOne: {
          filter: { _id: recipient._id, campaignId, status: 'ineligible' },
          update: { $set: {
            destination: result.destination || recipient.destination,
            destinationHash: result.hash,
            status: reasons.length ? (blocked ? 'suppressed' : 'ineligible') : 'draft',
            eligibility: { eligible: reasons.length === 0, reasons },
            rendered: result.rendered,
          } },
        },
      });
    }
    if (writes.length) await MessageRecipient.bulkWrite(writes, { ordered: true });
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({
      eventType: 'messaging.campaign.consent_bulk_verified', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'messaging',
      details: {
        campaignId, channel: campaign.channel, recipientCount: recipients.length,
        leadIds: leadIds.map(String), evidenceRecorded: true, source: input.source || 'manual_admin_verification',
      },
    });
    return { campaign: await this.getCampaign(campaignId, actor), verified: recipients.length };
  }

  _estimatedCost(campaign, rendered, providerSettings) {
    const pricing = providerSettings.pricing || {};
    let amount = null;
    if (campaign.channel === 'sms') {
      const segments = smsSegments(rendered.bodyText || '').segments;
      const rate = campaign.routing?.smsProvider === 'twilio' ? pricing.twilioDefaultPerSegment : pricing.textbeeCarrierPerSegment;
      if (Number(rate) > 0) amount = segments * Number(rate);
    } else if (campaign.channel === 'whatsapp') {
      const rate = campaign.purpose === 'promotional'
        ? pricing.metaMarketingPerMessage
        : campaign.purpose === 'transactional' ? pricing.metaUtilityPerMessage : pricing.metaServicePerMessage;
      if (Number(rate) > 0) amount = Number(rate);
    }
    return { amount, currency: amount == null ? null : (pricing.currency || 'USD') };
  }

  async _eligibleRecipientsBeforeQueue(campaign) {
    const candidates = await MessageRecipient.find({
      campaignId: campaign._id, status: 'draft', 'eligibility.eligible': true,
    }).select('_id leadId channel destinationHash').lean();
    if (!candidates.length) return [];
    const leadIds = candidates.map((item) => item.leadId);
    const hashes = candidates.map((item) => item.destinationHash);
    const [consents, suppressions, providerSettings] = await Promise.all([
      Consent.find({ leadId: { $in: leadIds }, channel: campaign.channel }).lean(),
      Suppression.find({ channel: campaign.channel, destinationHash: { $in: hashes } }).lean(),
      settings(),
    ]);
    const consentMap = new Map(consents.map((item) => [String(item.leadId), item]));
    const suppressionSet = new Set(suppressions.map((item) => item.destinationHash));
    const policy = this._frequencyPolicy(providerSettings, campaign.channel, campaign.purpose);
    const stats = await this._frequencyStats(campaign.channel, hashes, policy);
    const now = new Date();
    const eligible = [];
    const writes = [];
    for (const item of candidates) {
      const reasons = [];
      const consent = consentMap.get(String(item.leadId));
      if (suppressionSet.has(item.destinationHash)) reasons.push('suppressed');
      if (consent?.status === 'denied' || consent?.status === 'revoked') reasons.push('opted_out');
      if ((campaign.purpose === 'promotional' || campaign.channel === 'whatsapp') && consent?.status !== 'granted') reasons.push('consent_required');
      if (consent?.expiresAt && new Date(consent.expiresAt) <= now) reasons.push('consent_expired');
      const frequencyReason = this._frequencyViolation(policy, stats.get(item.destinationHash), now);
      if (frequencyReason) reasons.push(frequencyReason);
      if (!reasons.length) {
        eligible.push(item);
        continue;
      }
      const suppressed = reasons.includes('suppressed') || reasons.includes('opted_out');
      writes.push({
        updateOne: {
          filter: { _id: item._id, status: 'draft' },
          update: {
            $set: {
              status: suppressed ? 'suppressed' : 'ineligible',
              'eligibility.eligible': false,
              'eligibility.reasons': reasons,
            },
          },
        },
      });
    }
    if (writes.length) await MessageRecipient.bulkWrite(writes, { ordered: false });
    return eligible;
  }

  async startCampaign(id, actor, { scheduledAt = null } = {}, meta = {}) {
    const campaign = await Campaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', id);
    if (!['draft', 'paused'].includes(campaign.status)) throw new ConflictError('Only draft or paused campaigns can be started');
    const eligible = await this._eligibleRecipientsBeforeQueue(campaign);
    if (!eligible.length) throw new ConflictError('Campaign has no eligible recipients');
    const runAt = scheduledAt ? new Date(scheduledAt) : campaign.scheduledAt;
    const delay = runAt && runAt > new Date() ? runAt.getTime() - Date.now() : 0;
    campaign.status = delay ? 'scheduled' : 'queued';
    campaign.scheduledAt = runAt || null;
    campaign.pausedAt = null;
    campaign.completedAt = null;
    campaign.updatedBy = actor;
    await campaign.save();
    await MessageRecipient.updateMany({ _id: { $in: eligible.map((item) => item._id) }, status: 'draft' }, { $set: { status: 'queued' } });
    for (const recipient of eligible) {
      await queueManager.addJob(OUTBOUND_QUEUE, `message-${recipient._id}`, { recipientId: String(recipient._id) }, {
        // A paused delayed job may still exist in Redis. A unique execution id
        // lets resume enqueue immediately; the recipient status claim remains
        // the duplicate-prevention boundary when stale jobs eventually wake.
        jobId: `message-${recipient._id}-${Date.now()}`, delay, attempts: 1,
      });
    }
    await refreshCampaignSummary(id);
    auditService.logEvent({ eventType: 'messaging.campaign.started', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { campaignId: id, recipients: eligible.length, scheduledAt: runAt } });
    return this.getCampaign(id, actor);
  }

  async pauseCampaign(id, actor, meta = {}) {
    const campaign = await Campaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', id);
    if (!['scheduled', 'queued', 'running'].includes(campaign.status)) {
      throw new ConflictError('Only a scheduled, queued, or running campaign can be paused');
    }
    campaign.status = 'paused';
    campaign.pausedAt = new Date();
    campaign.updatedBy = actor;
    await campaign.save();
    // A provider submission already in progress cannot be recalled. Only work
    // that has not crossed the submission boundary is returned to draft.
    await MessageRecipient.updateMany(
      { campaignId: id, status: 'queued' },
      { $set: { status: 'draft' } },
    );
    await refreshCampaignSummary(id);
    auditService.logEvent({ eventType: 'messaging.campaign.paused', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { campaignId: id } });
    return this.getCampaign(id, actor);
  }

  async cancelCampaign(id, actor, meta = {}) {
    const campaign = await Campaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', id);
    if (['completed', 'cancelled'].includes(campaign.status)) throw new ConflictError('Campaign cannot be cancelled');
    campaign.status = 'cancelled';
    campaign.cancelledAt = new Date();
    campaign.updatedBy = actor;
    await campaign.save();
    await MessageRecipient.updateMany({ campaignId: id, status: { $in: ['draft', 'queued'] } }, { $set: { status: 'cancelled' } });
    await refreshCampaignSummary(id);
    auditService.logEvent({ eventType: 'messaging.campaign.cancelled', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { campaignId: id } });
    return this.getCampaign(id, actor);
  }

  async _classifyRetryCandidates(campaignId, { status, recipientIds } = {}) {
    const filter = {
      campaignId,
      status: status || { $in: ['failed', 'undelivered'] },
      ...(recipientIds ? { _id: { $in: recipientIds } } : {}),
    };
    const candidates = await MessageRecipient.find(filter).select('_id status error.code').lean();
    const ids = candidates.map((item) => item._id);
    const attempts = ids.length ? await ProviderAttempt.aggregate([
      { $match: { recipientId: { $in: ids } } },
      { $sort: { recipientId: 1, attemptNumber: -1 } },
      { $group: { _id: '$recipientId', latest: { $first: '$$ROOT' } } },
    ]) : [];
    const latestByRecipient = new Map(attempts.map((row) => [String(row._id), row.latest]));
    const retryableIds = [];
    const blocked = { ambiguous: 0, permanent: 0 };

    for (const candidate of candidates) {
      const latest = latestByRecipient.get(String(candidate._id));
      const explicitlyReconciled = candidate.error?.code === 'RECONCILED_NOT_ACCEPTED';
      if (latest?.outcome === 'ambiguous' && !explicitlyReconciled) blocked.ambiguous += 1;
      else if (latest?.failureClass === 'permanent' && !explicitlyReconciled) blocked.permanent += 1;
      else retryableIds.push(candidate._id);
    }
    const statusByRecipient = new Map(candidates.map((item) => [String(item._id), item.status]));
    return { candidates: candidates.length, retryableIds, statusByRecipient, blocked };
  }

  async retryEligibility(campaignId, actor, { status } = {}) {
    await this.getCampaign(campaignId, actor);
    const result = await this._classifyRetryCandidates(campaignId, { status });
    return {
      status: status || 'all',
      candidates: result.candidates,
      retryable: result.retryableIds.length,
      blocked: result.blocked,
      generatedAt: new Date().toISOString(),
    };
  }

  async retryEligibleRecipients(campaignId, input, actor, meta = {}) {
    const campaign = await Campaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', campaignId);
    if (campaign.status === 'cancelled') throw new ConflictError('A cancelled campaign cannot be retried');
    if (input.confirmation !== true) throw new ValidationError('Bulk retry requires explicit confirmation');

    const classification = await this._classifyRetryCandidates(campaignId, { status: input.status });
    const retryableCount = classification.retryableIds.length;
    if (retryableCount !== input.expectedCount) {
      throw new ConflictError(`Retry eligibility changed from ${input.expectedCount} to ${retryableCount}; review and confirm again`);
    }
    if (!retryableCount) throw new ConflictError('No safely retryable recipients remain');

    const operationId = crypto.randomUUID();
    const claims = await MessageRecipient.bulkWrite(classification.retryableIds.map((recipientId) => {
      const previousStatus = classification.statusByRecipient.get(String(recipientId));
      return {
        updateOne: {
          filter: { _id: recipientId, campaignId, status: previousStatus },
          update: {
            $set: {
              status: 'queued', retryOperationId: operationId, retryPreviousStatus: previousStatus,
              failedAt: null, submissionStartedAt: null,
              provider: null, providerMessageId: null, fallbackFrom: null, fallbackReason: null,
              error: { code: null, message: null },
            },
          },
        },
      };
    }), { ordered: false });
    if (claims.modifiedCount !== retryableCount) {
      await MessageRecipient.bulkWrite(classification.retryableIds.map((recipientId) => ({
        updateOne: {
          filter: { _id: recipientId, campaignId, retryOperationId: operationId, status: 'queued' },
          update: {
            $set: {
              status: classification.statusByRecipient.get(String(recipientId)),
              retryOperationId: null, retryPreviousStatus: null,
            },
          },
        },
      })), { ordered: false });
      throw new ConflictError('Recipient outcomes changed while the retry was being queued; refresh and confirm again');
    }

    campaign.status = 'queued';
    campaign.completedAt = null;
    campaign.pausedAt = null;
    campaign.updatedBy = actor;
    await campaign.save();
    try {
      await queueManager.addJobs(OUTBOUND_QUEUE, classification.retryableIds.map((recipientId) => ({
        name: `bulk-retry-${recipientId}`,
        data: { recipientId: String(recipientId) },
        options: { jobId: `message-bulk-retry-${operationId}-${recipientId}`, attempts: 1 },
      })));
    } catch (error) {
      // If Redis rejects the batch, make every claimed recipient terminal again.
      // Even if a provider job somehow exists, its queued-status claim will fail,
      // so the recovery is duplicate-safe.
      await MessageRecipient.updateMany(
        { _id: { $in: classification.retryableIds }, campaignId, status: 'queued', retryOperationId: operationId },
        {
          $set: {
            status: 'failed', failedAt: new Date(), retryOperationId: null, retryPreviousStatus: null,
            error: { code: 'RETRY_QUEUE_FAILED', message: 'Retry could not be queued' },
          },
        },
      );
      await refreshCampaignSummary(campaignId);
      throw error;
    }
    await MessageRecipient.updateMany(
      { _id: { $in: classification.retryableIds }, campaignId, retryOperationId: operationId },
      { $set: { retryOperationId: null, retryPreviousStatus: null } },
    );
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({
      eventType: 'messaging.campaign.bulk_retried', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'messaging',
      details: {
        campaignId, operationId, queued: retryableCount, status: input.status || 'all',
        blockedAmbiguous: classification.blocked.ambiguous,
        blockedPermanent: classification.blocked.permanent,
      },
    });
    return {
      campaign: await this.getCampaign(campaignId, actor),
      operationId,
      queued: retryableCount,
      blocked: classification.blocked,
    };
  }

  async retryRecipients(campaignId, recipientIds, actor, meta = {}) {
    const campaign = await Campaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('MessageCampaign', campaignId);
    if (campaign.status === 'cancelled') throw new ConflictError('A cancelled campaign cannot be retried');
    const recipients = await MessageRecipient.find({
      _id: { $in: recipientIds }, campaignId,
      status: { $in: ['failed', 'undelivered'] },
    });
    if (recipients.length !== recipientIds.length) {
      throw new ConflictError('Only definitive failed or undelivered recipients can be retried');
    }
    for (const recipient of recipients) {
      const latest = await ProviderAttempt.findOne({ recipientId: recipient._id }).sort({ attemptNumber: -1 }).lean();
      const explicitlyReconciled = recipient.error?.code === 'RECONCILED_NOT_ACCEPTED';
      if (latest?.outcome === 'ambiguous' && !explicitlyReconciled) {
        throw new ConflictError('An ambiguous provider submission must be reconciled before retry');
      }
      if (latest?.failureClass === 'permanent' && !explicitlyReconciled) {
        throw new ConflictError('A permanent provider rejection is not eligible for retry');
      }
    }
    await MessageRecipient.updateMany(
      { _id: { $in: recipients.map((item) => item._id) } },
      {
        $set: {
          status: 'queued', failedAt: null, submissionStartedAt: null,
          provider: null, providerMessageId: null, fallbackFrom: null, fallbackReason: null,
          error: { code: null, message: null },
        },
      },
    );
    campaign.status = 'queued';
    campaign.completedAt = null;
    campaign.pausedAt = null;
    campaign.updatedBy = actor;
    await campaign.save();
    for (const recipient of recipients) {
      await queueManager.addJob(OUTBOUND_QUEUE, `retry-${recipient._id}`, { recipientId: String(recipient._id) }, {
        jobId: `message-retry-${recipient._id}-${Date.now()}`, attempts: 1,
      });
    }
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({ eventType: 'messaging.campaign.retried', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { campaignId, recipientIds } });
    return this.getCampaign(campaignId, actor);
  }

  async reconcileRecipient(campaignId, recipientId, input, actor, meta = {}) {
    await this.getCampaign(campaignId, actor);
    const recipient = await MessageRecipient.findOne({ _id: recipientId, campaignId, status: 'unknown' });
    if (!recipient) throw new ConflictError('Only an unknown recipient outcome can be reconciled');
    const occurredAt = new Date();
    const eventKey = `internal:reconciliation:${recipient._id}:${crypto.randomUUID()}`;
    const accepted = input.decision === 'confirm_accepted';
    if (accepted) {
      const collision = await MessageRecipient.findOne({
        _id: { $ne: recipient._id }, provider: recipient.provider, providerMessageId: input.providerMessageId,
      }).select('_id').lean();
      if (collision) throw new ConflictError('Provider message ID is already associated with another recipient');
      recipient.status = 'accepted';
      recipient.providerMessageId = input.providerMessageId;
      recipient.acceptedAt = occurredAt;
      recipient.error = { code: null, message: null };
    } else {
      recipient.status = 'failed';
      recipient.failedAt = occurredAt;
      recipient.error = { code: 'RECONCILED_NOT_ACCEPTED', message: input.note };
    }
    recipient.lastEventAt = occurredAt;
    await recipient.save();
    if (accepted) {
      await this._consumeQuotaReservation(recipient);
      await this._consumeFrequencyReservation(recipient);
    } else {
      await this._releaseQuotaReservation(recipient);
      await this._releaseFrequencyReservation(recipient);
    }
    await DeliveryEvent.create({
      eventKey, provider: recipient.provider, providerMessageId: input.providerMessageId || `unknown:${recipient._id}`,
      recipientId: recipient._id, leadId: recipient.leadId, campaignId: recipient.campaignId,
      createdBy: actor, channel: recipient.channel, direction: 'internal', eventType: input.decision,
      normalizedStatus: recipient.status, occurredAt, payload: { note: input.note, decision: input.decision, actor: String(actor) },
    });
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({ eventType: 'messaging.recipient.reconciled', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { campaignId, recipientId, decision: input.decision } });
    return recipient.toObject();
  }

  async testSend(input, actor, meta = {}) {
    if (input.authorizedRecipient !== true) throw new ValidationError('The test recipient must be explicitly authorized');
    const campaign = await this.createCampaign({
      name: `[TEST] ${input.channel} ${new Date().toISOString()}`,
      description: 'Authorized provider test send', channel: input.channel, purpose: input.purpose,
      templateId: input.templateId || null, content: input.content,
      selection: { mode: 'explicit', leadIds: [input.leadId] }, routing: input.routing || {},
      timezone: 'UTC', scheduledAt: null, isTest: true,
    }, actor, meta);
    return this.startCampaign(campaign._id, actor, {}, meta);
  }

  _frequencyPolicy(providerSettings, channel, purpose) {
    const limits = providerSettings.frequencyLimits;
    if (!limits?.enabled || !limits.purposes?.includes(purpose)) return null;
    const rule = limits[channel];
    if (!rule) return null;
    const policy = {
      minIntervalHours: Number(rule.minIntervalHours || 0),
      dailyMax: Number(rule.dailyMax || 0),
      weeklyMax: Number(rule.weeklyMax || 0),
    };
    return Object.values(policy).some((value) => value > 0) ? policy : null;
  }

  _frequencyHorizonHours(policy) {
    return Math.max(
      policy.minIntervalHours,
      policy.dailyMax > 0 ? 24 : 0,
      policy.weeklyMax > 0 ? 168 : 0,
    );
  }

  _frequencyViolation(policy, stats, now = new Date()) {
    if (!policy) return null;
    const latest = stats?.latest ? new Date(stats.latest) : null;
    if (policy.minIntervalHours > 0 && latest && latest > new Date(now.getTime() - policy.minIntervalHours * 3_600_000)) {
      return 'frequency_min_interval';
    }
    if (policy.dailyMax > 0 && Number(stats?.daily || 0) >= policy.dailyMax) return 'frequency_daily_limit';
    if (policy.weeklyMax > 0 && Number(stats?.weekly || 0) >= policy.weeklyMax) return 'frequency_weekly_limit';
    return null;
  }

  async _frequencyStats(channel, destinationHashes, policy, now = new Date()) {
    if (!policy || !destinationHashes.length) return new Map();
    const dayStart = new Date(now.getTime() - 24 * 3_600_000);
    const weekStart = new Date(now.getTime() - 168 * 3_600_000);
    const horizonStart = new Date(now.getTime() - this._frequencyHorizonHours(policy) * 3_600_000);
    const rows = await MessageRecipient.aggregate([
      {
        $match: {
          channel, destinationHash: { $in: [...new Set(destinationHashes)] },
          status: { $in: ['accepted', 'sent', 'delivered', 'read', 'unknown'] },
        },
      },
      { $set: { evidenceAt: { $ifNull: ['$acceptedAt', { $ifNull: ['$submissionStartedAt', '$updatedAt'] }] } } },
      { $match: { evidenceAt: { $gte: horizonStart } } },
      {
        $group: {
          _id: '$destinationHash', latest: { $max: '$evidenceAt' },
          daily: { $sum: { $cond: [{ $gte: ['$evidenceAt', dayStart] }, 1, 0] } },
          weekly: { $sum: { $cond: [{ $gte: ['$evidenceAt', weekStart] }, 1, 0] } },
        },
      },
    ]);
    return new Map(rows.map((row) => [row._id, row]));
  }

  async _initializeFrequencyLedger(recipient, policy, now = new Date()) {
    const key = `${recipient.channel}:${recipient.destinationHash}`;
    const horizonHours = this._frequencyHorizonHours(policy);
    await FrequencyLedger.updateOne(
      { key },
      {
        $setOnInsert: {
          key, channel: recipient.channel, destinationHash: recipient.destinationHash,
          initializedAt: null, horizonHours: 0, events: [],
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    const state = await FrequencyLedger.findOne({ key }).select('initializedAt horizonHours').lean();
    if (state?.initializedAt && Number(state.horizonHours || 0) >= horizonHours) return { key, horizonHours };

    const horizonStart = new Date(now.getTime() - horizonHours * 3_600_000);
    const history = await MessageRecipient.find({
      _id: { $ne: recipient._id }, channel: recipient.channel, destinationHash: recipient.destinationHash,
      status: { $in: ['accepted', 'sent', 'delivered', 'read', 'unknown'] },
      $or: [
        { acceptedAt: { $gte: horizonStart } },
        { submissionStartedAt: { $gte: horizonStart } },
        { updatedAt: { $gte: horizonStart } },
      ],
    }).sort({ updatedAt: -1 }).limit(1000).select('_id acceptedAt submissionStartedAt updatedAt').lean();
    const events = history.map((item) => ({
      token: item._id,
      at: item.acceptedAt || item.submissionStartedAt || item.updatedAt,
    })).filter((item) => item.at >= horizonStart);
    await FrequencyLedger.updateOne(
      { key, $or: [{ initializedAt: null }, { horizonHours: { $lt: horizonHours } }] },
      [{
        $set: {
          initializedAt: now,
          horizonHours: { $max: [{ $ifNull: ['$horizonHours', 0] }, horizonHours] },
          events: { $setUnion: [{ $ifNull: ['$events', []] }, events] },
        },
      }],
      { updatePipeline: true },
    );
    return { key, horizonHours };
  }

  async _reserveFrequency(recipient, campaign, providerSettings, now = new Date()) {
    const policy = this._frequencyPolicy(providerSettings, recipient.channel, campaign.purpose);
    if (!policy) return { allowed: true, applied: false };
    const token = recipient.quotaReservationId;
    if (!token) throw new ConflictError('Frequency reservation token is missing');
    const { key, horizonHours } = await this._initializeFrequencyLedger(recipient, policy, now);
    const horizonStart = new Date(now.getTime() - horizonHours * 3_600_000);
    const dayStart = new Date(now.getTime() - 24 * 3_600_000);
    const minStart = new Date(now.getTime() - policy.minIntervalHours * 3_600_000);
    await FrequencyLedger.updateOne(
      { key },
      [{ $set: { events: { $filter: { input: { $ifNull: ['$events', []] }, as: 'event', cond: { $gte: ['$$event.at', horizonStart] } } } } }],
      { updatePipeline: true },
    );
    const conditions = [];
    if (policy.minIntervalHours > 0) {
      conditions.push({
        $or: [
          { $eq: [{ $size: { $ifNull: ['$events', []] } }, 0] },
          { $lte: [{ $max: { $map: { input: { $ifNull: ['$events', []] }, as: 'event', in: '$$event.at' } } }, minStart] },
        ],
      });
    }
    if (policy.dailyMax > 0) {
      conditions.push({
        $lt: [
          { $size: { $filter: { input: { $ifNull: ['$events', []] }, as: 'event', cond: { $gte: ['$$event.at', dayStart] } } } },
          policy.dailyMax,
        ],
      });
    }
    if (policy.weeklyMax > 0) conditions.push({ $lt: [{ $size: { $ifNull: ['$events', []] } }, policy.weeklyMax] });
    const reserved = await FrequencyLedger.findOneAndUpdate(
      { key, ...(conditions.length ? { $expr: { $and: conditions } } : {}) },
      { $push: { events: { token, at: now } } },
      { returnDocument: 'after' },
    );
    if (!reserved) {
      const current = await FrequencyLedger.findOne({ key }).lean();
      const events = current?.events || [];
      return {
        allowed: false, applied: true,
        reason: this._frequencyViolation(policy, {
          latest: events.reduce((latest, event) => !latest || event.at > latest ? event.at : latest, null),
          daily: events.filter((event) => event.at >= dayStart).length,
          weekly: events.length,
        }, now) || 'frequency_policy_limit',
      };
    }
    const marked = await MessageRecipient.updateOne(
      { _id: recipient._id, status: 'submitting', quotaReservationId: token },
      { $set: { frequencyReservationState: 'reserved', frequencyReservedAt: now } },
    );
    if (!marked.matchedCount) {
      await FrequencyLedger.updateOne(
        { key },
        [{ $set: { events: { $filter: { input: { $ifNull: ['$events', []] }, as: 'event', cond: { $ne: ['$$event.token', token] } } } } }],
        { updatePipeline: true },
      );
      throw new ConflictError('Recipient changed while frequency capacity was being reserved');
    }
    recipient.frequencyReservationState = 'reserved';
    recipient.frequencyReservedAt = now;
    return { allowed: true, applied: true };
  }

  async _releaseFrequencyReservation(recipient) {
    const token = recipient?.quotaReservationId;
    if (!token || recipient.frequencyReservationState == null || !recipient?.destinationHash || !recipient?.channel) return;
    const key = `${recipient.channel}:${recipient.destinationHash}`;
    await FrequencyLedger.updateOne(
      { key },
      [{ $set: { events: { $filter: { input: { $ifNull: ['$events', []] }, as: 'event', cond: { $ne: ['$$event.token', token] } } } } }],
      { updatePipeline: true },
    );
    await MessageRecipient.updateOne(
      { _id: recipient._id, quotaReservationId: token },
      { $set: { frequencyReservationState: 'released' } },
    );
  }

  async _consumeFrequencyReservation(recipient) {
    const token = recipient?.quotaReservationId;
    if (!token || recipient.frequencyReservationState == null) return;
    await MessageRecipient.updateOne(
      { _id: recipient._id, quotaReservationId: token, frequencyReservationState: { $ne: 'released' } },
      { $set: { frequencyReservationState: 'consumed' } },
    );
  }

  async _initializeQuotaLedger(actor, now = new Date()) {
    const { dayKey, monthKey } = quotaPeriods(now);
    await ProviderSettings.updateOne(
      { key: 'global' },
      { $setOnInsert: { key: 'global', updatedBy: actor } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    const state = await ProviderSettings.findOne({ key: 'global' })
      .select('+quotaLedger.dailyPeriod +quotaLedger.monthlyPeriod')
      .lean();
    if (state?.quotaLedger?.dailyPeriod === dayKey && state?.quotaLedger?.monthlyPeriod === monthKey) {
      return { dayKey, monthKey };
    }

    const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
    const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`);
    const [dailyBaseline, monthlyBaseline] = await Promise.all([
      ProviderAttempt.countDocuments({ outcome: { $in: ['accepted', 'ambiguous'] }, submittedAt: { $gte: dayStart } }),
      ProviderAttempt.countDocuments({ outcome: { $in: ['accepted', 'ambiguous'] }, submittedAt: { $gte: monthStart } }),
    ]);
    // Conditional expressions make concurrent initializers harmless: once a
    // period is current, another initializer preserves its reservations.
    await ProviderSettings.updateOne({ key: 'global' }, [{
      $set: {
        'quotaLedger.dailyPeriod': dayKey,
        'quotaLedger.dailyBaseline': {
          $cond: [{ $eq: ['$quotaLedger.dailyPeriod', dayKey] }, { $ifNull: ['$quotaLedger.dailyBaseline', 0] }, dailyBaseline],
        },
        'quotaLedger.dailyReservations': {
          $cond: [{ $eq: ['$quotaLedger.dailyPeriod', dayKey] }, { $ifNull: ['$quotaLedger.dailyReservations', []] }, []],
        },
        'quotaLedger.monthlyPeriod': monthKey,
        'quotaLedger.monthlyBaseline': {
          $cond: [{ $eq: ['$quotaLedger.monthlyPeriod', monthKey] }, { $ifNull: ['$quotaLedger.monthlyBaseline', 0] }, monthlyBaseline],
        },
        'quotaLedger.monthlyReservations': {
          $cond: [{ $eq: ['$quotaLedger.monthlyPeriod', monthKey] }, { $ifNull: ['$quotaLedger.monthlyReservations', []] }, []],
        },
      },
    }], { updatePipeline: true });
    return { dayKey, monthKey };
  }

  async _reserveQuota(recipient, providerSettings, now = new Date()) {
    const dailyLimit = Number(providerSettings.quotas?.daily || 0);
    const monthlyLimit = Number(providerSettings.quotas?.monthly || 0);
    if (dailyLimit <= 0 || monthlyLimit <= 0) return false;
    const token = recipient.quotaReservationId;
    if (!token) throw new ConflictError('Quota reservation token is missing');
    const { dayKey, monthKey } = await this._initializeQuotaLedger(recipient.createdBy, now);
    const reserved = await ProviderSettings.findOneAndUpdate(
      {
        key: 'global',
        'quotaLedger.dailyPeriod': dayKey,
        'quotaLedger.monthlyPeriod': monthKey,
        $expr: {
          $and: [
            {
              $lt: [
                { $add: [{ $ifNull: ['$quotaLedger.dailyBaseline', 0] }, { $size: { $ifNull: ['$quotaLedger.dailyReservations', []] } }] },
                dailyLimit,
              ],
            },
            {
              $lt: [
                { $add: [{ $ifNull: ['$quotaLedger.monthlyBaseline', 0] }, { $size: { $ifNull: ['$quotaLedger.monthlyReservations', []] } }] },
                monthlyLimit,
              ],
            },
          ],
        },
      },
      {
        $addToSet: {
          'quotaLedger.dailyReservations': token,
          'quotaLedger.monthlyReservations': token,
        },
      },
      { returnDocument: 'after' },
    );
    if (!reserved) return false;
    const marked = await MessageRecipient.updateOne(
      { _id: recipient._id, status: 'submitting', quotaReservationId: token },
      { $set: { quotaReservationState: 'reserved', quotaReservedAt: now } },
    );
    if (!marked.matchedCount) {
      await this._releaseQuotaToken(token);
      throw new ConflictError('Recipient changed while quota capacity was being reserved');
    }
    recipient.quotaReservationState = 'reserved';
    recipient.quotaReservedAt = now;
    return true;
  }

  async _releaseQuotaToken(token) {
    if (!token) return;
    await ProviderSettings.updateOne(
      { key: 'global' },
      {
        $pull: {
          'quotaLedger.dailyReservations': token,
          'quotaLedger.monthlyReservations': token,
        },
      },
    );
  }

  async _releaseQuotaReservation(recipient) {
    const token = recipient?.quotaReservationId;
    if (!token) return;
    await this._releaseQuotaToken(token);
    await MessageRecipient.updateOne(
      { _id: recipient._id, quotaReservationId: token },
      { $set: { quotaReservationState: 'released' } },
    );
  }

  async _consumeQuotaReservation(recipient) {
    const token = recipient?.quotaReservationId;
    if (!token) return;
    await MessageRecipient.updateOne(
      { _id: recipient._id, quotaReservationId: token, quotaReservationState: { $ne: 'released' } },
      { $set: { quotaReservationState: 'consumed' } },
    );
  }

  async _quotaUsage(now = new Date()) {
    const { dayKey, monthKey } = quotaPeriods(now);
    const state = await ProviderSettings.findOne({ key: 'global' })
      .select('+quotaLedger.dailyPeriod +quotaLedger.dailyBaseline +quotaLedger.dailyReservations +quotaLedger.monthlyPeriod +quotaLedger.monthlyBaseline +quotaLedger.monthlyReservations')
      .lean();
    const dayCurrent = state?.quotaLedger?.dailyPeriod === dayKey;
    const monthCurrent = state?.quotaLedger?.monthlyPeriod === monthKey;
    if (dayCurrent && monthCurrent) {
      return {
        daily: Number(state.quotaLedger.dailyBaseline || 0) + (state.quotaLedger.dailyReservations?.length || 0),
        monthly: Number(state.quotaLedger.monthlyBaseline || 0) + (state.quotaLedger.monthlyReservations?.length || 0),
      };
    }
    const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
    const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`);
    const [daily, monthly] = await Promise.all([
      ProviderAttempt.countDocuments({ outcome: { $in: ['accepted', 'ambiguous'] }, submittedAt: { $gte: dayStart } }),
      ProviderAttempt.countDocuments({ outcome: { $in: ['accepted', 'ambiguous'] }, submittedAt: { $gte: monthStart } }),
    ]);
    return { daily, monthly };
  }

  async dispatchRecipient(recipientId) {
    const recipient = await MessageRecipient.findById(recipientId);
    if (!recipient || recipient.status !== 'queued') return { skipped: true };
    const campaign = await Campaign.findById(recipient.campaignId);
    if (!campaign || campaign.status === 'cancelled') {
      await MessageRecipient.updateOne({ _id: recipientId, status: 'queued' }, { $set: { status: 'cancelled' } });
      return { skipped: true };
    }
    if (campaign.status === 'paused') {
      await MessageRecipient.updateOne({ _id: recipientId, status: 'queued' }, { $set: { status: 'draft' } });
      return { skipped: true, reason: 'campaign_paused' };
    }

    // Re-check consent/suppression immediately before provider submission.
    const [consent, suppression, providerSettings] = await Promise.all([
      Consent.findOne({ leadId: recipient.leadId, channel: recipient.channel }).lean(),
      Suppression.findOne({ channel: recipient.channel, destinationHash: recipient.destinationHash }).lean(),
      settings(),
    ]);
    const consentExpired = Boolean(consent?.expiresAt && new Date(consent.expiresAt) <= new Date());
    if (suppression || consentExpired || ['denied', 'revoked'].includes(consent?.status) || ((campaign.purpose === 'promotional' || recipient.channel === 'whatsapp') && consent?.status !== 'granted')) {
      await MessageRecipient.updateOne({ _id: recipientId, status: 'queued' }, { $set: { status: 'suppressed', 'eligibility.eligible': false, 'eligibility.reasons': ['consent_or_suppression_changed'] } });
      await refreshCampaignSummary(campaign._id);
      return { suppressed: true };
    }

    const now = new Date();
    const quietDelay = this._complianceQuietHoursDelay(providerSettings, campaign, recipient, now);
    if (quietDelay > 0) {
      await queueManager.addJob(OUTBOUND_QUEUE, `quiet-hours-${recipient._id}-${Date.now()}`, { recipientId: String(recipient._id) }, { delay: quietDelay, attempts: 1 });
      return { delayed: true, reason: 'quiet_hours', delay: quietDelay };
    }

    const quotaReservationId = new mongoose.Types.ObjectId();
    const claimed = await MessageRecipient.findOneAndUpdate(
      { _id: recipientId, status: 'queued' },
      {
        $set: {
          status: 'submitting', submissionStartedAt: now,
          provider: null, providerMessageId: null, fallbackFrom: null, fallbackReason: null,
          quotaReservationId, quotaReservationState: 'pending', quotaReservedAt: null,
          frequencyReservationState: null, frequencyReservedAt: null,
        },
      },
      { returnDocument: 'after' },
    );
    if (!claimed) return { skipped: true };
    const frequency = await this._reserveFrequency(claimed, campaign, providerSettings, now);
    if (!frequency.allowed) {
      await MessageRecipient.updateOne(
        { _id: recipientId, status: 'submitting', quotaReservationId },
        {
          $set: {
            status: 'failed', failedAt: now, quotaReservationState: 'released',
            frequencyReservationState: 'released',
            error: { code: 'COMPLIANCE_FREQUENCY_LIMIT', message: `Recipient blocked by ${frequency.reason}` },
          },
          $addToSet: { 'eligibility.reasons': frequency.reason },
        },
      );
      await refreshCampaignSummary(campaign._id);
      return { failed: true, reason: frequency.reason };
    }
    const quotaReserved = await this._reserveQuota(claimed, providerSettings, now);
    if (!quotaReserved) {
      await this._releaseFrequencyReservation(claimed);
      await MessageRecipient.updateOne(
        { _id: recipientId, status: 'submitting', quotaReservationId },
        {
          $set: {
            status: 'failed', failedAt: now, quotaReservationState: 'released',
            error: { code: 'QUOTA_EXCEEDED', message: 'Configured messaging quota exceeded' },
          },
        },
      );
      await refreshCampaignSummary(campaign._id);
      return { failed: true, reason: 'quota' };
    }
    campaign.status = 'running';
    campaign.startedAt ||= now;
    await campaign.save();

    let result;
    let fallbackFrom = null;
    let fallbackReason = null;
    if (recipient.channel === 'email') {
      if (providerSettings.providers.emailEnabled) {
        await this._markProviderIntent(claimed._id, 'existing_email');
        result = await existingEmail.send({ to: claimed.destination, ...(claimed.rendered?.toObject?.() ?? claimed.rendered), leadId: claimed.leadId, createdBy: claimed.createdBy, purpose: campaign.purpose });
      } else {
        result = { provider: 'existing_email', outcome: 'rejected', safeToFallback: false, failureClass: 'configuration', errorCode: 'DISABLED', errorMessage: 'Email provider disabled' };
      }
    } else if (recipient.channel === 'whatsapp') {
      result = await this._sendWhatsApp(campaign, claimed, providerSettings);
      fallbackFrom = result.fallbackFrom || null;
      fallbackReason = result.fallbackReason || null;
    } else {
      result = await this._sendSms(campaign, claimed, providerSettings);
      fallbackFrom = result.fallbackFrom || null;
      fallbackReason = result.fallbackReason || null;
    }

    await this._recordAttempt(claimed, result);
    if (result.outcome === 'accepted' || result.outcome === 'ambiguous') {
      await this._consumeQuotaReservation(claimed);
      await this._consumeFrequencyReservation(claimed);
    } else {
      await this._releaseQuotaReservation(claimed);
      await this._releaseFrequencyReservation(claimed);
    }
    const update = { provider: result.provider, fallbackFrom, fallbackReason, lastEventAt: new Date() };
    if (result.estimatedCost?.amount != null) update.estimatedCost = result.estimatedCost;
    if (result.outcome === 'accepted') {
      update.status = 'accepted'; update.providerMessageId = result.providerMessageId; update.acceptedAt = new Date();
      if (result.cost) update.actualCost = result.cost;
    } else if (result.outcome === 'ambiguous') {
      update.status = 'unknown'; update.error = { code: result.errorCode, message: result.errorMessage };
    } else {
      update.status = 'failed'; update.failedAt = new Date(); update.error = { code: result.errorCode, message: result.errorMessage };
    }
    await MessageRecipient.updateOne({ _id: recipientId, status: 'submitting' }, { $set: update });
    await refreshCampaignSummary(campaign._id);
    return result;
  }

  async _sendSms(campaign, recipient, providerSettings) {
    const preferred = campaign.routing?.smsProvider || 'auto';
    const useTwilioDirect = preferred === 'twilio';
    const routing = providerSettings.countryRouting || {};
    const twilioCountryAllowed = countryAllowed(routing.twilioAllowedCountries, recipient.country);
    const textbeeCountryAllowed = countryAllowed(routing.textbeeAllowedCountries, recipient.country);
    const sendTwilio = async () => {
      await this._markProviderIntent(recipient._id, 'twilio');
      return {
        ...await twilio.send({ to: recipient.destination, text: recipient.rendered.bodyText }),
        estimatedCost: this._twilioEstimatedCost(recipient, providerSettings),
      };
    };
    if (useTwilioDirect) {
      if (!providerSettings.providers.twilioEnabled) {
        return { provider: 'twilio', outcome: 'rejected', safeToFallback: false, failureClass: 'configuration', errorCode: 'DISABLED', errorMessage: 'Twilio SMS is disabled by administrator policy' };
      }
      if (!twilioCountryAllowed) {
        return { provider: 'twilio', outcome: 'rejected', safeToFallback: false, failureClass: 'policy', errorCode: 'COUNTRY_NOT_ALLOWED', errorMessage: 'Twilio SMS is not enabled for the recipient country' };
      }
      return sendTwilio();
    }
    if (!providerSettings.providers.textbeeEnabled || !textbeeCountryAllowed) {
      if (preferred === 'auto' && campaign.routing?.allowFallback && providerSettings.smsFallback.enabled && providerSettings.providers.twilioEnabled && await this._fallbackEligible(campaign, recipient, providerSettings)) {
        const fallback = await sendTwilio();
        return { ...fallback, fallbackFrom: 'textbee', fallbackReason: textbeeCountryAllowed ? 'textbee_disabled' : 'textbee_country_not_allowed' };
      }
      return textbeeCountryAllowed
        ? { provider: 'textbee', outcome: 'rejected', safeToFallback: false, failureClass: 'configuration', errorCode: 'DISABLED', errorMessage: 'TextBee disabled' }
        : { provider: 'textbee', outcome: 'rejected', safeToFallback: false, failureClass: 'policy', errorCode: 'COUNTRY_NOT_ALLOWED', errorMessage: 'TextBee is not enabled for the recipient country' };
    }
    const health = await textBee.health();
    if (!health.eligible) {
      if (preferred === 'auto' && campaign.routing?.allowFallback && providerSettings.smsFallback.enabled && providerSettings.providers.twilioEnabled && await this._fallbackEligible(campaign, recipient, providerSettings)) {
        const fallback = await sendTwilio();
        return { ...fallback, fallbackFrom: 'textbee', fallbackReason: health.reason || 'textbee_unavailable' };
      }
      return { provider: 'textbee', outcome: 'rejected', safeToFallback: true, failureClass: 'transient', errorCode: health.reason || 'UNAVAILABLE', errorMessage: 'TextBee gateway unavailable' };
    }
    await this._markProviderIntent(recipient._id, 'textbee');
    const primary = await textBee.send({ to: recipient.destination, text: recipient.rendered.bodyText });
    await this._recordAttempt(recipient, primary);
    // Only an explicit provider response proving non-acceptance may fall back.
    if (preferred === 'auto' && mayFallbackAfterSubmission(primary) && campaign.routing?.allowFallback && providerSettings.smsFallback.enabled && providerSettings.providers.twilioEnabled && await this._fallbackEligible(campaign, recipient, providerSettings)) {
      const fallback = await sendTwilio();
      return { ...fallback, fallbackFrom: 'textbee', fallbackReason: primary.errorCode || primary.errorMessage };
    }
    return { ...primary, _alreadyRecorded: true };
  }

  async _sendWhatsApp(campaign, recipient, providerSettings) {
    const metaCountryAllowed = countryAllowed(providerSettings.countryRouting?.whatsappAllowedCountries, recipient.country);
    const fallbackAllowed = async () => (
      campaign.routing?.allowFallback
      && providerSettings.providers.twilioWhatsappEnabled
      && twilio.whatsappConfigured
      && countryAllowed(providerSettings.countryRouting?.twilioWhatsappAllowedCountries, recipient.country)
      && fallbackPolicyAllows(providerSettings.whatsappFallback, { country: recipient.country, purpose: campaign.purpose })
      && Boolean(campaign.content.whatsappTwilioContentSid)
      && await this._whatsappFallbackWithinSpendLimit(providerSettings)
    );
    const sendFallback = async (reason) => {
      await this._markProviderIntent(recipient._id, 'twilio_whatsapp');
      const fallback = await twilio.sendWhatsAppTemplate({
        to: recipient.destination,
        contentSid: campaign.content.whatsappTwilioContentSid,
        components: recipient.rendered.whatsappComponents,
      });
      return {
        ...fallback, fallbackFrom: 'meta_whatsapp', fallbackReason: reason,
        estimatedCost: this._twilioWhatsappEstimatedCost(providerSettings),
      };
    };

    if (!providerSettings.providers.metaWhatsappEnabled || !metaCountryAllowed) {
      if (await fallbackAllowed()) return sendFallback(metaCountryAllowed ? 'meta_disabled' : 'meta_country_not_allowed');
      return metaCountryAllowed
        ? { provider: 'meta_whatsapp', outcome: 'rejected', safeToFallback: false, failureClass: 'configuration', errorCode: 'DISABLED', errorMessage: 'Meta WhatsApp disabled' }
        : { provider: 'meta_whatsapp', outcome: 'rejected', safeToFallback: false, failureClass: 'policy', errorCode: 'COUNTRY_NOT_ALLOWED', errorMessage: 'Meta WhatsApp is not enabled for the recipient country' };
    }

    await this._markProviderIntent(recipient._id, 'meta_whatsapp');
    const primary = await metaWhatsapp.sendTemplate({
      to: recipient.destination, templateName: campaign.content.whatsappTemplateName,
      language: campaign.content.whatsappLanguage, components: recipient.rendered.whatsappComponents,
    });
    await this._recordAttempt(recipient, primary);
    if (primary.outcome === 'rejected' && primary.safeToFallback && await fallbackAllowed()) {
      return sendFallback(primary.errorCode || primary.errorMessage);
    }
    return { ...primary, _alreadyRecorded: true };
  }

  async _whatsappFallbackWithinSpendLimit(providerSettings) {
    const policy = providerSettings.whatsappFallback || {};
    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [usage] = await ProviderAttempt.aggregate([
      { $match: { provider: 'twilio_whatsapp', outcome: { $in: ['accepted', 'ambiguous'] }, submittedAt: { $gte: monthStart } } },
      { $group: { _id: null,
        monthly: { $sum: { $ifNull: ['$cost.amount', { $ifNull: ['$estimatedCost.amount', 0] }] } },
        daily: { $sum: { $cond: [{ $gte: ['$submittedAt', dayStart] }, { $ifNull: ['$cost.amount', { $ifNull: ['$estimatedCost.amount', 0] }] }, 0] } },
      } },
    ]);
    const projected = this._twilioWhatsappEstimatedCost(providerSettings)?.amount || 0;
    if (policy.dailySpendLimit > 0 && (usage?.daily || 0) + projected > policy.dailySpendLimit) return false;
    if (policy.monthlySpendLimit > 0 && (usage?.monthly || 0) + projected > policy.monthlySpendLimit) return false;
    return true;
  }

  _twilioWhatsappEstimatedCost(providerSettings) {
    const rate = Number(providerSettings.pricing?.twilioWhatsappDefaultPerMessage || 0);
    return rate > 0 ? { amount: rate, currency: providerSettings.pricing?.currency || 'USD' } : { amount: null, currency: null };
  }

  async _markProviderIntent(recipientId, provider) {
    const updated = await MessageRecipient.updateOne(
      { _id: recipientId, status: 'submitting' },
      { $set: { provider } },
    );
    if (!updated.matchedCount) throw new ConflictError('Recipient is no longer eligible for provider submission');
  }

  async _fallbackEligible(campaign, recipient, providerSettings) {
    const policy = providerSettings.smsFallback;
    if (!countryAllowed(providerSettings.countryRouting?.twilioAllowedCountries, recipient.country)) return false;
    if (!fallbackPolicyAllows(policy, { country: recipient.country, purpose: campaign.purpose })) return false;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [daily] = await ProviderAttempt.aggregate([
      { $match: { provider: 'twilio', outcome: { $in: ['accepted', 'ambiguous'] }, submittedAt: { $gte: monthStart } } },
      { $group: { _id: null, monthly: { $sum: { $ifNull: ['$cost.amount', { $ifNull: ['$estimatedCost.amount', 0] }] } }, daily: { $sum: { $cond: [{ $gte: ['$submittedAt', dayStart] }, { $ifNull: ['$cost.amount', { $ifNull: ['$estimatedCost.amount', 0] }] }, 0] } } } },
    ]);
    const projected = this._twilioEstimatedCost(recipient, providerSettings)?.amount || 0;
    if (policy.dailySpendLimit > 0 && (daily?.daily || 0) + projected > policy.dailySpendLimit) return false;
    if (policy.monthlySpendLimit > 0 && (daily?.monthly || 0) + projected > policy.monthlySpendLimit) return false;
    return true;
  }

  _twilioEstimatedCost(recipient, providerSettings) {
    const rate = Number(providerSettings.pricing?.twilioDefaultPerSegment || 0);
    if (rate <= 0) return { amount: null, currency: null };
    return {
      amount: smsSegments(recipient.rendered?.bodyText || '').segments * rate,
      currency: providerSettings.pricing?.currency || 'USD',
    };
  }

  _windowDelay(quietHours, now = new Date()) {
    if (!quietHours?.enabled) return 0;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: quietHours.timezone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
      const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
      const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
      const nowMinutes = hour * 60 + minute;
      const parse = (value) => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m; };
      const start = parse(quietHours.start); const end = parse(quietHours.end);
      const inside = start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end;
      if (!inside) return 0;
      const minutes = end > nowMinutes ? end - nowMinutes : (24 * 60 - nowMinutes) + end;
      return Math.max(1, minutes) * 60_000;
    } catch {
      // Invalid legacy configuration must not silently disable quiet hours.
      return 60 * 60_000;
    }
  }

  _quietHoursDelay(quietHours, purpose, now = new Date()) {
    if (!quietHours?.enabled || purpose !== 'promotional') return 0;
    return this._windowDelay(quietHours, now);
  }

  _complianceQuietHoursDelay(providerSettings, campaign, recipient, now = new Date()) {
    const delays = [this._quietHoursDelay(providerSettings.quietHours, campaign.purpose, now)];
    for (const rule of providerSettings.regionalQuietHours || []) {
      if (!rule.enabled || rule.channel !== recipient.channel || rule.purpose !== campaign.purpose) continue;
      if (!rule.countries?.includes(String(recipient.country || '').toUpperCase())) continue;
      delays.push(this._windowDelay({ ...rule, enabled: true }, now));
    }
    return Math.max(...delays);
  }

  async _recordAttempt(recipient, result) {
    if (result._alreadyRecorded) return;
    const attemptNumber = await ProviderAttempt.countDocuments({ recipientId: recipient._id }) + 1;
    await ProviderAttempt.create({
      recipientId: recipient._id, campaignId: recipient.campaignId,
      internalMessageId: String(recipient._id), attemptNumber, provider: result.provider,
      idempotencyKey: `${recipient._id}:${result.provider}:${attemptNumber}`,
      outcome: result.outcome, safeToFallback: Boolean(result.safeToFallback),
      providerMessageId: result.providerMessageId || null, providerStatus: result.providerStatus || null,
      failureClass: result.failureClass || null, errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null, responseStatus: result.responseStatus || null,
      cost: result.cost || {}, submittedAt: new Date(), resolvedAt: result.outcome === 'ambiguous' ? null : new Date(),
      estimatedCost: result.estimatedCost || {},
    });
  }

  /**
   * Recover durable work after a process or host failure without guessing
   * whether an external provider accepted a message. Work that never crossed
   * the provider-intent boundary is safe to enqueue again. Once a provider is
   * recorded, missing evidence becomes `unknown` and requires reconciliation.
   */
  async recoverStaleWork({
    now = new Date(),
    staleAfterMs = Number(process.env.MESSAGING_RECOVERY_STALE_MINUTES || 10) * 60_000,
    batchSize = Number(process.env.MESSAGING_RECOVERY_BATCH_SIZE || 500),
  } = {}) {
    const cutoff = new Date(now.getTime() - staleAfterMs);
    const stale = await MessageRecipient.find({
      status: 'submitting',
      $or: [
        { submissionStartedAt: { $lte: cutoff } },
        { submissionStartedAt: null, updatedAt: { $lte: cutoff } },
      ],
    }).sort({ submissionStartedAt: 1, updatedAt: 1 }).limit(batchSize);

    const touchedCampaigns = new Set();
    let restored = 0;
    let unknown = 0;
    let returnedToQueue = 0;
    let reEnqueued = 0;

    for (const item of stale) {
      const boundaryAt = item.submissionStartedAt || item.updatedAt;
      const latest = await ProviderAttempt.findOne({ recipientId: item._id }).sort({ attemptNumber: -1 }).lean();
      const hasDurableResult = Boolean(
        latest
        && latest.submittedAt >= boundaryAt
        && (!item.provider || latest.provider === item.provider),
      );
      let update;
      let eventType = null;
      let eventProvider = item.provider || latest?.provider || null;

      if (hasDurableResult && latest.outcome === 'accepted') {
        update = {
          status: 'accepted', provider: latest.provider,
          providerMessageId: latest.providerMessageId || null,
          acceptedAt: latest.resolvedAt || latest.submittedAt,
          lastEventAt: now, error: { code: null, message: null },
          ...(latest.cost?.amount != null ? { actualCost: latest.cost } : {}),
          ...(latest.estimatedCost?.amount != null ? { estimatedCost: latest.estimatedCost } : {}),
        };
        eventType = 'recovery_restored_accepted';
        restored += 1;
      } else if (hasDurableResult && latest.outcome === 'rejected') {
        update = {
          status: 'failed', provider: latest.provider,
          failedAt: latest.resolvedAt || latest.submittedAt, lastEventAt: now,
          error: { code: latest.errorCode || 'PROVIDER_REJECTED', message: latest.errorMessage || 'Provider rejected the submission' },
        };
        eventType = 'recovery_restored_rejected';
        restored += 1;
      } else if (hasDurableResult && latest.outcome === 'ambiguous') {
        update = {
          status: 'unknown', provider: latest.provider, lastEventAt: now,
          error: { code: latest.errorCode || 'AMBIGUOUS_SUBMISSION', message: latest.errorMessage || 'Provider submission outcome is unknown' },
        };
        eventType = 'recovery_restored_ambiguous';
        unknown += 1;
      } else if (!item.provider) {
        // No provider intent was persisted, so no external send had started.
        await this._releaseQuotaReservation(item);
        await this._releaseFrequencyReservation(item);
        const changed = await MessageRecipient.updateOne(
          { _id: item._id, status: 'submitting' },
          {
            $set: {
              status: 'queued', submissionStartedAt: null,
              error: { code: 'RECOVERED_BEFORE_SUBMISSION', message: 'Recovered before provider submission began' },
            },
          },
        );
        if (changed.modifiedCount) {
          returnedToQueue += 1;
          touchedCampaigns.add(String(item.campaignId));
          await queueManager.addJob(OUTBOUND_QUEUE, `recovery-${item._id}`, { recipientId: String(item._id) }, {
            jobId: `message-recovery-${item._id}-${boundaryAt.getTime()}`,
            attempts: 1,
          });
          reEnqueued += 1;
        }
        continue;
      } else {
        update = {
          status: 'unknown', lastEventAt: now,
          error: {
            code: 'STALE_SUBMISSION_UNCERTAIN',
            message: 'Worker stopped after provider submission began; reconcile before retrying',
          },
        };
        eventType = 'recovery_submission_unknown';
        unknown += 1;
      }

      const changed = await MessageRecipient.updateOne(
        { _id: item._id, status: 'submitting' },
        { $set: update },
      );
      if (!changed.modifiedCount) continue;
      touchedCampaigns.add(String(item.campaignId));
      if (update.status === 'failed') {
        await this._releaseQuotaReservation(item);
        await this._releaseFrequencyReservation(item);
      } else {
        await this._consumeQuotaReservation(item);
        await this._consumeFrequencyReservation(item);
      }
      if (eventProvider && eventType) {
        await DeliveryEvent.updateOne(
          { eventKey: `internal:submission-recovery:${item._id}:${boundaryAt.getTime()}` },
          {
            $setOnInsert: {
              eventKey: `internal:submission-recovery:${item._id}:${boundaryAt.getTime()}`,
              provider: eventProvider, providerMessageId: update.providerMessageId || latest?.providerMessageId || `unknown:${item._id}`,
              recipientId: item._id, leadId: item.leadId, campaignId: item.campaignId,
              createdBy: item.createdBy, channel: item.channel, direction: 'internal',
              eventType, normalizedStatus: update.status, occurredAt: now,
              payload: { recoveredFrom: 'submitting', evidence: hasDurableResult ? 'provider_attempt' : 'provider_intent' },
            },
          },
          { upsert: true },
        );
      }
    }

    const dueCampaigns = await Campaign.find({
      $or: [
        { status: { $in: ['queued', 'running'] } },
        { status: 'scheduled', scheduledAt: { $lte: now } },
      ],
    }).select('_id').lean();
    const queued = dueCampaigns.length ? await MessageRecipient.find({
      campaignId: { $in: dueCampaigns.map((item) => item._id) },
      status: 'queued', updatedAt: { $lte: cutoff },
    }).sort({ updatedAt: 1 }).limit(batchSize).select('_id updatedAt').lean() : [];

    for (const item of queued) {
      await queueManager.addJob(OUTBOUND_QUEUE, `recovery-${item._id}`, { recipientId: String(item._id) }, {
        jobId: `message-recovery-${item._id}-${item.updatedAt.getTime()}`,
        attempts: 1,
      });
      reEnqueued += 1;
    }
    for (const campaignId of touchedCampaigns) await refreshCampaignSummary(campaignId);
    return { inspected: stale.length, restored, unknown, returnedToQueue, reEnqueued };
  }

  /**
   * Poll only provider-assigned IDs whose submission was already accepted.
   * A missing record or lookup failure is evidence of neither acceptance nor
   * rejection, so it never releases reservations or makes a message retryable.
   */
  async reconcileProviderStatuses({
    now = new Date(),
    minAgeMs = Number(process.env.MESSAGING_RECONCILIATION_MIN_AGE_MINUTES || 5) * 60_000,
    maxAgeMs = Number(process.env.MESSAGING_RECONCILIATION_MAX_AGE_DAYS || 7) * 24 * 60 * 60_000,
    batchSize = Number(process.env.MESSAGING_RECONCILIATION_BATCH_SIZE || 200),
  } = {}) {
    const checkBefore = new Date(now.getTime() - minAgeMs);
    const createdAfter = new Date(now.getTime() - maxAgeMs);
    const candidates = await MessageRecipient.find({
      provider: { $in: ['textbee', 'twilio', 'twilio_whatsapp'] },
      providerMessageId: { $type: 'string', $ne: '' },
      status: { $in: ['accepted', 'sent', 'unknown'] },
      createdAt: { $gte: createdAfter, $lte: checkBefore },
      $or: [{ lastReconciliationAt: null }, { lastReconciliationAt: { $lte: checkBefore } }],
    }).sort({ lastReconciliationAt: 1, acceptedAt: 1, createdAt: 1 }).limit(batchSize);

    const summary = {
      inspected: candidates.length, checked: 0, advanced: 0,
      unchanged: 0, notFound: 0, unavailable: 0, unsupported: 0,
    };
    for (const recipient of candidates) {
      const adapter = recipient.provider === 'textbee' ? textBee : twilio;
      let evidence;
      try {
        evidence = await adapter.reconcile({
          providerMessageId: recipient.providerMessageId,
          to: recipient.destination,
        });
      } catch (error) {
        evidence = { checked: false, found: false, reason: 'provider_error' };
        logger.warn('Messaging provider reconciliation lookup failed', {
          module: 'messaging', action: 'provider.reconcile', provider: recipient.provider,
          recipientId: String(recipient._id), error: { message: error.message },
        });
      }
      await MessageRecipient.updateOne({ _id: recipient._id }, { $set: { lastReconciliationAt: now } });
      if (!evidence?.checked) { summary.unavailable += 1; continue; }
      summary.checked += 1;
      if (!evidence.found) { summary.notFound += 1; continue; }
      const normalized = normalizeProviderStatus(recipient.provider, evidence.status);
      if (!normalized) { summary.unsupported += 1; continue; }

      const occurredAtCandidate = evidence.occurredAt ? new Date(evidence.occurredAt) : now;
      const occurredAt = Number.isNaN(occurredAtCandidate.getTime()) ? now : occurredAtCandidate;
      const evidenceHash = crypto.createHash('sha256').update(String(
        evidence.evidenceKey || `${evidence.status}:${occurredAt.toISOString()}`,
      )).digest('hex').slice(0, 24);
      const before = recipient.status;
      const result = await this.applyProviderEvent({
        provider: recipient.provider,
        providerMessageId: recipient.providerMessageId,
        status: evidence.status,
        eventKey: `${recipient.provider}:reconciliation:${recipient.providerMessageId}:${evidenceHash}`,
        occurredAt,
        payload: {
          source: 'provider_reconciliation', details: evidence.details || {}, cost: evidence.cost || null,
        },
      });
      if (!result.duplicate && result.matched && result.status !== before) summary.advanced += 1;
      else summary.unchanged += 1;
    }
    return summary;
  }

  async monitorProviders({ now = new Date(), results = null } = {}) {
    const live = results || Object.fromEntries(await Promise.all([
      ['email', existingEmail], ['metaWhatsapp', metaWhatsapp], ['textbee', textBee], ['twilio', twilio],
      ['twilioWhatsapp', { health: () => twilio.whatsappHealth() }],
    ].map(async ([key, provider]) => {
      try { return [key, await provider.health()]; }
      catch (error) {
        logger.warn('Messaging provider health lookup failed', {
          module: 'messaging', action: 'provider.health', provider: key,
          error: { message: error.message },
        });
        return [key, { configured: true, reachable: false, eligible: false, reason: 'health_check_failed' }];
      }
    })));
    const snapshots = {};
    for (const [key, result] of Object.entries(live)) {
      const integrationKey = `messaging_${key}`;
      const status = result.eligible ? 'healthy' : (result.configured && result.reachable ? 'degraded' : 'down');
      const latest = await IntegrationHealthCheck.findOne({ integrationKey }).sort({ checkedAt: -1 }).lean();
      const startedAt = Date.now();
      const record = await IntegrationHealthCheck.create({
        integrationKey, status, responseTimeMs: Math.max(0, Date.now() - startedAt),
        errorMessage: status === 'healthy' ? null : (result.reason || 'Provider unavailable'),
        details: sanitizePayload(result), checkedAt: now,
      });
      snapshots[key] = {
        status, checkedAt: record.checkedAt, previousStatus: latest?.status || 'unknown',
      };
      if (latest?.status && latest.status !== status) {
        const log = status === 'healthy' ? logger.info.bind(logger) : logger.warn.bind(logger);
        log('Messaging provider health changed', {
          module: 'messaging', action: 'provider.health.transition', provider: key,
          previousStatus: latest.status, status, reason: result.reason || null,
        });
        eventBus.publish(EVENT_TYPES.INTEGRATION_STATUS_CHANGED, {
          integrationKey,
          displayName: ({
            email: 'Existing email service',
            metaWhatsapp: 'Meta WhatsApp Cloud API',
            textbee: 'TextBee SMS gateway',
            twilio: 'Twilio SMS',
          })[key] || integrationKey,
          provider: key,
          previousStatus: latest.status,
          currentStatus: status,
          oldStatus: latest.status,
          newStatus: status,
          errorMessage: status === 'healthy' ? null : (result.reason || 'Provider unavailable'),
          checkedAt: record.checkedAt,
          settingsPath: '/admin/messaging',
        }, { source: 'messaging:provider-health' });
      }
    }
    return { providers: live, snapshots, checkedAt: now };
  }

  async applyProviderEvent({ provider, providerMessageId, status, eventKey, occurredAt = new Date(), payload = {} }) {
    let event;
    try {
      event = await DeliveryEvent.create({ eventKey, provider, providerMessageId, direction: 'outbound', eventType: status, normalizedStatus: normalizeProviderStatus(provider, status), occurredAt, payload: sanitizePayload(payload) });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      event = await DeliveryEvent.findOne({ eventKey });
      if (event?.processedAt) return { duplicate: true };
      if (!event) throw error;
    }
    const markProcessed = async () => {
      event.processedAt ||= new Date();
      await event.save();
    };
    const recipient = await MessageRecipient.findOne({ provider, providerMessageId });
    if (!recipient) {
      await markProcessed();
      return { accepted: true, matched: false };
    }
    event.recipientId = recipient._id;
    event.leadId = recipient.leadId;
    event.campaignId = recipient.campaignId;
    event.createdBy = recipient.createdBy;
    event.channel = recipient.channel;
    const normalized = normalizeProviderStatus(provider, status);
    if (!normalized) {
      await markProcessed();
      return { accepted: true, matched: true, ignored: true };
    }
    const isForward = (STATUS_RANK[normalized] ?? 0) >= (STATUS_RANK[recipient.status] ?? 0);
    // Failure may arrive after an accepted/sent state, but never overwrite proven delivery/read.
    const isFailure = ['failed', 'undelivered', 'cancelled'].includes(normalized);
    const canApplyFailure = isFailure && !['delivered', 'read'].includes(recipient.status);
    const canApply = isFailure ? canApplyFailure : isForward;
    if (canApply) {
      recipient.status = normalized;
      recipient.lastEventAt = occurredAt;
      if (normalized === 'sent') recipient.sentAt ||= occurredAt;
      if (normalized === 'delivered') recipient.deliveredAt ||= occurredAt;
      if (normalized === 'read') recipient.readAt ||= occurredAt;
      if (['failed', 'undelivered'].includes(normalized)) recipient.failedAt ||= occurredAt;
      const cost = payload?.cost;
      if (cost?.amount != null && Number.isFinite(Number(cost.amount))) {
        recipient.actualCost = { amount: Math.abs(Number(cost.amount)), currency: String(cost.currency || 'USD').toUpperCase().slice(0, 3) };
      }
      if (['failed', 'undelivered'].includes(normalized)) {
        const details = payload?.details || payload || {};
        recipient.error = {
          code: String(details.errorCode || details.error_code || 'PROVIDER_DELIVERY_FAILED').slice(0, 100),
          message: String(details.errorMessage || details.error_message || 'Provider reported delivery failure').slice(0, 500),
        };
      }
      await recipient.save();
      await refreshCampaignSummary(recipient.campaignId);
    }
    await markProcessed();
    return { accepted: true, matched: true, status: recipient.status };
  }

  async suppressInbound({ channel, from, provider, messageId, text, payload }) {
    const hash = destinationHash(channel, from);
    const isOptOut = /^(stop|stopall|unsubscribe|cancel|end|quit|remove|arr[eê]t)$/i.test(String(text || '').trim());
    const lead = await Lead.findOne({ $or: [{ normalizedPhone: from }, { phone: from }, { mobile: from }] }).select('_id').lean();
    const latestRecipient = lead ? await MessageRecipient.findOne({ leadId: lead._id, channel }).sort({ createdAt: -1 }).select('_id campaignId createdBy').lean() : null;
    const eventKey = `${provider}:inbound:${messageId}`;
    let event;
    try {
      event = await DeliveryEvent.create({
        eventKey, provider, providerMessageId: messageId, recipientId: latestRecipient?._id || null,
        leadId: lead?._id || null, campaignId: latestRecipient?.campaignId || null,
        createdBy: latestRecipient?.createdBy || null, channel, direction: 'inbound',
        messagePreview: String(text || '').slice(0, 500), eventType: 'inbound', normalizedStatus: null,
        occurredAt: new Date(), payload: sanitizePayload(payload),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      event = await DeliveryEvent.findOne({ eventKey });
      if (event?.processedAt) return { received: true, optOut: isOptOut, duplicate: true };
      if (!event) throw error;
    }
    if (isOptOut) {
      await Suppression.updateOne({ channel, destinationHash: hash }, { $setOnInsert: { leadId: lead?._id || null, reason: 'opt_out', source: `${provider}_inbound`, suppressedAt: new Date() } }, { upsert: true });
      if (lead) {
        await Consent.updateOne(
          { leadId: lead._id, channel },
          { $set: { status: 'revoked', source: `${provider}_inbound`, evidence: 'Recipient opt-out keyword', capturedAt: new Date(), changedBy: null } },
          { upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
        auditService.logEvent({
          eventType: 'messaging.consent.opted_out', userId: null, ipAddress: 'provider_webhook',
          result: 'success', module: 'messaging',
          details: { leadId: lead._id, channel, provider, providerMessageId: messageId },
        });
      }
    }
    event.processedAt = new Date();
    await event.save();
    return { received: true, optOut: isOptOut };
  }

  async unsubscribeEmail(token) {
    const payload = verifyUnsubscribeToken(token);
    if (!payload) throw new ValidationError('Unsubscribe link is invalid or expired');
    const lead = await Lead.findById(payload.leadId).select('_id').lean();
    if (!lead) throw new ValidationError('Unsubscribe link is invalid or expired');
    await Suppression.updateOne(
      { channel: 'email', destinationHash: payload.destinationHash },
      { $setOnInsert: { leadId: lead._id, reason: 'opt_out', source: 'email_unsubscribe', suppressedAt: new Date() } },
      { upsert: true },
    );
    await Consent.updateOne(
      { leadId: lead._id, channel: 'email' },
      { $set: { status: 'revoked', source: 'email_unsubscribe', evidence: 'Signed unsubscribe link', capturedAt: new Date(), changedBy: null } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    auditService.logEvent({ eventType: 'messaging.consent.opted_out', userId: null, ipAddress: 'public_unsubscribe', result: 'success', module: 'messaging', details: { leadId: lead._id, channel: 'email' } });
    return { unsubscribed: true };
  }

  async suppressEmailBounce(emailRecordId, reason = '') {
    const { default: EmailRecord } = await import('../doctpl/emailRecord.model.js');
    const record = await EmailRecord.findById(emailRecordId).select('sourceModule sourceRecordId to').lean();
    if (!record || record.sourceModule !== 'lead' || !record.sourceRecordId || !record.to?.[0]) return { suppressed: false };
    await Suppression.updateOne(
      { channel: 'email', destinationHash: destinationHash('email', record.to[0]) },
      { $setOnInsert: { leadId: record.sourceRecordId, reason: 'bounce', source: `email_webhook:${String(reason).slice(0, 70)}`, suppressedAt: new Date() } },
      { upsert: true },
    );
    return { suppressed: true };
  }

  async historyForLead(leadId, actor, { page = 1, limit = 25, channel, provider, status, campaignId, from, to } = {}) {
    // The lead itself is company-shared; actor scope prevents leaking campaigns owned by another account boundary.
    const filter = { leadId, createdBy: actor };
    if (channel) filter.channel = channel;
    if (provider) filter.provider = provider;
    if (status) filter.status = status === 'received' ? '__inbound_only__' : status;
    if (campaignId) filter.campaignId = campaignId;
    if (from || to) filter.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const inboundFilter = { leadId, createdBy: actor, direction: 'inbound' };
    if (channel) inboundFilter.channel = channel;
    if (provider) inboundFilter.provider = provider;
    if (status && status !== 'received') inboundFilter.normalizedStatus = status;
    if (campaignId) inboundFilter.campaignId = campaignId;
    if (from || to) inboundFilter.occurredAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    const take = page * limit;
    const [outbound, inbound, outboundTotal, inboundTotal] = await Promise.all([
      MessageRecipient.find(filter).sort({ createdAt: -1 }).limit(take).populate('campaignId', 'name').lean(),
      DeliveryEvent.find(inboundFilter).sort({ occurredAt: -1 }).limit(take).populate('campaignId', 'name').lean(),
      MessageRecipient.countDocuments(filter),
      DeliveryEvent.countDocuments(inboundFilter),
    ]);
    const timeline = [
      ...outbound.map((item) => ({ ...item, direction: 'outbound' })),
      ...inbound.map((item) => ({
        ...item, status: 'received', createdAt: item.occurredAt, rendered: { bodyText: item.messagePreview },
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = outboundTotal + inboundTotal;
    const data = timeline.slice((page - 1) * limit, page * limit);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async analytics(actor, { from, to } = {}) {
    const actorId = new mongoose.Types.ObjectId(actor);
    const dateMatch = from || to
      ? { createdAt: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) } }
      : {};
    const eventDateMatch = from || to
      ? { occurredAt: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) } }
      : {};
    const match = { createdBy: actorId, ...dateMatch };
    const campaignMatch = { createdBy: actorId, ...dateMatch };
    const submittedStatuses = ['accepted', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'unknown'];
    const now = new Date();
    const consentExpiryHorizon = new Date(now.getTime() + 30 * 86_400_000);
    // Consent has no independent owner because it belongs to a lead. Resolve
    // actor-accessible leads first so reporting cannot count another actor's
    // consent or webhook-created suppression evidence.
    const ownedLeadIds = await Lead.distinct('_id', { createdBy: actorId });
    const [
      byStatus, byChannel, byProvider, campaigns, activeCampaigns, fallbackCount, inboundReplies,
      providerSettings, queue, quotaUsage, frequencyBlocked, expiringConsents,
      expiredConsents, suppressedDestinations, emailBounceRecipients,
      actualCostBuckets, estimatedCostBuckets,
    ] = await Promise.all([
      MessageRecipient.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      MessageRecipient.aggregate([{ $match: match }, { $group: {
        _id: '$channel', count: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $in: ['$status', submittedStatuses] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
        read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'undelivered']] }, 1, 0] } },
      } }]),
      MessageRecipient.aggregate([{ $match: { ...match, provider: { $ne: null } } }, { $group: {
        _id: '$provider', count: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $in: ['$status', submittedStatuses] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
        read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $in: ['$status', ['failed', 'undelivered']] }, 1, 0] } },
      } }]),
      Campaign.countDocuments(campaignMatch),
      Campaign.countDocuments({ ...campaignMatch, status: { $in: ['scheduled', 'queued', 'running'] } }),
      MessageRecipient.countDocuments({ ...match, fallbackFrom: { $ne: null } }),
      DeliveryEvent.countDocuments({ createdBy: actorId, direction: 'inbound', ...eventDateMatch }),
      settings(),
      queueManager.getQueueStats(OUTBOUND_QUEUE).catch(() => null),
      this._quotaUsage(),
      MessageRecipient.countDocuments({
        ...match,
        $or: [
          { 'error.code': 'COMPLIANCE_FREQUENCY_LIMIT' },
          { 'eligibility.reasons': { $in: ['frequency_min_interval', 'frequency_daily_limit', 'frequency_weekly_limit'] } },
        ],
      }),
      Consent.countDocuments({ leadId: { $in: ownedLeadIds }, status: 'granted', expiresAt: { $gt: now, $lte: consentExpiryHorizon } }),
      Consent.countDocuments({ leadId: { $in: ownedLeadIds }, status: 'granted', expiresAt: { $lte: now } }),
      Suppression.countDocuments({ $or: [{ createdBy: actorId }, { leadId: { $in: ownedLeadIds } }] }),
      DeliveryEvent.distinct('recipientId', {
        createdBy: actorId, channel: 'email', direction: 'outbound',
        eventType: { $in: ['bounced', 'BOUNCED'] }, recipientId: { $ne: null }, ...eventDateMatch,
      }),
      MessageRecipient.aggregate([
        { $match: { ...match, provider: { $ne: null }, 'actualCost.amount': { $ne: null } } },
        { $group: { _id: { provider: '$provider', currency: { $ifNull: ['$actualCost.currency', 'UNKNOWN'] } }, amount: { $sum: '$actualCost.amount' } } },
      ]),
      MessageRecipient.aggregate([
        { $match: { ...match, provider: { $ne: null }, 'estimatedCost.amount': { $ne: null } } },
        { $group: { _id: { provider: '$provider', currency: { $ifNull: ['$estimatedCost.currency', 'UNKNOWN'] } }, amount: { $sum: '$estimatedCost.amount' } } },
      ]),
    ]);
    const totalRecipients = byStatus.reduce((sum, row) => sum + row.count, 0);
    const submitted = byStatus.filter((row) => submittedStatuses.includes(row._id)).reduce((sum, row) => sum + row.count, 0);
    const delivered = byStatus.filter((row) => ['delivered', 'read'].includes(row._id)).reduce((sum, row) => sum + row.count, 0);
    const read = byStatus.find((row) => row._id === 'read')?.count || 0;
    const emailBounced = emailBounceRecipients.filter(Boolean).length;
    const costsByProvider = new Map();
    const addCost = (bucket, kind) => {
      const provider = bucket._id.provider;
      const currency = String(bucket._id.currency || 'UNKNOWN').toUpperCase();
      if (!costsByProvider.has(provider)) costsByProvider.set(provider, new Map());
      const currencies = costsByProvider.get(provider);
      const current = currencies.get(currency) || { currency, actual: 0, estimated: 0 };
      current[kind] += bucket.amount || 0;
      currencies.set(currency, current);
    };
    actualCostBuckets.forEach((bucket) => addCost(bucket, 'actual'));
    estimatedCostBuckets.forEach((bucket) => addCost(bucket, 'estimated'));
    const providerRows = byProvider.map((row) => ({
      ...row,
      costs: [...(costsByProvider.get(row._id)?.values() || [])],
    }));
    const channelRows = byChannel.map((row) => ({
      ...row,
      bounced: row._id === 'email' ? emailBounced : 0,
    }));
    return {
      campaigns, activeCampaigns, totalRecipients, submitted, delivered, read, emailBounced, fallbackCount, inboundReplies,
      deliveryRate: submitted ? delivered / submitted : 0,
      readRate: submitted ? read / submitted : 0,
      emailBounceRate: (channelRows.find((row) => row._id === 'email')?.submitted || 0)
        ? emailBounced / channelRows.find((row) => row._id === 'email').submitted : 0,
      byStatus, byChannel: channelRows, byProvider: providerRows, quotas: providerSettings.quotas,
      usage: quotaUsage, queue,
      compliance: { frequencyBlocked, expiringConsents, expiredConsents, suppressedDestinations },
    };
  }

  async exportAnalytics(actor, filters = {}) {
    const data = await this.analytics(actor, filters);
    const rows = [
      { section: 'summary', dimension: 'all', metric: 'campaigns', value: data.campaigns, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'active_campaigns', value: data.activeCampaigns, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'recipients', value: data.totalRecipients, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'submitted', value: data.submitted, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'delivered', value: data.delivered, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'read', value: data.read, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'email_bounced', value: data.emailBounced, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'inbound_replies', value: data.inboundReplies, currency: '' },
      { section: 'summary', dimension: 'all', metric: 'sms_fallbacks', value: data.fallbackCount, currency: '' },
      ...data.byStatus.map((row) => ({ section: 'status', dimension: row._id, metric: 'messages', value: row.count, currency: '' })),
      ...data.byChannel.flatMap((row) => ['count', 'submitted', 'delivered', 'read', 'failed', 'bounced'].map((metric) => ({
        section: 'channel', dimension: row._id, metric, value: row[metric] || 0, currency: '',
      }))),
      ...data.byProvider.flatMap((row) => [
        ...['count', 'submitted', 'delivered', 'read', 'failed'].map((metric) => ({
          section: 'provider', dimension: row._id, metric, value: row[metric] || 0, currency: '',
        })),
        ...row.costs.flatMap((cost) => [
          { section: 'provider_cost', dimension: row._id, metric: 'actual', value: cost.actual, currency: cost.currency },
          { section: 'provider_cost', dimension: row._id, metric: 'estimated', value: cost.estimated, currency: cost.currency },
        ]),
      ]),
    ];
    return { rows, generatedAt: new Date(), filters: { from: filters.from || null, to: filters.to || null } };
  }

  async exportCampaign(campaignId, actor) {
    await this.getCampaign(campaignId, actor);
    const recipients = await MessageRecipient.find({ campaignId }).sort({ createdAt: 1 })
      .populate('leadId', 'leadNumber name').lean();
    const counts = await ProviderAttempt.aggregate([
      { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
      { $group: { _id: '$recipientId', count: { $sum: 1 } } },
    ]);
    const attemptCounts = new Map(counts.map((item) => [String(item._id), item.count]));
    return recipients.map((item) => ({
      recipientId: String(item._id), leadNumber: item.leadId?.leadNumber || '', leadName: item.leadId?.name || '',
      channel: item.channel, destination: item.destination, status: item.status, provider: item.provider || '',
      providerMessageId: item.providerMessageId || '', fallbackFrom: item.fallbackFrom || '', fallbackReason: item.fallbackReason || '',
      acceptedAt: item.acceptedAt?.toISOString?.() || '', sentAt: item.sentAt?.toISOString?.() || '',
      deliveredAt: item.deliveredAt?.toISOString?.() || '', readAt: item.readAt?.toISOString?.() || '',
      failedAt: item.failedAt?.toISOString?.() || '', errorCode: item.error?.code || '', errorMessage: item.error?.message || '',
      costAmount: item.actualCost?.amount ?? '', costCurrency: item.actualCost?.currency || '',
      attempts: attemptCounts.get(String(item._id)) || 0,
    }));
  }

  async listTemplates(actor, { channel, includeArchived = false } = {}) {
    const filter = { $or: [{ createdBy: actor }, { isShared: true }] };
    if (channel) filter.channel = channel;
    if (!includeArchived) filter.isArchived = false;
    return MessageTemplate.find(filter).sort({ channel: 1, name: 1 }).lean();
  }

  async createTemplate(input, actor, meta = {}) {
    const { twilioContentSid = null, ...metaWhatsappFields } = input.whatsapp || {};
    const whatsappMetadata = Object.values(metaWhatsappFields).some((value) => (
      Array.isArray(value) ? value.length > 0 : value != null && value !== ''
    ));
    if (input.channel === 'whatsapp' && whatsappMetadata) {
      throw new ValidationError('Meta WhatsApp approval metadata can only be created by synchronizing with Meta');
    }
    const template = await MessageTemplate.create({
      ...input,
      whatsapp: input.channel === 'whatsapp' ? { twilioContentSid } : input.whatsapp,
      requiredVariables: extractVariables(input.subject, input.bodyHtml, input.bodyText),
      createdBy: actor, updatedBy: actor,
    });
    auditService.logEvent({
      eventType: 'messaging.template.created', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'messaging',
      details: { templateId: template._id, channel: template.channel, isShared: template.isShared },
    });
    return template;
  }

  async updateTemplate(id, input, actor, meta = {}) {
    const template = await MessageTemplate.findOne({ _id: id, createdBy: actor });
    if (!template) throw new NotFoundError('MessageTemplate', id);
    if (input.channel && input.channel !== template.channel) throw new ConflictError('Template channel cannot be changed');
    if (template.channel === 'whatsapp') {
      const synced = Boolean(template.whatsapp?.providerDefinition);
      const protectedFields = ['subject', 'bodyHtml', 'bodyText', 'fallbackValues'];
      const whatsappKeys = Object.keys(input.whatsapp || {}).filter((key) => key !== 'twilioContentSid');
      if (synced && (protectedFields.some((field) => Object.hasOwn(input, field)) || whatsappKeys.length)) {
        throw new ConflictError('Meta-synchronized template content and approval metadata are read-only');
      }
      const whatsappMetadata = whatsappKeys.map((key) => input.whatsapp[key]).some((value) => (
        Array.isArray(value) ? value.length > 0 : value != null && value !== ''
      ));
      if (!synced && whatsappMetadata) {
        throw new ValidationError('Meta WhatsApp approval metadata can only be updated by synchronizing with Meta');
      }
    }
    const update = { ...input, updatedBy: actor };
    delete update.channel;
    if (template.channel === 'whatsapp' && input.whatsapp && Object.keys(input.whatsapp).every((key) => key === 'twilioContentSid')) {
      delete update.whatsapp;
      update['whatsapp.twilioContentSid'] = input.whatsapp.twilioContentSid || null;
    }
    if (['subject', 'bodyHtml', 'bodyText', 'whatsapp'].some((field) => Object.hasOwn(input, field))) {
      update.requiredVariables = extractVariables(
        input.subject ?? template.subject,
        input.bodyHtml ?? template.bodyHtml,
        input.bodyText ?? template.bodyText,
        JSON.stringify(input.whatsapp?.components ?? template.whatsapp?.components ?? []),
      );
    }
    const updated = await MessageTemplate.findOneAndUpdate(
      { _id: id, createdBy: actor }, { $set: update },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new NotFoundError('MessageTemplate', id);
    auditService.logEvent({
      eventType: 'messaging.template.updated', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'messaging',
      details: { templateId: updated._id, channel: updated.channel, changedFields: Object.keys(input).sort() },
    });
    return updated;
  }

  async duplicateTemplate(id, actor, meta = {}) {
    const source = await MessageTemplate.findOne({
      _id: id, $or: [{ createdBy: actor }, { isShared: true }],
    }).lean();
    if (!source) throw new NotFoundError('MessageTemplate', id);
    const copy = { ...source };
    delete copy._id; delete copy.createdAt; delete copy.updatedAt; delete copy.__v;
    const template = await MessageTemplate.create({
      ...copy, name: `${source.name} (copy)`, isShared: false,
      createdBy: actor, updatedBy: actor,
    });
    auditService.logEvent({
      eventType: 'messaging.template.duplicated', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'messaging',
      details: { sourceTemplateId: source._id, templateId: template._id, channel: template.channel },
    });
    return template;
  }

  async archiveTemplate(id, actor, meta = {}) {
    const template = await MessageTemplate.findOneAndUpdate(
      { _id: id, createdBy: actor },
      { $set: { isArchived: true, updatedBy: actor } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!template) throw new NotFoundError('MessageTemplate', id);
    auditService.logEvent({
      eventType: 'messaging.template.archived', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'messaging',
      details: { templateId: template._id, channel: template.channel },
    });
    return template;
  }

  async syncMetaTemplates(actor, meta = {}) {
    let remote;
    try { remote = await metaWhatsapp.listTemplates(); }
    catch (error) { throw new AppError(error.message, 503, ERROR_CODES.EXTERNAL_SERVICE_ERROR); }
    const supportedStatuses = new Set(['approved', 'pending', 'rejected', 'paused', 'disabled']);
    const synced = [];
    for (const item of remote) {
      const approvalStatus = String(item.status || '').toLowerCase();
      const variables = [];
      for (const component of item.components || []) {
        for (const match of String(component.text || '').matchAll(/\{\{(\d+)\}\}/g)) variables.push(`parameter${match[1]}`);
      }
      const template = await MessageTemplate.findOneAndUpdate(
        { createdBy: actor, channel: 'whatsapp', 'whatsapp.metaName': item.name, 'whatsapp.language': item.language },
        { $set: {
          name: item.name, channel: 'whatsapp', category: 'meta-approved', isShared: true,
          bodyText: String((item.components || []).find((component) => String(component.type).toUpperCase() === 'BODY')?.text || ''),
          'whatsapp.metaName': item.name, 'whatsapp.language': item.language,
          'whatsapp.approvalStatus': supportedStatuses.has(approvalStatus) ? approvalStatus : 'pending',
          'whatsapp.templateCategory': String(item.category || '').toLowerCase(),
          'whatsapp.parameterOrder': [...new Set(variables)], 'whatsapp.providerDefinition': sanitizePayload(item.components || []),
          updatedBy: actor,
        }, $setOnInsert: { purpose: 'promotional', description: 'Synchronized from Meta WhatsApp Manager', createdBy: actor } },
        { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
      );
      synced.push(template);
    }
    auditService.logEvent({ eventType: 'messaging.templates.meta_synced', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { count: synced.length } });
    return { synced: synced.length, templates: synced };
  }

  async updateConsent(leadId, input, actor, meta = {}) {
    const lead = await Lead.findById(leadId).select('_id email phone mobile').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const destination = destinationFor(lead, input.channel);
    const hash = destination ? destinationHash(input.channel, destination) : null;
    if (input.status === 'granted' && hash) {
      const suppression = await Suppression.findOne({ channel: input.channel, destinationHash: hash }).select('reason source').lean();
      if (suppression) {
        throw new ConflictError('This destination is suppressed. An administrator must verify renewed opt-in evidence before reinstating consent.', {
          channel: input.channel, reason: suppression.reason,
        });
      }
    }
    const consent = await Consent.findOneAndUpdate(
      { leadId, channel: input.channel },
      { $set: { status: input.status, evidence: input.evidence || '', source: input.source || 'manual', capturedAt: input.capturedAt || new Date(), expiresAt: input.expiresAt || null, changedBy: actor } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    if (hash && ['denied', 'revoked'].includes(input.status)) {
      await Suppression.updateOne(
        { channel: input.channel, destinationHash: hash },
        { $setOnInsert: { leadId: lead._id, reason: 'admin', source: 'manual_consent_change', suppressedAt: new Date(), createdBy: actor } },
        { upsert: true },
      );
    }
    auditService.logEvent({ eventType: 'messaging.consent.changed', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { leadId, channel: input.channel, status: input.status } });
    return consent;
  }

  async getConsentProfile(leadId) {
    const lead = await Lead.findById(leadId).select('_id email phone mobile').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const destinations = Object.fromEntries(CHANNELS.map((channel) => [channel, destinationFor(lead, channel)]));
    const hashes = Object.fromEntries(CHANNELS.map((channel) => [
      channel,
      destinations[channel] ? destinationHash(channel, destinations[channel]) : null,
    ]));
    const hashClauses = CHANNELS.filter((channel) => hashes[channel]).map((channel) => ({
      channel, destinationHash: hashes[channel],
    }));
    const [consents, suppressions] = await Promise.all([
      Consent.find({ leadId }).lean(),
      Suppression.find(hashClauses.length ? { $or: hashClauses } : { _id: null }).sort({ suppressedAt: -1 }).lean(),
    ]);
    const consentByChannel = new Map(consents.map((item) => [item.channel, item]));
    const suppressionByChannel = new Map();
    for (const item of suppressions) if (!suppressionByChannel.has(item.channel)) suppressionByChannel.set(item.channel, item);
    return {
      leadId: String(lead._id),
      channels: CHANNELS.map((channel) => {
        const consent = consentByChannel.get(channel);
        const suppression = suppressionByChannel.get(channel);
        const expired = Boolean(consent?.expiresAt && new Date(consent.expiresAt) <= new Date());
        return {
          channel,
          status: consent?.status || 'unknown',
          effectiveStatus: suppression ? 'suppressed' : expired ? 'expired' : consent?.status || 'unknown',
          hasDestination: Boolean(destinations[channel]),
          evidence: consent?.evidence || '', source: consent?.source || null,
          capturedAt: consent?.capturedAt || null, expiresAt: consent?.expiresAt || null,
          changedAt: consent?.updatedAt || null,
          suppression: suppression ? {
            active: true, reason: suppression.reason, source: suppression.source,
            suppressedAt: suppression.suppressedAt,
          } : null,
        };
      }),
    };
  }

  async reinstateConsent(leadId, input, actor, meta = {}) {
    const lead = await Lead.findById(leadId).select('_id email phone mobile').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const destination = destinationFor(lead, input.channel);
    if (!destination) throw new ValidationError(`Lead has no valid ${input.channel} destination`);
    const hash = destinationHash(input.channel, destination);
    const suppression = await Suppression.findOne({ channel: input.channel, destinationHash: hash }).lean();
    if (!suppression) throw new ConflictError('The current destination is not suppressed; record consent through the standard consent workflow.');
    const consent = await Consent.findOneAndUpdate(
      { leadId, channel: input.channel },
      { $set: {
        status: 'granted', evidence: input.evidence, source: input.source || 'verified_reopt_in',
        capturedAt: input.capturedAt, expiresAt: input.expiresAt || null, changedBy: actor,
      } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    await Suppression.deleteOne({ _id: suppression._id });
    auditService.logEvent({
      eventType: 'messaging.consent.reinstated', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'messaging',
      details: { leadId, channel: input.channel, priorSuppressionReason: suppression.reason, evidenceRecorded: true },
    });
    return consent;
  }

  async providerHealth() {
    const [stored, monitored, recentErrors, unknownMessages, pendingReconciliation, queue] = await Promise.all([
      settings(),
      this.monitorProviders(),
      ProviderAttempt.aggregate([
        { $match: { outcome: { $in: ['rejected', 'ambiguous'] }, submittedAt: { $gte: new Date(Date.now() - 24 * 60 * 60_000) } } },
        { $group: { _id: { provider: '$provider', outcome: '$outcome' }, count: { $sum: 1 }, lastAt: { $max: '$submittedAt' } } },
        { $sort: { count: -1 } },
      ]),
      MessageRecipient.aggregate([
        { $match: { status: 'unknown' } },
        { $group: { _id: null, count: { $sum: 1 }, oldestAt: { $min: '$updatedAt' } } },
      ]),
      MessageRecipient.countDocuments({
        provider: { $in: ['textbee', 'twilio', 'twilio_whatsapp'] }, providerMessageId: { $type: 'string', $ne: '' },
        status: { $in: ['accepted', 'sent', 'unknown'] },
        createdAt: { $gte: new Date(Date.now() - Number(process.env.MESSAGING_RECONCILIATION_MAX_AGE_DAYS || 7) * 24 * 60 * 60_000) },
      }),
      queueManager.getQueueStats(OUTBOUND_QUEUE).catch(() => null),
    ]);
    return {
      settings: stored, providers: monitored.providers,
      operations: {
        checkedAt: monitored.checkedAt, snapshots: monitored.snapshots,
        unknown: unknownMessages[0] || { count: 0, oldestAt: null },
        pendingReconciliation, recentErrors, queue,
        readiness: buildMessagingReadiness(stored, monitored.providers, process.env, queue),
      },
    };
  }

  async updateSettings(input, actor, meta = {}) {
    const updates = { updatedBy: actor };
    for (const [section, values] of Object.entries(input)) {
      if (Array.isArray(values)) updates[section] = values;
      else for (const [field, value] of Object.entries(values || {})) updates[`${section}.${field}`] = value;
    }
    const result = await ProviderSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: updates, $setOnInsert: { key: 'global' } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).select('-quotaLedger');
    auditService.logEvent({ eventType: 'messaging.settings.changed', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'messaging', details: { fields: Object.keys(input) } });
    return result;
  }
}

export { refreshCampaignSummary };
export default new MessagingService();
