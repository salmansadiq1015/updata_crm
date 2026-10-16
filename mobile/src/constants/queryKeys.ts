// Stable, hierarchical query keys. Invalidate by prefix (e.g. `queryKeys.leads.all`).
import type { LeadListFilters } from '@/features/leads/types';

export const queryKeys = {
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
  },
  leads: {
    all: ['leads'] as const,
    lists: ['leads', 'list'] as const,
    list: (filters: LeadListFilters) => ['leads', 'list', filters] as const,
    recent: ['leads', 'recent'] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
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
  },
  notifications: {
    all: ['notifications'] as const,
    feed: ['notifications', 'feed'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
} as const;
