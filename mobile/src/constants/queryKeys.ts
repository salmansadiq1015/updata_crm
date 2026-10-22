// Stable, hierarchical query keys. Invalidate by prefix (e.g. `queryKeys.leads.all`).
import type { LeadListFilters } from '@/features/leads/types';

export const queryKeys = {
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    mobileCrm: ['dashboard', 'mobile-crm'] as const,
  },
  leads: {
    all: ['leads'] as const,
    lists: ['leads', 'list'] as const,
    list: (filters: LeadListFilters) => ['leads', 'list', filters] as const,
    recent: ['leads', 'recent'] as const,
    directory: ['leads', 'directory'] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
  },
  followUps: {
    all: ['follow-ups'] as const,
    list: (scope: string) => ['follow-ups', scope] as const,
  },
  communication: {
    all: ['communication'] as const,
    history: (leadId: string) => ['communication', 'history', leadId] as const,
    eligibility: (leadId: string, channel: string, field: string) =>
      ['communication', 'eligibility', leadId, channel, field] as const,
    qualification: (leadId: string) => ['communication', 'qualification', leadId] as const,
    smsTemplates: ['communication', 'sms-templates'] as const,
    capabilities: ['communication', 'capabilities'] as const,
    sims: ['communication', 'sims'] as const,
  },
  aiAgent: {
    all: ['ai-agent'] as const,
    languages: ['ai-agent', 'languages'] as const,
    telephonyHealth: ['ai-agent', 'telephony-health'] as const,
    messagingHealth: ['ai-agent', 'messaging-health'] as const,
    smsTemplates: ['ai-agent', 'sms-templates'] as const,
    campaigns: ['ai-agent', 'campaigns'] as const,
    campaign: (kind: 'call' | 'sms', id: string) => ['ai-agent', 'campaign', kind, id] as const,
    recipients: (kind: 'call' | 'sms', id: string) => ['ai-agent', 'recipients', kind, id] as const,
    callPreview: (id: string) => ['ai-agent', 'call-preview', id] as const,
    callHistory: (leadId: string) => ['ai-agent', 'call-history', leadId] as const,
    call: (id: string) => ['ai-agent', 'call', id] as const,
    analytics: (from?: string, to?: string) => ['ai-agent', 'analytics', from, to] as const,
  },
  smsAgent: {
    all: ['sms-agent'] as const,
    campaigns: ['sms-agent', 'campaigns'] as const,
    campaign: (id: string) => ['sms-agent', 'campaign', id] as const,
    conversations: (id: string) => ['sms-agent', 'conversations', id] as const,
    conversation: (id: string) => ['sms-agent', 'conversation', id] as const,
    readiness: ['sms-agent', 'readiness'] as const,
  },
  linkAssistant: {
    all: ['link-assistant'] as const,
    campaigns: ['link-assistant', 'campaigns'] as const,
    settings: ['link-assistant', 'settings'] as const,
    templates: (campaignId: string | null) =>
      ['link-assistant', 'templates', campaignId ?? 'default'] as const,
    remindersDue: ['link-assistant', 'reminders-due'] as const,
    leadSessions: (leadId: string) => ['link-assistant', 'lead', leadId] as const,
    session: (id: string) => ['link-assistant', 'session', id] as const,
  },
  readiness: {
    server: ['readiness', 'server'] as const,
    microphone: ['readiness', 'microphone'] as const,
    battery: ['readiness', 'battery'] as const,
  },
  callCampaigns: {
    all: ['call-campaigns'] as const,
    list: (status?: string, q?: string) => ['call-campaigns', 'list', status ?? 'all', q ?? ''] as const,
    campaign: (id: string) => ['call-campaigns', 'campaign', id] as const,
    tasks: (id: string, state?: string) => ['call-campaigns', 'tasks', id, state ?? 'all'] as const,
    events: (id: string) => ['call-campaigns', 'events', id] as const,
    callbacks: (status: string) => ['call-campaigns', 'callbacks', status] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    feed: ['notifications', 'feed'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
} as const;
