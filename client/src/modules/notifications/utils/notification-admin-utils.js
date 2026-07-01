export const NOTIFICATION_ADMIN_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
export const NOTIFICATION_ADMIN_STATUSES = ['QUEUED', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'BOUNCED', 'CANCELLED'];
export const NOTIFICATION_ADMIN_SCHEDULE_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
export const NOTIFICATION_ADMIN_CATEGORIES = ['TASK', 'ORDER', 'CHAT', 'SYSTEM', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'CRM', 'PROJECT', 'SCHEDULING'];
export const NOTIFICATION_ADMIN_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
export const NOTIFICATION_ADMIN_LANGUAGES = ['de', 'fr', 'it', 'en'];
export const NOTIFICATION_ADMIN_PERIODS = ['24h', '7d', '30d'];
export const NOTIFICATION_ADMIN_HISTORY_LIMIT = 50;
export const NOTIFICATION_ADMIN_SCHEDULE_LIMIT = 50;
export const NOTIFICATION_ADMIN_STALE_REVIEW_MINUTES = 60;
export const NOTIFICATION_ADMIN_STALE_REVIEW_CHANNELS = ['EMAIL', 'WHATSAPP'];
export const DEFAULT_TEMPLATE_SAMPLE_JSON = '{"customer":{"name":"Muster AG"},"appointment":{"date":"2026-06-23"}}';

export const DEFAULT_TEMPLATE_FORM = Object.freeze({
  id: '',
  type: '',
  channel: 'EMAIL',
  language: 'de',
  subjectTemplate: '',
  bodyTemplate: '',
  bodyHtmlTemplate: '',
  whatsappTemplateId: '',
  variables: '{}',
});

export const DEFAULT_SCHEDULE_FORM = Object.freeze({
  notificationType: '',
  category: 'SYSTEM',
  scheduleType: 'ONE_TIME',
  scheduledAt: '',
  cronExpression: '0 17 * * *',
  timezone: 'Europe/Zurich',
  endDate: '',
  recipientIds: '',
  channels: ['IN_APP'],
  priority: 'NORMAL',
  title: '',
  body: '',
  bodyHtml: '',
  deepLink: '',
  payloadJson: '{}',
});

const DATE_LOCALE_MAP = {
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  en: 'en-US',
};

export function localDateTimeValue(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function withDefaultScheduleTime(form = DEFAULT_SCHEDULE_FORM) {
  return {
    ...DEFAULT_SCHEDULE_FORM,
    ...form,
    scheduledAt: form.scheduledAt || localDateTimeValue(),
  };
}

export function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''),
  );
}

export function parseJsonObject(raw, label, messages = {}) {
  const text = String(raw || '').trim();
  if (!text) return { data: {} };

  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { error: messages.mustBeObject || `${label} must be a JSON object.` };
    }
    return { data: parsed };
  } catch {
    return { error: messages.invalidJson || `${label} contains invalid JSON.` };
  }
}

export function parseRecipientIds(value) {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function toggleChannel(channels, channel) {
  if (channels.includes(channel)) {
    return channels.filter((item) => item !== channel);
  }
  return [...channels, channel];
}

export function buildTemplatePayload(form, messages = {}) {
  if (!String(form.type || '').trim()) return { error: messages.typeRequired || 'Notification type is required.' };
  if (!String(form.bodyTemplate || '').trim()) return { error: messages.bodyRequired || 'Body template is required.' };

  const variablesResult = parseJsonObject(form.variables, messages.variablesLabel || 'Variables', messages.variablesJson);
  if (variablesResult.error) return { error: variablesResult.error };

  return {
    payload: compactObject({
      type: form.type.trim(),
      channel: form.channel,
      language: form.language,
      subjectTemplate: form.subjectTemplate.trim(),
      bodyTemplate: form.bodyTemplate.trim(),
      bodyHtmlTemplate: form.bodyHtmlTemplate.trim(),
      whatsappTemplateId: form.whatsappTemplateId.trim(),
      variables: variablesResult.data,
    }),
  };
}

export function templateToForm(template) {
  if (!template) return { ...DEFAULT_TEMPLATE_FORM };
  return {
    id: template._id || template.id || '',
    type: template.type || '',
    channel: template.channel || 'EMAIL',
    language: template.language || 'de',
    subjectTemplate: template.subjectTemplate || '',
    bodyTemplate: template.bodyTemplate || '',
    bodyHtmlTemplate: template.bodyHtmlTemplate || '',
    whatsappTemplateId: template.whatsappTemplateId || '',
    variables: JSON.stringify(template.variables || {}, null, 2),
  };
}

export function buildSchedulePayload(form, messages = {}) {
  if (!String(form.notificationType || '').trim()) return { error: messages.typeRequired || 'Notification type is required.' };
  if (!Array.isArray(form.channels) || form.channels.length === 0) return { error: messages.channelRequired || 'Select at least one channel.' };
  if (!String(form.body || '').trim()) return { error: messages.bodyRequired || 'Message body is required.' };

  const payloadResult = parseJsonObject(form.payloadJson, messages.payloadLabel || 'Payload JSON', messages.payloadJson);
  if (payloadResult.error) return { error: payloadResult.error };

  const basePayload = compactObject({
    title: String(form.title || '').trim(),
    body: String(form.body || '').trim(),
    bodyHtml: String(form.bodyHtml || '').trim(),
    deepLink: String(form.deepLink || '').trim(),
    ...payloadResult.data,
  });

  const payload = compactObject({
    notificationType: form.notificationType.trim(),
    category: form.category,
    scheduleType: form.scheduleType,
    timezone: form.timezone || 'Europe/Zurich',
    endDate: form.endDate ? new Date(form.endDate).toISOString() : '',
    recipientIds: parseRecipientIds(form.recipientIds),
    channels: form.channels,
    payload: basePayload,
    priority: form.priority,
  });

  if (form.scheduleType === 'ONE_TIME') {
    if (!form.scheduledAt) return { error: messages.scheduledAtRequired || 'Scheduled time is required.' };
    payload.scheduledAt = new Date(form.scheduledAt).toISOString();
  } else {
    if (!String(form.cronExpression || '').trim()) return { error: messages.cronRequired || 'Cron expression is required.' };
    payload.cronExpression = form.cronExpression.trim();
  }

  return { payload };
}

export function buildHistoryFilters({ cursor, search, channel, status }) {
  return compactObject({
    limit: NOTIFICATION_ADMIN_HISTORY_LIMIT,
    cursor,
    search: String(search || '').trim(),
    channel: channel === 'ALL' ? '' : channel,
    deliveryStatus: status === 'ALL' ? '' : status,
  });
}

export function normalizeMetrics(metrics) {
  if (!metrics) {
    return {
      totals: { sent: 0, delivered: 0, failed: 0, bounced: 0, reviewRequired: 0 },
      channels: [],
    };
  }

  if (metrics.channel && metrics.stats) {
    const stats = metrics.stats;
    return {
      totals: {
        sent: stats.sent || 0,
        delivered: stats.delivered || 0,
        failed: stats.failed || 0,
        bounced: stats.bounced || 0,
        reviewRequired: stats.reviewRequired || 0,
      },
      channels: [{ channel: metrics.channel, ...stats }],
    };
  }

  const channels = Object.entries(metrics.channels || {}).map(([channel, stats]) => ({
    channel,
    ...stats,
  }));

  const reviewRequired = channels.reduce((sum, item) => sum + (item.reviewRequired || 0), 0);
  return {
    totals: {
      sent: metrics.totals?.sent || 0,
      delivered: metrics.totals?.delivered || 0,
      failed: metrics.totals?.failed || 0,
      bounced: metrics.totals?.bounced || 0,
      reviewRequired,
    },
    channels,
  };
}

export function deliveryRate(stats) {
  const sent = stats.sent || 0;
  if (!sent) return 0;
  return Math.round(((stats.delivered || 0) / sent) * 1000) / 10;
}

export function failureRate(stats) {
  const sent = stats.sent || 0;
  if (!sent) return 0;
  return Math.round((((stats.failed || 0) + (stats.bounced || 0)) / sent) * 1000) / 10;
}

export function normalizeCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function hasAnonymizeTarget(form) {
  return Object.keys(compactObject(form || {})).length > 0;
}

export function buildNotificationAdminOverview({ metrics, templates, schedules }) {
  const normalizedMetrics = normalizeMetrics(metrics);
  const totals = normalizedMetrics.totals;
  const templateRows = normalizeCollection(templates);
  const scheduleRows = normalizeCollection(schedules);
  const scheduleStatusCounts = NOTIFICATION_ADMIN_SCHEDULE_STATUSES.reduce((acc, status) => {
    acc[status] = scheduleRows.filter((item) => item.status === status).length;
    return acc;
  }, {});

  return {
    sent: totals.sent || 0,
    delivered: totals.delivered || 0,
    failed: totals.failed || 0,
    bounced: totals.bounced || 0,
    reviewRequired: totals.reviewRequired || 0,
    deliveryRate: deliveryRate(totals),
    failureRate: failureRate(totals),
    channelCount: normalizedMetrics.channels.length,
    templateCount: templateRows.length,
    activeTemplateCount: templateRows.filter((item) => item.isActive !== false).length,
    scheduleCount: scheduleRows.length,
    activeScheduleCount: scheduleStatusCounts.ACTIVE || 0,
    pausedScheduleCount: scheduleStatusCounts.PAUSED || 0,
    scheduleStatusCounts,
  };
}

export function formatDateTime(value, locale = 'de') {
  if (!value) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE_MAP[locale] || DATE_LOCALE_MAP.de, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function downloadCsvBlob(blob, filename) {
  if (typeof window === 'undefined') return;
  const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'text/csv' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
