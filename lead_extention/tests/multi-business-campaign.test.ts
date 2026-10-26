import { describe, expect, it } from 'vitest';
import {
  MAX_BUSINESS_TYPE_ATTEMPTS,
  completeTask,
  completedTaskCount,
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
} from '../src/shared/campaign';
import { createXlsx, toCsv } from '../src/export/exporters';
import { buildDiscoveryQueries } from '../src/shared/search-context';
import { dedupeKey, isSameLead, makeLead, mergeLead } from '../src/shared/normalize';
import type { DiscoveryCampaign, DiscoveryConfig, RawBusinessRecord, SearchRecord } from '../src/shared/types';

const config = (businessTypes: string[]): DiscoveryConfig => ({
  businessType: businessTypes[0] ?? '',
  businessTypes,
  location: 'Lahore',
  radiusKm: 10,
  maxResults: 100,
  queryExpansion: true,
  enableEnrichment: false,
  maxPagesPerWebsite: 2,
  areaSweep: true,
});

const raw = (name: string, placeIdentifier: string, overrides: Partial<RawBusinessRecord> = {}): RawBusinessRecord => ({
  businessName: name,
  googleMapsUrl: `https://www.google.com/maps/place/${encodeURIComponent(name)}/data=!4m2!3m1!1s${placeIdentifier}`,
  placeIdentifier,
  address: 'Main Boulevard, Gulberg, Lahore, Pakistan',
  phone: '+92 300 1234567',
  website: `https://${name.toLowerCase().replace(/\s+/g, '-')}.example`,
  latitude: 31.5204,
  longitude: 74.3587,
  ...overrides,
});

function runTypes(campaign: DiscoveryCampaign, outcomes: Record<string, 'ok' | 'empty' | 'fail'>): string[] {
  const order: string[] = [];
  for (let task = nextRunnableTask(campaign); task; task = nextRunnableTask(campaign)) {
    order.push(task.businessType);
    startTask(campaign, task, `${task.businessType} near Lahore`);
    if (outcomes[task.businessType] === 'fail') failTask(campaign, task, 'Temporary Maps failure');
    else completeTask(campaign, task);
  }
  finishCampaign(campaign, campaign.uniqueCount);
  return order;
}

describe('multi-business-type sequential campaign', () => {
  it('1 — completes one selected business type', () => {
    const campaign = createCampaign('one', ['Hotel'], 100);
    expect(runTypes(campaign, { Hotel: 'ok' })).toEqual(['Hotel']);
    expect(campaign.status).toBe('completed');
  });

  it('2 — executes multiple selected types in their configured order', () => {
    const types = ['Hotel', 'Restaurant', 'Dentist', 'Gym'];
    expect(runTypes(createCampaign('ordered', types, 100), {})).toEqual(types);
  });

  it('3 — automatically exposes the next task after completion', () => {
    const campaign = createCampaign('advance', ['Hotel', 'Restaurant'], 100);
    const first = nextRunnableTask(campaign)!;
    startTask(campaign, first, 'Hotel near Lahore');
    completeTask(campaign, first);
    expect(nextRunnableTask(campaign)?.businessType).toBe('Restaurant');
  });

  it('4 — treats an empty-result type as completed and continues', () => {
    const campaign = createCampaign('empty', ['Hotel', 'Dentist'], 100);
    expect(runTypes(campaign, { Hotel: 'empty', Dentist: 'ok' })).toEqual(['Hotel', 'Dentist']);
    expect(campaign.tasks[0]).toMatchObject({ status: 'completed', resultCount: 0 });
  });

  it('5 — bounds transient retries and leaves the following task runnable', () => {
    const campaign = createCampaign('retry', ['Hotel', 'Gym'], 100);
    const task = nextRunnableTask(campaign)!;
    for (let attempt = 0; attempt < MAX_BUSINESS_TYPE_ATTEMPTS; attempt += 1) {
      if (attempt === 0) startTask(campaign, task, 'Hotel near Lahore');
      else task.attempts += 1;
    }
    failTask(campaign, task, 'Maps timed out');
    expect(task.attempts).toBe(3);
    expect(nextRunnableTask(campaign)?.businessType).toBe('Gym');
  });

  it('6 — a failed type does not erase businesses saved by completed types', () => {
    const leads = new Map([[dedupeKey(makeLead(raw('Alpha Hotel', 'alpha'), 'preserve', 'Lahore', 'Hotel')), makeLead(raw('Alpha Hotel', 'alpha'), 'preserve', 'Lahore', 'Hotel')]]);
    const campaign = createCampaign('preserve', ['Hotel', 'Dentist'], 100);
    const first = nextRunnableTask(campaign)!; startTask(campaign, first, 'Hotel near Lahore'); first.newCount = 1; completeTask(campaign, first);
    const second = nextRunnableTask(campaign)!; startTask(campaign, second, 'Dentist near Lahore'); failTask(campaign, second, 'Permanent failure');
    expect(leads.size).toBe(1);
    expect(finishCampaign(campaign, leads.size)).toBe('completed-with-errors');
  });

  it('7 — pause and resume state survives serialization', () => {
    const campaign = createCampaign('pause', ['Hotel', 'Gym'], 100);
    const task = nextRunnableTask(campaign)!; startTask(campaign, task, 'Hotel near Lahore'); updateTaskStage(campaign, 'EXTRACTING'); campaign.status = 'paused';
    const restored = structuredClone(campaign); restored.status = 'running';
    expect(nextRunnableTask(restored)).toMatchObject({ businessType: 'Hotel', stage: 'EXTRACTING', status: 'running' });
  });

  it('8 — stop skips pending work and prevents another type from starting', () => {
    const campaign = createCampaign('stop', ['Hotel', 'Restaurant', 'Gym'], 100);
    campaign.stopRequested = true;
    skipPendingTasks(campaign, 'stopped-by-user');
    expect(nextRunnableTask(campaign)).toBeNull();
    expect(finishCampaign(campaign, 0, true)).toBe('cancelled');
  });

  it('9 — service-worker restart reconciles the existing running task', () => {
    const campaign = createCampaign('restart', ['Hotel', 'Gym'], 100);
    const task = nextRunnableTask(campaign)!; startTask(campaign, task, 'Hotel near Lahore'); task.resultCount = 18;
    const restored = structuredClone(campaign);
    expect(nextRunnableTask(restored)).toMatchObject({ id: task.id, attempts: 1, resultCount: 18 });
  });

  it('10 — repeated queue reads do not create duplicate tasks or campaigns', () => {
    const types = normalizeBusinessTypes({ businessType: 'Hotel', businessTypes: ['Hotel', 'Hotel', 'Gym'] });
    const campaign = createCampaign('idempotent', types, 100);
    const first = nextRunnableTask(campaign);
    expect(nextRunnableTask(campaign)?.id).toBe(first?.id);
    expect(new Set(campaign.tasks.map((task) => task.id)).size).toBe(campaign.tasks.length);
    expect(campaign.tasks.map((task) => task.businessType)).toEqual(['Hotel', 'Gym']);
  });

  it('11 — duplicate businesses across types merge to one record with both discovery categories', () => {
    const hotel = makeLead(raw('Pearl', 'stable-place'), 'dedupe', 'Lahore', 'Hotel');
    const restaurant = makeLead(raw('Pearl Dining', 'stable-place', { phone: '+92 300 9999999' }), 'dedupe', 'Lahore', 'Restaurant');
    expect(isSameLead(hotel, restaurant)).toBe(true);
    const merged = mergeLead(hotel, restaurant);
    expect(merged.discoveryCategories).toEqual(['Hotel', 'Restaurant']);
  });

  it('12 — global maximum skips all remaining types after cross-type deduplication', () => {
    const campaign = createCampaign('limit', ['Hotel', 'Restaurant', 'Gym'], 1);
    const first = nextRunnableTask(campaign)!; startTask(campaign, first, 'Hotel near Lahore'); first.newCount = 1; first.resultCount = 1; completeTask(campaign, first); syncCampaignTotals(campaign, 1);
    skipPendingTasks(campaign, 'global-limit-reached');
    expect(campaign.tasks.slice(1).every((task) => task.status === 'skipped' && task.skipReason === 'global-limit-reached')).toBe(true);
  });

  it('13 — builds an independent area-scoped query for every business type', () => {
    const types = ['Hotel', 'Restaurant', 'Dentist'];
    expect(types.map((businessType) => buildDiscoveryQueries({ ...config(types), businessType })[0])).toEqual(['Hotel near Lahore', 'Restaurant near Lahore', 'Dentist near Lahore']);
  });

  it('14 — optional enrichment failure preserves the type and campaign results', () => {
    const campaign = createCampaign('enrichment', ['Hotel'], 100);
    const task = nextRunnableTask(campaign)!; startTask(campaign, task, 'Hotel near Lahore'); task.newCount = 3;
    completeTask(campaign, task, { enrichmentTotal: 3, enrichmentCompleted: 2, enrichmentFailed: 1 });
    expect(task).toMatchObject({ status: 'completed-with-errors', newCount: 3, enrichmentFailed: 1 });
  });

  it('15 — campaign totals can update incrementally while a type is running', () => {
    const campaign = createCampaign('incremental', ['Hotel', 'Gym'], 100);
    const task = nextRunnableTask(campaign)!; startTask(campaign, task, 'Hotel near Lahore'); task.resultCount = 18; task.newCount = 16; task.duplicateCount = 2; syncCampaignTotals(campaign, 16);
    expect(campaign).toMatchObject({ uniqueCount: 16, duplicateCount: 2, currentBusinessType: 'Hotel' });
  });

  it('16 — CRM-compatible records retain one stable local identity after a category merge', () => {
    const first = makeLead(raw('Identity', 'crm-place'), 'crm', 'Lahore', 'Hotel');
    const merged = mergeLead(first, makeLead(raw('Identity', 'crm-place'), 'crm', 'Lahore', 'Restaurant'));
    expect(merged.id).toBe(first.id);
    expect(merged.placeIdentifier).toBe('crm-place');
  });

  it('17 — combined CSV/XLSX export includes discovery categories and campaign task history', () => {
    const campaign = createCampaign('export', ['Hotel', 'Restaurant'], 100);
    runTypes(campaign, {});
    const lead = makeLead(raw('Export', 'export-place'), 'export', 'Lahore', 'Hotel');
    lead.discoveryCategories = ['Hotel', 'Restaurant'];
    const search = { id: 'export', businessType: 'Hotel, Restaurant', businessTypes: ['Hotel', 'Restaurant'], location: 'Lahore', radiusKm: 10, query: 'Hotel near Lahore', startedAt: campaign.startedAt, completedAt: campaign.completedAt, status: 'completed', discoveredCount: 1, uniqueCount: 1, exportedCount: 0, campaign, config: config(['Hotel', 'Restaurant']) } satisfies SearchRecord;
    expect(toCsv([lead])).toContain('Search Categories');
    expect(toCsv([lead])).toContain('Hotel; Restaurant');
    expect(new Uint8Array(createXlsx([lead], search)).length).toBeGreaterThan(2_000);
  });

  it('18 — changing selected types before start produces a new ordered queue without duplicates', () => {
    expect(normalizeBusinessTypes({ businessType: 'Legacy', businessTypes: ['Gym', 'Dentist', 'gym', ' Hotel '] })).toEqual(['Gym', 'Dentist', 'Hotel']);
  });

  it('19 — rejects an empty selection at the configuration boundary', () => {
    expect(normalizeBusinessTypes({ businessType: '   ', businessTypes: [] })).toEqual([]);
  });

  it('20 — migrates a saved legacy single-type search without losing progress', () => {
    const legacy = { id: 'legacy', businessType: 'Hotel', location: 'Lahore', radiusKm: 10, query: 'Hotel near Lahore', startedAt: '2026-10-26T00:00:00.000Z', completedAt: null, status: 'discovering', discoveredCount: 12, uniqueCount: 10, duplicateCount: 2, exportedCount: 0, currentPhase: 'EXTRACTING', config: config(['Hotel']) } satisfies SearchRecord;
    legacy.config.businessTypes = undefined;
    const campaign = ensureCampaign(legacy);
    expect(campaign.selectedBusinessTypes).toEqual(['Hotel']);
    expect(campaign.tasks[0]).toMatchObject({ status: 'running', resultCount: 12, newCount: 10, duplicateCount: 2, stage: 'EXTRACTING' });
  });

  it('reports terminal task count for completed, failed, and limit-skipped rows', () => {
    const campaign = createCampaign('terminal', ['Hotel', 'Restaurant', 'Gym'], 1);
    campaign.tasks[0].status = 'completed'; campaign.tasks[1].status = 'failed'; campaign.tasks[2].status = 'skipped';
    expect(completedTaskCount(campaign)).toBe(3);
  });
});
