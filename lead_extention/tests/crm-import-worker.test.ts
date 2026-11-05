import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { makeLead } from '../src/shared/normalize';
import type { CrmImportProgress, ExtensionMessage, Lead } from '../src/shared/types';

const data = vi.hoisted(() => ({ leads: new Map<string, Lead>(), settings: new Map<string, unknown>(), states: [] as CrmImportProgress[], import: vi.fn(), saveMany: vi.fn() }));
vi.mock('../src/storage/repositories', () => ({
  LeadRepository: {
    getMany: async (ids: string[]) => ids.map((id) => structuredClone(data.leads.get(id))),
    saveMany: async (leads: Lead[]) => { data.saveMany(leads); leads.forEach((lead) => data.leads.set(lead.id, structuredClone(lead))); },
  },
  SearchRepository: { list: async () => [] },
  SettingsRepository: {
    get: async (id: string) => data.settings.has(id) ? { id, value: structuredClone(data.settings.get(id)) } : undefined,
    save: async (id: string, value: unknown) => { data.settings.set(id, structuredClone(value)); },
  },
}));
vi.mock('../src/integration/crm-api', () => ({
  getAuthState: async () => ({ authenticated: true }), importLeads: data.import,
  clearAuth: vi.fn(), connectWithGrant: vi.fn(), heartbeat: vi.fn(), login: vi.fn(), logout: vi.fn(),
}));
let handler: (message: ExtensionMessage, sender: object, reply: (response: Record<string, unknown>) => void) => void;
const send = (message: ExtensionMessage) => new Promise<Record<string, unknown>>((resolve) => handler(message, {}, resolve));
const confirmed = (leads: Lead[]) => ({ results: leads.map((lead) => ({ clientId: lead.id, status: 'created', leadId: `crm-${lead.id}`, leadNumber: 'L-00001' })) });
function select(count: number) {
  const leads = Array.from({ length: count }, (_, i) => makeLead({ businessName: `Hotel ${i}`, placeIdentifier: `place-${i}`, googleMapsUrl: 'https://www.google.com/maps' }, 'search'));
  leads.forEach((lead) => data.leads.set(lead.id, lead));
  return leads.map((lead) => lead.id);
}
async function finish() {
  await vi.waitFor(() => expect(['completed', 'partial', 'failed', 'cancelled']).toContain(data.states.at(-1)?.status));
  return data.states.at(-1)!;
}
beforeEach(async () => {
  vi.resetModules(); data.leads.clear(); data.settings.clear(); data.states.length = 0;
  data.saveMany.mockReset(); data.import.mockReset().mockImplementation(async (leads) => confirmed(leads));
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  vi.stubGlobal('chrome', {
    runtime: { onInstalled: event(), onStartup: event(), onMessageExternal: event(), onMessage: { addListener: (fn: typeof handler) => { handler = fn; } }, sendMessage: async (message: { progress?: CrmImportProgress }) => { if (message.progress) data.states.push(structuredClone(message.progress)); } },
    alarms: { onAlarm: event(), create: vi.fn(async () => undefined), clear: vi.fn(async () => true) },
    commands: { onCommand: event() },
  });
  await import('../src/background/service-worker');
});
afterEach(() => vi.unstubAllGlobals());

describe('CRM bulk import worker', () => {
  it('sends the full selection once and saves local statuses in bulk', async () => {
    const ids = select(100);
    await send({ type: 'IMPORT_TO_CRM', leadIds: [...ids, ids[0]] });
    expect(await finish()).toMatchObject({ total: 100, processed: 100, created: 100, failed: 0, status: 'completed' });
    expect(data.import).toHaveBeenCalledTimes(1);
    expect(data.import.mock.calls[0][0]).toHaveLength(100);
    expect(data.import.mock.calls[0][1]).toMatchObject({ importTotal: 100, importFinal: true });
    expect(data.saveMany.mock.calls.filter(([leads]) => leads.length > 0)).toHaveLength(2);
  });
  it('respects the 500-row API bound and checkpoints before the remaining batch', async () => {
    await send({ type: 'IMPORT_TO_CRM', leadIds: select(501) });
    expect(await finish()).toMatchObject({ processed: 501, created: 501, status: 'completed' });
    expect(data.import.mock.calls.map(([leads]) => leads.length)).toEqual([500, 1]);
    expect(data.import.mock.calls.map(([, options]) => options.importFinal)).toEqual([false, true]);
    expect(data.states.some((state) => state.processed === 500 && state.status === 'running')).toBe(true);
  });
  it('does not report success for local records or server outcomes that are missing', async () => {
    const ids = select(3);
    data.leads.delete(ids[2]);
    data.import.mockImplementationOnce(async (leads: Lead[]) => ({ results: [{ clientId: leads[0].id, status: 'existing' }] }));
    await send({ type: 'IMPORT_TO_CRM', leadIds: ids });
    expect(await finish()).toMatchObject({ total: 3, processed: 3, created: 0, existing: 1, failed: 2, status: 'partial' });
  });
  it('cancels at the batch boundary, retaining only confirmed results', async () => {
    const ids = select(501);
    let resolveImport!: (result: ReturnType<typeof confirmed>) => void;
    data.import.mockImplementationOnce(() => new Promise((resolve) => { resolveImport = resolve; }));
    await send({ type: 'IMPORT_TO_CRM', leadIds: ids });
    await vi.waitFor(() => expect(data.import).toHaveBeenCalledTimes(1));
    await send({ type: 'CANCEL_CRM_IMPORT' });
    resolveImport(confirmed(data.import.mock.calls[0][0]));
    expect(await finish()).toMatchObject({ processed: 500, created: 500, status: 'cancelled' });
    expect(data.import).toHaveBeenCalledTimes(1);
    expect(data.leads.get(ids[500])?.crmStatus).not.toBe('imported');
  });
  it('recovers an interrupted run without resending confirmed batches', async () => {
    const ids = select(501);
    data.settings.set('crm-import-state', { id: 'saved-run', status: 'running', total: 501, processed: 500, created: 500, existing: 0, failed: 0, leadIds: ids, processedLeadIds: ids.slice(0, 500), failedLeadIds: [] });
    await send({ type: 'GET_CRM_IMPORT' });
    expect(await finish()).toMatchObject({ total: 501, processed: 501, created: 501, status: 'completed' });
    expect(data.import.mock.calls[0][0].map((lead: Lead) => lead.id)).toEqual([ids[500]]);
  });
  it('marks a rejected request failed without claiming any imported leads', async () => {
    data.import.mockRejectedValueOnce(new Error('CRM unavailable'));
    await send({ type: 'IMPORT_TO_CRM', leadIds: select(10) });
    expect(await finish()).toMatchObject({ status: 'failed', created: 0, failed: 10 });
  });
});
