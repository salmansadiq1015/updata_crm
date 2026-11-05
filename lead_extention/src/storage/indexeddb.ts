import { DB_NAME, DB_VERSION } from '../shared/constants';

export type StoreName = 'leads' | 'searches' | 'emailRecords' | 'enrichmentRecords' | 'exports' | 'settings';

let databasePromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Unable to open local database'));
    request.onupgradeneeded = () => {
      const db = request.result;
      const leads = db.objectStoreNames.contains('leads')
        ? request.transaction!.objectStore('leads')
        : db.createObjectStore('leads', { keyPath: 'id' });
      for (const index of [
        ['placeIdentifier', 'placeIdentifier'],
        ['businessName', 'businessName'],
        ['phone', 'phone'],
        ['website', 'website'],
        ['city', 'city'],
        ['category', 'category'],
        ['searchId', 'searchId'],
        ['discoveredAt', 'discoveredAt']
      ] as const) {
        if (!leads.indexNames.contains(index[0])) leads.createIndex(index[0], index[1], { unique: false });
      }
      const searches = db.objectStoreNames.contains('searches')
        ? request.transaction!.objectStore('searches')
        : db.createObjectStore('searches', { keyPath: 'id' });
      if (!searches.indexNames.contains('startedAt')) searches.createIndex('startedAt', 'startedAt', { unique: false });
      for (const name of ['emailRecords', 'enrichmentRecords', 'exports', 'settings'] as StoreName[]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return databasePromise;
}

export async function putRecord<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  const db = await openDatabase();
  await transaction(db, store, 'readwrite', (objectStore) => objectStore.put(value));
}

export async function putRecords<T extends { id: string }>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDatabase();
  await transaction(db, store, 'readwrite', (objectStore) => {
    for (const value of values) objectStore.put(value);
  });
}

export async function getRecord<T>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await openDatabase();
  return transaction<T | undefined>(db, store, 'readonly', (objectStore) => objectStore.get(id));
}

/** Fetch an ordered selection in one readonly transaction. */
export async function getRecords<T>(store: StoreName, ids: string[]): Promise<Array<T | undefined>> {
  if (!ids.length) return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const objectStore = tx.objectStore(store);
    const values: Array<T | undefined> = new Array(ids.length);
    ids.forEach((id, index) => {
      const request = objectStore.get(id);
      request.onsuccess = () => { values[index] = request.result as T | undefined; };
    });
    tx.oncomplete = () => resolve(values);
    tx.onerror = () => reject(tx.error ?? new Error('Unable to read selected records'));
    tx.onabort = () => reject(tx.error ?? new Error('Reading selected records was aborted'));
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDatabase();
  return transaction<T[]>(db, store, 'readonly', (objectStore) => objectStore.getAll());
}

export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  const db = await openDatabase();
  await transaction(db, store, 'readwrite', (objectStore) => objectStore.delete(id));
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openDatabase();
  await transaction(db, store, 'readwrite', (objectStore) => objectStore.clear());
}

export async function countStore(store: StoreName): Promise<number> {
  const db = await openDatabase();
  return transaction<number>(db, store, 'readonly', (objectStore) => objectStore.count());
}

function transaction<T = void>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  action: (objectStore: IDBObjectStore) => IDBRequest | void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.onerror = () => reject(tx.error ?? new Error('Local database transaction failed'));
    tx.oncomplete = () => resolve((request as IDBRequest | undefined)?.result as T);
  });
}
