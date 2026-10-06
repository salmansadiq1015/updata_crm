import { describe, expect, it } from 'vitest';
import {
  CRM_BATCH_SIZE,
  DISCOVERY_BATCH_SIZE,
  REQUIRED_STABLE_END_ROUNDS,
  resultKeyForRecord,
  normalizeLegacyCheckpoint,
  resumeQueryIndex,
  shouldCompleteResultState,
  splitIntoBatches,
} from '../src/shared/discovery-checkpoint';
import { createXlsx, toCsv } from '../src/export/exporters';
import { makeLead } from '../src/shared/normalize';
import type { RawBusinessRecord, SearchRecord } from '../src/shared/types';

const records = (count: number): RawBusinessRecord[] => Array.from({ length: count }, (_, index) => ({
  businessName: `Business ${index + 1}`,
  googleMapsUrl: `https://www.google.com/maps/place/Business+${index + 1}/@31.${String(index).padStart(5, '0')},74.30000,17z/data=!4m2!3m1!1splace-${index + 1}`,
  placeIdentifier: `place-${index + 1}`,
  phone: `+92 300 ${String(index).padStart(7, '0')}`,
  website: `https://business-${index + 1}.example`,
  address: `${index + 1} Main Road`,
}));

const search = (): SearchRecord => ({
  id: 'search-1', businessType: 'Hotel', location: 'Paris', radiusKm: 10,
  query: 'Hotel near Paris', startedAt: '2026-10-06T00:00:00.000Z', completedAt: null,
  status: 'discovering', discoveredCount: 0, uniqueCount: 0, duplicateCount: 0,
  exportedCount: 0, currentPage: 0, currentResultIndex: 0, queryIndex: 0,
  processedResultKeys: [], processedCount: 0, lastSuccessfulResultKey: null,
  lastSuccessfulUrl: null, lastSuccessfulTimestamp: null, scrollTop: 0, scrollHeight: 0,
  config: { businessType: 'Hotel', location: 'Paris', radiusKm: 10, maxResults: 5_000, queryExpansion: false, enableEnrichment: false, maxPagesPerWebsite: 2, safetyLimit: 400 },
});

function processBatch(state: SearchRecord, batch: RawBusinessRecord[]): number {
  const processed = new Set(state.processedResultKeys ?? []);
  let added = 0;
  for (const record of batch) {
    const key = resultKeyForRecord(record);
    if (processed.has(key)) continue;
    processed.add(key); added += 1;
    state.lastSuccessfulResultKey = key;
    state.lastSuccessfulUrl = record.googleMapsUrl;
  }
  state.processedResultKeys = [...processed];
  state.processedCount = processed.size;
  state.discoveredCount = processed.size;
  state.uniqueCount += added;
  state.currentResultIndex = processed.size;
  state.currentBatchSize = batch.length;
  return added;
}

describe('continuous discovery regression coverage', () => {
  it('Test 1 — a 25-record batch is not the total discovery limit', () => {
    const state = search();
    const source = records(1_000);
    expect(processBatch(state, source.slice(0, DISCOVERY_BATCH_SIZE))).toBe(25);
    expect(state.processedCount).toBe(25);
    expect(state.status).toBe('discovering');
    expect(processBatch(state, source.slice(25, 50))).toBe(25);
    expect(state.processedCount).toBe(50);
    expect(state.uniqueCount).toBe(50);
  });

  it('Test 2 — Maps navigation restores around 100 and skips processed identities', () => {
    const source = records(1_000);
    const state = search();
    processBatch(state, source.slice(0, 100));
    state.scrollTop = 4_200;
    state.lastVisibleResultKey = resultKeyForRecord(source[99]);
    const restored = JSON.parse(JSON.stringify(state)) as SearchRecord;
    expect(restored.processedCount).toBe(100);
    expect(restored.scrollTop).toBe(4_200);
    expect(processBatch(restored, source.slice(75, 125))).toBe(25);
    expect(restored.processedCount).toBe(125);
  });

  it('Test 3 — side-panel close/reopen keeps 200 and resumes from 201', () => {
    const source = records(1_000);
    const persisted = search();
    processBatch(persisted, source.slice(0, 200));
    const reopened = structuredClone(persisted);
    expect(reopened.processedCount).toBe(200);
    expect(processBatch(reopened, source.slice(175, 225))).toBe(25);
    expect(reopened.lastSuccessfulResultKey).toBe(resultKeyForRecord(source[224]));
  });

  it('Test 4 — service-worker restart restores 300 without duplicate leads', () => {
    const source = records(1_000);
    const beforeSuspend = search();
    processBatch(beforeSuspend, source.slice(0, 300));
    const afterRestart = structuredClone(beforeSuspend);
    expect(processBatch(afterRestart, source.slice(275, 325))).toBe(25);
    expect(afterRestart.processedResultKeys).toHaveLength(325);
    expect(new Set(afterRestart.processedResultKeys).size).toBe(325);
    expect(resumeQueryIndex(afterRestart, 3)).toBe(0);
  });

  it('Test 5 — retry continues from a 400-record checkpoint', () => {
    const source = records(1_000);
    const state = search();
    processBatch(state, source.slice(0, 400));
    state.status = 'error'; state.retryCount = 1; state.error = 'Temporary Maps render failure';
    const retry = structuredClone(state);
    retry.status = 'retrying'; retry.error = null;
    expect(processBatch(retry, source.slice(400, 425))).toBe(25);
    expect(retry.processedCount).toBe(425);
    expect(retry.processedResultKeys?.[0]).toBe(resultKeyForRecord(source[0]));
  });

  it('Test 6 — 1,000 records continue through 40 batches and only complete at stable end', () => {
    const source = records(1_000);
    const state = search();
    for (const batch of splitIntoBatches(source, DISCOVERY_BATCH_SIZE)) processBatch(state, batch);
    expect(state.processedCount).toBe(1_000);
    expect(state.uniqueCount).toBe(1_000);
    expect(shouldCompleteResultState({ newlyProcessed: 0, scrollChanged: false, atEnd: true, endConfirmed: true, stableRounds: REQUIRED_STABLE_END_ROUNDS - 1 })).toBe(false);
    expect(shouldCompleteResultState({ newlyProcessed: 0, scrollChanged: false, atEnd: true, endConfirmed: true, stableRounds: REQUIRED_STABLE_END_ROUNDS })).toBe(true);
    expect(shouldCompleteResultState({ newlyProcessed: 25, scrollChanged: false, atEnd: true, endConfirmed: true, stableRounds: REQUIRED_STABLE_END_ROUNDS })).toBe(false);
  });

  it('Test 7 — CRM and exports process the full dataset, independent of visible/batch size', () => {
    const source = records(1_000);
    const ids = source.map((record) => resultKeyForRecord(record));
    const crmBatches = splitIntoBatches(ids, CRM_BATCH_SIZE);
    expect(crmBatches).toHaveLength(40);
    expect(crmBatches.flat()).toEqual(ids);
    const processedBeforeRestart = new Set(crmBatches.slice(0, 17).flat());
    const pendingAfterRestart = ids.filter((id) => !processedBeforeRestart.has(id));
    expect(pendingAfterRestart).toHaveLength(575);
    expect(splitIntoBatches(pendingAfterRestart, CRM_BATCH_SIZE).flat()).toEqual(pendingAfterRestart);

    const leads = source.map((record) => makeLead(record, 'search-1'));
    expect(toCsv(leads).trim().split('\n')).toHaveLength(1_001);
    expect(new Uint8Array(createXlsx(leads, null)).length).toBeGreaterThan(100_000);
  });

  it('does not inflate discovered counters when the same 25-card DOM window repeats', () => {
    const state = search();
    const firstWindow = records(25);
    expect(processBatch(state, firstWindow)).toBe(25);
    for (let repeat = 0; repeat < 100; repeat += 1) expect(processBatch(state, firstWindow)).toBe(0);
    expect(state.discoveredCount).toBe(25);
    expect(state.uniqueCount).toBe(25);
  });

  it('migrates an old inflated 4,906/25 checkpoint to its 25 persisted result keys', () => {
    const legacy = search();
    legacy.discoveredCount = 4_906;
    legacy.uniqueCount = 25;
    legacy.processedCount = undefined;
    legacy.processedResultKeys = records(25).map((record) => record.placeIdentifier!);
    expect(normalizeLegacyCheckpoint(legacy, '2026-10-06T12:00:00.000Z')).toBe(true);
    expect(legacy.discoveredCount).toBe(25);
    expect(legacy.processedCount).toBe(25);
    expect(legacy.currentResultIndex).toBe(25);
  });

  it('keeps a 5,000-record job incremental and bounded to 200 processing batches', () => {
    const source = records(5_000);
    const state = search();
    const batches = splitIntoBatches(source, DISCOVERY_BATCH_SIZE);
    expect(batches).toHaveLength(200);
    for (const batch of batches) processBatch(state, batch);
    expect(state.processedCount).toBe(5_000);
    expect(state.processedResultKeys).toHaveLength(5_000);
    expect(new Set(state.processedResultKeys).size).toBe(5_000);
  });
});
