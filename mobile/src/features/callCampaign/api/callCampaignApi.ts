// SIM call campaign API (server/src/modules/simCall). Every write is idempotent per
// attemptId so the outbox can safely retry it.
import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  callCampaignSchema,
  callTaskSchema,
  campaignEventSchema,
  claimResultSchema,
  dialResultSchema,
  type AnswerInput,
  type CampaignInput,
  type CompleteInput,
} from '../types';

const E = ENDPOINTS.simCalls;
type PageMeta = { total?: number; pages?: number; page?: number };
const pageOf = (pagination: unknown): PageMeta => (pagination ?? {}) as PageMeta;

export const callCampaignApi = {
  async campaigns(params: { status?: string; q?: string; page?: number } = {}, signal?: AbortSignal) {
    const { data, pagination } = await api.get(E.campaigns, z.array(callCampaignSchema), {
      signal,
      params: { limit: 20, page: params.page ?? 1, status: params.status, q: params.q || undefined },
    });
    return { data, page: pageOf(pagination) };
  },
  async campaign(id: string, signal?: AbortSignal) {
    return (await api.get(E.campaign(id), callCampaignSchema, { signal })).data;
  },
  async create(input: CampaignInput) {
    return (await api.post(E.campaigns, input, callCampaignSchema)).data;
  },
  async action(id: string, action: 'start' | 'resume' | 'pause' | 'cancel') {
    return (await api.post(E.action(id, action), undefined, callCampaignSchema)).data;
  },
  async retry(id: string, taskIds: string[] = []) {
    const { data } = await api.post(
      E.action(id, 'retry'),
      { taskIds },
      z.object({ retried: z.number(), campaign: callCampaignSchema }),
    );
    return data;
  },
  async tasks(id: string, params: { state?: string; page?: number } = {}, signal?: AbortSignal) {
    const { data, pagination } = await api.get(E.tasks(id), z.array(callTaskSchema), {
      signal,
      params: { limit: 100, page: params.page ?? 1, state: params.state },
    });
    return { data, page: pageOf(pagination) };
  },
  async events(id: string, signal?: AbortSignal) {
    return (await api.get(E.events(id), z.array(campaignEventSchema), { signal, params: { limit: 50 } }))
      .data;
  },
  async next(id: string, deviceId: string) {
    return (await api.post(E.next(id), { deviceId }, claimResultSchema)).data;
  },
  async task(id: string, signal?: AbortSignal) {
    return (await api.get(E.task(id), callTaskSchema, { signal })).data;
  },
  async dial(taskId: string, body: { attemptId: string; deviceId: string; subscriptionId: number | null }) {
    return (await api.post(E.taskAction(taskId, 'dial'), body, dialResultSchema)).data;
  },
  async release(taskId: string, body: { attemptId: string; deviceId: string }) {
    return (await api.post(E.taskAction(taskId, 'release'), body, callTaskSchema)).data;
  },
  async skip(taskId: string, body: { attemptId?: string | null; deviceId?: string | null; reason?: string }) {
    return (await api.post(E.taskAction(taskId, 'skip'), body, callTaskSchema)).data;
  },
  async saveAnswers(
    taskId: string,
    body: { attemptId: string; deviceId?: string | null; answers: AnswerInput[] },
  ) {
    return (await api.put(E.answers(taskId), body, callTaskSchema)).data;
  },
  async complete(taskId: string, body: CompleteInput) {
    const { data } = await api.post(
      E.taskAction(taskId, 'complete'),
      body,
      z.object({ task: callTaskSchema, replayed: z.boolean() }),
    );
    return data;
  },
  async retrySync(taskId: string) {
    return (await api.post(E.taskAction(taskId, 'sync'), undefined, callTaskSchema)).data;
  },
  async callbacks(status: 'pending' | 'overdue' | 'done' | 'cancelled' = 'pending', signal?: AbortSignal) {
    return (await api.get(E.callbacks, z.array(callTaskSchema), { signal, params: { status, limit: 100 } }))
      .data;
  },
  async reschedule(taskId: string, body: { at: string; timezone: string; reason?: string }) {
    return (await api.patch(E.callback(taskId), body, callTaskSchema)).data;
  },
  async cancelCallback(taskId: string) {
    return (await api.delete(E.callback(taskId), callTaskSchema)).data;
  },
};
