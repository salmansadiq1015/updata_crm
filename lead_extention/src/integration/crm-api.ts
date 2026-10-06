import { CRM_IMPORT_HEADERS } from '../shared/constants';
import type { CrmAuthState, CrmAuthUser, Lead } from '../shared/types';
import { SettingsRepository } from '../storage/repositories';

export const DEFAULT_CRM_API_BASE_URL = 'https://updata.behjja.com/api/v1';
const AUTH_SETTING = 'crm-auth';
const ACCESS_SETTING = 'crm-access-token';

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

async function request(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  let auth = await getStoredAuth();
  if (!auth) throw new Error('Log in to the CRM before continuing.');
  let token = await getAccessToken();
  if (!token) token = await refreshAccess(auth);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  try {
    return await parseResponse(await fetch(`${auth.apiBaseUrl}${path}`, { ...init, headers }));
  } catch (error) {
    if (retry && (error as { status?: number }).status === 401) {
      auth = (await getStoredAuth())!;
      const refreshed = await refreshAccess(auth);
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshed}`);
      if (init.body && !(init.body instanceof FormData)) retryHeaders.set('Content-Type', 'application/json');
      return parseResponse(await fetch(`${auth.apiBaseUrl}${path}`, { ...init, headers: retryHeaders }));
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

export async function importLeads(leads: Lead[]): Promise<{ total: number; created: number; existing: number; failed: number; results: Array<{ clientId: string; status: string; leadId?: string; leadNumber?: string; message?: string }> }> {
  try {
    return await request('/crm/leads/bulk-import', { method: 'POST', body: JSON.stringify({ leads: leads.map(toExtensionRecord) }) });
  } catch (error) {
    // The current deployed CRM may predate the structured extension endpoint.
    // Fall back to its existing authenticated CSV import contract so users do
    // not receive an opaque all-record failure while the API is being rolled
    // out. Both routes derive ownership from the bearer session server-side.
    if ((error as { status?: number }).status !== 404) throw error;
    return importViaExistingFileRoute(leads);
  }
}

function toExtensionRecord(lead: Lead): Record<string, unknown> {
  return {
    clientId: lead.id, businessName: lead.businessName, category: lead.category,
    categories: lead.categories, placeIdentifier: lead.placeIdentifier, phone: lead.phone,
    website: lead.website, emails: lead.emails, address: lead.address, street: lead.street,
    city: lead.city, state: lead.state, postalCode: lead.postalCode, country: lead.country,
    latitude: lead.latitude, longitude: lead.longitude, rating: lead.rating,
    reviewCount: lead.reviewCount, priceLevel: lead.priceLevel, discoveredAt: lead.discoveredAt,
    searchId: lead.searchId,
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
      country: lead.country?.length === 2 ? lead.country.toUpperCase() : '', phone: lead.phone,
      mobile: '', email: lead.emails[0] ?? '', website: lead.website,
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
