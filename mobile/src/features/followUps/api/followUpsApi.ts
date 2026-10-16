import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import { followUpSchema, type FollowUp, type FollowUpScope } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Overdue items stay visible for 30 days; the agenda looks 30 days ahead. */
export const FOLLOW_UP_WINDOW_DAYS = { past: 30, future: 30 } as const;

export const followUpsApi = {
  async list(scope: FollowUpScope, signal?: AbortSignal, now: Date = new Date()): Promise<FollowUp[]> {
    const { data } = await api.get(ENDPOINTS.leads.followUps, z.array(followUpSchema), {
      signal,
      params: {
        scope,
        from: new Date(now.getTime() - FOLLOW_UP_WINDOW_DAYS.past * DAY_MS).toISOString(),
        to: new Date(now.getTime() + FOLLOW_UP_WINDOW_DAYS.future * DAY_MS).toISOString(),
      },
    });
    return data;
  },
};
