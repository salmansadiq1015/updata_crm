import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LeadRepository, SearchRepository, SettingsRepository } from '../storage/repositories';
import { createXlsx, downloadBlob, filenameFor, toCsv } from '../export/exporters';
import { BUSINESS_TYPE_PRESETS, DEFAULT_MAX_RESULTS, DEFAULT_REQUEST_DELAY_MS, MAX_RADIUS_KM, RADIUS_OPTIONS, REQUEST_DELAY_OPTIONS } from '../shared/constants';
import { DEFAULT_CRM_API_BASE_URL } from '../integration/crm-api';
import type { CrmAuthState, CrmImportProgress, DiscoveryConfig, DiscoveryProgress, Lead, MapsContext, RatingBreakdown, SearchRecord } from '../shared/types';
import { formatDistance, nowIso } from '../shared/utils';
import './styles.css';

type Page = 'discover' | 'leads' | 'history' | 'settings';
type Theme = 'light' | 'dark';
type IconName = 'arrow' | 'check' | 'chevron' | 'close' | 'download' | 'eye' | 'eye-off' | 'history' | 'moon' | 'search' | 'settings' | 'spark' | 'sun' | 'target' | 'users';

const defaultConfig: DiscoveryConfig = {
  businessType: '', location: '', radiusKm: 10, maxResults: DEFAULT_MAX_RESULTS,
  queryExpansion: true, enableEnrichment: false, maxPagesPerWebsite: 2, safetyLimit: 400,
  areaSweep: true, thoroughContacts: false, requestDelayMs: DEFAULT_REQUEST_DELAY_MS
};

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    arrow: 'M5 12h14M13 6l6 6-6 6', check: 'm5 12 4 4L19 6', chevron: 'm6 9 6 6 6-6', close: 'M6 6l12 12M18 6 6 18', download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 20h14', eye: 'M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z', 'eye-off': 'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a16.6 16.6 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2.5 12 2.5 12s3.5 7 9.5 7a10.5 10.5 0 0 0 3-.4', history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2', moon: 'M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z', search: 'm21 21-4.4-4.4M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z', settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-3.2a7.6 7.6 0 0 0-.1-1.1l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.9-1.1L14.8 3h-5.6l-.4 2.8a7.6 7.6 0 0 0-1.9 1.1l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.9 1.1l.4 2.8h5.6l.4-2.8a7.6 7.6 0 0 0 1.9-1.1l2.3.9 2-3.4-2-1.5c.1-.4.1-.7.1-1.1Z', spark: 'm12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm7 12 .6 2.4L22 18l-2.4.6L19 15Z', sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', target: 'M12 3v3m0 12v3M3 12h3m12 0h3M16.2 7.8a6 6 0 1 1-8.4 0 6 6 0 0 1 8.4 0ZM14.5 9.5a3.5 3.5 0 1 1 5 5 3.5 3.5 0 0 1-5-5Z', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'
  };
  paths.spark = 'm12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Zm7 12 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z';
  paths.target = 'M12 3v3m0 12v3M3 12h3m12 0h3M16.2 7.8a6 6 0 1 1-8.4 0 6 6 0 0 1 8.4 0ZM14.5 9.5a3.5 3.5 0 1 1-5 5 3.5 3.5 0 0 1 5-5Z';
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function App() {
  const [page, setPage] = useState<Page>('discover');
  const [config, setConfig] = useState<DiscoveryConfig>(defaultConfig);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searches, setSearches] = useState<SearchRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [leadFilter, setLeadFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState<Theme>('light');
  const [auth, setAuth] = useState<CrmAuthState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [crmImport, setCrmImport] = useState<CrmImportProgress | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = async () => {
    const [storedLeads, storedSearches, settings, themeSetting, authResponse, crmResponse] = await Promise.all([
      LeadRepository.list(), SearchRepository.list(), SettingsRepository.get<DiscoveryConfig>('config'), SettingsRepository.get<Theme>('theme'),
      runtimeMessage<{ ok: boolean; auth?: CrmAuthState }>({ type: 'GET_AUTH_STATE' }), runtimeMessage<{ ok: boolean; state?: CrmImportProgress | null }>({ type: 'GET_CRM_IMPORT' })
    ]);
    setAuth(authResponse?.auth ?? null); setAuthLoading(false); setCrmImport(crmResponse?.state ?? null);
    if (settings?.value) setConfig({ ...defaultConfig, ...settings.value });
    if (themeSetting?.value) setTheme(themeSetting.value);
    setLeads(storedLeads.length ? await dedupeInWorker(storedLeads) : []);
    setSearches(storedSearches);
    const response = await runtimeMessage<{ ok: boolean; progress: DiscoveryProgress }>({ type: 'GET_PROGRESS' });
    if (response?.progress?.status && response.progress.status !== 'idle') setProgress(response.progress);
  };

  useEffect(() => {
    void refresh();
    const onMessage = (message: { type?: string; progress?: DiscoveryProgress; message?: string }) => {
      if (message.type === 'DISCOVERY_PROGRESS' && message.progress) { setProgress({ ...message.progress, message: message.message }); void refreshDataOnly(); }
      if (message.type === 'MAPS_NAVIGATION') setNotice('Google Maps navigation changed. Discovery will recover from the saved job state.');
      if (message.type === 'CRM_IMPORT_PROGRESS') setCrmImport((message as { progress?: CrmImportProgress | null }).progress ?? null);
      // The CRM Lead page linked or unlinked this browser via the secure connect
      // handoff — reflect the new auth state immediately.
      if (message.type === 'CRM_AUTH_CHANGED') void refresh();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => { chrome.runtime.onMessage.removeListener(onMessage); };
  }, []);

  // When a discovery actually FINISHES (not when the panel re-opens on an
  // already-completed run), auto-clear the search brief — business type +
  // location — so the next search starts fresh. We fire only on the transition
  // INTO 'completed' from an in-progress state, and persist the cleared brief so
  // it does not reappear on the next refresh. Results stay in the workspace.
  const prevStatusRef = useRef<DiscoveryProgress['status'] | null>(null);
  useEffect(() => {
    const status = progress?.status ?? null;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === 'completed' && prev && prev !== 'completed' && prev !== 'idle') {
      setConfig((current) => {
        if (!current.businessType && !current.location) return current;
        const next = { ...current, businessType: '', location: '' };
        void SettingsRepository.save('config', next);
        return next;
      });
    }
  }, [progress?.status]);

  const refreshDataOnly = async () => { const [storedLeads, storedSearches] = await Promise.all([LeadRepository.list(), SearchRepository.list()]); setLeads(storedLeads); setSearches(storedSearches); };
  // Current workspace vs. archived (History). "Clear" flips active → archived.
  const activeLeads = useMemo(() => leads.filter((lead) => !lead.archived), [leads]);
  const archivedLeads = useMemo(() => leads.filter((lead) => lead.archived), [leads]);
  const filteredLeads = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    let result = query ? activeLeads.filter((lead) => `${lead.businessName} ${lead.category ?? ''} ${lead.city ?? ''} ${lead.address ?? ''}`.toLowerCase().includes(query)) : [...activeLeads];
    if (leadFilter === 'has-phone') result = result.filter((lead) => Boolean(lead.phone));
    if (leadFilter === 'has-website') result = result.filter((lead) => Boolean(lead.website));
    if (leadFilter === 'has-email') result = result.filter((lead) => lead.emails.length > 0);
    if (leadFilter === 'rating-4') result = result.filter((lead) => (lead.rating ?? 0) >= 4);
    if (leadFilter === 'distance-10') result = result.filter((lead) => lead.distanceKm !== null && lead.distanceKm <= 10);
    result.sort((a, b) => sortBy === 'name' ? a.businessName.localeCompare(b.businessName) : sortBy === 'rating' ? (b.rating ?? -1) - (a.rating ?? -1) : sortBy === 'distance' ? (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) : b.discoveredAt.localeCompare(a.discoveredAt));
    return result;
  }, [activeLeads, searchFilter, leadFilter, sortBy]);

  const activeSearch = searches[0] ?? null;
  const running = progress?.status === 'starting' || progress?.status === 'discovering' || progress?.status === 'processing' || progress?.status === 'resuming' || progress?.status === 'retrying' || progress?.status === 'enriching' || progress?.status === 'paused';
  const start = async () => {
    setError(''); setNotice(''); setStarting(true);
    try {
      if (!auth?.authenticated) return setError('Log in to the CRM before starting discovery.');
      if (!config.businessType.trim()) return setError('Enter a business type first.');
      if (config.maxResults < 1 || config.maxResults > 5000) return setError('Maximum results must be between 1 and 5,000.');
      if (config.radiusKm !== null && (config.radiusKm <= 0 || config.radiusKm > MAX_RADIUS_KM)) return setError(`Radius must be between 0 and ${MAX_RADIUS_KM} km.`);
      await SettingsRepository.save('config', config);
      const response = await runtimeMessage<{ ok: boolean; error?: string; searchId?: string }>({ type: 'START_DISCOVERY', config });
      if (!response?.ok) return setError(response?.error ?? 'Could not start discovery. Open Google Maps and make sure a search is visible.');
      setNotice('Discovery started. Keep the Google Maps tab visible while results load.');
      setProgress({ searchId: response.searchId ?? '', status: 'starting', query: `${config.businessType} near ${config.location}`, discovered: 0, duplicates: 0, unique: 0, withPhone: 0, withWebsite: 0, withEmail: 0, iteration: 0, maxIterations: config.safetyLimit ?? 400 });
    } finally { setStarting(false); }
  };
  const exportLeads = (kind: 'csv' | 'xlsx') => {
    const selectedLeads = selected.size ? filteredLeads.filter((lead) => selected.has(lead.id)) : filteredLeads;
    if (!selectedLeads.length) return setError('There are no leads to export for the current selection.');
    if (kind === 'csv') downloadBlob(toCsv(selectedLeads), 'text/csv;charset=utf-8', filenameFor(activeSearch, 'csv'));
    else downloadBlob(createXlsx(selectedLeads, activeSearch), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filenameFor(activeSearch, 'xlsx'));
    if (activeSearch) void runtimeMessage({ type: 'MARK_EXPORTED', searchId: activeSearch.id, count: selectedLeads.length });
    setNotice(`${selectedLeads.length.toLocaleString()} lead${selectedLeads.length === 1 ? '' : 's'} exported locally.`);
  };
  const changeTheme = (next: Theme) => { setTheme(next); void SettingsRepository.save('theme', next); };
  const toggleEnrichment = async (enabled: boolean) => {
    if (!enabled) return setConfig((current) => ({ ...current, enableEnrichment: false }));
    const allowed = await chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
    if (!allowed) return setError('Website enrichment stays off until optional public-site access is granted.');
    setConfig((current) => ({ ...current, enableEnrichment: true }));
  };
  const useMapsContext = async () => {
    setError('');
    const response = await runtimeMessage<{ ok: boolean; context?: MapsContext }>({ type: 'GET_MAPS_CONTEXT' });
    const query = response?.context?.query?.trim();
    if (!response?.ok || !query) return setError('No active Google Maps search was found. Enter a location manually.');
    setConfig((current) => ({ ...current, location: query }));
    setNotice(`Using the active Maps context: ${query}`);
  };
  const logoutUser = async () => { await runtimeMessage({ type: 'LOGOUT' }); setAuth({ authenticated: false, apiBaseUrl: null, user: null }); setNotice('You have been logged out. Local leads remain on this browser.'); };
  const addToCrmByIds = async (ids: string[]) => {
    if (!ids.length) return setError('Select at least one business to add to the CRM.');
    const response = await runtimeMessage<{ ok: boolean; error?: string; state?: CrmImportProgress }>({ type: 'IMPORT_TO_CRM', leadIds: ids });
    if (!response?.ok) setError(response?.error ?? 'CRM import could not start.'); else setCrmImport(response.state ?? null);
  };
  const importSelected = () => addToCrmByIds([...selected]);
  // Clear = archive the current workspace into History (never a hard delete).
  const clearToHistory = async () => {
    if (!activeLeads.length) { setConfirmClear(false); return; }
    const count = activeLeads.length;
    const stamp = nowIso();
    await LeadRepository.saveMany(activeLeads.map((lead) => ({ ...lead, archived: true, archivedAt: stamp })));
    setConfirmClear(false);
    setSelected(new Set());
    await refreshDataOnly();
    setNotice(`${count.toLocaleString()} business${count === 1 ? '' : 'es'} moved to History.`);
  };
  const downloadLeads = (list: Lead[], kind: 'csv' | 'xlsx') => {
    if (!list.length) return setError('There are no businesses to download for the current selection.');
    const payload = kind === 'csv' ? toCsv(list) : createXlsx(list, activeSearch);
    downloadBlob(payload, kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filenameFor(activeSearch, kind));
    setNotice(`${list.length.toLocaleString()} business${list.length === 1 ? '' : 'es'} downloaded.`);
  };
  const removeFromHistory = async (id: string) => {
    await LeadRepository.remove(id);
    await refreshDataOnly();
  };
  const retryFailed = async () => { const response = await runtimeMessage<{ ok: boolean; error?: string; state?: CrmImportProgress }>({ type: 'RETRY_CRM_IMPORT' }); if (!response?.ok) setError(response?.error ?? 'CRM retry could not start.'); else setCrmImport(response.state ?? null); };
  const cancelImport = async () => {
    // Optimistically reflect "Cancelling…" while the background run stops at its
    // next batch boundary; the final 'cancelled' state arrives via CRM_IMPORT_PROGRESS.
    setCrmImport((current) => (current && current.status === 'running' ? { ...current, cancelRequested: true } : current));
    const response = await runtimeMessage<{ ok: boolean; error?: string; state?: CrmImportProgress | null }>({ type: 'CANCEL_CRM_IMPORT' });
    if (!response?.ok) setError(response?.error ?? 'Could not cancel the CRM import.');
    else if (response.state) setCrmImport(response.state);
  };
  // The lead whose detail drawer is open, resolved live from state so on-demand
  // detail hydration (rating breakdown, photos, hours) reflects immediately.
  const detailLead = useMemo(() => (detailLeadId ? leads.find((lead) => lead.id === detailLeadId) ?? null : null), [detailLeadId, leads]);
  const loadLeadDetails = async (leadId: string) => {
    setDetailLoading(true); setError('');
    try {
      const response = await runtimeMessage<{ ok: boolean; lead?: Lead; error?: string }>({ type: 'COLLECT_LEAD_DETAILS', leadId });
      if (!response?.ok || !response.lead) { setError(response?.error ?? 'Could not read more details for this business from Google Maps.'); return; }
      const updated = response.lead;
      setLeads((current) => current.map((lead) => (lead.id === updated.id ? { ...lead, ...updated } : lead)));
      setNotice('Full business details loaded from Google Maps.');
    } finally { setDetailLoading(false); }
  };
  // CRM web origin (for "View lead" deep links) derived from the stored API base.
  const crmOrigin = useMemo(() => (auth?.apiBaseUrl ? auth.apiBaseUrl.replace(/\/api\/v1\/?$/, '') : null), [auth]);
  // The leads this import run actually created in the CRM, with their L-numbers.
  const importedLeads = useMemo(() => {
    if (!crmImport?.leadIds?.length) return [] as Lead[];
    const ids = new Set(crmImport.leadIds);
    return leads.filter((lead) => ids.has(lead.id) && lead.crmStatus === 'imported' && Boolean(lead.crmLeadId));
  }, [crmImport, leads]);
  const navItems: Array<{ key: Page; label: string; icon: IconName; count?: number }> = [{ key: 'discover', label: 'Discover', icon: 'spark' }, { key: 'leads', label: 'Leads', icon: 'users', count: activeLeads.length }, { key: 'history', label: 'History', icon: 'history', count: archivedLeads.length }, { key: 'settings', label: 'Settings', icon: 'settings' }];

  if (authLoading) return <div className={`app-shell ${theme}`}><div className="auth-screen"><div className="auth-card"><div className="brand-mark"><Icon name="spark" size={17} /></div><p className="eyebrow">LEAD FINDER</p><h2>Loading workspace…</h2><p>Restoring your local discovery state.</p></div></div></div>;
  if (!auth?.authenticated) return <LoginView theme={theme} onAuthenticated={setAuth} onTheme={changeTheme} />;
  const displayName = auth.user?.fullName || [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(' ') || auth.user?.email || 'Authenticated user';
  return <div className={`app-shell ${theme}`}>
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark"><Icon name="spark" size={17} /></div><div><p className="eyebrow">LOCAL RESEARCH TOOL</p><h1>Lead Finder</h1><span className="connected-user">Connected as {displayName}</span></div></div><div className="topbar-actions"><button className="text-button" onClick={() => void logoutUser()}>Logout</button><button className="icon-button theme-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title="Toggle theme" onClick={() => changeTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} /></button></div></header>
    <nav className="nav-tabs" aria-label="Primary navigation">{navItems.map((item) => <button key={item.key} className={page === item.key ? 'active' : ''} aria-current={page === item.key ? 'page' : undefined} onClick={() => setPage(item.key)}><Icon name={item.icon} size={14} /><span>{item.label}</span>{item.count ? <b>{item.count > 999 ? '999+' : item.count}</b> : null}</button>)}</nav>
    {(error || notice) && <StatusBanner kind={error ? 'error' : 'notice'} text={error || notice} onClose={() => { setError(''); setNotice(''); }} />}
    <main className="content">{crmImport && crmImport.status !== 'idle' && <CrmImportCard progress={crmImport} onRetry={retryFailed} onCancel={() => void cancelImport()} importedLeads={importedLeads} crmOrigin={crmOrigin} />}{page === 'discover' && <DiscoverView config={config} setConfig={setConfig} running={running || starting} progress={progress} onStart={start} onToggleEnrichment={toggleEnrichment} onUseMapsContext={useMapsContext} onViewLeads={() => setPage('leads')} onPause={() => void runtimeMessage({ type: 'PAUSE_DISCOVERY' })} onResume={() => void runtimeMessage({ type: 'RESUME_DISCOVERY' })} onStop={() => void runtimeMessage({ type: 'STOP_DISCOVERY' })} onRetry={() => void runtimeMessage({ type: 'RETRY_DISCOVERY' })} />}{page === 'leads' && <LeadsView leads={filteredLeads} allLeads={leads} filter={searchFilter} setFilter={setSearchFilter} leadFilter={leadFilter} setLeadFilter={setLeadFilter} sortBy={sortBy} setSortBy={setSortBy} selected={selected} setSelected={setSelected} onExport={exportLeads} onImport={importSelected} onClear={() => setConfirmClear(true)} canClear={activeLeads.length > 0} importing={crmImport?.status === 'running'} onOpen={setDetailLeadId} />}{page === 'history' && <HistoryView leads={archivedLeads} searches={searches} onAddToCrm={addToCrmByIds} onDownload={downloadLeads} onRemove={removeFromHistory} onDiscover={() => setPage('discover')} importing={crmImport?.status === 'running'} onOpen={setDetailLeadId} />}{page === 'settings' && <SettingsView config={config} setConfig={setConfig} onToggleEnrichment={toggleEnrichment} theme={theme} setTheme={changeTheme} onCleared={async () => { await runtimeMessage({ type: 'CLEAR_ALL_DATA' }); setConfig(defaultConfig); setTheme('light'); setLeads([]); setSearches([]); setSelected(new Set()); setNotice('All local leads, sessions, exports, and settings were deleted.'); }} />}</main>
    {confirmClear && <ConfirmClearDialog count={activeLeads.length} onCancel={() => setConfirmClear(false)} onConfirm={() => void clearToHistory()} />}
    {detailLead && <LeadDetailDrawer lead={detailLead} loading={detailLoading} importing={crmImport?.status === 'running'} crmOrigin={crmOrigin} onClose={() => setDetailLeadId(null)} onLoadDetails={(id) => void loadLeadDetails(id)} onAddToCrm={addToCrmByIds} />}
    <footer><span className="privacy-mark"><Icon name="target" size={11} /></span><span>Stored only in this browser</span><i /> <span>Maps data is collected only when exposed in your session</span></footer>
  </div>;
}

function StatusBanner({ kind, text, onClose }: { kind: 'error' | 'notice'; text: string; onClose: () => void }) { return <div className={`status-banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span className="status-icon">{kind === 'error' ? '!' : '✓'}</span><span>{text}</span><button aria-label="Dismiss message" onClick={onClose}><Icon name="close" size={14} /></button></div>; }
function LoginView({ theme, onAuthenticated, onTheme }: { theme: Theme; onAuthenticated: (auth: CrmAuthState) => void; onTheme: (theme: Theme) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); setBusy(true); try { const response = await runtimeMessage<{ ok: boolean; auth?: CrmAuthState; error?: string }>({ type: 'LOGIN', apiBaseUrl: DEFAULT_CRM_API_BASE_URL, email, password }); if (!response?.ok || !response.auth) throw new Error(response?.error ?? 'Login failed.'); onAuthenticated(response.auth); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Login failed.'); } finally { setBusy(false); } };
  return <div className={`app-shell ${theme}`}><div className="auth-screen"><button type="button" className="icon-button auth-theme" onClick={() => onTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Toggle theme" title="Toggle theme"><Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} /></button><form className="auth-card" onSubmit={submit}><div className="brand-mark"><Icon name="spark" size={17} /></div><p className="eyebrow">LOCAL RESEARCH TOOL</p><h2>Connect Lead Finder</h2><p>In your CRM, open <strong>Leads → Chrome Extension → Connect</strong>. This browser links automatically — no password is entered here.</p><p className="auth-divider"><span>or sign in manually</span></p><label className="field" htmlFor="login-email"><span>Email</span><input id="login-email" type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><div className="field"><label htmlFor="login-password">Password</label><div className="password-input"><input id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}><Icon name={showPassword ? 'eye-off' : 'eye'} size={17} /></button></div></div>{error && <p className="auth-error" role="alert">{error}</p>}<button className="primary-action" disabled={busy}>{busy ? <><span>Signing in…</span><span className="button-spinner" aria-hidden="true" /></> : <><span>Login</span><Icon name="arrow" size={18} /></>}</button><small className="auth-footnote">Your password is sent only to the configured application API. The extension never sends credentials to Google Maps.</small></form></div></div>;
}
function CrmImportCard({ progress, onRetry, onCancel, importedLeads, crmOrigin }: { progress: CrmImportProgress; onRetry: () => void; onCancel: () => void; importedLeads: Lead[]; crmOrigin: string | null }) {
  const pct = progress.total ? Math.round((progress.processed / progress.total) * 100) : 0;
  const active = progress.status === 'running';
  const cancelling = active && Boolean(progress.cancelRequested);
  const done = !active;
  // A single successful add gets a focused confirmation with its CRM lead number.
  const single = done && progress.created === 1 && importedLeads.length === 1 ? importedLeads[0] : null;
  const leadHref = (lead: Lead) => (crmOrigin && lead.crmLeadId ? `${crmOrigin}/leads?detail=${encodeURIComponent(lead.crmLeadId)}` : null);
  const singleHref = single ? leadHref(single) : null;
  const showActions = done && (progress.failedLeadIds.length > 0 || (progress.created > 0 && Boolean(crmOrigin)));
  return <section className="crm-import-card">
    <div>
      <p className="eyebrow">CRM IMPORT</p>
      <h3>{cancelling ? 'Cancelling import…' : active ? 'Adding leads to CRM…' : progress.status === 'completed' ? 'CRM import complete ✓' : progress.status === 'partial' ? 'Import completed with warnings' : progress.status === 'cancelled' ? 'CRM import cancelled' : 'CRM import failed'}</h3>
      <p>{progress.processed} / {progress.total} processed</p>
      <div className="crm-import-stats"><span className="stat added">{progress.created} added</span><span className="stat existing">{progress.existing} existing</span><span className="stat failed">{progress.failed} failed</span></div>
      {single && <p className="crm-import-single">✓ {single.businessName}{single.crmLeadNumber ? ` · ${single.crmLeadNumber}` : ''}</p>}
      {progress.status === 'cancelled' && <p className="crm-import-single">Stopped at your request · {progress.created.toLocaleString()} added before cancelling. The rest stay selectable to add again.</p>}
      {progress.error && <p className="crm-error-detail">{progress.error}</p>}
    </div>
    <div className={`progress-bar${active && pct === 0 ? ' indeterminate' : ''}`}><span style={{ width: active && pct === 0 ? '40%' : `${pct}%` }} /></div>
    {active && <div className="crm-import-actions"><button className="text-button danger-link" disabled={cancelling} onClick={onCancel}>{cancelling ? 'Cancelling…' : 'Cancel import'}</button></div>}
    {showActions && <div className="crm-import-actions">
      {progress.created > 0 && crmOrigin && (singleHref
        ? <a className="secondary-button" href={singleHref} target="_blank" rel="noreferrer">View lead</a>
        : <a className="secondary-button" href={`${crmOrigin}/leads`} target="_blank" rel="noreferrer">View imported leads</a>)}
      {progress.failedLeadIds.length > 0 && <button className="secondary-button" onClick={onRetry}>Retry failed ({progress.failedLeadIds.length})</button>}
    </div>}
  </section>;
}
function SectionHeading({ eyebrow, title, description, index }: { eyebrow: string; title: string; description?: string; index?: string }) { return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3>{description && <p>{description}</p>}</div>{index && <span className="step-badge">{index}</span>}</div>; }
function Field({ id, label, optional, children }: { id: string; label: string; optional?: boolean; children: React.ReactNode }) { return <label className="field" htmlFor={id}><span>{label}{optional && <em>Optional</em>}</span>{children}</label>; }

function DiscoverView({ config, setConfig, running, progress, onStart, onToggleEnrichment, onUseMapsContext, onViewLeads, onPause, onResume, onStop, onRetry }: { config: DiscoveryConfig; setConfig: React.Dispatch<React.SetStateAction<DiscoveryConfig>>; running: boolean; progress: DiscoveryProgress | null; onStart: () => void; onToggleEnrichment: (enabled: boolean) => void; onUseMapsContext: () => void; onViewLeads: () => void; onPause: () => void; onResume: () => void; onStop: () => void; onRetry: () => void }) {
  const set = <K extends keyof DiscoveryConfig>(key: K, value: DiscoveryConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const radiusIsCustom = config.radiusKm !== null && !RADIUS_OPTIONS.some((value) => value === config.radiusKm);
  const customBusinessType = !BUSINESS_TYPE_PRESETS.includes(config.businessType as typeof BUSINESS_TYPE_PRESETS[number]);
  const businessTypeSelectValue = config.businessType ? (customBusinessType ? '__custom__' : config.businessType) : '';
  return <section className="view stack"><section className="hero-card"><div className="hero-copy"><div className="hero-meta"><span className="eyebrow">DISCOVERY WORKSPACE</span><span className="hero-badge">LOCAL-FIRST · CRM CONNECTED</span></div><h2>Find the businesses<br /><em>worth reaching.</em></h2><p>Turn your active Google Maps research into a clean, local lead list.</p></div><div className="hero-visual" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span><Icon name="target" size={27} /></span><small>LOCAL<br />FIRST</small></div></section>
    <section className="panel search-panel"><SectionHeading eyebrow="01 / SEARCH BRIEF" title="Where should we look?" description="Shape the research brief before opening the Maps workflow." index="A" /><div className="form-grid"><Field id="business-type" label="Business type"><div className="select-wrap"><select id="business-type" value={businessTypeSelectValue} onChange={(event) => set('businessType', event.target.value === '__custom__' ? '' : event.target.value)}><option value="">Select a business type</option>{BUSINESS_TYPE_PRESETS.map((businessType) => <option value={businessType} key={businessType}>{businessType}</option>)}<option value="__custom__">Custom business type…</option></select><Icon name="chevron" size={15} /></div>{customBusinessType && <input id="custom-business-type" className="custom-business-type" value={config.businessType} onChange={(event) => set('businessType', event.target.value)} placeholder="e.g. boutique hotel, coworking space, solar installer" />}</Field><Field id="location" label="Location" optional><div className="location-input"><input id="location" value={config.location} onChange={(event) => set('location', event.target.value)} placeholder="e.g. Gulberg, Lahore" /><button type="button" className="inline-action" onClick={onUseMapsContext}>Use current Maps search</button></div></Field></div><div className="form-grid split"><Field id="radius" label="Radius"><div className="select-wrap"><select id="radius" value={radiusIsCustom ? 'custom' : config.radiusKm ?? 'none'} onChange={(event) => { if (event.target.value === 'none') set('radiusKm', null); else if (event.target.value === 'custom') set('radiusKm', 25); else set('radiusKm', Number(event.target.value)); }}><option value="none">No distance filter</option>{RADIUS_OPTIONS.map((value) => <option value={value} key={value}>{value < 1 ? `${value * 1000} m` : `${value} km`}</option>)}<option value="custom">Custom</option></select><Icon name="chevron" size={15} /></div>{radiusIsCustom && <input className="custom-radius" aria-label="Custom radius in kilometres" type="number" min="0.1" max={MAX_RADIUS_KM} step="0.1" value={config.radiusKm ?? 25} onChange={(event) => set('radiusKm', Number(event.target.value))} />}</Field><Field id="max-results" label="Maximum results"><input id="max-results" type="number" min="1" max="5000" value={config.maxResults} onChange={(event) => set('maxResults', Number(event.target.value))} /></Field></div><label className="check-control"><input type="checkbox" checked={config.areaSweep !== false} onChange={(event) => set('areaSweep', event.target.checked)} /><span className="custom-check"><Icon name="check" size={13} /></span><span><strong>Scan the entire area</strong><small>Split the map into an adaptive grid so no business is missed — this is how you capture every result past Google's ~120-per-search limit.</small></span></label><label className="check-control"><input type="checkbox" checked={Boolean(config.thoroughContacts)} onChange={(event) => set('thoroughContacts', event.target.checked)} /><span className="custom-check"><Icon name="check" size={13} /></span><span><strong>Fetch phone &amp; website for each</strong><small>Opens every place page for full contact details. More complete, much slower — leave off for a fast sweep.</small></span></label><label className="check-control"><input type="checkbox" checked={config.queryExpansion} onChange={(event) => set('queryExpansion', event.target.checked)} /><span className="custom-check"><Icon name="check" size={13} /></span><span><strong>Expand search query</strong><small>Only used when area scan is off — tries a few location variations.</small></span></label></section>
    <section className="panel enrichment-panel"><SectionHeading eyebrow="02 / OPTIONAL ENRICHMENT" title="Public website contacts" description="Find contact details that businesses publish openly." index="B" /><label className="check-control"><input type="checkbox" checked={config.enableEnrichment} onChange={(event) => onToggleEnrichment(event.target.checked)} /><span className="custom-check"><Icon name="check" size={13} /></span><span><strong>Find publicly listed emails</strong><small>Only the business website and up to {config.maxPagesPerWebsite} contact pages.</small></span></label><p className="microcopy">Emails are reported as <strong>found</strong>, never SMTP-verified.</p></section>
    {progress && progress.status !== 'idle' && <ProgressCard progress={progress} running={running} onPause={onPause} onResume={onResume} onStop={onStop} onRetry={onRetry} onViewLeads={onViewLeads} />}<button className="primary-action" disabled={running} onClick={onStart}><span>{running ? 'Discovery in progress' : progress?.status === 'completed' ? 'Start new discovery' : 'Start discovery'}</span><Icon name="arrow" size={19} /></button><div className="trust-row"><Icon name="target" size={12} /><span>Information stays in IndexedDB</span><i /><span>No hidden requests or proxy rotation</span></div>
  </section>;
}

function ProgressCard({ progress, running, onPause, onResume, onStop, onRetry, onViewLeads }: { progress: DiscoveryProgress; running: boolean; onPause: () => void; onResume: () => void; onStop: () => void; onRetry: () => void; onViewLeads: () => void }) {
  const failed = progress.status === 'failed' || progress.status === 'error';
  const stopped = progress.status === 'cancelled' || progress.status === 'stopped';
  const terminal = progress.status === 'completed' || failed || stopped;
  const pct = progress.status === 'completed' ? 100 : progress.configuredMaximum ? Math.min(99, Math.round((progress.unique / Math.max(1, progress.configuredMaximum)) * 100)) : 0;
  const title = progress.status === 'paused' ? 'Discovery paused' : progress.status === 'resuming' ? 'Resuming discovery' : progress.status === 'retrying' ? 'Retrying from checkpoint' : progress.status === 'completed' ? 'Discovery complete' : stopped ? 'Discovery stopped' : failed ? 'Discovery needs attention' : 'Discovering businesses';
  return <section className="progress-card"><div className="progress-top"><div><div className="progress-title"><span className={`status-dot ${progress.status}`} /><strong>{title}</strong></div><p>{progress.query || 'Active Google Maps session'}</p></div><div className="progress-number"><strong>{progress.unique.toLocaleString()}</strong><span>unique</span></div></div><div className="progress-bar" aria-label={terminal ? `${pct}% complete` : 'Discovery is continuing'}><span style={{ width: `${Math.max(4, pct)}%` }} /></div><div className="metric-grid"><Metric label="Processed" value={progress.processed ?? progress.discovered} /><Metric label="Duplicates" value={progress.duplicates} /><Metric label={progress.tilesScanned ? 'Areas scanned' : 'Current batch'} value={progress.tilesScanned ? progress.tilesScanned : (progress.currentBatch ?? 0)} /><Metric label="Phone" value={progress.withPhone} /><Metric label="Website" value={progress.withWebsite} /><Metric label="Email" value={progress.withEmail} /></div>{progress.configuredMaximum && !terminal && <p className="progress-message">{progress.tilesScanned ? `Sweeping the area · ${progress.tilesScanned.toLocaleString()} of ~${(progress.tilesPlanned || progress.tilesScanned).toLocaleString()} map areas · ${progress.unique.toLocaleString()} found` : `Continuing through Maps results · ${progress.unique.toLocaleString()} of ${progress.configuredMaximum.toLocaleString()} configured maximum`}</p>}{progress.message && <p className="progress-message">{progress.message}</p>}<div className="progress-actions">{terminal ? <>{(failed || stopped) && <button className="secondary-button" onClick={onRetry}>Resume from checkpoint</button>}<button className="secondary-button" onClick={onViewLeads}>View leads <Icon name="arrow" size={13} /></button></> : progress.status === 'paused' ? <button className="secondary-button" onClick={onResume}>Resume</button> : <button className="secondary-button" onClick={onPause} disabled={!running}>Pause</button>}{!terminal && <button className="text-button danger-link" onClick={onStop}>Stop</button>}</div></section>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value.toLocaleString()}</strong></div>; }

function LeadsView({ leads, allLeads, filter, setFilter, leadFilter, setLeadFilter, sortBy, setSortBy, selected, setSelected, onExport, onImport, onClear, canClear, importing, onOpen }: { leads: Lead[]; allLeads: Lead[]; filter: string; setFilter: (value: string) => void; leadFilter: string; setLeadFilter: (value: string) => void; sortBy: string; setSortBy: (value: string) => void; selected: Set<string>; setSelected: React.Dispatch<React.SetStateAction<Set<string>>>; onExport: (kind: 'csv' | 'xlsx') => void; onImport: () => void; onClear: () => void; canClear: boolean; importing: boolean; onOpen: (id: string) => void }) {
  const allVisibleSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id)); const toggleAll = () => setSelected((current) => allVisibleSelected ? new Set([...current].filter((id) => !leads.some((lead) => lead.id === id))) : new Set([...current, ...leads.map((lead) => lead.id)]));
  return <section className="view stack"><div className="page-heading"><div><p className="eyebrow">YOUR LOCAL PIPELINE</p><h2>Discovered leads</h2><p>{allLeads.length.toLocaleString()} unique businesses stored locally.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => onExport('csv')}><Icon name="download" size={14} /> CSV</button><button className="dark-button" onClick={() => onExport('xlsx')}><Icon name="download" size={14} /> Excel</button><button className="secondary-button" onClick={onClear} disabled={!canClear} title="Move current results to History"><Icon name="history" size={14} /> Clear</button></div></div><div className="toolbar"><div className="search-input"><Icon name="search" size={14} /><input aria-label="Search leads" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search name, category, city…" /></div><div className="toolbar-selects"><select aria-label="Filter leads" value={leadFilter} onChange={(event) => setLeadFilter(event.target.value)}><option value="all">All leads</option><option value="has-phone">Has phone</option><option value="has-website">Has website</option><option value="has-email">Has email</option><option value="rating-4">Rating 4+</option><option value="distance-10">Within 10 km</option></select><select aria-label="Sort leads" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Newest</option><option value="name">Business name</option><option value="distance">Distance</option><option value="rating">Rating</option></select></div><button className="secondary-button select-button" onClick={toggleAll}>{allVisibleSelected ? 'Clear visible' : 'Select visible'}</button></div><div className="selection-summary">{selected.size ? `${selected.size} selected` : 'Select leads to export a focused list'}<button className="primary-action compact" disabled={!selected.size || importing} onClick={onImport}>{importing ? <><span>Adding…</span><span className="button-spinner" aria-hidden="true" /></> : `Add ${selected.size || ''} to CRM`}</button><span>{leads.length.toLocaleString()} shown</span></div><VirtualLeadTable leads={leads} selected={selected} setSelected={setSelected} onOpen={onOpen} /></section>;
}
function VirtualLeadTable({ leads, selected, setSelected, onOpen }: { leads: Lead[]; selected: Set<string>; setSelected: React.Dispatch<React.SetStateAction<Set<string>>>; onOpen: (id: string) => void }) {
  const [scrollTop, setScrollTop] = useState(0); const rowHeight = 72; const viewportHeight = 520; const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3); const visible = leads.slice(start, start + Math.ceil(viewportHeight / rowHeight) + 6);
  if (!leads.length) return <div className="empty-state"><div className="empty-icon"><Icon name="users" size={22} /></div><h3>Your lead table is waiting</h3><p>Run a discovery from the Discover tab and your locally stored results will appear here.</p></div>;
  const crmChip = (lead: Lead) => (lead.crmStatus === 'imported' || lead.crmStatus === 'existing')
    ? <span className="signal yes" title={crmStatusMeta(lead).label}>CRM</span>
    : lead.crmStatus === 'failed' ? <span className="signal email" title="CRM import failed">CRM!</span> : null;
  return <div className="table-shell"><div className="table-header"><span>Business</span><span>Contact</span><span>Location</span><span>Signal</span></div><div className="virtual-viewport" style={{ height: viewportHeight }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div style={{ height: leads.length * rowHeight, position: 'relative' }}><div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>{visible.map((lead) => <div className="lead-row clickable" style={{ height: rowHeight }} key={lead.id} role="button" tabIndex={0} aria-label={`View ${lead.businessName} details`} onClick={() => onOpen(lead.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(lead.id); } }}><label className="row-check" aria-label={`Select ${lead.businessName}`} onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(lead.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })} /><span /></label><div className="business-cell"><strong>{lead.businessName || 'Unnamed business'}</strong><small>{lead.category ?? 'Business'} {lead.rating ? `· ${lead.rating} ★` : ''} {lead.reviewCount !== null && lead.reviewCount !== undefined ? `· ${lead.reviewCount.toLocaleString()} reviews` : ''}</small></div><div className="contact-cell"><span>{lead.phone ?? 'No phone exposed'}</span><small>{lead.emails[0] ?? (lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'No email found')}</small></div><div className="location-cell"><span title={lead.address ?? undefined}>{[lead.area, lead.city, lead.country].filter(Boolean).join(', ') || lead.address || 'Address not exposed'}</span><small>{formatDistance(lead.distanceKm)}</small></div><div className="signal-cell"><span className={lead.website ? 'signal yes' : 'signal'}>{lead.website ? 'Web' : '—'}</span><span className={lead.emails.length ? 'signal email' : 'signal'}>{lead.emails.length ? 'Email' : '—'}</span>{crmChip(lead)}</div></div>)}</div></div></div></div>;
}
function crmStatusMeta(lead: Lead): { label: string; cls: string } {
  switch (lead.crmStatus) {
    case 'imported': return { label: 'Added to CRM', cls: 'added' };
    case 'existing': return { label: 'Already in CRM', cls: 'existing' };
    case 'failed': return { label: 'Failed', cls: 'failed' };
    case 'importing': return { label: 'Adding…', cls: 'importing' };
    default: return { label: 'New', cls: 'new' };
  }
}

const RATING_LEVELS = [5, 4, 3, 2, 1] as const;

function RatingBars({ breakdown }: { breakdown: RatingBreakdown }) {
  const total = RATING_LEVELS.reduce((sum, level) => sum + (breakdown[level] || 0), 0) || 1;
  return <div className="rating-bars">{RATING_LEVELS.map((level) => {
    const count = breakdown[level] || 0;
    const pct = Math.round((count / total) * 100);
    return <div className="rating-bar-row" key={level}><span className="rating-bar-label">{level}★</span><span className="rating-bar-track"><span className="rating-bar-fill" style={{ width: `${pct}%` }} /></span><span className="rating-bar-count">{count.toLocaleString()}</span></div>;
  })}</div>;
}

function DrawerFact({ label, value, href, external }: { label: string; value: string | null; href?: string | null; external?: boolean }) {
  return <div className="drawer-fact"><dt>{label}</dt><dd>{value ? (href ? <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>{value}</a> : value) : <span className="drawer-muted">Not available</span>}</dd></div>;
}

function LeadDetailDrawer({ lead, loading, importing, crmOrigin, onClose, onLoadDetails, onAddToCrm }: { lead: Lead; loading: boolean; importing: boolean; crmOrigin: string | null; onClose: () => void; onLoadDetails: (id: string) => void; onAddToCrm: (ids: string[]) => void }) {
  const meta = crmStatusMeta(lead);
  const websiteUrl = lead.website ? (/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`) : null;
  const crmHref = crmOrigin && lead.crmLeadId ? `${crmOrigin}/leads?detail=${encodeURIComponent(lead.crmLeadId)}` : null;
  const alreadyInCrm = lead.crmStatus === 'imported' || lead.crmStatus === 'existing';
  const hasBreakdown = Boolean(lead.ratingBreakdown) && RATING_LEVELS.some((level) => (lead.ratingBreakdown![level] || 0) > 0);
  const locationLine = [lead.area, lead.city, lead.state, lead.country].filter(Boolean).join(', ') || null;
  return <div className="drawer-overlay" role="dialog" aria-modal="true" aria-label={`${lead.businessName} details`} onClick={onClose}>
    <aside className="lead-drawer" onClick={(event) => event.stopPropagation()}>
      <header className="drawer-head">
        <div className="drawer-head-copy"><span className={`crm-badge ${meta.cls}`}>{meta.label}</span><h3>{lead.businessName || 'Unnamed business'}</h3><p>{lead.category ?? 'Business'}{lead.businessStatus ? ` · ${lead.businessStatus}` : ''}</p></div>
        <button className="icon-button" aria-label="Close details" onClick={onClose}><Icon name="close" size={16} /></button>
      </header>
      <div className="drawer-body">
        {lead.photos?.length ? <div className="drawer-photos">{lead.photos.slice(0, 6).map((url, index) => <img key={index} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />)}</div> : null}
        <div className="drawer-rating">
          <div className="drawer-rating-score"><strong>{lead.rating != null ? lead.rating.toFixed(1) : '—'}</strong><span className="drawer-stars" aria-hidden="true">★★★★★</span><span className="drawer-rating-count">{lead.reviewCount != null ? `${lead.reviewCount.toLocaleString()} reviews` : 'No reviews exposed'}</span></div>
          {hasBreakdown ? <RatingBars breakdown={lead.ratingBreakdown!} /> : <p className="drawer-muted drawer-rating-hint">Rating distribution isn’t in the list view. Use “Load full details” to read the 5★–1★ breakdown from the business page when Google exposes it.</p>}
        </div>
        <dl className="drawer-facts">
          <DrawerFact label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : null} />
          <DrawerFact label="Website" value={websiteUrl ? websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : null} href={websiteUrl} external />
          <DrawerFact label="Email" value={lead.emails[0] ?? null} href={lead.emails[0] ? `mailto:${lead.emails[0]}` : null} />
          <DrawerFact label="Address" value={lead.address} />
          <DrawerFact label="Location" value={locationLine} />
          <DrawerFact label="Coordinates" value={lead.latitude != null && lead.longitude != null ? `${lead.latitude.toFixed(5)}, ${lead.longitude.toFixed(5)}` : null} />
          <DrawerFact label="Categories" value={lead.categories.length ? lead.categories.join(' · ') : lead.category} />
        </dl>
        {lead.openingHours?.length ? <div className="drawer-section"><p className="eyebrow">OPENING HOURS</p><ul className="drawer-hours">{lead.openingHours.slice(0, 7).map((line, index) => <li key={index}>{line}</li>)}</ul></div> : null}
      </div>
      <footer className="drawer-actions">
        <a className="secondary-button" href={lead.googleMapsUrl} target="_blank" rel="noreferrer"><Icon name="target" size={14} /> Open business</a>
        {!alreadyInCrm && <button className="primary-action compact" disabled={importing} onClick={() => onAddToCrm([lead.id])}>{importing ? <><span>Adding…</span><span className="button-spinner" aria-hidden="true" /></> : 'Add to CRM'}</button>}
        {alreadyInCrm && crmHref && <a className="secondary-button" href={crmHref} target="_blank" rel="noreferrer">View in CRM</a>}
        {/* The lead is already in the CRM, but "Load full details" has now read the
            per-star rating breakdown (and any photos/hours) the first add lacked.
            Re-send it so the CRM backfills those empty fields — the server enriches
            an existing lead without overwriting what it already has. */}
        {alreadyInCrm && hasBreakdown && <button className="primary-action compact" title="Push the newly loaded rating breakdown and details to the CRM" disabled={importing} onClick={() => onAddToCrm([lead.id])}>{importing ? <><span>Updating…</span><span className="button-spinner" aria-hidden="true" /></> : 'Update in CRM'}</button>}
        {alreadyInCrm && !crmHref && !hasBreakdown && <button className="primary-action compact" disabled>In CRM</button>}
        <button className="text-button" disabled={loading} onClick={() => onLoadDetails(lead.id)}>{loading ? 'Loading…' : 'Load full details'}</button>
      </footer>
    </aside>
  </div>;
}

function ConfirmClearDialog({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Clear results">
    <div className="modal-card">
      <h3>Clear results?</h3>
      <p>This will move <strong>{count.toLocaleString()}</strong> business{count === 1 ? '' : 'es'} to History and remove them from the current results. Your History stays available.</p>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
        <button className="primary-action compact" onClick={onConfirm}>Move to History</button>
      </div>
    </div>
  </div>;
}

function HistoryView({ leads, searches, onAddToCrm, onDownload, onRemove, onDiscover, importing, onOpen }: { leads: Lead[]; searches: SearchRecord[]; onAddToCrm: (ids: string[]) => void; onDownload: (list: Lead[], kind: 'csv' | 'xlsx') => void; onRemove: (id: string) => void; onDiscover: () => void; importing: boolean; onOpen: (id: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = q ? leads.filter((lead) => `${lead.businessName} ${lead.category ?? ''} ${lead.city ?? ''} ${lead.address ?? ''}`.toLowerCase().includes(q)) : [...leads];
    if (status === 'new') result = result.filter((l) => !l.crmStatus || l.crmStatus === 'not-imported');
    if (status === 'added') result = result.filter((l) => l.crmStatus === 'imported');
    if (status === 'existing') result = result.filter((l) => l.crmStatus === 'existing');
    if (status === 'failed') result = result.filter((l) => l.crmStatus === 'failed');
    result.sort((a, b) => sort === 'name' ? a.businessName.localeCompare(b.businessName) : sort === 'rating' ? (b.rating ?? -1) - (a.rating ?? -1) : (b.archivedAt ?? b.discoveredAt).localeCompare(a.archivedAt ?? a.discoveredAt));
    return result;
  }, [leads, query, status, sort]);

  const allSelected = filtered.length > 0 && filtered.every((l) => sel.has(l.id));
  const toggleAll = () => setSel((cur) => allSelected ? new Set([...cur].filter((id) => !filtered.some((l) => l.id === id))) : new Set([...cur, ...filtered.map((l) => l.id)]));
  const toggle = (id: string) => setSel((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectedLeads = filtered.filter((l) => sel.has(l.id));
  const downloadSet = selectedLeads.length ? selectedLeads : filtered;

  if (!leads.length) {
    return <section className="view stack"><div className="page-heading"><div><p className="eyebrow">ARCHIVED BUSINESSES</p><h2>History</h2><p>Businesses you clear from your results are kept here.</p></div></div><div className="empty-state"><div className="empty-icon"><Icon name="history" size={22} /></div><h3>No history yet</h3><p>Businesses you clear from your discovery results will appear here — still downloadable and importable.</p><button className="primary-action compact" onClick={onDiscover}><span>Discover businesses</span><Icon name="arrow" size={16} /></button></div></section>;
  }

  return <section className="view stack">
    <div className="page-heading"><div><p className="eyebrow">ARCHIVED BUSINESSES</p><h2>History</h2><p>{leads.length.toLocaleString()} archived · still downloadable and importable.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => onDownload(downloadSet, 'csv')}><Icon name="download" size={14} /> CSV</button><button className="dark-button" onClick={() => onDownload(downloadSet, 'xlsx')}><Icon name="download" size={14} /> Excel</button></div></div>
    <div className="toolbar"><div className="search-input"><Icon name="search" size={14} /><input aria-label="Search history" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, category, city…" /></div><div className="toolbar-selects"><select aria-label="Filter by CRM status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="new">Not added</option><option value="added">Added to CRM</option><option value="existing">Already in CRM</option><option value="failed">Failed</option></select><select aria-label="Sort history" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="name">Business name</option><option value="rating">Rating</option></select></div><button className="secondary-button select-button" onClick={toggleAll}>{allSelected ? 'Clear visible' : 'Select visible'}</button></div>
    <div className="selection-summary">{sel.size ? `${sel.size} selected` : 'Select businesses to import or download'}<button className="primary-action compact" disabled={!sel.size || importing} onClick={() => onAddToCrm([...sel])}>{importing ? <><span>Adding…</span><span className="button-spinner" aria-hidden="true" /></> : `Add ${sel.size || ''} to CRM`}</button><span>{filtered.length.toLocaleString()} shown</span></div>
    <div className="history-leads">{filtered.map((lead) => { const meta = crmStatusMeta(lead); return <div className="history-lead" key={lead.id}><label className="row-check" aria-label={`Select ${lead.businessName}`}><input type="checkbox" checked={sel.has(lead.id)} onChange={() => toggle(lead.id)} /><span /></label><div className="history-lead-main clickable" role="button" tabIndex={0} aria-label={`View ${lead.businessName} details`} onClick={() => onOpen(lead.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(lead.id); } }}><strong>{lead.businessName || 'Unnamed business'}</strong><small>{lead.category ?? 'Business'}{lead.rating ? ` · ${lead.rating} ★` : ''}{lead.reviewCount != null ? ` · ${lead.reviewCount.toLocaleString()} reviews` : ''}</small><small className="muted">{lead.city ?? lead.address ?? 'Location not exposed'}{lead.phone ? ` · ${lead.phone}` : ''}</small></div><span className={`crm-badge ${meta.cls}`}>{meta.label}</span><div className="history-lead-actions">{lead.crmStatus !== 'imported' && lead.crmStatus !== 'existing' && <button className="secondary-button" disabled={importing} onClick={() => onAddToCrm([lead.id])}>Add to CRM</button>}<button className="icon-button" title="Download CSV" aria-label="Download CSV" onClick={() => onDownload([lead], 'csv')}><Icon name="download" size={15} /></button><button className="icon-button" title="Remove from history" aria-label="Remove from history" onClick={() => onRemove(lead.id)}><Icon name="close" size={15} /></button></div></div>; })}</div>
    {searches.length > 0 && <div className="history-sessions"><p className="eyebrow">DISCOVERY SESSIONS</p>{searches.map((search) => <div className="history-session" key={search.id}><span className="history-icon"><Icon name="history" size={14} /></span><span className="history-copy"><strong>{search.businessType}</strong><span>{search.location || 'Current Maps context'} · {new Date(search.startedAt).toLocaleDateString()}</span></span><span className="history-count"><b>{search.uniqueCount.toLocaleString()}</b><small>found</small></span></div>)}</div>}
  </section>;
}
function SettingsView({ config, setConfig, onToggleEnrichment, theme, setTheme, onCleared }: { config: DiscoveryConfig; setConfig: React.Dispatch<React.SetStateAction<DiscoveryConfig>>; onToggleEnrichment: (enabled: boolean) => void; theme: Theme; setTheme: (theme: Theme) => void; onCleared: () => Promise<void> }) { const [confirm, setConfirm] = useState(false); return <section className="view stack"><div className="page-heading"><div><p className="eyebrow">PREFERENCES</p><h2>Settings</h2><p>Simple controls for your local research workspace.</p></div></div><section className="panel settings-panel"><div className="settings-group"><SectionHeading eyebrow="DISCOVERY" title="Research defaults" description="Choose what the next discovery session starts with." /><div className="form-grid split"><label className="field" htmlFor="default-max-results"><span>Default maximum results</span><input id="default-max-results" type="number" value={config.maxResults} onChange={(event) => setConfig((current) => ({ ...current, maxResults: Number(event.target.value) }))} /></label><label className="field" htmlFor="safety-limit"><span>Safety result states</span><input id="safety-limit" type="number" min="20" max="5000" value={config.safetyLimit ?? 400} onChange={(event) => setConfig((current) => ({ ...current, safetyLimit: Number(event.target.value) }))} /></label><label className="field" htmlFor="website-pages"><span>Website pages per business</span><div className="select-wrap"><select id="website-pages" value={config.maxPagesPerWebsite} onChange={(event) => setConfig((current) => ({ ...current, maxPagesPerWebsite: Number(event.target.value) }))}><option value="1">1 page</option><option value="2">2 pages</option><option value="3">3 pages</option><option value="5">5 pages</option></select><Icon name="chevron" size={15} /></div></label><label className="field" htmlFor="request-delay"><span>Scraping delay</span><div className="select-wrap"><select id="request-delay" value={config.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS} onChange={(event) => setConfig((current) => ({ ...current, requestDelayMs: Number(event.target.value) }))}>{REQUEST_DELAY_OPTIONS.map((option) => <option key={option.ms} value={option.ms}>{option.label}</option>)}</select><Icon name="chevron" size={15} /></div><small className="field-hint">Pause between map areas (5s–5m). A longer pause avoids rate limits &amp; terminated scrapes, and it backs off automatically when Google throttles. Changes apply to a running sweep.</small></label></div><label className="check-control"><input type="checkbox" checked={config.enableEnrichment} onChange={(event) => onToggleEnrichment(event.target.checked)} /><span className="custom-check"><Icon name="check" size={13} /></span><span><strong>Allow public website enrichment</strong><small>Optional access is requested only when enabled. No lead data is uploaded.</small></span></label></div><div className="settings-group"><SectionHeading eyebrow="APPEARANCE" title="Make it yours" description="Choose the visual mode that feels right for your workflow." /><div className="theme-switcher"><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Icon name="sun" size={14} />Light</button><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Icon name="moon" size={14} />Dark</button></div></div><div className="danger-zone"><div><strong>Delete local data</strong><p>Remove every lead and search session from this browser.</p></div>{confirm ? <div className="danger-actions"><button className="text-button" onClick={() => setConfirm(false)}>Cancel</button><button className="danger-button" onClick={() => { void onCleared(); setConfirm(false); }}>Delete all</button></div> : <button className="danger-button" onClick={() => setConfirm(true)}>Clear all data</button>}</div></section><div className="permission-note"><span className="permission-icon"><Icon name="target" size={14} /></span><div><strong>Permission model</strong><p>Maps access is limited to Google Maps pages. Public website access is optional and requested only when enrichment is enabled.</p></div></div></section>; }

async function runtimeMessage<T>(message: Record<string, unknown>): Promise<T | undefined> { return new Promise((resolve) => { let settled = false; const finish = (value: T | undefined) => { if (settled) return; settled = true; resolve(value); }; const timer = window.setTimeout(() => finish(undefined), 30_000); chrome.runtime.sendMessage(message, (response) => { window.clearTimeout(timer); finish(response as T | undefined); }); }); }
async function dedupeInWorker(leads: Lead[]): Promise<Lead[]> { return new Promise((resolve) => { const worker = new Worker(chrome.runtime.getURL('workers/processing.js'), { type: 'module' }); worker.onmessage = (event: MessageEvent<{ unique: Lead[] }>) => { worker.terminate(); resolve(event.data.unique); }; worker.postMessage({ type: 'dedupe', leads }); setTimeout(() => { worker.terminate(); resolve(leads); }, 1_500); }); }

createRoot(document.getElementById('root')!).render(<App />);
