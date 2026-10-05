'use client';

import { useMemo } from 'react';
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { downloadBlob } from '@/lib/api/download';
import { useLanguage } from '@/lib/i18n/language-context';
import { leadApi } from '../services/lead-api';
import type {
  LeadBlobDownload,
  LeadExportFilters,
  LeadExportFormat,
  LeadImportMode,
  LeadImportResult,
  LeadTemplateFormat,
} from '../services/lead-api';
import type {
  Lead,
  LeadConvertInput,
  LeadCreateInput,
  LeadDuplicateParams,
  LeadListParams,
  LeadPage,
  LeadPatch,
} from '../types/lead-types';

/** Best-effort MIME type for a downloaded export/template, by file format. */
const DOWNLOAD_MIME: Record<string, string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export const LEAD_PAGE_SIZE = 50;

/** Local query-key factory (mirrors taskWorkspaceKeys). */
export const leadKeys = {
  root: ['leads', 'workspace'] as const,
  lists: () => [...leadKeys.root, 'lists'] as const,
  list: (params: Omit<LeadListParams, 'cursor'>) => [...leadKeys.lists(), params] as const,
  detail: (id: string | null) => [...leadKeys.root, 'detail', id] as const,
  duplicates: (params: LeadDuplicateParams) => [...leadKeys.root, 'duplicates', params] as const,
  contactLog: (id: string | null) => [...leadKeys.root, 'contact-log', id] as const,
  filterOptions: () => [...leadKeys.root, 'filter-options'] as const,
  enrichJob: (jobId: string | null) => [...leadKeys.root, 'enrich-job', jobId] as const,
};

const updateLeadInPages = (
  oldData: InfiniteData<LeadPage> | undefined,
  leadId: string,
  updater: (lead: Lead) => Lead | null,
): InfiniteData<LeadPage> | undefined => {
  if (!oldData) return oldData;
  return {
    ...oldData,
    pages: oldData.pages.map((page) => ({
      ...page,
      data: page.data
        .map((lead) => (lead.id === leadId ? updater(lead) : lead))
        .filter((lead): lead is Lead => lead !== null),
    })),
  };
};

const applyPatchToLead = (lead: Lead, patch: LeadPatch): Lead => ({
  ...lead,
  ...patch,
  address: patch.address ? { ...lead.address, ...patch.address } : lead.address,
  tags: patch.tags ?? lead.tags,
  updatedAt: new Date().toISOString(),
});

// ── Queries ─────────────────────────────────────────────────────────────────

export function useLeads(baseParams: Omit<LeadListParams, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: leadKeys.list(baseParams),
    queryFn: ({ pageParam }) => leadApi.listLeads({ ...baseParams, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });
}

export function useLeadFilterOptions() {
  return useQuery({
    queryKey: leadKeys.filterOptions(),
    queryFn: () => leadApi.getFilterOptions(),
    staleTime: 60_000,
  });
}

export function useFlattenedLeads(data: InfiniteData<LeadPage> | undefined): Lead[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const leads: Lead[] = [];
    for (const page of data?.pages ?? []) {
      for (const lead of page.data) {
        if (seen.has(lead.id)) continue;
        seen.add(lead.id);
        leads.push(lead);
      }
    }
    return leads;
  }, [data]);
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: () => leadApi.getLead(id ?? ''),
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

export function useLeadDuplicates(params: LeadDuplicateParams, options: { enabled?: boolean } = {}) {
  const hasCriteria = Boolean(params.name || params.phone || params.website || params.placeId);
  return useQuery({
    queryKey: leadKeys.duplicates(params),
    queryFn: () => leadApi.findDuplicates(params),
    enabled: hasCriteria && (options.enabled ?? true),
    staleTime: 30_000,
  });
}

/** A lead's contact-log entries (WhatsApp / phone / manual), newest first. */
export function useLeadContactLog(id: string | null) {
  return useQuery({
    queryKey: leadKeys.contactLog(id),
    queryFn: () => leadApi.getLeadContactLog(id ?? ''),
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

/**
 * Poll a bulk-enrichment job while it runs. Stops polling once the job reaches a
 * terminal state ('done' / 'failed'); any other status keeps the interval alive.
 */
export function useEnrichJob(jobId: string | null) {
  return useQuery({
    queryKey: leadKeys.enrichJob(jobId),
    queryFn: () => leadApi.getEnrichJob(jobId ?? ''),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'done' || status === 'failed' ? false : 1500;
    },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useCreateLead() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: (input: LeadCreateInput) => leadApi.createLead(input),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadKeys.filterOptions() });
      queryClient.setQueryData(leadKeys.detail(lead.id), lead);
      showSuccess(t('leads.toast.created', 'Lead created'));
    },
    onError: (error) => showError(error),
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LeadPatch }) => leadApi.updateLead(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: leadKeys.lists() });
      const previousLists = queryClient.getQueriesData<InfiniteData<LeadPage>>({
        queryKey: leadKeys.lists(),
      });
      const previousDetail = queryClient.getQueryData<Lead>(leadKeys.detail(id));
      queryClient.setQueriesData<InfiniteData<LeadPage>>({ queryKey: leadKeys.lists() }, (oldData) =>
        updateLeadInPages(oldData, id, (lead) => applyPatchToLead(lead, patch)),
      );
      if (previousDetail) {
        queryClient.setQueryData(leadKeys.detail(id), applyPatchToLead(previousDetail, patch));
      }
      return { previousLists, previousDetail };
    },
    onError: (error, variables, context) => {
      for (const [key, value] of context?.previousLists ?? []) queryClient.setQueryData(key, value);
      if (context?.previousDetail) {
        queryClient.setQueryData(leadKeys.detail(variables.id), context.previousDetail);
      }
      showError(error);
    },
    onSuccess: (lead) => {
      queryClient.setQueriesData<InfiniteData<LeadPage>>({ queryKey: leadKeys.lists() }, (oldData) =>
        updateLeadInPages(oldData, lead.id, () => lead),
      );
      queryClient.setQueryData(leadKeys.detail(lead.id), lead);
      queryClient.invalidateQueries({ queryKey: leadKeys.filterOptions() });
    },
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: LeadConvertInput }) =>
      leadApi.convertLead(id, input ?? {}),
    onSuccess: (result, { id }) => {
      if (result.lead) {
        queryClient.setQueryData(leadKeys.detail(result.lead.id), result.lead);
        queryClient.setQueriesData<InfiniteData<LeadPage>>(
          { queryKey: leadKeys.lists() },
          (oldData) => updateLeadInPages(oldData, result.lead!.id, () => result.lead!),
        );
      } else {
        // Patch status locally when the API returns only a customerId.
        queryClient.setQueriesData<InfiniteData<LeadPage>>(
          { queryKey: leadKeys.lists() },
          (oldData) =>
            updateLeadInPages(oldData, id, (lead) => ({
              ...lead,
              status: 'converted',
              convertedCustomerId: result.customerId,
              convertedAt: new Date().toISOString(),
            })),
        );
      }
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      showSuccess(t('leads.toast.converted', 'Lead converted to customer'));
    },
    onError: (error) => showError(error),
  });
}

/**
 * Log an outbound WhatsApp intent. The message is sent by the user from WhatsApp;
 * this records it and refreshes the lead's contact log + detail. No success toast
 * — opening WhatsApp is the user-facing feedback, and we never claim delivery.
 */
export function useLogLeadWhatsApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message?: string | null }) =>
      leadApi.logLeadWhatsApp(id, message),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.contactLog(id) });
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(id) });
    },
    onError: (error) => showError(error),
  });
}

/**
 * Enrich one lead from its website (synchronous). On success the detail + list
 * caches are updated with the server's returned lead, and a single toast reports
 * — truthfully — only what was found and how many fields were actually filled.
 * Enrichment only fills blanks server-side, so it never overwrites existing data.
 */
export function useEnrichLead() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: (id: string) => leadApi.enrichLead(id),
    onSuccess: ({ lead, summary }) => {
      queryClient.setQueryData(leadKeys.detail(lead.id), lead);
      queryClient.setQueriesData<InfiniteData<LeadPage>>({ queryKey: leadKeys.lists() }, (oldData) =>
        updateLeadInPages(oldData, lead.id, () => lead),
      );
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      showSuccess(
        t(
          'leads.enrich.foundSummary',
          'Found {emails} email(s), {socials} social link(s); filled {applied} field(s)',
          { emails: summary.emails, socials: summary.socials, applied: summary.appliedCount },
        ),
      );
    },
    onError: (error) => showError(error),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: (id: string) => leadApi.deleteLead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: leadKeys.lists() });
      const previousLists = queryClient.getQueriesData<InfiniteData<LeadPage>>({
        queryKey: leadKeys.lists(),
      });
      queryClient.setQueriesData<InfiniteData<LeadPage>>({ queryKey: leadKeys.lists() }, (oldData) =>
        updateLeadInPages(oldData, id, () => null),
      );
      return { previousLists };
    },
    onError: (error, _id, context) => {
      for (const [key, value] of context?.previousLists ?? []) queryClient.setQueryData(key, value);
      showError(error);
    },
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: leadKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadKeys.filterOptions() });
      showSuccess(t('leads.toast.deleted', 'Lead deleted'));
    },
  });
}

// ── Import / export ───────────────────────────────────────────────────────────

/** Trigger the browser download for a fetched blob, honouring its format. */
function saveDownload({ blob, filename }: LeadBlobDownload): void {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  downloadBlob(blob, filename, DOWNLOAD_MIME[ext] ?? 'application/octet-stream');
}

/**
 * Import leads from a file. On success, refresh the list and announce the
 * headline counts; the caller still receives the full summary to render the
 * created/skipped/duplicates/failed breakdown and any row errors.
 */
export function useImportLeads() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  return useMutation({
    mutationFn: ({ file, mode }: { file: File; mode: LeadImportMode }): Promise<LeadImportResult> =>
      leadApi.importLeads(file, mode),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadKeys.filterOptions() });
      showSuccess(
        t('leads.import.success', '{created} created, {failed} failed', {
          created: result.summary.created,
          failed: result.summary.failed,
        }),
      );
    },
    onError: (error) => showError(error),
  });
}

/** Export the current list (with its filters) to CSV / Excel / PDF. */
export function useExportLeads() {
  return useMutation({
    mutationFn: async (variables: { format: LeadExportFormat; filters?: LeadExportFilters }) => {
      const download = await leadApi.exportLeads(variables);
      saveDownload(download);
      return download;
    },
    onError: (error) => showError(error),
  });
}

/** Download the import template (CSV or Excel). */
export function useDownloadTemplate() {
  return useMutation({
    mutationFn: async (format: LeadTemplateFormat) => {
      const download = await leadApi.downloadTemplate(format);
      saveDownload(download);
      return download;
    },
    onError: (error) => showError(error),
  });
}
