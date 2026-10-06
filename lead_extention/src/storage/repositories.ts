import { clearStore, countStore, deleteRecord, getAll, getRecord, putRecord, putRecords } from './indexeddb';
import type { Lead, SearchRecord } from '../shared/types';

export const LeadRepository = {
  list: () => getAll<Lead>('leads'),
  listBySearch: async (searchId: string) => (await getAll<Lead>('leads')).filter((lead) => lead.searchId === searchId),
  get: (id: string) => getRecord<Lead>('leads', id),
  save: (lead: Lead) => putRecord('leads', lead),
  saveMany: (leads: Lead[]) => putRecords('leads', leads),
  remove: (id: string) => deleteRecord('leads', id),
  clear: () => clearStore('leads'),
  count: () => countStore('leads')
};

export const SearchRepository = {
  list: async () => (await getAll<SearchRecord>('searches')).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  get: (id: string) => getRecord<SearchRecord>('searches', id),
  save: (search: SearchRecord) => putRecord('searches', search),
  remove: (id: string) => deleteRecord('searches', id),
  clear: () => clearStore('searches'),
  count: () => countStore('searches')
};

export const SettingsRepository = {
  get: async <T>(id: string): Promise<{ id: string; value: T } | undefined> => {
    if (hasChromeStorage()) {
      return new Promise((resolve) => chrome.storage.local.get(id, (items) => resolve(items[id] === undefined ? undefined : { id, value: items[id] as T })));
    }
    return getRecord<{ id: string; value: T }>('settings', id);
  },
  save: async <T>(id: string, value: T): Promise<void> => {
    if (hasChromeStorage()) {
      await new Promise<void>((resolve, reject) => chrome.storage.local.set({ [id]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message)); else resolve();
      }));
      return;
    }
    await putRecord('settings', { id, value });
  },
  clear: async (): Promise<void> => {
    if (hasChromeStorage()) {
      await new Promise<void>((resolve, reject) => chrome.storage.local.clear(() => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message)); else resolve();
      }));
      return;
    }
    await clearStore('settings');
  }
};

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export const ExportRepository = {
  save: <T extends { id: string }>(record: T) => putRecord('exports', record),
  clear: () => clearStore('exports')
};

export async function clearAllLocalData(): Promise<void> {
  await Promise.all([
    LeadRepository.clear(),
    SearchRepository.clear(),
    clearStore('emailRecords'),
    clearStore('enrichmentRecords'),
    ExportRepository.clear(),
    SettingsRepository.clear()
  ]);
}
