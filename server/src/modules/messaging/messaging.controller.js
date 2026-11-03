import crypto from 'node:crypto';
import messagingService from './messaging.service.js';
import metaWhatsapp from './providers/metaWhatsApp.provider.js';
import textBee from './providers/textbee.provider.js';
import twilio from './providers/twilio.provider.js';
import { sanitizeCsvRows } from './csvSafety.js';
import { Parser as Json2CsvParser } from '@json2csv/plainjs';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class MessagingController {
  async createCampaign(req, res, next) { try { return res.success({ data: await messagingService.createCampaign(req.body, req.user._id, meta(req)), message: 'Campaign draft created', statusCode: 201 }); } catch (e) { next(e); } }
  async listCampaigns(req, res, next) { try { const result = await messagingService.listCampaigns(req.user._id, req._validatedQuery || req.query); return res.success(result); } catch (e) { next(e); } }
  async getCampaign(req, res, next) { try { return res.success({ data: await messagingService.getCampaign(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async listRecipients(req, res, next) { try { const result = await messagingService.listRecipients(req.params.id, req.user._id, req._validatedQuery || req.query); return res.success(result); } catch (e) { next(e); } }
  async retryEligibility(req, res, next) { try { return res.success({ data: await messagingService.retryEligibility(req.params.id, req.user._id, req._validatedQuery || req.query) }); } catch (e) { next(e); } }
  async removeDraftRecipient(req, res, next) { try { return res.success({ data: await messagingService.removeDraftRecipient(req.params.id, req.params.recipientId, req.user._id, meta(req)), message: 'Recipient removed from draft' }); } catch (e) { next(e); } }
  async verifyCampaignConsent(req, res, next) { try { return res.success({ data: await messagingService.verifyCampaignRecipientConsent(req.params.id, req.body, req.user._id, meta(req)), message: 'Recipient consent verified and eligibility refreshed' }); } catch (e) { next(e); } }
  async startCampaign(req, res, next) { try { return res.success({ data: await messagingService.startCampaign(req.params.id, req.user._id, req.body, meta(req)), message: 'Campaign queued', statusCode: 202 }); } catch (e) { next(e); } }
  async pauseCampaign(req, res, next) { try { return res.success({ data: await messagingService.pauseCampaign(req.params.id, req.user._id, meta(req)), message: 'Campaign paused' }); } catch (e) { next(e); } }
  async cancelCampaign(req, res, next) { try { return res.success({ data: await messagingService.cancelCampaign(req.params.id, req.user._id, meta(req)), message: 'Campaign cancelled' }); } catch (e) { next(e); } }
  async retryRecipients(req, res, next) { try { return res.success({ data: await messagingService.retryRecipients(req.params.id, req.body.recipientIds, req.user._id, meta(req)), message: 'Eligible recipients queued for retry', statusCode: 202 }); } catch (e) { next(e); } }
  async retryEligibleRecipients(req, res, next) { try { return res.success({ data: await messagingService.retryEligibleRecipients(req.params.id, req.body, req.user._id, meta(req)), message: 'Confirmed eligible recipients queued for retry', statusCode: 202 }); } catch (e) { next(e); } }
  async reconcileRecipient(req, res, next) { try { return res.success({ data: await messagingService.reconcileRecipient(req.params.id, req.params.recipientId, req.body, req.user._id, meta(req)), message: 'Recipient outcome reconciled' }); } catch (e) { next(e); } }
  async testSend(req, res, next) { try { return res.success({ data: await messagingService.testSend(req.body, req.user._id, meta(req)), message: 'Authorized test message queued', statusCode: 202 }); } catch (e) { next(e); } }
  async exportCampaign(req, res, next) {
    try {
      const rows = await messagingService.exportCampaign(req.params.id, req.user._id);
      const fields = [
        'recipientId', 'leadNumber', 'leadName', 'channel', 'destination', 'status', 'provider',
        'providerMessageId', 'fallbackFrom', 'fallbackReason', 'acceptedAt', 'sentAt',
        'deliveredAt', 'readAt', 'failedAt', 'errorCode', 'errorMessage', 'costAmount',
        'costCurrency', 'attempts',
      ];
      const csv = new Json2CsvParser({ fields, withBOM: true }).parse(sanitizeCsvRows(rows));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="message-campaign-${req.params.id}.csv"`);
      return res.status(200).send(csv);
    } catch (e) { return next(e); }
  }
  async history(req, res, next) { try { const result = await messagingService.historyForLead(req.params.leadId, req.user._id, req._validatedQuery || req.query); return res.success(result); } catch (e) { next(e); } }
  async analytics(req, res, next) { try { return res.success({ data: await messagingService.analytics(req.user._id, req._validatedQuery || req.query) }); } catch (e) { next(e); } }
  async exportAnalytics(req, res, next) {
    try {
      const report = await messagingService.exportAnalytics(req.user._id, req._validatedQuery || req.query);
      const csv = new Json2CsvParser({
        fields: ['section', 'dimension', 'metric', 'value', 'currency'], withBOM: true,
      }).parse(sanitizeCsvRows(report.rows));
      const suffix = report.filters.from || report.filters.to
        ? `-${report.filters.from ? new Date(report.filters.from).toISOString().slice(0, 10) : 'start'}-${report.filters.to ? new Date(report.filters.to).toISOString().slice(0, 10) : 'now'}`
        : '';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="messaging-analytics${suffix}.csv"`);
      return res.status(200).send(csv);
    } catch (e) { return next(e); }
  }
  async listTemplates(req, res, next) { try { return res.success({ data: await messagingService.listTemplates(req.user._id, req._validatedQuery || req.query) }); } catch (e) { next(e); } }
  async createTemplate(req, res, next) { try { return res.success({ data: await messagingService.createTemplate(req.body, req.user._id, meta(req)), message: 'Template created', statusCode: 201 }); } catch (e) { next(e); } }
  async updateTemplate(req, res, next) {
    try {
      const template = await messagingService.updateTemplate(req.params.id, req.body, req.user._id, meta(req));
      return res.success({ data: template, message: 'Template updated' });
    } catch (e) { next(e); }
  }
  async duplicateTemplate(req, res, next) {
    try {
      const copy = await messagingService.duplicateTemplate(req.params.id, req.user._id, meta(req));
      return res.success({ data: copy, message: 'Template duplicated', statusCode: 201 });
    } catch (e) { next(e); }
  }
  async archiveTemplate(req, res, next) { try { const value = await messagingService.archiveTemplate(req.params.id, req.user._id, meta(req)); return res.success({ data: value, message: 'Template archived' }); } catch (e) { next(e); } }
  async syncMetaTemplates(req, res, next) { try { return res.success({ data: await messagingService.syncMetaTemplates(req.user._id, meta(req)), message: 'Meta templates synchronized' }); } catch (e) { next(e); } }
  async getConsent(req, res, next) { try { return res.success({ data: await messagingService.getConsentProfile(req.params.leadId) }); } catch (e) { next(e); } }
  async consent(req, res, next) { try { return res.success({ data: await messagingService.updateConsent(req.params.leadId, req.body, req.user._id, meta(req)), message: 'Consent updated' }); } catch (e) { next(e); } }
  async reinstateConsent(req, res, next) { try { return res.success({ data: await messagingService.reinstateConsent(req.params.leadId, req.body, req.user._id, meta(req)), message: 'Consent reinstated from verified evidence' }); } catch (e) { next(e); } }
  async smsServices(req, res, next) { try { return res.success({ data: await messagingService.smsServices() }); } catch (e) { next(e); } }
  async health(req, res, next) { try { return res.success({ data: await messagingService.providerHealth() }); } catch (e) { next(e); } }
  async settings(req, res, next) { try { return res.success({ data: await messagingService.updateSettings(req.body, req.user._id, meta(req)), message: 'Messaging settings updated' }); } catch (e) { next(e); } }

  async unsubscribe(req, res) {
    try {
      await messagingService.unsubscribeEmail(req.query.token);
      return res.status(200).type('html').send('<!doctype html><html><body style="font-family:system-ui;padding:48px;text-align:center"><h1>You have been unsubscribed</h1><p>This email address will no longer receive outreach messages.</p></body></html>');
    } catch {
      return res.status(400).type('html').send('<!doctype html><html><body style="font-family:system-ui;padding:48px;text-align:center"><h1>Invalid unsubscribe link</h1><p>The link is invalid or has expired.</p></body></html>');
    }
  }

  metaVerify(req, res) {
    const query = req.query;
    if (!metaWhatsapp.verifyChallenge(query['hub.mode'], query['hub.verify_token'])) return res.status(403).send('Verification failed');
    return res.status(200).send(query['hub.challenge']);
  }

  async metaWebhook(req, res, next) {
    try {
      if (!metaWhatsapp.verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.status(401).send('Invalid signature');
      for (const entry of req.body?.entry || []) for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const status of value.statuses || []) {
          await messagingService.applyProviderEvent({ provider: 'meta_whatsapp', providerMessageId: status.id, status: status.status, eventKey: `meta:${status.id}:${status.status}:${status.timestamp || ''}`, occurredAt: status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(), payload: status });
        }
        for (const message of value.messages || []) {
          const text = message.text?.body || message.button?.text || '';
          await messagingService.suppressInbound({ channel: 'whatsapp', from: message.from, provider: 'meta_whatsapp', messageId: message.id, text, payload: message });
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    } catch (e) { next(e); }
  }

  async textbeeWebhook(req, res, next) {
    try {
      if (!textBee.verifyWebhook(req.rawBody, req.get('x-signature'))) return res.status(401).send('Invalid signature');
      const body = req.body || {};
      const payloadFingerprint = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
      if (body.webhookEvent === 'MESSAGE_RECEIVED') {
        await messagingService.suppressInbound({ channel: 'sms', from: body.sender, provider: 'textbee', messageId: body.smsId || body.id || payloadFingerprint, text: body.message, payload: body });
      } else {
        const status = ({
          MESSAGE_SENT: 'sent', MESSAGE_DELIVERED: 'delivered', MESSAGE_FAILED: 'failed',
          UNKNOWN_STATE: 'unknown', MESSAGE_STATUS_UNKNOWN: 'unknown', MESSAGE_UNKNOWN: 'unknown',
        })[body.webhookEvent];
        if (status) {
          const providerMessageId = body.smsBatchId || body.smsId || `unmatched:${payloadFingerprint}`;
          const eventIdentity = body.idempotencyKey || body.eventId || `${providerMessageId || 'unmatched'}:${status}:${body.updatedAt || body.sentAt || body.deliveredAt || payloadFingerprint}`;
          await messagingService.applyProviderEvent({ provider: 'textbee', providerMessageId, status, eventKey: `textbee:${eventIdentity}`, occurredAt: new Date(body.updatedAt || body.sentAt || body.deliveredAt || Date.now()), payload: body });
        }
      }
      return res.status(200).json({ received: true });
    } catch (e) { next(e); }
  }

  async twilioWebhook(req, res, next) {
    try {
      const publicUrl = process.env.TWILIO_WEBHOOK_PUBLIC_URL || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      if (!twilio.verifyWebhook({
        signature: req.get('x-twilio-signature'), url: publicUrl, params: req.body,
        rawBody: req.rawBody, contentType: req.get('content-type'),
      })) return res.status(401).send('Invalid signature');
      const body = req.body || {};
      const isWhatsApp = String(body.To || '').startsWith('whatsapp:') || String(body.From || '').startsWith('whatsapp:');
      const provider = isWhatsApp ? 'twilio_whatsapp' : 'twilio';
      const channel = isWhatsApp ? 'whatsapp' : 'sms';
      if (body.MessageStatus || body.SmsStatus) {
        await messagingService.applyProviderEvent({ provider, providerMessageId: body.MessageSid || body.SmsSid, status: body.MessageStatus || body.SmsStatus, eventKey: `${provider}:${body.MessageSid || body.SmsSid}:${body.MessageStatus || body.SmsStatus}:${body.RawDlrDoneDate || ''}`, occurredAt: new Date(), payload: body });
      } else if (body.MessageSid && body.From) {
        await messagingService.suppressInbound({ channel, from: String(body.From).replace(/^whatsapp:/, ''), provider, messageId: body.MessageSid, text: body.Body, payload: body });
      }
      res.type('text/xml');
      return res.status(200).send('<Response></Response>');
    } catch (e) { next(e); }
  }
}

export default new MessagingController();
