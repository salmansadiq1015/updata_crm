export const CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);
export const CAMPAIGN_STATUSES = Object.freeze([
  'draft', 'scheduled', 'queued', 'running', 'paused', 'completed', 'cancelled', 'failed',
]);
export const MESSAGE_STATUSES = Object.freeze([
  'draft', 'queued', 'submitting', 'accepted', 'sent', 'delivered', 'read',
  'failed', 'undelivered', 'unknown', 'cancelled', 'suppressed', 'ineligible',
]);

export const STATUS_RANK = Object.freeze({
  draft: 0,
  queued: 10,
  submitting: 20,
  accepted: 30,
  sent: 40,
  delivered: 50,
  read: 60,
  undelivered: 70,
  failed: 70,
  unknown: 25,
  cancelled: 80,
  suppressed: 80,
  ineligible: 80,
});

export const TERMINAL_STATUSES = new Set([
  'read', 'delivered', 'undelivered', 'failed', 'cancelled', 'suppressed', 'ineligible',
]);

export const CONSENT_STATUSES = Object.freeze(['granted', 'denied', 'revoked', 'unknown']);
export const MESSAGE_PURPOSES = Object.freeze(['transactional', 'promotional', 'support']);
export const PROVIDERS = Object.freeze(['existing_email', 'meta_whatsapp', 'textbee', 'twilio', 'twilio_whatsapp']);

export const OUTBOUND_QUEUE = 'outbound-messaging';
export const OUTBOUND_RECOVERY_QUEUE = 'outbound-messaging-recovery';

export const normalizeProviderStatus = (provider, value) => {
  const status = String(value || '').toLowerCase();
  if (provider === 'meta_whatsapp') {
    return ({ sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' })[status] || null;
  }
  if (provider === 'twilio' || provider === 'twilio_whatsapp') {
    return ({
      accepted: 'accepted', scheduled: 'accepted', queued: 'accepted', sending: 'accepted', sent: 'sent',
      delivered: 'delivered', undelivered: 'undelivered', failed: 'failed', cancelled: 'cancelled',
    })[status] || null;
  }
  if (provider === 'textbee') {
    return ({
      pending: 'accepted', processing: 'accepted', dispatched: 'accepted', queued: 'accepted', accepted: 'accepted',
      sent: 'sent', delivered: 'delivered', failed: 'failed', unknown: 'unknown',
    })[status] || null;
  }
  if (provider === 'existing_email') {
    return ({ queued: 'accepted', sent: 'sent', delivered: 'delivered', bounced: 'failed', failed: 'failed' })[status] || null;
  }
  return null;
};
