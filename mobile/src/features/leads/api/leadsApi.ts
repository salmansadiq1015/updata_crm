import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import type { CursorPage } from '@/services/api/apiTypes';
import { ENDPOINTS } from '@/services/api/endpoints';

import { leadSchema, type AssignableLeadStatus, type Lead, type LeadListFilters } from '../types';
import type { LeadCreateInput, LeadPatch } from '../utils/leadForm';

export const LEADS_PAGE_SIZE = 25;

const leadListSchema = z.array(leadSchema);

/** POST /crm/leads returns the lead plus a non-blocking `duplicateWarning` flag. */
const createdLeadSchema = z
  .looseObject({ duplicateWarning: z.boolean().nullish().catch(null) })
  .transform((raw, ctx) => {
    const parsed = leadSchema.safeParse(raw);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'Created lead did not match the expected shape' });
      return z.NEVER;
    }
    return { lead: parsed.data, duplicateWarning: raw.duplicateWarning === true };
  });

export type CreatedLead = z.infer<typeof createdLeadSchema>;

export const leadsApi = {
  /** GET /crm/leads — cursor-paginated; page size 25 like the web CRM. */
  async list(
    filters: LeadListFilters,
    cursor: string | undefined,
    signal?: AbortSignal,
    limit = LEADS_PAGE_SIZE,
  ): Promise<CursorPage<Lead>> {
    const { data, pagination } = await api.get(ENDPOINTS.leads.list, leadListSchema, {
      signal,
      params: {
        limit,
        cursor,
        // Defaults match the web CRM (leads-store.ts): newest first.
        sortBy: filters.sortBy ?? 'createdAt',
        sortOrder: filters.sortOrder ?? 'desc',
        // The web trims and caps search at the server's 100-character limit.
        q: filters.q?.trim().slice(0, 100) || undefined,
        status: filters.status,
        source: filters.source,
        type: filters.type,
        assignedTo: filters.assignedTo,
      },
    });
    return {
      items: data,
      pagination: pagination ?? { hasNext: false, nextCursor: null, limit },
    };
  },

  async get(id: string, signal?: AbortSignal): Promise<Lead> {
    const { data } = await api.get(ENDPOINTS.leads.detail(id), leadSchema, { signal });
    return data;
  },

  /** POST /crm/leads (lead:write). Never blocked by duplicates — it only warns. */
  async create(input: LeadCreateInput): Promise<CreatedLead> {
    const { data } = await api.post(ENDPOINTS.leads.list, input, createdLeadSchema);
    return data;
  },

  /** PATCH /crm/leads/:id with only the changed fields. */
  async update(id: string, patch: LeadPatch): Promise<Lead> {
    const { data } = await api.patch(ENDPOINTS.leads.detail(id), patch, leadSchema);
    return data;
  },

  async updateStatus(id: string, status: AssignableLeadStatus): Promise<Lead> {
    const { data } = await api.patch(ENDPOINTS.leads.detail(id), { status }, leadSchema);
    return data;
  },
};
