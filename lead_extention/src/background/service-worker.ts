import { businessCategory, withImportSearchContext } from '../shared/business-category';
import {
  DEFAULT_MAX_AREA_TILES,
  DEFAULT_REQUEST_DELAY_MS,
  DEFAULT_SWEEP_RADIUS_KM,
  DISCOVERY_SCROLL_DELAY_MS,
  MAX_REQUEST_DELAY_MS,
  MAX_SAFE_ITERATIONS,
  MAX_THROTTLE_BACKOFF,
  MAX_TILE_DEPTH,
  MIN_REQUEST_DELAY_MS,
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
import {
  MAX_BUSINESS_TYPE_ATTEMPTS,
  allocateTaskBudget,
  campaignRetryError,
  hasTaskCapacity,
  reopenCappedTasks,
  completeTask,
  createCampaign,
  ensureCampaign,
  failTask,
  finishCampaign,
  nextRunnableTask,
  normalizeBusinessTypes,
  retryTask,
  skipPendingTasks,
  startTask,
  syncCampaignTotals,
  updateTaskStage,
} from '../shared/campaign';
import { makeLead, dedupeKey, isSameLead, mergeLead } from '../shared/normalize';
import type {
  CrmImportProgress,
  BusinessTypeTask,
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
import {
  clampRequestDelay,
  cleanPhone,
  detailMatchesRecord,
  effectiveRequestDelay,
  haversineDistanceMeters,
  nextThrottleBackoff,
  nowIso,
  parseCoordinates,
  pinCoordinatesFromUrl,
} from '../shared/utils';
import { validateGeographicResult } from '../shared/geographic-validation';
import { buildDiscoveryQueries, isResolvedGeocodeCamera } from '../shared/search-context';
import { discoverPublicEmails } from '../enrichment/website-discovery';
import { clearAllLocalData, LeadRepository, SearchRepository, SettingsRepository } from '../storage/repositories';
import { DEFAULT_CRM_API_BASE_URL, clearAuth, connectWithGrant, getAuthState, heartbeat, importLeads as importLeadsToCrm, login, logout } from '../integration/crm-api';
import { isTrustedCrmOrigin } from '../shared/crm-connect';

const DISCOVERY_ALARM = 'lead-finder-discovery-recovery';
// Keeps the MV3 service worker alive / wakes it during a CRM import so a large
// multi-batch run can't silently stall if the worker is recycled between batches.
const CRM_IMPORT_ALARM = 'lead-finder-crm-import';
const CRM_IMPORT_SETTING = 'crm-import-state';
const MAX_RESULT_WAIT_RETRIES = 6;
// Consecutive failed detail-page reads before per-business hydration is paused
// for the rest of the run (keeps a broken-detail run fast and complete).
const DETAIL_FAILURE_LIMIT = 6;
const ACTIVE_STATUSES = new Set(['queued', 'starting', 'discovering', 'paused', 'processing', 'resuming', 'retrying', 'enriching']);

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
  // Adaptive throttle backoff multiplier (1 = no backoff). Grows when a feed is
  // throttled/terminated and decays on a clean tile.
  throttleBackoff: number;
  // The exact Maps URL whose results we are currently reading (a tile URL with
  // explicit `@lat,lng,zoom`, or the query URL). Recovery re-opens THIS URL —
  // never a bare `/maps/search/<type>`, which Google resolves around the
  // user's own location (the "Paris sweep opens Lahore hotels" bug).
  resultsUrl: string | null;
  /** Distinguishes a live paused loop from a paused job reconstructed after MV3 suspension. */
  runActive: boolean;
};

let activeJob: Job | null = null;
let startInFlight = false;
let activeCrmImport: CrmImportProgress | null = null;
const contentScriptInjectionByTab = new Map<number, Promise<void>>();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => { void recoverDiscovery(); void recoverCrmImport(); void heartbeat(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DISCOVERY_ALARM) void recoverDiscovery();
  if (alarm.name === CRM_IMPORT_ALARM) void recoverCrmImport();
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
      const apiBaseUrl = typeof message.apiBaseUrl === 'string' && message.apiBaseUrl ? message.apiBaseUrl : DEFAULT_CRM_API_BASE_URL;
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
      void retryDiscovery((message as Extract<ExtensionMessage, { type: 'RETRY_DISCOVERY' }>).searchId).then(sendResponse).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    case 'RETRY_BUSINESS_TYPE': {
      const value = message as Extract<ExtensionMessage, { type: 'RETRY_BUSINESS_TYPE' }>;
      void retryBusinessType(value.businessType, value.searchId).then(sendResponse).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
    case 'PAUSE_DISCOVERY':
      void pauseDiscovery().then(() => sendResponse({ ok: true }));
      return true;
    case 'RESUME_DISCOVERY':
      void resumeDiscovery().then((response) => sendResponse(response));
      return true;
    case 'STOP_DISCOVERY':
      void stopDiscovery().then(() => sendResponse({ ok: true }));
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
    case 'CANCEL_CRM_IMPORT':
      void cancelCrmImport().then((state) => sendResponse({ ok: true, state })).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    case 'GET_CRM_IMPORT':
      void recoverCrmImport().then(() => getCrmImportState()).then((state) => sendResponse({ ok: true, state }));
      return true;
    case 'MAPS_STATE_CHANGED':
      if (activeJob) void persistJob(activeJob);
      return false;
    case 'COLLECT_LEAD_DETAILS': {
      const value = message as Extract<ExtensionMessage, { type: 'COLLECT_LEAD_DETAILS' }>;
      void collectLeadDetails(value.leadId).then((response) => sendResponse(response)).catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
      return true;
    }
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
  if (startInFlight) return { ok: false, error: 'A discovery campaign is already starting.' };
  startInFlight = true;
  try {
    if (!(await getAuthState()).authenticated) return { ok: false, error: 'Log in to the CRM before starting discovery.' };
    if (activeJob || await hasActiveSearch()) {
      await recoverDiscovery();
      return { ok: false, error: 'A discovery campaign is already running.' };
    }
    const businessTypes = normalizeBusinessTypes(config);
    if (!businessTypes.length) return { ok: false, error: 'Select at least one business type before starting discovery.' };
    if (!Number.isInteger(config.maxResults) || config.maxResults < 1 || config.maxResults > 5_000) return { ok: false, error: 'Maximum results must be a whole number between 1 and 5,000.' };
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !isMapsUrl(tab.url)) return { ok: false, error: 'Open Google Maps in the active tab before starting discovery.' };
    await ensureMapsContentScript(tab.id);
    const context = await sendToMaps(tab.id, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
    // Location is explicit user input. Never replace an empty value with a Maps
    // query: a query such as "Hotel" is a business type, not a geocodable place.
    const explicitLocation = config.location.trim();
    const usesMapsContext = explicitLocation.toLowerCase() === 'current maps context';
    const suppliedCenter = validCenter(config.selectedCenter) ? config.selectedCenter! : null;
    const effectiveConfig: DiscoveryConfig = {
      ...config,
      businessType: businessTypes[0],
      businessTypes,
      location: usesMapsContext ? '' : explicitLocation,
      selectedCenter: suppliedCenter ?? (usesMapsContext ? context?.context?.centerCoordinates ?? null : null),
    };
    const searchId = crypto.randomUUID();
    const query = buildDiscoveryQueries(effectiveConfig, context?.context)[0];
    const initialCenter = effectiveConfig.selectedCenter ?? context?.context?.centerCoordinates ?? parseCoordinates(tab.url ?? '');
    const timestamp = nowIso();
    const search: SearchRecord = {
      id: searchId, businessType: businessTypes.join(', '), businessTypes, location: explicitLocation || (suppliedCenter ? `${suppliedCenter.latitude.toFixed(5)}, ${suppliedCenter.longitude.toFixed(5)}` : 'Current Maps context'),
      radiusKm: config.radiusKm, query, startedAt: timestamp, completedAt: null, status: 'queued',
      discoveredCount: 0, uniqueCount: 0, duplicateCount: 0, exportedCount: 0, tabId: tab.id, lastActivityAt: timestamp,
      currentPhase: 'SEARCH_INITIALIZED', currentQuery: query, currentPage: 0, currentStateKey: tab.url,
      currentResultIndex: 0, checkpointVersion: CHECKPOINT_VERSION, queryIndex: 0, processedResultKeys: [], processedCount: 0, currentBatchSize: 0,
      retryCount: 0, stableRounds: 0, scrollTop: 0, scrollHeight: 0, firstVisibleResultKey: null,
      lastVisibleResultKey: null, lastSuccessfulResultKey: null, lastSuccessfulUrl: null,
      lastSuccessfulTimestamp: null, updatedAt: timestamp, stopRequested: false, error: null,
      resolvedCenter: effectiveConfig.selectedCenter,
      rejectedOutOfAreaCount: 0, unverifiedLocationCount: 0,
      config: effectiveConfig,
      campaign: createCampaign(searchId, businessTypes, config.maxResults, timestamp),
    };
    await SearchRepository.save(search);
    activeJob = makeJob(search, tab.id, effectiveConfig, [], initialCenter);
    await chrome.alarms.create(DISCOVERY_ALARM, { periodInMinutes: 0.5 });
    void runDiscovery(activeJob);
    return { ok: true, searchId };
  } finally {
    startInFlight = false;
  }
}

async function retryDiscovery(searchId?: string): Promise<{ ok: boolean; error?: string; searchId?: string }> {
  return retryStoredCampaign(undefined, searchId);
}

async function retryBusinessType(businessType: string, searchId?: string): Promise<{ ok: boolean; error?: string; searchId?: string }> {
  return retryStoredCampaign(businessType, searchId);
}

async function retryStoredCampaign(businessType?: string, searchId?: string): Promise<{ ok: boolean; error?: string; searchId?: string }> {
  if (activeJob || startInFlight) return { ok: false, error: 'Stop the active campaign before retrying a business type.' };
  startInFlight = true;
  try {
    const eligible = (task: BusinessTypeTask) => (['failed', 'completed-with-errors', 'skipped'].includes(task.status)
      || (Boolean(businessType) && task.status === 'completed'))
      && (!businessType || task.businessType.toLocaleLowerCase() === businessType.trim().toLocaleLowerCase());
    if (await hasActiveSearch()) {
      await recoverDiscovery();
      return { ok: false, error: 'Resume or stop the saved active campaign before retrying another business type.' };
    }
    const previous = (await SearchRepository.list()).find((search) => (!searchId || search.id === searchId)
      && ensureCampaign(search).tasks.some(eligible));
    if (!previous?.config) return { ok: false, error: 'This campaign has no retryable business type.' };
    const campaign = ensureCampaign(previous);
    syncCampaignTotals(campaign, (await LeadRepository.listBySearch(previous.id)).length);
    const candidate = campaign.tasks.find((task) => eligible(task)
      && (campaign.perTypeMaxResults === undefined || task.newCount < campaign.perTypeMaxResults));
    const capacityError = campaignRetryError(campaign, businessType);
    if (capacityError) return { ok: false, error: capacityError };
    if (!candidate) return { ok: false, error: 'No business type has remaining result capacity.' };
    if (!retryTask(campaign, candidate.businessType)) return { ok: false, error: 'That business type is not eligible for retry.' };
    resetTypeCheckpoint(previous);
    return await launchStoredCampaign(previous);
  } finally {
    startInFlight = false;
  }
}

async function launchStoredCampaign(previous: SearchRecord): Promise<{ ok: boolean; error?: string; searchId?: string }> {
  if (!previous.config) return { ok: false, error: 'This campaign no longer has a recoverable configuration.' };
  let tab = previous.tabId ? await chrome.tabs.get(previous.tabId).catch(() => null) : null;
  if (!tab?.id || !isMapsUrl(tab.url)) {
    tab = (await chrome.tabs.query({})).find((candidate) => candidate.id && isMapsUrl(candidate.url)) ?? null;
  }
  if (!tab?.id) return { ok: false, error: 'Open a Google Maps tab, then retry this business type.' };
  previous.tabId = tab.id;
  previous.status = 'retrying'; previous.completedAt = null; previous.error = null; previous.stopRequested = false;
  previous.retryCount = (previous.retryCount ?? 0) + 1; previous.lastActivityAt = nowIso(); previous.updatedAt = nowIso();
  await SearchRepository.save(previous);
  activeJob = makeJob(previous, tab.id, previous.config, await LeadRepository.listBySearch(previous.id), parseCoordinates(tab.url ?? ''));
  await chrome.alarms.create(DISCOVERY_ALARM, { periodInMinutes: 0.5 });
  void runDiscovery(activeJob);
  return { ok: true, searchId: previous.id };
}

async function resumeDiscovery(): Promise<{ ok: boolean; error?: string }> {
  if (activeJob) {
    activeJob.paused = false; activeJob.search.status = 'resuming'; activeJob.resumeResolvers.splice(0).forEach((resolve) => resolve());
    ensureCampaign(activeJob.search).status = 'running';
    await persistJob(activeJob); await publishProgress('Discovery resumed.');
    if (!activeJob.runActive) void runDiscovery(activeJob);
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
  ensureCampaign(search);
  activeJob = makeJob(search, tab.id, search.config, leads, parseCoordinates(tab.url ?? ''));
  if (search.status === 'paused' && !forceResume) return true;
  activeJob.paused = false; activeJob.search.status = 'resuming'; activeJob.search.updatedAt = nowIso();
  await SearchRepository.save(activeJob.search);
  void runDiscovery(activeJob);
  return true;
}

// The selected search location to stamp on each discovered lead, used server-side
// as the last-resort fallback for a city/country the scrape could not provide.
// Only a real typed location qualifies: the "Current Maps context" placeholder
// (no location entered) and the case where the location simply mirrors the
// business type (no location typed → fell back to the Maps search text) are
// both rejected so a business type is never mistaken for a place.
function stampSearchLocation(job: Job): string | null {
  const loc = (job.search.location || job.config.location || '').trim();
  if (!loc || loc.toLowerCase() === 'current maps context') return null;
  const businessType = (job.config.businessType || '').trim().toLowerCase();
  if (businessType && loc.toLowerCase() === businessType) return null;
  return loc;
}

function makeJob(search: SearchRecord, tabId: number, config: DiscoveryConfig, records: Lead[], originCoordinates: { latitude: number; longitude: number } | null): Job {
  const campaign = ensureCampaign(search);
  syncCampaignTotals(campaign, records.length);
  const activeTask = nextRunnableTask(campaign);
  const effectiveConfig: DiscoveryConfig = {
    ...config,
    businessTypes: campaign.selectedBusinessTypes,
    businessType: activeTask?.businessType ?? config.businessType ?? campaign.selectedBusinessTypes[0] ?? search.businessType,
  };
  search.config = effectiveConfig;
  upgradeCheckpoint(search, records.map((lead) => resultKeyForRecord(lead)));
  const queries = buildDiscoveryQueries(effectiveConfig);
  const matchingIndex = queries.findIndex((query) => query === search.currentQuery);
  const queryIndex = matchingIndex >= 0 ? matchingIndex : resumeQueryIndex(search, queries.length);
  return { search, config: effectiveConfig, tabId, paused: search.status === 'paused', stopped: Boolean(search.stopRequested), resumeResolvers: [], leads: new Map(records.map((lead) => [dedupeKey(lead), lead])), originCoordinates: search.resolvedCenter ?? effectiveConfig.selectedCenter ?? originCoordinates, queryIndex, expectedQuery: search.currentQuery || queries[queryIndex] || queries[0], detailTabId: null, detailCache: new Map(), detailFailureStreak: 0, detailHydrationDisabled: false, tilesScanned: 0, tilesPlanned: 0, throttleBackoff: 1, resultsUrl: null, runActive: false };
}

function hasDiscoveryCapacity(job: Job): boolean {
  return hasTaskCapacity(ensureCampaign(job.search), job.leads.size);
}

async function runDiscovery(job: Job): Promise<void> {
  if (job.runActive) return;
  job.runActive = true;
  try {
    const campaign = ensureCampaign(job.search);
    while (!job.stopped) {
      if (job.leads.size >= campaign.globalMaxResults) {
        skipPendingTasks(campaign, 'global-limit-reached');
        break;
      }
      const task = nextRunnableTask(campaign);
      if (!task) {
        if (reopenCappedTasks(campaign)) continue;
        break;
      }
      const resumingTask = task.status === 'running';
      prepareBusinessType(job, task, !resumingTask);
      if (!resumingTask) startTask(campaign, task, job.expectedQuery);
      else {
        campaign.status = job.paused ? 'paused' : 'running';
        campaign.currentBusinessType = task.businessType;
      }
      await persistJob(job);

      let terminal = false;
      while (!terminal && !job.stopped) {
        if (task.attempts === 0) startTask(campaign, task, job.expectedQuery);
        const isResume = resumingTask || (job.search.processedCount ?? job.search.processedResultKeys?.length ?? 0) > 0;
        try {
          await setPhase(job, isResume ? 'WAITING_FOR_RESULTS' : 'SEARCH_INITIALIZED', isResume
            ? `Resuming ${task.businessType} from ${job.search.processedCount ?? job.search.processedResultKeys?.length ?? 0} processed businesses…`
            : `Searching ${task.businessType} (${task.order + 1} of ${campaign.tasks.length})…`);
          const area = job.config.areaSweep === false ? null : await resolveSweepArea(job);
          if (area) await runAreaSweep(job, area);
          else await runQueryVariations(job, isResume);
          if (job.stopped) break;
          const enrichment = job.config.enableEnrichment
            ? await enrichJob(job, task)
            : { total: 0, completed: 0, failed: 0 };
          completeTask(campaign, task, {
            enrichmentTotal: enrichment.total,
            enrichmentCompleted: enrichment.completed,
            enrichmentFailed: enrichment.failed,
          });
          terminal = true;
          await persistJob(job);
          await publishProgress(`${task.businessType} complete · ${task.resultCount.toLocaleString()} matched · ${task.newCount.toLocaleString()} new to this campaign.`);
        } catch (error) {
          const message = errorMessage(error);
          task.error = message;
          if (isRetryableDiscoveryError(message) && task.attempts < MAX_BUSINESS_TYPE_ATTEMPTS && !job.stopped) {
            task.attempts += 1;
            job.search.retryCount = (job.search.retryCount ?? 0) + 1;
            job.search.status = 'retrying';
            await persistJob(job);
            await publishProgress(`${task.businessType} hit a temporary error. Retry ${task.attempts} of ${MAX_BUSINESS_TYPE_ATTEMPTS} will continue from the saved checkpoint.`);
            await retryBackoff(job, task.attempts);
            continue;
          }
          failTask(campaign, task, message);
          terminal = true;
          await persistJob(job);
          await publishProgress(`${task.businessType} could not finish. Saved results were kept; continuing with the next business type.`);
        }
      }
    }

    if (job.stopped) {
      const activeTask = job.search.campaign?.tasks.find((task) => task.status === 'running');
      if (activeTask) {
        activeTask.status = activeTask.newCount > 0 ? 'completed-with-errors' : 'skipped';
        activeTask.error = 'Stopped by user.';
        activeTask.skipReason = activeTask.newCount > 0 ? null : 'stopped-by-user';
        activeTask.completedAt = nowIso();
      }
      if (job.search.campaign) {
        job.search.campaign.stopRequested = true;
        skipPendingTasks(job.search.campaign, 'stopped-by-user');
      }
    } else if (job.search.campaign && job.leads.size >= job.search.campaign.globalMaxResults) {
      skipPendingTasks(job.search.campaign, 'global-limit-reached');
    }
    const campaignStatus = finishCampaign(campaign, job.leads.size, job.stopped);
    job.search.status = campaignStatus === 'cancelled'
      ? 'stopped'
      : campaignStatus === 'failed'
        ? 'failed'
        : campaignStatus === 'completed-with-errors'
          ? 'completed-with-errors'
          : 'completed';
    job.search.currentPhase = job.stopped ? 'STOPPED' : campaignStatus === 'failed' ? 'FAILED' : 'COMPLETED';
    job.search.completedAt = nowIso(); job.search.lastActivityAt = nowIso(); job.search.error = campaignStatus === 'completed-with-errors' ? 'One or more business types completed with errors.' : campaignStatus === 'failed' ? 'Every business type failed. Saved partial results were preserved.' : null;
    job.search.uniqueCount = job.leads.size;
    await SearchRepository.save(job.search);
    const completionMessage = job.leads.size >= campaign.globalMaxResults && campaign.tasks.some((task) => task.skipReason === 'global-limit-reached')
      ? `Campaign reached its ${campaign.globalMaxResults.toLocaleString()} unique-business maximum.`
      : job.tilesScanned > 0
        ? `Campaign complete. The final type scanned ${job.tilesScanned.toLocaleString()} map areas; ${job.leads.size.toLocaleString()} unique businesses are saved.`
        : `Campaign complete. ${job.leads.size.toLocaleString()} unique businesses are saved.`;
    await publishProgress(job.stopped ? 'Campaign stopped by the user. Saved businesses were preserved.' : completionMessage);
  } catch (error) {
    const campaign = ensureCampaign(job.search);
    const task = campaign.tasks.find((item) => item.status === 'running');
    if (task) failTask(campaign, task, errorMessage(error));
    finishCampaign(campaign, job.leads.size, false);
    job.search.status = 'error'; job.search.currentPhase = 'FAILED'; job.search.completedAt = nowIso(); job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso(); job.search.error = errorMessage(error);
    await SearchRepository.save(job.search);
    await publishProgress(job.search.error);
  } finally {
    job.runActive = false;
    await closeDetailTab(job);
    if (activeJob === job) activeJob = null;
    if (!(await hasActiveSearch())) void chrome.alarms.clear(DISCOVERY_ALARM);
  }
}

function prepareBusinessType(job: Job, task: BusinessTypeTask, resetCheckpoint: boolean): void {
  allocateTaskBudget(ensureCampaign(job.search), task);
  job.config.businessType = task.businessType;
  job.config.businessTypes = ensureCampaign(job.search).selectedBusinessTypes;
  job.search.config = job.config;
  job.search.currentPhase = 'SEARCH_INITIALIZED';
  job.expectedQuery = buildDiscoveryQueries(job.config)[0];
  job.search.currentQuery = job.expectedQuery;
  job.resultsUrl = null;
  job.tilesScanned = 0;
  job.tilesPlanned = 0;
  job.detailFailureStreak = 0;
  job.detailHydrationDisabled = false;
  if (resetCheckpoint) {
    resetTypeCheckpoint(job.search);
    job.queryIndex = 0;
  }
}

function resetTypeCheckpoint(search: SearchRecord): void {
  search.currentPage = 0;
  search.currentResultIndex = 0;
  search.queryIndex = 0;
  search.processedResultKeys = [];
  search.processedCount = 0;
  search.currentBatchSize = 0;
  search.stableRounds = 0;
  search.scrollTop = 0;
  search.scrollHeight = 0;
  search.firstVisibleResultKey = null;
  search.lastVisibleResultKey = null;
  search.lastSuccessfulResultKey = null;
  search.lastSuccessfulUrl = null;
  search.lastSuccessfulTimestamp = null;
  search.error = null;
}

function isRetryableDiscoveryError(message: string): boolean {
  return !/could not find|invalid|permission|not authenticated|search context changed|captcha/i.test(message);
}

async function retryBackoff(job: Job, attempt: number): Promise<void> {
  const until = Date.now() + Math.min(5_000, 750 * (2 ** Math.max(0, attempt - 1)));
  while (Date.now() < until && !job.stopped) {
    await waitIfPaused(job);
    await delay(Math.min(500, until - Date.now()));
  }
}

// The original single-feed flow: run the configured query (optionally a few
// location variations) and scroll each feed to its end. Retained as a fallback
// for when no geographic centre can be resolved for an adaptive area sweep.
async function runQueryVariations(job: Job, isResume: boolean): Promise<void> {
  const queries = buildDiscoveryQueries(job.config);
  if (job.queryIndex >= queries.length) job.queryIndex = 0;
  for (; job.queryIndex < queries.length && !job.stopped && hasDiscoveryCapacity(job); job.queryIndex += 1) {
    job.expectedQuery = queries[job.queryIndex];
    const changedQuery = job.search.currentQuery !== job.expectedQuery;
    job.search.currentQuery = job.expectedQuery; job.search.queryIndex = job.queryIndex;
    if (changedQuery) resetFeedCheckpoint(job);
    await setPhase(job, job.queryIndex === 0 && !isResume ? 'SEARCH_INITIALIZED' : 'NEXT_RESULTS', changedQuery ? 'Continuing with the next Maps search variation.' : 'Restoring the saved Maps result checkpoint…');
    await navigateIfNeeded(job);
    await restoreMapsCheckpoint(job);
    const { exhausted } = await processCurrentMapsState(job);
    if (!exhausted) break;
    // Pause before moving to the next search variation (a new Maps navigation),
    // honouring the configured scraping delay.
    const moreQueries = job.queryIndex + 1 < queries.length && hasDiscoveryCapacity(job);
    if (moreQueries && !job.stopped) await pauseBetweenRequests(job, false);
  }
}

function resetFeedCheckpoint(job: Job): void {
  job.search.currentPage = 0; job.search.currentResultIndex = 0; job.search.stableRounds = 0;
  job.search.scrollTop = 0; job.search.scrollHeight = 0; job.search.firstVisibleResultKey = null; job.search.lastVisibleResultKey = null;
}

// Resolve the centre to sweep around.
//   - A typed location is GEOCODED to its own coordinates (we point Maps at the
//     location alone, then read the settled camera). The sweep then follows that
//     centre, so "Restaurant" + "paris" scans Paris even though the user's map
//     was on Lahore. If the place cannot be located we FAIL LOUDLY — we never
//     silently fall back to wherever the map happens to be (the reported bug:
//     typing "paris" but scraping Lahore).
//   - With no location typed, we sweep around the current map centre.
async function resolveSweepArea(job: Job): Promise<Tile | null> {
  let center: GeoPoint | null = job.search.resolvedCenter ?? job.config.selectedCenter ?? null;
  const location = job.config.location.trim();
  const hasTypedLocation = Boolean(location) && location.toLowerCase() !== 'current maps context';

  if (hasTypedLocation && !center) {
    center = await geocodeLocation(job, location, job.originCoordinates);
    if (!center) {
      throw new Error(
        `Could not find “${location}” on Google Maps. Check the spelling or use a more specific place `
        + '(e.g. “Paris, France”), or clear the Location field to search the current map.',
      );
    }
  } else if (!center) {
    try {
      const response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      center = response.context?.centerCoordinates ?? null;
    } catch { center = null; }
    center ??= job.originCoordinates;
  }

  if (!center) return null;
  // Distance is measured from the centre we actually swept (the searched place
  // when one was typed), not the user's starting viewport.
  job.originCoordinates = center;
  job.search.resolvedCenter = center;
  await persistJob(job);
  const radiusKm = job.config.radiusKm && job.config.radiusKm > 0 ? job.config.radiusKm : DEFAULT_SWEEP_RADIUS_KM;
  return tileFromCenterRadius(center, radiusKm);
}

// Geocode a typed location by pointing Maps at the place ITSELF (not the
// business query), then reading its RESOLVED coordinate. Searching the location
// alone is unambiguous — Google recentres on it. Returns null if nothing settles
// (the caller then fails loudly instead of scraping the wrong place).
async function geocodeLocation(job: Job, location: string, originalCenter: GeoPoint | null): Promise<GeoPoint | null> {
  try {
    await navigateTabAndWait(job.tabId, mapsSearchUrl(location));
    return await waitForGeocodedCenter(job, originalCenter);
  } catch {
    return null;
  }
}

// Read the coordinate Google RESOLVED a typed location to, robust against the
// "camera lag" that caused Paris searches to scrape Lahore: right after we point
// the tab at the location, the URL still carries the PREVIOUS viewport's
// `@lat,lng` camera for a moment before Maps flies to the real place, so the old
// code grabbed that stale camera. Here we trust, in order:
//   1. the place PIN (`!3d!4d`) once Google resolves the query to a /maps/place/
//      — the authoritative geocode, with no camera-animation lag; then
//   2. a camera (`@`) that has SETTLED — identical across two reads — and that
//      has moved away from the starting viewport. An unchanged camera is never
//      accepted as proof that a typed place resolved.
// A generous initial delay lets the fly-to begin before the first read.
async function waitForGeocodedCenter(job: Job, originalCenter: GeoPoint | null): Promise<GeoPoint | null> {
  let prevCamera: GeoPoint | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await delay(attempt === 0 ? 2_500 : 1_500);
    await waitIfPaused(job); if (job.stopped) return null;
    let url: string | undefined;
    try {
      const response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      url = response.context?.url;
    } catch { continue; }

    // 1. Google resolved the location to a place — its pin is the geocode.
    if (isPlaceRoute(url)) {
      const pin = url ? pinCoordinatesFromUrl(url) : null;
      if (pin) return pin;
    }

    // 2. Otherwise accept the camera once it has stopped moving. Reject the
    //    stale pre-fly camera: an unmoved reading is only trusted after the map
    //    has had several seconds to recentre.
    const camera = url ? parseCoordinates(url) : null;
    if (camera && (isSearchRoute(url) || isPlaceRoute(url))) {
      // For typed locations an unchanged camera is the stale starting
      // viewport, not a geocode. Never accept it merely because time elapsed.
      if (isResolvedGeocodeCamera(camera, prevCamera, originalCenter)) return camera;
      prevCamera = camera;
    }
  }
  // Timed out without a confident fix → fail loudly (caller shows an error);
  // never silently return the starting viewport for a typed location.
  return null;
}

// Breadth-first adaptive quadtree sweep. Each tile is scanned to the end of its
// feed; saturated tiles are subdivided where the configured safety bounds allow.
// Any failed or unresolved tile makes the run fail visibly with saved results
// preserved — it is never reported as complete coverage.
async function runAreaSweep(job: Job, rootTile: Tile): Promise<void> {
  job.expectedQuery = job.config.businessType.trim();
  const maxTiles = Math.max(1, job.config.maxAreaTiles ?? DEFAULT_MAX_AREA_TILES);
  const queue: Tile[] = [rootTile];
  let failedTiles = 0;
  let unresolvedSaturatedTiles = 0;
  job.tilesPlanned = 1;
  while (queue.length && !job.stopped && hasDiscoveryCapacity(job) && job.tilesScanned < maxTiles) {
    await waitIfPaused(job); if (job.stopped) return;
    const tile = queue.shift()!;
    const before = job.leads.size;
    let tileCardCount = 0;
    let throttled = false;
    try {
      tileCardCount = await sweepTile(job, tile);
    } catch (error) {
      // Continue past an unreachable tile so other areas can still contribute
      // results, but count it and surface the run as partial at the end. Treat
      // navigation/results failure as a throttle signal before the next tile.
      tileCardCount = 0;
      throttled = true;
      failedTiles += 1;
      job.search.error = null;
      await publishProgress(`Rate-limited on one map area (${errorMessage(error)}). Backing off and continuing the sweep…`);
    }
    job.tilesScanned += 1;
    const capped = tileCardCount >= TILE_SPLIT_THRESHOLD;
    const canSplit = tile.depth < MAX_TILE_DEPTH && tileSpanKm(tile) / 2 >= MIN_TILE_SPAN_KM;
    if (capped) {
      if (canSplit && job.tilesScanned + queue.length + 4 <= maxTiles) {
        queue.push(...splitTile(tile));
        job.tilesPlanned += 4;
      } else {
        unresolvedSaturatedTiles += 1;
      }
    }
    await persistJob(job);
    await publishProgress(`Area sweep: ${job.tilesScanned} of ~${job.tilesPlanned} map areas scanned · ${job.leads.size.toLocaleString()} businesses found · ${job.leads.size - before} new here.`);
    // Respect the user's scraping-delay setting (and adaptive backoff) before
    // the next area, so rapid tile-to-tile navigation doesn't trip rate limits.
    const moreToScan = queue.length && hasDiscoveryCapacity(job) && job.tilesScanned < maxTiles;
    if (moreToScan && !job.stopped) {
      await setPhase(job, 'NEXT_RESULTS', throttled ? 'Backing off before the next map area…' : 'Pausing before the next map area…');
      await pauseBetweenRequests(job, throttled);
    }
  }
  if (job.stopped || !hasDiscoveryCapacity(job)) return;
  const remainingTiles = queue.length;
  if (failedTiles || unresolvedSaturatedTiles || remainingTiles) {
    const reasons = [
      failedTiles ? `${failedTiles} map area${failedTiles === 1 ? '' : 's'} failed after retries` : '',
      unresolvedSaturatedTiles ? `${unresolvedSaturatedTiles} dense map area${unresolvedSaturatedTiles === 1 ? '' : 's'} could not be subdivided further` : '',
      remainingTiles ? `${remainingTiles} map area${remainingTiles === 1 ? '' : 's'} remained when the ${maxTiles}-area safety limit was reached` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`Discovery coverage is partial: ${reasons}. Saved businesses were preserved; retry from the checkpoint to continue.`);
  }
}

// Scan one tile: point Maps at the tile viewport, confirm it has results, sweep
// its feed to the end, then report how many cards the feed held (the signal used
// to decide whether the tile hit the cap and must be subdivided).
async function sweepTile(job: Job, tile: Tile): Promise<number> {
  resetFeedCheckpoint(job);
  await setPhase(job, 'NEXT_RESULTS', `Scanning map area ${job.tilesScanned + 1}…`);
  await navigateToTile(job, tile);
  // Google must actually be showing THIS tile. If the camera landed somewhere
  // else (e.g. around the user's own location), retry once, then fail the tile
  // loudly rather than harvesting businesses from the wrong city.
  if (!(await tileViewportMatches(job, tile))) {
    await navigateToTile(job, tile);
    if (!(await tileViewportMatches(job, tile))) throw new Error('Google Maps did not open the requested map area');
  }
  const probe = await probeTileResultCount(job);
  if (probe === 0) return 0;
  const { observed } = await processCurrentMapsState(job);
  try {
    const finalState = await sendToMaps(job.tabId, { type: 'GET_SCROLL_STATE' }) as MapsScrollState;
    return Math.max(probe, observed, finalState.visibleResultCount ?? 0);
  } catch {
    return Math.max(probe, observed);
  }
}

async function navigateToTile(job: Job, tile: Tile): Promise<void> {
  const center = tileCenter(tile);
  const zoom = zoomForTile(tile);
  const query = encodeURIComponent(job.config.businessType.trim() || job.expectedQuery);
  const url = `https://www.google.com/maps/search/${query}/@${center.latitude.toFixed(6)},${center.longitude.toFixed(6)},${zoom}z`;
  job.search.currentStateKey = `tile:${tile.depth}:${center.latitude.toFixed(4)},${center.longitude.toFixed(4)}`;
  job.resultsUrl = url;
  await navigateTabAndWait(job.tabId, url);
}

// True when the tab's map camera is on (or near) the tile we asked for. Unknown
// camera → trust the explicit `@` URL we just loaded.
async function tileViewportMatches(job: Job, tile: Tile): Promise<boolean> {
  try {
    const response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
    const camera = response.context?.centerCoordinates;
    if (!camera) return true;
    const toleranceKm = Math.max(5, tileSpanKm(tile));
    return haversineDistanceMeters(camera, tileCenter(tile)) / 1_000 <= toleranceKm;
  } catch {
    return true;
  }
}

// Bounded check so an empty tile is dismissed instead of falling through to the
// long "results could not load" retry path. The feed renders well AFTER the
// document's load event (Google's hotel results take several seconds), so an
// empty reading is only believed once the whole window has elapsed — the old
// ~1s cut-off declared every Paris hotel tile "empty" and the sweep found 0.
const TILE_PROBE_ATTEMPTS = 14;
const TILE_PROBE_INTERVAL_MS = 1_000;
async function probeTileResultCount(job: Job): Promise<number> {
  for (let attempt = 0; attempt < TILE_PROBE_ATTEMPTS; attempt += 1) {
    await waitIfPaused(job); if (job.stopped) return 0;
    try {
      const response = await sendToMaps(job.tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      const context = response.context;
      if (context?.isListing) return 1;
      const count = context?.visibleResultCount ?? 0;
      if (count > 0) return count;
    } catch { /* still navigating */ }
    await delay(TILE_PROBE_INTERVAL_MS);
  }
  return 0;
}

function emptyScrollState(): MapsScrollState {
  return { changed: false, atEnd: false, endConfirmed: false, scrollTop: 0, scrollHeight: 0, clientHeight: 0, visibleResultCount: 0, firstVisibleResultKey: null, lastVisibleResultKey: null };
}

async function processCurrentMapsState(job: Job): Promise<{ exhausted: boolean; observed: number }> {
  let stableRounds = job.search.stableRounds ?? 0;
  let emptyRounds = 0;
  const observedResultKeys = new Set<string>();
  const safetyLimit = Math.max(20, job.config.safetyLimit ?? MAX_SAFE_ITERATIONS);
  while ((job.search.currentPage ?? 0) < safetyLimit && hasDiscoveryCapacity(job)) {
    await waitIfPaused(job); if (job.stopped) return { exhausted: true, observed: observedResultKeys.size };
    await setPhase(job, 'WAITING_FOR_RESULTS', 'Waiting for Google Maps results…');
    await waitForResults(job);
    if (job.stopped) return { exhausted: true, observed: observedResultKeys.size };
    await setPhase(job, 'EXTRACTING', 'Extracting visible businesses…');
    const first = await sendToMaps(job.tabId, { type: 'COLLECT_VISIBLE' }).catch(() => ({ records: [] as RawBusinessRecord[] })) as { records?: RawBusinessRecord[]; context?: MapsContext };
    for (const record of first.records ?? []) observedResultKeys.add(resultKeyForRecord(record));
    const result = await processRecords(job, first.records ?? []);
    if (!hasDiscoveryCapacity(job)) return { exhausted: true, observed: observedResultKeys.size };
    await setPhase(job, 'CHECKING_FOR_MORE', `${job.search.processedCount ?? 0} processed · ${job.leads.size} unique leads saved locally.`);
    const scroll = await sendToMaps(job.tabId, { type: 'SCROLL_RESULTS' }).catch(() => emptyScrollState()) as MapsScrollState;
    applyScrollCheckpoint(job.search, scroll);
    job.search.currentPage = (job.search.currentPage ?? 0) + 1;
    // Always inspect the settled DOM after scrolling. Maps virtual lists can
    // move their scroll offset while recycling the same cards; treating that
    // movement as progress caused an endless scroll with no new leads.
    await persistJob(job);
    await delay(Math.max(1_000, DISCOVERY_SCROLL_DELAY_MS));
    const settled = await sendToMaps(job.tabId, { type: 'COLLECT_VISIBLE' }).catch(() => ({ records: [] as RawBusinessRecord[] })) as { records?: RawBusinessRecord[] };
    for (const record of settled.records ?? []) observedResultKeys.add(resultKeyForRecord(record));
    const settledResult = await processRecords(job, settled.records ?? []);
    const settledScroll = await sendToMaps(job.tabId, { type: 'GET_SCROLL_STATE' }).catch(() => emptyScrollState()) as MapsScrollState;
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
    if (emptyRounds >= 3) return { exhausted: true, observed: observedResultKeys.size };
    if (shouldCompleteResultState({ newlyProcessed, scrollChanged: settledScroll.changed, atEnd: settledScroll.atEnd, endConfirmed: settledScroll.endConfirmed, stableRounds })) {
      await setPhase(job, 'NO_MORE_RESULTS', 'The Maps result feed reached its confirmed end with no unprocessed businesses remaining.');
      return { exhausted: true, observed: observedResultKeys.size };
    }
    await delay(DISCOVERY_SCROLL_DELAY_MS);
  }
  if (!hasDiscoveryCapacity(job)) return { exhausted: true, observed: observedResultKeys.size };
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
      // Re-open the exact results URL (a tile keeps its explicit @lat,lng,zoom).
      // A bare business-type search would be resolved around the user's own
      // location instead of the area being swept.
      await navigateTabAndWait(job.tabId, job.resultsUrl ?? mapsSearchUrl(job.expectedQuery));
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
  const campaign = ensureCampaign(job.search);
  const task = campaign.tasks[campaign.queueIndex];
  let added = 0; let duplicates = 0; let newlyProcessed = 0; let repeated = 0; let sinceCheckpoint = 0;
  for (const batch of splitIntoBatches(records, DISCOVERY_BATCH_SIZE)) {
    job.search.currentBatchSize = batch.length;
    for (const record of batch) {
      await waitIfPaused(job);
      if (job.stopped || !hasDiscoveryCapacity(job)) break;
      const visibleResultKey = resultKeyForRecord(record);
      const legacyKey = [record.placeIdentifier, record.googleMapsUrl, `${record.businessName}|${record.address ?? ''}`].find((key) => Boolean(key) && processed.has(key!));
      if (processed.has(visibleResultKey) || legacyKey) {
        if (legacyKey && legacyKey !== visibleResultKey) { processed.delete(legacyKey); processed.add(visibleResultKey); }
        repeated += 1;
        continue;
      }
      if (!record.businessName || !record.googleMapsUrl) {
        if (task) task.invalidCount += 1;
        processed.add(visibleResultKey); newlyProcessed += 1; sinceCheckpoint += 1;
        await checkpointProcessedRecord(job, processed, visibleResultKey, record.googleMapsUrl || '', true);
        continue;
      }
      const hydratedRecord = await hydrateMapsRecord(job, record);
      const resultKey = resultKeyForRecord(hydratedRecord);
      if (processed.has(resultKey)) { repeated += 1; continue; }
      const lead = makeLead(hydratedRecord, job.search.id, stampSearchLocation(job), job.config.businessType);
      const geo = validateGeographicResult(
        job.originCoordinates,
        job.config.radiusKm,
        lead.latitude !== null && lead.longitude !== null
          ? { latitude: lead.latitude, longitude: lead.longitude }
          : null,
      );
      lead.distanceMeters = geo.distanceMeters;
      lead.distanceKm = geo.distanceKm;
      lead.geographicValidation = geo.status;

      // A Maps feed can lag behind navigation or surface personalized results
      // from the prior city. Coordinates outside the user's explicit radius are
      // never allowed into this search. Missing coordinates remain visible but
      // are clearly marked unverified rather than silently claimed as in-area.
      if (geo.status === 'outside') {
        job.search.rejectedOutOfAreaCount = (job.search.rejectedOutOfAreaCount ?? 0) + 1;
        if (task) { task.rejectedOutOfAreaCount += 1; task.invalidCount += 1; }
        processed.add(resultKey); newlyProcessed += 1; sinceCheckpoint += 1;
        await checkpointProcessedRecord(job, processed, resultKey, record.googleMapsUrl, true);
        continue;
      }
      if (geo.status === 'unverified') {
        job.search.unverifiedLocationCount = (job.search.unverifiedLocationCount ?? 0) + 1;
      }
      if (task) task.resultCount += 1;
      const exactKey = dedupeKey(lead); const proximityKey = [...job.leads.entries()].find(([, existing]) => isSameLead(existing, lead))?.[0]; const key = proximityKey ?? exactKey;
      const existing = job.leads.get(key);
      if (existing) { job.leads.set(key, mergeLead(existing, lead)); duplicates += 1; if (task) task.duplicateCount += 1; job.search.duplicateCount = (job.search.duplicateCount ?? 0) + 1; }
      else { job.leads.set(key, lead); added += 1; if (task) task.newCount += 1; }
      // Commit lead data before marking its Maps result as processed. A service
      // worker suspension between these operations can therefore only retry and
      // merge the lead; it cannot silently lose it.
      await LeadRepository.save(job.leads.get(key)!);
      processed.add(resultKey); newlyProcessed += 1; sinceCheckpoint += 1;
      await checkpointProcessedRecord(job, processed, resultKey, record.googleMapsUrl, sinceCheckpoint >= DISCOVERY_BATCH_SIZE);
      if (sinceCheckpoint >= DISCOVERY_BATCH_SIZE) sinceCheckpoint = 0;
      if (!hasDiscoveryCapacity(job)) break;
    }
    job.search.discoveredCount = processed.size; job.search.processedCount = processed.size; job.search.currentResultIndex = processed.size;
    job.search.uniqueCount = job.leads.size; job.search.processedResultKeys = [...processed]; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso();
    syncCampaignTotals(campaign, job.leads.size, job.search.updatedAt);
    await SearchRepository.save(job.search); await publishProgress(`${job.search.processedCount} processed · ${job.leads.size} unique leads saved locally.`);
    if (job.stopped || !hasDiscoveryCapacity(job)) break;
  }
  job.search.discoveredCount = processed.size; job.search.processedCount = processed.size; job.search.currentResultIndex = processed.size;
  job.search.uniqueCount = job.leads.size; job.search.processedResultKeys = [...processed]; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso();
  syncCampaignTotals(campaign, job.leads.size, job.search.updatedAt);
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
    job.resultsUrl = mapsSearchUrl(job.expectedQuery);
    await navigateTabAndWait(job.tabId, job.resultsUrl);
    // Navigation is a transport event, never a new search. Preserve the query
    // cursor and all processed identities so the restored feed skips them.
    job.search.currentStateKey = `query:${job.expectedQuery}`; await persistJob(job);
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
      // Wait for the NEW place page: reading straight after the update returned
      // the previous business's details (phone/website/coords shifted by one).
      await navigateTabAndWait(job.detailTabId, record.googleMapsUrl, 20_000);
    }
    const detail = await waitForMapsDetails(job.detailTabId, record);
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

// On-demand single-lead detail read for the side-panel drawer. Opens the lead's
// Maps place page in a background tab, reads the full detail view (rating
// breakdown, photos, hours, contacts), merges it into the stored lead, and
// always closes the temporary tab. Bounded by waitForMapsDetails so it can never
// hang; only one runs at a time.
let detailRequestInFlight = false;

async function collectLeadDetails(leadId: string): Promise<{ ok: boolean; lead?: Lead; error?: string }> {
  const lead = await LeadRepository.get(leadId);
  if (!lead) return { ok: false, error: 'That lead is no longer stored locally.' };
  if (!lead.googleMapsUrl) return { ok: false, error: 'This lead has no Google Maps link to read details from.' };
  if (detailRequestInFlight) return { ok: false, error: 'Another details request is still running — try again in a moment.' };
  detailRequestInFlight = true;
  let tempTabId: number | null = null;
  try {
    const tab = await chrome.tabs.create({ url: lead.googleMapsUrl, active: false });
    if (!tab.id) throw new Error('Could not open a Google Maps tab.');
    tempTabId = tab.id;
    await waitForTabNavigation(tempTabId);
    await ensureMapsContentScript(tempTabId);
    const detail = await waitForMapsDetails(tempTabId, lead);
    if (!detail) return { ok: false, error: 'Google Maps did not expose extra details for this business.' };
    const updated = applyRawDetailToLead(lead, detail);
    await LeadRepository.save(updated);
    return { ok: true, lead: updated };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  } finally {
    if (tempTabId !== null) { try { await chrome.tabs.remove(tempTabId); } catch { /* tab already gone */ } }
    detailRequestInFlight = false;
  }
}

function applyRawDetailToLead(lead: Lead, detail: RawBusinessRecord): Lead {
  const phone = cleanPhone(detail.phone) ?? lead.phone;
  return {
    ...lead,
    category: businessCategory(detail) || businessCategory(lead),
    phone,
    internationalPhone: phone && phone.startsWith('+') ? phone : lead.internationalPhone,
    website: lead.website || detail.website?.trim() || null,
    address: lead.address || detail.address?.trim() || null,
    street: lead.street || detail.street?.trim() || null,
    area: lead.area || detail.area?.trim() || null,
    city: lead.city || detail.city?.trim() || null,
    state: lead.state || detail.state?.trim() || null,
    postalCode: lead.postalCode || detail.postalCode?.trim() || null,
    country: lead.country || detail.country?.trim() || null,
    rating: detail.rating ?? lead.rating,
    reviewCount: detail.reviewCount ?? lead.reviewCount,
    ratingBreakdown: detail.ratingBreakdown ?? lead.ratingBreakdown ?? null,
    photos: detail.photos?.length ? [...new Set([...(lead.photos ?? []), ...detail.photos])] : (lead.photos ?? []),
    openingHours: detail.openingHours?.length ? [...new Set([...(lead.openingHours ?? []), ...detail.openingHours])] : (lead.openingHours ?? []),
    businessStatus: lead.businessStatus || detail.businessStatus?.trim() || null,
    updatedAt: nowIso(),
  };
}

async function waitForMapsDetails(tabId: number, expected?: Pick<RawBusinessRecord, 'placeIdentifier' | 'businessName'>): Promise<RawBusinessRecord | null> {
  // Bounded so a page that never renders a detail view costs ~6s, not ~24s. A
  // page that does load returns on the first or second attempt anyway.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const contextResponse = await sendToMaps(tabId, { type: 'GET_MAPS_CONTEXT' }) as { context?: MapsContext };
      if (contextResponse.context?.isListing || /\/maps\/place\//.test(contextResponse.context?.url ?? '')) {
        const details = await sendToMaps(tabId, { type: 'COLLECT_DETAILS' }) as { record?: RawBusinessRecord | null };
        // Only accept the detail view of the business we asked for — never a
        // different place still (or briefly) rendered in the tab.
        if (details.record && (!expected || detailMatchesRecord(details.record, expected))) return details.record;
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
    ratingBreakdown: detail.ratingBreakdown ?? base.ratingBreakdown ?? null,
    photos: detail.photos?.length ? detail.photos : base.photos,
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

// Point a tab at `url` and wait for THAT document to load. A Maps→Maps jump
// keeps the tab on a Maps URL the whole time, so the URL-only check in
// waitForTabNavigation returned instantly and the next message was answered by
// the OUTGOING page (e.g. the Paris place page, which has no feed). That made
// the sweep see "no results", re-search the bare business type around the
// user's own location and finish with 0 leads.
async function navigateTabAndWait(tabId: number, url: string, timeoutMs = 30_000): Promise<void> {
  const previousUrl = (await chrome.tabs.get(tabId).catch(() => null))?.url ?? null;
  let listener: ((id: number, info: chrome.tabs.TabChangeInfo) => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loaded = new Promise<void>((resolve) => {
    let started = false;
    listener = (id, info) => {
      if (id !== tabId) return;
      if (info.status === 'loading') started = true;
      else if (info.status === 'complete' && started) resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await chrome.tabs.update(tabId, { url });
    await loaded;
  } finally {
    clearTimeout(timer);
    if (listener) chrome.tabs.onUpdated.removeListener(listener);
  }
  await ensureMapsContentScript(tabId);
  // Belt and braces: make sure the content script answering us lives in the NEW
  // document, not a lingering copy of the previous page.
  if (previousUrl && previousUrl !== url) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await sendTabMessage(tabId, { type: 'GET_MAPS_CONTEXT' }, 4_000).catch(() => null) as { context?: MapsContext } | null;
      if (response?.context?.url && response.context.url !== previousUrl) return;
      await delay(500);
      await ensureMapsContentScript(tabId);
    }
  }
}

function mapsSearchUrl(query: string): string { return `https://www.google.com/maps/search/${encodeURIComponent(query)}`; }

async function waitForTabNavigation(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < MAX_RESULT_WAIT_RETRIES; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null); if (tab && isMapsUrl(tab.url)) return;
    await delay(Math.min(8_000, 1_000 * (2 ** attempt)));
  }
}

async function enrichJob(job: Job, task: BusinessTypeTask): Promise<{ total: number; completed: number; failed: number }> {
  job.search.status = 'enriching'; await persistJob(job);
  const candidates = [...job.leads.values()].filter((lead) => Boolean(lead.website) && (lead.discoveryCategories ?? []).includes(task.businessType));
  let completed = 0;
  let failed = 0;
  task.enrichmentTotal = candidates.length;
  for (const lead of candidates) {
    if (job.stopped) break;
    if (lead.enrichmentStatus === 'complete') {
      completed += 1;
      task.enrichmentCompleted = completed;
      continue;
    }
    lead.enrichmentStatus = 'pending';
    lead.enrichmentError = null;
    await LeadRepository.save(lead);
    let enriched = false;
    for (let attempt = Math.max(0, lead.enrichmentAttempts ?? 0); attempt < 2 && !job.stopped; attempt += 1) {
      lead.enrichmentAttempts = attempt + 1;
      try {
        const result = await discoverPublicEmails(lead.website!, job.config.maxPagesPerWebsite);
        lead.emails = result.emails;
        lead.emailSource = result.emailSource;
        lead.emailConfidence = result.emailConfidence;
        lead.enrichmentStatus = 'complete';
        lead.enrichmentError = null;
        enriched = true;
        break;
      } catch (error) {
        lead.enrichmentError = errorMessage(error);
        if (attempt < 1) await delay(500 * (2 ** attempt));
      }
    }
    if (enriched) completed += 1;
    else { failed += 1; lead.enrichmentStatus = 'failed'; }
    task.enrichmentCompleted = completed;
    task.enrichmentFailed = failed;
    lead.updatedAt = nowIso();
    await LeadRepository.save(lead);
    await persistJob(job);
    await publishProgress(`Website enrichment for ${task.businessType}: ${completed + failed} of ${candidates.length} processed.`);
  }
  return { total: candidates.length, completed, failed };
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
  await saveCrmImport(); await chrome.alarms.create(CRM_IMPORT_ALARM, { periodInMinutes: 0.5 }); void runCrmImport(activeCrmImport); return { ok: true, state: activeCrmImport };
}

async function runCrmImport(state: CrmImportProgress): Promise<void> {
  const processedIds = new Set(state.processedLeadIds ?? []);
  const pendingIds = state.leadIds.filter((id) => !processedIds.has(id));
  const batches = splitIntoBatches(pendingIds, CRM_BATCH_SIZE);
  // Map each search → its selected location so leads scraped before the lead
  // itself started carrying `searchLocation` still send it as the CRM's
  // city/country fallback. Best-effort; a missing search just omits the hint.
  const searchesById = new Map<string, SearchRecord>();
  try {
    for (const search of await SearchRepository.list()) {
      searchesById.set(search.id, search);
    }
  } catch { /* fallback hint is optional — proceed without it */ }
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    // Cooperative cancel: stop at the batch boundary, preserving everything
    // already added. Checked before each batch so a cancel never corrupts a
    // batch that is mid-flight.
    if (state.cancelRequested) { await finishCrmImport(state, 'cancelled'); activeCrmImport = null; return; }
    const batchIds = batches[batchIndex];
    const isLastBatch = batchIndex === batches.length - 1;
    const leads = (await Promise.all(batchIds.map((id) => LeadRepository.get(id))))
      .filter((lead): lead is Lead => Boolean(lead))
      .map((lead) => withImportSearchContext(lead, searchesById.get(lead.searchId)));
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
      const response = await importLeadsToCrm(leads, { importId: state.id, importTotal: state.total, importFinal: isLastBatch }); const byId = new Map(response.results.map((result) => [result.clientId, result]));
      for (const lead of leads) { const item = byId.get(lead.id); const status = item?.status ?? 'failed'; lead.crmStatus = status === 'created' ? 'imported' : status === 'existing' ? 'existing' : 'failed'; lead.crmLeadId = item?.leadId ?? lead.crmLeadId; lead.crmLeadNumber = item?.leadNumber ?? lead.crmLeadNumber; lead.crmError = item?.message ?? null; await LeadRepository.save(lead); if (lead.crmStatus === 'imported') state.created += 1; else if (lead.crmStatus === 'existing') state.existing += 1; else { state.failed += 1; state.failedLeadIds.push(lead.id); } }
    } catch (error) { state.failed += leads.length; state.error = errorMessage(error); state.failedLeadIds.push(...leads.map((lead) => lead.id)); for (const lead of leads) { lead.crmStatus = 'failed'; lead.crmError = errorMessage(error); await LeadRepository.save(lead); } }
    for (const id of batchIds) processedIds.add(id);
    state.processedLeadIds = [...processedIds]; state.processed = processedIds.size; state.nextIndex = state.processed;
    await saveCrmImport(); await publishCrmImport();
  }
  if (state.cancelRequested) { await finishCrmImport(state, 'cancelled'); activeCrmImport = null; return; }
  await finishCrmImport(state, state.failed ? 'partial' : 'completed'); activeCrmImport = null;
}

// Finalize an import run (completed / partial / cancelled): set the terminal
// status, release any leads still flagged "importing" (so a cancelled or crashed
// batch never leaves a lead stuck mid-add), persist, notify the panel, and stop
// the keepalive alarm.
async function finishCrmImport(state: CrmImportProgress, status: CrmImportProgress['status']): Promise<void> {
  state.status = status;
  state.completedAt = nowIso();
  await resetImportingLeads(state);
  await saveCrmImport();
  await publishCrmImport();
  void chrome.alarms.clear(CRM_IMPORT_ALARM);
  void heartbeat();
}

// Any lead left as "importing" when a run ends (cancel, or a batch interrupted by
// a worker restart) is reverted to "not-imported" so it is cleanly selectable to
// add again — never shown stuck on "Adding…".
async function resetImportingLeads(state: CrmImportProgress): Promise<void> {
  await Promise.all((state.leadIds ?? []).map(async (id) => {
    const lead = await LeadRepository.get(id);
    if (lead && lead.crmStatus === 'importing') { lead.crmStatus = 'not-imported'; lead.crmError = null; await LeadRepository.save(lead); }
  }));
}

// Cancel an in-flight CRM import. A live run observes the persisted flag at its
// next batch boundary and finalizes itself; if no run is live (the worker was
// recycled and only the stored 'running' state remains), finalize it here so a
// recovery can't resume it.
async function cancelCrmImport(): Promise<CrmImportProgress | null> {
  const live = activeCrmImport;
  if (live && live.status === 'running') {
    live.cancelRequested = true;
    await saveCrmImport();
    return live;
  }
  const stored = (await SettingsRepository.get<CrmImportProgress>(CRM_IMPORT_SETTING))?.value ?? null;
  if (!stored || stored.status !== 'running') return stored;
  stored.cancelRequested = true;
  activeCrmImport = stored;
  await finishCrmImport(stored, 'cancelled');
  activeCrmImport = null;
  return stored;
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
    ensureCampaign(activeJob.search).status = 'paused';
    try {
      const scroll = await sendToMaps(activeJob.tabId, { type: 'GET_SCROLL_STATE' }) as MapsScrollState;
      applyScrollCheckpoint(activeJob.search, scroll);
    } catch { /* retain the most recent persisted checkpoint */ }
    activeJob.search.lastActivityAt = nowIso(); activeJob.search.updatedAt = nowIso();
    await persistJob(activeJob);
  }
  await publishProgress('Discovery paused at the saved checkpoint.');
}

async function stopDiscovery(): Promise<void> {
  if (activeJob) {
    activeJob.stopped = true;
    activeJob.search.stopRequested = true;
    ensureCampaign(activeJob.search).stopRequested = true;
    activeJob.resumeResolvers.splice(0).forEach((resolve) => resolve());
    await persistJob(activeJob);
    await publishProgress('Stopping campaign…');
    return;
  }
  const stored = (await SearchRepository.list()).find((search) => ACTIVE_STATUSES.has(search.status));
  if (!stored) return;
  const campaign = ensureCampaign(stored);
  campaign.stopRequested = true;
  const running = campaign.tasks.find((task) => task.status === 'running');
  if (running) {
    running.status = running.newCount > 0 ? 'completed-with-errors' : 'skipped';
    running.error = 'Stopped by user.';
    running.skipReason = running.newCount > 0 ? null : 'stopped-by-user';
    running.completedAt = nowIso();
  }
  skipPendingTasks(campaign, 'stopped-by-user');
  finishCampaign(campaign, stored.uniqueCount, true);
  stored.stopRequested = true;
  stored.status = 'stopped';
  stored.currentPhase = 'STOPPED';
  stored.completedAt = nowIso();
  stored.updatedAt = nowIso();
  await SearchRepository.save(stored);
  await publishProgress('Campaign stopped. Saved businesses were preserved.');
}

async function setPhase(job: Job, phase: DiscoveryPhase, message?: string): Promise<void> { job.search.currentPhase = phase; updateTaskStage(ensureCampaign(job.search), phase); job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso(); if (phase === 'PROCESSING') job.search.status = 'processing'; else if (phase === 'EXTRACTING' || phase === 'WAITING_FOR_RESULTS' || phase === 'CHECKING_FOR_MORE' || phase === 'NEXT_RESULTS' || phase === 'SEARCH_INITIALIZED') job.search.status = job.search.status === 'resuming' || job.search.status === 'retrying' ? job.search.status : 'discovering'; await persistJob(job); await publishProgress(message); }
async function persistJob(job: Job): Promise<void> { const tab = await chrome.tabs.get(job.tabId).catch(() => null); job.search.currentStateKey = tab?.url ?? job.search.currentStateKey; job.search.currentQuery = job.expectedQuery; job.search.queryIndex = job.queryIndex; job.search.lastActivityAt = nowIso(); job.search.updatedAt = nowIso(); syncCampaignTotals(ensureCampaign(job.search), job.leads.size, job.search.updatedAt); await SearchRepository.save(job.search); }
async function getProgressResponse(): Promise<DiscoveryProgress> { await recoverDiscovery(); if (activeJob) return progressFor(activeJob); const search = (await SearchRepository.list())[0]; let leads: Lead[] = []; if (search) { leads = await LeadRepository.listBySearch(search.id); const hadCampaign = Boolean(search.campaign); const upgraded = upgradeCheckpoint(search, leads.map((lead) => resultKeyForRecord(lead))); ensureCampaign(search); if (upgraded || !hadCampaign) await SearchRepository.save(search); } return progressForStored(search, leads); }
async function publishProgress(message?: string): Promise<void> { try { await chrome.runtime.sendMessage({ type: 'DISCOVERY_PROGRESS', progress: activeJob ? progressFor(activeJob, message) : await getProgressResponse(), message }); } catch { /* side panel can be closed */ } }
function progressFor(job: Job, message?: string): DiscoveryProgress { const leads = [...job.leads.values()]; const campaign = ensureCampaign(job.search); const processed = campaign.tasks.reduce((sum, task) => sum + task.resultCount + task.invalidCount, 0); return { searchId: job.search.id, status: job.paused ? 'paused' : job.search.status, query: job.search.currentQuery || job.search.query, location: job.search.location, discovered: campaign.tasks.reduce((sum, task) => sum + task.resultCount, 0), duplicates: campaign.duplicateCount, unique: leads.length, withPhone: leads.filter((lead) => Boolean(lead.phone)).length, withWebsite: leads.filter((lead) => Boolean(lead.website)).length, withEmail: leads.filter((lead) => lead.emails.length > 0).length, iteration: job.search.currentPage ?? 0, maxIterations: job.config.safetyLimit ?? MAX_SAFE_ITERATIONS, message, phase: job.search.currentPhase, processed, currentQuery: job.search.currentQuery, currentBatch: job.search.currentBatchSize ?? 0, configuredMaximum: campaign.globalMaxResults, error: job.search.error, tilesScanned: job.tilesScanned, tilesPlanned: job.tilesPlanned, rejectedOutOfArea: campaign.tasks.reduce((sum, task) => sum + task.rejectedOutOfAreaCount, 0), unverifiedLocation: job.search.unverifiedLocationCount ?? 0, enrichmentTotal: campaign.enrichmentTotal, enrichmentCompleted: campaign.enrichmentCompleted, enrichmentFailed: campaign.enrichmentFailed, campaign, updatedAt: job.search.updatedAt }; }
function progressForStored(search?: SearchRecord, leads: Lead[] = []): DiscoveryProgress { const campaign = search ? ensureCampaign(search) : undefined; return { searchId: search?.id ?? '', status: search?.status ?? 'idle', query: search?.currentQuery ?? search?.query ?? '', location: search?.location, discovered: campaign ? campaign.tasks.reduce((sum, task) => sum + task.resultCount, 0) : search?.discoveredCount ?? 0, duplicates: campaign?.duplicateCount ?? search?.duplicateCount ?? 0, unique: leads.length || search?.uniqueCount || 0, withPhone: leads.filter((lead) => Boolean(lead.phone)).length, withWebsite: leads.filter((lead) => Boolean(lead.website)).length, withEmail: leads.filter((lead) => lead.emails.length > 0).length, iteration: search?.currentPage ?? 0, maxIterations: search?.config?.safetyLimit ?? MAX_SAFE_ITERATIONS, phase: search?.currentPhase, processed: campaign ? campaign.tasks.reduce((sum, task) => sum + task.resultCount + task.invalidCount, 0) : search?.processedCount ?? search?.processedResultKeys?.length ?? 0, currentQuery: search?.currentQuery, currentBatch: search?.currentBatchSize ?? 0, configuredMaximum: campaign?.globalMaxResults ?? search?.config?.maxResults, error: search?.error, rejectedOutOfArea: campaign?.tasks.reduce((sum, task) => sum + task.rejectedOutOfAreaCount, 0) ?? search?.rejectedOutOfAreaCount ?? 0, unverifiedLocation: search?.unverifiedLocationCount ?? 0, enrichmentTotal: campaign?.enrichmentTotal, enrichmentCompleted: campaign?.enrichmentCompleted, enrichmentFailed: campaign?.enrichmentFailed, campaign, updatedAt: search?.updatedAt }; }
async function waitIfPaused(job: Job): Promise<void> { if (!job.paused) return; await new Promise<void>((resolve) => job.resumeResolvers.push(resolve)); }
// A single Maps content-script call must answer within this window. Without a
// timeout, chrome.tabs.sendMessage hangs forever whenever a handler returns true
// (async) but never calls sendResponse, or the tab is mid-navigation — which
// froze the entire discovery loop after the first business ("stuck after 1").
// Racing a timeout turns a non-response into a retryable error instead.
const MAPS_MESSAGE_TIMEOUT_MS = 15_000;
function sendTabMessage(tabId: number, message: unknown, timeoutMs = MAPS_MESSAGE_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Maps content script did not respond in time.')); } }, timeoutMs);
    chrome.tabs.sendMessage(tabId, message).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
    );
  });
}
async function sendToMaps(tabId: number, message: { type: string; [key: string]: unknown }): Promise<unknown> {
  let response: unknown;
  try {
    response = await sendTabMessage(tabId, message);
  } catch (transportError) {
    await ensureMapsContentScript(tabId);
    try {
      response = await sendTabMessage(tabId, message);
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
    // Short, bounded probe: a live content script answers instantly; a missing
    // or hung one must not block injection waiting on a response that never comes.
    await sendTabMessage(tabId, { type: 'GET_MAPS_CONTEXT' }, 4_000);
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
function isUnexpectedSearchContext(context: MapsContext, expected: string): boolean { if (!context.isMaps) return true; if (!context.query || !expected) return false; const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim(); const expectedParts = normalize(expected).split(' near '); return !normalize(context.query).includes(normalize(expectedParts[0])); }
function isMapsUrl(url?: string): boolean { if (!url) return false; try { const parsed = new URL(url); return /(^|\.)google\.[^/]+$/.test(parsed.hostname) && parsed.pathname.startsWith('/maps'); } catch { return false; } }
function validCenter(value: { latitude: number; longitude: number } | null | undefined): value is { latitude: number; longitude: number } { return Boolean(value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180); }
function isSearchRoute(url?: string): boolean { return Boolean(url && /\/maps\/search\//.test(url)); }
// A single typed location (e.g. "paris") often resolves to a /maps/place/ URL
// rather than a search feed; both are valid "we have navigated" signals.
function isPlaceRoute(url?: string): boolean { return Boolean(url && /\/maps\/place\//.test(url)); }
async function hasActiveSearch(): Promise<boolean> { return (await SearchRepository.list()).some((search) => ACTIVE_STATUSES.has(search.status)); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : typeof error === 'string' ? error : 'An unexpected error occurred.'; }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Live scraping-delay read so changing it in Settings applies to a running sweep
// without restarting. Falls back to the job's own config, then the default.
async function baseRequestDelayMs(job: Job): Promise<number> {
  let configured = job.config.requestDelayMs;
  try {
    const stored = await SettingsRepository.get<DiscoveryConfig>('config');
    if (stored?.value && typeof stored.value.requestDelayMs === 'number') {
      configured = stored.value.requestDelayMs;
      job.config.requestDelayMs = configured; // keep the job in sync for persistence/UI
    }
  } catch { /* storage unavailable — use the job's own config */ }
  return clampRequestDelay(configured ?? DEFAULT_REQUEST_DELAY_MS, MIN_REQUEST_DELAY_MS, MAX_REQUEST_DELAY_MS, DEFAULT_REQUEST_DELAY_MS);
}

// Pause between throttle-sensitive Maps navigations (each new area/tile + query
// variation). `throttled` grows the adaptive backoff; a clean request decays it.
// The wait is chunked so Stop/Pause stay responsive during a multi-minute delay.
async function pauseBetweenRequests(job: Job, throttled: boolean): Promise<void> {
  job.throttleBackoff = nextThrottleBackoff(job.throttleBackoff, throttled, MAX_THROTTLE_BACKOFF);
  const base = await baseRequestDelayMs(job);
  const until = Date.now() + effectiveRequestDelay(base, job.throttleBackoff, MAX_REQUEST_DELAY_MS);
  while (Date.now() < until) {
    if (job.stopped) return;
    await waitIfPaused(job);
    if (job.stopped) return;
    await delay(Math.min(1_000, until - Date.now()));
  }
}
