export const NOTIFICATION_CHANNELS = ['IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS'];

export const MANDATORY_NOTIFICATION_TYPES = ['maintenance_escalated'];

export const DEFAULT_QUIET_HOURS = Object.freeze({
  enabled: false,
  startTime: '20:00',
  endTime: '07:00',
  timezone: 'Europe/Zurich',
  bypassCritical: true,
});

export const NOTIFICATION_PREFERENCE_TYPES = Object.freeze([
  { type: 'task_assigned', category: 'TASK', labelKey: 'notifications.type.task_assigned' },
  { type: 'task_completed', category: 'TASK', labelKey: 'notifications.type.task_completed' },
  { type: 'task_overdue', category: 'TASK', labelKey: 'notifications.type.task_overdue' },
  { type: 'task_mention', category: 'TASK', labelKey: 'notifications.type.task_mention' },
  { type: 'task_reminder', category: 'TASK', labelKey: 'notifications.type.task_reminder' },
  { type: 'task_list_invitation', category: 'TASK', labelKey: 'notifications.type.task_list_invitation' },
  { type: 'new_assignment', category: 'SCHEDULING', labelKey: 'notifications.type.new_assignment' },
  { type: 'assignment_updated', category: 'SCHEDULING', labelKey: 'notifications.type.assignment_updated' },
  { type: 'assignment_moved', category: 'SCHEDULING', labelKey: 'notifications.type.assignment_moved' },
  { type: 'assignment_cancelled', category: 'SCHEDULING', labelKey: 'notifications.type.assignment_cancelled' },
  { type: 'chat_message', category: 'CHAT', labelKey: 'notifications.type.chat_message' },
  { type: 'quotation_expired', category: 'FINANCE', labelKey: 'notifications.type.quotation_expired' },
  { type: 'invoice_overdue', category: 'FINANCE', labelKey: 'notifications.type.invoice_overdue' },
  { type: 'document_ready', category: 'DOCUMENT', labelKey: 'notifications.type.document_ready' },
  { type: 'maintenance_overdue', category: 'MAINTENANCE', labelKey: 'notifications.type.maintenance_overdue' },
  { type: 'maintenance_due', category: 'MAINTENANCE', labelKey: 'notifications.type.maintenance_due' },
  { type: 'maintenance_escalated', category: 'MAINTENANCE', labelKey: 'notifications.type.maintenance_escalated', mandatory: true },
  { type: 'website_service_request', category: 'CRM', labelKey: 'notifications.type.website_service_request' },
  { type: 'ap_invoice_approval_needed', category: 'FINANCE', labelKey: 'notifications.type.ap_invoice_approval_needed' },
  { type: 'report_submitted', category: 'ORDER', labelKey: 'notifications.type.report_submitted' },
  { type: 'order_status_changed', category: 'ORDER', labelKey: 'notifications.type.order_status_changed' },
]);

export function isMandatoryNotificationType(notificationType) {
  return MANDATORY_NOTIFICATION_TYPES.includes(notificationType);
}

export function normalizeNotificationPreferences(response) {
  const payload = response?.data ?? response ?? {};
  const quietHours = payload.quietHours || payload.quiet_hours || {};

  return {
    ...payload,
    preferences: Array.isArray(payload.preferences) ? payload.preferences : [],
    quietHours: {
      ...DEFAULT_QUIET_HOURS,
      enabled: Boolean(quietHours.enabled ?? quietHours.quietHoursEnabled ?? DEFAULT_QUIET_HOURS.enabled),
      startTime: quietHours.startTime || quietHours.start || quietHours.quietHoursStart || DEFAULT_QUIET_HOURS.startTime,
      endTime: quietHours.endTime || quietHours.end || quietHours.quietHoursEnd || DEFAULT_QUIET_HOURS.endTime,
      timezone: quietHours.timezone || DEFAULT_QUIET_HOURS.timezone,
      bypassCritical: quietHours.bypassCritical ?? DEFAULT_QUIET_HOURS.bypassCritical,
    },
  };
}

export function isPreferenceEnabled(preferences, notificationType, channel) {
  if (isMandatoryNotificationType(notificationType)) return true;
  const entries = Array.isArray(preferences) ? preferences : [];
  const entry = entries.find((item) => item.notificationType === notificationType && item.channel === channel);
  return entry ? entry.enabled !== false : true;
}

export function setPreferenceEnabled(preferences, notificationType, channel, enabled) {
  const entries = Array.isArray(preferences) ? preferences : [];
  const nextEnabled = isMandatoryNotificationType(notificationType) ? true : Boolean(enabled);
  const existingIndex = entries.findIndex((item) => item.notificationType === notificationType && item.channel === channel);

  if (existingIndex >= 0) {
    return entries.map((item, index) => (
      index === existingIndex ? { ...item, enabled: nextEnabled } : item
    ));
  }

  return [...entries, { notificationType, channel, enabled: nextEnabled }];
}

export function setQuietHoursValue(quietHours, field, value) {
  return {
    ...DEFAULT_QUIET_HOURS,
    ...(quietHours || {}),
    [field]: value,
  };
}

export function toNotificationPreferencesPayload(preferences) {
  const normalized = normalizeNotificationPreferences(preferences);
  return {
    preferences: normalized.preferences,
    quietHours: normalized.quietHours,
  };
}
