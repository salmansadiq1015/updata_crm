'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@/lib/toast';
import { callingAgentApi } from '../services/calling-agent-api';
import type { AgentFilters, AgentLaunchInput, CallingAgentInput } from '../types/ai-calling-types';

export function useCallingAgents(filters: AgentFilters = {}) {
  return useQuery({ queryKey: ['ai-calling', 'agents', filters], queryFn: () => callingAgentApi.list(filters), refetchInterval: 15000 });
}
export function useCallingAgent(id: string) {
  return useQuery({ queryKey: ['ai-calling', 'agent', id], queryFn: () => callingAgentApi.get(id), refetchInterval: 10000 });
}
export function useAgentCallAnalytics(id: string, params: { from?: string; to?: string } = {}) {
  return useQuery({ queryKey: ['ai-calling', 'agent', id, 'call-analytics', params], queryFn: () => callingAgentApi.callAnalytics(id, params), refetchInterval: 30000 });
}
export function useAgentMutations() {
  const qc = useQueryClient();
  const options = { onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ai-calling'] }); }, onError: (error: unknown) => showError(error) };
  return {
    create: useMutation({ mutationFn: (input: CallingAgentInput) => callingAgentApi.create(input), ...options }),
    update: useMutation({ mutationFn: ({ id, ...input }: Partial<CallingAgentInput> & { id: string; version: number }) => callingAgentApi.update(id, input), ...options }),
    assign: useMutation({ mutationFn: ({ id, leadIds, version, mode }: { id: string; leadIds: string[]; version: number; mode?: 'replace' | 'add' }) => mode ? callingAgentApi.assign(id, leadIds, version, mode) : callingAgentApi.assign(id, leadIds, version), ...options }),
    duplicate: useMutation({ mutationFn: (id: string) => callingAgentApi.duplicate(id), ...options }),
    remove: useMutation({ mutationFn: (id: string) => callingAgentApi.remove(id), ...options }),
    launch: useMutation({ mutationFn: ({ id, input }: { id: string; input: AgentLaunchInput }) => callingAgentApi.launch(id, input), ...options }),
  };
}
