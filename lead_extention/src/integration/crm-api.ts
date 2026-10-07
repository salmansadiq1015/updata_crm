import { CRM_IMPORT_HEADERS } from '../shared/constants';
import type { CrmAuthState, CrmAuthUser, Lead } from '../shared/types';
import { SettingsRepository } from '../storage/repositories';
import { cleanPhone } from '../shared/utils';

export const DEFAULT_CRM_API_BASE_URL = 'https://updata.behjja.com/api/v1';
const AUTH_SETTING = 'crm-auth';
const ACCESS_SETTING = 'crm-access-token';
// A stable per-install id so the CRM keeps one connection record for this
// browser across reconnects. It is not a secret — just a correlation handle.
const INSTANCE_SETTING = 'crm-instance-id';

type StoredAuth = { apiBaseUrl: string; refreshToken: string; user: CrmAuthUser };
type AuthResponse = { accessToken: string; refreshToken?: string; user?: CrmAuthUser };

function normalizeApiBaseUrl(value: string): string {
  const parsed = new URL(value.trim() || DEFAULT_CRM_API_BASE_URL);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('CRM API URL must use HTTP or HTTPS.');
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '';
  if (!parsed.pathname.endsWith('/api/v1')) parsed.pathname = `${parsed.pathname}/api/v1`.replace(/\/+/g, '/');
  return parsed.toString().replace(/\/$/, '');
}

async function getStoredAuth(): Promise<StoredAuth | undefined> {
  const stored = (await SettingsRepository.get<Omit<StoredAuth, 'refreshToken'>>(AUTH_SETTING))?.value;
  if (!stored) return undefined;
  const tokens = await readSessionTokens();
  return { ...stored, refreshToken: tokens.refreshToken ?? '' };
}

async function getAccessToken(): Promise<string | null> {
  return (await readSessionTokens()).accessToken ?? null;
}

async function saveAuth(apiBaseUrl: string, data: AuthResponse, previous?: StoredAuth): Promise<void> {
  if (!data.accessToken) throw new Error('The CRM did not return an access token.');
  const user = data.user ?? previous?.user;
  if (!user?.id && !user?._id) throw new Error('The CRM did not return an authenticated user.');
  await writeSessionTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? previous?.refreshToken ?? '' });
  await SettingsRepository.save(AUTH_SETTING, {
    apiBaseUrl,
    user: { ...user, id: user.id ?? user._id! }
  } as Omit<StoredAuth, 'refreshToken'>);
}

export async function clearAuth(): Promise<void> {
  await clearSessionTokens();
  await SettingsRepository.save(AUTH_SETTING, null);
}

type SessionTokens = { accessToken?: string; refreshToken?: string };
async function readSessionTokens(): Promise<SessionTokens> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    return new Promise((resolve) => chrome.storage.session.get([ACCESS_SETTING, 'crm-refresh-token'], (items) => resolve({ accessToken: items[ACCESS_SETTING], refreshToken: items['crm-refresh-token'] })));
  }
  const access = await SettingsRepository.get<string>(ACCESS_SETTING);
  const refresh = await SettingsRepository.get<string>('crm-refresh-token');
  return { accessToken: access?.value ?? undefined, refreshToken: refresh?.value ?? undefined };
}
async function writeSessionTokens(tokens: SessionTokens): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    await new Promise<void>((resolve, reject) => chrome.storage.session.set({ [ACCESS_SETTING]: tokens.accessToken, 'crm-refresh-token': tokens.refreshToken }, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
    return;
  }
  await SettingsRepository.save(ACCESS_SETTING, tokens.accessToken ?? null); await SettingsRepository.save('crm-refresh-token', tokens.refreshToken ?? null);
}
async function clearSessionTokens(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) { await new Promise<void>((resolve) => chrome.storage.session.remove([ACCESS_SETTING, 'crm-refresh-token'], () => resolve())); return; }
  await SettingsRepository.save(ACCESS_SETTING, null); await SettingsRepository.save('crm-refresh-token', null);
}

async function parseResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    const detailMessage = details
      .map((detail: { field?: string; message?: string }) => detail?.field && detail?.message ? `${detail.field}: ${detail.message}` : detail?.message)
      .filter(Boolean)
      .join(' · ');
    const message = [body?.error?.message || body?.message || `CRM request failed (${response.status}).`, detailMessage]
      .filter(Boolean)
      .join(': ');
    const error = new Error(message) as Error & { status: number; code?: string };
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body?.success === true ? body.data : body;
}

async function refreshAccess(auth: StoredAuth): Promise<string> {
  if (!auth.refreshToken) throw new Error('Your CRM session has expired.');
  const response = await fetch(`${auth.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken })
  });
  const data = await parseResponse(response) as AuthResponse;
  await saveAuth(auth.apiBaseUrl, data, auth);
  return data.accessToken;
}

// Every CRM call is bounded. Without this a slow, unreachable, or not-yet-deployed
// endpoint leaves a fetch pending forever — which froze the import card at
// "0 / N processed" with no error. A timeout turns that into a clear, retryable
// failure the per-batch loop surfaces (added/existing/failed counts update).
const CRM_REQUEST_TIMEOUT_MS = 30_000;
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = CRM_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The CRM did not respond in time. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function request(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  let auth = await getStoredAuth();
  if (!auth) throw new Error('Log in to the CRM before continuing.');
  let token = await getAccessToken();
  if (!token) token = await refreshAccess(auth);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  try {
    return await parseResponse(await fetchWithTimeout(`${auth.apiBaseUrl}${path}`, { ...init, headers }));
  } catch (error) {
    if (retry && (error as { status?: number }).status === 401) {
      auth = (await getStoredAuth())!;
      const refreshed = await refreshAccess(auth);
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshed}`);
      if (init.body && !(init.body instanceof FormData)) retryHeaders.set('Content-Type', 'application/json');
      return parseResponse(await fetchWithTimeout(`${auth.apiBaseUrl}${path}`, { ...init, headers: retryHeaders }));
    }
    if ((error as { status?: number }).status === 401) await clearAuth();
    throw error;
  }
}

export async function getAuthState(): Promise<CrmAuthState> {
  const auth = await getStoredAuth();
  const tokens = await readSessionTokens();
  return { authenticated: Boolean(auth?.user && (tokens.accessToken || tokens.refreshToken)), apiBaseUrl: auth?.apiBaseUrl ?? null, user: auth?.user ?? null };
}

export async function login(apiBaseUrl: string, email: string, password: string): Promise<CrmAuthState> {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password })
  });
  const data = await parseResponse(response) as AuthResponse;
  await saveAuth(base, data);
  return getAuthState();
}

export async function logout(): Promise<void> {
  try {
    if (await getStoredAuth()) await request('/auth/logout', { method: 'POST' });
  } catch {
    // Local credentials are cleared even if the server is unavailable.
  }
  await clearAuth();
}

async function getInstanceId(): Promise<string> {
  const existing = await SettingsRepository.get<string>(INSTANCE_SETTING);
  if (existing?.value) return existing.value;
  const generated = globalThis.crypto?.randomUUID?.()
    ?? `inst-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  await SettingsRepository.save(INSTANCE_SETTING, generated);
  return generated;
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return 'unknown';
  }
}

/**
 * Secure connect handoff: redeem a one-time pairing grant that the CRM Lead
 * page minted for the signed-in user. No password is ever handled here — the
 * CRM returns a normal rotating access/refresh pair tied to a dedicated
 * extension session. This is the primary way the extension authenticates.
 */
export async function connectWithGrant(apiBaseUrl: string, grant: string): Promise<CrmAuthState> {
  if (!grant) throw new Error('Missing connect code from the CRM.');
  const base = normalizeApiBaseUrl(apiBaseUrl || DEFAULT_CRM_API_BASE_URL);
  const instanceId = await getInstanceId();
  const response = await fetch(`${base}/extension/pairing/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant, instanceId, extensionVersion: extensionVersion() }),
  });
  const data = await parseResponse(response) as AuthResponse;
  await saveAuth(base, data);
  void heartbeat().catch(() => undefined);
  return getAuthState();
}

/**
 * Tell the CRM this install is alive (updates the connection's lastSeenAt so
 * the Lead-page status card stays accurate). Best-effort; never throws.
 */
export async function heartbeat(): Promise<void> {
  try {
    await request('/extension/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ extensionVersion: extensionVersion() }),
    });
  } catch {
    // The CRM also refreshes lastSeen on connect/import; a missed beat is fine.
  }
}

export async function importLeads(leads: Lead[], opts: { importId?: string; importTotal?: number; importFinal?: boolean } = {}): Promise<{ total: number; created: number; existing: number; failed: number; results: Array<{ clientId: string; status: string; leadId?: string; leadNumber?: string; message?: string }> }> {
  try {
    const body: Record<string, unknown> = { leads: leads.map(toExtensionRecord) };
    // Run-level tracking so the CRM can show live import progress on the web
    // page. Reporting only — the server still derives ownership from the token.
    if (opts.importId) {
      body.importId = opts.importId;
      if (typeof opts.importTotal === 'number') body.importTotal = opts.importTotal;
      if (opts.importFinal) body.importFinal = true;
    }
    return await request('/crm/leads/bulk-import', { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    // The current deployed CRM may predate the structured extension endpoint.
    // Fall back to its existing authenticated CSV import contract so users do
    // not receive an opaque all-record failure while the API is being rolled
    // out. Both routes derive ownership from the bearer session server-side.
    const status = (error as { status?: number }).status;
    if (status !== 404 && !(status && status >= 500 && status <= 599)) throw error;
    return importViaExistingFileRoute(leads);
  }
}

// Clamp every field to the CRM bulk-import schema limits BEFORE sending. The
// server validates the whole array and rejects the entire batch if a single
// cell violates a constraint (e.g. a phone longer than 50 chars), so one noisy
// Maps value must never be allowed to fail an otherwise-valid import.
function clampText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function safeWebsite(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) && url.href.length <= 500 ? url.href : null;
  } catch {
    return null;
  }
}

function safeEmails(emails: string[] | undefined): string[] {
  const valid = (emails ?? [])
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 255);
  return [...new Set(valid)].slice(0, 20);
}

function inRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function toExtensionRecord(lead: Lead): Record<string, unknown> {
  return {
    clientId: (lead.id ?? '').slice(0, 128),
    businessName: clampText(lead.businessName, 255) ?? 'Unnamed business',
    category: clampText(lead.category, 120),
    categories: [...new Set((lead.categories ?? []).map((item) => clampText(item, 80)).filter((item): item is string => Boolean(item)))].slice(0, 50),
    placeIdentifier: clampText(lead.placeIdentifier, 255),
    phone: cleanPhone(lead.phone, 50),
    website: safeWebsite(lead.website),
    emails: safeEmails(lead.emails),
    address: clampText(lead.address, 500),
    street: clampText(lead.street, 255),
    city: clampText(lead.city, 120),
    state: clampText(lead.state, 80),
    postalCode: clampText(lead.postalCode, 20),
    country: clampText(lead.country, 100),
    latitude: inRange(lead.latitude, -90, 90),
    longitude: inRange(lead.longitude, -180, 180),
    rating: inRange(lead.rating, 0, 5),
    reviewCount: typeof lead.reviewCount === 'number' && lead.reviewCount >= 0 ? Math.round(lead.reviewCount) : null,
    priceLevel: clampText(lead.priceLevel, 40),
    discoveredAt: lead.discoveredAt,
    searchId: (lead.searchId ?? '').slice(0, 128),
  };
}

async function importViaExistingFileRoute(leads: Lead[]): Promise<{ total: number; created: number; existing: number; failed: number; results: Array<{ clientId: string; status: string; message?: string }> }> {
  const form = new FormData();
  form.append('file', new Blob([toCrmImportCsv(leads)], { type: 'text/csv;charset=utf-8' }), 'lead-finder-import.csv');
  form.append('mode', 'new');
  const data = await request('/crm/leads/import', { method: 'POST', body: form }) as { summary?: { total?: number; created?: number; skipped?: number; duplicates?: number; failed?: number }; errors?: Array<{ row?: number; message?: string }> };
  const summary = data.summary ?? {};
  const failedRows = new Map((data.errors ?? []).map((item) => [Math.max(0, Number(item.row ?? 0) - 2), item.message ?? 'Import failed']));
  const created = Number(summary.created ?? 0);
  const existing = Number(summary.duplicates ?? summary.skipped ?? 0);
  const results = leads.map((lead, index) => {
    const message = failedRows.get(index);
    if (message) return { clientId: lead.id, status: 'failed', message };
    // The legacy endpoint returns aggregate duplicate counts only. Preserve
    // accurate totals and use the count to label successful rows best-effort.
    return { clientId: lead.id, status: index < created ? 'created' : index < created + existing ? 'existing' : 'failed', ...(index >= created + existing ? { message: 'The CRM did not confirm this row as created or existing.' } : {}) };
  });
  return { total: Number(summary.total ?? leads.length), created, existing, failed: Number(summary.failed ?? failedRows.size), results };
}

function toCrmImportCsv(leads: Lead[]): string {
  const rows = [CRM_IMPORT_HEADERS.join(',')];
  for (const lead of leads) {
    const values: Record<string, unknown> = {
      name: lead.businessName, type: 'business', status: 'new', street: lead.street ?? lead.address,
      addressSupplement: '', postalCode: lead.postalCode, city: lead.city, canton: lead.state,
      country: lead.country?.length === 2 ? lead.country.toUpperCase() : '', phone: cleanPhone(lead.phone, 50) ?? '',
      mobile: '', email: safeEmails(lead.emails)[0] ?? '', website: safeWebsite(lead.website) ?? '',
      notes: lead.googleMapsUrl ? `Google Maps: ${lead.googleMapsUrl}` : '', tags: lead.categories.join(', '),
    };
    rows.push(CRM_IMPORT_HEADERS.map((header) => escapeCsv(values[header])).join(','));
  }
  return `\uFEFF${rows.join('\r\n')}`;
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export { normalizeApiBaseUrl };
