// Paths relative to EXPO_PUBLIC_API_URL (which already ends in /api/v1). Only
// endpoints verified in server/src/modules/**/*.routes.js belong here.
export const ENDPOINTS = {
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    resetRequest: '/auth/reset-password/request',
    resetConfirm: '/auth/reset-password/confirm',
  },
  users: {
    me: '/users/me',
  },
  dashboard: {
    stats: '/dashboard/stats',
  },
  leads: {
    list: '/crm/leads',
    detail: (id: string) => `/crm/leads/${encodeURIComponent(id)}`,
  },
  // Device-originated calls/SMS (server/src/modules/crm/leadCommunication.routes.js).
  communications: {
    list: (leadId: string) => `/crm/leads/${encodeURIComponent(leadId)}/communications`,
    eligibility: (leadId: string) => `/crm/leads/${encodeURIComponent(leadId)}/communications/eligibility`,
    events: (leadId: string, operationId: string) =>
      `/crm/leads/${encodeURIComponent(leadId)}/communications/${encodeURIComponent(operationId)}/events`,
    complete: (leadId: string, operationId: string) =>
      `/crm/leads/${encodeURIComponent(leadId)}/communications/${encodeURIComponent(operationId)}/complete`,
    qualification: (leadId: string) => `/crm/leads/${encodeURIComponent(leadId)}/qualification`,
    propose: (leadId: string) => `/crm/leads/${encodeURIComponent(leadId)}/qualification/propose`,
  },
  messaging: {
    templates: '/messaging/templates',
    // AI SMS = messaging campaigns with channel "sms" (server/src/modules/messaging/messaging.routes.js).
    health: '/messaging/settings/health',
    campaigns: '/messaging/campaigns',
    campaign: (id: string) => `/messaging/campaigns/${encodeURIComponent(id)}`,
    recipients: (id: string) => `/messaging/campaigns/${encodeURIComponent(id)}/recipients`,
    start: (id: string) => `/messaging/campaigns/${encodeURIComponent(id)}/start`,
    pause: (id: string) => `/messaging/campaigns/${encodeURIComponent(id)}/pause`,
    resume: (id: string) => `/messaging/campaigns/${encodeURIComponent(id)}/resume`,
    cancel: (id: string) => `/messaging/campaigns/${encodeURIComponent(id)}/cancel`,
  },
  // AI voice agent (server/src/modules/aiCalling/aiCalling.routes.js). Cloud telephony, never the SIM.
  aiCalling: {
    languages: '/ai-calling/languages',
    telephonyHealth: '/ai-calling/telephony/health',
    campaigns: '/ai-calling/campaigns',
    campaign: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}`,
    preview: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/preview`,
    simulate: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/simulate`,
    recipients: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/recipients`,
    start: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/start`,
    pause: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/pause`,
    resume: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/resume`,
    cancel: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/cancel`,
  },
  notifications: {
    feed: '/users/me/notifications',
    unreadCount: '/users/me/notifications/unread-count',
    markRead: (id: string) => `/users/me/notifications/${encodeURIComponent(id)}/read`,
    markAllRead: '/users/me/notifications/mark-all-read',
  },
} as const;

/** Endpoints whose 401 means "wrong credentials/token", never "refresh and retry". */
export const AUTH_ENDPOINTS_WITHOUT_REFRESH: readonly string[] = [
  ENDPOINTS.auth.login,
  ENDPOINTS.auth.refresh,
  ENDPOINTS.auth.resetRequest,
  ENDPOINTS.auth.resetConfirm,
];
