import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCampaign, startTask } from '../src/shared/campaign';
import { makeLead } from '../src/shared/normalize';
import type { DiscoveryConfig, DiscoveryProgress, ExtensionMessage, Lead, RawBusinessRecord, SearchRecord } from '../src/shared/types';

const data = vi.hoisted(() => ({ searches: new Map<string, SearchRecord>(), leads: new Map<string, Lead>(), progress: [] as DiscoveryProgress[] }));
vi.mock('../src/storage/repositories', () => ({
  SearchRepository: {
    list: async () => [...data.searches.values()].map((s) => structuredClone(s)).reverse(),
    get: async (id: string) => structuredClone(data.searches.get(id)),
    save: async (search: SearchRecord) => { data.searches.set(search.id, structuredClone(search)); },
  },
  LeadRepository: {
    list: async () => [...data.leads.values()],
    listBySearch: async (id: string) => [...data.leads.values()].filter((lead) => lead.searchId === id).map((lead) => structuredClone(lead)),
    save: async (lead: Lead) => { data.leads.set(lead.id, structuredClone(lead)); },
  },
  SettingsRepository: { get: async () => undefined, save: async () => undefined },
  clearAllLocalData: async () => undefined,
}));
vi.mock('../src/integration/crm-api', () => ({
  getAuthState: async () => ({ authenticated: true }),
  clearAuth: vi.fn(), connectWithGrant: vi.fn(), heartbeat: vi.fn(), importLeads: vi.fn(), login: vi.fn(), logout: vi.fn(),
}));

const config: DiscoveryConfig = {
  businessType: 'Gym', businessTypes: ['Gym', 'Beauty Salon'], location: 'Mohammedia',
  maxResults: 10, radiusKm: null, queryExpansion: false, enableEnrichment: false,
  maxPagesPerWebsite: 1, areaSweep: false, thoroughContacts: false,
  selectedCenter: { latitude: 33.68, longitude: -7.38 },
};
const records = (type: string, count = 25): RawBusinessRecord[] => Array.from({ length: count }, (_, i) => ({
  businessName: `${type} Business ${i}`, placeIdentifier: `${type}-${i}`,
  googleMapsUrl: `https://www.google.com/maps/place/${encodeURIComponent(type)}-${i}`,
  latitude: 33.68, longitude: -7.38,
}));
let handleMessage: (message: ExtensionMessage, sender: object, reply: (value: Record<string, unknown>) => void) => void;
let tab: { id: number; url: string; status: string };
let supplied: Record<string, number>;
let overlapping = 0;
let endConfirmed: boolean;
let collectOverride: (() => RawBusinessRecord[]) | null;
const updateListeners = new Set<(id: number, info: { status: string }) => void>();

beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules();
  data.searches.clear(); data.leads.clear(); data.progress.length = 0; updateListeners.clear();
  supplied = { Gym: 25, 'Beauty Salon': 25 };
  overlapping = 0;
  collectOverride = null;
  endConfirmed = true;
  tab = { id: 1, url: 'https://www.google.com/maps/search/Gym+near+Mohammedia', status: 'complete' };
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  const context = () => ({
    isMaps: true, url: tab.url, query: decodeURIComponent(new URL(tab.url).pathname.split('/search/')[1] ?? '').replace(/\+/g, ' '),
    hasResults: true, isListing: false, visibleResultCount: 25,
  });
  const scroll = { scrollTop: 0, scrollHeight: 500, changed: false, atEnd: true, endConfirmed: true, visibleResultCount: 25 };
  vi.stubGlobal('chrome', {
    runtime: {
      onInstalled: event(), onStartup: event(), onMessageExternal: event(),
      onMessage: { addListener: (handler: typeof handleMessage) => { handleMessage = handler; } },
      sendMessage: async (message: { progress?: DiscoveryProgress }) => { if (message.progress) data.progress.push(structuredClone(message.progress)); },
      getManifest: () => ({ version: '0.6.3' }),
    },
    alarms: { onAlarm: event(), create: vi.fn(async () => undefined), clear: vi.fn(async () => true) },
    commands: { onCommand: event() }, sidePanel: { setPanelBehavior: vi.fn(), open: vi.fn() }, windows: { WINDOW_ID_CURRENT: -2 },
    tabs: {
      query: async () => [structuredClone(tab)],
      get: async (id: number) => { if (id !== tab.id) throw new Error('Tab closed'); return structuredClone(tab); },
      update: async (_id: number, change: { url?: string }) => {
        if (change.url) tab.url = change.url;
        updateListeners.forEach((listener) => listener(tab.id, { status: 'loading' }));
        updateListeners.forEach((listener) => listener(tab.id, { status: 'complete' }));
        return structuredClone(tab);
      },
      onUpdated: { addListener: (listener: (id: number, info: { status: string }) => void) => updateListeners.add(listener), removeListener: (listener: (id: number, info: { status: string }) => void) => updateListeners.delete(listener) },
      sendMessage: async (_id: number, message: { type: string }) => {
        if (message.type === 'GET_MAPS_CONTEXT') return { context: context() };
        if (message.type === 'COLLECT_VISIBLE') {
          if (collectOverride) return { records: collectOverride(), context: context() };
          const type = context().query.startsWith('Beauty Salon') ? 'Beauty Salon' : 'Gym';
          return { records: [...(type === 'Beauty Salon' ? records('Gym', overlapping) : []), ...records(type, supplied[type])], context: context() };
        }
        return { ...scroll, endConfirmed };
      },
      remove: vi.fn(async () => undefined),
    },
    scripting: { executeScript: vi.fn(async () => []) },
  });
  await import('../src/background/service-worker');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const send = (message: ExtensionMessage) => new Promise<Record<string, unknown>>((resolve) => handleMessage(message, {}, resolve));
async function finish() {
  for (let step = 0; step < 200; step += 1) {
    await vi.advanceTimersByTimeAsync(1_000);
    const latest = data.progress.at(-1);
    if (latest && ['completed', 'completed-with-errors', 'failed', 'error'].includes(latest.status)) {
      await vi.advanceTimersByTimeAsync(0);
      return latest;
    }
  }
  throw new Error(`Campaign did not finish: ${JSON.stringify(data.progress.at(-1))}`);
}
function savedSearch(id: string): SearchRecord {
  const campaign = createCampaign(id, config.businessTypes!, 10);
  return { id, businessType: 'Gym, Beauty Salon', businessTypes: config.businessTypes, location: 'Mohammedia', radiusKm: null,
    query: 'Gym near Mohammedia', currentQuery: 'Gym near Mohammedia', startedAt: campaign.startedAt, completedAt: null,
    status: 'paused', discoveredCount: 3, uniqueCount: 3, exportedCount: 0, tabId: 1, config: structuredClone(config), campaign };
}

describe('actual background worker campaign orchestration', () => {
  it('waits through a temporarily stalled bottom and fills the selected software-company count', async () => {
    let polls = 0;
    collectOverride = () => records('Software', ++polls < 12 ? 2 : 25).map((record, index) => ({
      ...record, placeIdentifier: null, phone: '+212 522 000000',
      category: ['No reviews', 'Online appointments', 'N°1', null][index % 4],
      reviewCount: index % 2 === 0 ? null : 5,
    }));
    endConfirmed = false;
    await send({ type: 'START_DISCOVERY', config: { ...config, businessType: 'Software companies', businessTypes: ['Software companies'] } });
    const result = await finish();
    expect(polls).toBeGreaterThanOrEqual(12);
    expect(result.unique).toBe(10);
    expect(data.leads.size).toBe(10);
    expect([...data.leads.values()].every((lead) => lead.category === 'Software companies')).toBe(true);
    expect([...data.leads.values()].some((lead) => lead.reviewCount === null)).toBe(true);
  });

  it('skips cross-type duplicates and still fills both ten-business quotas without duplicate records', async () => {
    overlapping = 5;
    await send({ type: 'START_DISCOVERY', config });
    const result = await finish();
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([10, 10]);
    expect(result.campaign!.tasks[1].duplicateCount).toBe(5);
    expect(data.leads.size).toBe(20);
    const shared = [...data.leads.values()].find((lead) => lead.placeIdentifier === 'Gym-0');
    expect(shared?.discoveryCategories).toEqual(['Gym', 'Beauty Salon']);
  });

  it('caps each 25-card batch at ten results and saves ten Gym plus ten Beauty Salon leads', async () => {
    expect(await send({ type: 'START_DISCOVERY', config })).toMatchObject({ ok: true });
    const result = await finish();
    expect(result.status).toBe('completed');
    expect(result.unique).toBe(20);
    expect(result.campaign!.tasks.map((task) => [task.businessType, task.newCount, task.status])).toEqual([
      ['Gym', 10, 'completed'], ['Beauty Salon', 10, 'completed'],
    ]);
    expect(data.leads.size).toBe(20);
  });

  it('keeps Beauty Salon at ten when only two gyms are available', async () => {
    supplied.Gym = 2;
    await send({ type: 'START_DISCOVERY', config });
    const result = await finish();
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([2, 10]);
    expect(data.leads.size).toBe(12);
  });

  it('keeps Gym at ten when only two beauty salons are available', async () => {
    supplied['Beauty Salon'] = 2;
    await send({ type: 'START_DISCOVERY', config });
    const result = await finish();
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([10, 2]);
    expect(data.leads.size).toBe(12);
  });

  it('finishes without looping when neither type can fill the total', async () => {
    supplied.Gym = 2; supplied['Beauty Salon'] = 2;
    await send({ type: 'START_DISCOVERY', config });
    const result = await finish();
    expect(result.status).toBe('completed');
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([2, 2]);
    expect(data.leads.size).toBe(4);
  });

  it('resumes a persisted halfway-complete Gym budget without letting it consume the second type’s slots', async () => {
    const search = savedSearch('resume');
    startTask(search.campaign!, search.campaign!.tasks[0], search.query);
    search.campaign!.tasks[0].newCount = 3; search.campaign!.uniqueCount = 3;
    for (const raw of records('Gym', 3)) { const lead = makeLead(raw, search.id, 'Mohammedia', 'Gym'); data.leads.set(lead.id, lead); }
    data.searches.set(search.id, search);
    expect(await send({ type: 'RESUME_DISCOVERY' })).toMatchObject({ ok: true });
    const result = await finish();
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([10, 10]);
    expect(data.leads.size).toBe(20);
  });

  it('retries a skipped second type after the first type already saved ten unique businesses', async () => {
    const search = savedSearch('full-first-type');
    search.status = 'completed'; search.campaign!.uniqueCount = 10;
    search.campaign!.tasks[0].status = 'completed'; search.campaign!.tasks[0].newCount = 10;
    search.campaign!.tasks[1].status = 'skipped'; search.campaign!.tasks[1].skipReason = 'global-limit-reached';
    for (const raw of records('Gym', 10)) { const lead = makeLead(raw, search.id); data.leads.set(lead.id, lead); }
    data.searches.set(search.id, structuredClone(search));
    expect(await send({ type: 'RETRY_BUSINESS_TYPE', businessType: 'Beauty Salon', searchId: search.id })).toMatchObject({ ok: true });
    const result = await finish();
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([10, 10]);
    expect(data.leads.size).toBe(20);
  });

  it('allows a maximum of one for each selected business type', async () => {
    expect(await send({ type: 'START_DISCOVERY', config: { ...config, maxResults: 1 } })).toMatchObject({ ok: true });
    const result = await finish();
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([1, 1]);
    expect(data.leads.size).toBe(2);
  });

  it('retries the requested saved campaign in a replacement Maps tab and keeps completed results', async () => {
    const search = savedSearch('retry-target');
    search.status = 'completed-with-errors'; search.tabId = 99;
    search.campaign!.tasks[0].status = 'completed'; search.campaign!.tasks[0].newCount = 3;
    search.campaign!.tasks[1].status = 'failed'; search.campaign!.tasks[1].error = 'Temporary Maps error';
    search.campaign!.queueIndex = 2; search.campaign!.uniqueCount = 3;
    for (const raw of records('Gym', 3)) { const lead = makeLead(raw, search.id); data.leads.set(lead.id, lead); }
    data.searches.set(search.id, search);
    const newer = savedSearch('newer'); newer.status = 'failed'; newer.campaign!.tasks[1].status = 'failed';
    data.searches.set(newer.id, structuredClone(newer));
    expect(await send({ type: 'RETRY_BUSINESS_TYPE', businessType: 'Beauty Salon', searchId: search.id })).toMatchObject({ ok: true, searchId: search.id });
    const result = await finish();
    expect(result.searchId).toBe(search.id);
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([3, 10]);
    expect(data.searches.get(search.id)!.tabId).toBe(1);
    expect(data.searches.get(newer.id)).toEqual(newer);
    expect(data.leads.size).toBe(13);
  });

  it('starts a per-type campaign without deleting the previous shared-limit campaign’s ten results', async () => {
    const old = savedSearch('old-full'); delete old.campaign!.perTypeMaxResults; old.campaign!.globalMaxResults = 10; old.status = 'completed'; old.uniqueCount = 10;
    old.campaign!.uniqueCount = 10; old.campaign!.tasks[0].status = 'completed'; old.campaign!.tasks[0].newCount = 10;
    old.campaign!.tasks[1].status = 'skipped'; old.campaign!.tasks[1].skipReason = 'global-limit-reached';
    data.searches.set(old.id, structuredClone(old));
    for (const raw of records('Gym', 10)) { const lead = makeLead(raw, old.id); data.leads.set(lead.id, lead); }
    const response = await send({ type: 'START_DISCOVERY', config });
    expect(response.ok).toBe(true);
    const result = await finish();
    expect(result.searchId).not.toBe(old.id);
    expect(result.campaign!.tasks.map((task) => task.newCount)).toEqual([10, 10]);
    expect(data.searches.get(old.id)).toEqual(old);
    expect([...data.leads.values()].filter((lead) => lead.searchId === old.id)).toHaveLength(10);
    expect(data.leads.size).toBe(30);
  });
});
