export const ALL_AUDIT_EVENTS = [
  'login.success',
  'login.failed',
  'logout',
  'password.changed',
  'password.reset_requested',
  'user.created',
  'user.deactivated',
  'role.changed',
  'session.revoked',
  'permission.denied',
  'notification.created',
  'notification_template.created',
  'notification_template.updated',
  'notification_template.deleted',
  'scheduled_notification.created',
  'scheduled_notification.updated',
  'scheduled_notification.deleted',
  'scheduled_notification.cancelled',
  'scheduled_notification.paused',
  'scheduled_notification.resumed',
  'notification_preference.updated',
  'notification_history.anonymized',
];

const EVENT_FALLBACKS = {
  'login.success': 'Signed in',
  'login.failed': 'Sign-in failed',
  logout: 'Signed out',
  'password.changed': 'Changed password',
  'password.reset_requested': 'Requested password reset',
  'user.created': 'Created a user',
  'user.deactivated': 'Deactivated a user',
  'role.changed': 'Changed a role',
  'session.revoked': 'Revoked a session',
  'permission.denied': 'Was denied access',
  'notification.created': 'Created a notification',
  'notification_template.created': 'Created a notification template',
  'notification_template.updated': 'Updated a notification template',
  'notification_template.deleted': 'Deleted a notification template',
  'scheduled_notification.created': 'Created a scheduled notification',
  'scheduled_notification.updated': 'Updated a scheduled notification',
  'scheduled_notification.deleted': 'Deleted a scheduled notification',
  'scheduled_notification.cancelled': 'Cancelled a scheduled notification',
  'scheduled_notification.paused': 'Paused a scheduled notification',
  'scheduled_notification.resumed': 'Resumed a scheduled notification',
  'notification_preference.updated': 'Updated notification preferences',
  'notification_history.anonymized': 'Anonymized notification history',
};

export function getAuditEventType(entry) {
  return entry?.eventType || entry?.event || entry?.type || 'unknown';
}

export function humanizeAuditToken(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown event';
  return text
    .replace(/[_:.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getAuditActor(entry, t = (_, fallback) => fallback) {
  const details = entry?.details || entry?.metadata || {};
  const user = entry?.user || {};
  return (
    entry?.email
    || entry?.userEmail
    || user.email
    || details.email
    || details.userEmail
    || details.actorEmail
    || t('audit.actor.system', 'System')
  );
}

export function getAuditEventLabel(entry, t = (_, fallback) => fallback) {
  const eventType = getAuditEventType(entry);
  const fallback = EVENT_FALLBACKS[eventType] || humanizeAuditToken(eventType);
  return t(`audit.event.${eventType}`, fallback);
}

export function buildAuditMessage(entry, t = (_, fallback) => fallback) {
  const details = entry?.details || entry?.metadata || {};
  const eventType = getAuditEventType(entry);
  const actor = getAuditActor(entry, t);
  const target =
    details.targetEmail
    || details.targetUserEmail
    || details.email
    || details.type
    || details.category
    || details.module
    || '';

  const templates = {
    'login.success': () => t('audit.message.login.success', '{actor} signed in successfully.', { actor }),
    'login.failed': () => t('audit.message.login.failed', 'A sign-in attempt failed for {target}.', { target: target || actor }),
    logout: () => t('audit.message.logout', '{actor} signed out.', { actor }),
    'password.changed': () => t('audit.message.password.changed', '{actor} changed their password.', { actor }),
    'password.reset_requested': () => t('audit.message.password.reset_requested', 'A password reset was requested for {target}.', { target: target || actor }),
    'user.created': () => t('audit.message.user.created', '{actor} created user {target}.', { actor, target: target || t('common.unknown', 'Unknown') }),
    'user.deactivated': () => t('audit.message.user.deactivated', '{actor} deactivated user {target}.', { actor, target: target || t('common.unknown', 'Unknown') }),
    'role.changed': () => t('audit.message.role.changed', '{actor} changed a role or permission set.', { actor }),
    'session.revoked': () => t('audit.message.session.revoked', '{actor} ended a user session.', { actor }),
    'permission.denied': () => t('audit.message.permission.denied', '{actor} tried to access something without permission.', { actor }),
  };

  if (templates[eventType]) return templates[eventType]();
  return t('audit.message.generic', '{actor} performed: {action}.', {
    actor,
    action: getAuditEventLabel(entry, t),
  });
}

function dayBoundaryIso(value, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const candidate = value.includes('T') ? value : `${value}${suffix}`;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function buildAuditQueryParams(filters = {}, cursor = null) {
  const params = {};
  if (filters.startDate) params.startDate = dayBoundaryIso(filters.startDate);
  if (filters.endDate) params.endDate = dayBoundaryIso(filters.endDate, true);
  if (filters.eventType) params.eventType = filters.eventType;
  if (filters.result) params.result = filters.result;
  if (filters.email) params.email = filters.email.trim();
  if (filters.module) params.module = filters.module.trim();
  if (filters.search) params.search = filters.search.trim();
  if (filters.limit) params.limit = Number(filters.limit);
  if (cursor) params.cursor = cursor;
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== null && value !== ''));
}

export function getAuditDetailsHighlights(details, max = 4) {
  if (!details || typeof details !== 'object') return [];
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, max)
    .map(([key, value]) => ({
      key,
      label: humanizeAuditToken(key),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
}
