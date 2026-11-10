'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api/client';
import { useAllCallingAgents } from '@/modules/aiCalling/hooks/use-calling-agents';

/** Lookups for node configuration (existing CRM endpoints — nothing workflow-specific). */
export interface DirectoryUser { _id: string; firstName?: string; lastName?: string; email?: string }
export interface MessageTemplateOption { _id: string; name: string; channel: 'sms' | 'email' | 'whatsapp'; subject?: string; bodyText?: string; purpose?: string; whatsapp?: { approvalStatus?: string } }
export interface LeadOption { _id: string; name?: string; leadNumber?: string; status?: string; mobile?: string; phone?: string; email?: string }

const data = <T,>(res: unknown) => ((res as { data: T }).data);

export function useDirectoryUsers(search = '') {
  return useQuery({
    queryKey: ['workflows', 'lookup', 'users', search],
    queryFn: async () => data<DirectoryUser[]>(await api.get('/users/directory', { params: { limit: 100, ...(search ? { search } : {}) } })) || [],
    staleTime: 60_000,
  });
}

export function useMessageTemplates(channel: 'sms' | 'email' | 'whatsapp' | null) {
  return useQuery({
    queryKey: ['workflows', 'lookup', 'templates', channel],
    queryFn: async () => data<MessageTemplateOption[]>(await api.get('/messaging/templates', { params: { channel } })) || [],
    enabled: Boolean(channel),
    staleTime: 60_000,
  });
}

export function useLeadSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['workflows', 'lookup', 'leads', q],
    queryFn: async () => data<LeadOption[]>(await api.get('/crm/leads', { params: { q, limit: 20 } })) || [],
    enabled,
    staleTime: 15_000,
  });
}

export function useAgentOptions() {
  const q = useAllCallingAgents();
  return { ...q, agents: (q.data ?? []).filter((a) => a.availability !== 'archived') };
}
