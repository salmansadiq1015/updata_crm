import {
  DEFAULT_MAX_AREA_TILES,
  DEFAULT_SWEEP_RADIUS_KM,
  DISCOVERY_SCROLL_DELAY_MS,
  MAX_SAFE_ITERATIONS,
  MAX_TILE_DEPTH,
  MIN_TILE_SPAN_KM,
  TILE_SPLIT_THRESHOLD,
} from '../shared/constants';
import {
  type GeoPoint,
  type Tile,
  splitTile,
  tileCenter,
  tileFromCenterRadius,
  tileSpanKm,
  zoomForTile,
} from '../shared/geo-tiling';
import {
  CRM_BATCH_SIZE,
  CHECKPOINT_VERSION,
  DISCOVERY_BATCH_SIZE,
  resultKeyForRecord,
  resumeQueryIndex,
  shouldCompleteResultState,
  splitIntoBatches,
  upgradeCheckpoint,
} from '../shared/discovery-checkpoint';
import { makeLead, dedupeKey, isSameLead, mergeLead } from '../shared/normalize';
import type {
  CrmImportProgress,
  DiscoveryConfig,
  DiscoveryPhase,
  DiscoveryProgress,
  ExtensionMessage,
  Lead,
  MapsContext,
  MapsScrollState,
  RawBusinessRecord,
  SearchRecord,
} from '../shared/types';
import { haversineDistanceMeters, nowIso, parseCoordinates } from '../shared/utils';
import { discoverPublicEmails } from '../enrichment/website-discovery';
import { clearAllLocalData, LeadRepository, SearchRepository, SettingsRepository } from '../storage/repositories';
import { clearAuth, connectWithGrant, getAuthState, heartbeat, importLeads as importLeadsToCrm, login, logout } from '../integration/crm-api';
import { CRM_WEB_ORIGIN, crmApiBaseForOrigin, isTrustedCrmOrigin } from '../shared/crm-connect';

const DISCOVERY_ALARM = 'lead-finder-discovery-recovery';
const CRM_IMPORT_SETTING = 'crm-import-state';
const MAX_RESULT_WAIT_RETRIES = 6;
// Consecutive failed detail-page reads before per-business hydration is paused
// for the rest of the run (keeps a broken-detail run fast and complete).
const DETAIL_FAILURE_LIMIT = 6;
const ACTIVE_STATUSES = new Set(['starting', 'discovering', 'paused', 'processing', 'resuming', 'retrying', 'enriching']);

type Job = {
  search: SearchRecord;
  config: DiscoveryConfig;
  tabId: number;
  paused: boolean;
  stopped: boolean;
  resumeResolvers: Array<() => void>;
  leads: Map<string, Lead>;
  originCoordinates: { latitude: number; longitude: number } | null;
  queryIndex: number;
  expectedQuery: string;
  detailTabId: number | null;
  detailCache: Map<string, RawBusinessRecord | null>;
  detailFailureStreak: number;
  detailHydrationDisabled: boolean;
  tilesScanned: number;
  tilesPlanned: number;
};

let activeJob: Job | null = null;
let activeCrmImport: CrmImportProgress | null = null;
const contentScriptInjectionByTab = new Map<number, Promise<void>>();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => { void recoverDiscovery(); void recoverCrmImport(); void heartbeat(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DISCOVERY_ALARM) void recoverDiscovery();
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-lead-finder') void chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

// --- Secure connect handoff from the CRM Lead page ---------------------------
// The CRM website links the extension with a one-time pairing grant via
// chrome.runtime.sendMessage(EXTENSION_ID, …). externally_connectable already
// restricts callers to the CRM origin; we re-check the sender defensively so a
// future manifest change can never silently widen who may mint a session.
chrome.runtime.onMessageExternal.addListener((message: { type?: string; grant?: unknown; apiBaseUrl?: unknown }, sender, sendResponse) => {
  if (!isTrustedCrmSender(sender)) { sendResponse({ ok: false, error: 'Untrusted origin.' }); return false; }
  switch (message?.type) {
    case 'CRM_PING':
      // Lets the Lead page detect "installed" and whether this browser is
      // already connected — without the page ever seeing a token.
      void getAuthState()
        .then((auth) => sendResponse({ ok: true, installed: true, connected: auth.authenticated, version: manifestVersion(), user: auth.user ? { id: auth.user.id, email: auth.user.email } : null }))
        .catch((error) => sendResponse({ ok: false, installed: true, error: errorMessage(error) }));
      return true;
    case 'CRM_CONNECT': {
      const apiBaseUrl = typeof message.apiBaseUrl === 'string' && message.apiBaseUrl ? message.apiBaseUrl : crmApiBaseForOrigin(CRM_WEB_ORIGIN);
      void connectWithGrant(apiBaseUrl, String(message.grant ?? ''))
        .then((auth) => { broadcastAuthChanged(); sendResponse({ ok: true, auth }); })
        .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
    case 'CRM_DISCONNECT':
      void clearAuth()
        .then(() => { broadcastAuthChanged(); sendResponse({ ok: true }); })
        .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    default:
      sendResponse({ ok: false, error: 'Unsupported message.' });
      return false;
  }
});

function isTrustedCrmSender(sender: chrome.runtime.MessageSender): boolean {
  const origin = sender.origin ?? (sender.url ? safeOrigin(sender.url) : null);
  return isTrustedCrmOrigin(origin);
}
function safeOrigin(url: string): string | null { try { return new URL(url).origin; } catch { return null; } }
function manifestVersion(): string { try { return chrome.runtime.getManifest().version; } catch { return 'unknown'; } }
function broadcastAuthChanged(): void { void chrome.runtime.sendMessage({ type: 'CRM_AUTH_CHANGED' }).catch(() => undefined); }

chrome.runtime.onMessage.addListener((message: ExtensionMessage | { type: string; [key: string]: unknown }, _sender, sendResponse) => {
  switch (message.type) {
    case 'GET_MAPS_CONTEXT':
      void getActiveMapsContext().then((context) => sendResponse({ ok: Boolean(context), context })).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    case 'GET_AUTH_STATE':
      void getAuthState().then((auth) => sendResponse({ ok: true, auth })).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    case 'LOGIN': {
      const value = message as Extract<ExtensionMessage, { type: 'LOGIN' }>;
      void login(value.apiBaseUrl, value.email, value.password).then((auth) => sendResponse({ ok: true, auth })).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
    case 'LOGOUT':
      void logout().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    case 'START_DISCOVERY':
      void startDiscovery((message as Extract<ExtensionMessage, { type: 'START_DISCOVERY' }>).config).then(sendResponse);
      return true;
    case 'RETRY_DISCOVERY':
      void retryDiscovery().then(sendResponse);
      return true;
    case 'PAUSE_DISCOVERY':
      void pauseDiscovery().then(() => sendResponse({ ok: true }));
      return true;
    case 'RESUME_DISCOVERY':
      void resumeDiscovery().then((response) => sendResponse(response));
      return true;
    case 'STOP_DISCOVERY':
      if (activeJob) { activeJob.stopped = true; activeJob.search.stopRequested = true; activeJob.resumeResolvers.splice(0).forEach((resolve) => resolve()); void persistJob(activeJob); }
      void publishProgress('Stopping discovery…').then(() => sendResponse({ ok: true }));
      return true;
    case 'GET_PROGRESS':
      void getProgressResponse().then((progress) => sendResponse({ ok: true, progress }));
      return true;
    case 'MARK_EXPORTED': {
      const value = message as Extract<ExtensionMessage, { type: 'MARK_EXPORTED' }>;
      void markExported(value.searchId, value.count).then(() => sendResponse({ ok: true }));
      return true;
    }
    case 'ENRICH_LEAD': {
      const value = message as Extract<ExtensionMessage, { type: 'ENRICH_LEAD' }>;
      void enrichLead(value.leadId, value.maxPages).then(sendResponse);
      return true;
    }
    case 'IMPORT_TO_CRM': {
      const value = message as Extract<ExtensionMessage, { type: 'IMPORT_TO_CRM' }>;
      void startCrmImport(value.leadIds).then((response) => sendResponse(response));
      return true;
    }
    case 'RETRY_CRM_IMPORT': {
      const value = message as Extract<ExtensionMessage, { type: 'RETRY_CRM_IMPORT' }>;
      void startCrmImport(value.leadIds).then((response) => sendResponse(response));
      return true;
    }
    case 'GET_CRM_IMPORT':
      void recoverCrmImport().then(() => getCrmImportState()).then((state) => sendResponse({ ok: true, state }));
      return true;
    case 'MAPS_STATE_CHANGED':
      if (activeJob) void persistJob(activeJob);
      return false;
    case 'CLEAR_ALL_DATA':
      activeJob = null;
      void chrome.alarms.clear(DISCOVERY_ALARM);
      void clearAuth().then(clearAllLocalData).then(() => sendResponse({ ok: true }));
      return true;
    default:
      return false;
  }
});

async function startDiscovery(config: DiscoveryConfig): Promise<{ ok: boolean; error?: string; searchId?: string }> {
  if (!(await getAuthState()).authenticated) return { ok: false, error: 'Log in to the CRM before starting discovery.' };
  if (activeJob) return { ok: false, error: 'A discovery session is already running.' };
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !isMapsUrl(tab.url)) return { ok: false, error: 'Open Google Maps in the active tab before starting discovery.' };
  await ensureMapsContentScript(tab.id);
  const context = await sendToMaps(tab.id, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
  const effectiveLocation = config.location.trim() || context?.context?.query?.trim() || '';
  if (!config.businessType.trim()) return { ok: false, error: 'Enter a business type before starting discovery.' };
  const searchId = crypto.randomUUID();
  const query = buildQueries({ ...config, location: effectiveLocation }, context?.context)[0];
  const search: SearchRecord = {
    id: searchId, businessType: config.businessType, location: effectiveLocation || 'Current Maps context',
    radiusKm: config.radiusKm, query, startedAt: nowIso(), completedAt: null, status: 'starting',
    discoveredCount: 0, uniqueCount: 0, duplicateCount: 0, exportedCount: 0, tabId: tab.id, lastActivityAt: nowIso(),
    currentPhase: 'SEARCH_INITIALIZED', currentQuery: query, currentPage: 0, currentStateKey: tab.url,
    currentResultIndex: 0, checkpointVersion: CHECKPOINT_VERSION, queryIndex: 0, processedResultKeys: [], processedCount: 0, currentBatchSize: 0,
    retryCount: 0, stableRounds: 0, scrollTop: 0, scrollHeight: 0, firstVisibleResultKey: null,
    lastVisibleResultKey: null, lastSuccessfulResultKey: null, lastSuccessfulUrl: null,
    lastSuccessfulTimestamp: null, updatedAt: nowIso(), stopRequested: false, error: null,
    config: { ...config, location: effectiveLocation },
  };
  await SearchRepository.save(search);
  activeJob = makeJob(search, tab.id, { ...config, location: effectiveLocation }, [], context?.context?.centerCoordinates ?? parseCoordinates(tab.url ?? ''));
  await chrome.alarms.create(DISCOVERY_ALARM, { periodInMinutes: 0.5 });
  void runDiscovery(activeJob);
  return { ok: true, searchId };
}

async function retryDiscovery(): Promise<{ ok: boolean; error?: string; searchId?: string }> {
  if (activeJob) return { ok: false, error: 'A discovery session is already running.' };
  const previous = (await SearchRepository.list()).find((search) => ['failed', 'cancelled', 'error', 'stopped'].includes(search.status));
  if (!previous?.tabId || !previous.config) return { ok: false, error: 'There is no recoverable discovery session.' };
  const tab = await chrome.tabs.get(previous.tabId).catch(() => null);
  if (!tab?.id || !isMapsUrl(tab.url)) return { ok: false, error: 'Re-open Google Maps in the tab used for this search, then retry.' };
  previous.status = 'retrying'; previous.completedAt = null; previous.error = null; previous.stopRequested = false;
  previous.retryCount = (previous.retryCount ?? 0) + 1; previous.lastActivityAt = nowIso(); previous.updatedAt = nowIso();
  await SearchRepository.save(previous);
  activeJob = makeJob(previous, tab.id, previous.config, await LeadRepository.listBySearch(previous.id), parseCoordinates(tab.url ?? ''));
  void runDiscovery(activeJob);
  return { ok: true, searchId: previous.id };
}

async function resumeDiscovery(): Promise<{ ok: boolean; error?: string }> {
  if (activeJob) {
    activeJob.paused = false; activeJob.search.status = 'resuming'; activeJob.resumeResolvers.splice(0).forEach((resolve) => resolve());
    await persistJob(activeJob); await publishProgress('Discovery resumed.');
    return { ok: true };
  }
  const recovered = await recoverDiscovery(true);
  return recovered ? { ok: true } : { ok: false, error: 'There is no paused discovery session to resume.' };
}

async function recoverDiscovery(forceResume = false): Promise<boolean> {
  if (activeJob) return true;
  const search = (await SearchRepository.list()).find((item) => ACTIVE_STATUSES.has(item.status));
  if (!search?.tabId || !search.config) return false;
  const tab = await chrome.tabs.get(search.tabId).catch(() => null);
  if (!tab?.id || !isMapsUrl(tab.url)) return false;
  const leads = await LeadRepository.listBySearch(search.id);
  activeJob = makeJob(search, tab.id, search.config, leads, parseCoordinates(tab.url ?? ''));
  if (search.status === 'paused' && !forceResume) return true;
  activeJob.paused = false; activeJob.search.status = 'resuming'; activeJob.search.updatedAt = nowIso();
  await SearchRepository.save(activeJob.search);
  void runDiscovery(activeJob);
  return true;
}

function makeJob(search: SearchRecord, tabId: number, config: DiscoveryConfig, records: Lead[], originCoordinates: { latitude: number; longitude: number } | null): Job {
  upgradeCheckpoint(search, records.map((lead) => resultKeyForRecord(lead)));
  const queries = buildQueries(config);
  const matchingIndex = queries.findIndex((query) => query === search.currentQuery);
  const queryIndex = matchingIndex >= 0 ? matchingIndex : resumeQueryIndex(search, queries.length);
  return { search, config, tabId, paused: search.status === 'paused', stopped: Boolean(search.stopRequested), resumeResolvers: [], leads: new Map(records.map((lead) => [dedupeKey(lead), lead])), originCoordinates, queryIndex, expectedQuery: search.currentQuery || queries[queryIndex] || queries[0], detailTabId: null, detailCache: new Map(), detailFailureStreak: 0, detailHydrationDisabled: false, tilesScanned: 0, tilesPlanned: 0 };
}

async function runDiscovery(job: Job): Promise<void> {
  try {
    const isResume = (job.search.processedCount ?? job.search.processedResultKeys?.length ?? 0) > 0;
    await setPhase(job, isResume ? 'WAITING_FOR_RESULTS' : 'SEARCH_INITIALIZED', isResume ? `Resuming from ${job.search.processedCount ?? job.search.processedResultKeys?.length ?? 0} processed businesses…` : 'Starting controlled discovery…');
    const area = job.config.areaSweep === false ? null : await resolveSweepArea(job);
    if (area) {
      await runAreaSweep(job, area);
    } else {
      await runQueryVariations(job, isResume);
    }
    if (job.config.enableEnrichment && !job.stopped) await enrichJob(job);
    job.search.status = job.stopped ? 'stopped' : 'completed';
    job.search.currentPhase = job.stopped ? 'STOPPED' : 'COMPLETED';
    job.search.completedAt = nowIso(); job.search.lastActivityAt = nowIso(); job.search.error = null;
    await SearchRepository.save(job.search);
    const completionMessage = job.leads.size >= job.config.maxResults
      ? `Discovery completed at the configured maximum of ${job.config.maxResults.toLocaleString()} unique leads.`
      : job.tilesScanned > 0
        ? `Area sweep complete. Scanned ${job.tilesScanned.toLocaleString()} map areas and found ${job.leads.size.toLocaleString()} businesses.`
        : 'Discovery completed. The available Maps result feeds were exhausted.';
    await publishProgress(job.stopped ? 'Discovery stopped by the user. Saved leads were preserved.' : completionMessage);
  } catch (error) {
    job.search.status = 'error'; job.search.currentPhase = 'FAILED'; job.search.completedAt = nowIso(); job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso(); job.search.error = errorMessage(error);
    await SearchRepository.save(job.search);
    await publishProgress(job.search.error);
  } finally {
    await closeDetailTab(job);
    if (activeJob === job) activeJob = null;
    if (!(await hasActiveSearch())) void chrome.alarms.clear(DISCOVERY_ALARM);
  }
}

// The original single-feed flow: run the configured query (optionally a few
// location variations) and scroll each feed to its end. Retained as a fallback
// for when no geographic centre can be resolved for an adaptive area sweep.
async function runQueryVariations(job: Job, isResume: boolean): Promise<void> {
  const queries = buildQueries(job.config);
  if (job.queryIndex >= queries.length) job.queryIndex = 0;
  for (; job.queryIndex < queries.length && !job.stopped && job.leads.size < job.config.maxResults; job.queryIndex += 1) {
    job.expectedQuery = queries[job.queryIndex];
    const changedQuery = job.search.currentQuery !== job.expectedQuery;
    job.search.currentQuery = job.expectedQuery; job.search.queryIndex = job.queryIndex;
    if (changedQuery) resetFeedCheckpoint(job);
    await setPhase(job, job.queryIndex === 0 && !isResume ? 'SEARCH_INITIALIZED' : 'NEXT_RESULTS', changedQuery ? 'Continuing with the next Maps search variation.' : 'Restoring the saved Maps result checkpoint…');
    await navigateIfNeeded(job);
    await restoreMapsCheckpoint(job);
    const exhausted = await processCurrentMapsState(job);
    if (!exhausted) break;
  }
}

function resetFeedCheckpoint(job: Job): void {
  job.search.currentPage = 0; job.search.currentResultIndex = 0; job.search.stableRounds = 0;
  job.search.scrollTop = 0; job.search.scrollHeight = 0; job.search.firstVisibleResultKey = null; job.search.lastVisibleResultKey = null;
}

// Resolve the centre to sweep around. When a location was typed we let Google
// geocode it first (so "Hotel near Paris" centres on Paris even if the user's
// map is elsewhere); otherwise we sweep around the current map centre.
async function resolveSweepArea(job: Job): Promise<Tile | null> {
  let center: GeoPoint | null = null;
  const location = job.config.location.trim();
  if (location) {
    try {
      await navigateToQuery(job.tabId, buildQueries(job.config)[0]);
      await waitForTabNavigation(job.tabId);
      await ensureMapsContentScript(job.tabId);
      center = await waitForMapCenter(job.tabId);
    } catch { center = null; }
  }
  if (!center) {
    try {
      const response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      center = response.context?.centerCoordinates ?? null;
    } catch { center = null; }
  }
  center ??= job.originCoordinates;
  if (!center) return null;
  job.originCoordinates ??= center;
  const radiusKm = job.config.radiusKm && job.config.radiusKm > 0 ? job.config.radiusKm : DEFAULT_SWEEP_RADIUS_KM;
  return tileFromCenterRadius(center, radiusKm);
}

async function waitForMapCenter(tabId: number): Promise<GeoPoint | null> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await sendToMaps(tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      const center = response.context?.centerCoordinates;
      if (center) return center;
    } catch { /* still navigating */ }
    await delay(Math.min(4_000, 600 * (2 ** attempt)));
  }
  return null;
}

// Breadth-first adaptive quadtree sweep. Each tile is scanned to the end of its
// feed; a tile that reaches Google's per-search ceiling is split into four and
// re-scanned, so dense areas are covered completely while sparse ones stay cheap.
async function runAreaSweep(job: Job, rootTile: Tile): Promise<void> {
  job.expectedQuery = job.config.businessType.trim();
  const maxTiles = Math.max(1, job.config.maxAreaTiles ?? DEFAULT_MAX_AREA_TILES);
  const queue: Tile[] = [rootTile];
  job.tilesPlanned = 1;
  while (queue.length && !job.stopped && job.leads.size < job.config.maxResults && job.tilesScanned < maxTiles) {
    await waitIfPaused(job); if (job.stopped) return;
    const tile = queue.shift()!;
    const before = job.leads.size;
    let tileCardCount = 0;
    try {
      tileCardCount = await sweepTile(job, tile);
    } catch (error) {
      // A single unreachable/empty tile must never fail the whole sweep.
      tileCardCount = 0;
      job.search.error = null;
      await publishProgress(`Skipped one map area (${errorMessage(error)}). Continuing the sweep…`);
    }
    job.tilesScanned += 1;
    const capped = tileCardCount >= TILE_SPLIT_THRESHOLD;
    const canSplit = tile.depth < MAX_TILE_DEPTH && tileSpanKm(tile) / 2 >= MIN_TILE_SPAN_KM;
    if (capped && canSplit && job.tilesScanned + queue.length < maxTiles) {
      queue.push(...splitTile(tile));
      job.tilesPlanned += 4;
    }
    await persistJob(job);
    await publishProgress(`Area sweep: ${job.tilesScanned} of ~${job.tilesPlanned} map areas scanned · ${job.leads.size.toLocaleString()} businesses found · ${job.leads.size - before} new here.`);
  }
}

// Scan one tile: point Maps at the tile viewport, confirm it has results, sweep
// its feed to the end, then report how many cards the feed held (the signal used
// to decide whether the tile hit the cap and must be subdivided).
async function sweepTile(job: Job, tile: Tile): Promise<number> {
  resetFeedCheckpoint(job);
  await setPhase(job, 'NEXT_RESULTS', `Scanning map area ${job.tilesScanned + 1}…`);
  await navigateToTile(job, tile);
  const probe = await probeTileResultCount(job);
  if (probe === 0) return 0;
  await processCurrentMapsState(job);
  try {
    const finalState = await sendToMaps(job.tabId, { type: 'GET_SCROLL_STATE' }) as MapsScrollState;
    return Math.max(probe, finalState.visibleResultCount ?? 0);
  } catch {
    return probe;
  }
}

async function navigateToTile(job: Job, tile: Tile): Promise<void> {
  const center = tileCenter(tile);
  const zoom = zoomForTile(tile);
  const query = encodeURIComponent(job.config.businessType.trim() || job.expectedQuery);
  const url = `https://www.google.com/maps/search/${query}/@${center.latitude.toFixed(6)},${center.longitude.toFixed(6)},${zoom}z`;
  job.search.currentStateKey = `tile:${tile.depth}:${center.latitude.toFixed(4)},${center.longitude.toFixed(4)}`;
  await chrome.tabs.update(job.tabId, { url });
  await waitForTabNavigation(job.tabId);
  await ensureMapsContentScript(job.tabId);
}

// Quick bounded check so an empty tile is dismissed in a few seconds instead of
// falling through to the long "results could not load" retry path.
async function probeTileResultCount(job: Job): Promise<number> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitIfPaused(job); if (job.stopped) return 0;
    try {
      const response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      const context = response.context;
      if (context?.isListing) return 1;
      const count = context?.visibleResultCount ?? 0;
      if (count > 0) return count;
      if (context && !context.hasResults && isSearchRoute(context.url) && attempt >= 1) return 0;
    } catch { /* still navigating */ }
    await delay(Math.min(2_500, 700 * (2 ** attempt)));
  }
  return 0;
}

async function processCurrentMapsState(job: Job): Promise<boolean> {
  let stableRounds = job.search.stableRounds ?? 0;
  let emptyRounds = 0;
  const safetyLimit = Math.max(20, job.config.safetyLimit ?? MAX_SAFE_ITERATIONS);
  while ((job.search.currentPage ?? 0) < safetyLimit && job.leads.size < job.config.maxResults) {
    await waitIfPaused(job); if (job.stopped) return true;
    await setPhase(job, 'WAITING_FOR_RESULTS', 'Waiting for Google Maps results…');
    await waitForResults(job);
    if (job.stopped) return true;
    await setPhase(job, 'EXTRACTING', 'Extracting visible businesses…');
    const first = await sendToMaps(job.tabId, { type: 'COLLECT_VISIBLE' }) as { records?: RawBusinessRecord[]; context?: MapsContext };
    const result = await processRecords(job, first.records ?? []);
    await setPhase(job, 'CHECKING_FOR_MORE', `${job.search.processedCount ?? 0} processed · ${job.leads.size} unique leads saved locally.`);
    const scroll = await sendToMaps(job.tabId, { type: 'SCROLL_RESULTS' }) as MapsScrollState;
    applyScrollCheckpoint(job.search, scroll);
    job.search.currentPage = (job.search.currentPage ?? 0) + 1;
    // Always inspect the settled DOM after scrolling. Maps virtual lists can
    // move their scroll offset while recycling the same cards; treating that
    // movement as progress caused an endless scroll with no new leads.
    await persistJob(job);
    await delay(Math.max(1_000, DISCOVERY_SCROLL_DELAY_MS));
    const settled = await sendToMaps(job.tabId, { type: 'COLLECT_VISIBLE' }) as { records?: RawBusinessRecord[] };
    const settledResult = await processRecords(job, settled.records ?? []);
    const settledScroll = await sendToMaps(job.tabId, { type: 'GET_SCROLL_STATE' }) as MapsScrollState;
    applyScrollCheckpoint(job.search, settledScroll);
    const newlyProcessed = result.newlyProcessed + settledResult.newlyProcessed;
    stableRounds = newlyProcessed === 0 ? stableRounds + 1 : 0;
    job.search.stableRounds = stableRounds;
    await persistJob(job);
    // No feed and nothing rendered: this result state is empty (an empty grid
    // tile, or a page that never produced a list). Bail after a few quiet rounds
    // instead of scrolling an absent feed all the way to the safety limit.
    const nothingVisible = (settledScroll.visibleResultCount ?? 0) === 0 && (settledScroll.scrollHeight ?? 0) === 0 && (first.records?.length ?? 0) === 0 && (settled.records?.length ?? 0) === 0;
    emptyRounds = nothingVisible ? emptyRounds + 1 : 0;
    if (emptyRounds >= 3) return true;
    if (shouldCompleteResultState({ newlyProcessed, scrollChanged: settledScroll.changed, atEnd: settledScroll.atEnd, endConfirmed: settledScroll.endConfirmed, stableRounds })) {
      await setPhase(job, 'NO_MORE_RESULTS', 'The Maps result feed reached its confirmed end with no unprocessed businesses remaining.');
      return true;
    }
    await delay(DISCOVERY_SCROLL_DELAY_MS);
  }
  if (job.leads.size >= job.config.maxResults) return true;
  throw new Error(`Discovery reached its safety limit of ${safetyLimit} result states. Review the saved leads and retry if needed.`);
}

async function waitForResults(job: Job): Promise<void> {
  let lastContext: MapsContext | null = null;
  for (let attempt = 0; attempt < MAX_RESULT_WAIT_RETRIES; attempt += 1) {
    await waitIfPaused(job); if (job.stopped) return;
    let response: { context?: MapsContext };
    try { response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext }; }
    catch (error) { if (attempt === MAX_RESULT_WAIT_RETRIES - 1) throw new Error(`Results could not be loaded: ${errorMessage(error)}`); await delay(Math.min(8_000, 1_000 * (2 ** attempt))); continue; }
    lastContext = response.context ?? null;
    if (lastContext && isUnexpectedSearchContext(lastContext, job.expectedQuery)) throw new Error('The Google Maps search context changed. Discovery was stopped to protect your saved results.');
    if (lastContext && !isSearchRoute(lastContext.url) && !lastContext.hasResults) {
      await navigateToQuery(job.tabId, job.expectedQuery);
      await ensureMapsContentScript(job.tabId);
      await delay(500);
      continue;
    }
    if (lastContext?.hasResults || (lastContext?.visibleResultCount ?? 0) > 0 || lastContext?.isListing) return;
    await delay(Math.min(8_000, 1_000 * (2 ** attempt)));
  }
  throw new Error('Results could not be loaded. Retry the discovery job or stop it.');
}

async function processRecords(job: Job, records: RawBusinessRecord[]): Promise<{ added: number; duplicates: number; newlyProcessed: number; repeated: number }> {
  await setPhase(job, 'PROCESSING', `Processing ${Math.min(records.length, DISCOVERY_BATCH_SIZE)} of ${records.length} visible results…`);
  const processed = new Set(job.search.processedResultKeys ?? []);
  let added = 0; let duplicates = 0; let newlyProcessed = 0; let repeated = 0; let sinceCheckpoint = 0;
  for (const batch of splitIntoBatches(records, DISCOVERY_BATCH_SIZE)) {
    job.search.currentBatchSize = batch.length;
    for (const record of batch) {
      await waitIfPaused(job);
      if (job.stopped) break;
      if (!record.businessName || !record.googleMapsUrl) continue;
      const visibleResultKey = resultKeyForRecord(record);
      const legacyKey = [record.placeIdentifier, record.googleMapsUrl, `${record.businessName}|${record.address ?? ''}`].find((key) => Boolean(key) && processed.has(key!));
      if (processed.has(visibleResultKey) || legacyKey) {
        if (legacyKey && legacyKey !== visibleResultKey) { processed.delete(legacyKey); processed.add(visibleResultKey); }
        repeated += 1;
        continue;
      }
      const hydratedRecord = await hydrateMapsRecord(job, record);
      const resultKey = resultKeyForRecord(hydratedRecord);
      if (processed.has(resultKey)) { repeated += 1; continue; }
      const lead = makeLead(hydratedRecord, job.search.id);
      if (job.originCoordinates && lead.latitude !== null && lead.longitude !== null) {
        lead.distanceMeters = haversineDistanceMeters(job.originCoordinates, { latitude: lead.latitude, longitude: lead.longitude });
        lead.distanceKm = lead.distanceMeters / 1_000;
      }
      // The configured radius is kept as distance metadata that drives the Leads
      // view distance filter and sort — it no longer discards businesses Google
      // actually surfaced. A metro search (e.g. "Hotel near Paris") spreads
      // results tens of kilometres from the map centre, so a hard straight-line
      // cutoff silently dropped most of them while the processed counter kept
      // climbing, which looked like discovery was stuck at a handful of leads.
      const exactKey = dedupeKey(lead); const proximityKey = [...job.leads.entries()].find(([, existing]) => isSameLead(existing, lead))?.[0]; const key = proximityKey ?? exactKey;
      const existing = job.leads.get(key);
      if (existing) { job.leads.set(key, mergeLead(existing, lead)); duplicates += 1; job.search.duplicateCount = (job.search.duplicateCount ?? 0) + 1; }
      else { job.leads.set(key, lead); added += 1; }
      // Commit lead data before marking its Maps result as processed. A service
      // worker suspension between these operations can therefore only retry and
      // merge the lead; it cannot silently lose it.
      await LeadRepository.save(job.leads.get(key)!);
      processed.add(resultKey); newlyProcessed += 1; sinceCheckpoint += 1;
      await checkpointProcessedRecord(job, processed, resultKey, record.googleMapsUrl, sinceCheckpoint >= DISCOVERY_BATCH_SIZE);
      if (sinceCheckpoint >= DISCOVERY_BATCH_SIZE) sinceCheckpoint = 0;
      if (job.leads.size >= job.config.maxResults) break;
    }
    job.search.discoveredCount = processed.size; job.search.processedCount = processed.size; job.search.currentResultIndex = processed.size;
    job.search.uniqueCount = job.leads.size; job.search.processedResultKeys = [...processed]; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso();
    await SearchRepository.save(job.search); await publishProgress(`${job.search.processedCount} processed · ${job.leads.size} unique leads saved locally.`);
    if (job.stopped || job.leads.size >= job.config.maxResults) break;
  }
  job.search.discoveredCount = processed.size; job.search.processedCount = processed.size; job.search.currentResultIndex = processed.size;
  job.search.uniqueCount = job.leads.size; job.search.processedResultKeys = [...processed]; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso();
  await SearchRepository.save(job.search); await publishProgress(`${job.leads.size} unique leads saved locally.`);
  return { added, duplicates, newlyProcessed, repeated };
}

async function navigateIfNeeded(job: Job): Promise<void> {
  const tab = await chrome.tabs.get(job.tabId); await ensureMapsContentScript(job.tabId);
  const contextResponse = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
  const current = contextResponse.context;
  // A normal Maps canvas URL (`/maps/@lat,lng`) is not a result state. The
  // previous implementation treated that context as acceptable because it
  // was technically a Maps page, then waited until timeout forever. Explicitly
  // enter the search route whenever the active page has no result feed/listing.
  const needsSearchNavigation = !current || !current.hasResults || current.isListing || isUnexpectedSearchContext(current, job.expectedQuery);
  if (needsSearchNavigation) {
    await navigateToQuery(job.tabId, job.expectedQuery);
    // Navigation is a transport event, never a new search. Preserve the query
    // cursor and all processed identities so the restored feed skips them.
    job.search.currentStateKey = `query:${job.expectedQuery}`; await persistJob(job);
    await waitForTabNavigation(job.tabId); await ensureMapsContentScript(job.tabId);
  } else if (tab.url) {
    job.search.currentStateKey = `${tab.url}|${current.visibleResultCount}`; await persistJob(job);
  }
}

async function restoreMapsCheckpoint(job: Job): Promise<void> {
  if (!(job.search.scrollTop || job.search.lastVisibleResultKey)) return;
  try {
    const restored = await sendToMaps(job.tabId, {
      type: 'RESTORE_SCROLL',
      scrollTop: job.search.scrollTop,
      lastVisibleResultKey: job.search.lastVisibleResultKey,
    }) as MapsScrollState;
    applyScrollCheckpoint(job.search, restored);
    await persistJob(job);
    await delay(DISCOVERY_SCROLL_DELAY_MS);
  } catch {
    // If Maps replaced the feed, scanning forward is safe because stable result
    // keys skip every already-processed business.
  }
}

function applyScrollCheckpoint(search: SearchRecord, scroll: Partial<MapsScrollState>): void {
  search.scrollTop = scroll.scrollTop ?? search.scrollTop ?? 0;
  search.scrollHeight = scroll.scrollHeight ?? search.scrollHeight ?? 0;
  search.firstVisibleResultKey = scroll.firstVisibleResultKey ?? search.firstVisibleResultKey ?? null;
  search.lastVisibleResultKey = scroll.lastVisibleResultKey ?? search.lastVisibleResultKey ?? null;
}

async function checkpointProcessedRecord(job: Job, processed: Set<string>, resultKey: string, url: string, flush: boolean): Promise<void> {
  job.search.processedResultKeys = [...processed];
  job.search.processedCount = processed.size;
  job.search.discoveredCount = processed.size;
  job.search.currentResultIndex = processed.size;
  job.search.uniqueCount = job.leads.size;
  job.search.lastSuccessfulResultKey = resultKey;
  job.search.lastSuccessfulUrl = url;
  job.search.lastSuccessfulTimestamp = nowIso();
  job.search.updatedAt = nowIso();
  if (flush) await SearchRepository.save(job.search);
}

async function hydrateMapsRecord(job: Job, record: RawBusinessRecord): Promise<RawBusinessRecord> {
  const key = record.placeIdentifier || record.googleMapsUrl;
  const cached = job.detailCache.get(key);
  if (cached !== undefined) return cached ? mergeRawRecord(record, cached) : record;
  // Search cards often do not render phone, website, address, or review
  // metadata. Visit the stable Maps place URL in one background tab and read
  // the detail view, then return to the result feed without losing the job.
  // Fast sweep: skip the per-business place-page read entirely unless the user
  // asked for thorough contacts. Card-level phone/website/address are still used
  // when Maps renders them, so a large area sweep is not throttled by one tab
  // navigation per business.
  if (!job.config.thoroughContacts) { job.detailCache.set(key, record); return record; }
  const needsDetails = !record.phone || !record.website || !record.address || record.reviewCount === null || record.reviewCount === undefined;
  if (!needsDetails) { job.detailCache.set(key, record); return record; }
  // Circuit breaker: if opening the place page keeps yielding nothing (a cookie
  // consent wall, a signed-out redirect, or persistently slow background tabs),
  // stop paying ~20s per business for a detail read that never succeeds. Once
  // tripped, discovery sweeps the rest of the feed fast on card data alone so a
  // run completes with every business instead of appearing stuck after a few.
  if (job.detailHydrationDisabled) { job.detailCache.set(key, record); return record; }
  try {
    if (!job.detailTabId) {
      const detailTab = await chrome.tabs.create({ url: record.googleMapsUrl, active: false });
      if (!detailTab.id) throw new Error('Could not open a Maps detail tab.');
      job.detailTabId = detailTab.id;
    } else {
      await chrome.tabs.update(job.detailTabId, { url: record.googleMapsUrl, active: false });
    }
    const detail = await waitForMapsDetails(job.detailTabId);
    job.detailCache.set(key, detail);
    if (detail) {
      job.detailFailureStreak = 0;
      return mergeRawRecord(record, detail);
    }
    job.detailFailureStreak += 1;
    if (job.detailFailureStreak >= DETAIL_FAILURE_LIMIT) job.detailHydrationDisabled = true;
    return record;
  } catch {
    job.detailCache.set(key, null);
    job.detailFailureStreak += 1;
    if (job.detailFailureStreak >= DETAIL_FAILURE_LIMIT) job.detailHydrationDisabled = true;
    return record;
  }
}

async function waitForMapsDetails(tabId: number): Promise<RawBusinessRecord | null> {
  // Bounded so a page that never renders a detail view costs ~6s, not ~24s. A
  // page that does load returns on the first or second attempt anyway.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const contextResponse = await sendToMaps(tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      if (contextResponse.context?.isListing || /\/maps\/place\//.test(contextResponse.context?.url ?? '')) {
        const details = await sendToMaps(tabId, { type: 'COLLECT_DETAILS' }) as { record?: RawBusinessRecord | null };
        if (details.record) return details.record;
      }
    } catch {
      // The tab may still be navigating; the next bounded attempt retries it.
    }
    await delay(Math.min(2_000, 500 * (2 ** attempt)));
  }
  return null;
}

function mergeRawRecord(base: RawBusinessRecord, detail: RawBusinessRecord): RawBusinessRecord {
  return {
    ...base,
    category: detail.category || base.category,
    phone: detail.phone || base.phone,
    website: detail.website || base.website,
    address: detail.address || base.address,
    street: detail.street || base.street,
    area: detail.area || base.area,
    city: detail.city || base.city,
    state: detail.state || base.state,
    postalCode: detail.postalCode || base.postalCode,
    country: detail.country || base.country,
    rating: detail.rating ?? base.rating,
    reviewCount: detail.reviewCount ?? base.reviewCount,
    businessStatus: detail.businessStatus || base.businessStatus,
    openingHours: detail.openingHours?.length ? detail.openingHours : base.openingHours,
    priceLevel: detail.priceLevel || base.priceLevel,
    placeIdentifier: detail.placeIdentifier || base.placeIdentifier,
    latitude: detail.latitude ?? base.latitude,
    longitude: detail.longitude ?? base.longitude,
  };
}

async function closeDetailTab(job: Job): Promise<void> {
  if (!job.detailTabId) return;
  const tabId = job.detailTabId;
  job.detailTabId = null;
  await chrome.tabs.remove(tabId).catch(() => undefined);
}

async function waitForTabNavigation(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < MAX_RESULT_WAIT_RETRIES; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null); if (tab && isMapsUrl(tab.url)) return;
    await delay(Math.min(8_000, 1_000 * (2 ** attempt)));
  }
}

async function enrichJob(job: Job): Promise<void> {
  job.search.status = 'enriching'; await persistJob(job);
  for (const lead of job.leads.values()) {
    if (job.stopped) break; if (!lead.website) continue;
    try { const result = await discoverPublicEmails(lead.website, job.config.maxPagesPerWebsite); lead.emails = result.emails; lead.emailSource = result.emailSource; lead.emailConfidence = result.emailConfidence; lead.enrichmentStatus = 'complete'; }
    catch { lead.enrichmentStatus = 'failed'; }
    lead.updatedAt = nowIso(); await LeadRepository.save(lead); await publishProgress('Checking publicly listed website contact pages…');
  }
}

async function enrichLead(leadId: string, maxPages: number): Promise<{ ok: boolean; lead?: Lead; error?: string }> {
  const lead = await LeadRepository.get(leadId); if (!lead) return { ok: false, error: 'Lead not found.' }; if (!lead.website) return { ok: false, error: 'This lead does not expose a website.' };
  try { const result = await discoverPublicEmails(lead.website, maxPages); lead.emails = result.emails; lead.emailSource = result.emailSource; lead.emailConfidence = result.emailConfidence; lead.enrichmentStatus = 'complete'; lead.updatedAt = nowIso(); await LeadRepository.save(lead); return { ok: true, lead }; }
  catch (error) { lead.enrichmentStatus = 'failed'; await LeadRepository.save(lead); return { ok: false, error: errorMessage(error) }; }
}

async function startCrmImport(leadIds: string[] = []): Promise<{ ok: boolean; error?: string; state?: CrmImportProgress }> {
  if (!(await getAuthState()).authenticated) return { ok: false, error: 'Your CRM session has expired. Log in again.' };
  if (activeCrmImport?.status === 'running') return { ok: false, error: 'A CRM import is already running.' };
  const stored = await getCrmImportState();
  const ids = leadIds.length ? leadIds : (stored?.status === 'partial' || stored?.status === 'failed' ? stored.failedLeadIds : []);
  if (!ids.length) return { ok: false, error: 'Select at least one lead to add to the CRM.' };
  activeCrmImport = { id: crypto.randomUUID(), status: 'running', total: ids.length, processed: 0, created: 0, existing: 0, failed: 0, failedLeadIds: [], leadIds: ids, processedLeadIds: [], nextIndex: 0, startedAt: nowIso(), completedAt: null, error: null };
  await saveCrmImport(); void runCrmImport(activeCrmImport); return { ok: true, state: activeCrmImport };
}

async function runCrmImport(state: CrmImportProgress): Promise<void> {
  const processedIds = new Set(state.processedLeadIds ?? []);
  const pendingIds = state.leadIds.filter((id) => !processedIds.has(id));
  for (const batchIds of splitIntoBatches(pendingIds, CRM_BATCH_SIZE)) {
    const leads = (await Promise.all(batchIds.map((id) => LeadRepository.get(id)))).filter((lead): lead is Lead => Boolean(lead));
    const foundIds = new Set(leads.map((lead) => lead.id));
    const missingIds = batchIds.filter((id) => !foundIds.has(id));
    if (missingIds.length) {
      state.failed += missingIds.length;
      state.failedLeadIds.push(...missingIds);
      state.error = 'Some selected local leads no longer exist. The remaining records were still processed.';
    }
    await Promise.all(leads.map(async (lead) => { lead.crmStatus = 'importing'; lead.crmError = null; await LeadRepository.save(lead); }));
    try {
      if (!leads.length) throw new Error('No selected lead records were found in local storage.');
      const response = await importLeadsToCrm(leads); const byId = new Map(response.results.map((result) => [result.clientId, result]));
      for (const lead of leads) { const item = byId.get(lead.id); const status = item?.status ?? 'failed'; lead.crmStatus = status === 'created' ? 'imported' : status === 'existing' ? 'existing' : 'failed'; lead.crmLeadId = item?.leadId ?? lead.crmLeadId; lead.crmLeadNumber = item?.leadNumber ?? lead.crmLeadNumber; lead.crmError = item?.message ?? null; await LeadRepository.save(lead); if (lead.crmStatus === 'imported') state.created += 1; else if (lead.crmStatus === 'existing') state.existing += 1; else { state.failed += 1; state.failedLeadIds.push(lead.id); } }
    } catch (error) { state.failed += leads.length; state.error = errorMessage(error); state.failedLeadIds.push(...leads.map((lead) => lead.id)); for (const lead of leads) { lead.crmStatus = 'failed'; lead.crmError = errorMessage(error); await LeadRepository.save(lead); } }
    for (const id of batchIds) processedIds.add(id);
    state.processedLeadIds = [...processedIds]; state.processed = processedIds.size; state.nextIndex = state.processed;
    await saveCrmImport(); await publishCrmImport();
  }
  state.status = state.failed ? 'partial' : 'completed'; state.completedAt = nowIso(); await saveCrmImport(); await publishCrmImport(); activeCrmImport = null;
  void heartbeat();
}

async function recoverCrmImport(): Promise<boolean> {
  if (activeCrmImport?.status === 'running') return true;
  const stored = (await SettingsRepository.get<CrmImportProgress>(CRM_IMPORT_SETTING))?.value;
  if (!stored || stored.status !== 'running') return false;
  if (!(await getAuthState()).authenticated) return false;
  activeCrmImport = stored;
  void runCrmImport(activeCrmImport);
  return true;
}

async function getCrmImportState(): Promise<CrmImportProgress | null> { return activeCrmImport ?? (await SettingsRepository.get<CrmImportProgress>(CRM_IMPORT_SETTING))?.value ?? null; }
async function saveCrmImport(): Promise<void> { if (activeCrmImport) await SettingsRepository.save(CRM_IMPORT_SETTING, activeCrmImport); }
async function publishCrmImport(): Promise<void> { try { await chrome.runtime.sendMessage({ type: 'CRM_IMPORT_PROGRESS', progress: activeCrmImport }); } catch { /* side panel can be closed */ } }

async function markExported(searchId: string, count: number): Promise<void> { const search = await SearchRepository.get(searchId); if (!search) return; search.exportedCount += Math.max(0, count); await SearchRepository.save(search); }

async function pauseDiscovery(): Promise<void> {
  if (activeJob) {
    activeJob.paused = true;
    activeJob.search.status = 'paused';
    try {
      const scroll = await sendToMaps(activeJob.tabId, { type: 'GET_SCROLL_STATE' }) as MapsScrollState;
      applyScrollCheckpoint(activeJob.search, scroll);
    } catch { /* retain the most recent persisted checkpoint */ }
    activeJob.search.lastActivityAt = nowIso(); activeJob.search.updatedAt = nowIso();
    await persistJob(activeJob);
  }
  await publishProgress('Discovery paused at the saved checkpoint.');
}

async function setPhase(job: Job, phase: DiscoveryPhase, message?: string): Promise<void> { job.search.currentPhase = phase; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso(); if (phase === 'PROCESSING') job.search.status = 'processing'; else if (phase === 'EXTRACTING' || phase === 'WAITING_FOR_RESULTS' || phase === 'CHECKING_FOR_MORE' || phase === 'NEXT_RESULTS' || phase === 'SEARCH_INITIALIZED') job.search.status = job.search.status === 'resuming' || job.search.status === 'retrying' ? job.search.status : 'discovering'; await persistJob(job); await publishProgress(message); }
async function persistJob(job: Job): Promise<void> { const tab = await chrome.tabs.get(job.tabId).catch(() => null); job.search.currentStateKey = tab?.url ?? job.search.currentStateKey; job.search.currentQuery = job.expectedQuery; job.search.queryIndex = job.queryIndex; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso(); await SearchRepository.save(job.search); }
async function getProgressResponse(): Promise<DiscoveryProgress> { await recoverDiscovery(); if (activeJob) return progressFor(activeJob); const search = (await SearchRepository.list())[0]; if (search) { const leads = await LeadRepository.listBySearch(search.id); if (upgradeCheckpoint(search, leads.map((lead) => resultKeyForRecord(lead)))) await SearchRepository.save(search); } return progressForStored(search); }
async function publishProgress(message?: string): Promise<void> { try { await chrome.runtime.sendMessage({ type: 'DISCOVERY_PROGRESS', progress: activeJob ? progressFor(activeJob, message) : await getProgressResponse(), message }); } catch { /* side panel can be closed */ } }
function progressFor(job: Job, message?: string): DiscoveryProgress { const leads = [...job.leads.values()]; return { searchId: job.search.id, status: job.paused ? 'paused' : job.search.status, query: job.search.query, discovered: job.search.discoveredCount, duplicates: job.search.duplicateCount ?? 0, unique: leads.length, withPhone: leads.filter((lead) => Boolean(lead.phone)).length, withWebsite: leads.filter((lead) => Boolean(lead.website)).length, withEmail: leads.filter((lead) => lead.emails.length > 0).length, iteration: job.search.currentPage ?? 0, maxIterations: job.config.safetyLimit ?? MAX_SAFE_ITERATIONS, message, phase: job.search.currentPhase, processed: job.search.processedCount ?? job.search.processedResultKeys?.length ?? 0, currentQuery: job.search.currentQuery, currentBatch: job.search.currentBatchSize ?? 0, configuredMaximum: job.config.maxResults, error: job.search.error, tilesScanned: job.tilesScanned, tilesPlanned: job.tilesPlanned }; }
function progressForStored(search?: SearchRecord): DiscoveryProgress { return { searchId: search?.id ?? '', status: search?.status ?? 'idle', query: search?.query ?? '', discovered: search?.discoveredCount ?? 0, duplicates: search?.duplicateCount ?? 0, unique: search?.uniqueCount ?? 0, withPhone: 0, withWebsite: 0, withEmail: 0, iteration: search?.currentPage ?? 0, maxIterations: search?.config?.safetyLimit ?? MAX_SAFE_ITERATIONS, phase: search?.currentPhase, processed: search?.processedCount ?? search?.processedResultKeys?.length ?? 0, currentQuery: search?.currentQuery, currentBatch: search?.currentBatchSize ?? 0, configuredMaximum: search?.config?.maxResults, error: search?.error }; }
async function waitIfPaused(job: Job): Promise<void> { if (!job.paused) return; await new Promise<void>((resolve) => job.resumeResolvers.push(resolve)); }
async function sendToMaps(tabId: number, message: { type: string; [key: string]: unknown }): Promise<unknown> {
  let response: unknown;
  try {
    response = await chrome.tabs.sendMessage(tabId, message);
  } catch (transportError) {
    await ensureMapsContentScript(tabId);
    try {
      response = await chrome.tabs.sendMessage(tabId, message);
    } catch {
      throw transportError;
    }
  }
  if (response && typeof response === 'object' && 'ok' in response && (response as { ok?: boolean }).ok === false) {
    const extractionError = (response as { error?: unknown }).error;
    throw new Error(typeof extractionError === 'string' && extractionError ? extractionError : 'Google Maps extraction failed.');
  }
  return response;
}
async function ensureMapsContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'GET_MAPS_CONTEXT' });
    return;
  } catch { /* the Maps runtime is absent or the document just navigated */ }

  const existing = contentScriptInjectionByTab.get(tabId);
  if (existing) return existing;
  const injection = (async () => {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/maps.js'] });
    await delay(250);
  })();
  contentScriptInjectionByTab.set(tabId, injection);
  try {
    await injection;
  } finally {
    if (contentScriptInjectionByTab.get(tabId) === injection) contentScriptInjectionByTab.delete(tabId);
  }
}
async function getActiveMapsContext(): Promise<MapsContext | null> { const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); const tab = tabs[0]; if (!tab?.id || !isMapsUrl(tab.url)) return null; await ensureMapsContentScript(tab.id); const response = await sendToMaps(tab.id, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext }; return response.context ?? null; }
async function navigateToQuery(tabId: number, query: string): Promise<void> { await chrome.tabs.update(tabId, { url: `https://www.google.com/maps/search/${encodeURIComponent(query)}` }); }
function buildQueries(config: DiscoveryConfig, context?: { query?: string | null }): string[] { const business = config.businessType.trim(); const location = config.location.trim() || context?.query?.trim() || ''; const first = location ? `${business} near ${location}` : business; return config.queryExpansion ? [...new Set([first, `${business} in ${location}`, `${business} ${location}`].filter(Boolean))] : [first]; }
function isUnexpectedSearchContext(context: MapsContext, expected: string): boolean { if (!context.isMaps) return true; if (!context.query || !expected) return false; const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim(); const expectedParts = normalize(expected).split(' near '); return !normalize(context.query).includes(normalize(expectedParts[0])); }
function isMapsUrl(url?: string): boolean { if (!url) return false; try { const parsed = new URL(url); return /(^|\.)google\.[^/]+$/.test(parsed.hostname) && parsed.pathname.startsWith('/maps'); } catch { return false; } }
function isSearchRoute(url?: string): boolean { return Boolean(url && /\/maps\/search\//.test(url)); }
async function hasActiveSearch(): Promise<boolean> { return (await SearchRepository.list()).some((search) => ACTIVE_STATUSES.has(search.status)); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unexpected error occurred.'; }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
