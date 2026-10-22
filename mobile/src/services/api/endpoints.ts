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
    // Lightweight active-user directory; available to every authenticated user.
    directory: '/users/directory',
    // PATCH merges only the keys sent (server/src/modules/auth/user.controller.js updatePreferences).
    preferences: '/users/me/preferences',
  },
  dashboard: {
    stats: '/dashboard/stats',
    mobileCrm: '/dashboard/mobile-crm',
  },
  leads: {
    list: '/crm/leads',
    detail: (id: string) => `/crm/leads/${encodeURIComponent(id)}`,
    bulkDelete: '/crm/leads/bulk-delete',
    bulkAssign: '/crm/leads/bulk-assign',
    // Follow-ups agenda across leads (lead.routes.js, before /:id).
    followUps: '/crm/leads/follow-ups',
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
    transcribe: (leadId: string) => `/crm/leads/${encodeURIComponent(leadId)}/qualification/transcribe`,
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
    retry: (id: string) => `/ai-calling/campaigns/${encodeURIComponent(id)}/retry`,
    call: (id: string) => `/ai-calling/calls/${encodeURIComponent(id)}`,
    leadHistory: (leadId: string) => `/ai-calling/leads/${encodeURIComponent(leadId)}/history`,
    analytics: '/ai-calling/analytics',
  },
  // SIM call campaigns: AI-assisted calling from THIS phone's SIM (server/src/modules/simCall).
  simCalls: {
    readiness: '/sim-calls/readiness',
    campaigns: '/sim-calls/campaigns',
    campaign: (id: string) => `/sim-calls/campaigns/${encodeURIComponent(id)}`,
    action: (id: string, action: 'start' | 'resume' | 'pause' | 'cancel' | 'retry') =>
      `/sim-calls/campaigns/${encodeURIComponent(id)}/${action}`,
    tasks: (id: string) => `/sim-calls/campaigns/${encodeURIComponent(id)}/tasks`,
    events: (id: string) => `/sim-calls/campaigns/${encodeURIComponent(id)}/events`,
    next: (id: string) => `/sim-calls/campaigns/${encodeURIComponent(id)}/next`,
    task: (id: string) => `/sim-calls/tasks/${encodeURIComponent(id)}`,
    taskAction: (id: string, action: 'dial' | 'release' | 'skip' | 'complete' | 'sync') =>
      `/sim-calls/tasks/${encodeURIComponent(id)}/${action}`,
    answers: (id: string) => `/sim-calls/tasks/${encodeURIComponent(id)}/answers`,
    callback: (id: string) => `/sim-calls/tasks/${encodeURIComponent(id)}/callback`,
    callbacks: '/sim-calls/callbacks',
    leadTasks: (leadId: string) => `/sim-calls/leads/${encodeURIComponent(leadId)}/tasks`,
  },
  // SMS link assistant (server/src/modules/linkAssistant): personal chat links sent by SMS.
  linkAssistant: {
    settings: '/link-assistant/settings',
    templates: '/link-assistant/templates',
    remindersDue: '/link-assistant/reminders/due',
    session: (id: string) => `/link-assistant/sessions/${encodeURIComponent(id)}`,
    leadSessions: (leadId: string) => `/link-assistant/leads/${encodeURIComponent(leadId)}/sessions`,
    contactStatus: (leadId: string) => `/link-assistant/leads/${encodeURIComponent(leadId)}/contact-status`,
    optOut: (leadId: string) => `/link-assistant/leads/${encodeURIComponent(leadId)}/opt-out`,
  },
  // AI SMS agent over THIS phone's SIM (server/src/modules/simSms). Private build only.
  simSms: {
    campaigns: '/sim-sms/campaigns',
    campaign: (id: string) => `/sim-sms/campaigns/${encodeURIComponent(id)}`,
    start: (id: string) => `/sim-sms/campaigns/${encodeURIComponent(id)}/start`,
    pause: (id: string) => `/sim-sms/campaigns/${encodeURIComponent(id)}/pause`,
    cancel: (id: string) => `/sim-sms/campaigns/${encodeURIComponent(id)}/cancel`,
    conversations: (id: string) => `/sim-sms/campaigns/${encodeURIComponent(id)}/conversations`,
    conversation: (id: string) => `/sim-sms/conversations/${encodeURIComponent(id)}`,
    resolve: (id: string) => `/sim-sms/conversations/${encodeURIComponent(id)}/resolve`,
    leadConversations: (leadId: string) => `/sim-sms/leads/${encodeURIComponent(leadId)}/conversations`,
    lease: '/sim-sms/device/lease',
    attempting: (id: string) => `/sim-sms/device/messages/${encodeURIComponent(id)}/attempting`,
    result: (id: string) => `/sim-sms/device/messages/${encodeURIComponent(id)}/result`,
    delivery: (id: string) => `/sim-sms/device/messages/${encodeURIComponent(id)}/delivery`,
    watchList: '/sim-sms/device/watch-list',
    inbound: '/sim-sms/device/inbound',
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
