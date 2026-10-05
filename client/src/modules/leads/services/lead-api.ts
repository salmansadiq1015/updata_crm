import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { leadSchema, parseLeadDuplicates } from '../schemas/lead-schemas';
import type {
  Lead,
  LeadContactChannel,
  LeadContactLogEntry,
  LeadConversionResult,
  LeadConvertInput,
  LeadCreateInput,
  LeadDuplicate,
  LeadDuplicateParams,
  LeadEnrichApplied,
  LeadEnrichBulkResult,
  LeadEnrichFound,
  LeadEnrichJob,
  LeadEnrichJobStatus,
  LeadEnrichResult,
  LeadEnrichSummary,
  LeadFilterOptions,
  LeadPage,
  LeadListParams,
  LeadPatch,
  LeadSocial,
  LeadWhatsAppLogResult,
} from '../types/lead-types';

type ApiEnvelope<T> = {
  data?: T;
  pagination?: LeadPage['pagination'] | null;
};

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;

// ── Import / export contract ──────────────────────────────────────────────────

/** How the importer treats a row that matches an existing lead. */
export type LeadImportMode = 'new' | 'skip' | 'update';

/** File formats the exporter and template endpoints understand. */
export type LeadExportFormat = 'csv' | 'xlsx' | 'pdf';
export type LeadTemplateFormat = 'csv' | 'xlsx';

export type LeadImportSummary = {
  total: number;
  created: number;
  skipped: number;
  duplicates: number;
  failed: number;
};

export type LeadImportRowError = { row: number | null; message: string };

/** Shape returned by `POST /crm/leads/import` (envelope already unwrapped). */
export type LeadImportResult = {
  summary: LeadImportSummary;
  errors: LeadImportRowError[];
  warnings: string[];
  format: string | null;
};

/** A downloaded binary plus the filename parsed from `Content-Disposition`. */
export type LeadBlobDownload = { blob: Blob; filename: string };

/** Filters mirrored from the leads list, passed straight through to the exporter. */
export type LeadExportFilters = {
  status?: string;
  source?: string;
  assignedTo?: string;
  type?: string;
  city?: string;
  q?: string;
};

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalizeImportResult = (payload: unknown): LeadImportResult => {
  const root = isRecord(payload) ? payload : {};
  const summary = isRecord(root.summary) ? root.summary : {};
  const errors = Array.isArray(root.errors) ? root.errors : [];
  return {
    summary: {
      total: toNumber(summary.total),
      created: toNumber(summary.created),
      skipped: toNumber(summary.skipped),
      duplicates: toNumber(summary.duplicates),
      failed: toNumber(summary.failed),
    },
    errors: errors.map((entry) => {
      const record = isRecord(entry) ? entry : {};
      const row = record.row;
      return {
        row: typeof row === 'number' ? row : null,
        message: typeof record.message === 'string' ? record.message : String(record.message ?? ''),
      };
    }),
    warnings: toStringArray(root.warnings),
    format: typeof root.format === 'string' ? root.format : null,
  };
};

/** Pull a filename out of a `Content-Disposition` header, else use the fallback. */
const filenameFromDisposition = (disposition: unknown, fallback: string): string => {
  if (typeof disposition !== 'string' || !disposition) return fallback;
  // RFC 5987 `filename*` wins when present (it may be percent-encoded).
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    const value = star[1].trim().replace(/^["']|["']$/g, '');
    try {
      return decodeURIComponent(value) || fallback;
    } catch {
      return value || fallback;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim() || fallback;
};

/**
 * Fetch a binary file. The response interceptor only unwraps JSON envelopes
 * (`{ success, data }`), so a blob download arrives as the raw axios response —
 * read `.data`/`.headers` straight off it (guarding the unwrapped `_raw` shape).
 */
const getBlobDownload = async (
  url: string,
  params: Record<string, unknown>,
  fallbackName: string,
): Promise<LeadBlobDownload> => {
  const response = (await apiClient.get(url, { params, responseType: 'blob' })) as {
    data?: unknown;
    headers?: Record<string, unknown>;
    _raw?: { data?: unknown };
  };
  const blob = (response?._raw?.data ?? response?.data) as Blob;
  const disposition =
    response?.headers?.['content-disposition'] ?? response?.headers?.['Content-Disposition'];
  return { blob, filename: filenameFromDisposition(disposition, fallbackName) };
};

const todayStamp = (): string => new Date().toISOString().slice(0, 10);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.leads)) return payload.leads;
    if (Array.isArray(payload.items)) return payload.items;
  }
  return [];
};

const readId = (value: unknown): string | null => {
  if (isRecord(value)) {
    const id = value._id ?? value.id ?? value.customerId;
    return typeof id === 'string' && id.length ? id : null;
  }
  return typeof value === 'string' && value.length ? value : null;
};

const CONTACT_CHANNELS: readonly LeadContactChannel[] = ['whatsapp', 'phone', 'manual', 'email'];

const toChannel = (value: unknown): LeadContactChannel =>
  typeof value === 'string' && (CONTACT_CHANNELS as readonly string[]).includes(value)
    ? (value as LeadContactChannel)
    : 'manual';

const toNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length ? value : null;

/** Parse one contact-log entry defensively; the server shape is lenient. */
const parseContactLogEntry = (value: unknown, index: number): LeadContactLogEntry => {
  const record = isRecord(value) ? value : {};
  const createdBy = record.createdBy;
  return {
    id: readId(record._id) ?? readId(record.id) ?? `contact-${index}`,
    channel: toChannel(record.channel ?? record.type),
    subject: toNullableString(record.subject),
    note: toNullableString(record.note ?? record.message ?? record.body),
    createdBy:
      isRecord(createdBy) || typeof createdBy === 'string'
        ? (createdBy as LeadContactLogEntry['createdBy'])
        : null,
    createdAt: toNullableString(record.createdAt ?? record.loggedAt ?? record.sentAt),
  };
};

// ── Website enrichment ────────────────────────────────────────────────────────

const SOCIAL_KEYS: readonly (keyof LeadSocial)[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'tiktok',
];

const JOB_STATUSES: readonly LeadEnrichJobStatus[] = [
  'queued',
  'pending',
  'running',
  'done',
  'failed',
];

/** Unknown status keeps the poller running rather than ending it prematurely. */
const normalizeJobStatus = (value: unknown): LeadEnrichJobStatus => {
  const str = typeof value === 'string' ? value.toLowerCase() : '';
  return (JOB_STATUSES as readonly string[]).includes(str) ? (str as LeadEnrichJobStatus) : 'running';
};

/** What the scraper reported (defensively parsed; may differ from what was applied). */
const normalizeFound = (value: unknown): LeadEnrichFound => {
  const record = isRecord(value) ? value : {};
  const socialRecord = isRecord(record.social) ? record.social : {};
  const social: Partial<LeadSocial> = {};
  for (const key of SOCIAL_KEYS) {
    const v = socialRecord[key];
    if (typeof v === 'string' && v.trim()) social[key] = v;
  }
  return {
    emails: toStringArray(record.emails),
    phones: toStringArray(record.phones),
    social,
  };
};

/** Which previously-blank fields the server actually filled (socials may arrive as an array or an object). */
const normalizeApplied = (value: unknown): LeadEnrichApplied => {
  const record = isRecord(value) ? value : {};
  const applied: LeadEnrichApplied = {};
  if (typeof record.email === 'string' && record.email.trim()) applied.email = record.email;
  if (Array.isArray(record.phones)) applied.phones = toStringArray(record.phones);
  const socials = record.socials;
  if (Array.isArray(socials)) applied.socials = toStringArray(socials);
  else if (isRecord(socials)) applied.socials = Object.keys(socials).filter((key) => Boolean(socials[key]));
  return applied;
};

/** Honest tallies for the UI: found counts + the number of fields actually filled. */
const summarizeEnrich = (found: LeadEnrichFound, applied: LeadEnrichApplied): LeadEnrichSummary => ({
  emails: found.emails.length,
  phones: found.phones.length,
  socials: Object.values(found.social).filter(Boolean).length,
  appliedCount:
    (applied.email ? 1 : 0) + (applied.phones?.length ?? 0) + (applied.socials?.length ?? 0),
});

export const leadApi = {
  async listLeads(params: LeadListParams = {}): Promise<LeadPage> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.LEADS.LIST, { params }));
    return {
      data: extractList(response.data).map((item) => leadSchema.parse(item)),
      pagination: response.pagination ?? {
        hasNext: false,
        nextCursor: null,
        limit: params.limit ?? 50,
      },
    };
  },

  async getFilterOptions(): Promise<LeadFilterOptions> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.LEADS.FILTER_OPTIONS));
    const data = isRecord(response.data) ? response.data : {};
    const places = Array.isArray(data.places) ? data.places : [];
    const types = Array.isArray(data.types) ? data.types : [];
    return {
      places: places.flatMap((value) => {
        if (!isRecord(value) || typeof value.city !== 'string' || !value.city.trim()) return [];
        return [{
          city: value.city,
          cantons: toStringArray(value.cantons),
          count: toNumber(value.count),
        }];
      }),
      types: types.flatMap((value) => {
        if (!isRecord(value) || (value.value !== 'business' && value.value !== 'private')) return [];
        return [{ value: value.value, count: toNumber(value.count) }];
      }),
    };
  },

  async getLead(id: string): Promise<Lead> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.LEADS.BY_ID(id)));
    return leadSchema.parse(response.data);
  },

  async createLead(input: LeadCreateInput): Promise<Lead> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.LEADS.LIST, input));
    return leadSchema.parse(response.data);
  },

  async updateLead(id: string, patch: LeadPatch): Promise<Lead> {
    const response = toApiResponse<unknown>(await apiClient.patch(ENDPOINTS.LEADS.BY_ID(id), patch));
    return leadSchema.parse(response.data);
  },

  async deleteLead(id: string): Promise<{ deleted: boolean }> {
    const response = toApiResponse<{ deleted?: boolean }>(
      await apiClient.delete(ENDPOINTS.LEADS.BY_ID(id)),
    );
    return { deleted: response.data?.deleted ?? true };
  },

  async convertLead(id: string, input: LeadConvertInput = {}): Promise<LeadConversionResult> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.LEADS.CONVERT(id), input),
    );
    const data = isRecord(response.data) ? response.data : {};
    // Response may be the updated lead, a `{ lead, customer }` pair, or `{ customerId }`.
    const leadSource = isRecord(data.lead) ? data.lead : 'leadNumber' in data || 'status' in data ? data : null;
    const leadRecord = isRecord(leadSource) ? leadSource : {};
    const customerId =
      readId(data.customerId) ??
      readId(data.customer) ??
      readId(leadRecord.convertedCustomerId) ??
      null;
    return {
      lead: leadSource ? leadSchema.parse(leadSource) : null,
      customerId,
    };
  },

  async findDuplicates(params: LeadDuplicateParams): Promise<LeadDuplicate[]> {
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.LEADS.DUPLICATES, { params }),
    );
    return parseLeadDuplicates(extractList(response.data));
  },

  /**
   * Upload a CSV/XLSX/PDF of leads. The field name is `file` and `mode` selects
   * how duplicates are handled ('new' | 'skip' | 'update'), per the backend
   * contract. Returns the normalized import summary.
   */
  async importLeads(file: File, mode: LeadImportMode = 'new'): Promise<LeadImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.LEADS.IMPORT, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
    return normalizeImportResult(response.data);
  },

  /** Download a leads export honouring the current list filters. */
  async exportLeads({
    format,
    filters = {},
  }: {
    format: LeadExportFormat;
    filters?: LeadExportFilters;
  }): Promise<LeadBlobDownload> {
    return getBlobDownload(
      ENDPOINTS.LEADS.EXPORT,
      { ...filters, format },
      `leads-${todayStamp()}.${format}`,
    );
  },

  /** Download the import template (CSV or Excel). */
  async downloadTemplate(format: LeadTemplateFormat = 'csv'): Promise<LeadBlobDownload> {
    return getBlobDownload(
      ENDPOINTS.LEADS.IMPORT_TEMPLATE,
      { format },
      `leads-import-template.${format}`,
    );
  },

  /**
   * Record an outbound WhatsApp intent for a lead. The actual message is sent by
   * the user from WhatsApp; this only logs it and returns the resolved number.
   */
  async logLeadWhatsApp(id: string, message?: string | null): Promise<LeadWhatsAppLogResult> {
    const body = message?.trim() ? { message: message.trim() } : {};
    const response = toApiResponse<{ waNumber?: unknown; logged?: unknown }>(
      await apiClient.post(ENDPOINTS.LEADS.WHATSAPP(id), body),
    );
    const data = response.data ?? {};
    return {
      waNumber: typeof data.waNumber === 'string' ? data.waNumber : null,
      logged: data.logged !== false,
    };
  },

  /** The lead's contact-log entries (whatsapp/phone/manual), newest first. */
  async getLeadContactLog(id: string): Promise<LeadContactLogEntry[]> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.LEADS.CONTACT_LOG(id)));
    return extractList(response.data).map(parseContactLogEntry);
  },

  /**
   * Enrich a single lead from its website (synchronous). The server scrapes the
   * site, returns everything it `found`, and reports which blank fields it
   * `applied`. We parse the updated lead and pre-compute honest tallies so the UI
   * only ever claims what was actually found/filled.
   */
  async enrichLead(id: string): Promise<LeadEnrichResult> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.LEADS.ENRICH(id), {}));
    const data = isRecord(response.data) ? response.data : {};
    const found = normalizeFound(data.found);
    const applied = normalizeApplied(data.applied);
    return {
      lead: leadSchema.parse(data.lead),
      found,
      applied,
      summary: summarizeEnrich(found, applied),
    };
  },

  /** Queue bulk enrichment for several leads; returns the job id to poll (202). */
  async enrichLeadsBulk(ids: string[]): Promise<LeadEnrichBulkResult> {
    const response = toApiResponse<{ jobId?: unknown }>(
      await apiClient.post(ENDPOINTS.LEADS.ENRICH_BULK, { leadIds: ids }),
    );
    const data = response.data ?? {};
    return { jobId: typeof data.jobId === 'string' ? data.jobId : String(data.jobId ?? '') };
  },

  /** Poll a bulk-enrichment job for its status + per-outcome counts. */
  async getEnrichJob(jobId: string): Promise<LeadEnrichJob> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.LEADS.ENRICH_JOB(jobId)));
    const data = isRecord(response.data) ? response.data : {};
    const counts = isRecord(data.counts) ? data.counts : {};
    return {
      status: normalizeJobStatus(data.status),
      counts: {
        total: toNumber(counts.total),
        processed: toNumber(counts.processed),
        enriched: toNumber(counts.enriched),
        skipped: toNumber(counts.skipped),
        failed: toNumber(counts.failed),
      },
    };
  },
};
