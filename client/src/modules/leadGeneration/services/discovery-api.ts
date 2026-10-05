import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  autocompletePredictionSchema,
  discoveryResultSchema,
  discoverySessionSchema,
  geocodeResultSchema,
  importPreviewSchema,
  importSummarySchema,
  leadImportJobSchema,
  parseBusinessTypes,
  parseDiscoveryResults,
} from '../schemas/discovery-schemas';
import type {
  AutocompleteInput,
  AutocompletePrediction,
  BusinessType,
  CreateDiscoveryInput,
  CreateDiscoveryResult,
  CursorPage,
  DiscoveryResult,
  DiscoveryMarker,
  DiscoveryResultListParams,
  DiscoverySession,
  DiscoverySessionListParams,
  DiscoveryUsage,
  GeocodeInput,
  GeocodeResult,
  ImportMode,
  ImportPreview,
  ImportResponse,
  ImportSelection,
  LeadImportJob,
} from '../types/discovery-types';

// The axios response interceptor already unwraps the envelope, so service
// methods read `response.data` (+ `response.pagination` for cursor lists).
type ApiEnvelope<T> = {
  data?: T;
  pagination?: CursorPage<T>['pagination'] | null;
};

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readId = (value: unknown): string => {
  if (isRecord(value)) return String(value.sessionId ?? value._id ?? value.id ?? '');
  return typeof value === 'string' ? value : '';
};

const readNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const defaultPagination = (limit?: number): CursorPage<never>['pagination'] => ({
  hasNext: false,
  nextCursor: null,
  limit: limit ?? 50,
});

/** A list payload may be a bare array or `{ results: [...] }` / `{ data: [...] }`. */
const extractList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload)) {
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
  }
  return [];
};

export const discoveryApi = {
  // ── Catalog + usage ─────────────────────────────────────────────────────────
  async getBusinessTypes(): Promise<BusinessType[]> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.DISCOVERY.BUSINESS_TYPES));
    return parseBusinessTypes(extractList(response.data));
  },

  async getUsage(): Promise<DiscoveryUsage> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.DISCOVERY.USAGE));
    const data = isRecord(response.data) ? response.data : {};
    return {
      searchRequests: readNumber(data.searchRequests),
      detailsRequests: readNumber(data.detailsRequests),
      geocodeRequests: readNumber(data.geocodeRequests),
    };
  },

  // ── Sessions ────────────────────────────────────────────────────────────────
  async createSession(input: CreateDiscoveryInput): Promise<CreateDiscoveryResult> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.SESSIONS, input),
    );
    return { sessionId: readId(response.data) };
  },

  async listSessions(
    params: DiscoverySessionListParams = {},
  ): Promise<CursorPage<DiscoverySession>> {
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.SESSIONS, { params }),
    );
    return {
      data: extractList(response.data).map((item) => discoverySessionSchema.parse(item)),
      pagination: response.pagination ?? defaultPagination(params.limit),
    };
  },

  async getSession(id: string): Promise<DiscoverySession> {
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.SESSION_BY_ID(id)),
    );
    return discoverySessionSchema.parse(response.data);
  },

  async cancelSession(id: string): Promise<DiscoverySession> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.SESSION_CANCEL(id)),
    );
    // Some backends return the updated session; others just `{ cancelled: true }`.
    if (isRecord(response.data) && (response.data.id || response.data._id || response.data.status)) {
      return discoverySessionSchema.parse(response.data);
    }
    return discoveryApi.getSession(id);
  },

  async loadMoreSession(id: string): Promise<DiscoverySession> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.SESSION_LOAD_MORE(id)),
    );
    if (isRecord(response.data) && (response.data.id || response.data._id || response.data.status)) {
      return discoverySessionSchema.parse(response.data);
    }
    return discoveryApi.getSession(id);
  },

  async deleteSession(id: string): Promise<{ deleted: boolean }> {
    const response = toApiResponse<{ deleted?: boolean }>(
      await apiClient.delete(ENDPOINTS.DISCOVERY.SESSION_BY_ID(id)),
    );
    return { deleted: response.data?.deleted ?? true };
  },

  // ── Results ─────────────────────────────────────────────────────────────────
  async listResults(
    sessionId: string,
    params: DiscoveryResultListParams = {},
  ): Promise<CursorPage<DiscoveryResult>> {
    const { crmStatus, ...rest } = params;
    const queryParams = crmStatus ? { ...rest, matchingStatus: crmStatus } : rest;
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.SESSION_RESULTS(sessionId), { params: queryParams }),
    );
    return {
      data: extractList(response.data).map((item) => discoveryResultSchema.parse(item)),
      pagination: response.pagination ?? defaultPagination(params.limit),
    };
  },

  async listMarkers(
    sessionId: string,
    params: { cursor?: string | null; limit?: number } = {},
  ): Promise<CursorPage<DiscoveryMarker>> {
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.SESSION_MARKERS(sessionId), { params }),
    );
    const data = extractList(response.data)
      .filter(isRecord)
      .map((item) => ({
        id: String(item.id ?? item._id ?? ''),
        lat: readNumber(item.lat, Number.NaN),
        lng: readNumber(item.lng, Number.NaN),
        status: (item.status ?? null) as DiscoveryMarker['status'],
      }))
      .filter((item) => item.id && Number.isFinite(item.lat) && Number.isFinite(item.lng));
    return { data, pagination: response.pagination ?? defaultPagination(params.limit) };
  },

  async getResult(sessionId: string, resultId: string): Promise<DiscoveryResult> {
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.SESSION_RESULT_BY_ID(sessionId, resultId)),
    );
    return discoveryResultSchema.parse(response.data);
  },

  // ── Import ──────────────────────────────────────────────────────────────────
  async importPreview(
    sessionId: string,
    mode: ImportMode,
    selection?: ImportSelection,
  ): Promise<ImportPreview> {
    const params: Record<string, unknown> = { mode };
    if (selection) {
      params.selectionKind = selection.kind;
      if (selection.resultIds?.length) params.resultIds = selection.resultIds;
    }
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.IMPORT_PREVIEW(sessionId), { params }),
    );
    return importPreviewSchema.parse(response.data);
  },

  async importSession(
    sessionId: string,
    body: { mode: ImportMode; selection: ImportSelection; assignedTo?: string },
  ): Promise<ImportResponse> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.SESSION_IMPORT(sessionId), body),
    );
    return normalizeImportResponse(response.data);
  },

  async importResult(
    resultId: string,
    body: { mode?: ImportMode; assignedTo?: string } = {},
  ): Promise<ImportResponse> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.RESULT_IMPORT(resultId), body),
    );
    return normalizeImportResponse(response.data);
  },

  async getImportJob(jobId: string): Promise<LeadImportJob> {
    const response = toApiResponse<unknown>(
      await apiClient.get(ENDPOINTS.DISCOVERY.IMPORT_JOB(jobId)),
    );
    return leadImportJobSchema.parse(response.data);
  },

  // ── Location proxy ────────────────────────────────────────────────────────────
  async geocode(input: GeocodeInput): Promise<GeocodeResult[]> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.GEOCODE, input),
    );
    const list = extractList(response.data);
    if (list.length) return list.map((item) => geocodeResultSchema.parse(item));
    // Single-object response fallback.
    if (isRecord(response.data)) return [geocodeResultSchema.parse(response.data)];
    return [];
  },

  async autocomplete(input: AutocompleteInput): Promise<AutocompletePrediction[]> {
    const response = toApiResponse<unknown>(
      await apiClient.post(ENDPOINTS.DISCOVERY.AUTOCOMPLETE, input),
    );
    const list = extractList(
      isRecord(response.data) && Array.isArray(response.data.predictions)
        ? response.data.predictions
        : response.data,
    );
    return list.map((item) => autocompletePredictionSchema.parse(item));
  },
};

/** Import endpoints return a sync summary OR a 202 `{ jobId }`. */
function normalizeImportResponse(data: unknown): ImportResponse {
  const record = isRecord(data) ? data : {};
  const jobId = readId(record.jobId ?? record.job ?? (record.id && !('imported' in record) ? record.id : ''));
  if (jobId && !('imported' in record) && !('summary' in record)) {
    return { kind: 'async', jobId, summary: null };
  }
  const summarySource = isRecord(record.summary) ? record.summary : record;
  return { kind: 'sync', summary: importSummarySchema.parse(summarySource), jobId: null };
}
