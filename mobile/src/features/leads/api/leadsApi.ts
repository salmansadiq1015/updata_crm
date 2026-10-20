import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import type { CursorPage } from '@/services/api/apiTypes';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  leadDirectoryUserSchema,
  leadSchema,
  type AssignableLeadStatus,
  type BulkLeadResult,
  type Lead,
  type LeadListFilters,
} from '../types';
import type { LeadCreateInput, LeadPatch } from '../utils/leadForm';

export const LEADS_PAGE_SIZE = 25;

const leadListSchema = z.array(leadSchema);
const directorySchema = z.array(leadDirectoryUserSchema);

const bulkDeleteSchema = z.object({
  requested: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  deletedIds: z.array(z.string()).catch([]),
  notDeletedIds: z.array(z.string()).catch([]),
});

const bulkAssignSchema = z.object({
  requested: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  updatedIds: z.array(z.string()).catch([]),
  notUpdatedIds: z.array(z.string()).catch([]),
});

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

  async directory(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.users.directory, directorySchema, {
      signal,
      params: { limit: 100 },
    });
    return data;
  },

  /** One audited server operation for the entire explicit selection. */
  async bulkDelete(ids: string[]): Promise<BulkLeadResult> {
    const { data } = await api.post(ENDPOINTS.leads.bulkDelete, { leadIds: ids }, bulkDeleteSchema);
    return {
      requested: data.requested,
      succeededIds: data.deletedIds,
      failedIds: data.notDeletedIds,
    };
  },

  /** One audited server operation for the entire explicit selection. `null` unassigns. */
  async bulkAssign(ids: string[], assignedTo: string | null): Promise<BulkLeadResult> {
    const { data } = await api.post(
      ENDPOINTS.leads.bulkAssign,
      { leadIds: ids, assignedTo },
      bulkAssignSchema,
    );
    return {
      requested: data.requested,
      succeededIds: data.updatedIds,
      failedIds: data.notUpdatedIds,
    };
  },

  /**
   * There is no server bulk-status route. Preserve the existing PATCH contract and
   * account for each result independently so a partial failure is never hidden.
   */
  async bulkUpdateStatus(ids: string[], status: AssignableLeadStatus): Promise<BulkLeadResult> {
    const results = await Promise.allSettled(ids.map((id) => leadsApi.updateStatus(id, status)));
    const succeededIds: string[] = [];
    const failedIds: string[] = [];
    results.forEach((result, index) => {
      const id = ids[index];
      if (!id) return;
      if (result.status === 'fulfilled') succeededIds.push(id);
      else failedIds.push(id);
    });
    return { requested: ids.length, succeededIds, failedIds };
  },
};
